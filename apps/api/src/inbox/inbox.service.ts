import { InjectQueue } from "@nestjs/bullmq";
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import { NotificationType, RequestStatus } from "@opensocial/types";
import { Queue } from "bullmq";
import { randomUUID } from "node:crypto";
import { AnalyticsService } from "../analytics/analytics.service.js";
import { PrismaService } from "../database/prisma.service.js";
import { ExecutionReconciliationService } from "../execution-reconciliation/execution-reconciliation.service.js";
import { NotificationsService } from "../notifications/notifications.service.js";
import { PersonalizationService } from "../personalization/personalization.service.js";
import { RealtimeEventsService } from "../realtime/realtime-events.service.js";

@Injectable()
export class InboxService {
  private readonly logger = new Logger(InboxService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    private readonly personalizationService: PersonalizationService,
    private readonly executionReconciliationService: ExecutionReconciliationService,
    @InjectQueue("connection-setup")
    private readonly connectionSetupQueue: Queue,
    @Optional()
    private readonly analyticsService?: AnalyticsService,
    @Optional()
    private readonly realtimeEventsService?: RealtimeEventsService,
  ) {}

  async listPendingRequests(recipientUserId: string) {
    const pending = await this.prisma.intentRequest.findMany({
      where: { recipientUserId, status: "pending" },
    });
    if (pending.length === 0 || !this.prisma.requestResponse?.findMany) {
      return pending;
    }

    const snoozes = await this.prisma.requestResponse.findMany({
      where: {
        userId: recipientUserId,
        requestId: {
          in: pending.map((request) => request.id),
        },
        action: {
          startsWith: "snooze:",
        },
      },
      orderBy: { createdAt: "desc" },
      select: {
        requestId: true,
        action: true,
        createdAt: true,
      },
    });

    const latestSnoozeByRequestId = new Map<
      string,
      {
        action: string;
        createdAt: Date;
      }
    >();
    for (const row of snoozes) {
      if (!latestSnoozeByRequestId.has(row.requestId)) {
        latestSnoozeByRequestId.set(row.requestId, {
          action: row.action,
          createdAt: row.createdAt,
        });
      }
    }

    const visibleRequests = pending.filter((request) => {
      const snooze = latestSnoozeByRequestId.get(request.id);
      if (!snooze) {
        return true;
      }
      return !this.isSnoozeActive(snooze.action, snooze.createdAt);
    });

    if (visibleRequests.length === 0) {
      return [];
    }

    const intentIds = Array.from(
      new Set(
        visibleRequests
          .map((request) =>
            typeof request.intentId === "string" ? request.intentId : null,
          )
          .filter((value): value is string => Boolean(value)),
      ),
    );
    const senderIds = Array.from(
      new Set(
        visibleRequests
          .map((request) =>
            typeof request.senderUserId === "string"
              ? request.senderUserId
              : null,
          )
          .filter((value): value is string => Boolean(value)),
      ),
    );

    const [intents, senders, intentCandidates] = await Promise.all([
      intentIds.length > 0 && this.prisma.intent?.findMany
        ? this.prisma.intent.findMany({
            where: {
              id: {
                in: intentIds,
              },
            },
            select: {
              id: true,
              rawText: true,
            },
          })
        : [],
      senderIds.length > 0 && this.prisma.user?.findMany
        ? this.prisma.user.findMany({
            where: {
              id: {
                in: senderIds,
              },
            },
            select: {
              id: true,
              displayName: true,
            },
          })
        : [],
      intentIds.length > 0 && this.prisma.intentCandidate?.findMany
        ? this.prisma.intentCandidate.findMany({
            where: {
              intentId: {
                in: intentIds,
              },
              candidateUserId: recipientUserId,
            },
            select: {
              intentId: true,
              rationale: true,
            },
          })
        : [],
    ]);

    const intentById = new Map(intents.map((intent) => [intent.id, intent]));
    const senderById = new Map(
      senders.map((sender) => [sender.id, sender.displayName]),
    );
    const rationaleByIntentId = new Map(
      intentCandidates.map((candidate) => [
        candidate.intentId,
        candidate.rationale,
      ]),
    );

    return visibleRequests.map((request) => {
      const senderDisplayName =
        senderById.get(request.senderUserId) ?? "Someone";
      const intentText =
        (typeof request.intentId === "string"
          ? intentById.get(request.intentId)?.rawText
          : null) ?? "Connection request";
      const rationale =
        typeof request.intentId === "string"
          ? rationaleByIntentId.get(request.intentId)
          : null;

      return {
        ...request,
        cardSummary: {
          who: senderDisplayName,
          what: intentText,
          when: this.renderRequestWhen(request.sentAt, request.expiresAt),
        },
        internal: {
          whyMe: this.resolveInternalWhyMe(rationale),
        },
      };
    });
  }

