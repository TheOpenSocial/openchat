import {
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import { NotificationType } from "@opensocial/types";
import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { AnalyticsService } from "../analytics/analytics.service.js";
import { AgentService } from "../agent/agent.service.js";
import { ChatsService } from "../chats/chats.service.js";
import { AgentWorkflowRuntimeService } from "../database/agent-workflow-runtime.service.js";
import { PrismaService } from "../database/prisma.service.js";
import { ExecutionReconciliationService } from "../execution-reconciliation/execution-reconciliation.service.js";
import { MatchingService } from "../matching/matching.service.js";
import { NotificationsService } from "../notifications/notifications.service.js";
import { PersonalizationService } from "../personalization/personalization.service.js";
import { LaunchControlsService } from "../launch-controls/launch-controls.service.js";
import { RealtimeEventsService } from "../realtime/realtime-events.service.js";
import { ConnectionsService } from "./connections.service.js";

const GROUP_FALLBACK_THRESHOLD_DELAY_MS = 10 * 60 * 1000;
const GROUP_MIN_READY_PARTICIPANTS = 2;
const CONNECTION_SETUP_SIDE_EFFECT_REPLAY_WINDOW_MS = 30 * 60_000;

@Injectable()
export class ConnectionSetupService {
  private readonly logger = new Logger(ConnectionSetupService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly connectionsService: ConnectionsService,
    private readonly chatsService: ChatsService,
    private readonly notificationsService: NotificationsService,
    private readonly personalizationService: PersonalizationService,
    private readonly matchingService: MatchingService,
    private readonly agentService: AgentService,
    private readonly executionReconciliationService: ExecutionReconciliationService,
    @Optional()
    private readonly launchControlsService?: LaunchControlsService,
    @Optional()
    private readonly analyticsService?: AnalyticsService,
    @Optional()
    private readonly realtimeEventsService?: RealtimeEventsService,
    @Optional()
    private readonly workflowRuntimeService?: AgentWorkflowRuntimeService,
  ) {}

  async setupFromAcceptedRequest(requestId: string, traceId?: string) {
    const request = await this.prisma.intentRequest.findUnique({
      where: { id: requestId },
    });
    if (!request) {
      throw new NotFoundException("request not found");
    }
    const workflowTraceId = traceId?.trim() || randomUUID();
    const workflowRunId =
      this.workflowRuntimeService?.buildWorkflowRunId({
        domain: "social",
        entityType: "intent_request",
        entityId: requestId,
      }) ?? `social:intent_request:${requestId}`;
    await this.workflowRuntimeService?.startRun({
      workflowRunId,
      traceId: workflowTraceId,
      domain: "social",
      entityType: "intent_request",
      entityId: requestId,
      userId: request.senderUserId,
      summary: "Accepted request entered connection setup.",
      metadata: {
        intentId: request.intentId,
        recipientUserId: request.recipientUserId,
      },
    });

    try {
      if (request.status !== "accepted") {
        await this.workflowRuntimeService?.checkpoint({
          workflowRunId,
          traceId: workflowTraceId,
          stage: "connection_setup",
          status: "skipped",
          entityType: "intent_request",
          entityId: requestId,
          userId: request.senderUserId,
          summary: "Connection setup skipped because request is not accepted.",
          metadata: {
            requestStatus: request.status,
          },
        });
        return {
          status: "skipped",
          reason: "request_not_accepted",
          request,
        } as const;
      }

      const intent = await this.prisma.intent.findUnique({
        where: { id: request.intentId },
      });
      if (!intent) {
        throw new NotFoundException("intent not found");
      }

      const parsed =
        (intent.parsedIntent as {
          intentType?: string;
          groupSizeTarget?: number;
        } | null) ?? {};
      const requestedGroupSize = Math.min(
        Math.max(parsed.groupSizeTarget ?? 2, 2),
        4,
      );
      const isGroupIntent =
        parsed.intentType === "group" || requestedGroupSize > 2;
      const acceptedRecipients = await this.prisma.intentRequest.findMany({
        where: {
          intentId: request.intentId,
          status: "accepted",
        },
        select: {
          recipientUserId: true,
        },
      });
      const acceptedRecipientCount = new Set(
        acceptedRecipients.map((row) => row.recipientUserId),
      ).size;
      const shouldConvertToGroup =
        !isGroupIntent && acceptedRecipientCount >= 2;
      const targetSize = isGroupIntent
        ? requestedGroupSize
        : this.resolveConvertedGroupTargetSize(acceptedRecipientCount + 1);
      const runAsGroup = isGroupIntent || shouldConvertToGroup;
      if (runAsGroup && this.launchControlsService) {
        try {
          await this.launchControlsService.assertActionAllowed(
            "group_formation",
            request.senderUserId,
          );
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "group formation disabled";
          this.logger.warn(
            JSON.stringify({
              event: "connection.setup.skipped",
              reason: "group_formation_disabled",
              requestId,
              intentId: request.intentId,
              senderUserId: request.senderUserId,
              recipientUserId: request.recipientUserId,
              message,
            }),
          );
          await this.workflowRuntimeService?.checkpoint({
            workflowRunId,
            traceId: workflowTraceId,
            stage: "connection_setup",
            status: "blocked",
            entityType: "intent_request",
            entityId: requestId,
            userId: request.senderUserId,
            summary:
              "Connection setup blocked because group formation is disabled.",
            metadata: {
              reason: "group_formation_disabled",
              message,
            },
          });
          return {
            status: "skipped",
            reason: "group_formation_disabled",
            request,
            message,
          } as const;
        }
      }
      const result = runAsGroup
        ? await this.setupGroupConnection(request, {
            targetSize,
            intentCreatedAt: intent.createdAt ?? new Date(),
            conversionFromOneToOne: shouldConvertToGroup,
            workflowRunId,
            traceId: workflowTraceId,
          })
        : await this.setupDmConnection(request, {
            workflowRunId,
            traceId: workflowTraceId,
          });
      this.logger.log(
        JSON.stringify({
          event: "connection.setup.completed",
          requestId,
          intentId: request.intentId,
          senderUserId: request.senderUserId,
          recipientUserId: request.recipientUserId,
          mode: isGroupIntent || shouldConvertToGroup ? "group" : "dm",
          targetSize: isGroupIntent || shouldConvertToGroup ? targetSize : null,
          convertedFromOneToOne: shouldConvertToGroup,
          result,
        }),
      );
      return result;
    } catch (error) {
      await this.workflowRuntimeService?.checkpoint({
        workflowRunId,
        traceId: workflowTraceId,
        stage: "connection_setup",
        status: "failed",
        entityType: "intent_request",
        entityId: requestId,
        userId: request.senderUserId,
        summary: "Connection setup failed due to a runtime error.",
        metadata: {
          reason: this.normalizeErrorReason(error),
        },
      });
      throw error;
    }
  }

  private normalizeErrorReason(error: unknown) {
    if (!(error instanceof Error)) {
      return "unknown_error";
    }
    const message = error.message.trim();
    if (!message) {
      return "unknown_error";
    }
    return message.slice(0, 160);
  }

  private async setupDmConnection(
    request: {
      id: string;
      intentId: string;
      senderUserId: string;
      recipientUserId: string;
    },
    workflow: { workflowRunId: string; traceId: string },
  ) {
    let connectionWasCreated = false;
    let connection = await this.prisma.connection.findFirst({
      where: {
        originIntentId: request.intentId,
        type: "dm",
        participants: {
          some: { userId: request.senderUserId },
        },
      },
    });

    if (!connection) {
      connection = await this.connectionsService.createConnection(
        "dm",
        request.senderUserId,
        request.intentId,
      );
      connectionWasCreated = true;
    }
    await this.workflowRuntimeService?.linkSideEffect({
      workflowRunId: workflow.workflowRunId,
      traceId: workflow.traceId,
      relation: "connection_created_or_reused",
      entityType: "connection",
      entityId: connection.id,
      userId: request.senderUserId,
      summary: "Resolved DM connection for accepted request.",
      metadata: {
        created: connectionWasCreated,
      },
    });

    await this.ensureParticipants(connection.id, [
      request.senderUserId,
      request.recipientUserId,
    ]);
    const { chat, created: chatWasCreated } = await this.ensureChat(
      connection.id,
      "dm",
      request.senderUserId,
    );
    await this.workflowRuntimeService?.linkSideEffect({
      workflowRunId: workflow.workflowRunId,
      traceId: workflow.traceId,
      relation: "chat_created_or_reused",
      entityType: "chat",
      entityId: chat.id,
      userId: request.senderUserId,
      summary: "Resolved DM chat for accepted request.",
      metadata: {
        created: chatWasCreated,
      },
    });
    if (connectionWasCreated) {
      await this.trackAnalyticsEventSafe({
        eventType: "connection_created",
        actorUserId: request.senderUserId,
        entityType: "connection",
        entityId: connection.id,
        properties: {
          type: "dm",
          participantCount: 2,
          intentId: request.intentId,
        },
      });
    }
    if (chatWasCreated) {
      await this.trackAnalyticsEventSafe({
        eventType: "chat_started",
        actorUserId: request.senderUserId,
        entityType: "chat",
        entityId: chat.id,
        properties: {
          chatType: "dm",
          connectionId: connection.id,
        },
      });
    }

    await this.prisma.intent.update({
      where: { id: request.intentId },
      data: { status: "connected" },
    });
    this.realtimeEventsService?.emitIntentUpdated(request.senderUserId, {
      intentId: request.intentId,
      status: "connected",
    });
    this.realtimeEventsService?.emitConnectionCreated(
      [request.senderUserId, request.recipientUserId],
      {
        connectionId: connection.id,
        type: "dm",
      },
    );

    await this.createWorkflowNotification({
      workflowRunId: workflow.workflowRunId,
      traceId: workflow.traceId,
      relation: "connection_sender_notification",
      recipientUserId: request.senderUserId,
      notificationType: NotificationType.REQUEST_ACCEPTED,
      body: "Someone accepted your request. Your chat is ready.",
    });

    await this.createWorkflowNotification({
      workflowRunId: workflow.workflowRunId,
      traceId: workflow.traceId,
      relation: "connection_recipient_notification",
      recipientUserId: request.recipientUserId,
      notificationType: NotificationType.AGENT_UPDATE,
      body: "You accepted the request. Say hi and get started.",
    });

    await this.notifySenderThread(
      request.senderUserId,
      "Great news: someone accepted. I opened your chat.",
      {
        workflowRunId: workflow.workflowRunId,
        traceId: workflow.traceId,
        relation: "connection_sender_thread_message",
      },
    );

    await this.recordMutualSuccessSignal(
      request.senderUserId,
      request.recipientUserId,
      "connection_dm_opened",
    );
    await Promise.all([
      this.storeInteractionSummarySafe(
        request.senderUserId,
        `Connected in a direct chat with ${request.recipientUserId}.`,
        { connectionType: "dm", counterpartUserId: request.recipientUserId },
      ),
      this.storeInteractionSummarySafe(
        request.recipientUserId,
        `Connected in a direct chat with ${request.senderUserId}.`,
        { connectionType: "dm", counterpartUserId: request.senderUserId },
      ),
    ]);

    this.logger.log(
      JSON.stringify({
        event: "connection.setup.dm_ready",
        intentId: request.intentId,
        senderUserId: request.senderUserId,
        recipientUserId: request.recipientUserId,
        connectionId: connection.id,
        chatId: chat.id,
      }),
    );
    await this.workflowRuntimeService?.checkpoint({
      workflowRunId: workflow.workflowRunId,
      traceId: workflow.traceId,
      stage: "connection_setup",
      status: "completed",
      entityType: "intent_request",
      entityId: request.id,
      userId: request.senderUserId,
      summary: "Accepted request resolved into a direct chat connection.",
      metadata: {
        connectionId: connection.id,
        chatId: chat.id,
      },
    });
    return { status: "connected", connection, chat } as const;
  }

  private async setupGroupConnection(
    request: {
      id: string;
      intentId: string;
      senderUserId: string;
      recipientUserId: string;
    },
    options: {
      targetSize: number;
      intentCreatedAt: Date;
      conversionFromOneToOne?: boolean;
      workflowRunId: string;
      traceId: string;
    },
  ) {
    const targetSize = options.targetSize;
    let connectionWasCreated = false;
    let connection = await this.prisma.connection.findFirst({
      where: {
        originIntentId: request.intentId,
        type: "group",
      },
    });

    if (!connection && options.conversionFromOneToOne) {
      const dmConnection = await this.prisma.connection.findFirst({
        where: {
          originIntentId: request.intentId,
          type: "dm",
        },
      });
      if (dmConnection && this.prisma.connection.update) {
        connection = await this.prisma.connection.update({
          where: { id: dmConnection.id },
          data: { type: "group" },
        });
      }
    }

    if (!connection) {
      connection = await this.connectionsService.createConnection(
        "group",
        request.senderUserId,
        request.intentId,
      );
      connectionWasCreated = true;
    }
    await this.workflowRuntimeService?.linkSideEffect({
      workflowRunId: options.workflowRunId,
      traceId: options.traceId,
      relation: "connection_created_or_reused",
      entityType: "connection",
      entityId: connection.id,
      userId: request.senderUserId,
      summary: "Resolved group connection during accepted-request processing.",
      metadata: {
        created: connectionWasCreated,
        conversionFromOneToOne: options.conversionFromOneToOne ?? false,
      },
    });

    const intentRequests = await this.prisma.intentRequest.findMany({
      where: {
        intentId: request.intentId,
      },
      select: {
        recipientUserId: true,
        status: true,
        wave: true,
      },
    });
    const acceptedRequests = intentRequests.filter(
      (intentRequest) => intentRequest.status === "accepted",
    );

    const desiredParticipants = Array.from(
      new Set([
        request.senderUserId,
        ...acceptedRequests.map((r) => r.recipientUserId),
      ]),
    ).slice(0, 4);

    await this.ensureParticipants(connection.id, desiredParticipants);
    const { chat, created: chatWasCreated } = await this.ensureChat(
      connection.id,
      "group",
      request.senderUserId,
    );
    await this.workflowRuntimeService?.linkSideEffect({
      workflowRunId: options.workflowRunId,
      traceId: options.traceId,
      relation: "chat_created_or_reused",
      entityType: "chat",
      entityId: chat.id,
      userId: request.senderUserId,
      summary: "Resolved group chat during accepted-request processing.",
      metadata: {
        created: chatWasCreated,
      },
    });
    if (connectionWasCreated) {
      await this.trackAnalyticsEventSafe({
        eventType: "connection_created",
        actorUserId: request.senderUserId,
        entityType: "connection",
        entityId: connection.id,
        properties: {
          type: "group",
          intentId: request.intentId,
        },
      });
    }
    if (chatWasCreated) {
      await this.trackAnalyticsEventSafe({
        eventType: "chat_started",
        actorUserId: request.senderUserId,
        entityType: "chat",
        entityId: chat.id,
        properties: {
          chatType: "group",
          connectionId: connection.id,
        },
      });
    }

    const participantCount = desiredParticipants.length;
    const readiness = this.resolveGroupReadiness({
      targetSize,
      participantCount,
      intentCreatedAt: options.intentCreatedAt,
    });
    const isReady = readiness.isReady;
    const reachedFallbackThreshold =
      isReady && readiness.requiredParticipants < targetSize;
    const senderMessage = isReady
      ? reachedFallbackThreshold
        ? `Your group is ready at fallback threshold (${participantCount}/${targetSize}).`
        : `Your group is ready (${participantCount}/${targetSize}).`
      : `Group progress: ${participantCount}/${targetSize} accepted so far.`;

    await this.prisma.intent.update({
      where: { id: request.intentId },
      data: { status: isReady ? "connected" : "partial" },
    });
    this.realtimeEventsService?.emitIntentUpdated(request.senderUserId, {
      intentId: request.intentId,
      status: isReady ? "connected" : "partial",
    });
    this.realtimeEventsService?.emitConnectionCreated(desiredParticipants, {
      connectionId: connection.id,
      type: "group",
    });

    await this.createWorkflowNotification({
      workflowRunId: options.workflowRunId,
      traceId: options.traceId,
      relation: "group_sender_notification",
      recipientUserId: request.senderUserId,
      notificationType: isReady
        ? NotificationType.GROUP_FORMED
        : NotificationType.AGENT_UPDATE,
      body: senderMessage,
      metadata: {
        targetSize,
        participantCount,
        isReady,
      },
    });

    if (isReady) {
      const participantMessage = reachedFallbackThreshold
        ? `Group ready at fallback threshold: ${participantCount}/${targetSize} participants confirmed. Open your chat to join.`
        : `Group ready: ${participantCount}/${targetSize} participants confirmed. Open your chat to join.`;
      const participantIds = desiredParticipants.filter(
        (userId) => userId !== request.senderUserId,
      );
      await Promise.all(
        participantIds.map((participantId) =>
          this.createWorkflowNotification({
            workflowRunId: options.workflowRunId,
            traceId: options.traceId,
            relation: "group_participant_notification",
            recipientUserId: participantId,
            notificationType: NotificationType.GROUP_FORMED,
            body: participantMessage,
            metadata: {
              targetSize,
              participantCount,
              isReady,
            },
          }),
        ),
      );
    }

    await this.notifySenderThread(
      request.senderUserId,
      isReady
        ? reachedFallbackThreshold
          ? `Group ready at fallback threshold: ${participantCount}/${targetSize} participants connected.`
          : `Group ready: ${participantCount}/${targetSize} participants connected.`
        : `Progress update: ${participantCount}/${targetSize} participants accepted.`,
      {
        workflowRunId: options.workflowRunId,
        traceId: options.traceId,
        relation: "group_sender_thread_message",
      },
    );
    if (options.conversionFromOneToOne) {
      await this.notifySenderThread(
        request.senderUserId,
        "I converted your active 1:1 intent into a group flow because multiple people accepted.",
        {
          workflowRunId: options.workflowRunId,
          traceId: options.traceId,
          relation: "group_sender_thread_message",
        },
      );
    }

    let backfillRequested = 0;
    if (!isReady) {
      backfillRequested = await this.requestGroupBackfill({
        request,
        existingRequests: intentRequests,
        participantCount,
        requiredParticipants: readiness.requiredParticipants,
        targetSize,
        workflowRunId: options.workflowRunId,
        traceId: options.traceId,
      });
      if (backfillRequested > 0) {
        await this.notifySenderThread(
          request.senderUserId,
          `I sent ${backfillRequested} backfill invite${backfillRequested === 1 ? "" : "s"} to keep building your group.`,
          {
            workflowRunId: options.workflowRunId,
            traceId: options.traceId,
            relation: "group_sender_thread_message",
          },
        );
      } else {
        await this.executionReconciliationService.recordGroupFormationStalled({
          userId: request.senderUserId,
          intentId: request.intentId,
          participantCount,
          targetSize,
          backfillRequested,
          source: "connections.group_progress",
        });
      }
    }

    if (isReady) {
      await this.recordGroupSuccessSignals(desiredParticipants, targetSize);
      await Promise.all(
        desiredParticipants.map((participantId) =>
          this.storeInteractionSummarySafe(
            participantId,
            `Group connection reached ${participantCount}/${targetSize} participants.`,
            {
              connectionType: "group",
              participantCount,
              targetSize,
            },
          ),
        ),
      );
    }

    this.logger.log(
      JSON.stringify({
        event: "connection.setup.group_progress",
        intentId: request.intentId,
        senderUserId: request.senderUserId,
        recipientUserId: request.recipientUserId,
        connectionId: connection.id,
        chatId: chat.id,
        participantCount,
        targetSize,
        requiredParticipants: readiness.requiredParticipants,
        isReady,
        reachedFallbackThreshold,
        backfillRequested,
      }),
    );
    await this.workflowRuntimeService?.checkpoint({
      workflowRunId: options.workflowRunId,
      traceId: options.traceId,
      stage: "connection_setup",
      status: isReady ? "completed" : "degraded",
      entityType: "intent_request",
      entityId: request.id,
      userId: request.senderUserId,
      summary: isReady
        ? "Group request resolved into an active group connection."
        : "Group request remains partial and is waiting on more participants.",
      metadata: {
        connectionId: connection.id,
        chatId: chat.id,
        participantCount,
        targetSize,
        backfillRequested,
      },
    });
    return {
      status: isReady ? "connected" : "partial",
      connection,
      chat,
      participantCount,
      targetSize,
      requiredParticipants: readiness.requiredParticipants,
      backfillRequested,
    } as const;
  }

  private resolveGroupReadiness(input: {
    targetSize: number;
    participantCount: number;
    intentCreatedAt: Date;
  }) {
    const fallbackThreshold = Math.max(
      GROUP_MIN_READY_PARTICIPANTS,
      input.targetSize - 1,
    );
    const fallbackAllowed =
      Date.now() - input.intentCreatedAt.getTime() >=
      GROUP_FALLBACK_THRESHOLD_DELAY_MS;
    const requiredParticipants = fallbackAllowed
      ? fallbackThreshold
      : input.targetSize;

    return {
      isReady: input.participantCount >= requiredParticipants,
      requiredParticipants,
      fallbackAllowed,
    };
  }

  private resolveConvertedGroupTargetSize(participantCount: number) {
    return Math.min(4, Math.max(3, participantCount));
  }

  private async requestGroupBackfill(input: {
    request: {
      intentId: string;
      senderUserId: string;
      recipientUserId: string;
    };
    existingRequests: Array<{
      recipientUserId: string;
      status: string;
      wave: number;
    }>;
    participantCount: number;
    requiredParticipants: number;
    targetSize: number;
    workflowRunId: string;
    traceId: string;
  }) {
    const pendingInviteCount = input.existingRequests.filter(
      (request) => request.status === "pending",
    ).length;
    const maxParticipantCapacity = Math.min(4, Math.max(input.targetSize, 2));
    const projectedParticipantCount =
      input.participantCount + pendingInviteCount;
    const requiredMissing = input.requiredParticipants - input.participantCount;
    const additionalCapacity =
      maxParticipantCapacity - projectedParticipantCount;
    const backfillSlots = Math.min(requiredMissing, additionalCapacity);

    if (backfillSlots <= 0) {
      return 0;
    }
    if (
      !this.prisma.intentCandidate?.findMany ||
      !this.prisma.intentRequest?.createMany
    ) {
      return 0;
    }

    const contactedUsers = new Set<string>([
      input.request.senderUserId,
      ...input.existingRequests.map((request) => request.recipientUserId),
    ]);
    const nextWave =
      input.existingRequests.reduce(
        (maxWave, request) => Math.max(maxWave, request.wave),
        1,
      ) + 1;

    const candidates = await this.prisma.intentCandidate.findMany({
      where: {
        intentId: input.request.intentId,
        candidateUserId: {
          notIn: Array.from(contactedUsers),
        },
      },
      select: {
        candidateUserId: true,
        rationale: true,
      },
      orderBy: {
        score: "desc",
      },
      take: backfillSlots,
    });
    if (candidates.length === 0) {
      return 0;
    }

    const backfillRows: Prisma.IntentRequestCreateManyInput[] = candidates.map(
      (candidate) => ({
        id: randomUUID(),
        intentId: input.request.intentId,
        senderUserId: input.request.senderUserId,
        recipientUserId: candidate.candidateUserId,
        status: "pending",
        wave: nextWave,
        relevanceFeatures:
          (candidate.rationale as Prisma.InputJsonValue | null) ?? undefined,
        expiresAt: new Date(Date.now() + 20 * 60_000),
      }),
    );
    await this.prisma.intentRequest.createMany({
      data: backfillRows,
      skipDuplicates: true,
    });
    for (const backfillRow of backfillRows) {
      if (!backfillRow.id) {
        continue;
      }
      this.realtimeEventsService?.emitRequestCreated(
        backfillRow.recipientUserId,
        {
          requestId: backfillRow.id,
          intentId: backfillRow.intentId,
        },
      );
    }

    await Promise.all(
      candidates.map((candidate) =>
        this.createWorkflowNotification({
          workflowRunId: input.workflowRunId,
          traceId: input.traceId,
          relation: "group_backfill_notification",
          recipientUserId: candidate.candidateUserId,
          notificationType: NotificationType.REQUEST_RECEIVED,
          body: "A group request is available now. Join if you are in.",
          metadata: {
            intentId: input.request.intentId,
          },
        }),
      ),
    );

    return candidates.length;
  }

  private async ensureParticipants(connectionId: string, userIds: string[]) {
    const existingParticipants =
      await this.prisma.connectionParticipant.findMany({
        where: { connectionId },
      });
    const activeParticipantIds = new Set(
      existingParticipants
        .filter((participant) => participant.leftAt == null)
        .map((participant) => participant.userId),
    );
    const inactiveParticipantIds = new Set(
      existingParticipants
        .filter((participant) => participant.leftAt != null)
        .map((participant) => participant.userId),
    );

    const participantsToReactivate = userIds.filter(
      (id) => inactiveParticipantIds.has(id) && !activeParticipantIds.has(id),
    );

    if (
      participantsToReactivate.length > 0 &&
      this.prisma.connectionParticipant.updateMany
    ) {
      await this.prisma.connectionParticipant.updateMany({
        where: {
          connectionId,
          userId: {
            in: participantsToReactivate,
          },
          leftAt: {
            not: null,
          },
        },
        data: {
          leftAt: null,
        },
      });
      participantsToReactivate.forEach((userId) => {
        activeParticipantIds.add(userId);
      });
    }

    const participantsToCreate = userIds
      .filter(
        (id) =>
          !activeParticipantIds.has(id) && !inactiveParticipantIds.has(id),
      )
      .map((userId) => ({
        connectionId,
        userId,
        role: userId === userIds[0] ? "owner" : "member",
      }));

    if (participantsToCreate.length > 0) {
      await this.prisma.connectionParticipant.createMany({
        data: participantsToCreate,
      });
    }
  }

  private async ensureChat(
    connectionId: string,
    type: "dm" | "group",
    systemAuthorUserId: string,
  ) {
    let chat = await this.prisma.chat.findFirst({
      where: { connectionId, type },
    });
    let created = false;
    if (!chat) {
      chat = await this.chatsService.createChat(connectionId, type);
      await this.chatsService.createMessage(
        chat.id,
        systemAuthorUserId,
        "System: Connection is now active.",
      );
      created = true;
    }

    const memberships = await this.prisma.connectionParticipant.findMany({
      where: { connectionId, leftAt: null },
    });
    const existingMemberships = await this.prisma.chatMembership.findMany({
      where: { chatId: chat.id },
    });
    const existingMembershipIds = new Set(
      existingMemberships.map((m) => m.userId),
    );

    const membershipsToCreate = memberships
      .filter((p) => !existingMembershipIds.has(p.userId))
      .map((p) => ({ chatId: chat.id, userId: p.userId }));

    if (membershipsToCreate.length > 0) {
      await this.prisma.chatMembership.createMany({
        data: membershipsToCreate,
      });
      await Promise.all(
        membershipsToCreate.map((membership) =>
          this.chatsService.createSystemMessage(
            chat.id,
            membership.userId,
            "join",
            undefined,
            {
              idempotencyKey: `chat-membership-join:${chat.id}:${membership.userId}`,
            },
          ),
        ),
      );
    }

    return {
      chat,
      created,
    };
  }

  private async notifySenderThread(
    senderUserId: string,
    message: string,
    workflow?: { workflowRunId: string; traceId: string; relation: string },
  ) {
    const senderThread = await this.prisma.agentThread.findFirst({
      where: { userId: senderUserId },
      orderBy: { createdAt: "desc" },
    });

    if (!senderThread) {
      return;
    }

    const existingMessage = workflow
      ? await this.findRecentWorkflowLinkedThreadMessage({
          workflowRunId: workflow.workflowRunId,
          relation: workflow.relation,
          threadId: senderThread.id,
          message,
        })
      : null;
    const threadMessage =
      existingMessage ??
      (await this.agentService.createAgentMessage(senderThread.id, message));
    const deduped = existingMessage != null;

    if (workflow) {
      await this.workflowRuntimeService?.linkSideEffect({
        workflowRunId: workflow.workflowRunId,
        traceId: workflow.traceId,
        relation: workflow.relation,
        entityType: "agent_message",
        entityId: threadMessage.id,
        userId: senderUserId,
        summary: deduped
          ? "Reused an existing workflow thread update."
          : "Persisted a workflow thread update.",
        metadata: {
          threadId: senderThread.id,
          message,
          deduped,
        },
      });
    }
  }

  private async createWorkflowNotification(input: {
    workflowRunId: string;
    traceId: string;
    relation: string;
    recipientUserId: string;
    notificationType: NotificationType;
    body: string;
    metadata?: Record<string, unknown>;
  }) {
    const existingNotification =
      await this.findRecentWorkflowLinkedNotification({
        workflowRunId: input.workflowRunId,
        relation: input.relation,
        recipientUserId: input.recipientUserId,
        notificationType: input.notificationType,
        body: input.body,
      });
    const notification =
      existingNotification ??
      (await this.notificationsService.createInAppNotification(
        input.recipientUserId,
        input.notificationType,
        input.body,
      ));
    const deduped = existingNotification != null;
    await this.workflowRuntimeService?.linkSideEffect({
      workflowRunId: input.workflowRunId,
      traceId: input.traceId,
      relation: input.relation,
      entityType: "notification",
      entityId: notification.id,
      userId: input.recipientUserId,
      summary: deduped
        ? "Reused an existing workflow notification side effect."
        : "Persisted workflow notification side effect.",
      metadata: {
        recipientUserId: input.recipientUserId,
        notificationType: input.notificationType,
        body: input.body,
        deduped,
        ...(input.metadata ?? {}),
      },
    });
    return notification;
  }

  private async findRecentWorkflowLinkedNotification(input: {
    workflowRunId: string;
    relation: string;
    recipientUserId: string;
    notificationType: NotificationType;
    body: string;
  }) {
    if (
      !this.prisma.auditLog?.findMany ||
      !this.prisma.notification?.findUnique
    ) {
      return null;
    }

    const rows = await this.prisma.auditLog.findMany({
      where: {
        action: "agent.workflow_side_effect_linked",
        entityType: "notification",
        createdAt: {
          gte: new Date(
            Date.now() - CONNECTION_SETUP_SIDE_EFFECT_REPLAY_WINDOW_MS,
          ),
        },
      },
      orderBy: { createdAt: "desc" },
      take: 40,
      select: { entityId: true, metadata: true },
    });

    for (const row of rows) {
      const metadata = this.readMetadata(row.metadata);
      const workflowRunId = this.readString(metadata.workflowRunId);
      const relation = this.readString(metadata.relation);
      const recipientUserId = this.readString(metadata.recipientUserId);
      const notificationType = this.readString(metadata.notificationType);
      const body = this.readString(metadata.body);
      const notificationId = this.readString(row.entityId);

      if (!notificationId) {
        continue;
      }
      if (
        workflowRunId !== input.workflowRunId ||
        relation !== input.relation ||
        recipientUserId !== input.recipientUserId ||
        notificationType !== input.notificationType ||
        body !== input.body
      ) {
        continue;
      }

      const existing = await this.prisma.notification.findUnique({
        where: { id: notificationId },
        select: {
          id: true,
          recipientUserId: true,
          type: true,
          body: true,
        },
      });
      if (!existing) {
        continue;
      }
      if (
        existing.recipientUserId === input.recipientUserId &&
        existing.type === input.notificationType &&
        existing.body === input.body
      ) {
        return existing;
      }
    }

    return null;
  }

  private async findRecentWorkflowLinkedThreadMessage(input: {
    workflowRunId: string;
    relation: string;
    threadId: string;
    message: string;
  }) {
    if (
      !this.prisma.auditLog?.findMany ||
      !this.prisma.agentMessage?.findUnique
    ) {
      return null;
    }

    const rows = await this.prisma.auditLog.findMany({
      where: {
        action: "agent.workflow_side_effect_linked",
        entityType: "agent_message",
        createdAt: {
          gte: new Date(
            Date.now() - CONNECTION_SETUP_SIDE_EFFECT_REPLAY_WINDOW_MS,
          ),
        },
      },
      orderBy: { createdAt: "desc" },
      take: 40,
      select: { entityId: true, metadata: true },
    });

    for (const row of rows) {
      const metadata = this.readMetadata(row.metadata);
      const workflowRunId = this.readString(metadata.workflowRunId);
      const relation = this.readString(metadata.relation);
      const threadId = this.readString(metadata.threadId);
      const message = this.readString(metadata.message);
      const agentMessageId = this.readString(row.entityId);

      if (!agentMessageId) {
        continue;
      }
      if (
        workflowRunId !== input.workflowRunId ||
        relation !== input.relation ||
        threadId !== input.threadId ||
        message !== input.message
      ) {
        continue;
      }

      const existing = await this.prisma.agentMessage.findUnique({
        where: { id: agentMessageId },
        select: {
          id: true,
          threadId: true,
          content: true,
        },
      });
      if (!existing) {
        continue;
      }
      if (
        existing.threadId === input.threadId &&
        existing.content === input.message
      ) {
        return existing;
      }
    }

    return null;
  }

  private readMetadata(value: unknown) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return {};
    }
    return value as Record<string, unknown>;
  }

  private readString(value: unknown) {
    if (typeof value !== "string") {
      return null;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  private async recordMutualSuccessSignal(
    firstUserId: string,
    secondUserId: string,
    feedbackType: string,
  ) {
    try {
      await Promise.all([
        this.personalizationService.recordBehaviorSignal(firstUserId, {
          edgeType: "high_success_with",
          targetNode: {
            nodeType: "person",
            label: `user:${secondUserId}`,
          },
          signalStrength: 0.8,
          feedbackType,
          context: { counterpartUserId: secondUserId },
        }),
        this.personalizationService.recordBehaviorSignal(secondUserId, {
          edgeType: "high_success_with",
          targetNode: {
            nodeType: "person",
            label: `user:${firstUserId}`,
          },
          signalStrength: 0.8,
          feedbackType,
          context: { counterpartUserId: firstUserId },
        }),
      ]);
    } catch (error) {
      this.logger.warn(
        `failed to record mutual success signal (${feedbackType}): ${String(
          error,
        )}`,
      );
    }
  }

  private async recordGroupSuccessSignals(
    participantUserIds: string[],
    targetSize: number,
  ) {
    const pairSignals: Array<Promise<void>> = [];
    for (let i = 0; i < participantUserIds.length; i += 1) {
      for (let j = i + 1; j < participantUserIds.length; j += 1) {
        const userA = participantUserIds[i];
        const userB = participantUserIds[j];
        pairSignals.push(
          this.recordMutualSuccessSignal(
            userA,
            userB,
            "connection_group_ready",
          ),
        );
      }
    }

    try {
      await Promise.all(pairSignals);
      await Promise.all(
        participantUserIds.map((userId) =>
          this.personalizationService.recordBehaviorSignal(userId, {
            edgeType: "recently_engaged_with",
            targetNode: {
              nodeType: "schedule_preference",
              label: `group_size:${targetSize}`,
            },
            signalStrength: 0.35,
            feedbackType: "group_size_success",
          }),
        ),
      );
    } catch (error) {
      this.logger.warn(
        `failed to record group success signals: ${String(error)}`,
      );
    }
  }

  private async storeInteractionSummarySafe(
    userId: string,
    summary: string,
    context: Record<string, unknown>,
  ) {
    try {
      await this.personalizationService.storeInteractionSummary(userId, {
        summary,
        context,
      });
      await this.matchingService.upsertConversationSummaryEmbedding(
        userId,
        summary,
        "interaction_summary",
      );
    } catch (error) {
      this.logger.warn(
        `failed to store interaction summary for user ${userId}: ${String(
          error,
        )}`,
      );
    }
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
