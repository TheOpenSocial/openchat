import { InjectQueue } from "@nestjs/bullmq";
import {
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import { NotificationType } from "@opensocial/types";
import { Queue } from "bullmq";
import { randomUUID } from "node:crypto";
import { AnalyticsService } from "../analytics/analytics.service.js";
import { getLocalHour } from "../common/timezone-scheduling.js";
import {
  recordNotificationDispatch,
  recordNotificationOpened,
} from "../common/ops-metrics.js";
import { PrismaService } from "../database/prisma.service.js";
import { LaunchControlsService } from "../launch-controls/launch-controls.service.js";

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional()
    @InjectQueue("notification")
    private readonly notificationQueue?: Queue,
    @Optional()
    private readonly analyticsService?: AnalyticsService,
    @Optional()
    private readonly launchControlsService?: LaunchControlsService,
  ) {}

  async sendDigestNow(recipientUserId: string) {
    const [activeIntentCount, pendingRequestCount, unreadNotificationCount] =
      await Promise.all([
        this.prisma.intent.count({
          where: {
            userId: recipientUserId,
            status: { in: ["parsed", "matching", "fanout", "partial"] },
          },
        }),
        this.prisma.intentRequest.count({
          where: {
            recipientUserId,
            status: "pending",
          },
        }),
        this.prisma.notification.count({
          where: {
            recipientUserId,
            isRead: false,
          },
        }),
      ]);

    const body = `Digest: ${activeIntentCount} active intent${activeIntentCount === 1 ? "" : "s"}, ${pendingRequestCount} pending request${pendingRequestCount === 1 ? "" : "s"}, ${unreadNotificationCount} unread update${unreadNotificationCount === 1 ? "" : "s"}.`;
    const notification = await this.createInAppNotification(
      recipientUserId,
      NotificationType.DIGEST,
      body,
    );

    return {
      recipientUserId,
      activeIntentCount,
      pendingRequestCount,
      unreadNotificationCount,
      body,
      notificationId: notification.id,
    };
  }

  async createInAppNotification(
    recipientUserId: string,
    type: NotificationType,
    body: string,
  ) {
    const dedupeWindowStart = new Date(Date.now() - 5 * 60_000);
    const duplicate = await this.prisma.notification.findFirst({
      where: {
        recipientUserId,
        type,
        body,
        createdAt: { gte: dedupeWindowStart },
      },
    });

    if (duplicate) {
      return duplicate;
    }

    const channel = await this.resolveChannel(recipientUserId, type);
    const notification = await this.prisma.notification.create({
      data: {
        recipientUserId,
        type,
        body,
        channel,
      },
    });
    recordNotificationDispatch(notification.channel);
    await this.enqueueDigestEmailDispatch(notification);
    return notification;
  }

  async markNotificationRead(notificationId: string, userId: string) {
    const notification = await this.prisma.notification.findFirst({
      where: {
        id: notificationId,
        recipientUserId: userId,
      },
    });
    if (!notification) {
      throw new NotFoundException("notification not found");
    }
    if (notification.isRead) {
      return {
        notification,
        unchanged: true as const,
      };
    }

    const updated = await this.prisma.notification.update({
      where: {
        id: notification.id,
      },
      data: {
        isRead: true,
      },
    });
    recordNotificationOpened(notification.channel);
    await this.trackAnalyticsEventSafe({
      eventType: "notification_opened",
      actorUserId: userId,
      entityType: "notification",
      entityId: notification.id,
      properties: {
        notificationType: notification.type,
        channel: notification.channel,
      },
    });

    return {
      notification: updated,
    };
  }

  private async resolveChannel(
    recipientUserId: string,
    type: NotificationType,
  ): Promise<string> {
    if (this.isUrgent(type)) {
      const hasPushReachability =
        await this.hasPushReachableSession(recipientUserId);
      const pushEnabled = await this.isPushNotificationsEnabled();
      return hasPushReachability && pushEnabled ? "push" : "in_app";
    }

    const prefs = await this.prisma.userPreference.findMany({
      where: {
        userId: recipientUserId,
        key: {
          in: [
            "quiet_hours_start",
            "quiet_hours_end",
            "digest_mode",
            "global_rules_notification_mode",
            "global_rules_timezone",
          ],
        },
      },
    });

    const notificationMode = prefs.find(
      (p) => p.key === "global_rules_notification_mode",
    )?.value;
    if (notificationMode === "immediate") {
      const hasPushReachability =
        await this.hasPushReachableSession(recipientUserId);
      const pushEnabled = await this.isPushNotificationsEnabled();
      return hasPushReachability && pushEnabled ? "push" : "in_app";
    }
    if (notificationMode === "digest" || notificationMode === "quiet") {
      return "digest";
    }

    const digestMode = prefs.find((p) => p.key === "digest_mode")?.value;
    if (digestMode === true) {
      return "digest";
    }

    const start = Number(
      prefs.find((p) => p.key === "quiet_hours_start")?.value ?? 0,
    );
    const end = Number(
      prefs.find((p) => p.key === "quiet_hours_end")?.value ?? 0,
    );
    const timeZone = await this.resolveNotificationTimeZone(
      recipientUserId,
      prefs,
    );
    const hour = getLocalHour(new Date(), timeZone);

    if (start === end) return "in_app";

    const inQuietHours =
      start < end ? hour >= start && hour < end : hour >= start || hour < end;

    return inQuietHours ? "digest" : "in_app";
  }

  private async resolveNotificationTimeZone(
    recipientUserId: string,
    prefs: Array<{ key: string; value: unknown }>,
  ) {
    const explicit = this.readTimeZone(
      prefs.find((pref) => pref.key === "global_rules_timezone")?.value,
    );
    if (explicit) {
      return explicit;
    }

    if (this.prisma.userAvailabilityWindow?.findFirst) {
      const window = await this.prisma.userAvailabilityWindow.findFirst({
        where: {
          userId: recipientUserId,
          timezone: { not: null },
        },
        orderBy: { createdAt: "asc" },
        select: { timezone: true },
      });
      const fallback = this.readTimeZone(window?.timezone);
      if (fallback) {
        return fallback;
      }
    }

    return "UTC";
  }

  private async hasPushReachableSession(recipientUserId: string) {
    if (!this.prisma.userSession?.findFirst) {
      return false;
    }

    const session = await this.prisma.userSession.findFirst({
      where: {
        userId: recipientUserId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
        deviceId: { not: null },
      },
      select: { id: true },
    });
    return Boolean(session);
  }

  private async isPushNotificationsEnabled() {
    if (!this.launchControlsService) {
      return true;
    }
    const snapshot = await this.launchControlsService.getSnapshot();
    return !snapshot.globalKillSwitch && snapshot.enablePushNotifications;
  }

  private isUrgent(type: NotificationType): boolean {
    return [
      NotificationType.REQUEST_RECEIVED,
      NotificationType.REQUEST_ACCEPTED,
      NotificationType.MODERATION_NOTICE,
    ].includes(type);
  }

  private readTimeZone(value: unknown) {
    return typeof value === "string" && value.trim().length > 0
      ? value.trim()
      : null;
  }

  private async enqueueDigestEmailDispatch(notification: {
    id: string;
    recipientUserId: string;
    type: NotificationType | string;
    channel: string;
  }) {
    if (notification.channel !== "digest" || !this.notificationQueue) {
      return;
    }

    const idempotencyKey = `notification-dispatch:${notification.id}:email_digest`;
    await this.notificationQueue.add(
      "NotificationDispatch",
      {
        version: 1,
        traceId: randomUUID(),
        idempotencyKey,
        timestamp: new Date().toISOString(),
        type: "NotificationDispatch",
        payload: {
          notificationId: notification.id,
          recipientUserId: notification.recipientUserId,
          notificationType: this.toNotificationType(notification.type),
        },
      },
      {
        jobId: idempotencyKey,
        attempts: 3,
        removeOnComplete: 500,
        backoff: {
          type: "exponential",
          delay: 1000,
        },
      },
    );
  }

  private toNotificationType(
    type: NotificationType | string,
  ): NotificationType {
    const values = Object.values(NotificationType) as string[];
    if (values.includes(type)) {
      return type as NotificationType;
    }

    return NotificationType.AGENT_UPDATE;
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
