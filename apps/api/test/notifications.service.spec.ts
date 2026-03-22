import { describe, expect, it, vi } from "vitest";
import { NotificationType } from "@opensocial/types";
import { NotificationsService } from "../src/notifications/notifications.service.js";

describe("NotificationsService", () => {
  it("deduplicates identical notifications in short window", async () => {
    const existing = { id: "notif-1" };
    const prisma: any = {
      notification: {
        findFirst: vi.fn().mockResolvedValue(existing),
        create: vi.fn(),
      },
      userPreference: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    };

    const service = new NotificationsService(prisma);
    const result = await service.createInAppNotification(
      "user-1",
      NotificationType.AGENT_UPDATE,
      "Hello",
    );

    expect(result).toBe(existing);
    expect(prisma.notification.create).not.toHaveBeenCalled();
  });

  it("routes non-urgent notification to digest during quiet hours", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-21T01:30:00.000Z"));
    const prisma: any = {
      notification: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: "notif-2", channel: "digest" }),
      },
      userPreference: {
        findMany: vi.fn().mockResolvedValue([
          { key: "quiet_hours_start", value: 0 },
          { key: "quiet_hours_end", value: 23 },
        ]),
      },
    };

    const service = new NotificationsService(prisma);
    await service.createInAppNotification(
      "user-1",
      NotificationType.AGENT_UPDATE,
      "Follow up",
    );

    expect(prisma.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ channel: "digest" }),
      }),
    );
    vi.useRealTimers();
  });

  it("uses the user's configured timezone when evaluating quiet hours", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-21T14:30:00.000Z"));
    const prisma: any = {
      notification: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi
          .fn()
          .mockResolvedValue({ id: "notif-tz-1", channel: "digest" }),
      },
      userPreference: {
        findMany: vi.fn().mockResolvedValue([
          { key: "quiet_hours_start", value: 22 },
          { key: "quiet_hours_end", value: 6 },
          { key: "global_rules_timezone", value: "Asia/Tokyo" },
        ]),
      },
      userAvailabilityWindow: {
        findFirst: vi.fn(),
      },
    };

    const service = new NotificationsService(prisma);
    await service.createInAppNotification(
      "user-1",
      NotificationType.AGENT_UPDATE,
      "Timezone-aware quiet hours",
    );

    expect(prisma.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ channel: "digest" }),
      }),
    );
    expect(prisma.userAvailabilityWindow.findFirst).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("falls back to availability window timezone when no explicit rule timezone exists", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-21T14:30:00.000Z"));
    const prisma: any = {
      notification: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi
          .fn()
          .mockResolvedValue({ id: "notif-tz-2", channel: "digest" }),
      },
      userPreference: {
        findMany: vi.fn().mockResolvedValue([
          { key: "quiet_hours_start", value: 22 },
          { key: "quiet_hours_end", value: 6 },
        ]),
      },
      userAvailabilityWindow: {
        findFirst: vi.fn().mockResolvedValue({
          timezone: "Asia/Tokyo",
        }),
      },
    };

    const service = new NotificationsService(prisma);
    await service.createInAppNotification(
      "user-1",
      NotificationType.AGENT_UPDATE,
      "Availability timezone fallback",
    );

    expect(prisma.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ channel: "digest" }),
      }),
    );
    expect(prisma.userAvailabilityWindow.findFirst).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("builds and sends digest summary notification", async () => {
    const prisma: any = {
      intent: {
        count: vi.fn().mockResolvedValue(2),
      },
      intentRequest: {
        count: vi.fn().mockResolvedValue(1),
      },
      notification: {
        count: vi.fn().mockResolvedValue(5),
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({
          id: "notif-digest-1",
          body: "Digest body",
        }),
      },
      userPreference: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    };

    const service = new NotificationsService(prisma);
    const result = await service.sendDigestNow(
      "11111111-1111-4111-8111-111111111111",
    );

    expect(result.activeIntentCount).toBe(2);
    expect(result.pendingRequestCount).toBe(1);
    expect(result.unreadNotificationCount).toBe(5);
    expect(prisma.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          recipientUserId: "11111111-1111-4111-8111-111111111111",
          type: NotificationType.DIGEST,
        }),
      }),
    );
  });

  it("respects global notification mode preference", async () => {
    const prisma: any = {
      notification: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: "notif-3", channel: "digest" }),
      },
      userPreference: {
        findMany: vi
          .fn()
          .mockResolvedValue([
            { key: "global_rules_notification_mode", value: "digest" },
          ]),
      },
    };

    const service = new NotificationsService(prisma);
    await service.createInAppNotification(
      "user-1",
      NotificationType.AGENT_UPDATE,
      "Rule-respecting update",
    );

    expect(prisma.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          channel: "digest",
        }),
      }),
    );
  });

  it("routes immediate notifications to push when user has active device session", async () => {
    const prisma: any = {
      notification: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: "notif-4", channel: "push" }),
      },
      userPreference: {
        findMany: vi
          .fn()
          .mockResolvedValue([
            { key: "global_rules_notification_mode", value: "immediate" },
          ]),
      },
      userSession: {
        findFirst: vi.fn().mockResolvedValue({ id: "session-1" }),
      },
    };

    const service = new NotificationsService(prisma);
    await service.createInAppNotification(
      "user-1",
      NotificationType.AGENT_UPDATE,
      "Push me now",
    );

    expect(prisma.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          channel: "push",
        }),
      }),
    );
  });

  it("enqueues digest notifications for email dispatch workflow", async () => {
    const prisma: any = {
      notification: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({
          id: "notif-digest-queued-1",
          recipientUserId: "user-1",
          type: NotificationType.AGENT_UPDATE,
          channel: "digest",
        }),
      },
      userPreference: {
        findMany: vi
          .fn()
          .mockResolvedValue([
            { key: "global_rules_notification_mode", value: "digest" },
          ]),
      },
    };
    const queue: any = {
      add: vi.fn().mockResolvedValue({}),
    };

    const service = new NotificationsService(prisma, queue);
    await service.createInAppNotification(
      "user-1",
      NotificationType.AGENT_UPDATE,
      "Digest me",
    );

    expect(queue.add).toHaveBeenCalledWith(
      "NotificationDispatch",
      expect.objectContaining({
        type: "NotificationDispatch",
        idempotencyKey:
          "notification-dispatch:notif-digest-queued-1:email_digest",
        payload: expect.objectContaining({
          notificationId: "notif-digest-queued-1",
          recipientUserId: "user-1",
        }),
      }),
      expect.objectContaining({
        jobId: "notification-dispatch:notif-digest-queued-1:email_digest",
      }),
    );
  });

  it("marks unread notification as read and records opened analytics event", async () => {
    const prisma: any = {
      notification: {
        findFirst: vi.fn().mockResolvedValue({
          id: "notif-open-1",
          recipientUserId: "user-1",
          type: NotificationType.AGENT_UPDATE,
          channel: "in_app",
          isRead: false,
        }),
        update: vi.fn().mockResolvedValue({
          id: "notif-open-1",
          recipientUserId: "user-1",
          type: NotificationType.AGENT_UPDATE,
          channel: "in_app",
          isRead: true,
        }),
      },
    };
    const analyticsService: any = {
      trackEvent: vi.fn().mockResolvedValue({ recorded: true }),
    };

    const service = new NotificationsService(
      prisma,
      undefined,
      analyticsService,
    );
    const result = await service.markNotificationRead("notif-open-1", "user-1");

    expect(result.notification.isRead).toBe(true);
    expect(prisma.notification.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "notif-open-1" },
        data: { isRead: true },
      }),
    );
    expect(analyticsService.trackEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "notification_opened",
        actorUserId: "user-1",
        entityType: "notification",
        entityId: "notif-open-1",
      }),
    );
  });

  it("returns unchanged when notification is already read", async () => {
    const prisma: any = {
      notification: {
        findFirst: vi.fn().mockResolvedValue({
          id: "notif-open-2",
          recipientUserId: "user-1",
          isRead: true,
        }),
        update: vi.fn(),
      },
    };
    const analyticsService: any = {
      trackEvent: vi.fn().mockResolvedValue({ recorded: true }),
    };

    const service = new NotificationsService(
      prisma,
      undefined,
      analyticsService,
    );
    const result = await service.markNotificationRead("notif-open-2", "user-1");

    expect(result.unchanged).toBe(true);
    expect(prisma.notification.update).not.toHaveBeenCalled();
    expect(analyticsService.trackEvent).not.toHaveBeenCalled();
  });
});
