import { describe, expect, it, vi } from "vitest";
import { ForbiddenException } from "@nestjs/common";
import { NotificationType } from "@opensocial/types";
import { RecurringCirclesService } from "../src/recurring-circles/recurring-circles.service.js";

const OWNER_USER_ID = "11111111-1111-4111-8111-111111111111";
const MEMBER_USER_ID = "22222222-2222-4222-8222-222222222222";
const CIRCLE_ID = "33333333-3333-4333-8333-333333333333";

describe("RecurringCirclesService", () => {
  it("creates recurring circle and owner membership", async () => {
    const tx: any = {
      recurringCircle: {
        create: vi
          .fn()
          .mockResolvedValue({ id: CIRCLE_ID, ownerUserId: OWNER_USER_ID }),
      },
      recurringCircleMember: {
        create: vi.fn().mockResolvedValue({ id: "member-1" }),
      },
    };
    const prisma: any = {
      $transaction: vi.fn(async (cb: any) => cb(tx)),
    };
    const launchControls: any = {
      assertActionAllowed: vi.fn().mockResolvedValue(undefined),
    };

    const service = new RecurringCirclesService(
      prisma,
      undefined,
      launchControls,
    );
    const created = await service.createCircle(OWNER_USER_ID, {
      title: "Founders Friday",
      visibility: "invite_only",
      topicTags: ["startup", "go-to-market"],
      cadence: {
        kind: "weekly",
        days: ["fri"],
        hour: 21,
        minute: 0,
        timezone: "UTC",
        intervalWeeks: 1,
      },
    });

    expect(created.id).toBe(CIRCLE_ID);
    expect(tx.recurringCircle.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          ownerUserId: OWNER_USER_ID,
          cadenceType: "weekly",
          nextSessionAt: expect.any(Date),
        }),
      }),
    );
    expect(tx.recurringCircleMember.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          circleId: CIRCLE_ID,
          userId: OWNER_USER_ID,
          role: "owner",
        }),
      }),
    );
  });

  it("computes next session in the circle timezone instead of UTC", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-21T00:00:00.000Z"));

    try {
      const tx: any = {
        recurringCircle: {
          create: vi
            .fn()
            .mockResolvedValue({ id: CIRCLE_ID, ownerUserId: OWNER_USER_ID }),
        },
        recurringCircleMember: {
          create: vi.fn().mockResolvedValue({ id: "member-1" }),
        },
      };
      const prisma: any = {
        $transaction: vi.fn(async (cb: any) => cb(tx)),
      };
      const launchControls: any = {
        assertActionAllowed: vi.fn().mockResolvedValue(undefined),
      };

      const service = new RecurringCirclesService(
        prisma,
        undefined,
        launchControls,
      );

      await service.createCircle(OWNER_USER_ID, {
        title: "Saturday brunch",
        visibility: "invite_only",
        topicTags: ["friends"],
        cadence: {
          kind: "weekly",
          days: ["sat"],
          hour: 10,
          minute: 0,
          timezone: "America/Argentina/Buenos_Aires",
          intervalWeeks: 1,
        },
      });

      expect(
        tx.recurringCircle.create.mock.calls[0][0].data.nextSessionAt.toISOString(),
      ).toBe("2026-03-21T13:00:00.000Z");
    } finally {
      vi.useRealTimers();
    }
  });

  it("creates run-now session and notifies active members", async () => {
    const prisma: any = {
      recurringCircle: {
        findUnique: vi.fn().mockResolvedValue({
          id: CIRCLE_ID,
          ownerUserId: OWNER_USER_ID,
          title: "Design Circle",
          cadenceConfig: {
            kind: "weekly",
            days: ["mon", "wed"],
            hour: 20,
            minute: 30,
            timezone: "UTC",
            intervalWeeks: 1,
          },
        }),
        update: vi.fn().mockResolvedValue({}),
      },
      recurringCircleSession: {
        create: vi
          .fn()
          .mockResolvedValue({ id: "session-1", circleId: CIRCLE_ID }),
      },
      recurringCircleMember: {
        findMany: vi
          .fn()
          .mockResolvedValue([
            { userId: OWNER_USER_ID },
            { userId: MEMBER_USER_ID },
          ]),
      },
    };
    const notifications: any = {
      createInAppNotification: vi.fn().mockResolvedValue({ id: "notif-1" }),
    };

    const service = new RecurringCirclesService(prisma, notifications);
    const session = await service.createSessionNow(CIRCLE_ID, OWNER_USER_ID);

    expect(session.id).toBe("session-1");
    expect(prisma.recurringCircleSession.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          circleId: CIRCLE_ID,
          status: "opened",
        }),
      }),
    );
    expect(notifications.createInAppNotification).toHaveBeenCalledWith(
      MEMBER_USER_ID,
      NotificationType.REMINDER,
      expect.stringContaining("Design Circle"),
    );
  });

  it("dispatches due sessions for active circles", async () => {
    const prisma: any = {
      recurringCircle: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: CIRCLE_ID,
            ownerUserId: OWNER_USER_ID,
            title: "Weekly Builders",
            status: "active",
            nextSessionAt: new Date(Date.now() - 5 * 60_000),
            cadenceConfig: {
              kind: "weekly",
              days: ["thu"],
              hour: 18,
              minute: 0,
              timezone: "UTC",
              intervalWeeks: 1,
            },
          },
        ]),
        update: vi.fn().mockResolvedValue({}),
      },
      recurringCircleSession: {
        create: vi.fn().mockResolvedValue({ id: "session-2" }),
      },
      recurringCircleMember: {
        findMany: vi.fn().mockResolvedValue([{ userId: OWNER_USER_ID }]),
      },
    };
    const notifications: any = {
      createInAppNotification: vi.fn().mockResolvedValue({ id: "notif-2" }),
    };
    const launchControls: any = {
      assertActionAllowed: vi.fn().mockResolvedValue(undefined),
    };

    const service = new RecurringCirclesService(
      prisma,
      notifications,
      launchControls,
    );
    const result = await service.dispatchDueSessions();

    expect(result.dispatched).toBe(1);
    expect(prisma.recurringCircleSession.create).toHaveBeenCalledTimes(1);
    expect(prisma.recurringCircle.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: CIRCLE_ID },
        data: expect.objectContaining({
          nextSessionAt: expect.any(Date),
        }),
      }),
    );
  });

  it("does not dispatch due sessions for owners blocked by launch controls", async () => {
    const prisma: any = {
      recurringCircle: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: CIRCLE_ID,
            ownerUserId: OWNER_USER_ID,
            title: "Invite-only builders",
            status: "active",
            nextSessionAt: new Date(Date.now() - 5 * 60_000),
            cadenceConfig: {
              kind: "weekly",
              days: ["thu"],
              hour: 18,
              minute: 0,
              timezone: "UTC",
              intervalWeeks: 1,
            },
          },
        ]),
        update: vi.fn().mockResolvedValue({}),
      },
      recurringCircleSession: {
        create: vi.fn(),
      },
      recurringCircleMember: {
        findMany: vi.fn(),
      },
    };
    const launchControls: any = {
      assertActionAllowed: vi
        .fn()
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error("user is not in the alpha cohort")),
    };

    const service = new RecurringCirclesService(
      prisma,
      undefined,
      launchControls,
    );
    const result = await service.dispatchDueSessions();

    expect(result).toEqual({ dispatched: 0, failures: 1 });
    expect(prisma.recurringCircleSession.create).not.toHaveBeenCalled();
    expect(prisma.recurringCircle.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: CIRCLE_ID },
        data: expect.objectContaining({
          lastFailureReason: expect.stringContaining("alpha cohort"),
        }),
      }),
    );
  });

  it("rejects recurring circle member add when owner and member are blocked", async () => {
    const prisma: any = {
      recurringCircle: {
        findUnique: vi.fn().mockResolvedValue({
          id: CIRCLE_ID,
          ownerUserId: OWNER_USER_ID,
        }),
      },
      block: {
        findFirst: vi.fn().mockResolvedValue({ id: "block-1" }),
      },
      recurringCircleMember: {
        upsert: vi.fn(),
      },
    };

    const service = new RecurringCirclesService(prisma);
    await expect(
      service.addMember(CIRCLE_ID, OWNER_USER_ID, {
        userId: MEMBER_USER_ID,
        role: "member",
      }),
    ).rejects.toThrow(ForbiddenException);
    expect(prisma.recurringCircleMember.upsert).not.toHaveBeenCalled();
  });

  it("adds recurring circle member when no block relationship exists", async () => {
    const prisma: any = {
      recurringCircle: {
        findUnique: vi.fn().mockResolvedValue({
          id: CIRCLE_ID,
          ownerUserId: OWNER_USER_ID,
        }),
      },
      block: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
      userPreference: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      userReport: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
      recurringCircleMember: {
        upsert: vi.fn().mockResolvedValue({ id: "member-added" }),
      },
    };

    const service = new RecurringCirclesService(prisma);
    const result = await service.addMember(CIRCLE_ID, OWNER_USER_ID, {
      userId: MEMBER_USER_ID,
      role: "member",
    });

    expect(result).toEqual({ id: "member-added" });
    expect(prisma.block.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            expect.objectContaining({
              blockerUserId: OWNER_USER_ID,
              blockedUserId: MEMBER_USER_ID,
            }),
            expect.objectContaining({
              blockerUserId: MEMBER_USER_ID,
              blockedUserId: OWNER_USER_ID,
            }),
          ]),
        }),
      }),
    );
    expect(prisma.recurringCircleMember.upsert).toHaveBeenCalledTimes(1);
  });

  it("rejects recurring circle member add when owner and member are muted", async () => {
    const prisma: any = {
      recurringCircle: {
        findUnique: vi.fn().mockResolvedValue({
          id: CIRCLE_ID,
          ownerUserId: OWNER_USER_ID,
        }),
      },
      block: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
      userPreference: {
        findMany: vi
          .fn()
          .mockResolvedValue([
            { userId: OWNER_USER_ID, value: [MEMBER_USER_ID] },
          ]),
      },
      userReport: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
      recurringCircleMember: {
        upsert: vi.fn(),
      },
    };

    const service = new RecurringCirclesService(prisma);
    await expect(
      service.addMember(CIRCLE_ID, OWNER_USER_ID, {
        userId: MEMBER_USER_ID,
        role: "member",
      }),
    ).rejects.toThrow(ForbiddenException);
    expect(prisma.recurringCircleMember.upsert).not.toHaveBeenCalled();
  });

  it("rejects recurring circle member add when member muted owner", async () => {
    const prisma: any = {
      recurringCircle: {
        findUnique: vi.fn().mockResolvedValue({
          id: CIRCLE_ID,
          ownerUserId: OWNER_USER_ID,
        }),
      },
      block: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
      userPreference: {
        findMany: vi
          .fn()
          .mockResolvedValue([
            { userId: MEMBER_USER_ID, value: [OWNER_USER_ID] },
          ]),
      },
      userReport: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
      recurringCircleMember: {
        upsert: vi.fn(),
      },
    };

    const service = new RecurringCirclesService(prisma);
    await expect(
      service.addMember(CIRCLE_ID, OWNER_USER_ID, {
        userId: MEMBER_USER_ID,
        role: "member",
      }),
    ).rejects.toThrow(ForbiddenException);
    expect(prisma.recurringCircleMember.upsert).not.toHaveBeenCalled();
  });

  it("rejects recurring circle member add when there is an open report between owner and member", async () => {
    const prisma: any = {
      recurringCircle: {
        findUnique: vi.fn().mockResolvedValue({
          id: CIRCLE_ID,
          ownerUserId: OWNER_USER_ID,
        }),
      },
      block: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
      userReport: {
        findFirst: vi.fn().mockResolvedValue({ id: "report-1" }),
      },
      recurringCircleMember: {
        upsert: vi.fn(),
      },
    };

    const service = new RecurringCirclesService(prisma);
    await expect(
      service.addMember(CIRCLE_ID, OWNER_USER_ID, {
        userId: MEMBER_USER_ID,
        role: "member",
      }),
    ).rejects.toThrow(ForbiddenException);
    expect(prisma.recurringCircleMember.upsert).not.toHaveBeenCalled();
  });

  it("auto-generates owner intent and publishes agent workflow update on session open", async () => {
    const prisma: any = {
      recurringCircle: {
        findUnique: vi.fn().mockResolvedValue({
          id: CIRCLE_ID,
          ownerUserId: OWNER_USER_ID,
          title: "Writers Room",
          kickoffPrompt: "Find people for a weekly writing sprint.",
          topicTags: ["writing", "accountability"],
          cadenceConfig: {
            kind: "weekly",
            days: ["sun"],
            hour: 17,
            minute: 0,
            timezone: "UTC",
            intervalWeeks: 1,
          },
        }),
        update: vi.fn().mockResolvedValue({}),
      },
      recurringCircleSession: {
        create: vi
          .fn()
          .mockResolvedValue({ id: "session-3", circleId: CIRCLE_ID }),
        update: vi.fn().mockResolvedValue({}),
      },
      recurringCircleMember: {
        findMany: vi.fn().mockResolvedValue([{ userId: OWNER_USER_ID }]),
      },
    };
    const notifications: any = {
      createInAppNotification: vi.fn().mockResolvedValue({ id: "notif-3" }),
    };
    const intents: any = {
      createIntent: vi
        .fn()
        .mockResolvedValue({ id: "intent-9", status: "parsed" }),
    };
    const agent: any = {
      findPrimaryThreadSummaryForUser: vi
        .fn()
        .mockResolvedValue({ id: "thread-1" }),
      appendWorkflowUpdate: vi.fn().mockResolvedValue({ id: "msg-1" }),
    };

    const service = new RecurringCirclesService(
      prisma,
      notifications,
      undefined,
      intents,
      agent,
    );
    await service.createSessionNow(CIRCLE_ID, OWNER_USER_ID);

    expect(intents.createIntent).toHaveBeenCalledWith(
      OWNER_USER_ID,
      expect.stringContaining("weekly writing sprint"),
      expect.any(String),
      "thread-1",
    );
    expect(prisma.recurringCircleSession.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "session-3" },
        data: expect.objectContaining({
          generatedIntentId: "intent-9",
        }),
      }),
    );
    expect(agent.appendWorkflowUpdate).toHaveBeenCalledWith(
      "thread-1",
      expect.stringContaining("session opened and matching started"),
      expect.objectContaining({
        category: "recurring_circle_session",
        intentId: "intent-9",
      }),
    );
  });
});
