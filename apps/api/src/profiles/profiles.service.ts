import { InjectQueue } from "@nestjs/bullmq";
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import { IntentType, NotificationType } from "@opensocial/types";
import { Prisma } from "@prisma/client";
import { Queue } from "bullmq";
import {
  createHash,
  createHmac,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { AnalyticsService } from "../analytics/analytics.service.js";
import { PrismaService } from "../database/prisma.service.js";
import { MatchingService } from "../matching/matching.service.js";
import { NotificationsService } from "../notifications/notifications.service.js";

type ProfileUpdatePayload = {
  bio?: string;
  city?: string;
  country?: string;
  visibility?: "public" | "limited" | "private";
};

type ProfilePhotoMimeType = "image/jpeg" | "image/png" | "image/webp";

const PROFILE_PHOTO_MAX_BYTES = 10 * 1024 * 1024;
const PROFILE_PHOTO_MIN_BYTES = 512;
const PROFILE_PHOTO_UPLOAD_EXPIRY_MS = 15 * 60 * 1000;
const PROFILE_PHOTO_UPLOAD_TOKEN_VERSION = 1;
const PROFILE_TEXT_BLOCKLIST = [
  "kill yourself",
  "terror attack",
  "sexual assault",
  "hate group",
  "buy drugs",
];
const PROFILE_TEXT_REVIEWLIST = [
  "impersonate",
  "minor meetup",
  "weapon sale",
  "escort service",
];

type TextModerationResult = {
  decision: "clean" | "review" | "blocked";
  matchedTerms: string[];
};

interface UploadTokenPayload {
  version: number;
  imageId: string;
  userId: string;
  storageKey: string;
  mimeType: ProfilePhotoMimeType;
  byteSize: number;
  expiresAt: string;
}

@Injectable()
export class ProfilesService {
  private readonly logger = new Logger(ProfilesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    private readonly matchingService: MatchingService,
    @InjectQueue("media-processing")
    private readonly mediaProcessingQueue: Queue,
    @Optional()
    private readonly analyticsService?: AnalyticsService,
  ) {}

  async getProfile(userId: string) {
    return this.prisma.userProfile.findUnique({ where: { userId } });
  }

  async upsertProfile(userId: string, payload: ProfileUpdatePayload) {
    const existing = await this.prisma.userProfile.findUnique({
      where: { userId },
    });
    const merged = {
      bio: payload.bio ?? existing?.bio ?? null,
      city: payload.city ?? existing?.city ?? null,
      country: payload.country ?? existing?.country ?? null,
    };
    const interestCount = await this.prisma.userInterest.count({
      where: { userId },
    });
    const completion = this.computeProfileCompletion({
      ...merged,
      interestCount,
    });
    const textModeration = await this.moderateProfileTextFields(
      userId,
      [merged.bio, merged.city, merged.country],
      "profile_text",
    );
    if (textModeration.decision === "blocked") {
      await this.markProfileModerationState(userId, "blocked");
      throw new BadRequestException("profile text violates moderation policy");
    }

    const result = await this.prisma.userProfile.upsert({
      where: { userId },
      update: {
        ...payload,
        ...(textModeration.decision === "review"
          ? { moderationState: "review" }
          : {}),
        onboardingState: completion.onboardingState,
      },
      create: {
        userId,
        ...payload,
        ...(textModeration.decision === "review"
          ? { moderationState: "review" }
          : {}),
        onboardingState: completion.onboardingState,
      },
    });
    if (
      (existing?.onboardingState ?? "not_started") !== "complete" &&
      completion.onboardingState === "complete"
    ) {
      await this.trackAnalyticsEventSafe({
        eventType: "profile_completed",
        actorUserId: userId,
        entityType: "user_profile",
        entityId: userId,
        properties: {
          source: "profile_update",
          checks: completion.checks,
        },
      });
    }

    await this.safeRefreshEmbeddings(userId, {
      includeInterestTopicVectors: false,
    });
    return result;
  }

  async getProfileCompletion(userId: string) {
    const profile = await this.prisma.userProfile.findUnique({
      where: { userId },
    });
    const interestCount = await this.prisma.userInterest.count({
      where: { userId },
    });

    return this.computeProfileCompletion({
      bio: profile?.bio ?? null,
      city: profile?.city ?? null,
      country: profile?.country ?? null,
      interestCount,
    });
  }

  async getTrustProfile(userId: string) {
    const [profile, user, openReportCount, receivedBlockCount] =
      await Promise.all([
        this.prisma.userProfile.findUnique({
          where: { userId },
          select: {
            trustScore: true,
            moderationState: true,
          },
        }),
        this.prisma.user.findUnique({
          where: { id: userId },
          select: {
            createdAt: true,
            email: true,
            googleSubjectId: true,
          },
        }),
        this.prisma.userReport.count({
          where: {
            targetUserId: userId,
            status: "open",
          },
        }),
        this.prisma.block.count({
          where: {
            blockedUserId: userId,
          },
        }),
      ]);

    const trustScore = Number(profile?.trustScore ?? 0);
    const reportPenalty = Math.min(openReportCount * 0.5, 3);
    const blockPenalty = Math.min(receivedBlockCount * 0.25, 2);
    const reputationScore = this.clampNumber(
      trustScore - reportPenalty - blockPenalty,
      0,
      10,
    );
    const accountAgeDays = user
      ? Math.floor((Date.now() - user.createdAt.getTime()) / 86_400_000)
      : 0;
    const accountFreshnessLabel =
      accountAgeDays < 7
        ? "new_account"
        : accountAgeDays < 30
          ? "recent_account"
          : "established_account";
    const verificationBadge = this.resolveVerificationBadge({
      accountAgeDays,
      hasEmail: Boolean(user?.email),
      hasGoogleIdentity: Boolean(user?.googleSubjectId),
      openReportCount,
      receivedBlockCount,
    });

    const safetyLabels = [
      accountFreshnessLabel,
      ...(profile?.moderationState && profile.moderationState !== "clean"
        ? [`moderation_${profile.moderationState}`]
        : []),
      ...(openReportCount > 0 ? ["reported"] : []),
      ...(receivedBlockCount >= 3 ? ["high_block_rate"] : []),
    ];

    return {
      userId,
      verificationBadge,
      trustScore,
      reputationScore,
      moderationState: profile?.moderationState ?? "clean",
      accountAgeDays,
      reportCountOpen: openReportCount,
      blockCountReceived: receivedBlockCount,
      safetyLabels,
    };
  }

  listInterests(userId: string) {
    return this.prisma.userInterest.findMany({
      where: { userId },
      orderBy: [{ kind: "asc" }, { normalizedLabel: "asc" }],
    });
  }

  async replaceInterests(
    userId: string,
    interests: Array<{
      kind: string;
      label: string;
      weight?: number;
      source?: string;
    }>,
  ) {
    const moderation = await this.moderateProfileTextFields(
      userId,
      interests.map((interest) => interest.label),
      "profile_interest",
    );
    if (moderation.decision === "blocked") {
      await this.markProfileModerationState(userId, "blocked");
      throw new BadRequestException("interest text violates moderation policy");
    }

    await this.prisma.userInterest.deleteMany({ where: { userId } });
    if (interests.length === 0) {
      return [];
    }

    await this.prisma.userInterest.createMany({
      data: interests.map((interest) => ({
        userId,
        kind: interest.kind,
        label: interest.label,
        normalizedLabel: this.normalizeLabel(interest.label),
        weight: interest.weight ?? 1,
        source: interest.source ?? "user",
      })),
    });

    const [result, profile] = await Promise.all([
      this.listInterests(userId),
      this.prisma.userProfile.findUnique({
        where: { userId },
        select: {
          onboardingState: true,
          bio: true,
          city: true,
          country: true,
        },
      }),
    ]);
    if (profile) {
      const completion = this.computeProfileCompletion({
        bio: profile.bio,
        city: profile.city,
        country: profile.country,
        interestCount: result.length,
      });
      if (profile.onboardingState !== completion.onboardingState) {
        await this.prisma.userProfile.update({
          where: { userId },
          data: {
            onboardingState: completion.onboardingState,
          },
        });
      }
      if (
        profile.onboardingState !== "complete" &&
        completion.onboardingState === "complete"
      ) {
        await this.trackAnalyticsEventSafe({
          eventType: "profile_completed",
          actorUserId: userId,
          entityType: "user_profile",
          entityId: userId,
          properties: {
            source: "interest_update",
            checks: completion.checks,
          },
        });
      }
    }
    await this.safeRefreshEmbeddings(userId, {
      includeInterestTopicVectors: true,
    });
    return result;
  }

  listTopics(userId: string) {
    return this.prisma.userTopic.findMany({
      where: { userId },
      orderBy: [{ normalizedLabel: "asc" }],
    });
  }

  async replaceTopics(
    userId: string,
    topics: Array<{
      label: string;
      weight?: number;
      source?: string;
    }>,
  ) {
    const moderation = await this.moderateProfileTextFields(
      userId,
      topics.map((topic) => topic.label),
      "profile_topic",
    );
    if (moderation.decision === "blocked") {
      await this.markProfileModerationState(userId, "blocked");
      throw new BadRequestException("topic text violates moderation policy");
    }

    await this.prisma.userTopic.deleteMany({ where: { userId } });
    if (topics.length === 0) {
      return [];
    }

    await this.prisma.userTopic.createMany({
      data: topics.map((topic) => ({
        userId,
        label: topic.label,
        normalizedLabel: this.normalizeLabel(topic.label),
        weight: topic.weight ?? 1,
        source: topic.source ?? "user",
      })),
    });

    const result = await this.listTopics(userId);
    await this.safeRefreshEmbeddings(userId, {
      includeInterestTopicVectors: true,
    });
    return result;
  }

  listAvailabilityWindows(userId: string) {
    return this.prisma.userAvailabilityWindow.findMany({
      where: { userId },
      orderBy: [{ dayOfWeek: "asc" }, { startMinute: "asc" }],
    });
  }

  async replaceAvailabilityWindows(
    userId: string,
    windows: Array<{
      dayOfWeek: number;
      startMinute: number;
      endMinute: number;
      mode?: string;
      timezone?: string;
    }>,
  ) {
    await this.prisma.userAvailabilityWindow.deleteMany({ where: { userId } });
    if (windows.length === 0) {
      return [];
    }

    await this.prisma.userAvailabilityWindow.createMany({
      data: windows.map((window) => ({
        userId,
        dayOfWeek: window.dayOfWeek,
        startMinute: window.startMinute,
        endMinute: window.endMinute,
        mode: window.mode ?? "available",
        timezone: window.timezone,
      })),
    });

    return this.listAvailabilityWindows(userId);
  }

  async setSocialModeSettings(
    userId: string,
    value: {
      socialMode: "chill" | "balanced" | "high_energy";
      preferOneToOne: boolean;
      allowGroupInvites: boolean;
    },
  ) {
    await this.saveUserPreference(userId, "social_mode_settings", value);
    return this.getUserPreference(userId, "social_mode_settings");
  }

  async setIntentTypePreference(
    userId: string,
    intentType: IntentType,
    payload: Record<string, unknown>,
  ) {
    const existing = await this.prisma.userRule.findFirst({
      where: {
        userId,
        scope: "intent_type",
        ruleType: intentType,
        isActive: true,
      },
    });

    if (existing) {
      return this.prisma.userRule.update({
        where: { id: existing.id },
        data: { payload: payload as Prisma.InputJsonValue },
      });
    }

    return this.prisma.userRule.create({
      data: {
        userId,
        scope: "intent_type",
        ruleType: intentType,
        payload: payload as Prisma.InputJsonValue,
        priority: 100,
        isActive: true,
      },
    });
  }

  async listIntentTypePreferences(userId: string) {
    return this.prisma.userRule.findMany({
      where: {
        userId,
        scope: "intent_type",
        isActive: true,
      },
      orderBy: [{ ruleType: "asc" }],
    });
  }

  async createPhotoUploadIntent(
    userId: string,
    input: {
      fileName: string;
      mimeType: ProfilePhotoMimeType;
      byteSize: number;
    },
  ) {
    this.validatePhotoUploadInput(input);

    const extension = this.fileExtensionForMimeType(input.mimeType);
    const normalizedFile = this.normalizeFileName(input.fileName).replace(
      /\.[^.]+$/,
      "",
    );
    const storageKey = `profiles/${userId}/${Date.now()}-${normalizedFile}-${randomUUID().slice(0, 8)}.${extension}`;
    const expiresAt = new Date(Date.now() + PROFILE_PHOTO_UPLOAD_EXPIRY_MS);

    const image = await this.prisma.userProfileImage.create({
      data: {
        userId,
        originalUrl: storageKey,
        status: "pending_upload",
      },
    });

    return {
      imageId: image.id,
      storageKey,
      mimeType: input.mimeType,
      maxByteSize: PROFILE_PHOTO_MAX_BYTES,
      expiresAt,
      uploadToken: this.createUploadToken({
        imageId: image.id,
        userId,
        storageKey,
        mimeType: input.mimeType,
        byteSize: input.byteSize,
        expiresAt,
      }),
      uploadUrl: this.buildSignedUploadUrl(
        storageKey,
        input.mimeType,
        expiresAt,
      ),
      deliveryBaseUrl: this.buildCdnUrl(storageKey),
      requiredHeaders: {
        "content-type": input.mimeType,
      },
    };
  }

  async confirmPhotoUpload(
    userId: string,
    imageId: string,
    metadata: {
      uploadToken: string;
      byteSize: number;
      width?: number;
      height?: number;
      sha256?: string;
    },
  ) {
    const image = await this.prisma.userProfileImage.findFirst({
      where: { id: imageId, userId },
    });

    if (!image) {
      throw new NotFoundException("profile image not found");
    }

    if (!["pending_upload", "pending", "processing"].includes(image.status)) {
      throw new BadRequestException("profile image is not uploadable");
    }

    const mimeType = this.mimeTypeFromStorageKey(image.originalUrl);
    this.validatePhotoUploadInput({
      fileName: image.originalUrl,
      mimeType,
      byteSize: metadata.byteSize,
    });
    this.verifyUploadToken(metadata.uploadToken, {
      imageId: image.id,
      userId,
      storageKey: image.originalUrl,
      mimeType,
      byteSize: metadata.byteSize,
    });

    await this.prisma.userProfileImage.update({
      where: { id: image.id },
      data: {
        status: "processing",
      },
    });

    const idempotencyKey = `profile-photo-uploaded:${image.id}`;
    await this.mediaProcessingQueue.add(
      "ProfilePhotoUploaded",
      {
        version: 1,
        traceId: randomUUID(),
        idempotencyKey,
        timestamp: new Date().toISOString(),
        type: "ProfilePhotoUploaded",
        payload: {
          imageId: image.id,
          userId,
          mimeType,
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

    return {
      imageId: image.id,
      status: "processing" as const,
      metadata,
    };
  }

  async processProfilePhoto(imageId: string) {
    const image = await this.prisma.userProfileImage.findUnique({
      where: { id: imageId },
    });

    if (!image) {
      throw new NotFoundException("profile image not found");
    }

    const moderationResult = this.evaluatePhotoModeration(image.originalUrl);

    if (moderationResult !== "approved") {
      const updated = await this.prisma.userProfileImage.update({
        where: { id: image.id },
        data: {
          status: moderationResult,
          thumbUrl: null,
        },
      });

      await this.prisma.moderationFlag.create({
        data: {
          entityType: "user_profile_image",
          entityId: image.id,
          reason: `profile_image_${moderationResult}`,
          status: moderationResult === "pending_review" ? "open" : "resolved",
        },
      });

      await this.notificationsService.createInAppNotification(
        image.userId,
        NotificationType.MODERATION_NOTICE,
        moderationResult === "pending_review"
          ? "Your profile photo is under review before it can be shown."
          : "Your profile photo was rejected by safety filters. Try another image.",
      );

      return {
        ...updated,
        moderationResult,
      };
    }

    const storageKey = image.originalUrl;
    const originalDeliveryUrl = this.buildCdnUrl(storageKey);
    const thumbUrl = `${this.buildCdnUrl(storageKey)}?variant=avatar_256`;

    await this.prisma.userProfileImage.updateMany({
      where: {
        userId: image.userId,
        id: { not: image.id },
        status: { in: ["approved", "processing", "pending_upload", "pending"] },
      },
      data: {
        status: "replaced",
      },
    });

    const updated = await this.prisma.userProfileImage.update({
      where: { id: image.id },
      data: {
        status: "approved",
        originalUrl: originalDeliveryUrl,
        thumbUrl,
      },
    });

    return {
      ...updated,
      moderationResult,
    };
  }

  listProfilePhotos(userId: string) {
    return this.prisma.userProfileImage.findMany({
      where: { userId },
      orderBy: [{ createdAt: "desc" }],
    });
  }

  async getPrimaryProfilePhoto(userId: string) {
    const approved = await this.prisma.userProfileImage.findFirst({
      where: {
        userId,
        status: "approved",
      },
      orderBy: [{ createdAt: "desc" }],
    });

    if (approved) {
      return {
        kind: "uploaded" as const,
        imageId: approved.id,
        originalUrl: approved.originalUrl,
        thumbUrl: approved.thumbUrl,
      };
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { displayName: true },
    });

    return {
      kind: "fallback" as const,
      imageId: null,
      originalUrl: this.generateAvatarFallbackDataUri(
        userId,
        user?.displayName ?? "User",
      ),
      thumbUrl: null,
    };
  }

  private async safeRefreshEmbeddings(
    userId: string,
    options: { includeInterestTopicVectors: boolean },
  ) {
    try {
      await this.matchingService.upsertUserProfileEmbedding(userId);
      if (options.includeInterestTopicVectors) {
        await this.matchingService.upsertInterestTopicEmbeddings(userId);
      }
    } catch {
      // Embedding generation is best-effort and should not block profile edits.
    }
  }

  private computeProfileCompletion(input: {
    bio?: string | null;
    city?: string | null;
    country?: string | null;
    interestCount?: number;
  }) {
    const checks = {
      hasBio: Boolean(input.bio && input.bio.trim().length > 0),
      hasCity: Boolean(input.city && input.city.trim().length > 0),
      hasCountry: Boolean(input.country && input.country.trim().length > 0),
      hasInterests: (input.interestCount ?? 0) > 0,
    };
    const completed =
      checks.hasBio &&
      checks.hasCity &&
      checks.hasCountry &&
      checks.hasInterests;
    const started = checks.hasBio || checks.hasCity || checks.hasCountry;

    return {
      completed,
      checks,
      onboardingState: completed
        ? "complete"
        : started
          ? "profile_started"
          : "not_started",
    } as const;
  }

  private normalizeLabel(label: string) {
    return label.trim().toLowerCase().replace(/\s+/g, " ");
  }

  private normalizeFileName(fileName: string) {
    const normalized = fileName
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_+|_+$/g, "");

    return normalized || "upload";
  }

  private validatePhotoUploadInput(input: {
    fileName: string;
    mimeType: ProfilePhotoMimeType;
    byteSize: number;
  }) {
    if (input.byteSize < PROFILE_PHOTO_MIN_BYTES) {
      throw new BadRequestException(
        `profile photo must be at least ${PROFILE_PHOTO_MIN_BYTES} bytes`,
      );
    }
    if (input.byteSize > PROFILE_PHOTO_MAX_BYTES) {
      throw new BadRequestException(
        `profile photo exceeds ${PROFILE_PHOTO_MAX_BYTES} bytes`,
      );
    }

    const allowedMimeTypes: ProfilePhotoMimeType[] = [
      "image/jpeg",
      "image/png",
      "image/webp",
    ];
    if (!allowedMimeTypes.includes(input.mimeType)) {
      throw new BadRequestException("unsupported profile image mime type");
    }
  }

  private fileExtensionForMimeType(mimeType: ProfilePhotoMimeType) {
    switch (mimeType) {
      case "image/jpeg":
        return "jpg";
      case "image/png":
        return "png";
      case "image/webp":
        return "webp";
      default:
        return "bin";
    }
  }

  private mimeTypeFromStorageKey(storageKey: string): ProfilePhotoMimeType {
    const lower = storageKey.toLowerCase();
    if (lower.endsWith(".png")) return "image/png";
    if (lower.endsWith(".webp")) return "image/webp";
    return "image/jpeg";
  }

  private buildSignedUploadUrl(
    storageKey: string,
    mimeType: ProfilePhotoMimeType,
    expiresAt: Date,
  ) {
    const endpoint = (
      process.env.S3_ENDPOINT ?? "http://localhost:9000"
    ).replace(/\/+$/, "");
    const bucket = process.env.S3_BUCKET ?? "opensocial-media";
    const signingSecret = this.readMediaUploadSigningSecret();
    const signature = createHash("sha256")
      .update(
        `${storageKey}:${mimeType}:${expiresAt.toISOString()}:${signingSecret}`,
      )
      .digest("hex")
      .slice(0, 32);

    return `${endpoint}/${bucket}/${storageKey}?upload=1&mime=${encodeURIComponent(mimeType)}&expires=${encodeURIComponent(expiresAt.toISOString())}&sig=${signature}`;
  }

  private createUploadToken(input: {
    imageId: string;
    userId: string;
    storageKey: string;
    mimeType: ProfilePhotoMimeType;
    byteSize: number;
    expiresAt: Date;
  }) {
    const payload: UploadTokenPayload = {
      version: PROFILE_PHOTO_UPLOAD_TOKEN_VERSION,
      imageId: input.imageId,
      userId: input.userId,
      storageKey: input.storageKey,
      mimeType: input.mimeType,
      byteSize: input.byteSize,
      expiresAt: input.expiresAt.toISOString(),
    };
    const encodedPayload = Buffer.from(
      JSON.stringify(payload),
      "utf8",
    ).toString("base64url");
    const signature = createHmac("sha256", this.readMediaUploadSigningSecret())
      .update(encodedPayload)
      .digest("base64url");

    return `${encodedPayload}.${signature}`;
  }

  private verifyUploadToken(
    token: string,
    expected: {
      imageId: string;
      userId: string;
      storageKey: string;
      mimeType: ProfilePhotoMimeType;
      byteSize: number;
    },
  ) {
    const [encodedPayload, signature] = token.split(".");
    if (!encodedPayload || !signature) {
      throw new BadRequestException("invalid profile upload token");
    }

    const expectedSignature = createHmac(
      "sha256",
      this.readMediaUploadSigningSecret(),
    )
      .update(encodedPayload)
      .digest("base64url");
    if (!this.constantTimeEqual(expectedSignature, signature)) {
      throw new BadRequestException("invalid profile upload token");
    }

    let payload: UploadTokenPayload;
    try {
      payload = JSON.parse(
        Buffer.from(encodedPayload, "base64url").toString("utf8"),
      ) as UploadTokenPayload;
    } catch {
      throw new BadRequestException("invalid profile upload token");
    }

    if (payload.version !== PROFILE_PHOTO_UPLOAD_TOKEN_VERSION) {
      throw new BadRequestException("unsupported profile upload token version");
    }

    const expiresAtMs = new Date(payload.expiresAt).getTime();
    if (!Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now()) {
      throw new BadRequestException("profile upload token expired");
    }

    if (
      payload.imageId !== expected.imageId ||
      payload.userId !== expected.userId ||
      payload.storageKey !== expected.storageKey ||
      payload.mimeType !== expected.mimeType ||
      payload.byteSize !== expected.byteSize
    ) {
      throw new BadRequestException("profile upload token mismatch");
    }
  }

  private readMediaUploadSigningSecret() {
    const secret =
      process.env.MEDIA_UPLOAD_SIGNING_SECRET ?? process.env.S3_SECRET_KEY;
    if (typeof secret === "string" && secret.trim().length > 0) {
      return secret.trim();
    }

    if (process.env.NODE_ENV === "production") {
      throw new BadRequestException(
        "MEDIA_UPLOAD_SIGNING_SECRET must be configured",
      );
    }

    return "dev-media-secret";
  }

  private constantTimeEqual(left: string, right: string) {
    const leftBuffer = Buffer.from(left);
    const rightBuffer = Buffer.from(right);
    if (leftBuffer.length !== rightBuffer.length) {
      return false;
    }
    return timingSafeEqual(leftBuffer, rightBuffer);
  }

  private buildCdnUrl(storageKey: string) {
    const defaultBase = `${(process.env.S3_ENDPOINT ?? "http://localhost:9000").replace(/\/+$/, "")}/${process.env.S3_BUCKET ?? "opensocial-media"}`;
    const base = (process.env.MEDIA_CDN_BASE_URL ?? defaultBase).replace(
      /\/+$/,
      "",
    );
    const normalizedStorageKey = storageKey.replace(/^\/+/, "");

    return `${base}/${normalizedStorageKey}`;
  }

  private evaluatePhotoModeration(storageKey: string) {
    const normalized = storageKey.toLowerCase();

    if (
      ["nsfw", "nude", "gore", "violence", "weapon"].some((term) =>
        normalized.includes(term),
      )
    ) {
      return "rejected" as const;
    }

    if (
      ["review", "impersonation", "suspicious"].some((term) =>
        normalized.includes(term),
      )
    ) {
      return "pending_review" as const;
    }

    return "approved" as const;
  }

  private async moderateProfileTextFields(
    userId: string,
    values: Array<string | null | undefined>,
    reasonPrefix: string,
  ) {
    const moderation = this.evaluateTextModeration(values);
    if (moderation.decision === "clean") {
      return moderation;
    }

    if (this.prisma.moderationFlag?.create) {
      await this.prisma.moderationFlag.create({
        data: {
          entityType: "user_profile",
          entityId: userId,
          reason: `${reasonPrefix}_${moderation.decision}:${moderation.matchedTerms.join(",")}`,
          status: "open",
        },
      });
    }

    await this.notificationsService.createInAppNotification(
      userId,
      NotificationType.MODERATION_NOTICE,
      moderation.decision === "blocked"
        ? "Profile text update was blocked by safety policy."
        : "Profile text update is pending moderation review.",
    );
    if (moderation.decision === "review") {
      await this.markProfileModerationState(userId, "review");
    }

    return moderation;
  }

  private evaluateTextModeration(
    values: Array<string | null | undefined>,
  ): TextModerationResult {
    const normalized = values
      .filter((value): value is string => typeof value === "string")
      .map((value) => value.toLowerCase())
      .join(" ");
    const blockedTerms = PROFILE_TEXT_BLOCKLIST.filter((term) =>
      normalized.includes(term),
    );
    if (blockedTerms.length > 0) {
      return {
        decision: "blocked",
        matchedTerms: blockedTerms,
      };
    }

    const reviewTerms = PROFILE_TEXT_REVIEWLIST.filter((term) =>
      normalized.includes(term),
    );
    if (reviewTerms.length > 0) {
      return {
        decision: "review",
        matchedTerms: reviewTerms,
      };
    }

    return {
      decision: "clean",
      matchedTerms: [],
    };
  }

  private async markProfileModerationState(
    userId: string,
    state: "clean" | "flagged" | "blocked" | "review",
  ) {
    await this.prisma.userProfile.upsert({
      where: { userId },
      create: {
        userId,
        moderationState: state,
      },
      update: {
        moderationState: state,
      },
    });
  }

  private generateAvatarFallbackDataUri(userId: string, displayName: string) {
    const initials = this.avatarInitials(displayName);
    const palette = ["#0f766e", "#0369a1", "#4338ca", "#be123c", "#a16207"];
    const colorIndex =
      parseInt(
        createHash("sha256").update(userId).digest("hex").slice(0, 2),
        16,
      ) % palette.length;
    const background = palette[colorIndex];
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='256' height='256' viewBox='0 0 256 256'><rect width='256' height='256' rx='128' fill='${background}'/><text x='50%' y='52%' dominant-baseline='middle' text-anchor='middle' font-family='Arial, sans-serif' font-size='96' fill='#ffffff'>${initials}</text></svg>`;

    return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
  }

  private avatarInitials(displayName: string) {
    const parts = displayName
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "");

    return parts.join("") || "U";
  }

  private resolveVerificationBadge(input: {
    accountAgeDays: number;
    hasEmail: boolean;
    hasGoogleIdentity: boolean;
    openReportCount: number;
    receivedBlockCount: number;
  }) {
    if (
      input.accountAgeDays >= 30 &&
      input.openReportCount === 0 &&
      input.receivedBlockCount === 0 &&
      input.hasGoogleIdentity
    ) {
      return "trusted";
    }

    if (input.hasGoogleIdentity || input.hasEmail) {
      return "verified_identity";
    }

    return "unverified";
  }

  private clampNumber(value: number, min: number, max: number) {
    return Math.min(Math.max(value, min), max);
  }

  private async saveUserPreference(
    userId: string,
    key: string,
    value: unknown,
  ) {
    const existing = await this.prisma.userPreference.findFirst({
      where: { userId, key },
    });
    if (existing) {
      return this.prisma.userPreference.update({
        where: { id: existing.id },
        data: { value: value as Prisma.InputJsonValue },
      });
    }

    return this.prisma.userPreference.create({
      data: { userId, key, value: value as Prisma.InputJsonValue },
    });
  }

  private getUserPreference(userId: string, key: string) {
    return this.prisma.userPreference.findFirst({
      where: { userId, key },
    });
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
