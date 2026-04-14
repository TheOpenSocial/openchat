import { InjectQueue } from "@nestjs/bullmq";
import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import { OpenAIClient } from "@opensocial/openai";
import { NotificationType, RequestStatus } from "@opensocial/types";
import { Prisma } from "@prisma/client";
import { Queue } from "bullmq";
import { randomUUID } from "node:crypto";
import { AnalyticsService } from "../analytics/analytics.service.js";
import { AgentService } from "../agent/agent.service.js";
import { recordOpenAIMetric } from "../common/ops-metrics.js";
import { AgentWorkflowRuntimeService } from "../database/agent-workflow-runtime.service.js";
import { PrismaService } from "../database/prisma.service.js";
import { MatchingService } from "../matching/matching.service.js";
import { NotificationsService } from "../notifications/notifications.service.js";
import { PersonalizationService } from "../personalization/personalization.service.js";
import { LaunchControlsService } from "../launch-controls/launch-controls.service.js";
import { RealtimeEventsService } from "../realtime/realtime-events.service.js";

const BASE_ONE_TO_ONE_FANOUT_CAP = 3;
const BASE_GROUP_FANOUT_CAP = 5;
const MAX_PENDING_OUTGOING_REQUESTS_PER_SENDER = 12;
const MAX_DAILY_OUTGOING_REQUESTS_PER_SENDER = 30;
const ROUTING_ESCALATION_TIMEOUT_LEVELS_MINUTES = [8, 16];
const ROUTING_ESCALATION_RETRY_DELAY_MS = 30_000;
const INTENT_PARSE_TIMEOUT_MS = 1_200;
const INTENT_MODERATION_BLOCKLIST = [
  "kill yourself",
  "how to kill",
  "sexual assault",
  "terror attack",
  "bomb threat",
];
const INTENT_MODERATION_REVIEWLIST = [
  "underage",
  "minor meetup",
  "buy drugs",
  "illegal deal",
  "weapon meetup",
];

interface ParsedIntentPayload {
  topics?: string[];
  activities?: string[];
  intentType?: string;
  modality?: string;
  urgency?: string;
  timingConstraints?: string[];
  skillConstraints?: string[];
  vibeConstraints?: string[];
  groupSizeTarget?: number;
  routingEscalationLevel?: number;
  routingEscalatedAt?: string;
}

interface TimeoutEscalationResult {
  shouldEscalate: boolean;
  ageMinutes: number;
  currentLevel: number;
  targetLevel: number;
  widenedParsedIntent: ParsedIntentPayload;
}

interface TextModerationResult {
  decision: "clean" | "review" | "blocked";
  matchedTerms: string[];
}

interface AgentIntentDecompositionOptions {
  allowDecomposition?: boolean;
  maxIntents?: number;
}

@Injectable()
export class IntentsService {
  private readonly logger = new Logger(IntentsService.name);
  private readonly openai = new OpenAIClient({
    apiKey: process.env.OPENAI_API_KEY ?? "",
  });

  constructor(
    private readonly prisma: PrismaService,
    private readonly matchingService: MatchingService,
    private readonly notificationsService: NotificationsService,
    private readonly personalizationService: PersonalizationService,
    private readonly agentService: AgentService,
    @InjectQueue("intent-processing")
    private readonly intentProcessingQueue: Queue,
    @InjectQueue("notification")
    private readonly notificationQueue: Queue,
    @Optional()
    private readonly analyticsService?: AnalyticsService,
    @Optional()
    private readonly launchControlsService?: LaunchControlsService,
    @Optional()
    private readonly realtimeEventsService?: RealtimeEventsService,
    @Optional()
    private readonly workflowRuntimeService?: AgentWorkflowRuntimeService,
  ) {}

  async createIntent(
    userId: string,
    rawText: string,
    traceId: string,
    agentThreadId?: string,
    options: {
      deterministicParse?: boolean;
    } = {},
  ) {
    const parsed = options.deterministicParse
      ? this.buildDeterministicParsedIntent(rawText)
      : await (async () => {
          const parseStartedAt = Date.now();
          const parsedResult = await this.parseIntentWithBudget(
            rawText,
            traceId,
          );
          if (process.env.OPENAI_API_KEY) {
            recordOpenAIMetric({
              operation: "intent_parsing",
              latencyMs: Date.now() - parseStartedAt,
              ok: true,
            });
          }
          return parsedResult;
        })();

    return this.persistIntentWithParsedPayload({
      userId,
      rawText,
      traceId,
      parsed,
      agentThreadId,
    });
  }

  async createIntentWithOverrides(input: {
    userId: string;
    rawText: string;
    traceId: string;
    agentThreadId?: string;
    parsedIntentOverrides: Record<string, unknown>;
  }) {
    const parseStartedAt = Date.now();
    const parsed = await this.parseIntentWithBudget(
      input.rawText,
      input.traceId,
    );
    if (process.env.OPENAI_API_KEY) {
      recordOpenAIMetric({
        operation: "intent_parsing",
        latencyMs: Date.now() - parseStartedAt,
        ok: true,
      });
    }

    return this.persistIntentWithParsedPayload({
      userId: input.userId,
      rawText: input.rawText,
      traceId: input.traceId,
      parsed: {
        ...parsed,
        ...input.parsedIntentOverrides,
      },
      agentThreadId: input.agentThreadId,
    });
  }

  private async parseIntentWithBudget(
    rawText: string,
    traceId: string,
  ): Promise<ParsedIntentPayload & { confidence?: number }> {
    const timeoutMs = Number.parseInt(
      process.env.INTENT_PARSE_TIMEOUT_MS ?? `${INTENT_PARSE_TIMEOUT_MS}`,
      10,
    );
    const normalizedTimeoutMs =
      Number.isFinite(timeoutMs) && timeoutMs > 0
        ? timeoutMs
        : INTENT_PARSE_TIMEOUT_MS;

    try {
      return await Promise.race([
        this.openai.parseIntent(rawText, traceId),
        new Promise<ParsedIntentPayload & { confidence?: number }>(
          (resolve) => {
            setTimeout(
              () => resolve(this.buildDeterministicParsedIntent(rawText)),
              normalizedTimeoutMs,
            );
          },
        ),
      ]);
    } catch (error) {
      this.logger.warn(
        JSON.stringify({
          event: "intent.parse.fallback",
          traceId,
          reason: "llm_unavailable",
          error: error instanceof Error ? error.message : String(error),
        }),
      );
      return this.buildDeterministicParsedIntent(rawText);
    }
  }

  private buildDeterministicParsedIntent(
    rawText: string,
  ): ParsedIntentPayload & { confidence?: number } {
    const cleaned = rawText.trim().toLowerCase();
    const topics = cleaned
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .filter((word) => word.length >= 4)
      .slice(0, 6);

    return {
      topics,
      activities: topics.slice(0, 3),
      intentType: "social",
      modality: "mixed",
      urgency: "soon",
      timingConstraints: [],
      skillConstraints: [],
      vibeConstraints: [],
      confidence: 0.25,
    };
  }

  async sendIntentRequest(input: {
    intentId: string;
    recipientUserId: string;
    traceId: string;
    agentThreadId?: string;
    notificationMetadata?: Record<string, unknown>;
  }) {
    const intent = await this.prisma.intent.findUnique({
      where: { id: input.intentId },
    });
    if (!intent) {
      throw new NotFoundException("intent not found");
    }

    if (intent.userId === input.recipientUserId) {
      throw new ForbiddenException("cannot send a request to yourself");
    }

    const existing = await this.prisma.intentRequest.findFirst({
      where: {
        intentId: input.intentId,
        recipientUserId: input.recipientUserId,
        status: {
          in: ["pending", "accepted"],
        },
      },
      orderBy: { sentAt: "desc" },
    });
    if (existing) {
      return {
        requestId: existing.id,
        status: existing.status,
        existing: true as const,
      };
    }

    const quota = await this.loadFanoutQuotaSnapshot(intent.userId);
    const remainingPendingQuota = Math.max(
      0,
      MAX_PENDING_OUTGOING_REQUESTS_PER_SENDER - quota.pendingOutgoingCount,
    );
    const remainingDailyQuota = Math.max(
      0,
      MAX_DAILY_OUTGOING_REQUESTS_PER_SENDER - quota.dailyOutgoingCount,
    );
    if (remainingPendingQuota <= 0 || remainingDailyQuota <= 0) {
      return {
        requestId: null,
        status: "quota_reached" as const,
        existing: false as const,
      };
    }

    const request = await this.prisma.intentRequest.create({
      data: {
        intentId: intent.id,
        senderUserId: intent.userId,
        recipientUserId: input.recipientUserId,
        status: "pending",
        wave: 1,
        relevanceFeatures: {
          source: "agent_manual_intro",
          traceId: input.traceId,
        } as Prisma.InputJsonValue,
        expiresAt: new Date(Date.now() + 20 * 60_000),
      },
    });

    await this.prisma.intent.update({
      where: { id: intent.id },
      data: {
        status: "fanout",
      },
    });
    this.emitIntentUpdatedSafe(intent.userId, intent.id, "fanout");
    this.emitRequestCreatedSafe(
      input.recipientUserId,
      request.id,
      input.intentId,
    );
    await this.trackAnalyticsEventSafe({
      eventType: "request_sent",
      actorUserId: intent.userId,
      entityType: "intent_request",
      entityId: request.id,
      properties: {
        source: "agent_manual_intro",
        intentId: intent.id,
        recipientUserId: input.recipientUserId,
      },
    });
    await this.notificationsService.createInAppNotification(
      input.recipientUserId,
      NotificationType.REQUEST_RECEIVED,
      "Someone wants to connect with you right now.",
      input.notificationMetadata,
    );

    const workflowThreadId =
      input.agentThreadId ??
      (await this.resolveLatestThreadIdForUser(intent.userId));
    if (workflowThreadId) {
      await this.agentService.appendWorkflowUpdate(
        workflowThreadId,
        "I sent a direct intro request to a selected match.",
        {
          intentId: intent.id,
          requestId: request.id,
          recipientUserId: input.recipientUserId,
          source: "agent_manual_intro",
        },
      );
    }

    return {
      requestId: request.id,
      status: request.status,
      existing: false as const,
    };
  }

