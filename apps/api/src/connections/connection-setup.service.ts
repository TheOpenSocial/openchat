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
  ) {}

  async setupFromAcceptedRequest(requestId: string) {
    const request = await this.prisma.intentRequest.findUnique({
      where: { id: requestId },
    });
    if (!request) {
      throw new NotFoundException("request not found");
    }

    if (request.status !== "accepted") {
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
    const shouldConvertToGroup = !isGroupIntent && acceptedRecipientCount >= 2;
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
        })
      : await this.setupDmConnection(request);
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
  }

  private async setupDmConnection(request: {
    intentId: string;
    senderUserId: string;
    recipientUserId: string;
  }) {
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

    await this.ensureParticipants(connection.id, [
      request.senderUserId,
      request.recipientUserId,
    ]);
    const { chat, created: chatWasCreated } = await this.ensureChat(
      connection.id,
      "dm",
      request.senderUserId,
    );
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

    await this.notificationsService.createInAppNotification(
      request.senderUserId,
      NotificationType.REQUEST_ACCEPTED,
      "Someone accepted your request. Your chat is ready.",
    );

    await this.notificationsService.createInAppNotification(
      request.recipientUserId,
      NotificationType.AGENT_UPDATE,
      "You accepted the request. Say hi and get started.",
    );

    await this.notifySenderThread(
      request.senderUserId,
      "Great news: someone accepted. I opened your chat.",
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
    return { status: "connected", connection, chat } as const;
  }

  private async setupGroupConnection(
    request: {
      intentId: string;
      senderUserId: string;
      recipientUserId: string;
    },
    options: {
      targetSize: number;
      intentCreatedAt: Date;
      conversionFromOneToOne?: boolean;
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

    await this.notificationsService.createInAppNotification(
      request.senderUserId,
      isReady ? NotificationType.GROUP_FORMED : NotificationType.AGENT_UPDATE,
      senderMessage,
    );

    if (isReady) {
      const participantMessage = reachedFallbackThreshold
        ? `Group ready at fallback threshold: ${participantCount}/${targetSize} participants confirmed. Open your chat to join.`
        : `Group ready: ${participantCount}/${targetSize} participants confirmed. Open your chat to join.`;
      const participantIds = desiredParticipants.filter(
        (userId) => userId !== request.senderUserId,
      );
      await Promise.all(
        participantIds.map((participantId) =>
          this.notificationsService.createInAppNotification(
            participantId,
            NotificationType.GROUP_FORMED,
            participantMessage,
          ),
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
    );
    if (options.conversionFromOneToOne) {
      await this.notifySenderThread(
        request.senderUserId,
        "I converted your active 1:1 intent into a group flow because multiple people accepted.",
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
      });
      if (backfillRequested > 0) {
        await this.notifySenderThread(
          request.senderUserId,
          `I sent ${backfillRequested} backfill invite${backfillRequested === 1 ? "" : "s"} to keep building your group.`,
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
        this.notificationsService.createInAppNotification(
          candidate.candidateUserId,
          NotificationType.REQUEST_RECEIVED,
          "A group request is available now. Join if you are in.",
        ),
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

  private async notifySenderThread(senderUserId: string, message: string) {
    const senderThread = await this.prisma.agentThread.findFirst({
      where: { userId: senderUserId },
      orderBy: { createdAt: "desc" },
    });

    if (senderThread) {
      await this.agentService.createAgentMessage(senderThread.id, message);
    }
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
