import { Injectable } from "@nestjs/common";
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
}
