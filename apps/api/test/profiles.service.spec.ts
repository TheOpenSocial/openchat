import { BadRequestException } from "@nestjs/common";
import { S3Client } from "@aws-sdk/client-s3";
import { NotificationType } from "@opensocial/types";
import { describe, expect, it, vi } from "vitest";
import { ProfilesService } from "../src/profiles/profiles.service.js";

function createService(
  prisma: any,
  overrides: {
    moderationService?: any;
    launchControlsService?: any;
  } = {},
) {
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
  const moderationService = overrides.moderationService ?? undefined;
  const launchControlsService = overrides.launchControlsService ?? undefined;

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
      moderationService,
      launchControlsService,
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

  it("accepts MEDIA_SIGNING_SECRET as media signing secret alias", async () => {
    const oldNodeEnv = process.env.NODE_ENV;
    const oldMediaUploadSigningSecret = process.env.MEDIA_UPLOAD_SIGNING_SECRET;
    const oldMediaSigningSecret = process.env.MEDIA_SIGNING_SECRET;
    const oldS3SecretKey = process.env.S3_SECRET_KEY;
    const oldPresignedUploadsEnabled = process.env.S3_PRESIGNED_UPLOADS_ENABLED;
    process.env.NODE_ENV = "production";
    delete process.env.MEDIA_UPLOAD_SIGNING_SECRET;
    process.env.MEDIA_SIGNING_SECRET = "alias-secret";
    delete process.env.S3_SECRET_KEY;
    process.env.S3_PRESIGNED_UPLOADS_ENABLED = "false";

    const prisma: any = {
      userProfileImage: {
        create: vi.fn().mockResolvedValue({
          id: "img-1",
        }),
      },
    };
    const { service } = createService(prisma);

    try {
      const result = await service.createPhotoUploadIntent(
        "11111111-1111-4111-8111-111111111111",
        {
          fileName: "avatar.png",
          mimeType: "image/png",
          byteSize: 123_456,
        },
      );
      expect(typeof result.uploadToken).toBe("string");
    } finally {
      process.env.NODE_ENV = oldNodeEnv;
      process.env.MEDIA_UPLOAD_SIGNING_SECRET = oldMediaUploadSigningSecret;
      process.env.MEDIA_SIGNING_SECRET = oldMediaSigningSecret;
      process.env.S3_SECRET_KEY = oldS3SecretKey;
      process.env.S3_PRESIGNED_UPLOADS_ENABLED = oldPresignedUploadsEnabled;
    }
  });

  it("requires dedicated media signing secret in production", async () => {
    const oldNodeEnv = process.env.NODE_ENV;
    const oldMediaUploadSigningSecret = process.env.MEDIA_UPLOAD_SIGNING_SECRET;
    const oldMediaSigningSecret = process.env.MEDIA_SIGNING_SECRET;
    const oldS3SecretKey = process.env.S3_SECRET_KEY;
    const oldPresignedUploadsEnabled = process.env.S3_PRESIGNED_UPLOADS_ENABLED;
    process.env.NODE_ENV = "production";
    delete process.env.MEDIA_UPLOAD_SIGNING_SECRET;
    delete process.env.MEDIA_SIGNING_SECRET;
    process.env.S3_SECRET_KEY = "legacy-fallback-secret";
    process.env.S3_PRESIGNED_UPLOADS_ENABLED = "false";

    const prisma: any = {
      userProfileImage: {
        create: vi.fn().mockResolvedValue({
          id: "img-1",
        }),
      },
    };
    const { service } = createService(prisma);

    try {
      await expect(
        service.createPhotoUploadIntent(
          "11111111-1111-4111-8111-111111111111",
          {
            fileName: "avatar.png",
            mimeType: "image/png",
            byteSize: 123_456,
          },
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    } finally {
      process.env.NODE_ENV = oldNodeEnv;
      process.env.MEDIA_UPLOAD_SIGNING_SECRET = oldMediaUploadSigningSecret;
      process.env.MEDIA_SIGNING_SECRET = oldMediaSigningSecret;
      process.env.S3_SECRET_KEY = oldS3SecretKey;
      process.env.S3_PRESIGNED_UPLOADS_ENABLED = oldPresignedUploadsEnabled;
    }
  });

  it("rejects completion when uploaded object metadata mismatches S3", async () => {
    const oldPresignedUploadsEnabled = process.env.S3_PRESIGNED_UPLOADS_ENABLED;
    process.env.S3_PRESIGNED_UPLOADS_ENABLED = "true";
    const sendSpy = vi
      .spyOn(S3Client.prototype as any, "send")
      .mockResolvedValue({
        ContentLength: 100_000,
        ContentType: "image/png",
      });

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
    const uploadToken = (service as any).createUploadToken({
      imageId: "img-1",
      userId: "11111111-1111-4111-8111-111111111111",
      storageKey: "profiles/11111111-1111-4111-8111-111111111111/avatar.png",
      mimeType: "image/png",
      byteSize: 120_000,
      expiresAt: new Date(Date.now() + 60_000),
    });

    try {
      await expect(
        service.confirmPhotoUpload(
          "11111111-1111-4111-8111-111111111111",
          "img-1",
          {
            uploadToken,
            byteSize: 120_000,
          },
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    } finally {
      sendSpy.mockRestore();
      process.env.S3_PRESIGNED_UPLOADS_ENABLED = oldPresignedUploadsEnabled;
    }
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

  it("falls back to inline processing when media queue enqueue fails", async () => {
    const prisma: any = {
      userProfileImage: {
        findFirst: vi.fn().mockResolvedValue({
          id: "img-1",
          userId: "11111111-1111-4111-8111-111111111111",
          status: "pending_upload",
          originalUrl:
            "profiles/11111111-1111-4111-8111-111111111111/avatar.png",
        }),
        findUnique: vi.fn().mockResolvedValue({
          id: "img-1",
          userId: "11111111-1111-4111-8111-111111111111",
          status: "processing",
          originalUrl:
            "profiles/11111111-1111-4111-8111-111111111111/avatar.png",
        }),
        update: vi
          .fn()
          .mockResolvedValueOnce({})
          .mockResolvedValueOnce({ id: "img-1", status: "pending_review" }),
      },
      moderationFlag: {
        create: vi.fn().mockResolvedValue({}),
      },
    };

    const { service, queue } = createService(prisma, {
      launchControlsService: {
        getSnapshot: vi.fn().mockResolvedValue({
          globalKillSwitch: false,
          enableModerationAvatars: false,
        }),
      },
    });
    queue.add.mockRejectedValueOnce(new Error("redis unavailable"));

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
      },
    );

    expect(result.status).toBe("processing");
    expect(queue.add).toHaveBeenCalledTimes(1);
    expect(prisma.userProfileImage.findUnique).toHaveBeenCalledWith({
      where: { id: "img-1" },
    });
    expect(prisma.userProfileImage.update).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: { id: "img-1" },
        data: expect.objectContaining({
          status: "pending_review",
        }),
      }),
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

  it("marks uploaded profile photos as pending review", async () => {
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
          status: "pending_review",
          originalUrl:
            "profiles/11111111-1111-4111-8111-111111111111/avatar.png",
          thumbUrl: null,
        }),
      },
      moderationFlag: {
        create: vi.fn().mockResolvedValue({}),
      },
    };

    const { service } = createService(prisma);
    const result = await service.processProfilePhoto("img-1");

    expect(result.moderationResult).toBe("pending_review");
    expect(prisma.userProfileImage.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "pending_review",
          thumbUrl: null,
        }),
      }),
    );
    expect(prisma.moderationFlag.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          reason: "profile_image_pending_review",
          status: "open",
        }),
      }),
    );

    process.env.MEDIA_CDN_BASE_URL = oldCdnBase;
  });

  it("marks suspiciously named photos as pending review instead of auto-reject", async () => {
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
          status: "pending_review",
          thumbUrl: null,
        }),
      },
      moderationFlag: {
        create: vi.fn().mockResolvedValue({ id: "flag-1" }),
      },
    };

    const { service, notificationsService } = createService(prisma);
    const result = await service.processProfilePhoto("img-2");

    expect(result.moderationResult).toBe("pending_review");
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
      expect.stringContaining("under review"),
    );
  });

  it("passes byte-signature metadata to avatar moderation decision", async () => {
    const oldPresignedUploadsEnabled = process.env.S3_PRESIGNED_UPLOADS_ENABLED;
    process.env.S3_PRESIGNED_UPLOADS_ENABLED = "true";

    const sendSpy = vi
      .spyOn(S3Client.prototype as any, "send")
      .mockResolvedValueOnce({
        ContentLength: 1024,
        ContentType: "image/png",
      })
      .mockResolvedValueOnce({
        Body: {
          transformToByteArray: async () =>
            Uint8Array.from([
              0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00,
              0x00,
            ]),
        },
      });

    const prisma: any = {
      userProfileImage: {
        findUnique: vi.fn().mockResolvedValue({
          id: "img-byte-meta",
          userId: "11111111-1111-4111-8111-111111111111",
          status: "processing",
          originalUrl:
            "profiles/11111111-1111-4111-8111-111111111111/avatar.png",
        }),
        update: vi.fn().mockResolvedValue({
          id: "img-byte-meta",
          status: "approved",
          thumbUrl: null,
        }),
      },
      moderationFlag: {
        create: vi.fn().mockResolvedValue({}),
      },
    };
    const moderationService = {
      submitForModeration: vi.fn().mockResolvedValue({
        riskLevel: "allow",
      }),
    };

    try {
      const { service } = createService(prisma, { moderationService });
      await service.processProfilePhoto("img-byte-meta");

      expect(moderationService.submitForModeration).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            mimeType: "image/png",
            magicMimeType: "image/png",
            byteSize: 1024,
            byteSampleLength: 12,
            byteSampleSha256: expect.any(String),
          }),
        }),
      );
    } finally {
      sendSpy.mockRestore();
      process.env.S3_PRESIGNED_UPLOADS_ENABLED = oldPresignedUploadsEnabled;
    }
  });

  it("falls back to pending review when avatar moderation throws", async () => {
    const prisma: any = {
      userProfileImage: {
        findUnique: vi.fn().mockResolvedValue({
          id: "img-moderation-fail",
          userId: "11111111-1111-4111-8111-111111111111",
          status: "processing",
          originalUrl:
            "profiles/11111111-1111-4111-8111-111111111111/avatar.png",
        }),
        update: vi.fn().mockResolvedValue({
          id: "img-moderation-fail",
          status: "pending_review",
          thumbUrl: null,
        }),
      },
      moderationFlag: {
        create: vi.fn().mockResolvedValue({}),
      },
    };

    const { service, notificationsService } = createService(prisma, {
      moderationService: {
        submitForModeration: vi
          .fn()
          .mockRejectedValue(new Error("moderation unavailable")),
      },
    });

    const result = await service.processProfilePhoto("img-moderation-fail");

    expect(result.moderationResult).toBe("pending_review");
    expect(prisma.userProfileImage.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "img-moderation-fail" },
        data: expect.objectContaining({
          status: "pending_review",
        }),
      }),
    );
    expect(notificationsService.createInAppNotification).toHaveBeenCalledWith(
      "11111111-1111-4111-8111-111111111111",
      NotificationType.MODERATION_NOTICE,
      expect.stringContaining("under review"),
    );
  });

  it("does not fail profile photo processing when moderation notice delivery throws", async () => {
    const prisma: any = {
      userProfileImage: {
        findUnique: vi.fn().mockResolvedValue({
          id: "img-notification-fail",
          userId: "11111111-1111-4111-8111-111111111111",
          status: "processing",
          originalUrl:
            "profiles/11111111-1111-4111-8111-111111111111/avatar.png",
        }),
        update: vi.fn().mockResolvedValue({
          id: "img-notification-fail",
          status: "pending_review",
          thumbUrl: null,
        }),
      },
      moderationFlag: {
        create: vi.fn().mockResolvedValue({}),
      },
    };

    const { service, notificationsService } = createService(prisma);
    notificationsService.createInAppNotification.mockRejectedValueOnce(
      new Error("notifications unavailable"),
    );

    const result = await service.processProfilePhoto("img-notification-fail");

    expect(result.moderationResult).toBe("pending_review");
    expect(prisma.userProfileImage.update).toHaveBeenCalled();
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