  async getOwnedRequest(requestId: string, recipientUserId: string) {
    const request = await this.prisma.intentRequest.findUnique({
      where: { id: requestId },
    });
    if (!request) {
      throw new NotFoundException("request not found");
    }
    if (request.recipientUserId !== recipientUserId) {
      throw new ForbiddenException("request not owned by recipient");
    }
    return request;
  }

  async updateStatus(
    requestId: string,
    status: "accepted" | "rejected",
    actorUserId?: string,
    options: {
      notificationMetadata?: Record<string, unknown>;
    } = {},
  ) {
    const request = await this.prisma.intentRequest.findUnique({
      where: { id: requestId },
    });

    if (!request) {
      throw new NotFoundException("request not found");
    }
    if (actorUserId && request.recipientUserId !== actorUserId) {
      throw new ForbiddenException("request not owned by recipient");
    }

    if (request.status !== "pending") {
      return { request, unchanged: true };
    }

    const updated = await this.prisma.intentRequest.update({
      where: { id: requestId },
      data: {
        status,
        respondedAt: new Date(),
      },
    });
    this.emitRequestUpdatedSafe(
      [updated.senderUserId, updated.recipientUserId],
      updated.id,
      status === "accepted" ? RequestStatus.ACCEPTED : RequestStatus.REJECTED,
    );

    if (status === "accepted") {
      const idempotencyKey = `request-accepted:${updated.id}`;
      await this.connectionSetupQueue.add(
        "RequestAccepted",
        {
          version: 1,
          traceId: randomUUID(),
          idempotencyKey,
          timestamp: new Date().toISOString(),
          type: "RequestAccepted",
          payload: {
            requestId: updated.id,
            intentId: updated.intentId,
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

      await Promise.all([
        this.recordRequestOutcomeSignal(
          updated.senderUserId,
          updated.recipientUserId,
          "accepted",
        ),
        this.recordRequestOutcomeSignal(
          updated.recipientUserId,
          updated.senderUserId,
          "accepted",
        ),
      ]);
      await this.trackAnalyticsEventSafe({
        eventType: "request_accepted",
        actorUserId: updated.recipientUserId,
        entityType: "intent_request",
        entityId: updated.id,
        properties: {
          senderUserId: updated.senderUserId,
          recipientUserId: updated.recipientUserId,
          intentId: updated.intentId,
        },
      });

      return { request: updated, queued: true };
    }

    await this.recordRequestOutcomeSignal(
      updated.senderUserId,
      updated.recipientUserId,
      "rejected",
    );

    await this.notificationsService.createInAppNotification(
      updated.senderUserId,
      NotificationType.AGENT_UPDATE,
      "One request was declined. I can keep looking for more people.",
      options.notificationMetadata,
    );
    await this.trackAnalyticsEventSafe({
      eventType: "request_rejected",
      actorUserId: updated.recipientUserId,
      entityType: "intent_request",
      entityId: updated.id,
      properties: {
        senderUserId: updated.senderUserId,
        recipientUserId: updated.recipientUserId,
        intentId: updated.intentId,
      },
    });

    return { request: updated };
  }

  async cancelByOriginator(requestId: string, originatorUserId: string) {
    const request = await this.prisma.intentRequest.findUnique({
      where: { id: requestId },
    });
    if (!request) {
      throw new NotFoundException("request not found");
    }

    if (request.senderUserId !== originatorUserId) {
      throw new NotFoundException("request not owned by originator");
    }

    if (request.status !== "pending") {
      return { request, unchanged: true };
    }

    const updated = await this.prisma.intentRequest.update({
      where: { id: requestId },
      data: {
        status: "cancelled",
        respondedAt: new Date(),
      },
    });
    this.emitRequestUpdatedSafe(
      [updated.senderUserId, updated.recipientUserId],
      updated.id,
      RequestStatus.CANCELLED,
    );

    await this.notificationsService.createInAppNotification(
      request.recipientUserId,
      NotificationType.AGENT_UPDATE,
      "A pending request was cancelled by the sender.",
    );
    await this.executionReconciliationService.recordRequestOutcome({
      senderUserId: updated.senderUserId,
      recipientUserId: updated.recipientUserId,
      requestId: updated.id,
      intentId: updated.intentId,
      outcome: "cancelled",
      source: "inbox.cancel_by_originator",
    });

    return { request: updated };
  }

  async expireStaleRequests() {
    const stale = await this.prisma.intentRequest.findMany({
      where: {
        status: "pending",
        expiresAt: { lt: new Date() },
      },
    });

    if (stale.length === 0) {
      return { expiredCount: 0 };
    }

    const ids = stale.map((request) => request.id);

    await this.prisma.intentRequest.updateMany({
      where: { id: { in: ids } },
      data: {
        status: "expired",
        respondedAt: new Date(),
      },
    });
    for (const staleRequest of stale) {
      this.emitRequestUpdatedSafe(
        [staleRequest.senderUserId, staleRequest.recipientUserId],
        staleRequest.id,
        RequestStatus.EXPIRED,
      );
    }
    await Promise.all(
      stale.map((staleRequest) =>
        this.executionReconciliationService.recordRequestOutcome({
          senderUserId: staleRequest.senderUserId,
          recipientUserId: staleRequest.recipientUserId,
          requestId: staleRequest.id,
          intentId: staleRequest.intentId,
          outcome: "expired",
          source: "inbox.expire_stale_requests",
        }),
      ),
    );

    return { expiredCount: ids.length };
  }

  async bulkAction(input: {
    recipientUserId: string;
    requestIds?: string[];
    action: "decline" | "snooze";
    snoozeMinutes?: number;
  }) {
    if (input.action === "snooze" && !input.snoozeMinutes) {
      throw new BadRequestException(
        "snoozeMinutes is required for snooze action",
      );
    }

    const where = {
      recipientUserId: input.recipientUserId,
      status: "pending" as const,
      ...(input.requestIds && input.requestIds.length > 0
        ? {
            id: {
              in: input.requestIds,
            },
          }
        : {}),
    };

    const pendingRequests = await this.prisma.intentRequest.findMany({
      where,
      select: {
        id: true,
        senderUserId: true,
        recipientUserId: true,
      },
    });
    if (pendingRequests.length === 0) {
      return {
        action: input.action,
        affectedCount: 0,
      };
    }

    if (input.action === "decline") {
      await this.prisma.intentRequest.updateMany({
        where: {
          id: {
            in: pendingRequests.map((request) => request.id),
          },
        },
        data: {
          status: "rejected",
          respondedAt: new Date(),
        },
      });
      for (const request of pendingRequests) {
        this.emitRequestUpdatedSafe(
          [request.senderUserId, request.recipientUserId],
          request.id,
          RequestStatus.REJECTED,
        );
      }

      await Promise.all(
        pendingRequests.map((request) =>
          this.recordRequestOutcomeSignal(
            request.senderUserId,
            request.recipientUserId,
            "rejected",
          ),
        ),
      );
      await Promise.all(
        Array.from(
          new Set(pendingRequests.map((request) => request.senderUserId)),
        ).map((senderUserId) =>
          this.notificationsService.createInAppNotification(
            senderUserId,
            NotificationType.AGENT_UPDATE,
            "Some of your pending requests were declined.",
          ),
        ),
      );

      return {
        action: "decline" as const,
        affectedCount: pendingRequests.length,
      };
    }

    const snoozeAction = `snooze:${input.snoozeMinutes}`;
    if (this.prisma.requestResponse?.createMany) {
      await this.prisma.requestResponse.createMany({
        data: pendingRequests.map((request) => ({
          requestId: request.id,
          userId: input.recipientUserId,
          action: snoozeAction,
        })),
        skipDuplicates: false,
      });
    } else if (this.prisma.requestResponse?.create) {
      await Promise.all(
        pendingRequests.map((request) =>
          this.prisma.requestResponse.create({
            data: {
              requestId: request.id,
              userId: input.recipientUserId,
              action: snoozeAction,
            },
          }),
        ),
      );
    }

    return {
      action: "snooze" as const,
      affectedCount: pendingRequests.length,
      snoozeMinutes: input.snoozeMinutes,
      resumesAt: new Date(
        Date.now() + Number(input.snoozeMinutes) * 60_000,
      ).toISOString(),
    };
  }

  private async recordRequestOutcomeSignal(
    actorUserId: string,
    otherUserId: string,
    outcome: "accepted" | "rejected",
  ) {
    const feedbackType =
      outcome === "accepted" ? "request_accepted" : "request_rejected";
    const signalStrength = outcome === "accepted" ? 0.55 : -0.45;
    const edgeType =
      outcome === "accepted" ? "recently_engaged_with" : "avoids";

    try {
      await this.personalizationService.recordBehaviorSignal(actorUserId, {
        edgeType,
        targetNode: {
          nodeType: "person",
          label: `user:${otherUserId}`,
        },
        signalStrength,
        feedbackType,
        context: {
          targetUserId: otherUserId,
        },
      });
    } catch (error) {
      this.logger.warn(
        `failed to capture request outcome signal ${feedbackType}: ${String(
          error,
        )}`,
      );
    }
  }

  private isSnoozeActive(action: string, createdAt: Date) {
    const minutes = this.parseSnoozeMinutes(action);
    if (minutes === null) {
      return false;
    }
    return Date.now() < createdAt.getTime() + minutes * 60_000;
  }

  private parseSnoozeMinutes(action: string) {
    if (!action.startsWith("snooze:")) {
      return null;
    }
    const parsed = Number(action.slice("snooze:".length));
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return null;
    }
    return parsed;
  }

  private renderRequestWhen(sentAt: Date, expiresAt: Date | null) {
    const sentMinutesAgo = Math.max(
      0,
      Math.floor((Date.now() - sentAt.getTime()) / 60_000),
    );
    if (!expiresAt) {
      return `sent ${sentMinutesAgo}m ago`;
    }

    const expiresInMinutes = Math.max(
      0,
      Math.ceil((expiresAt.getTime() - Date.now()) / 60_000),
    );
    return `sent ${sentMinutesAgo}m ago, expires in ${expiresInMinutes}m`;
  }

  private resolveInternalWhyMe(rationale: unknown) {
    if (
      !rationale ||
      typeof rationale !== "object" ||
      Array.isArray(rationale)
    ) {
      return [];
    }
    const value = rationale as Record<string, unknown>;
    if (Array.isArray(value.selectedBecause)) {
      return value.selectedBecause.filter(
        (entry): entry is string => typeof entry === "string",
      );
    }
    if (typeof value.retrievalSource === "string") {
      return [value.retrievalSource];
    }
    return [];
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
}
