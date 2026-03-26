import {
  OpenAIClient,
  agentActionTypes,
  canAgentHandoff,
  canAgentUseTool,
  requiresHumanApproval,
  type AgentActionType,
  type AgentTool,
  type OpenAIAgentRole,
} from "@opensocial/openai";
import { Prisma } from "@prisma/client";
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { AnalyticsService } from "../analytics/analytics.service.js";
import { AppCacheService } from "../common/app-cache.service.js";
import { PrismaService } from "../database/prisma.service.js";
import { ModerationService } from "../moderation/moderation.service.js";
import { AgentOutcomeToolsService } from "./agent-outcome-tools.service.js";
import { AgentService } from "./agent.service.js";

type AgentAttachmentInput =
  | {
      kind: "image_url";
      url: string;
      caption?: string;
    }
  | {
      kind: "file_ref";
      fileId: string;
      caption?: string;
    };

type ConversationToolCall = {
  role: OpenAIAgentRole;
  tool: AgentTool;
  input: Record<string, unknown>;
};

type ConversationToolResult = {
  role: OpenAIAgentRole;
  tool: AgentTool;
  status: "executed" | "denied" | "failed";
  output?: unknown;
  reason?: string;
};

type ModerationGateResult = {
  decision: "clean" | "review" | "blocked";
  score: number;
  reasons: string[];
};

type AgentPlanCheckpointStatus = "pending" | "approved" | "rejected";

type SocialContextPacket = {
  freshOnboardingTurn: boolean;
  profile: {
    displayName: string | null;
    bio: string | null;
    city: string | null;
    country: string | null;
    onboardingState: string | null;
    availabilityMode: string | null;
  };
  interests: string[];
  goals: string[];
  preferences: {
    intentMode: string;
    modality: string;
    reachable: string;
    notificationMode: string;
    memoryMode: string;
    timezone: string;
  };
  thread: {
    title: string | null;
    ageMinutes: number | null;
    existingMessageCount: number;
  };
  memoryHighlights: string[];
};

@Injectable()
export class AgentConversationService {
  private readonly logger = new Logger(AgentConversationService.name);
  private readonly nonPersistentWorkflowStages = new Set([
    "risk_assessment_pre_tools",
    "risk_assessment_pre_send",
    "response_sanitized",
  ]);
  private readonly planTimeoutMs = Math.max(
    1000,
    Number(process.env.AGENT_LLM_PLAN_TIMEOUT_MS ?? 4000) || 4000,
  );
  private readonly responseTimeoutMs = Math.max(
    this.planTimeoutMs,
    Number(process.env.AGENT_LLM_RESPONSE_TIMEOUT_MS ?? 6000) || 6000,
  );
  private readonly openai = new OpenAIClient({
    apiKey: process.env.OPENAI_API_KEY ?? "",
  });

  constructor(
    private readonly prisma: PrismaService,
    private readonly agentService: AgentService,
    private readonly appCacheService: AppCacheService,
    @Optional()
    private readonly analyticsService?: AnalyticsService,
    @Optional()
    private readonly moderationService?: ModerationService,
    @Optional()
    private readonly agentOutcomeToolsService?: AgentOutcomeToolsService,
  ) {}

