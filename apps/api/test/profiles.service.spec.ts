import { BadRequestException } from "@nestjs/common";
import { NotificationType } from "@opensocial/types";
import { describe, expect, it, vi } from "vitest";
import { ProfilesService } from "../src/profiles/profiles.service.js";

function createService(prisma: any) {
  const queue = {
    add: vi.fn().mockResolvedValue({ id: "job-1" }),
  };
  const notificationsService = {
    createInAppNotification: vi.fn().mockResolvedValue({}),
  };
  const matchingService = {
    upsertUserProfileEmbedding: vi.fn().mockResolvedValue({}),
    upsertInterestTopicEmbeddings: vi.fn().mockResolvedValue({}),
  };
  const analyticsService = {
    trackEvent: vi.fn().mockResolvedValue({}),
  };

  return {
    queue,
    notificationsService,
    matchingService,
    analyticsService,
    service: new ProfilesService(
      prisma,
      notificationsService as any,
      matchingService as any,
      queue as any,
      analyticsService as any,
    ),
  };
}

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

    const { service } = createService(prisma);
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

    const { service, matchingService } = createService(prisma);
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
    expect(matchingService.upsertUserProfileEmbedding).toHaveBeenCalledWith(
      "11111111-1111-4111-8111-111111111111",
    );
  });

  it("emits profile-completed analytics when onboarding transitions to complete", async () => {
    const prisma: any = {
      userProfile: {
        findUnique: vi.fn().mockResolvedValue({
          userId: "11111111-1111-4111-8111-111111111111",
          onboardingState: "profile_started",
          bio: "Existing bio",
          city: "Buenos Aires",
          country: "AR",
        }),
        upsert: vi.fn().mockResolvedValue({}),
      },
      userInterest: {
        count: vi.fn().mockResolvedValue(2),
      },
    };

    const { service, analyticsService } = createService(prisma);
    await service.upsertProfile("11111111-1111-4111-8111-111111111111", {
      bio: "Updated bio",
      city: "Buenos Aires",
      country: "AR",
    });

    expect(analyticsService.trackEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "profile_completed",
        actorUserId: "11111111-1111-4111-8111-111111111111",
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
      userProfile: {
        findUnique: vi.fn().mockResolvedValue(null),
      },
    };

    const { service, matchingService } = createService(prisma);
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
    expect(matchingService.upsertInterestTopicEmbeddings).toHaveBeenCalledWith(
      "11111111-1111-4111-8111-111111111111",
    );
  });

  it("stores intent-type preference rules", async () => {
    const prisma: any = {
      userRule: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: "rule-1" }),
      },
    };

    const { service } = createService(prisma);
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

  it("creates direct upload intent for a profile photo", async () => {
    const prisma: any = {
      userProfileImage: {
        create: vi.fn().mockResolvedValue({
          id: "img-1",
        }),
      },
    };

    const { service } = createService(prisma);
    const result = await service.createPhotoUploadIntent(
      "11111111-1111-4111-8111-111111111111",
      {
        fileName: "my avatar.png",
        mimeType: "image/png",
        byteSize: 123_456,
      },
    );

    expect(prisma.userProfileImage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "pending_upload",
        }),
      }),
    );
    expect(result.storageKey).toContain(
      "profiles/11111111-1111-4111-8111-111111111111/",
    );
    expect(result.uploadUrl).toContain("upload=1");
    expect(typeof result.uploadToken).toBe("string");
  });

  it("queues media-processing when upload is confirmed", async () => {
    const prisma: any = {
      userProfileImage: {
        findFirst: vi.fn().mockResolvedValue({
          id: "img-1",
          userId: "11111111-1111-4111-8111-111111111111",
          status: "pending_upload",
          originalUrl:
            "profiles/11111111-1111-4111-8111-111111111111/avatar.png",
        }),
        update: vi.fn().mockResolvedValue({}),
      },
    };

    const { service, queue } = createService(prisma);
    const uploadToken = (service as any).createUploadToken({
      imageId: "img-1",
      userId: "11111111-1111-4111-8111-111111111111",
      storageKey: "profiles/11111111-1111-4111-8111-111111111111/avatar.png",
      mimeType: "image/png",
      byteSize: 120_000,
      expiresAt: new Date(Date.now() + 60_000),
    });
    const result = await service.confirmPhotoUpload(
      "11111111-1111-4111-8111-111111111111",
      "img-1",
      {
        uploadToken,
        byteSize: 120_000,
        width: 512,
        height: 512,
      },
    );

    expect(result.status).toBe("processing");
    expect(prisma.userProfileImage.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "img-1" },
        data: expect.objectContaining({
          status: "processing",
        }),
      }),
    );
    expect(queue.add).toHaveBeenCalledWith(
      "ProfilePhotoUploaded",
      expect.objectContaining({
        type: "ProfilePhotoUploaded",
        idempotencyKey: "profile-photo-uploaded:img-1",
        payload: expect.objectContaining({
          imageId: "img-1",
        }),
      }),
      expect.any(Object),
    );
  });

  it("rejects upload confirmation with invalid token", async () => {
    const prisma: any = {
      userProfileImage: {
        findFirst: vi.fn().mockResolvedValue({
          id: "img-1",
          userId: "11111111-1111-4111-8111-111111111111",
          status: "pending_upload",
          originalUrl:
            "profiles/11111111-1111-4111-8111-111111111111/avatar.png",
        }),
      },
    };

    const { service } = createService(prisma);
    await expect(
      service.confirmPhotoUpload(
        "11111111-1111-4111-8111-111111111111",
        "img-1",
        {
          uploadToken: "invalid.token",
          byteSize: 120_000,
          width: 512,
          height: 512,
        },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("approves profile photos and creates CDN + thumbnail URLs", async () => {
    const oldCdnBase = process.env.MEDIA_CDN_BASE_URL;
    process.env.MEDIA_CDN_BASE_URL = "https://cdn.example.com/media";

    const prisma: any = {
      userProfileImage: {
        findUnique: vi.fn().mockResolvedValue({
          id: "img-1",
          userId: "11111111-1111-4111-8111-111111111111",
          status: "processing",
          originalUrl:
            "profiles/11111111-1111-4111-8111-111111111111/avatar.png",
        }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        update: vi.fn().mockResolvedValue({
          id: "img-1",
          status: "approved",
          originalUrl:
            "https://cdn.example.com/media/profiles/11111111-1111-4111-8111-111111111111/avatar.png",
          thumbUrl:
            "https://cdn.example.com/media/profiles/11111111-1111-4111-8111-111111111111/avatar.png?variant=avatar_256",
        }),
      },
      moderationFlag: {
        create: vi.fn().mockResolvedValue({}),
      },
    };

    const { service } = createService(prisma);
    const result = await service.processProfilePhoto("img-1");

    expect(result.moderationResult).toBe("approved");
    expect(prisma.userProfileImage.updateMany).toHaveBeenCalled();
    expect(prisma.userProfileImage.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "approved",
        }),
      }),
    );
    expect(prisma.moderationFlag.create).not.toHaveBeenCalled();

    process.env.MEDIA_CDN_BASE_URL = oldCdnBase;
  });

  it("flags rejected photos in moderation", async () => {
    const prisma: any = {
      userProfileImage: {
        findUnique: vi.fn().mockResolvedValue({
          id: "img-2",
          userId: "11111111-1111-4111-8111-111111111111",
          status: "processing",
          originalUrl:
            "profiles/11111111-1111-4111-8111-111111111111/nsfw-avatar.png",
        }),
        update: vi.fn().mockResolvedValue({
          id: "img-2",
          status: "rejected",
          thumbUrl: null,
        }),
      },
      moderationFlag: {
        create: vi.fn().mockResolvedValue({ id: "flag-1" }),
      },
    };

    const { service, notificationsService } = createService(prisma);
    const result = await service.processProfilePhoto("img-2");

    expect(result.moderationResult).toBe("rejected");
    expect(prisma.moderationFlag.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          entityType: "user_profile_image",
          entityId: "img-2",
        }),
      }),
    );
    expect(notificationsService.createInAppNotification).toHaveBeenCalledWith(
      "11111111-1111-4111-8111-111111111111",
      NotificationType.MODERATION_NOTICE,
      expect.stringContaining("rejected"),
    );
  });

  it("returns fallback avatar when user has no approved photos", async () => {
    const prisma: any = {
      userProfileImage: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
      user: {
        findUnique: vi.fn().mockResolvedValue({ displayName: "Jane Doe" }),
      },
    };

    const { service } = createService(prisma);
    const result = await service.getPrimaryProfilePhoto(
      "11111111-1111-4111-8111-111111111111",
    );

    expect(result.kind).toBe("fallback");
    expect(result.originalUrl.startsWith("data:image/svg+xml;base64,")).toBe(
      true,
    );
  });

  it("computes trusted badge and clean safety labels", async () => {
    const prisma: any = {
      userProfile: {
        findUnique: vi.fn().mockResolvedValue({
          trustScore: 8.5,
          moderationState: "clean",
        }),
      },
      user: {
        findUnique: vi.fn().mockResolvedValue({
          createdAt: new Date(Date.now() - 45 * 86_400_000),
          email: "user@example.com",
          googleSubjectId: "google-sub",
        }),
      },
      userReport: {
        count: vi.fn().mockResolvedValue(0),
      },
      block: {
        count: vi.fn().mockResolvedValue(0),
      },
    };

    const { service } = createService(prisma);
    const result = await service.getTrustProfile(
      "11111111-1111-4111-8111-111111111111",
    );

    expect(result.verificationBadge).toBe("trusted");
    expect(result.reputationScore).toBeCloseTo(8.5, 5);
    expect(result.safetyLabels).toContain("established_account");
    expect(result.safetyLabels).not.toContain("reported");
  });

  it("adds risk labels for reports, blocks, and moderation state", async () => {
    const prisma: any = {
      userProfile: {
        findUnique: vi.fn().mockResolvedValue({
          trustScore: 6.0,
          moderationState: "flagged",
        }),
      },
      user: {
        findUnique: vi.fn().mockResolvedValue({
          createdAt: new Date(Date.now() - 3 * 86_400_000),
          email: null,
          googleSubjectId: null,
        }),
      },
      userReport: {
        count: vi.fn().mockResolvedValue(2),
      },
      block: {
        count: vi.fn().mockResolvedValue(4),
      },
    };

    const { service } = createService(prisma);
    const result = await service.getTrustProfile(
      "11111111-1111-4111-8111-111111111111",
    );

    expect(result.verificationBadge).toBe("unverified");
    expect(result.safetyLabels).toEqual(
      expect.arrayContaining([
        "new_account",
        "moderation_flagged",
        "reported",
        "high_block_rate",
      ]),
    );
    expect(result.reputationScore).toBeLessThan(6);
  });

  it("rejects oversized uploads", async () => {
    const prisma: any = {
      userProfileImage: {
        create: vi.fn().mockResolvedValue({ id: "img-3" }),
      },
    };

    const { service } = createService(prisma);

    await expect(
      service.createPhotoUploadIntent("11111111-1111-4111-8111-111111111111", {
        fileName: "huge.png",
        mimeType: "image/png",
        byteSize: 20 * 1024 * 1024,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("blocks harmful profile text updates", async () => {
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
      moderationFlag: {
        create: vi.fn().mockResolvedValue({}),
      },
    };

    const { service, notificationsService } = createService(prisma);
    await expect(
      service.upsertProfile("11111111-1111-4111-8111-111111111111", {
        bio: "I support a terror attack group",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.moderationFlag.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          entityType: "user_profile",
        }),
      }),
    );
    expect(prisma.userProfile.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          moderationState: "blocked",
        }),
      }),
    );
    expect(notificationsService.createInAppNotification).toHaveBeenCalledWith(
      "11111111-1111-4111-8111-111111111111",
      NotificationType.MODERATION_NOTICE,
      expect.stringContaining("blocked"),
    );
  });

  it("marks profile text as review when suspicious terms are detected", async () => {
    const prisma: any = {
      userProfile: {
        findUnique: vi.fn().mockResolvedValue({
          userId: "11111111-1111-4111-8111-111111111111",
          bio: null,
          city: null,
          country: null,
        }),
        upsert: vi.fn().mockResolvedValue({ id: "profile-1" }),
      },
      userInterest: {
        count: vi.fn().mockResolvedValue(0),
      },
      moderationFlag: {
        create: vi.fn().mockResolvedValue({}),
      },
    };

    const { service, notificationsService } = createService(prisma);
    await service.upsertProfile("11111111-1111-4111-8111-111111111111", {
      bio: "I can impersonate anyone you need",
    });

    expect(prisma.userProfile.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          moderationState: "review",
        }),
      }),
    );
    expect(notificationsService.createInAppNotification).toHaveBeenCalledWith(
      "11111111-1111-4111-8111-111111111111",
      NotificationType.MODERATION_NOTICE,
      expect.stringContaining("pending moderation review"),
    );
  });
});