  async createIntentFromAgentMessage(
    threadId: string,
    userId: string,
    content: string,
    options: AgentIntentDecompositionOptions = {},
  ) {
    const traceId = randomUUID();
    const message = await this.agentService.createUserMessage(
      threadId,
      content,
      userId,
    );
    const allowDecomposition = options.allowDecomposition ?? true;
    const requestedMaxIntents = this.clampIntentCount(options.maxIntents ?? 3);
    const quotaBoundMaxIntents = allowDecomposition
      ? await this.resolveSafeIntentDecompositionCap(
          userId,
          requestedMaxIntents,
        )
      : 1;
    const intentTexts = allowDecomposition
      ? this.decomposeAgentMessageToIntents(content, requestedMaxIntents)
      : [content.trim()];
    const boundedIntentTexts = intentTexts.slice(0, quotaBoundMaxIntents);

    const intents = [];
    for (const [index, intentText] of boundedIntentTexts.entries()) {
      const scopedTraceId =
        boundedIntentTexts.length > 1 ? `${traceId}:${index + 1}` : traceId;
      const intent = await this.createIntent(
        userId,
        intentText,
        scopedTraceId,
        threadId,
        {
          deterministicParse: true,
        },
      );
      intents.push(intent);
    }
    const primaryIntent = intents[0];
    if (!primaryIntent) {
      throw new ForbiddenException(
        "could not create intent from empty content",
      );
    }

    await this.agentService.createAgentMessage(
      threadId,
      intentTexts.length > boundedIntentTexts.length
        ? `All right. I split this into ${intents.length} focused asks and started working on them in the background. I’ll update you here as soon as I have the strongest options.`
        : intents.length === 1
          ? "All right. I’m on it in the background and I’ll update you here as soon as I have a strong option."
          : `All right. I split this into ${intents.length} focused asks and started working on them in the background. I’ll update you here as soon as I have the strongest options.`,
    );

    return {
      threadId,
      messageId: message.id,
      intentId: primaryIntent.id,
      status: primaryIntent.status,
      intentCount: intents.length,
      intentIds: intents.map((intent) => intent.id),
      traceId,
    };
  }

  private async persistIntentWithParsedPayload(input: {
    userId: string;
    rawText: string;
    traceId: string;
    parsed: ParsedIntentPayload & { confidence?: number };
    agentThreadId?: string;
  }) {
    const intent = await this.prisma.intent.create({
      data: {
        userId: input.userId,
        rawText: input.rawText,
        status: "parsed",
        parsedIntent: input.parsed as Prisma.InputJsonValue,
        confidence: input.parsed.confidence ?? 0.4,
      },
    });
    const workflowRunId = this.buildIntentWorkflowRunId(intent.id);
    await this.workflowRuntimeService?.startRun({
      workflowRunId,
      traceId: input.traceId,
      domain: "social",
      entityType: "intent",
      entityId: intent.id,
      userId: input.userId,
      threadId: input.agentThreadId ?? null,
      summary: "Intent accepted into the agentic workflow runtime.",
      metadata: {
        rawTextPreview: input.rawText.trim().slice(0, 160),
        intentType: input.parsed.intentType ?? null,
      },
    });
    await this.workflowRuntimeService?.checkpoint({
      workflowRunId,
      traceId: input.traceId,
      stage: "parse",
      status: "completed",
      entityType: "intent",
      entityId: intent.id,
      userId: input.userId,
      summary: "Intent parsing completed and persisted.",
      metadata: {
        intentType: input.parsed.intentType ?? null,
        confidence: input.parsed.confidence ?? null,
      },
    });
    this.emitIntentUpdatedSafe(intent.userId, intent.id, intent.status);
    await this.trackAnalyticsEventSafe({
      eventType: "intent_created",
      actorUserId: input.userId,
      entityType: "intent",
      entityId: intent.id,
      properties: {
        source: input.agentThreadId ? "agent_thread" : "direct",
        status: intent.status,
      },
    });

    const moderationResult = await this.applyIntentModeration({
      intent,
      intentId: intent.id,
      userId: input.userId,
      rawText: input.rawText,
      traceId: input.traceId,
      agentThreadId: input.agentThreadId,
    });
    if (moderationResult.decision !== "clean") {
      await this.workflowRuntimeService?.checkpoint({
        workflowRunId,
        traceId: input.traceId,
        stage: "moderation",
        status:
          moderationResult.decision === "blocked" ? "blocked" : "degraded",
        entityType: "intent",
        entityId: intent.id,
        userId: input.userId,
        summary: `Intent halted by moderation (${moderationResult.decision}).`,
        metadata: {
          moderationDecision: moderationResult.decision,
        },
      });
      return moderationResult.intent;
    }
    await this.workflowRuntimeService?.checkpoint({
      workflowRunId,
      traceId: input.traceId,
      stage: "moderation",
      status: "completed",
      entityType: "intent",
      entityId: intent.id,
      userId: input.userId,
      summary: "Intent cleared moderation and queued for routing.",
    });

    await this.captureIntentSignals(input.userId, input.parsed);
    await this.captureIntentEmbedding(intent.id);

    const idempotencyKey = this.buildIntentProcessingIdempotencyKey(
      intent.id,
      "initial",
    );
    await this.intentProcessingQueue.add(
      "IntentCreated",
      {
        version: 1,
        traceId: input.traceId,
        idempotencyKey,
        timestamp: new Date().toISOString(),
        type: "IntentCreated",
        payload: {
          intentId: intent.id,
          agentThreadId: input.agentThreadId ?? undefined,
        },
      },
      {
        jobId: idempotencyKey,
        removeOnComplete: 500,
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 1000,
        },
      },
    );
    await this.workflowRuntimeService?.checkpoint({
      workflowRunId,
      traceId: input.traceId,
      stage: "enqueue_routing",
      status: "completed",
      entityType: "intent",
      entityId: intent.id,
      userId: input.userId,
      summary: "Intent-processing job enqueued.",
      metadata: {
        idempotencyKey,
      },
    });

