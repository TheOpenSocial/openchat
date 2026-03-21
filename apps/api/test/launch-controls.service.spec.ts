import { afterEach, describe, expect, it, vi } from "vitest";
import { LaunchControlsService } from "../src/launch-controls/launch-controls.service.js";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("LaunchControlsService", () => {
  it("returns env defaults when no stored overrides exist", async () => {
    process.env.FEATURE_GLOBAL_KILL_SWITCH = "false";
    process.env.FEATURE_INVITE_ONLY_MODE = "true";
    process.env.FEATURE_ALPHA_COHORT_USER_IDS =
      "11111111-1111-4111-8111-111111111111";
    process.env.FEATURE_ENABLE_NEW_INTENTS = "true";
    process.env.FEATURE_ENABLE_AGENT_FOLLOWUPS = "false";
    process.env.FEATURE_ENABLE_DISCOVERY = "false";
    process.env.FEATURE_ENABLE_PERSONALIZATION = "true";
    process.env.FEATURE_ENABLE_MODERATION_STRICTNESS = "true";

    const prisma: any = {
      userPreference: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    };

    const service = new LaunchControlsService(prisma);
    const snapshot = await service.getSnapshot(true);

    expect(snapshot.globalKillSwitch).toBe(false);
    expect(snapshot.inviteOnlyMode).toBe(true);
    expect(snapshot.alphaCohortUserIds).toEqual([
      "11111111-1111-4111-8111-111111111111",
    ]);
    expect(snapshot.enableNewIntents).toBe(true);
    expect(snapshot.enableAgentFollowups).toBe(false);
    expect(snapshot.enableDiscovery).toBe(false);
    expect(snapshot.enablePersonalization).toBe(true);
    expect(snapshot.enableModerationStrictness).toBe(true);
  });

  it("updates controls and writes audit metadata", async () => {
    const findMany = vi.fn().mockResolvedValue([
      { key: "launch.global_kill_switch", value: true },
      { key: "launch.enable_new_intents", value: false },
      { key: "launch.enable_discovery", value: false },
    ]);
    const prisma: any = {
      userPreference: {
        findMany,
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({}),
        update: vi.fn().mockResolvedValue({}),
      },
      auditLog: {
        create: vi.fn().mockResolvedValue({ id: "audit-1" }),
      },
    };

    const service = new LaunchControlsService(prisma);
    const updated = await service.updateControls({
      actorUserId: "11111111-1111-4111-8111-111111111111",
      reason: "staging toggle",
      globalKillSwitch: true,
      enableNewIntents: false,
      enableDiscovery: false,
    });

    expect(prisma.userPreference.create).toHaveBeenCalled();
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "launch_controls.updated",
        }),
      }),
    );
    expect(updated.globalKillSwitch).toBe(true);
    expect(updated.enableNewIntents).toBe(false);
    expect(updated.enableDiscovery).toBe(false);
  });

  it("blocks non-cohort users when invite-only mode is enabled", async () => {
    const prisma: any = {
      userPreference: {
        findMany: vi.fn().mockResolvedValue([
          { key: "launch.invite_only_mode", value: true },
          {
            key: "launch.alpha_cohort_user_ids",
            value: ["11111111-1111-4111-8111-111111111111"],
          },
        ]),
      },
    };

    const service = new LaunchControlsService(prisma);

    await expect(
      service.assertActionAllowed(
        "new_intents",
        "22222222-2222-4222-8222-222222222222",
      ),
    ).rejects.toThrow("alpha cohort");
  });

  it("blocks discovery actions when discovery flag is disabled", async () => {
    const prisma: any = {
      userPreference: {
        findMany: vi
          .fn()
          .mockResolvedValue([
            { key: "launch.enable_discovery", value: false },
          ]),
      },
    };

    const service = new LaunchControlsService(prisma);

    await expect(
      service.assertActionAllowed(
        "discovery",
        "11111111-1111-4111-8111-111111111111",
      ),
    ).rejects.toThrow("disabled");
  });

  it("blocks recurring circles when recurring circles flag is disabled", async () => {
    const prisma: any = {
      userPreference: {
        findMany: vi
          .fn()
          .mockResolvedValue([
            { key: "launch.enable_recurring_circles", value: false },
          ]),
      },
    };

    const service = new LaunchControlsService(prisma);

    await expect(
      service.assertActionAllowed(
        "recurring_circles",
        "11111111-1111-4111-8111-111111111111",
      ),
    ).rejects.toThrow("disabled");
  });
});
