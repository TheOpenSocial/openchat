import { describe, expect, it, vi } from "vitest";
import { ModerationService } from "../src/moderation/moderation.service.js";

describe("ModerationService", () => {
  it("creates user report and moderation flag when entity context is provided", async () => {
    const prisma: any = {
      userReport: {
        create: vi.fn().mockResolvedValue({ id: "report-1" }),
      },
      userPreference: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: "pref-1" }),
      },
      userProfile: {
        upsert: vi.fn().mockResolvedValue({}),
      },
      user: {
        update: vi.fn().mockResolvedValue({}),
      },
      moderationFlag: {
        create: vi.fn().mockResolvedValue({ id: "flag-1" }),
      },
      auditLog: {
        create: vi.fn().mockResolvedValue({}),
      },
    };
    const realtimeEventsService: any = {
      emitModerationNotice: vi.fn(),
    };

    const service = new ModerationService(
      prisma,
      undefined,
      realtimeEventsService,
    );
    const result = await service.createReport(
      "11111111-1111-4111-8111-111111111111",
      "22222222-2222-4222-8222-222222222222",
      "abusive",
      "details",
      {
        entityType: "chat_message",
        entityId: "33333333-3333-4333-8333-333333333333",
      },
    );

    expect(prisma.userReport.create).toHaveBeenCalledTimes(1);
    expect(prisma.moderationFlag.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          entityType: "chat_message",
          entityId: "33333333-3333-4333-8333-333333333333",
        }),
      }),
    );
    expect(prisma.auditLog.create).toHaveBeenCalledTimes(2);
    expect(realtimeEventsService.emitModerationNotice).toHaveBeenCalledWith(
      "22222222-2222-4222-8222-222222222222",
      expect.stringContaining("under review"),
    );
    expect(result.moderationFlagId).toBe("flag-1");
    expect(result.strike?.strikeCount).toBe(2);
  });

  it("creates user report without moderation flag when entity context is absent", async () => {
    const prisma: any = {
      userReport: {
        create: vi.fn().mockResolvedValue({ id: "report-1" }),
      },
      moderationFlag: {
        create: vi.fn(),
      },
      auditLog: {
        create: vi.fn().mockResolvedValue({}),
      },
    };

    const service = new ModerationService(prisma);
    const result = await service.createReport(
      "11111111-1111-4111-8111-111111111111",
      null,
      "spam",
    );

    expect(prisma.userReport.create).toHaveBeenCalledTimes(1);
    expect(prisma.moderationFlag.create).not.toHaveBeenCalled();
    expect(result.moderationFlagId).toBeNull();
    expect(result.strike).toBeNull();
  });

  it("issues strike, persists count, and escalates enforcement state", async () => {
    const prisma: any = {
      userPreference: {
        findFirst: vi.fn().mockResolvedValue({
          id: "pref-1",
          value: {
            count: 2,
            history: [],
          },
        }),
        update: vi.fn().mockResolvedValue({}),
      },
      userProfile: {
        upsert: vi.fn().mockResolvedValue({}),
      },
      user: {
        update: vi.fn(),
      },
      moderationFlag: {
        create: vi.fn().mockResolvedValue({}),
      },
      auditLog: {
        create: vi.fn().mockResolvedValue({}),
      },
    };
    const realtimeEventsService: any = {
      emitModerationNotice: vi.fn(),
    };

    const service = new ModerationService(
      prisma,
      undefined,
      realtimeEventsService,
    );
    const result = await service.issueStrike({
      moderatorUserId: "11111111-1111-4111-8111-111111111111",
      targetUserId: "22222222-2222-4222-8222-222222222222",
      reason: "harassment",
      severity: 1,
      entityType: "chat_message",
      entityId: "33333333-3333-4333-8333-333333333333",
    });

    expect(result.strikeCount).toBe(3);
    expect(result.action).toBe("restrict");
    expect(prisma.userPreference.update).toHaveBeenCalledTimes(1);
    expect(prisma.userProfile.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          moderationState: "blocked",
        }),
      }),
    );
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(realtimeEventsService.emitModerationNotice).toHaveBeenCalledWith(
      "22222222-2222-4222-8222-222222222222",
      expect.stringContaining("restrict"),
    );
  });

  it("returns enforcement status with strike history", async () => {
    const prisma: any = {
      userPreference: {
        findFirst: vi.fn().mockResolvedValue({
          id: "pref-1",
          value: {
            count: 4,
            history: [
              {
                issuedAt: "2026-03-19T00:00:00.000Z",
                reason: "abuse",
                severity: 1,
                moderatorUserId: "11111111-1111-4111-8111-111111111111",
              },
            ],
          },
        }),
      },
      userProfile: {
        findUnique: vi.fn().mockResolvedValue({ moderationState: "blocked" }),
      },
      user: {
        findUnique: vi.fn().mockResolvedValue({ status: "active" }),
      },
    };

    const service = new ModerationService(prisma);
    const result = await service.getEnforcementStatus(
      "22222222-2222-4222-8222-222222222222",
    );

    expect(result.strikeCount).toBe(4);
    expect(result.enforcementAction).toBe("restrict");
    expect(result.moderationState).toBe("blocked");
    expect(result.strikeHistory).toHaveLength(1);
  });

  it("marks target profile for review on impersonation reports", async () => {
    const prisma: any = {
      userReport: {
        create: vi.fn().mockResolvedValue({ id: "report-2" }),
      },
      userPreference: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: "pref-1" }),
      },
      userProfile: {
        upsert: vi.fn().mockResolvedValue({}),
        findUnique: vi.fn().mockResolvedValue({ moderationState: "review" }),
      },
      user: {
        update: vi.fn(),
      },
      moderationFlag: {
        create: vi.fn().mockResolvedValue({ id: "flag-2" }),
      },
      auditLog: {
        create: vi.fn().mockResolvedValue({}),
      },
    };

    const service = new ModerationService(prisma);
    const result = await service.createReport(
      "11111111-1111-4111-8111-111111111111",
      "22222222-2222-4222-8222-222222222222",
      "impersonation account",
      "pretending to be me",
      {
        entityType: "profile",
        entityId: "33333333-3333-4333-8333-333333333333",
      },
    );

    expect(prisma.userProfile.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          moderationState: "review",
        }),
      }),
    );
    expect(result.strike).toEqual(
      expect.objectContaining({
        strikeCount: 1,
      }),
    );
  });

  it("assesses blocked risk for high-risk content and spam patterns", () => {
    const service = new ModerationService({} as any);
    const result = service.assessContentRisk({
      content:
        "This is a bomb threat. visit https://bad.example now now now now now",
      surface: "agent_turn",
    });

    expect(result.decision).toBe("blocked");
    expect(result.score).toBeGreaterThan(0.7);
    expect(result.reasons).toEqual(
      expect.arrayContaining([expect.stringContaining("blocked_term")]),
    );
  });

  it("assesses clean risk for benign social text", () => {
    const service = new ModerationService({} as any);
    const result = service.assessContentRisk({
      content: "Looking for a tennis partner this evening",
      surface: "chat_message",
    });

    expect(result.decision).toBe("clean");
    expect(result.score).toBeLessThan(0.45);
  });
});