    return intent;
  }

  async processIntentPipeline(
    intentId: string,
    traceId: string,
    agentThreadId?: string | null,
  ) {
    const workflowRunId = this.buildIntentWorkflowRunId(intentId);
    const intent = await this.prisma.intent.findUnique({
      where: { id: intentId },
    });
    if (
      !intent ||
      intent.status === "cancelled" ||
      intent.status === "expired"
    ) {
      this.logger.warn(
        JSON.stringify({
          event: "intent.pipeline.skipped",
          intentId,
          traceId,
          reason: "intent_not_processable",
          status: intent?.status ?? null,
        }),
      );
      await this.workflowRuntimeService?.checkpoint({
        workflowRunId,
        traceId,
        stage: "routing_pipeline",
        status: "skipped",
        entityType: "intent",
        entityId: intentId,
        userId: intent?.userId ?? null,
        summary: "Routing pipeline skipped because intent is not processable.",
        metadata: {
          reason: "intent_not_processable",
          status: intent?.status ?? null,
        },
      });
      return { intentId, fanoutCount: 0, skipped: true };
    }
    if (intent.safetyState === "blocked" || intent.safetyState === "review") {
      this.logger.warn(
        JSON.stringify({
          event: "intent.pipeline.skipped",
          intentId,
          traceId,
          reason: `moderation_${intent.safetyState}`,
          status: intent.status,
        }),
      );
      await this.workflowRuntimeService?.checkpoint({
        workflowRunId,
        traceId,
        stage: "moderation",
        status: intent.safetyState === "blocked" ? "blocked" : "degraded",
        entityType: "intent",
        entityId: intentId,
        userId: intent.userId,
        summary: `Routing halted by moderation state ${intent.safetyState}.`,
        metadata: {
          moderationState: intent.safetyState,
          status: intent.status,
        },
      });
      await this.workflowRuntimeService?.checkpoint({
        workflowRunId,
        traceId,
        stage: "routing_pipeline",
        status: "skipped",
        entityType: "intent",
        entityId: intentId,
        userId: intent.userId,
        summary: `Routing pipeline skipped because moderation state is ${intent.safetyState}.`,
        metadata: {
          reason: `moderation_${intent.safetyState}`,
          status: intent.status,
        },
      });
      return {
        intentId,
        fanoutCount: 0,
        skipped: true,
        reason: `moderation_${intent.safetyState}`,
      };
    }

    const workflowThreadId =
      agentThreadId ?? (await this.resolveLatestThreadIdForUser(intent.userId));
    const parsedIntent = (intent.parsedIntent as ParsedIntentPayload) ?? {};
    const routingEscalationLevel =
      this.readRoutingEscalationLevel(parsedIntent);
    this.logger.log(
      JSON.stringify({
        event: "intent.pipeline.started",
        intentId,
        traceId,
        userId: intent.userId,
        status: intent.status,
        routingEscalationLevel,
        agentThreadId: workflowThreadId ?? null,
      }),
    );
    await this.workflowRuntimeService?.checkpoint({
      workflowRunId,
      traceId,
      stage: "ranking",
      status: "started",
      entityType: "intent",
      entityId: intentId,
      userId: intent.userId,
      summary: "Candidate retrieval and ranking started.",
      metadata: {
        routingEscalationLevel,
        threadId: workflowThreadId ?? null,
      },
    });
    const candidates = await this.matchingService.retrieveCandidates(
      intent.userId,
      parsedIntent,
      5,
      {
        intentId,
        traceId,
      },
    );
    await this.workflowRuntimeService?.checkpoint({
      workflowRunId,
      traceId,
      stage: "ranking",
      status: "completed",
      entityType: "intent",
      entityId: intentId,
      userId: intent.userId,
      summary: `Candidate retrieval completed with ${candidates.length} candidate(s).`,
      metadata: {
        candidateCount: candidates.length,
      },
    });

    await this.prisma.$transaction([
      ...candidates.map((candidate) =>
        this.prisma.intentCandidate.create({
          data: {
            intentId,
            candidateUserId: candidate.userId,
            score: candidate.score,
            rationale: this.toCandidateRationale(
              candidate.rationale,
              candidate.score,
              routingEscalationLevel,
            ),
          },
        }),
      ),
    ]);

    const quotaSnapshot = await this.loadFanoutQuotaSnapshot(intent.userId);
    const fanoutCap = this.computeFanoutCap({
      intentType: parsedIntent.intentType,
      groupSizeTarget: parsedIntent.groupSizeTarget,
      candidateCount: candidates.length,
      pendingOutgoingCount: quotaSnapshot.pendingOutgoingCount,
      dailyOutgoingCount: quotaSnapshot.dailyOutgoingCount,
    });
    const fanout = candidates.slice(0, fanoutCap);
    const routingOutcome =
      fanout.length > 0
        ? "fanout_sent"
        : candidates.length > 0
          ? "cap_reached"
          : "no_candidates";
    await this.recordRoutingAttempt({
      intentId,
      userId: intent.userId,
      traceId,
      candidateCount: candidates.length,
      fanoutCap,
      fanoutCount: fanout.length,
      pendingOutgoingCount: quotaSnapshot.pendingOutgoingCount,
      dailyOutgoingCount: quotaSnapshot.dailyOutgoingCount,
      outcome: routingOutcome,
      candidateUserIds: candidates.map((candidate) => candidate.userId),
      fanoutUserIds: fanout.map((candidate) => candidate.userId),
      routingEscalationLevel,
    });

    if (fanout.length > 0) {
      const existingRequests = this.prisma.intentRequest.findMany
        ? await this.prisma.intentRequest.findMany({
            where: {
              intentId,
              recipientUserId: {
                in: fanout.map((candidate) => candidate.userId),
              },
            },
            select: {
              id: true,
              recipientUserId: true,
              status: true,
            },
          })
        : [];
      const existingRequestByRecipientId = new Map(
        existingRequests.map((request) => [request.recipientUserId, request]),
      );
      const newRequestRows: Prisma.IntentRequestCreateManyInput[] = fanout
        .filter(
          (candidate) => !existingRequestByRecipientId.has(candidate.userId),
        )
        .map((candidate) => ({
          id: randomUUID(),
          intentId,
          senderUserId: intent.userId,
          recipientUserId: candidate.userId,
          wave: 1,
          relevanceFeatures: candidate.rationale as Prisma.InputJsonValue,
          expiresAt: new Date(Date.now() + 20 * 60_000),
          status: "pending",
        }));
      if (newRequestRows.length > 0) {
        await this.prisma.intentRequest.createMany({
          data: newRequestRows,
          skipDuplicates: true,
        });
      }
      for (const row of newRequestRows) {
        if (!row.id) {
          continue;
        }
        await this.workflowRuntimeService?.linkSideEffect({
          workflowRunId,
          traceId,
          relation: "intent_request_created",
          entityType: "intent_request",
          entityId: row.id,
          userId: intent.userId,
          summary: "Created fanout request for a ranked candidate.",
          metadata: {
            recipientUserId: row.recipientUserId,
            intentId,
          },
        });
      }
      for (const request of existingRequests) {
        await this.workflowRuntimeService?.linkSideEffect({
          workflowRunId,
          traceId,
          relation: "intent_request_reused",
          entityType: "intent_request",
          entityId: request.id,
          userId: intent.userId,
          summary: "Reused an existing fanout request during replay or retry.",
          metadata: {
            recipientUserId: request.recipientUserId,
            intentId,
            status: request.status,
          },
        });
      }

      await this.prisma.intent.update({
        where: { id: intentId },
        data: { status: "fanout" },
      });
      this.emitIntentUpdatedSafe(intent.userId, intentId, "fanout");
      for (const row of newRequestRows) {
        if (row.id) {
          this.emitRequestCreatedSafe(row.recipientUserId, row.id, intentId);
        }
      }
      if (newRequestRows.length > 0) {
        await this.trackAnalyticsEventSafe({
          eventType: "request_sent",
          actorUserId: intent.userId,
          entityType: "intent",
          entityId: intentId,
          properties: {
            requestCount: newRequestRows.length,
            fanoutCap,
            candidateCount: candidates.length,
            recipientUserIds: newRequestRows.map(
              (candidate) => candidate.recipientUserId,
            ),
            routingEscalationLevel,
            reusedRequestCount: existingRequests.length,
          },
        });
      }

      await Promise.all(
        newRequestRows.map((candidate) =>
          this.notificationsService.createInAppNotification(
            candidate.recipientUserId,
            NotificationType.REQUEST_RECEIVED,
            "Someone wants to connect with you right now.",
          ),
        ),
      );
      await this.workflowRuntimeService?.checkpoint({
        workflowRunId,
        traceId,
        stage: "fanout",
        status: "completed",
        entityType: "intent",
        entityId: intentId,
        userId: intent.userId,
        summary:
          newRequestRows.length > 0
            ? `Sent ${newRequestRows.length} new request(s) across the first wave.`
            : `Reused ${existingRequests.length} existing request(s) across the first wave.`,
        metadata: {
          fanoutCount: newRequestRows.length,
          fanoutCap,
          candidateCount: candidates.length,
          reusedRequestCount: existingRequests.length,
        },
      });

      if (workflowThreadId && newRequestRows.length > 0) {
        await this.agentService.appendWorkflowUpdate(
          workflowThreadId,
          `I found ${newRequestRows.length} candidates and sent requests${fanoutCap < candidates.length ? ` (fanout cap applied: ${fanoutCap})` : ""}. I will update you when someone accepts.`,
          {
            intentId,
            workflowRunId,
            traceId,
            fanoutCount: newRequestRows.length,
            fanoutCap,
            candidateCount: candidates.length,
            reusedRequestCount: existingRequests.length,
          },
        );
      }

      await this.enqueueAsyncAgentFollowup({
        userId: intent.userId,
        intentId,
        traceId,
        agentThreadId: workflowThreadId ?? undefined,
        template: "pending_reminder",
        notificationType: NotificationType.REMINDER,
        delayMs: 90_000,
      });
      await this.enqueueDelayedRoutingRetry({
        intentId,
        traceId,
        agentThreadId: workflowThreadId ?? undefined,
        reason: "fanout_followup",
        delayMs: 180_000,
      });
    } else if (candidates.length > 0) {
      await this.prisma.intent.update({
        where: { id: intentId },
        data: { status: "matching" },
      });
      this.emitIntentUpdatedSafe(intent.userId, intentId, "matching");

      if (workflowThreadId) {
        await this.agentService.appendWorkflowUpdate(
          workflowThreadId,
          "I found candidates, but your current outreach cap is reached. I will retry as pending requests clear.",
          {
            intentId,
            fanoutCount: 0,
            fanoutCap,
            pendingOutgoingCount: quotaSnapshot.pendingOutgoingCount,
            dailyOutgoingCount: quotaSnapshot.dailyOutgoingCount,
          },
        );
      }

      await this.notificationsService.createInAppNotification(
        intent.userId,
        NotificationType.AGENT_UPDATE,
        "I found potential matches, but outreach is temporarily capped. I will retry shortly.",
      );
      await this.workflowRuntimeService?.checkpoint({
        workflowRunId,
        traceId,
        stage: "fanout",
        status: "degraded",
        entityType: "intent",
        entityId: intentId,
        userId: intent.userId,
        summary:
          "Candidates found but outreach cap prevented immediate fanout.",
        metadata: {
          candidateCount: candidates.length,
          fanoutCap,
          pendingOutgoingCount: quotaSnapshot.pendingOutgoingCount,
          dailyOutgoingCount: quotaSnapshot.dailyOutgoingCount,
        },
      });

      await this.enqueueAsyncAgentFollowup({
        userId: intent.userId,
        intentId,
        traceId,
        agentThreadId: workflowThreadId ?? undefined,
        template: "progress_update",
        notificationType: NotificationType.AGENT_UPDATE,
        delayMs: 120_000,
        message:
          "I already found viable candidates and will send the next requests as soon as your pending queue has room.",
      });
      await this.enqueueDelayedRoutingRetry({
        intentId,
        traceId,
        agentThreadId: workflowThreadId ?? undefined,
        reason: "cap_reached",
        delayMs: 120_000,
      });
    } else {
      const timeoutEscalation = this.resolveTimeoutEscalation({
        parsedIntent,
        intentCreatedAt: intent.createdAt,
      });

      if (timeoutEscalation.shouldEscalate) {
        await this.prisma.intent.update({
          where: { id: intentId },
          data: {
            status: "matching",
            parsedIntent:
              timeoutEscalation.widenedParsedIntent as Prisma.InputJsonValue,
          },
        });
        this.emitIntentUpdatedSafe(intent.userId, intentId, "matching");

        await this.recordRoutingEscalation({
          intentId,
          userId: intent.userId,
          traceId,
          fromLevel: timeoutEscalation.currentLevel,
          toLevel: timeoutEscalation.targetLevel,
          ageMinutes: timeoutEscalation.ageMinutes,
        });

        if (workflowThreadId) {
          await this.agentService.appendWorkflowUpdate(
            workflowThreadId,
            `Nothing strong enough yet, so I widened the search and started another pass (level ${timeoutEscalation.targetLevel}).`,
            {
              intentId,
              fanoutCount: 0,
              routingEscalationLevel: timeoutEscalation.targetLevel,
              ageMinutes: timeoutEscalation.ageMinutes,
            },
          );
        }

        await this.notificationsService.createInAppNotification(
          intent.userId,
          NotificationType.AGENT_UPDATE,
          "I widened the search and started another pass.",
        );
        await this.workflowRuntimeService?.checkpoint({
          workflowRunId,
          traceId,
          stage: "matching_retry",
          status: "degraded",
          entityType: "intent",
          entityId: intentId,
          userId: intent.userId,
          summary:
            "No strong matches yet; filters widened and retry scheduled.",
          metadata: {
            routingEscalationLevel: timeoutEscalation.targetLevel,
            ageMinutes: timeoutEscalation.ageMinutes,
          },
        });

        await this.enqueueAsyncAgentFollowup({
          userId: intent.userId,
          intentId,
          traceId,
          agentThreadId: workflowThreadId ?? undefined,
          template: "progress_update",
          notificationType: NotificationType.AGENT_UPDATE,
          delayMs: 45_000,
          message: "I widened the search and started another pass.",
        });
        await this.enqueueDelayedRoutingRetry({
          intentId,
          traceId,
          agentThreadId: workflowThreadId ?? undefined,
          reason: "timeout_escalated",
          delayMs: ROUTING_ESCALATION_RETRY_DELAY_MS,
        });
      } else {
        await this.prisma.intent.update({
          where: { id: intentId },
          data: { status: "matching" },
        });
        this.emitIntentUpdatedSafe(intent.userId, intentId, "matching");

        if (workflowThreadId) {
          await this.agentService.appendWorkflowUpdate(
            workflowThreadId,
            this.buildNoMatchRecoveryMessage(intent.parsedIntent, {
              includeBackground: false,
            }),
            {
              intentId,
              fanoutCount: 0,
            },
          );
        }

        const noMatchRecoveryMessage = this.buildNoMatchRecoveryMessage(
          intent.parsedIntent,
          {
            includeBackground: true,
          },
        );

        await this.notificationsService.createInAppNotification(
          intent.userId,
          NotificationType.AGENT_UPDATE,
          noMatchRecoveryMessage,
        );
        await this.workflowRuntimeService?.checkpoint({
          workflowRunId,
          traceId,
          stage: "matching_retry",
          status: "degraded",
          entityType: "intent",
          entityId: intentId,
          userId: intent.userId,
          summary:
            "No strong matches found; background follow-up and retry scheduled.",
        });

        await this.enqueueAsyncAgentFollowup({
          userId: intent.userId,
          intentId,
          traceId,
          agentThreadId: workflowThreadId ?? undefined,
          template: "no_match_yet",
          notificationType: NotificationType.AGENT_UPDATE,
          delayMs: 60_000,
          message: noMatchRecoveryMessage,
        });
        await this.enqueueDelayedRoutingRetry({
          intentId,
          traceId,
          agentThreadId: workflowThreadId ?? undefined,
          reason: "no_candidates",
          delayMs: 300_000,
        });
      }
    }

    this.logger.log(
      JSON.stringify({
        event: "intent.pipeline.completed",
        intentId,
        traceId,
        userId: intent.userId,
        candidateCount: candidates.length,
        fanoutCount: fanout.length,
        fanoutCap,
        outcome: routingOutcome,
        agentThreadId: workflowThreadId ?? null,
      }),
    );
    await this.workflowRuntimeService?.checkpoint({
      workflowRunId,
      traceId,
      stage: "routing_pipeline",
      status: "completed",
      entityType: "intent",
      entityId: intentId,
      userId: intent.userId,
      summary: `Routing pipeline finished with outcome ${routingOutcome}.`,
      metadata: {
        candidateCount: candidates.length,
        fanoutCount: fanout.length,
        fanoutCap,
        outcome: routingOutcome,
      },
    });
    return {
      intentId,
      fanoutCount: fanout.length,
      traceId,
    };
  }

  async updateIntent(intentId: string, rawText: string) {
    return this.prisma.intent.update({
      where: { id: intentId },
      data: { rawText, status: "draft" },
    });
  }

  async assertIntentOwnership(intentId: string, userId: string) {
    const intent = await this.prisma.intent.findUnique({
      where: { id: intentId },
      select: {
        id: true,
        userId: true,
      },
    });
    if (!intent) {
      throw new NotFoundException("intent not found");
    }
    if (intent.userId !== userId) {
      throw new ForbiddenException("intent not owned by user");
    }
    return intent;
  }

  async cancelIntent(
    intentId: string,
    options: { userId?: string; agentThreadId?: string } = {},
  ) {
    const intent = await this.prisma.intent.findUnique({
      where: { id: intentId },
    });
    if (!intent) {
      throw new NotFoundException("intent not found");
    }
    if (options.userId && intent.userId !== options.userId) {
      throw new ForbiddenException("intent not owned by user");
    }
    if (["cancelled", "expired"].includes(intent.status)) {
      return { intent, cancelledRequestCount: 0, unchanged: true as const };
    }

    const pendingRequests = await this.prisma.intentRequest.findMany({
      where: {
        intentId,
        status: "pending",
      },
      select: {
        id: true,
        recipientUserId: true,
      },
    });

    const now = new Date();
    const updatedIntent = await this.prisma.intent.update({
      where: { id: intentId },
      data: { status: "cancelled" },
    });
    this.emitIntentUpdatedSafe(updatedIntent.userId, intentId, "cancelled");

    if (pendingRequests.length > 0) {
      await this.prisma.intentRequest.updateMany({
        where: { id: { in: pendingRequests.map((request) => request.id) } },
        data: {
          status: "cancelled",
          respondedAt: now,
        },
      });

      const recipientIds = Array.from(
        new Set(pendingRequests.map((request) => request.recipientUserId)),
      );

      await Promise.all(
        recipientIds.map((recipientUserId) =>
          this.notificationsService.createInAppNotification(
            recipientUserId,
            NotificationType.AGENT_UPDATE,
            "An incoming request was cancelled by the originator.",
          ),
        ),
      );
      for (const pendingRequest of pendingRequests) {
        this.emitRequestUpdatedSafe(
          [updatedIntent.userId, pendingRequest.recipientUserId],
          pendingRequest.id,
          RequestStatus.CANCELLED,
        );
      }
    }

    const threadId =
      options.agentThreadId ??
      (await this.resolveLatestThreadIdForUser(updatedIntent.userId));
    if (threadId) {
      await this.agentService.createAgentMessage(
        threadId,
        `I cancelled that intent and withdrew ${pendingRequests.length} pending request${pendingRequests.length === 1 ? "" : "s"}.`,
      );
    }

    return {
      intent: updatedIntent,
      cancelledRequestCount: pendingRequests.length,
    };
  }

  async summarizePendingIntents(
    userId: string,
    agentThreadId?: string,
    maxIntents = 5,
  ) {
    const activeStatuses = ["parsed", "matching", "fanout", "partial"] as const;
    const intents = await this.prisma.intent.findMany({
      where: {
        userId,
        status: { in: [...activeStatuses] },
      },
      orderBy: { createdAt: "desc" },
      take: maxIntents,
      select: {
        id: true,
        rawText: true,
        status: true,
        createdAt: true,
      },
    });

    const requests =
      intents.length === 0
        ? []
        : await this.prisma.intentRequest.findMany({
            where: {
              intentId: { in: intents.map((intent) => intent.id) },
            },
            select: {
              intentId: true,
              status: true,
            },
          });

    const countsByIntent = requests.reduce(
      (acc, request) => {
        const existing = acc[request.intentId] ?? {
          pending: 0,
          accepted: 0,
          rejected: 0,
          expired: 0,
          cancelled: 0,
        };
        existing[request.status] += 1;
        acc[request.intentId] = existing;
        return acc;
      },
      {} as Record<
        string,
        {
          pending: number;
          accepted: number;
          rejected: number;
          expired: number;
          cancelled: number;
        }
      >,
    );

    const summaryItems = intents.map((intent) => ({
      intentId: intent.id,
      rawText: intent.rawText,
      status: intent.status,
      ageMinutes: Math.max(
        0,
        Math.floor((Date.now() - intent.createdAt.getTime()) / 60_000),
      ),
      requests: countsByIntent[intent.id] ?? {
        pending: 0,
        accepted: 0,
        rejected: 0,
        expired: 0,
        cancelled: 0,
      },
    }));

    const summaryText = this.renderPendingSummaryText(summaryItems);

    if (agentThreadId) {
      await this.agentService.createAgentMessage(agentThreadId, summaryText);
    }

    return {
      userId,
      activeIntentCount: summaryItems.length,
      summaryText,
      intents: summaryItems,
    };
  }

  async retryIntent(intentId: string, traceId: string, agentThreadId?: string) {
    await this.prisma.intent.update({
      where: { id: intentId },
      data: { status: "parsed" },
    });
    const retryIntent = await this.prisma.intent.findUnique({
      where: { id: intentId },
      select: { userId: true },
    });
    if (retryIntent) {
      this.emitIntentUpdatedSafe(retryIntent.userId, intentId, "parsed");
      await this.workflowRuntimeService?.checkpoint({
        workflowRunId: this.buildIntentWorkflowRunId(intentId),
        traceId,
        stage: "replay_enqueue",
        status: "completed",
        entityType: "intent",
        entityId: intentId,
        userId: retryIntent.userId,
        summary: "Manual replay requested for intent routing.",
      });
    }
    const idempotencyKey = this.buildIntentProcessingIdempotencyKey(
      intentId,
      `manual:${traceId}`,
    );
    await this.intentProcessingQueue.add(
      "IntentCreated",
      {
        version: 1,
        traceId,
        idempotencyKey,
        timestamp: new Date().toISOString(),
        type: "IntentCreated",
        payload: {
          intentId,
          agentThreadId: agentThreadId ?? undefined,
        },
      },
      {
        jobId: idempotencyKey,
        removeOnComplete: 500,
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 1000,
        },
      },
    );
    return { intentId, status: "queued" as const };
  }

  async widenIntentFilters(
    intentId: string,
    traceId: string,
    agentThreadId?: string,
  ) {
    const intent = await this.prisma.intent.findUnique({
      where: { id: intentId },
    });
    if (!intent) return { intentId, status: "not_found" as const };

    const parsed = (intent.parsedIntent as ParsedIntentPayload) ?? {};
    const nextLevel = Math.min(
      ROUTING_ESCALATION_TIMEOUT_LEVELS_MINUTES.length,
      this.readRoutingEscalationLevel(parsed) + 1,
    );
    const widened = this.applyRoutingEscalation(parsed, nextLevel);

    await this.prisma.intent.update({
      where: { id: intentId },
      data: {
        parsedIntent: widened as Prisma.InputJsonValue,
        status: "parsed",
      },
    });
    this.emitIntentUpdatedSafe(intent.userId, intentId, "parsed");

    return this.retryIntent(intentId, traceId, agentThreadId);
  }

  async convertIntentMode(
    intentId: string,
    mode: "one_to_one" | "group",
    options: { groupSizeTarget?: number } = {},
  ) {
    const intent = await this.prisma.intent.findUnique({
      where: { id: intentId },
    });
    if (!intent) {
      throw new NotFoundException("intent not found");
    }

    const parsed = (intent.parsedIntent as Record<string, unknown>) ?? {};
    const nextParsed = {
      ...parsed,
      intentType: mode === "group" ? "group" : "chat",
      groupSizeTarget:
        mode === "group"
          ? Math.min(Math.max(options.groupSizeTarget ?? 3, 2), 4)
          : 2,
    };

    return this.prisma.intent.update({
      where: { id: intentId },
      data: {
        parsedIntent: nextParsed as Prisma.InputJsonValue,
      },
    });
  }

  async listIntentExplanations(intentId: string) {
    const intent = await this.prisma.intent.findUnique({
      where: { id: intentId },
      select: {
        id: true,
        status: true,
      },
    });
    if (!intent) {
      throw new NotFoundException("intent not found");
    }

    const candidates = await this.prisma.intentCandidate.findMany({
      where: { intentId },
      orderBy: { score: "desc" },
      take: 25,
      select: {
        candidateUserId: true,
        score: true,
        rationale: true,
        createdAt: true,
      },
    });

    return {
      intentId: intent.id,
      status: intent.status,
      candidateCount: candidates.length,
      candidates: candidates.map((candidate, index) => ({
        rank: index + 1,
        candidateUserId: candidate.candidateUserId,
        score: Number(candidate.score),
        selectedAt: candidate.createdAt.toISOString(),
        explanation: this.toSafeCandidateExplanation(candidate.rationale),
      })),
    };
  }

  async getUserFacingIntentExplanation(intentId: string) {
    const detail = await this.listIntentExplanations(intentId);
    const top = detail.candidates[0];
    if (!top) {
      return {
        intentId: detail.intentId,
        status: detail.status,
        summary:
          "I have not selected any candidate yet. I will explain choices once I find strong matches.",
        factors: [] as string[],
      };
    }

    const factors = this.toUserFacingFactors(top.explanation.selectedBecause);
    return {
      intentId: detail.intentId,
      status: detail.status,
      summary: this.renderUserFacingSummary(factors),
      factors,
    };
  }

  private async loadFanoutQuotaSnapshot(senderUserId: string) {
    const dayAgo = new Date(Date.now() - 24 * 60 * 60_000);
    const [pendingOutgoingCount, dailyOutgoingCount] = await Promise.all([
      this.prisma.intentRequest.count({
        where: {
          senderUserId,
          status: "pending",
        },
      }),
      this.prisma.intentRequest.count({
        where: {
          senderUserId,
          sentAt: { gte: dayAgo },
        },
      }),
    ]);

    return {
      pendingOutgoingCount,
      dailyOutgoingCount,
    };
  }

  private computeFanoutCap(input: {
    intentType?: string;
    groupSizeTarget?: number;
    candidateCount: number;
    pendingOutgoingCount: number;
    dailyOutgoingCount: number;
  }) {
    if (input.candidateCount <= 0) {
      return 0;
    }

    const isGroupIntent = input.intentType === "group";
    const normalizedGroupSize = Math.min(
      Math.max(input.groupSizeTarget ?? 3, 2),
      4,
    );
    const desiredCap = isGroupIntent
      ? Math.min(BASE_GROUP_FANOUT_CAP, normalizedGroupSize + 1)
      : BASE_ONE_TO_ONE_FANOUT_CAP;
    const remainingPendingQuota = Math.max(
      0,
      MAX_PENDING_OUTGOING_REQUESTS_PER_SENDER - input.pendingOutgoingCount,
    );
    const remainingDailyQuota = Math.max(
      0,
      MAX_DAILY_OUTGOING_REQUESTS_PER_SENDER - input.dailyOutgoingCount,
    );

    return Math.max(
      0,
      Math.min(
        input.candidateCount,
        desiredCap,
        remainingPendingQuota,
        remainingDailyQuota,
      ),
    );
  }

  private async enqueueAsyncAgentFollowup(input: {
    userId: string;
    intentId: string;
    traceId: string;
    agentThreadId?: string;
    template: "pending_reminder" | "no_match_yet" | "progress_update";
    notificationType?: NotificationType;
    delayMs: number;
    message?: string;
  }) {
    const followupsEnabled = await this.isAgentFollowupsEnabled(input.userId);
    if (!followupsEnabled) {
      this.logger.warn(
        JSON.stringify({
          event: "intent.followup.skipped",
          reason: "launch_controls_disabled",
          intentId: input.intentId,
          userId: input.userId,
          template: input.template,
        }),
      );
      await this.workflowRuntimeService?.checkpoint({
        workflowRunId: this.buildIntentWorkflowRunId(input.intentId),
        traceId: input.traceId,
        stage: "followup_enqueue",
        status: "skipped",
        entityType: "intent",
        entityId: input.intentId,
        userId: input.userId,
        summary:
          "Skipped async follow-up enqueue because launch controls disabled followups.",
        metadata: {
          template: input.template,
          notificationType: input.notificationType ?? null,
          reason: "launch_controls_disabled",
        },
      });
      return;
    }

    const idempotencyKey = this.buildAsyncFollowupIdempotencyKey(
      input.intentId,
      input.template,
    );
    await this.notificationQueue.add(
      "AsyncAgentFollowup",
      {
        version: 1,
        traceId: input.traceId,
        idempotencyKey,
        timestamp: new Date().toISOString(),
        type: "AsyncAgentFollowup",
        payload: {
          userId: input.userId,
          intentId: input.intentId,
          agentThreadId: input.agentThreadId,
          template: input.template,
          notificationType: input.notificationType,
          message: input.message,
        },
      },
      {
        jobId: idempotencyKey,
        delay: input.delayMs,
        removeOnComplete: 500,
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 1000,
        },
      },
    );
    await this.workflowRuntimeService?.checkpoint({
      workflowRunId: this.buildIntentWorkflowRunId(input.intentId),
      traceId: input.traceId,
      stage: "followup_enqueue",
      status: "completed",
      entityType: "intent",
      entityId: input.intentId,
      userId: input.userId,
      summary: `Queued async follow-up template ${input.template}.`,
      metadata: {
        template: input.template,
        notificationType: input.notificationType ?? null,
        delayMs: input.delayMs,
        idempotencyKey,
      },
    });
  }

  private buildIntentWorkflowRunId(intentId: string) {
    return (
      this.workflowRuntimeService?.buildWorkflowRunId({
        domain: "social",
        entityType: "intent",
        entityId: intentId,
      }) ?? `social:intent:${intentId}`
    );
  }

  private async enqueueDelayedRoutingRetry(input: {
    intentId: string;
    traceId: string;
    agentThreadId?: string;
    reason:
      | "fanout_followup"
      | "cap_reached"
      | "no_candidates"
      | "timeout_escalated";
    delayMs: number;
  }) {
    const idempotencyKey = this.buildIntentProcessingIdempotencyKey(
      input.intentId,
      input.reason,
    );
    await this.intentProcessingQueue.add(
      "IntentCreated",
      {
        version: 1,
        traceId: input.traceId,
        idempotencyKey,
        timestamp: new Date().toISOString(),
        type: "IntentCreated",
        payload: {
          intentId: input.intentId,
          agentThreadId: input.agentThreadId ?? undefined,
        },
      },
      {
        jobId: idempotencyKey,
        delay: input.delayMs,
        removeOnComplete: 500,
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 1000,
        },
      },
    );
  }

  private buildIntentProcessingIdempotencyKey(
    intentId: string,
    reason: string,
  ) {
    return `intent-created:${intentId}:${reason}`;
  }

  private buildAsyncFollowupIdempotencyKey(
    intentId: string,
    template: "pending_reminder" | "no_match_yet" | "progress_update",
  ) {
    return `async-followup:${intentId}:${template}`;
  }

  private buildNoMatchRecoveryMessage(
    parsedIntent: unknown,
    options: {
      includeBackground: boolean;
    },
  ) {
    const parsed =
      parsedIntent && typeof parsedIntent === "object"
        ? (parsedIntent as ParsedIntentPayload)
        : {};

    const suggestions: string[] = [];
    const primaryTopic =
      Array.isArray(parsed.topics) && parsed.topics.length > 0
        ? parsed.topics.find(
            (topic) => typeof topic === "string" && topic.trim(),
          )
        : null;

    if (
      Array.isArray(parsed.timingConstraints) &&
      parsed.timingConstraints.length
    ) {
      suggestions.push("widen timing");
    }

    if (typeof parsed.modality === "string" && parsed.modality !== "either") {
      suggestions.push("switch between online and in-person");
    }

    if (
      typeof parsed.groupSizeTarget === "number" ||
      parsed.intentType === "chat" ||
      parsed.intentType === "social"
    ) {
      suggestions.push("try 1:1 or a small group");
    }

    if (
      Array.isArray(parsed.skillConstraints) &&
      parsed.skillConstraints.length
    ) {
      suggestions.push("relax skill filters one step at a time");
    }

    if (
      suggestions.length === 0 &&
      Array.isArray(parsed.topics) &&
      parsed.topics.length > 0
    ) {
      suggestions.push("drop one constraint at a time");
    }

    const dedupedSuggestions = Array.from(new Set(suggestions)).slice(0, 3);
    const suggestionText =
      dedupedSuggestions.length > 0
        ? `Best next move: ${dedupedSuggestions.join(", ")}.`
        : "Best next move: widen timing, switch format, or try 1:1 versus a small group.";

    const backgroundText = options.includeBackground
      ? " Search is still active."
      : "";

    const topicText = primaryTopic ? ` for ${primaryTopic}` : "";

    return `No strong match yet${topicText}.${backgroundText} ${suggestionText}`.trim();
  }

  private clampIntentCount(value: number) {
    return Math.max(1, Math.min(5, Math.floor(value)));
  }

  private decomposeAgentMessageToIntents(content: string, maxIntents: number) {
    const normalized = content.trim();
    if (!normalized) {
      return [];
    }

    const explicitSplit = normalized
      .split(/\n+|;+/)
      .flatMap((segment) => segment.split(/(?<=[.!?])\s+(?=[A-Z0-9])/))
      .flatMap((segment) => segment.split(/(?:^|\s)(?:\d+[.)]|[-*])\s+/))
      .map((segment) => segment.trim())
      .filter((segment) => segment.length >= 8);

    const uniqueSegments = Array.from(new Set(explicitSplit)).slice(
      0,
      maxIntents,
    );
    return uniqueSegments.length > 0 ? uniqueSegments : [normalized];
  }

  private async resolveSafeIntentDecompositionCap(
    userId: string,
    requestedMaxIntents: number,
  ) {
    const quota = await this.loadFanoutQuotaSnapshot(userId);
    const remainingPendingQuota = Math.max(
      0,
      MAX_PENDING_OUTGOING_REQUESTS_PER_SENDER - quota.pendingOutgoingCount,
    );
    const remainingDailyQuota = Math.max(
      0,
      MAX_DAILY_OUTGOING_REQUESTS_PER_SENDER - quota.dailyOutgoingCount,
    );
    const remainingQuota = Math.min(remainingPendingQuota, remainingDailyQuota);
    if (remainingQuota <= 1) {
      return 1;
    }
    const quotaBound = Math.max(1, Math.floor(remainingQuota / 3));
    return Math.max(1, Math.min(requestedMaxIntents, quotaBound));
  }

  private resolveTimeoutEscalation(input: {
    parsedIntent: ParsedIntentPayload;
    intentCreatedAt: Date;
  }): TimeoutEscalationResult {
    const ageMinutes = Math.max(
      0,
      Math.floor((Date.now() - input.intentCreatedAt.getTime()) / 60_000),
    );
    const currentLevel = this.readRoutingEscalationLevel(input.parsedIntent);
    const targetLevel = this.resolveEscalationLevelForAge(ageMinutes);

    return {
      shouldEscalate: targetLevel > currentLevel,
      ageMinutes,
      currentLevel,
      targetLevel,
      widenedParsedIntent: this.applyRoutingEscalation(
        input.parsedIntent,
        targetLevel,
      ),
    };
  }

  private resolveEscalationLevelForAge(ageMinutes: number) {
    let level = 0;
    for (const threshold of ROUTING_ESCALATION_TIMEOUT_LEVELS_MINUTES) {
      if (ageMinutes >= threshold) {
        level += 1;
      }
    }
    return Math.min(level, ROUTING_ESCALATION_TIMEOUT_LEVELS_MINUTES.length);
  }

  private readRoutingEscalationLevel(parsedIntent: ParsedIntentPayload) {
    if (
      typeof parsedIntent.routingEscalationLevel !== "number" ||
      !Number.isFinite(parsedIntent.routingEscalationLevel)
    ) {
      return 0;
    }

    const normalized = Math.floor(parsedIntent.routingEscalationLevel);
    return Math.max(
      0,
      Math.min(normalized, ROUTING_ESCALATION_TIMEOUT_LEVELS_MINUTES.length),
    );
  }

  private applyRoutingEscalation(
    parsedIntent: ParsedIntentPayload,
    targetLevel: number,
  ) {
    const normalizedLevel = Math.max(
      0,
      Math.min(targetLevel, ROUTING_ESCALATION_TIMEOUT_LEVELS_MINUTES.length),
    );
    const widened: ParsedIntentPayload = {
      ...parsedIntent,
      routingEscalationLevel: normalizedLevel,
      routingEscalatedAt: new Date().toISOString(),
      urgency: "flexible",
    };

    if (normalizedLevel >= 1) {
      if (widened.modality === "offline" || widened.modality === "online") {
        widened.modality = "either";
      }
      widened.timingConstraints = [];
      widened.skillConstraints = [];
      widened.vibeConstraints = [];
    }
    if (normalizedLevel >= 2) {
      widened.topics = [];
      widened.activities = [];
    }

    return widened;
  }

  private async resolveLatestThreadIdForUser(userId: string) {
    if (!this.prisma.agentThread?.findFirst) {
      return null;
    }
    const thread = await this.prisma.agentThread.findFirst({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    return thread?.id;
  }

  private renderPendingSummaryText(
    intents: Array<{
      intentId: string;
      rawText: string;
      status: string;
      ageMinutes: number;
      requests: {
        pending: number;
        accepted: number;
        rejected: number;
        expired: number;
        cancelled: number;
      };
    }>,
  ) {
    if (intents.length === 0) {
      return "You have no active intents in progress right now.";
    }

    const pendingTotal = intents.reduce(
      (total, intent) => total + intent.requests.pending,
      0,
    );
    const acceptedTotal = intents.reduce(
      (total, intent) => total + intent.requests.accepted,
      0,
    );

    return `You currently have ${intents.length} active intent${intents.length === 1 ? "" : "s"} (${acceptedTotal} accepted, ${pendingTotal} pending).`;
  }

  private async captureIntentSignals(
    userId: string,
    parsed: {
      intentType?: string;
      modality?: string;
      topics?: string[];
      activities?: string[];
      timingConstraints?: string[];
    },
  ) {
    try {
      await this.personalizationService.recordIntentSignals(userId, parsed);
    } catch (error) {
      this.logger.warn(
        `life graph signal ingestion failed for user ${userId}: ${String(
          error,
        )}`,
      );
    }
  }

  private async captureIntentEmbedding(intentId: string) {
    try {
      await this.matchingService.upsertIntentEmbedding(intentId);
    } catch (error) {
      this.logger.warn(
        `intent embedding generation failed for intent ${intentId}: ${String(
          error,
        )}`,
      );
    }
  }

  private async applyIntentModeration(input: {
    intent: {
      id: string;
      userId: string;
      rawText: string;
      status: string;
      safetyState: string;
      createdAt: Date;
      updatedAt: Date;
      parsedIntent: Prisma.JsonValue | null;
      confidence: Prisma.Decimal | null;
    };
    intentId: string;
    userId: string;
    rawText: string;
    traceId: string;
    agentThreadId?: string;
  }) {
    const strictModerationEnabled = await this.isModerationStrictnessEnabled();
    const moderation = this.applyStrictModeration(
      this.evaluateTextModeration(input.rawText, {
        blockedTerms: INTENT_MODERATION_BLOCKLIST,
        reviewTerms: INTENT_MODERATION_REVIEWLIST,
      }),
      strictModerationEnabled,
    );
    if (moderation.decision === "clean") {
      return {
        decision: "clean",
        intent: input.intent,
      } as const;
    }

    const updatedIntent = await this.prisma.intent.update({
      where: { id: input.intentId },
      data: {
        safetyState: moderation.decision,
        status: moderation.decision === "blocked" ? "cancelled" : "parsed",
      },
    });
    this.emitIntentUpdatedSafe(
      input.userId,
      input.intentId,
      updatedIntent.status,
    );

    if (this.prisma.moderationFlag?.create) {
      await this.prisma.moderationFlag.create({
        data: {
          entityType: "intent",
          entityId: input.intentId,
          reason: `intent_${moderation.decision}:${moderation.matchedTerms.join(",")}`,
          status: "open",
        },
      });
    }

    if (this.prisma.auditLog?.create) {
      await this.prisma.auditLog.create({
        data: {
          actorUserId: input.userId,
          actorType: "system",
          action: "intent.moderation_decision",
          entityType: "intent",
          entityId: input.intentId,
          metadata: this.toJsonObject({
            traceId: input.traceId,
            decision: moderation.decision,
            matchedTerms: moderation.matchedTerms,
          }),
        },
      });
    }

    await this.notificationsService.createInAppNotification(
      input.userId,
      NotificationType.MODERATION_NOTICE,
      moderation.decision === "blocked"
        ? "Your intent was blocked by safety policy."
        : "Your intent is queued for human safety review.",
    );

    const moderationThreadId =
      input.agentThreadId ??
      (await this.resolveLatestThreadIdForUser(input.userId));
    if (moderationThreadId) {
      await this.agentService.appendWorkflowUpdate(
        moderationThreadId,
        moderation.decision === "blocked"
          ? "I blocked this request because it violated safety policy."
          : "I paused this request for manual safety review before outreach.",
        {
          intentId: input.intentId,
          moderationDecision: moderation.decision,
        },
      );
    }

    return {
      decision: moderation.decision,
      intent: updatedIntent,
    } as const;
  }

  private evaluateTextModeration(
    text: string,
    patterns: {
      blockedTerms: string[];
      reviewTerms: string[];
    },
  ): TextModerationResult {
    const normalized = text.toLowerCase();
    const blockedTerms = patterns.blockedTerms.filter((term) =>
      normalized.includes(term),
    );
    if (blockedTerms.length > 0) {
      return {
        decision: "blocked",
        matchedTerms: blockedTerms,
      };
    }

    const reviewTerms = patterns.reviewTerms.filter((term) =>
      normalized.includes(term),
    );
    if (reviewTerms.length > 0) {
      return {
        decision: "review",
        matchedTerms: reviewTerms,
      };
    }

    return {
      decision: "clean",
      matchedTerms: [],
    };
  }

  private applyStrictModeration(
    result: TextModerationResult,
    strictModerationEnabled: boolean,
  ): TextModerationResult {
    if (!strictModerationEnabled || result.decision !== "review") {
      return result;
    }
    return {
      decision: "blocked",
      matchedTerms: result.matchedTerms,
    };
  }

  private async isAgentFollowupsEnabled(userId: string) {
    if (!this.launchControlsService) {
      return true;
    }
    const snapshot = await this.launchControlsService.getSnapshot();
    const inAlphaCohort = snapshot.alphaCohortUserIds.includes(userId);
    if (snapshot.globalKillSwitch || !snapshot.enableAgentFollowups) {
      return false;
    }
    if (snapshot.inviteOnlyMode && !inAlphaCohort) {
      return false;
    }
    return true;
  }

  private async isModerationStrictnessEnabled() {
    if (!this.launchControlsService) {
      return false;
    }
    const snapshot = await this.launchControlsService.getSnapshot();
    return !snapshot.globalKillSwitch && snapshot.enableModerationStrictness;
  }

  private async recordRoutingAttempt(input: {
    intentId: string;
    userId: string;
    traceId: string;
    candidateCount: number;
    fanoutCap: number;
    fanoutCount: number;
    pendingOutgoingCount: number;
    dailyOutgoingCount: number;
    outcome: "fanout_sent" | "cap_reached" | "no_candidates";
    candidateUserIds: string[];
    fanoutUserIds: string[];
    routingEscalationLevel: number;
  }) {
    if (!this.prisma.auditLog?.create) {
      return;
    }

    try {
      const previousAttemptCount = this.prisma.auditLog.count
        ? await this.prisma.auditLog.count({
            where: {
              entityType: "intent",
              entityId: input.intentId,
              action: "routing.attempt",
            },
          })
        : 0;
      await this.prisma.auditLog.create({
        data: {
          actorUserId: input.userId,
          actorType: "system",
          action: "routing.attempt",
          entityType: "intent",
          entityId: input.intentId,
          metadata: this.toJsonObject({
            traceId: input.traceId,
            attempt: previousAttemptCount + 1,
            candidateCount: input.candidateCount,
            fanoutCap: input.fanoutCap,
            fanoutCount: input.fanoutCount,
            pendingOutgoingCount: input.pendingOutgoingCount,
            dailyOutgoingCount: input.dailyOutgoingCount,
            outcome: input.outcome,
            candidateUserIds: input.candidateUserIds,
            fanoutUserIds: input.fanoutUserIds,
            routingEscalationLevel: input.routingEscalationLevel,
          }),
        },
      });
    } catch (error) {
      this.logger.warn(
        `failed to persist routing attempt for intent ${input.intentId}: ${String(
          error,
        )}`,
      );
    }
  }

  private async recordRoutingEscalation(input: {
    intentId: string;
    userId: string;
    traceId: string;
    fromLevel: number;
    toLevel: number;
    ageMinutes: number;
  }) {
    if (!this.prisma.auditLog?.create) {
      return;
    }

    try {
      await this.prisma.auditLog.create({
        data: {
          actorUserId: input.userId,
          actorType: "system",
          action: "routing.filters_widened",
          entityType: "intent",
          entityId: input.intentId,
          metadata: this.toJsonObject({
            traceId: input.traceId,
            fromLevel: input.fromLevel,
            toLevel: input.toLevel,
            ageMinutes: input.ageMinutes,
            reason: "timeout",
          }),
        },
      });
    } catch (error) {
      this.logger.warn(
        `failed to persist routing escalation for intent ${input.intentId}: ${String(
          error,
        )}`,
      );
    }
  }

  private toCandidateRationale(
    rationale: Record<string, unknown>,
    score: number,
    routingEscalationLevel: number,
  ) {
    const features = [
      {
        key: "semantic_similarity",
        value: this.readFiniteNumber(rationale.semanticSimilarity) ?? 0,
      },
      {
        key: "lexical_overlap",
        value: this.readFiniteNumber(rationale.lexicalOverlap) ?? 0,
      },
      {
        key: "availability_fit",
        value:
          this.readFiniteNumber(rationale.availabilityScore) ??
          this.readFiniteNumber(rationale.availability) ??
          0,
      },
      {
        key: "trust_reputation",
        value: this.readFiniteNumber(rationale.trustScoreNormalized) ?? 0,
      },
      {
        key: "novelty",
        value: this.readFiniteNumber(rationale.noveltySuppressionScore) ?? 0,
      },
      {
        key: "proximity",
        value: this.readFiniteNumber(rationale.proximityScore) ?? 0,
      },
      {
        key: "style_compatibility",
        value: this.readFiniteNumber(rationale.styleCompatibility) ?? 0,
      },
      {
        key: "personalization",
        value: this.readFiniteNumber(rationale.personalizationBoost) ?? 0,
      },
    ]
      .sort((a, b) => b.value - a.value)
      .filter((feature) => feature.value > 0)
      .slice(0, 3)
      .map((feature) => feature.key);

    return this.toJsonObject({
      ...rationale,
      finalScore: score,
      selectedBecause: features,
      selectionRecordedAt: new Date().toISOString(),
      routingEscalationLevel,
    });
  }

  private toSafeCandidateExplanation(rationale: Prisma.JsonValue | null) {
    const value = this.asJsonObject(rationale);
    const trustScoreNormalized = this.readFiniteNumber(
      value.trustScoreNormalized,
    );
    const trustBand =
      trustScoreNormalized === null
        ? null
        : trustScoreNormalized >= 0.75
          ? "high"
          : trustScoreNormalized >= 0.45
            ? "medium"
            : "low";

    return {
      retrievalSource: this.readString(value.retrievalSource),
      semanticSimilarity: this.readFiniteNumber(value.semanticSimilarity),
      lexicalOverlap: this.readFiniteNumber(value.lexicalOverlap),
      lexicalOverlapCount: this.readFiniteNumber(value.lexicalOverlapCount),
      availabilityMode: this.readString(value.availability),
      trustBand,
      trustScoreNormalized,
      noveltySuppressionScore: this.readFiniteNumber(
        value.noveltySuppressionScore,
      ),
      proximityScore: this.readFiniteNumber(value.proximityScore),
      styleCompatibility: this.readFiniteNumber(value.styleCompatibility),
      personalizationBoost: this.readFiniteNumber(value.personalizationBoost),
      finalScore: this.readFiniteNumber(value.finalScore),
      routingEscalationLevel: this.readFiniteNumber(
        value.routingEscalationLevel,
      ),
      selectedBecause: this.readStringArray(value.selectedBecause),
      selectionRecordedAt: this.readString(value.selectionRecordedAt),
    };
  }

  private toUserFacingFactors(selectedBecause: string[]) {
    const labelByFactor: Record<string, string> = {
      semantic_similarity: "shared topics",
      lexical_overlap: "direct overlap with your request",
      availability_fit: "timing and availability fit",
      trust_reputation: "reputation and trust signals",
      novelty: "fresh connection opportunity",
      proximity: "location proximity",
      style_compatibility: "style and vibe compatibility",
      personalization: "your past successful preferences",
    };

    return selectedBecause.map((factor) => labelByFactor[factor] ?? factor);
  }

  private renderUserFacingSummary(factors: string[]) {
    if (factors.length === 0) {
      return "I prioritized candidates based on overall match quality and safety rules.";
    }
    if (factors.length === 1) {
      return `I prioritized this match because of ${factors[0]}.`;
    }

    const [first, second, ...rest] = factors;
    if (rest.length === 0) {
      return `I prioritized this match because of ${first} and ${second}.`;
    }

    return `I prioritized this match because of ${first}, ${second}, and ${rest.join(", ")}.`;
  }

  private asJsonObject(value: Prisma.JsonValue | null) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return {} as Record<string, unknown>;
    }
    return value as Record<string, unknown>;
  }

  private readFiniteNumber(value: unknown) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return null;
    }
    return value;
  }

  private readString(value: unknown) {
    return typeof value === "string" ? value : null;
  }

  private readStringArray(value: unknown) {
    if (!Array.isArray(value)) {
      return [] as string[];
    }
    return value.filter((item): item is string => typeof item === "string");
  }

  private toJsonObject(input: Record<string, unknown>) {
    return JSON.parse(JSON.stringify(input)) as Prisma.InputJsonObject;
  }

  private emitIntentUpdatedSafe(
    userId: string,
    intentId: string,
    status: string,
  ) {
    this.realtimeEventsService?.emitIntentUpdated(userId, { intentId, status });
  }

  private emitRequestCreatedSafe(
    recipientUserId: string,
    requestId: string,
    intentId: string,
  ) {
    this.realtimeEventsService?.emitRequestCreated(recipientUserId, {
      requestId,
      intentId,
    });
  }

  private emitRequestUpdatedSafe(
    userIds: string[],
    requestId: string,
    status: RequestStatus,
  ) {
    this.realtimeEventsService?.emitRequestUpdated(userIds, {
      requestId,
      status,
    });
  }

  private async trackAnalyticsEventSafe(input: {
    eventType: string;
    actorUserId?: string;
    entityType?: string;
    entityId?: string;
    properties?: Record<string, unknown>;
  }) {
    if (!this.analyticsService) {
      return;
    }
    try {
      await this.analyticsService.trackEvent(input);
    } catch (error) {
      this.logger.warn(
        `failed to record analytics event ${input.eventType}: ${String(error)}`,
      );
    }
  }
}