  async listPlanCheckpoints(input: {
    threadId: string;
    status?: AgentPlanCheckpointStatus;
    limit?: number;
  }) {
    const limit = Math.min(Math.max(input.limit ?? 20, 1), 50);
    return this.prisma.agentPlanCheckpoint.findMany({
      where: {
        threadId: input.threadId,
        ...(input.status ? { status: input.status } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
  }

  async resolvePlanCheckpoint(input: {
    threadId: string;
    checkpointId: string;
    actorUserId: string;
    decision: "approved" | "rejected";
    reason?: string;
  }) {
    const checkpoint = await this.prisma.agentPlanCheckpoint.findFirst({
      where: {
        id: input.checkpointId,
        threadId: input.threadId,
      },
    });
    if (!checkpoint) {
      throw new NotFoundException("plan checkpoint not found");
    }
    if (checkpoint.status !== "pending") {
      throw new BadRequestException("plan checkpoint already resolved");
    }

    const next = await this.prisma.agentPlanCheckpoint.update({
      where: { id: input.checkpointId },
      data: {
        status: input.decision,
        decisionReason: input.reason?.trim() || null,
        resolvedByUserId: input.actorUserId,
        resolvedAt: new Date(),
      },
    });

    await this.agentService.appendWorkflowUpdate(
      input.threadId,
      `Plan checkpoint ${input.decision}: ${checkpoint.actionType.replaceAll("_", " ")} (${checkpoint.riskLevel} risk).`,
      {
        category: "plan_checkpoint_decision",
        traceId: checkpoint.traceId,
        checkpointId: checkpoint.id,
        decision: input.decision,
        actionType: checkpoint.actionType,
        riskLevel: checkpoint.riskLevel,
        ...(input.reason?.trim()
          ? { details: { reason: input.reason.trim() } }
          : {}),
      },
    );

    return next;
  }

  async runAgenticTurn(input: {
    threadId: string;
    userId: string;
    content: string;
    traceId?: string;
    streamResponseTokens?: boolean;
    voiceTranscript?: string;
    attachments?: AgentAttachmentInput[];
  }) {
    const traceId = input.traceId?.trim() || randomUUID();
    const streamResponseTokens = input.streamResponseTokens ?? false;
    const multimodalContext = this.buildMultimodalContext({
      voiceTranscript: input.voiceTranscript,
      attachments: input.attachments,
    });
    const userContent = this.buildUserContentForTurn(
      input.content,
      multimodalContext,
    );
    const hasMultimodal =
      multimodalContext.voiceTranscript.length > 0 ||
      multimodalContext.attachments.length > 0;
    const userMessage = await this.agentService.createUserMessage(
      input.threadId,
      userContent,
      input.userId,
      hasMultimodal
        ? {
            multimodal: {
              voiceTranscript: multimodalContext.voiceTranscript,
              attachments: multimodalContext.attachments,
            },
          }
        : undefined,
    );

    await this.appendOrchestrationStep(
      input.threadId,
      traceId,
      "planning_started",
      "Planning agentic response.",
    );

    const preToolRisk = this.assessRiskGate({
      content: userContent,
      surface: "agent_turn",
      context:
        multimodalContext.voiceTranscript ||
        multimodalContext.attachments.length > 0
          ? "turn includes voice transcript and/or attachments"
          : undefined,
    });
    await this.appendOrchestrationStep(
      input.threadId,
      traceId,
      "risk_assessment_pre_tools",
      `Risk check before tools: ${preToolRisk.decision}.`,
      {
        decision: preToolRisk.decision,
        score: preToolRisk.score,
        reasons: preToolRisk.reasons,
      },
    );
    await this.persistRiskAssessment({
      threadId: input.threadId,
      userId: input.userId,
      traceId,
      phase: "pre_tools",
      assessedContent: userContent,
      assessment: preToolRisk,
    });

    let specialists: OpenAIAgentRole[] = [];
    let toolCalls: ConversationToolCall[] = [];
    let delegatedSpecialistSet = new Set<OpenAIAgentRole>();
    let responseGoal: string | null = null;
    let socialContext: SocialContextPacket | null = null;

    if (
      preToolRisk.decision === "clean" &&
      this.shouldUseSimpleFastPath(userContent, multimodalContext)
    ) {
      socialContext = await this.buildSocialContextPacket({
        userId: input.userId,
        threadId: input.threadId,
        existingMessageCount: 0,
      });
      responseGoal =
        "Answer directly with a concise, helpful response. Ask at most one clarifying question only if it is essential.";
      await this.appendOrchestrationStep(
        input.threadId,
        traceId,
        "fast_path_selected",
        "Simple-turn fast path selected.",
        {
          responseGoal,
        },
      );
    } else {
      const threadMessages = await this.prisma.agentMessage.findMany({
        where: { threadId: input.threadId },
        orderBy: { createdAt: "desc" },
        take: 24,
        select: {
          id: true,
          role: true,
          content: true,
          createdAt: true,
          metadata: true,
        },
      });

      const threadSummary = this.buildThreadSummary(threadMessages);
      socialContext = await this.buildSocialContextPacket({
        userId: input.userId,
        threadId: input.threadId,
        existingMessageCount: threadMessages.length,
      });

      const allowedSpecialists: OpenAIAgentRole[] = [
        "intent_parser",
        "ranking_explanation",
        "personalization_interpreter",
        "notification_copy",
        "moderation_assistant",
      ];

      const planned = (await this.withTimeout(
        this.openai.planConversationTurn(
          {
            userMessage: userContent,
            threadSummary,
            ...(socialContext ? { socialContext } : {}),
            multimodalContext: hasMultimodal
              ? {
                  voiceTranscript: multimodalContext.voiceTranscript,
                  attachments: multimodalContext.attachments,
                }
              : undefined,
            allowedSpecialists,
            maxToolCalls: 8,
          },
          traceId,
        ),
        this.planTimeoutMs,
        "conversation_planning",
      )) ?? {
        specialists: ["intent_parser"],
        toolCalls: [],
        responseGoal:
          "Provide a concise, safe reply and ask one clarifying question if needed.",
      };

      if (planned.toolCalls.length === 0 && planned.specialists.length === 1) {
        await this.appendOrchestrationStep(
          input.threadId,
          traceId,
          "planning_degraded",
          "Planning timed out or was unavailable; using fallback plan.",
        );
      }

      specialists = planned.specialists.filter((role) =>
        canAgentHandoff("manager", role),
      );
      delegatedSpecialistSet = new Set<OpenAIAgentRole>(specialists);
      toolCalls = planned.toolCalls.map((toolCall) => ({
        role: toolCall.role,
        tool: toolCall.tool,
        input: toolCall.input ?? {},
      }));
      responseGoal = planned.responseGoal ?? null;

      await this.appendOrchestrationStep(
        input.threadId,
        traceId,
        "plan_ready",
        `Plan ready: ${specialists.length} specialists, ${toolCalls.length} tools.`,
        {
          specialists,
          toolCalls: toolCalls.map((call) => ({
            role: call.role,
            tool: call.tool,
          })),
        },
      );
    }

    let toolResults: ConversationToolResult[] = [];
    const specialistOutputs: Partial<Record<OpenAIAgentRole, unknown>> = {};
    const specialistNotes: Array<{ role: OpenAIAgentRole; status: string }> =
      [];

    toolResults = await Promise.all(
      toolCalls.map((call) =>
        this.executeToolCallWithLifecycle({
          threadId: input.threadId,
          userId: input.userId,
          traceId,
          call,
          preToolRiskDecision: preToolRisk.decision,
          delegatedSpecialistSet,
        }),
      ),
    );

    if (preToolRisk.decision === "blocked") {
      for (const specialist of specialists) {
        specialistNotes.push({
          role: specialist,
          status: "skipped_risk_blocked",
        });
      }
    }

    if (preToolRisk.decision !== "blocked") {
      const specialistRuns = await Promise.all(
        specialists.map((specialist) =>
          this.runSpecialistWithLifecycle({
            threadId: input.threadId,
            traceId,
            specialist,
            userContent,
            toolResults,
          }),
        ),
      );

      for (const run of specialistRuns) {
        specialistNotes.push({
          role: run.specialist,
          status: run.status,
        });
        if (run.status === "executed") {
          specialistOutputs[run.specialist] = run.output;
        }
      }
    }

    await this.appendOrchestrationStep(
      input.threadId,
      traceId,
      "response_synthesis_started",
      "Synthesizing final response.",
    );

    const responseInput = {
      userMessage: userContent,
      ...(responseGoal ? { responseGoal } : {}),
      ...(socialContext ? { socialContext } : {}),
      multimodalContext: hasMultimodal
        ? {
            voiceTranscript: multimodalContext.voiceTranscript,
            attachments: multimodalContext.attachments,
          }
        : undefined,
      specialistOutputs: specialistOutputs as Record<string, unknown>,
      toolOutputs: toolResults.reduce(
        (acc, item, index) => {
          acc[`${item.role}:${item.tool}:${index}`] = {
            status: item.status,
            output: item.output,
            reason: item.reason,
          };
          return acc;
        },
        {} as Record<string, unknown>,
      ),
    };

    let streamedTokenChunkCount = 0;
    let streamTokenIndex = 0;
    let pendingStreamChunk = "";
    let lastStreamEmitAt = 0;

    const flushPendingStreamChunk = async (force = false) => {
      if (!streamResponseTokens || pendingStreamChunk.length === 0) {
        return;
      }
      const now = Date.now();
      if (
        !force &&
        pendingStreamChunk.length < 80 &&
        now - lastStreamEmitAt < 120
      ) {
        return;
      }
      const chunk = this.normalizeStreamChunk(pendingStreamChunk);
      pendingStreamChunk = "";
      if (!chunk) {
        return;
      }
      streamTokenIndex += 1;
      streamedTokenChunkCount = streamTokenIndex;
      lastStreamEmitAt = now;
      await this.appendOrchestrationStep(
        input.threadId,
        traceId,
        "response_token",
        chunk,
        {
          index: streamTokenIndex,
          source: "model_stream",
        },
      );
    };

    let responseText =
      preToolRisk.decision === "blocked"
        ? this.blockedByRiskResponse(preToolRisk.reasons)
        : ((await this.withTimeout(
            this.openai.composeConversationResponse(
              responseInput,
              traceId,
              streamResponseTokens
                ? {
                    onTextDelta: async (delta) => {
                      pendingStreamChunk += delta;
                      await flushPendingStreamChunk(false);
                    },
                  }
                : undefined,
            ),
            this.responseTimeoutMs,
            "conversation_response",
          )) ??
          "I’m here with you. I’m still syncing context, so share one more detail about timing or preferred format (1:1 or small group), and I’ll refine this right away.");

    if (responseText.includes("I’m here with you. I’m still syncing context")) {
      await this.appendOrchestrationStep(
        input.threadId,
        traceId,
        "response_degraded",
        "Response timed out; sent safe fallback reply.",
      );
    }

    if (streamResponseTokens) {
      await flushPendingStreamChunk(true);
    }

    const preSendRisk = this.assessRiskGate({
      content: responseText,
      surface: "agent_response",
      context: `trace:${traceId}`,
    });
    await this.appendOrchestrationStep(
      input.threadId,
      traceId,
      "risk_assessment_pre_send",
      `Risk check before response send: ${preSendRisk.decision}.`,
      {
        decision: preSendRisk.decision,
        score: preSendRisk.score,
        reasons: preSendRisk.reasons,
      },
    );
    await this.persistRiskAssessment({
      threadId: input.threadId,
      userId: input.userId,
      traceId,
      phase: "pre_send",
      assessedContent: responseText,
      assessment: preSendRisk,
    });

    if (preSendRisk.decision === "blocked") {
      responseText = this.blockedByRiskResponse(preSendRisk.reasons);
      await this.appendOrchestrationStep(
        input.threadId,
        traceId,
        "response_sanitized",
        "Response replaced by safety fallback.",
        {
          reason: "blocked_by_risk_assessment",
          riskReasons: preSendRisk.reasons,
        },
      );
    } else if (preSendRisk.decision === "review") {
      responseText = this.reviewConstrainedResponse(responseText);
      await this.appendOrchestrationStep(
        input.threadId,
        traceId,
        "response_sanitized",
        "Response constrained by review guardrail.",
        {
          reason: "review_constrained",
          riskReasons: preSendRisk.reasons,
        },
      );
    }

    if (streamResponseTokens && streamedTokenChunkCount === 0) {
      streamedTokenChunkCount = await this.streamResponseTokenChunks(
        input.threadId,
        traceId,
        responseText,
      );
    }

    const agentMessage = await this.agentService.createAgentMessage(
      input.threadId,
      responseText,
    );

    await this.appendOrchestrationStep(
      input.threadId,
      traceId,
      "turn_completed",
      "Agentic turn completed.",
      {
        specialists,
        specialistNotes,
        riskChecks: {
          preTool: preToolRisk,
          preSend: preSendRisk,
        },
        streamResponseTokens,
        streamedTokenChunkCount,
        toolResults: toolResults.map((result) => ({
          role: result.role,
          tool: result.tool,
          status: result.status,
          reason: result.reason,
        })),
      },
    );

    return {
      traceId,
      userMessageId: userMessage.id,
      agentMessageId: agentMessage.id,
      plan: {
        specialists,
        toolCalls: toolCalls.map((call) => ({
          role: call.role,
          tool: call.tool,
        })),
        responseGoal,
      },
      toolResults,
      specialistNotes,
      streaming: {
        responseTokenStreamed: streamResponseTokens,
        chunkCount: streamedTokenChunkCount,
      },
    };
  }

  private async buildSocialContextPacket(input: {
    userId: string;
    threadId: string;
    existingMessageCount: number;
  }): Promise<SocialContextPacket> {
    const globalRuleKeys = [
      "global_rules_intent_mode",
      "global_rules_modality",
      "global_rules_reachable",
      "global_rules_notification_mode",
      "global_rules_memory_mode",
      "global_rules_timezone",
    ];

    const [user, profile, interests, preferences, thread, retrievalDocs] =
      await Promise.all([
        this.prisma.user.findUnique({
          where: { id: input.userId },
          select: {
            displayName: true,
          },
        }),
        this.prisma.userProfile.findUnique({
          where: { userId: input.userId },
          select: {
            bio: true,
            city: true,
            country: true,
            onboardingState: true,
            availabilityMode: true,
          },
        }),
        this.prisma.userInterest.findMany({
          where: { userId: input.userId },
          orderBy: [{ createdAt: "desc" }],
          take: 8,
          select: {
            label: true,
            kind: true,
          },
        }),
        this.prisma.userPreference.findMany({
          where: {
            userId: input.userId,
            key: { in: globalRuleKeys },
          },
          select: {
            key: true,
            value: true,
          },
        }),
        this.prisma.agentThread.findUnique({
          where: { id: input.threadId },
          select: {
            title: true,
            createdAt: true,
          },
        }),
        this.prisma.retrievalDocument.findMany({
          where: {
            userId: input.userId,
            docType: {
              in: ["profile_summary", "preference_memory"],
            },
          },
          orderBy: [{ createdAt: "desc" }],
          take: 2,
          select: {
            docType: true,
            content: true,
          },
        }),
      ]);

    const prefMap = new Map(preferences.map((pref) => [pref.key, pref.value]));
    const readStringPref = (key: string, fallback: string) => {
      const value = prefMap.get(key);
      return typeof value === "string" && value.trim().length > 0
        ? value
        : fallback;
    };
    const memoryHighlights = retrievalDocs
      .map((doc) => this.toShortMemoryHighlight(doc.content))
      .filter((value): value is string => value.length > 0)
      .slice(0, 2);
    const goals = interests
      .filter((interest) => interest.kind.toLowerCase() !== "topic")
      .map((interest) => interest.label);

    return {
      freshOnboardingTurn: input.existingMessageCount <= 1,
      profile: {
        displayName: user?.displayName ?? null,
        bio: profile?.bio ?? null,
        city: profile?.city ?? null,
        country: profile?.country ?? null,
        onboardingState: profile?.onboardingState ?? null,
        availabilityMode: profile?.availabilityMode ?? null,
      },
      interests: interests
        .filter((interest) => interest.kind.toLowerCase() === "topic")
        .map((interest) => interest.label),
      goals,
      preferences: {
        intentMode: readStringPref("global_rules_intent_mode", "balanced"),
        modality: readStringPref("global_rules_modality", "either"),
        reachable: readStringPref("global_rules_reachable", "always"),
        notificationMode: readStringPref(
          "global_rules_notification_mode",
          "immediate",
        ),
        memoryMode: readStringPref("global_rules_memory_mode", "standard"),
        timezone: readStringPref("global_rules_timezone", "UTC"),
      },
      thread: {
        title: thread?.title ?? null,
        ageMinutes: thread?.createdAt
          ? Math.max(
              0,
              Math.round((Date.now() - thread.createdAt.getTime()) / 60_000),
            )
          : null,
        existingMessageCount: input.existingMessageCount,
      },
      memoryHighlights,
    };
  }

  private toShortMemoryHighlight(content: string) {
    const normalized = content.replace(/\s+/g, " ").trim();
    if (!normalized) {
      return "";
    }
    return normalized.length <= 160
      ? normalized
      : `${normalized.slice(0, 157)}...`;
  }

  private async withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    task: "conversation_planning" | "conversation_response",
  ): Promise<T | null> {
    let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
    try {
      const timeoutPromise = new Promise<null>((resolve) => {
        timeoutHandle = setTimeout(() => resolve(null), timeoutMs);
      });
      const result = await Promise.race([promise, timeoutPromise]);
      if (result === null) {
        this.logger.warn(
          JSON.stringify({
            event: "agentic.timeout",
            task,
            timeoutMs,
            reason: "deadline_exceeded",
          }),
        );
      }
      return result as T | null;
    } finally {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
    }
  }

  private async executeToolCall(
    threadId: string,
    userId: string,
    traceId: string,
    call: ConversationToolCall,
  ): Promise<ConversationToolResult> {
    if (!canAgentUseTool(call.role, call.tool)) {
      this.logger.warn(
        JSON.stringify({
          event: "agentic.tool_denied",
          traceId,
          role: call.role,
          tool: call.tool,
          reason: "tool_not_allowed_for_role",
        }),
      );
      return {
        role: call.role,
        tool: call.tool,
        status: "denied",
        reason: "tool_not_allowed_for_role",
      };
    }

    const requestedActionRaw = this.readString(
      call.input.actionType ?? call.input.action,
    );
    if (requestedActionRaw) {
      const actionType = this.readActionType(requestedActionRaw);
      if (!actionType) {
        this.logger.warn(
          JSON.stringify({
            event: "agentic.tool_denied",
            traceId,
            role: call.role,
            tool: call.tool,
            reason: "invalid_action_type",
            actionType: requestedActionRaw,
          }),
        );
        return {
          role: call.role,
          tool: call.tool,
          status: "denied",
          reason: "invalid_action_type",
        };
      }

      const riskLevel = this.readRiskLevel(call.input.riskLevel);
      const actionCheck = this.assertActionAllowedForRole(
        call.role,
        actionType,
        riskLevel,
      );
      if (!actionCheck.allowed) {
        const approvalCheckpoint =
          actionCheck.reason === "human_approval_required"
            ? await this.createHumanApprovalCheckpoint({
                threadId,
                userId,
                traceId,
                call,
                actionType,
                riskLevel,
              })
            : null;
        this.logger.warn(
          JSON.stringify({
            event: "agentic.action_blocked",
            traceId,
            role: call.role,
            tool: call.tool,
            actionType,
            riskLevel,
            reason: actionCheck.reason,
            checkpointId: approvalCheckpoint?.id ?? null,
          }),
        );
        return {
          role: call.role,
          tool: call.tool,
          status: "denied",
          reason: actionCheck.reason,
          ...(approvalCheckpoint
            ? {
                output: {
                  checkpointId: approvalCheckpoint.id,
                  status: approvalCheckpoint.status,
                },
              }
            : {}),
        };
      }
    }

    try {
      switch (call.tool) {
        case "workflow.read": {
          const maxMessages = this.readIntInRange(
            call.input.maxMessages,
            1,
            40,
            12,
          );
          const messages = await this.prisma.agentMessage.findMany({
            where: { threadId },
            orderBy: { createdAt: "desc" },
            take: maxMessages,
            select: {
              id: true,
              role: true,
              content: true,
              createdAt: true,
            },
          });
          return {
            role: call.role,
            tool: call.tool,
            status: "executed",
            output: messages.reverse(),
          };
        }
        case "workflow.write": {
          const content =
            typeof call.input.content === "string"
              ? call.input.content.slice(0, 500)
              : null;
          if (!content) {
            return {
              role: call.role,
              tool: call.tool,
              status: "failed",
              reason: "missing_workflow_content",
            };
          }
          await this.agentService.appendWorkflowUpdate(threadId, content, {
            traceId,
          });
          return {
            role: call.role,
            tool: call.tool,
            status: "executed",
            output: { written: true },
          };
        }
        case "intent.parse": {
          const text =
            typeof call.input.text === "string" &&
            call.input.text.trim().length > 0
              ? call.input.text
              : "";
          const parsed = await this.openai.parseIntent(text || "chat", traceId);
          return {
            role: call.role,
            tool: call.tool,
            status: "executed",
            output: parsed,
          };
        }
        case "moderation.review": {
          const content =
            typeof call.input.text === "string" &&
            call.input.text.trim().length > 0
              ? call.input.text
              : "";
          const moderation = await this.openai.assistModeration(
            { content: content || "empty" },
            traceId,
          );
          return {
            role: call.role,
            tool: call.tool,
            status: "executed",
            output: moderation,
          };
        }
        case "notification.compose": {
          const intentText =
            typeof call.input.intentText === "string" &&
            call.input.intentText.trim().length > 0
              ? call.input.intentText
              : "You have a new update.";
          const copy = await this.openai.composeNotificationCopy(
            {
              intentText,
              tone: this.readTone(call.input.tone),
              maxLength: this.readIntInRange(
                call.input.maxLength,
                20,
                220,
                160,
              ),
            },
            traceId,
          );
          return {
            role: call.role,
            tool: call.tool,
            status: "executed",
            output: { text: copy },
          };
        }
        case "personalization.retrieve": {
          const maxDocs = this.readIntInRange(call.input.maxDocs, 1, 10, 4);
          const cacheKey = `agent:personalization:${userId}:${maxDocs}`;
          const cachedDocuments = await this.appCacheService.getJson<
            Array<{
              id: string;
              docType: string;
              content: string;
              createdAt: string;
            }>
          >(cacheKey);
          const documents =
            cachedDocuments?.map((document) => ({
              ...document,
              createdAt: new Date(document.createdAt),
            })) ??
            (await this.prisma.retrievalDocument.findMany({
              where: { userId },
              orderBy: { createdAt: "desc" },
              take: maxDocs,
              select: {
                id: true,
                docType: true,
                content: true,
                createdAt: true,
              },
            }));
          if (!cachedDocuments) {
            await this.appCacheService.setJson(
              cacheKey,
              documents.map((document) => ({
                ...document,
                createdAt: document.createdAt.toISOString(),
              })),
              60,
            );
          }
          return {
            role: call.role,
            tool: call.tool,
            status: "executed",
            output: documents,
          };
        }
        case "availability.lookup": {
          if (!this.agentOutcomeToolsService) {
            return {
              role: call.role,
              tool: call.tool,
              status: "failed",
              reason: "agent_outcome_tools_unavailable",
            };
          }
          const candidateUserIds = Array.isArray(call.input.candidateUserIds)
            ? call.input.candidateUserIds.filter(
                (value): value is string =>
                  typeof value === "string" && value.trim().length > 0,
              )
            : [];
          const result = await this.agentOutcomeToolsService.lookupAvailability(
            {
              userId,
              candidateUserIds,
            },
          );
          return {
            role: call.role,
            tool: call.tool,
            status: "executed",
            output: result,
          };
        }
        case "candidate.search": {
          if (!this.agentOutcomeToolsService) {
            return {
              role: call.role,
              tool: call.tool,
              status: "failed",
              reason: "agent_outcome_tools_unavailable",
            };
          }
          const text =
            this.readString(call.input.text) ??
            this.readString(call.input.intentText) ??
            "";
          if (!text) {
            return {
              role: call.role,
              tool: call.tool,
              status: "failed",
              reason: "missing_search_text",
            };
          }
          const result = await this.agentOutcomeToolsService.searchCandidates({
            userId,
            traceId,
            text,
            take: this.readIntInRange(call.input.take, 1, 10, 5),
            widenOnScarcity:
              typeof call.input.widenOnScarcity === "boolean"
                ? call.input.widenOnScarcity
                : true,
            scarcityThreshold: this.readIntInRange(
              call.input.scarcityThreshold,
              1,
              10,
              2,
            ),
            parsedIntent: this.coerceParsedIntent(call.input.parsedIntent),
          });
          return {
            role: call.role,
            tool: call.tool,
            status: "executed",
            output: result,
          };
        }
        case "negotiation.evaluate": {
          if (!this.agentOutcomeToolsService) {
            return {
              role: call.role,
              tool: call.tool,
              status: "failed",
              reason: "agent_outcome_tools_unavailable",
            };
          }
          const packet = this.coerceNegotiationPacket(userId, call.input);
          if (!packet) {
            return {
              role: call.role,
              tool: call.tool,
              status: "failed",
              reason: "missing_negotiation_packet",
            };
          }
          const result =
            await this.agentOutcomeToolsService.evaluateNegotiation({
              userId,
              traceId,
              packet,
            });
          return {
            role: call.role,
            tool: call.tool,
            status: "executed",
            output: result,
          };
        }
        case "circle.search": {
          if (!this.agentOutcomeToolsService) {
            return {
              role: call.role,
              tool: call.tool,
              status: "failed",
              reason: "agent_outcome_tools_unavailable",
            };
          }
          const result = await this.agentOutcomeToolsService.searchCircles({
            userId,
            limit: this.readIntInRange(call.input.limit, 1, 5, 3),
          });
          return {
            role: call.role,
            tool: call.tool,
            status: "executed",
            output: result,
          };
        }
        case "group.plan": {
          if (!this.agentOutcomeToolsService) {
            return {
              role: call.role,
              tool: call.tool,
              status: "failed",
              reason: "agent_outcome_tools_unavailable",
            };
          }
          const text =
            this.readString(call.input.text) ??
            this.readString(call.input.intentText) ??
            "";
          if (!text) {
            return {
              role: call.role,
              tool: call.tool,
              status: "failed",
              reason: "missing_group_plan_text",
            };
          }
          const result = await this.agentOutcomeToolsService.planGroup({
            userId,
            threadId,
            traceId,
            text,
            groupSizeTarget: this.readIntInRange(
              call.input.groupSizeTarget,
              2,
              4,
              3,
            ),
          });
          return {
            role: call.role,
            tool: call.tool,
            status: "executed",
            output: result,
          };
        }
        case "intent.persist": {
          if (!this.agentOutcomeToolsService) {
            return {
              role: call.role,
              tool: call.tool,
              status: "failed",
              reason: "agent_outcome_tools_unavailable",
            };
          }
          const text =
            this.readString(call.input.text) ??
            this.readString(call.input.intentText) ??
            "";
          if (!text) {
            return {
              role: call.role,
              tool: call.tool,
              status: "failed",
              reason: "missing_intent_text",
            };
          }
          const result = await this.agentOutcomeToolsService.persistIntent({
            userId,
            threadId,
            traceId,
            text,
          });
          return {
            role: call.role,
            tool: call.tool,
            status: "executed",
            output: result,
          };
        }
        case "intro.send_request": {
          if (!this.agentOutcomeToolsService) {
            return {
              role: call.role,
              tool: call.tool,
              status: "failed",
              reason: "agent_outcome_tools_unavailable",
            };
          }
          const intentId = this.readString(call.input.intentId);
          const recipientUserId = this.readString(call.input.recipientUserId);
          if (!intentId || !recipientUserId) {
            return {
              role: call.role,
              tool: call.tool,
              status: "failed",
              reason: "missing_intro_request_fields",
            };
          }
          const result = await this.agentOutcomeToolsService.sendIntroRequest({
            intentId,
            recipientUserId,
            traceId,
            threadId,
          });
          return {
            role: call.role,
            tool: call.tool,
            status: "executed",
            output: result,
          };
        }
        case "intro.accept": {
          if (!this.agentOutcomeToolsService) {
            return {
              role: call.role,
              tool: call.tool,
              status: "failed",
              reason: "agent_outcome_tools_unavailable",
            };
          }
          const requestId = this.readString(call.input.requestId);
          if (!requestId) {
            return {
              role: call.role,
              tool: call.tool,
              status: "failed",
              reason: "missing_request_id",
            };
          }
          const result = await this.agentOutcomeToolsService.acceptIntro({
            requestId,
            actorUserId: userId,
          });
          return {
            role: call.role,
            tool: call.tool,
            status: "executed",
            output: result,
          };
        }
        case "intro.reject": {
          if (!this.agentOutcomeToolsService) {
            return {
              role: call.role,
              tool: call.tool,
              status: "failed",
              reason: "agent_outcome_tools_unavailable",
            };
          }
          const requestId = this.readString(call.input.requestId);
          if (!requestId) {
            return {
              role: call.role,
              tool: call.tool,
              status: "failed",
              reason: "missing_request_id",
            };
          }
          const result = await this.agentOutcomeToolsService.rejectIntro({
            requestId,
            actorUserId: userId,
          });
          return {
            role: call.role,
            tool: call.tool,
            status: "executed",
            output: result,
          };
        }
        case "intro.retract": {
          if (!this.agentOutcomeToolsService) {
            return {
              role: call.role,
              tool: call.tool,
              status: "failed",
              reason: "agent_outcome_tools_unavailable",
            };
          }
          const requestId = this.readString(call.input.requestId);
          if (!requestId) {
            return {
              role: call.role,
              tool: call.tool,
              status: "failed",
              reason: "missing_request_id",
            };
          }
          const result = await this.agentOutcomeToolsService.retractIntro({
            requestId,
            actorUserId: userId,
          });
          return {
            role: call.role,
            tool: call.tool,
            status: "executed",
            output: result,
          };
        }
        case "circle.create": {
          if (!this.agentOutcomeToolsService) {
            return {
              role: call.role,
              tool: call.tool,
              status: "failed",
              reason: "agent_outcome_tools_unavailable",
            };
          }
          const title = this.readString(call.input.title);
          if (!title) {
            return {
              role: call.role,
              tool: call.tool,
              status: "failed",
              reason: "missing_circle_title",
            };
          }
          const result = await this.agentOutcomeToolsService.createCircle({
            userId,
            title,
            description: this.readString(call.input.description) ?? undefined,
            kickoffPrompt:
              this.readString(call.input.kickoffPrompt) ?? undefined,
            topicTags: this.readStringArray(call.input.topicTags),
            targetSize: this.readIntInRange(call.input.targetSize, 2, 8, 4),
            timezone: this.readString(call.input.timezone) ?? undefined,
          });
          return {
            role: call.role,
            tool: call.tool,
            status: "executed",
            output: result,
          };
        }
        case "circle.join": {
          if (!this.agentOutcomeToolsService) {
            return {
              role: call.role,
              tool: call.tool,
              status: "failed",
              reason: "agent_outcome_tools_unavailable",
            };
          }
          const circleId = this.readString(call.input.circleId);
          const ownerUserId = this.readString(call.input.ownerUserId);
          if (!circleId || !ownerUserId) {
            return {
              role: call.role,
              tool: call.tool,
              status: "failed",
              reason: "missing_circle_join_fields",
            };
          }
          const result = await this.agentOutcomeToolsService.joinCircle({
            circleId,
            ownerUserId,
            userId,
            role:
              this.readString(call.input.role) === "admin" ? "admin" : "member",
          });
          return {
            role: call.role,
            tool: call.tool,
            status: "executed",
            output: result,
          };
        }
        case "profile.patch": {
          if (!this.agentOutcomeToolsService) {
            return {
              role: call.role,
              tool: call.tool,
              status: "failed",
              reason: "agent_outcome_tools_unavailable",
            };
          }
          const result = await this.agentOutcomeToolsService.patchProfile({
            userId,
            consentGranted: call.input.consentGranted === true,
            consentSource:
              this.readString(call.input.consentSource) ?? undefined,
            profile: this.coerceProfilePatch(call.input.profile),
            globalRules: this.coerceGlobalRulesPatch(call.input.globalRules),
          });
          return {
            role: call.role,
            tool: call.tool,
            status: "executed",
            output: result,
          };
        }
        case "conversation.start": {
          if (!this.agentOutcomeToolsService) {
            return {
              role: call.role,
              tool: call.tool,
              status: "failed",
              reason: "agent_outcome_tools_unavailable",
            };
          }
          const result = await this.agentOutcomeToolsService.startConversation({
            userId,
            title: this.readString(call.input.title) ?? undefined,
            initialMessage:
              this.readString(call.input.initialMessage) ?? undefined,
          });
          return {
            role: call.role,
            tool: call.tool,
            status: "executed",
            output: result,
          };
        }
        case "memory.write": {
          if (!this.agentOutcomeToolsService) {
            return {
              role: call.role,
              tool: call.tool,
              status: "failed",
              reason: "agent_outcome_tools_unavailable",
            };
          }
          const summary =
            this.readString(call.input.summary) ??
            this.readString(call.input.content) ??
            "";
          if (!summary) {
            return {
              role: call.role,
              tool: call.tool,
              status: "failed",
              reason: "missing_memory_summary",
            };
          }
          const result = await this.agentOutcomeToolsService.writeMemory({
            userId,
            summary,
            context: this.coerceRecord(call.input.context),
            topics: this.readStringArray(call.input.topics),
            activities: this.readStringArray(call.input.activities),
            traceId,
            workflowRunId:
              this.readString(call.input.workflowRunId) ?? undefined,
            memoryClass:
              this.readMemoryClass(call.input.memoryClass) ?? undefined,
            memoryKey: this.readString(call.input.memoryKey) ?? undefined,
            memoryValue: this.readString(call.input.memoryValue) ?? undefined,
            confidence: this.readNumber(call.input.confidence),
            safeWritePolicy:
              this.readMemorySafeWritePolicy(call.input.safeWritePolicy) ??
              undefined,
            contradictionPolicy:
              this.readMemoryContradictionPolicy(
                call.input.contradictionPolicy,
              ) ?? undefined,
          });
          return {
            role: call.role,
            tool: call.tool,
            status: "executed",
            output: result,
          };
        }
        case "followup.schedule": {
          if (!this.agentOutcomeToolsService) {
            return {
              role: call.role,
              tool: call.tool,
              status: "failed",
              reason: "agent_outcome_tools_unavailable",
            };
          }
          const result = await this.agentOutcomeToolsService.scheduleFollowup({
            userId,
            title: this.readString(call.input.title) ?? undefined,
            summary:
              this.readString(call.input.summary) ??
              this.readString(call.input.description) ??
              undefined,
            timezone: this.readString(call.input.timezone) ?? undefined,
            deliveryMode: this.readDeliveryMode(call.input.deliveryMode),
            schedule: this.coerceSchedule(call.input.schedule),
          });
          return {
            role: call.role,
            tool: call.tool,
            status: "executed",
            output: result,
          };
        }
        case "ranking.explain": {
          const candidateUserId =
            typeof call.input.candidateUserId === "string"
              ? call.input.candidateUserId
              : userId;
          const score =
            typeof call.input.score === "number" &&
            Number.isFinite(call.input.score)
              ? call.input.score
              : 0.5;
          const features = this.coerceFeatures(call.input.features);
          const explanation = await this.openai.explainRanking(
            {
              candidateUserId,
              score,
              features,
              blockedByPolicy:
                typeof call.input.blockedByPolicy === "boolean"
                  ? call.input.blockedByPolicy
                  : false,
            },
            traceId,
          );
          return {
            role: call.role,
            tool: call.tool,
            status: "executed",
            output: explanation,
          };
        }
      }
    } catch (error) {
      this.logger.warn(
        JSON.stringify({
          event: "agentic.tool_failed",
          traceId,
          role: call.role,
          tool: call.tool,
          error:
            error instanceof Error ? error.message : "tool_execution_failed",
        }),
      );
      return {
        role: call.role,
        tool: call.tool,
        status: "failed",
        reason:
          error instanceof Error ? error.message : "tool_execution_failed",
      };
    }
  }

  private async executeToolCallWithLifecycle(input: {
    threadId: string;
    userId: string;
    traceId: string;
    call: ConversationToolCall;
    preToolRiskDecision: ModerationGateResult["decision"];
    delegatedSpecialistSet: Set<OpenAIAgentRole>;
  }) {
    const { call, delegatedSpecialistSet, preToolRiskDecision, threadId } =
      input;

    if (preToolRiskDecision === "blocked") {
      const deniedResult: ConversationToolResult = {
        role: call.role,
        tool: call.tool,
        status: "denied",
        reason: "blocked_by_risk_assessment",
      };
      await this.appendOrchestrationStep(
        threadId,
        input.traceId,
        "tool_finished",
        `Tool ${call.tool} denied by risk gate.`,
        {
          role: call.role,
          tool: call.tool,
          status: "denied",
          reason: "blocked_by_risk_assessment",
        },
      );
      return deniedResult;
    }

    if (
      preToolRiskDecision === "review" &&
      this.isRiskSensitiveTool(call.tool)
    ) {
      const deniedResult: ConversationToolResult = {
        role: call.role,
        tool: call.tool,
        status: "denied",
        reason: "review_restricted_tool",
      };
      await this.appendOrchestrationStep(
        threadId,
        input.traceId,
        "tool_finished",
        `Tool ${call.tool} blocked while under review gate.`,
        {
          role: call.role,
          tool: call.tool,
          status: "denied",
          reason: "review_restricted_tool",
        },
      );
      return deniedResult;
    }

    await this.appendOrchestrationStep(
      threadId,
      input.traceId,
      "tool_started",
      `Running tool ${call.tool} as ${call.role}.`,
      { role: call.role, tool: call.tool },
    );

    if (call.role !== "manager" && !delegatedSpecialistSet.has(call.role)) {
      this.logger.warn(
        JSON.stringify({
          event: "agentic.tool_denied",
          traceId: input.traceId,
          role: call.role,
          tool: call.tool,
          reason: "tool_role_not_handed_off",
        }),
      );
      const deniedResult: ConversationToolResult = {
        role: call.role,
        tool: call.tool,
        status: "denied",
        reason: "tool_role_not_handed_off",
      };
      await this.appendOrchestrationStep(
        threadId,
        input.traceId,
        "tool_finished",
        `Tool ${call.tool} denied for ${call.role}.`,
        {
          role: call.role,
          tool: call.tool,
          status: "denied",
          reason: "tool_role_not_handed_off",
        },
      );
      return deniedResult;
    }

    const toolResult = await this.executeToolCall(
      threadId,
      input.userId,
      input.traceId,
      call,
    );
    await this.appendOrchestrationStep(
      threadId,
      input.traceId,
      "tool_finished",
      `Tool ${call.tool} ${toolResult.status} for ${call.role}.`,
      {
        role: call.role,
        tool: call.tool,
        status: toolResult.status,
        reason: toolResult.reason,
      },
    );
    await this.recordToolActionVisibility({
      threadId,
      userId: input.userId,
      traceId: input.traceId,
      call,
      toolResult,
    });
    return toolResult;
  }

  private async runSpecialist(
    specialist: OpenAIAgentRole,
    content: string,
    traceId: string,
    toolResults: ConversationToolResult[],
  ) {
    switch (specialist) {
      case "intent_parser": {
        return this.openai.parseIntent(content, traceId);
      }
      case "moderation_assistant": {
        return this.openai.assistModeration({ content }, traceId);
      }
      case "notification_copy": {
        const text = await this.openai.composeNotificationCopy(
          {
            intentText: content,
            tone: "neutral",
            maxLength: 180,
          },
          traceId,
        );
        return { text };
      }
      case "personalization_interpreter": {
        const docs = toolResults.find(
          (item) =>
            item.status === "executed" &&
            item.tool === "personalization.retrieve" &&
            Array.isArray(item.output),
        )?.output as Array<{ docType?: string }> | undefined;
        return {
          hasContext: Boolean(docs && docs.length > 0),
          docCount: docs?.length ?? 0,
          docTypes: docs?.map((doc) => doc.docType ?? "unknown") ?? [],
        };
      }
      case "ranking_explanation": {
        return this.openai.explainRanking(
          {
            candidateUserId: randomUUID(),
            score: 0.62,
            features: {
              semanticFit: 0.74,
              personalizationBoost: 0.58,
              safetyPenalty: 0,
            },
            blockedByPolicy: false,
          },
          traceId,
        );
      }
      case "manager": {
        return { skipped: true };
      }
    }
  }

  private async runSpecialistWithLifecycle(input: {
    threadId: string;
    traceId: string;
    specialist: OpenAIAgentRole;
    userContent: string;
    toolResults: ConversationToolResult[];
  }) {
    await this.appendOrchestrationStep(
      input.threadId,
      input.traceId,
      "specialist_started",
      `Running specialist ${input.specialist}.`,
      { specialist: input.specialist },
    );
    try {
      const output = await this.runSpecialist(
        input.specialist,
        input.userContent,
        input.traceId,
        input.toolResults,
      );
      await this.appendOrchestrationStep(
        input.threadId,
        input.traceId,
        "specialist_finished",
        `Specialist ${input.specialist} completed.`,
        { specialist: input.specialist, status: "executed" },
      );
      return {
        specialist: input.specialist,
        status: "executed" as const,
        output,
      };
    } catch (error) {
      this.logger.warn(
        JSON.stringify({
          event: "agentic.specialist_failed",
          traceId: input.traceId,
          specialist: input.specialist,
          error:
            error instanceof Error
              ? error.message
              : "specialist_failed_unknown",
        }),
      );
      await this.appendOrchestrationStep(
        input.threadId,
        input.traceId,
        "specialist_finished",
        `Specialist ${input.specialist} failed.`,
        {
          specialist: input.specialist,
          status: "failed",
          error:
            error instanceof Error
              ? error.message
              : "specialist_failed_unknown",
        },
      );
      return {
        specialist: input.specialist,
        status: "failed" as const,
      };
    }
  }

  private buildMultimodalContext(input: {
    voiceTranscript?: string;
    attachments?: AgentAttachmentInput[];
  }) {
    const voiceTranscript = this.readString(input.voiceTranscript) ?? "";
    const attachments = (input.attachments ?? [])
      .slice(0, 8)
      .map((attachment) => {
        if (attachment.kind === "image_url") {
          return {
            kind: "image_url" as const,
            url: attachment.url.slice(0, 2048),
            caption: this.readString(attachment.caption) ?? undefined,
          };
        }
        return {
          kind: "file_ref" as const,
          fileId: attachment.fileId.slice(0, 255),
          caption: this.readString(attachment.caption) ?? undefined,
        };
      });

    return {
      voiceTranscript,
      attachments,
    };
  }

  private buildUserContentForTurn(
    rawContent: string,
    ctx: { voiceTranscript: string; attachments: AgentAttachmentInput[] },
  ) {
    const content = rawContent.trim();
    const blocks: string[] = [content];
    if (ctx.voiceTranscript.length > 0) {
      blocks.push(`[Voice transcript]\n${ctx.voiceTranscript}`);
    }
    for (const attachment of ctx.attachments) {
      if (attachment.kind === "image_url") {
        blocks.push(
          `[Attached image${attachment.caption ? `: ${attachment.caption}` : ""}]\nURL: ${attachment.url}`,
        );
      } else {
        blocks.push(
          `[Attached file${attachment.caption ? `: ${attachment.caption}` : ""}]\nfileId: ${attachment.fileId}`,
        );
      }
    }
    return blocks.join("\n\n").slice(0, 8_000);
  }

  private buildThreadSummary(
    messages: Array<{
      role: string;
      content: string;
      metadata?: unknown;
    }>,
  ) {
    return messages
      .reverse()
      .map((message) => {
        const multimodal = this.readThreadMessageMultimodalMetadata(
          message.metadata,
        );
        if (!multimodal) {
          return `[${message.role}] ${message.content}`;
        }
        return `[${message.role}] ${message.content}${multimodal}`;
      })
      .join("\n")
      .slice(0, 8_000);
  }

  private readThreadMessageMultimodalMetadata(metadata: unknown) {
    if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
      return "";
    }
    const multimodal = (metadata as { multimodal?: unknown }).multimodal;
    if (
      !multimodal ||
      typeof multimodal !== "object" ||
      Array.isArray(multimodal)
    ) {
      return "";
    }
    const voiceTranscript = this.readString(
      (multimodal as { voiceTranscript?: unknown }).voiceTranscript,
    );
    const attachments = Array.isArray(
      (multimodal as { attachments?: unknown }).attachments,
    )
      ? ((multimodal as { attachments?: unknown }).attachments as unknown[])
      : [];
    const attachmentSummary = attachments
      .map((attachment) => this.summarizeAttachment(attachment))
      .filter((entry) => entry.length > 0)
      .join(", ");

    const summaryParts = [
      voiceTranscript ? `voice="${voiceTranscript.slice(0, 120)}"` : null,
      attachmentSummary ? `attachments=${attachmentSummary}` : null,
    ].filter((entry): entry is string => Boolean(entry));

    return summaryParts.length > 0
      ? ` [multimodal ${summaryParts.join(" ")}]`
      : "";
  }

  private summarizeAttachment(attachment: unknown) {
    if (
      !attachment ||
      typeof attachment !== "object" ||
      Array.isArray(attachment)
    ) {
      return "";
    }
    const value = attachment as {
      kind?: unknown;
      url?: unknown;
      fileId?: unknown;
      caption?: unknown;
    };
    if (value.kind === "image_url" && typeof value.url === "string") {
      const caption = this.readString(value.caption);
      return caption ? `image:${caption.slice(0, 60)}` : "image";
    }
    if (value.kind === "file_ref" && typeof value.fileId === "string") {
      const caption = this.readString(value.caption);
      return caption ? `file:${caption.slice(0, 60)}` : "file";
    }
    return "";
  }

  private normalizeStreamChunk(value: string) {
    return value.replace(/\s+/g, " ").trim().slice(0, 240);
  }

  private async createHumanApprovalCheckpoint(input: {
    threadId: string;
    userId: string;
    traceId: string;
    call: ConversationToolCall;
    actionType: AgentActionType;
    riskLevel: "low" | "medium" | "high";
  }) {
    const checkpoint = await this.prisma.agentPlanCheckpoint.create({
      data: {
        threadId: input.threadId,
        userId: input.userId,
        traceId: input.traceId,
        requestedByRole: input.call.role,
        tool: input.call.tool,
        actionType: input.actionType,
        riskLevel: input.riskLevel,
        status: "pending",
        requestMetadata: input.call.input as Prisma.InputJsonValue,
      },
    });

    await this.agentService.appendWorkflowUpdate(
      input.threadId,
      `Approval needed for ${input.actionType.replaceAll("_", " ")} (${input.riskLevel} risk).`,
      {
        category: "plan_checkpoint",
        traceId: input.traceId,
        checkpointId: checkpoint.id,
        actionType: input.actionType,
        riskLevel: input.riskLevel,
        stage: "approval_checkpoint_created",
      },
    );

    return checkpoint;
  }

  private isRiskSensitiveTool(tool: AgentTool) {
    return (
      tool === "intent.parse" ||
      tool === "group.plan" ||
      tool === "intent.persist" ||
      tool === "negotiation.evaluate" ||
      tool === "intro.send_request" ||
      tool === "intro.accept" ||
      tool === "intro.reject" ||
      tool === "intro.retract" ||
      tool === "circle.create" ||
      tool === "circle.join" ||
      tool === "profile.patch" ||
      tool === "memory.write" ||
      tool === "followup.schedule" ||
      tool === "workflow.write" ||
      tool === "notification.compose"
    );
  }

  private async recordToolActionVisibility(input: {
    threadId: string;
    userId: string;
    traceId: string;
    call: ConversationToolCall;
    toolResult: ConversationToolResult;
  }) {
    if (!this.isVisibleSocialActionTool(input.call.tool)) {
      return;
    }

    const actionSummary = this.buildToolActionSummary(
      input.call.tool,
      input.toolResult,
    );

    if (actionSummary) {
      await this.agentService.appendWorkflowUpdate(
        input.threadId,
        actionSummary,
        {
          category: "agent_tool_action",
          traceId: input.traceId,
          role: input.call.role,
          tool: input.call.tool,
          status: input.toolResult.status,
          output: this.compactToolActionOutput(input.toolResult.output),
        },
      );
    }

    if (!this.prisma.auditLog?.create) {
      if (!this.analyticsService) {
        return;
      }
    }

    const compactOutput = this.compactToolActionOutput(input.toolResult.output);

    if (this.prisma.auditLog?.create) {
      await this.prisma.auditLog.create({
        data: {
          actorUserId: input.userId,
          actorType: "user",
          action: "agent.tool_action_executed",
          entityType: "agent_thread",
          entityId: input.threadId,
          metadata: {
            traceId: input.traceId,
            role: input.call.role,
            tool: input.call.tool,
            status: input.toolResult.status,
            reason: input.toolResult.reason ?? null,
            input: input.call.input,
            output: compactOutput,
            summary: actionSummary,
          } as Prisma.InputJsonValue,
        },
      });
    }

    await this.analyticsService?.trackEvent({
      eventType: "agent_social_action",
      actorUserId: input.userId,
      entityType: "agent_thread",
      entityId: input.threadId,
      properties: {
        traceId: input.traceId,
        role: input.call.role,
        tool: input.call.tool,
        status: input.toolResult.status,
        reason: input.toolResult.reason ?? null,
        summary: actionSummary,
        ...this.extractToolTelemetryProperties(compactOutput),
      },
    });
  }

  private extractToolTelemetryProperties(output: unknown) {
    if (!output || typeof output !== "object" || Array.isArray(output)) {
      return {};
    }

    const value = output as Record<string, unknown>;
    return {
      requestId: this.readTelemetryString(value.requestId),
      intentId: this.readTelemetryString(value.intentId),
      circleId: this.readTelemetryString(value.circleId),
      taskId: this.readTelemetryString(value.taskId),
      threadId: this.readTelemetryString(value.threadId),
      sent: this.readTelemetryBoolean(value.sent),
      accepted: this.readTelemetryBoolean(value.accepted),
      rejected: this.readTelemetryBoolean(value.rejected),
      retracted: this.readTelemetryBoolean(value.retracted),
      created: this.readTelemetryBoolean(value.created),
      joined: this.readTelemetryBoolean(value.joined),
      patched: this.readTelemetryBoolean(value.patched),
      scheduled: this.readTelemetryBoolean(value.scheduled),
      persisted: this.readTelemetryBoolean(value.persisted),
      planned: this.readTelemetryBoolean(value.planned),
      statusDetail: this.readTelemetryString(value.status),
      decision: this.readTelemetryString(value.decision),
      confidence: this.readTelemetryNumber(value.confidence),
      domain: this.readTelemetryString(value.domain),
      mode: this.readTelemetryString(value.mode),
      evaluated: this.readTelemetryBoolean(value.evaluated),
    };
  }

  private readTelemetryString(value: unknown) {
    return typeof value === "string" ? value : null;
  }

  private readTelemetryBoolean(value: unknown) {
    return typeof value === "boolean" ? value : null;
  }

  private readTelemetryNumber(value: unknown) {
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  }

  private isVisibleSocialActionTool(tool: AgentTool) {
    return (
      tool === "intent.persist" ||
      tool === "group.plan" ||
      tool === "negotiation.evaluate" ||
      tool === "intro.send_request" ||
      tool === "intro.accept" ||
      tool === "intro.reject" ||
      tool === "intro.retract" ||
      tool === "circle.create" ||
      tool === "circle.join" ||
      tool === "profile.patch" ||
      tool === "followup.schedule"
    );
  }

  private buildToolActionSummary(
    tool: AgentTool,
    result: ConversationToolResult,
  ) {
    if (result.status !== "executed") {
      return `Social action ${tool} ${result.status}.`;
    }

    const output =
      result.output && typeof result.output === "object"
        ? (result.output as Record<string, unknown>)
        : {};

    switch (tool) {
      case "intent.persist":
        return typeof output.intentId === "string"
          ? `Saved a social intent for follow-through (${output.intentId}).`
          : "Saved a social intent for follow-through.";
      case "group.plan":
        return typeof output.groupSizeTarget === "number"
          ? `Created a group plan targeting ${output.groupSizeTarget} people.`
          : "Created a group plan for this social goal.";
      case "negotiation.evaluate":
        return typeof output.decision === "string"
          ? `Negotiation decision: ${output.decision.replaceAll("_", " ")}.`
          : "Completed a bounded negotiation evaluation.";
      case "intro.send_request":
        return typeof output.requestId === "string"
          ? `Sent an intro request (${output.requestId}).`
          : "Sent an intro request.";
      case "intro.accept":
        return typeof output.requestId === "string"
          ? `Accepted an intro request (${output.requestId}).`
          : "Accepted an intro request.";
      case "intro.reject":
        return typeof output.requestId === "string"
          ? `Rejected an intro request (${output.requestId}).`
          : "Rejected an intro request.";
      case "intro.retract":
        return typeof output.requestId === "string"
          ? `Retracted a pending intro request (${output.requestId}).`
          : "Retracted a pending intro request.";
      case "circle.create":
        return typeof output.title === "string"
          ? `Created the recurring circle "${output.title}".`
          : "Created a recurring circle.";
      case "circle.join":
        return typeof output.circleId === "string"
          ? `Joined recurring circle ${output.circleId}.`
          : "Joined a recurring circle.";
      case "profile.patch":
        return output.patched === true
          ? "Saved updated profile defaults for future planning."
          : "Profile patch was not applied.";
      case "followup.schedule":
        return typeof output.taskId === "string"
          ? `Scheduled a follow-up task (${output.taskId}).`
          : "Scheduled a follow-up task.";
      default:
        return `Completed social action ${tool}.`;
    }
  }

  private compactToolActionOutput(output: unknown) {
    if (!output || typeof output !== "object") {
      return output ?? null;
    }

    const record = output as Record<string, unknown>;
    const allowedKeys = [
      "intentId",
      "requestId",
      "circleId",
      "taskId",
      "threadId",
      "title",
      "status",
      "groupSizeTarget",
      "decision",
      "confidence",
      "domain",
      "mode",
      "evaluated",
      "queued",
      "nextRunAt",
      "nextSessionAt",
      "patched",
      "consentSource",
      "joined",
      "created",
      "planned",
      "persisted",
      "sent",
      "accepted",
      "rejected",
      "retracted",
      "scheduled",
    ];
    return allowedKeys.reduce<Record<string, unknown>>((acc, key) => {
      if (record[key] !== undefined) {
        acc[key] = record[key];
      }
      return acc;
    }, {});
  }

  private assessRiskGate(input: {
    content: string;
    surface: string;
    context?: string;
  }): ModerationGateResult {
    if (this.moderationService) {
      const assessed = this.moderationService.assessContentRisk({
        content: input.content,
        context: input.context,
        surface: input.surface,
      });
      return {
        decision: assessed.decision,
        score: assessed.score,
        reasons: assessed.reasons,
      };
    }

    const normalized = input.content.toLowerCase();
    const blockedTerms = ["kill yourself", "bomb threat", "terror attack"];
    const reviewTerms = ["weapon meetup", "buy drugs", "illegal deal", "scam"];
    if (blockedTerms.some((term) => normalized.includes(term))) {
      return {
        decision: "blocked",
        score: 1,
        reasons: ["fallback_blocked_term_match"],
      };
    }
    if (reviewTerms.some((term) => normalized.includes(term))) {
      return {
        decision: "review",
        score: 0.65,
        reasons: ["fallback_review_term_match"],
      };
    }
    return {
      decision: "clean",
      score: 0,
      reasons: ["fallback_no_risk_signal"],
    };
  }

  private blockedByRiskResponse(reasons: string[]) {
    return [
      "I can’t help with that request.",
      "If you want, I can help you reframe it into a safe social plan that still gets you moving.",
      `Reference: ${reasons[0] ?? "policy_guardrail"}.`,
    ].join(" ");
  }

  private reviewConstrainedResponse(responseText: string) {
    const normalized = responseText.trim();
    if (normalized.length === 0) {
      return "I can still help in a safe way. Share your timing, format (1:1 or small group), and whether this is online or in person.";
    }
    return `${normalized.slice(0, 500)}\n\nI can continue once the request stays within safety policy.`;
  }

  private async persistRiskAssessment(input: {
    threadId: string;
    userId: string;
    traceId: string;
    phase: "pre_tools" | "pre_send";
    assessedContent: string;
    assessment: ModerationGateResult;
  }) {
    if (input.assessment.decision === "clean") {
      return;
    }
    try {
      const reasonToken = this.normalizeRiskReasonToken(
        input.assessment.reasons[0] ?? "policy_guardrail",
      );
      const reason =
        `agent_${input.phase}_${input.assessment.decision}:${reasonToken}`.slice(
          0,
          240,
        );

      let moderationFlagId: string | null = null;
      if (this.prisma.moderationFlag?.create) {
        const createdFlag = await this.prisma.moderationFlag.create({
          data: {
            entityType: "agent_thread",
            entityId: input.threadId,
            reason,
            status: "open",
          },
          select: {
            id: true,
          },
        });
        moderationFlagId = createdFlag.id;
      }

      if (this.prisma.auditLog?.create) {
        await this.prisma.auditLog.create({
          data: {
            actorUserId: null,
            actorType: "system",
            action: "moderation.agent_risk_assessed",
            entityType: "agent_thread",
            entityId: input.threadId,
            metadata: {
              traceId: input.traceId,
              userId: input.userId,
              phase: input.phase,
              decision: input.assessment.decision,
              score: input.assessment.score,
              reasons: input.assessment.reasons,
              contentExcerpt: this.makeRiskContentExcerpt(
                input.assessedContent,
              ),
              moderationFlagId,
            } as Prisma.InputJsonValue,
          },
        });
      }
    } catch (error) {
      this.logger.warn(
        JSON.stringify({
          event: "moderation.agent_risk_persist_failed",
          traceId: input.traceId,
          phase: input.phase,
          decision: input.assessment.decision,
          error:
            error instanceof Error
              ? error.message
              : "agent_risk_persist_failed",
        }),
      );
    }
  }

  private normalizeRiskReasonToken(value: string) {
    const normalized = value
      .toLowerCase()
      .replace(/[^a-z0-9:_-]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 96);
    return normalized.length > 0 ? normalized : "policy_guardrail";
  }

  private makeRiskContentExcerpt(value: string) {
    return value.replace(/\s+/g, " ").trim().slice(0, 240);
  }

  private coerceFeatures(
    value: unknown,
  ): Record<string, string | number | boolean> {
    if (!value || typeof value !== "object") {
      return { fallback: true };
    }
    return Object.entries(value as Record<string, unknown>).reduce(
      (acc, [key, entry]) => {
        if (
          typeof entry === "string" ||
          typeof entry === "number" ||
          typeof entry === "boolean"
        ) {
          acc[key] = entry;
        }
        return acc;
      },
      {} as Record<string, string | number | boolean>,
    );
  }

  private coerceRecord(value: unknown): Record<string, unknown> | undefined {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return undefined;
    }
    return value as Record<string, unknown>;
  }

  private readStringArray(value: unknown) {
    if (!Array.isArray(value)) {
      return undefined;
    }
    const items = value
      .map((entry) => this.readString(entry))
      .filter((entry): entry is string => Boolean(entry))
      .slice(0, 8);
    return items.length > 0 ? items : undefined;
  }

  private coerceParsedIntent(value: unknown):
    | {
        topics?: string[];
        activities?: string[];
        intentType?: string;
        modality?: string;
        timingConstraints?: string[];
        skillConstraints?: string[];
        vibeConstraints?: string[];
      }
    | undefined {
    const record = this.coerceRecord(value);
    if (!record) {
      return undefined;
    }
    return {
      topics: this.readStringArray(record.topics),
      activities: this.readStringArray(record.activities),
      intentType: this.readString(record.intentType) ?? undefined,
      modality: this.readString(record.modality) ?? undefined,
      timingConstraints: this.readStringArray(record.timingConstraints),
      skillConstraints: this.readStringArray(record.skillConstraints),
      vibeConstraints: this.readStringArray(record.vibeConstraints),
    };
  }

  private coerceNegotiationPacket(
    userId: string,
    value: Record<string, unknown>,
  ):
    | {
        id?: string;
        domain: "social" | "commerce";
        mode: "sync" | "async";
        intentSummary: string;
        requester: {
          userId: string;
          displayName?: string;
          country?: string;
          city?: string;
          languages: string[];
          trustScore?: number;
          availabilityMode?:
            | "now"
            | "later_today"
            | "flexible"
            | "away"
            | "invisible";
          objectives: string[];
          constraints: string[];
          itemInterests: string[];
          priceRange?: {
            min: number;
            max: number;
            currency?: string;
          };
        };
        counterpart: {
          userId?: string;
          displayName?: string;
          country?: string;
          city?: string;
          languages: string[];
          trustScore?: number;
          availabilityMode?:
            | "now"
            | "later_today"
            | "flexible"
            | "away"
            | "invisible";
          objectives: string[];
          constraints: string[];
          itemInterests: string[];
          askingPrice?: number;
          priceRange?: {
            min: number;
            max: number;
            currency?: string;
          };
        };
        policyFlags: Array<
          | "blocked"
          | "reported"
          | "under_review"
          | "trust_low"
          | "suspected_spam"
          | "unsafe_goods"
        >;
        metadata: Record<string, unknown>;
      }
    | undefined {
    const packetRecord = this.coerceRecord(value.packet) ?? value;
    if (!packetRecord) {
      return undefined;
    }

    const requesterRecord = this.coerceRecord(packetRecord.requester) ?? {};
    const counterpartRecord = this.coerceRecord(packetRecord.counterpart) ?? {};
    const intentSummary =
      this.readString(packetRecord.intentSummary) ??
      this.readString(packetRecord.text) ??
      this.readString(packetRecord.intentText) ??
      "";
    if (!intentSummary) {
      return undefined;
    }

    const domain = this.readNegotiationDomain(packetRecord.domain) ?? "social";
    const mode = this.readNegotiationMode(packetRecord.mode) ?? "async";
    const requesterPriceRange = this.coercePriceRange(
      requesterRecord.priceRange ?? packetRecord.requesterPriceRange,
    );
    const counterpartPriceRange = this.coercePriceRange(
      counterpartRecord.priceRange ?? packetRecord.counterpartPriceRange,
    );
    const counterpartTrust = this.readNumberInRange(
      counterpartRecord.trustScore ?? packetRecord.counterpartTrustScore,
      0,
      100,
    );
    const requesterTrust = this.readNumberInRange(
      requesterRecord.trustScore ?? packetRecord.requesterTrustScore,
      0,
      100,
    );
    const counterpartAskingPrice = this.readNumberInRange(
      counterpartRecord.askingPrice ?? packetRecord.askingPrice,
      0,
      100_000_000,
    );

    const policyFlags =
      this.readStringArray(packetRecord.policyFlags ?? value.policyFlags)
        ?.map((entry) => this.readNegotiationPolicyFlag(entry))
        .filter(
          (
            entry,
          ): entry is
            | "blocked"
            | "reported"
            | "under_review"
            | "trust_low"
            | "suspected_spam"
            | "unsafe_goods" => Boolean(entry),
        ) ?? [];

    return {
      id: this.readString(packetRecord.id) ?? undefined,
      domain,
      mode,
      intentSummary: intentSummary.slice(0, 500),
      requester: {
        userId,
        displayName: this.readString(requesterRecord.displayName) ?? undefined,
        country: this.readString(requesterRecord.country) ?? undefined,
        city: this.readString(requesterRecord.city) ?? undefined,
        languages: this.readStringArray(requesterRecord.languages) ?? [],
        trustScore: requesterTrust,
        availabilityMode:
          this.readAvailabilityMode(requesterRecord.availabilityMode) ??
          undefined,
        objectives: this.readStringArray(requesterRecord.objectives) ?? [],
        constraints: this.readStringArray(requesterRecord.constraints) ?? [],
        itemInterests:
          this.readStringArray(requesterRecord.itemInterests) ?? [],
        priceRange: requesterPriceRange,
      },
      counterpart: {
        userId:
          this.readString(counterpartRecord.userId) ??
          this.readString(packetRecord.candidateUserId) ??
          undefined,
        displayName:
          this.readString(counterpartRecord.displayName) ??
          this.readString(packetRecord.candidateDisplayName) ??
          undefined,
        country:
          this.readString(counterpartRecord.country) ??
          this.readString(packetRecord.candidateCountry) ??
          undefined,
        city:
          this.readString(counterpartRecord.city) ??
          this.readString(packetRecord.candidateCity) ??
          undefined,
        languages:
          this.readStringArray(counterpartRecord.languages) ??
          this.readStringArray(packetRecord.candidateLanguages) ??
          [],
        trustScore: counterpartTrust,
        availabilityMode:
          this.readAvailabilityMode(
            counterpartRecord.availabilityMode ??
              packetRecord.candidateAvailabilityMode,
          ) ?? undefined,
        objectives: this.readStringArray(counterpartRecord.objectives) ?? [],
        constraints: this.readStringArray(counterpartRecord.constraints) ?? [],
        itemInterests:
          this.readStringArray(counterpartRecord.itemInterests) ??
          this.readStringArray(packetRecord.candidateItemInterests) ??
          [],
        askingPrice: counterpartAskingPrice,
        priceRange: counterpartPriceRange,
      },
      policyFlags,
      metadata: this.coerceRecord(packetRecord.metadata) ?? {},
    };
  }

  private coercePriceRange(
    value: unknown,
  ): { min: number; max: number; currency?: string } | undefined {
    const record = this.coerceRecord(value);
    if (!record) {
      return undefined;
    }
    const min = this.readNumberInRange(record.min, 0, 100_000_000);
    const max = this.readNumberInRange(record.max, 0, 100_000_000);
    if (min === undefined || max === undefined || max < min) {
      return undefined;
    }
    return {
      min,
      max,
      currency: this.readString(record.currency) ?? undefined,
    };
  }

  private coerceProfilePatch(value: unknown):
    | {
        displayName?: string;
        bio?: string;
        city?: string;
        country?: string;
        visibility?: "public" | "limited" | "private";
        availabilityMode?:
          | "now"
          | "later_today"
          | "flexible"
          | "away"
          | "invisible";
      }
    | undefined {
    const record = this.coerceRecord(value);
    if (!record) {
      return undefined;
    }
    const visibility = this.readString(record.visibility);
    const availabilityMode = this.readString(record.availabilityMode);
    return {
      displayName: this.readString(record.displayName) ?? undefined,
      bio: this.readString(record.bio) ?? undefined,
      city: this.readString(record.city) ?? undefined,
      country: this.readString(record.country) ?? undefined,
      visibility:
        visibility === "public" ||
        visibility === "limited" ||
        visibility === "private"
          ? visibility
          : undefined,
      availabilityMode:
        availabilityMode === "now" ||
        availabilityMode === "later_today" ||
        availabilityMode === "flexible" ||
        availabilityMode === "away" ||
        availabilityMode === "invisible"
          ? availabilityMode
          : undefined,
    };
  }

  private coerceGlobalRulesPatch(value: unknown):
    | Partial<{
        whoCanContact: "anyone" | "verified_only" | "trusted_only";
        reachable: "always" | "available_only" | "do_not_disturb";
        intentMode: "one_to_one" | "group" | "balanced";
        modality: "online" | "offline" | "either";
        languagePreferences: string[];
        countryPreferences: string[];
        translationOptIn: boolean;
        requireVerifiedUsers: boolean;
        notificationMode: "immediate" | "digest" | "quiet";
        agentAutonomy: "manual" | "suggest_only" | "auto_non_risky";
        memoryMode: "minimal" | "standard" | "extended";
      }>
    | undefined {
    const record = this.coerceRecord(value);
    if (!record) {
      return undefined;
    }
    const whoCanContact = this.readString(record.whoCanContact);
    const reachable = this.readString(record.reachable);
    const intentMode = this.readString(record.intentMode);
    const modality = this.readString(record.modality);
    const notificationMode = this.readString(record.notificationMode);
    const agentAutonomy = this.readString(record.agentAutonomy);
    const memoryMode = this.readString(record.memoryMode);

    return {
      whoCanContact:
        whoCanContact === "anyone" ||
        whoCanContact === "verified_only" ||
        whoCanContact === "trusted_only"
          ? whoCanContact
          : undefined,
      reachable:
        reachable === "always" ||
        reachable === "available_only" ||
        reachable === "do_not_disturb"
          ? reachable
          : undefined,
      intentMode:
        intentMode === "one_to_one" ||
        intentMode === "group" ||
        intentMode === "balanced"
          ? intentMode
          : undefined,
      modality:
        modality === "online" || modality === "offline" || modality === "either"
          ? modality
          : undefined,
      languagePreferences: this.readStringArray(record.languagePreferences),
      countryPreferences: this.readStringArray(record.countryPreferences),
      translationOptIn:
        typeof record.translationOptIn === "boolean"
          ? record.translationOptIn
          : undefined,
      requireVerifiedUsers:
        typeof record.requireVerifiedUsers === "boolean"
          ? record.requireVerifiedUsers
          : undefined,
      notificationMode:
        notificationMode === "immediate" ||
        notificationMode === "digest" ||
        notificationMode === "quiet"
          ? notificationMode
          : undefined,
      agentAutonomy:
        agentAutonomy === "manual" ||
        agentAutonomy === "suggest_only" ||
        agentAutonomy === "auto_non_risky"
          ? agentAutonomy
          : undefined,
      memoryMode:
        memoryMode === "minimal" ||
        memoryMode === "standard" ||
        memoryMode === "extended"
          ? memoryMode
          : undefined,
    };
  }

  private readDeliveryMode(
    value: unknown,
  ):
    | "notification"
    | "agent_thread"
    | "notification_and_agent_thread"
    | undefined {
    if (
      value === "notification" ||
      value === "agent_thread" ||
      value === "notification_and_agent_thread"
    ) {
      return value;
    }
    return undefined;
  }

  private coerceSchedule(value: unknown):
    | {
        kind?: "hourly" | "weekly";
        intervalHours?: number;
        days?: Array<"sun" | "mon" | "tue" | "wed" | "thu" | "fri" | "sat">;
        hour?: number;
        minute?: number;
      }
    | undefined {
    const record = this.coerceRecord(value);
    if (!record) {
      return undefined;
    }
    const kind =
      record.kind === "hourly" || record.kind === "weekly"
        ? record.kind
        : undefined;
    const dayValues = Array.isArray(record.days)
      ? record.days.filter(
          (
            entry,
          ): entry is "sun" | "mon" | "tue" | "wed" | "thu" | "fri" | "sat" =>
            entry === "sun" ||
            entry === "mon" ||
            entry === "tue" ||
            entry === "wed" ||
            entry === "thu" ||
            entry === "fri" ||
            entry === "sat",
        )
      : undefined;
    return {
      kind,
      intervalHours:
        typeof record.intervalHours === "number"
          ? record.intervalHours
          : undefined,
      days: dayValues,
      hour: typeof record.hour === "number" ? record.hour : undefined,
      minute: typeof record.minute === "number" ? record.minute : undefined,
    };
  }

  private readIntInRange(
    value: unknown,
    min: number,
    max: number,
    fallback: number,
  ) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return fallback;
    }
    const asInt = Math.trunc(value);
    return Math.min(Math.max(asInt, min), max);
  }

  private readNumberInRange(value: unknown, min: number, max: number) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return undefined;
    }
    return Math.min(Math.max(value, min), max);
  }

  private readNegotiationDomain(value: unknown): "social" | "commerce" | null {
    const parsed = this.readString(value);
    if (parsed === "social" || parsed === "commerce") {
      return parsed;
    }
    return null;
  }

  private readNegotiationMode(value: unknown): "sync" | "async" | null {
    const parsed = this.readString(value);
    if (parsed === "sync" || parsed === "async") {
      return parsed;
    }
    return null;
  }

  private readNegotiationPolicyFlag(
    value: unknown,
  ):
    | "blocked"
    | "reported"
    | "under_review"
    | "trust_low"
    | "suspected_spam"
    | "unsafe_goods"
    | null {
    const parsed = this.readString(value);
    if (
      parsed === "blocked" ||
      parsed === "reported" ||
      parsed === "under_review" ||
      parsed === "trust_low" ||
      parsed === "suspected_spam" ||
      parsed === "unsafe_goods"
    ) {
      return parsed;
    }
    return null;
  }

  private readAvailabilityMode(
    value: unknown,
  ): "now" | "later_today" | "flexible" | "away" | "invisible" | null {
    const parsed = this.readString(value);
    if (
      parsed === "now" ||
      parsed === "later_today" ||
      parsed === "flexible" ||
      parsed === "away" ||
      parsed === "invisible"
    ) {
      return parsed;
    }
    return null;
  }

  private readTone(value: unknown): "neutral" | "friendly" | "urgent" {
    if (value === "friendly" || value === "urgent") {
      return value;
    }
    return "neutral";
  }

  private async appendOrchestrationStep(
    threadId: string,
    traceId: string,
    stage: string,
    content: string,
    details?: Record<string, unknown>,
  ) {
    const metadata = {
      traceId,
      stage,
      details: details ?? {},
    };
    if (this.shouldPersistWorkflowStage(stage)) {
      await this.agentService.appendWorkflowUpdate(threadId, content, metadata);
      return;
    }

    this.agentService.appendEphemeralWorkflowUpdate(
      threadId,
      content,
      metadata,
    );
  }

  private async streamResponseTokenChunks(
    threadId: string,
    traceId: string,
    responseText: string,
  ) {
    const chunks = this.chunkText(responseText, 120, 24);
    for (const [index, chunk] of chunks.entries()) {
      await this.appendOrchestrationStep(
        threadId,
        traceId,
        "response_token",
        chunk,
        {
          index: index + 1,
          total: chunks.length,
          source: "chunked_fallback",
        },
      );
    }
    return chunks.length;
  }

  private chunkText(text: string, maxChunkLength: number, maxChunks: number) {
    const normalized = text.replace(/\s+/g, " ").trim();
    if (!normalized) {
      return [] as string[];
    }

    const words = normalized.split(" ");
    const chunks: string[] = [];
    let current = "";
    let usedWords = 0;

    for (const word of words) {
      const next = current ? `${current} ${word}` : word;
      if (next.length <= maxChunkLength) {
        current = next;
        usedWords += 1;
      } else if (!current) {
        chunks.push(word.slice(0, maxChunkLength));
        usedWords += 1;
      } else {
        chunks.push(current);
        current =
          word.length <= maxChunkLength ? word : word.slice(0, maxChunkLength);
        usedWords += 1;
      }

      if (chunks.length >= maxChunks) {
        break;
      }
    }

    if (chunks.length < maxChunks && current) {
      chunks.push(current);
    }

    if (usedWords < words.length && chunks.length > 0) {
      const lastIndex = chunks.length - 1;
      const trimmed = chunks[lastIndex].slice(
        0,
        Math.max(1, maxChunkLength - 3),
      );
      chunks[lastIndex] = `${trimmed}...`;
    }

    return chunks.slice(0, maxChunks);
  }

  private readString(value: unknown) {
    if (typeof value !== "string") {
      return null;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  private readNumber(value: unknown) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return undefined;
    }
    return Math.min(Math.max(value, 0), 1);
  }

  private readMemoryClass(
    value: unknown,
  ):
    | "profile_memory"
    | "stable_preference"
    | "inferred_preference"
    | "relationship_history"
    | "safety_memory"
    | "commerce_memory"
    | "interaction_summary"
    | "transient_working_memory"
    | null {
    const parsed = this.readString(value);
    if (
      parsed === "profile_memory" ||
      parsed === "stable_preference" ||
      parsed === "inferred_preference" ||
      parsed === "relationship_history" ||
      parsed === "safety_memory" ||
      parsed === "commerce_memory" ||
      parsed === "interaction_summary" ||
      parsed === "transient_working_memory"
    ) {
      return parsed;
    }
    return null;
  }

  private readMemorySafeWritePolicy(
    value: unknown,
  ): "strict" | "allow_with_trace" | "best_effort" | null {
    const parsed = this.readString(value);
    if (
      parsed === "strict" ||
      parsed === "allow_with_trace" ||
      parsed === "best_effort"
    ) {
      return parsed;
    }
    return null;
  }

  private readMemoryContradictionPolicy(
    value: unknown,
  ): "keep_latest" | "suppress_conflict" | "append_conflict_note" | null {
    const parsed = this.readString(value);
    if (
      parsed === "keep_latest" ||
      parsed === "suppress_conflict" ||
      parsed === "append_conflict_note"
    ) {
      return parsed;
    }
    return null;
  }

  private shouldPersistWorkflowStage(stage: string) {
    if (this.nonPersistentWorkflowStages.has(stage)) {
      return false;
    }
    if (
      stage === "response_token" &&
      process.env.AGENT_STREAM_PERSIST_TOKENS !== "true"
    ) {
      return false;
    }
    return true;
  }

  private shouldUseSimpleFastPath(
    userContent: string,
    multimodalContext: {
      voiceTranscript: string;
      attachments: AgentAttachmentInput[];
    },
  ) {
    if (multimodalContext.voiceTranscript.length > 0) {
      return false;
    }
    if (multimodalContext.attachments.length > 0) {
      return false;
    }
    const normalized = userContent.trim().toLowerCase();
    if (normalized.length === 0 || normalized.length > 80) {
      return false;
    }
    if (normalized.includes("\n") || normalized.includes("http")) {
      return false;
    }
    const richerAgentHints = [
      "rank",
      "notify",
      "notification",
      "preference",
      "remember",
      "schedule",
      "search",
      "screenshot",
      "image",
      "file",
      "upload",
      "tool",
      "plan",
      "moderation",
      "safety",
      "transcript",
      "need",
      "tonight",
      "tomorrow",
      "partner",
      "match",
      "connect",
      "invite",
      "circle",
      "cancel",
    ];
    return !richerAgentHints.some((hint) => normalized.includes(hint));
  }

  private readActionType(value: string): AgentActionType | null {
    if ((agentActionTypes as readonly string[]).includes(value)) {
      return value as AgentActionType;
    }
    return null;
  }

  private readRiskLevel(value: unknown): "low" | "medium" | "high" {
    if (value === "medium" || value === "high") {
      return value;
    }
    return "low";
  }

  assertActionAllowedForRole(
    role: OpenAIAgentRole,
    action: AgentActionType,
    riskLevel: "low" | "medium" | "high",
  ) {
    if (requiresHumanApproval({ role, action, riskLevel })) {
      return { allowed: false, reason: "human_approval_required" } as const;
    }
    return { allowed: true } as const;
  }
}
