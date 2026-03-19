import { describe, expect, it, vi } from "vitest";
import { ProfilesService } from "../src/profiles/profiles.service.js";

describe("ProfilesService", () => {
  it("returns completion status from profile + interests", async () => {
    const prisma: any = {
      userProfile: {
        findUnique: vi.fn().mockResolvedValue({
          userId: "11111111-1111-4111-8111-111111111111",
          bio: "Builder",
          city: "Buenos Aires",
          country: "AR",
        }),
      },
      userInterest: {
        count: vi.fn().mockResolvedValue(2),
      },
    };

    const service = new ProfilesService(prisma);
    const completion = await service.getProfileCompletion(
      "11111111-1111-4111-8111-111111111111",
    );

    expect(completion.completed).toBe(true);
    expect(completion.onboardingState).toBe("complete");
  });

  it("stores profile onboarding state while updating profile", async () => {
    const prisma: any = {
      userProfile: {
        findUnique: vi.fn().mockResolvedValue({
          userId: "11111111-1111-4111-8111-111111111111",
          bio: null,
          city: null,
          country: null,
        }),
        upsert: vi.fn().mockResolvedValue({}),
      },
      userInterest: {
        count: vi.fn().mockResolvedValue(0),
      },
    };

    const service = new ProfilesService(prisma);
    await service.upsertProfile("11111111-1111-4111-8111-111111111111", {
      bio: "Starting profile",
    });

    expect(prisma.userProfile.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          onboardingState: "profile_started",
        }),
      }),
    );
  });

  it("replaces interests with normalized labels", async () => {
    const prisma: any = {
      userInterest: {
        deleteMany: vi.fn().mockResolvedValue({}),
        createMany: vi.fn().mockResolvedValue({}),
        findMany: vi
          .fn()
          .mockResolvedValue([{ label: "AI  ", normalizedLabel: "ai" }]),
      },
    };

    const service = new ProfilesService(prisma);
    await service.replaceInterests("11111111-1111-4111-8111-111111111111", [
      { kind: "topic", label: "AI  " },
    ]);

    expect(prisma.userInterest.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({
            normalizedLabel: "ai",
          }),
        ]),
      }),
    );
  });

  it("stores intent-type preference rules", async () => {
    const prisma: any = {
      userRule: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: "rule-1" }),
      },
    };

    const service = new ProfilesService(prisma);
    const result = await service.setIntentTypePreference(
      "11111111-1111-4111-8111-111111111111",
      "chat" as any,
      { autoSend: false },
    );

    expect(result.id).toBe("rule-1");
    expect(prisma.userRule.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          scope: "intent_type",
          ruleType: "chat",
        }),
      }),
    );
  });
});
