import { Injectable } from "@nestjs/common";
import { IntentType } from "@opensocial/types";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../database/prisma.service.js";

type ProfileUpdatePayload = {
  bio?: string;
  city?: string;
  country?: string;
  visibility?: "public" | "limited" | "private";
};

@Injectable()
export class ProfilesService {
  constructor(private readonly prisma: PrismaService) {}

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

    return this.prisma.userProfile.upsert({
      where: { userId },
      update: {
        ...payload,
        onboardingState: completion.onboardingState,
      },
      create: {
        userId,
        ...payload,
        onboardingState: completion.onboardingState,
      },
    });
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

    return this.listInterests(userId);
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

    return this.listTopics(userId);
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
}
