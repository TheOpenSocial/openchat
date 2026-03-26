import { Injectable, Logger } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { createHash } from "node:crypto";
import { recordOpenAIMetric } from "../common/ops-metrics.js";
import { PrismaService } from "../database/prisma.service.js";

export interface CandidateScoreInput {
  semantic: number;
  availability: number;
  trust: number;
  responsiveness: number;
  novelty: number;
  proximity: number;
  style: number;
  personalization: number;
}

export interface RetrievedCandidate {
  userId: string;
  score: number;
  rationale: Record<string, unknown>;
}

export interface AvailabilitySnapshot {
  userId: string;
  availabilityMode: string | null;
  reachable: "always" | "available_only" | "do_not_disturb";
  modality: "online" | "offline" | "either";
  currentlyAvailable: boolean;
  contactAllowed: boolean;
  overlapMinutesWithRequester: number;
}

interface RetrieveCandidatesOptions {
  intentId?: string;
  traceId?: string;
}

interface SemanticCandidateRow {
  userId: string;
  semanticScore: number;
}

interface PersonalizationProfile {
  positiveLabels: Map<string, number>;
  avoidLabels: Map<string, number>;
  highSuccessPeople: Map<string, number>;
}

const EMBEDDING_DIMENSIONS = 1536;
const EMBEDDING_MODEL = "text-embedding-3-small";
const DEFAULT_SEMANTIC_POOL_SIZE = 24;
const RECENT_INTERACTION_SUPPRESSION_DAYS = 14;
const DEFAULT_OFFLINE_MIN_ACCOUNT_AGE_DAYS = 7;
const MUTE_USER_IDS_PREFERENCE_KEY = "global_rules_muted_user_ids";
const OPEN_REPORT_SUPPRESSION_THRESHOLD = 3;

@Injectable()
export class MatchingService {
  private readonly logger = new Logger(MatchingService.name);
  private readonly offlineMinAccountAgeDays =
    this.resolveOfflineMinAccountAgeDays();

  constructor(private readonly prisma: PrismaService) {}

  scoreCandidate(input: CandidateScoreInput): number {
    return (
      input.semantic * 0.3 +
      input.availability * 0.18 +
      input.trust * 0.16 +
      input.responsiveness * 0.08 +
      input.novelty * 0.08 +
      input.proximity * 0.08 +
      input.style * 0.06 +
      input.personalization * 0.06
    );
  }

  selectTopN<T extends { score: number }>(candidates: T[], n: number): T[] {
    return [...candidates].sort((a, b) => b.score - a.score).slice(0, n);
  }

  async retrieveCandidates(
    senderUserId: string,
    parsedIntent: {
      topics?: string[];
      activities?: string[];
      intentType?: string;
      modality?: string;
      timingConstraints?: string[];
      skillConstraints?: string[];
      vibeConstraints?: string[];
    },
    take = 5,
    options: RetrieveCandidatesOptions = {},
  ): Promise<RetrievedCandidate[]> {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60_000);

    const [
      sender,
      users,
      blocks,
      interests,
      topicsByUser,
      recentRejections,
      pendingOutgoing,
    ] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: senderUserId },
        include: { profile: true },
      }),
      this.prisma.user.findMany({
        where: {
          status: "active",
          id: { not: senderUserId },
        },
        include: { profile: true },
        take: 100,
      }),
      this.prisma.block.findMany({
        where: {
          OR: [
            { blockerUserId: senderUserId },
            { blockedUserId: senderUserId },
          ],
        },
      }),
      this.prisma.userInterest.findMany({
        where: {
          userId: { not: senderUserId },
        },
      }),
      this.prisma.userTopic.findMany({
        where: {
          userId: { not: senderUserId },
        },
      }),
      this.prisma.intentRequest.findMany({
        where: {
          senderUserId,
          status: "rejected",
          respondedAt: { gte: sevenDaysAgo },
        },
        select: { recipientUserId: true },
      }),
      this.prisma.intentRequest.findMany({
        where: {
          senderUserId,
          status: "pending",
        },
        select: { recipientUserId: true },
      }),
    ]);

    const preferenceUserIds = Array.from(
      new Set([senderUserId, ...users.map((user) => user.id)]),
    );
    const candidatePreferences =
      preferenceUserIds.length === 0
        ? []
        : await this.prisma.userPreference.findMany({
            where: {
              userId: {
                in: preferenceUserIds,
              },
              key: {
                in: [
                  "global_rules_who_can_contact",
                  "global_rules_reachable",
                  "global_rules_intent_mode",
                  "global_rules_modality",
                  "global_rules_language_preferences",
                  "global_rules_country_preferences",
                  "global_rules_require_verified_users",
                  MUTE_USER_IDS_PREFERENCE_KEY,
                ],
              },
            },
            select: {
              userId: true,
              key: true,
              value: true,
            },
          });

    const preferencesByUser = new Map<string, Map<string, unknown>>();
    for (const preference of candidatePreferences) {
      const existing = preferencesByUser.get(preference.userId) ?? new Map();
      existing.set(preference.key, preference.value);
      preferencesByUser.set(preference.userId, existing);
    }

    const senderVerificationLevel = this.resolveVerificationLevel({
      googleSubjectId: sender?.googleSubjectId ?? null,
      email: sender?.email ?? null,
      trustScore: Number(sender?.profile?.trustScore ?? 0),
    });
    const senderModalityPreference = this.resolveModalityPreference(
      this.readStringPreference(
        preferencesByUser,
        senderUserId,
        "global_rules_modality",
      ),
    );
    const senderRequireVerifiedUsers =
      this.readBooleanPreference(
        preferencesByUser,
        senderUserId,
        "global_rules_require_verified_users",
      ) ?? false;
    const verificationLevelByUser = new Map<
      string,
      "trusted" | "verified" | "unverified"
    >();
    for (const candidate of users) {
      verificationLevelByUser.set(
        candidate.id,
        this.resolveVerificationLevel({
          googleSubjectId: candidate.googleSubjectId ?? null,
          email: candidate.email ?? null,
          trustScore: Number(candidate.profile?.trustScore ?? 0),
        }),
      );
    }

    const blockedUserIds = new Set<string>();
    for (const block of blocks) {
      blockedUserIds.add(block.blockedUserId);
      blockedUserIds.add(block.blockerUserId);
    }

    const suppressedUserIds = new Set<string>([
      ...recentRejections.map((x) => x.recipientUserId),
      ...pendingOutgoing.map((x) => x.recipientUserId),
    ]);

    const requestedLabels = new Set<string>();
    for (const topic of parsedIntent.topics ?? []) {
      requestedLabels.add(topic.toLowerCase());
    }
    for (const activity of parsedIntent.activities ?? []) {
      requestedLabels.add(activity.toLowerCase());
    }
    const requestedLabelCount = requestedLabels.size;

    const labelsByUser = new Map<string, Set<string>>();
    for (const interest of interests) {
      const existing = labelsByUser.get(interest.userId) ?? new Set<string>();
      existing.add(interest.normalizedLabel.toLowerCase());
      labelsByUser.set(interest.userId, existing);
    }
    for (const topic of topicsByUser) {
      const existing = labelsByUser.get(topic.userId) ?? new Set<string>();
      existing.add(topic.normalizedLabel.toLowerCase());
      labelsByUser.set(topic.userId, existing);
    }

    const hardConstraintInput = {
      blockedUserIds,
      suppressedUserIds,
      preferencesByUser,
      senderVerificationLevel,
      senderRequireVerifiedUsers,
      senderModalityPreference,
      candidateVerificationByUser: verificationLevelByUser,
      intentModality: parsedIntent.modality,
      intentType: parsedIntent.intentType,
      sender,
    };

    const eligibleUsers = users.filter((user) =>
      this.passesHardConstraints(user, hardConstraintInput),
    );
    if (eligibleUsers.length === 0) {
      await this.logRetrievalSnapshot({
        senderUserId,
        intentId: options.intentId,
        traceId: options.traceId,
        requestedLabelCount,
        eligibleUserCount: 0,
        semanticUserCount: 0,
        fallbackUserCount: 0,
        scoredCandidates: [],
      });
      return [];
    }

    const eligibleUserIds = eligibleUsers.map((user) => user.id);
    const [availabilityWindowRows, openReportRows, recentInteractionCounts] =
      await Promise.all([
        this.loadAvailabilityWindows([senderUserId, ...eligibleUserIds]),
        this.loadOpenReports(eligibleUserIds),
        this.fetchRecentInteractionCounts(senderUserId, eligibleUserIds),
      ]);
    const personalizationProfile =
      await this.fetchPersonalizationProfile(senderUserId);
    const reportsByUser = new Map<string, number>();
    for (const report of openReportRows) {
      if (!report.targetUserId) {
        continue;
      }
      reportsByUser.set(
        report.targetUserId,
        (reportsByUser.get(report.targetUserId) ?? 0) + 1,
      );
    }
    const availabilityWindowsByUser = this.indexAvailabilityWindowsByUser(
      availabilityWindowRows,
    );

    const eligibleUsersById = new Map(
      eligibleUsers.map((candidate) => [candidate.id, candidate]),
    );
    const postFilterAllowedUserIds = new Set(
      eligibleUsers.map((user) => user.id),
    );
    const semanticRows = await this.retrieveSemanticCandidates({
      intentId: options.intentId,
      candidateUserIds: eligibleUsers.map((user) => user.id),
      take: Math.max(take * 4, DEFAULT_SEMANTIC_POOL_SIZE),
    });
    const semanticScoreByUser = new Map<string, number>();
    for (const row of semanticRows) {
      if (!postFilterAllowedUserIds.has(row.userId)) {
        continue;
      }
      const user = eligibleUsersById.get(row.userId);
      if (!user || !this.passesHardConstraints(user, hardConstraintInput)) {
        continue;
      }
      semanticScoreByUser.set(
        row.userId,
        this.clampUnitInterval(row.semanticScore),
      );
    }

    const styleSignals = new Set<string>();
    for (const token of parsedIntent.skillConstraints ?? []) {
      styleSignals.add(token.toLowerCase());
    }
    for (const token of parsedIntent.vibeConstraints ?? []) {
      styleSignals.add(token.toLowerCase());
    }

    const scored: RetrievedCandidate[] = [];
    for (const user of eligibleUsers) {
      const openReportCount = reportsByUser.get(user.id) ?? 0;
      if (openReportCount >= OPEN_REPORT_SUPPRESSION_THRESHOLD) {
        continue;
      }
      const labels = labelsByUser.get(user.id) ?? new Set<string>();
      let lexicalOverlapCount = 0;
      for (const label of labels) {
        if (requestedLabels.has(label)) {
          lexicalOverlapCount += 1;
        }
      }

      const lexicalScore =
        requestedLabelCount === 0
          ? 0
          : this.clampUnitInterval(
              lexicalOverlapCount / Math.min(3, requestedLabelCount),
            );
      const semanticSimilarity = semanticScoreByUser.get(user.id);
      const retrievalSource =
        semanticSimilarity === undefined ? "lexical_fallback" : "semantic";
      const semantic =
        semanticSimilarity === undefined
          ? lexicalScore
          : Math.max(semanticSimilarity, lexicalScore * 0.7);

      if (
        requestedLabelCount > 0 &&
        semanticSimilarity === undefined &&
        lexicalOverlapCount === 0
      ) {
        continue;
      }

      const availability = this.computeAvailabilityScore({
        userId: user.id,
        availabilityMode: user.profile?.availabilityMode ?? null,
        modality: parsedIntent.modality,
        timingConstraints: parsedIntent.timingConstraints ?? [],
        availabilityWindowsByUser,
        senderUserId,
      });
      const trust = Number(user.profile?.trustScore ?? 0);
      const normalizedTrust = this.computeTrustScore({
        trust,
        moderationState: user.profile?.moderationState ?? "clean",
        openReportCount,
      });
      const recentInteractionCount = recentInteractionCounts.get(user.id) ?? 0;
      const novelty = this.computeNoveltyScore(recentInteractionCount);
      const proximity = this.computeProximityScore({
        modality: parsedIntent.modality,
        senderCity: sender?.profile?.city ?? null,
        senderCountry: sender?.profile?.country ?? null,
        candidateCity: user.profile?.city ?? null,
        candidateCountry: user.profile?.country ?? null,
      });
      const style = this.computeStyleCompatibilityScore({
        styleSignals,
        labels,
      });
      const personalization = this.computePersonalizationBoost({
        requestedLabels,
        candidateDisplayName: user.displayName ?? "",
        personalizationProfile,
      });

      const score = this.scoreCandidate({
        semantic,
        availability,
        trust: normalizedTrust,
        responsiveness: 0.5,
        novelty,
        proximity,
        style,
        personalization,
      });

      scored.push({
        userId: user.id,
        score,
        rationale: {
          semanticSimilarity: semanticSimilarity ?? null,
          lexicalOverlap: lexicalScore,
          lexicalOverlapCount,
          retrievalSource,
          availability: user.profile?.availabilityMode ?? "flexible",
          trustScore: trust,
          trustScoreNormalized: normalizedTrust,
          openReportCount,
          verificationLevel: verificationLevelByUser.get(user.id) ?? null,
          recentInteractionCount,
          noveltySuppressionScore: novelty,
          proximityScore: proximity,
          styleCompatibility: style,
          personalizationBoost: personalization,
        },
      });
    }

    const selected = this.selectTopN(scored, take);
    const fallbackUserCount = selected.filter(
      (candidate) =>
        candidate.rationale["retrievalSource"] === "lexical_fallback",
    ).length;
    await this.logRetrievalSnapshot({
      senderUserId,
      intentId: options.intentId,
      traceId: options.traceId,
      requestedLabelCount,
      eligibleUserCount: eligibleUsers.length,
      semanticUserCount: semanticScoreByUser.size,
      fallbackUserCount,
      scoredCandidates: selected,
    });
    return selected;
  }

  async lookupAvailabilityContext(
    requesterUserId: string,
    candidateUserIds: string[] = [],
  ): Promise<{
    requester: AvailabilitySnapshot | null;
    candidates: AvailabilitySnapshot[];
    generatedAt: string;
  }> {
    const targetUserIds = Array.from(
      new Set(
        [requesterUserId, ...candidateUserIds].filter(
          (userId): userId is string =>
            typeof userId === "string" && userId.length > 0,
        ),
      ),
    );
    if (targetUserIds.length === 0) {
      return {
        requester: null,
        candidates: [],
        generatedAt: new Date().toISOString(),
      };
    }

    const [users, preferences, availabilityWindowRows] = await Promise.all([
      this.prisma.user.findMany({
        where: {
          id: {
            in: targetUserIds,
          },
        },
        include: {
          profile: true,
        },
      }),
      this.prisma.userPreference.findMany({
        where: {
          userId: {
            in: targetUserIds,
          },
          key: {
            in: ["global_rules_reachable", "global_rules_modality"],
          },
        },
        select: {
          userId: true,
          key: true,
          value: true,
        },
      }),
      this.prisma.userAvailabilityWindow.findMany({
        where: {
          userId: {
            in: targetUserIds,
          },
        },
        select: {
          userId: true,
          dayOfWeek: true,
          startMinute: true,
          endMinute: true,
          mode: true,
        },
      }),
    ]);

    const usersById = new Map(users.map((user) => [user.id, user]));
    const preferencesByUser = new Map<string, Map<string, unknown>>();
    for (const preference of preferences) {
      const existing = preferencesByUser.get(preference.userId) ?? new Map();
      existing.set(preference.key, preference.value);
      preferencesByUser.set(preference.userId, existing);
    }

    const availabilityWindowsByUser = this.indexAvailabilityWindowsByUser(
      availabilityWindowRows,
    );

    const requesterWindows =
      availabilityWindowsByUser.get(requesterUserId) ?? [];

    const buildSnapshot = (userId: string): AvailabilitySnapshot | null => {
      const user = usersById.get(userId);
      if (!user) {
        return null;
      }

      const availabilityMode = user.profile?.availabilityMode ?? null;
      const reachable =
        (this.readStringPreference(
          preferencesByUser,
          userId,
          "global_rules_reachable",
        ) as AvailabilitySnapshot["reachable"] | null) ?? "always";
      const modality = this.resolveModalityPreference(
        this.readStringPreference(
          preferencesByUser,
          userId,
          "global_rules_modality",
        ),
      );
      const userWindows = availabilityWindowsByUser.get(userId) ?? [];

      return {
        userId,
        availabilityMode,
        reachable,
        modality,
        currentlyAvailable: this.isCurrentlyAvailable(
          availabilityMode,
          userWindows,
        ),
        contactAllowed: this.isReachabilityAllowed(
          userId,
          preferencesByUser,
          availabilityMode,
        ),
        overlapMinutesWithRequester:
          userId === requesterUserId
            ? 0
            : this.computeCurrentDayWindowOverlapMinutes(
                requesterWindows,
                userWindows,
              ),
      };
    };

    return {
      requester: buildSnapshot(requesterUserId),
      candidates: candidateUserIds
        .map((userId) => buildSnapshot(userId))
        .filter((value): value is AvailabilitySnapshot => value !== null),
      generatedAt: new Date().toISOString(),
    };
  }

  async upsertUserProfileEmbedding(userId: string) {
    const [profile, interests, topics] = await Promise.all([
      this.prisma.userProfile.findUnique({
        where: { userId },
        select: {
          bio: true,
          city: true,
          country: true,
          availabilityMode: true,
        },
      }),
      this.prisma.userInterest.findMany({
        where: { userId },
        select: { label: true },
        take: 20,
      }),
      this.prisma.userTopic.findMany({
        where: { userId },
        select: { label: true },
        take: 20,
      }),
    ]);

    const text = [
      `bio: ${profile?.bio ?? ""}`,
      `city: ${profile?.city ?? ""}`,
      `country: ${profile?.country ?? ""}`,
      `availability_mode: ${profile?.availabilityMode ?? "flexible"}`,
      `interests: ${interests.map((item) => item.label).join(", ")}`,
      `topics: ${topics.map((item) => item.label).join(", ")}`,
    ].join("\n");

    return this.upsertEmbedding({
      ownerType: "user_profile",
      ownerId: userId,
      embeddingType: "profile_summary",
      text,
    });
  }

  async upsertInterestTopicEmbeddings(userId: string) {
    const [interests, topics] = await Promise.all([
      this.prisma.userInterest.findMany({
        where: { userId },
        select: {
          id: true,
          kind: true,
          label: true,
          source: true,
        },
      }),
      this.prisma.userTopic.findMany({
        where: { userId },
        select: {
          id: true,
          label: true,
          source: true,
        },
      }),
    ]);

    const upserts = [
      ...interests.map((interest) =>
        this.upsertEmbedding({
          ownerType: "user_interest",
          ownerId: interest.id,
          embeddingType: "interest_label",
          text: `${interest.kind}:${interest.label} (${interest.source})`,
        }),
      ),
      ...topics.map((topic) =>
        this.upsertEmbedding({
          ownerType: "user_topic",
          ownerId: topic.id,
          embeddingType: "topic_label",
          text: `${topic.label} (${topic.source})`,
        }),
      ),
    ];

    await Promise.all(upserts);
    return {
      userId,
      generatedCount: upserts.length,
    };
  }

  async upsertIntentEmbedding(intentId: string) {
    const intent = await this.prisma.intent.findUnique({
      where: { id: intentId },
      select: {
        id: true,
        rawText: true,
        parsedIntent: true,
      },
    });
    if (!intent) {
      return { intentId, skipped: true };
    }

    const parsed =
      (intent.parsedIntent as {
        intentType?: string;
        topics?: string[];
        activities?: string[];
        modality?: string;
      } | null) ?? {};
    const text = [
      `raw_text: ${intent.rawText}`,
      `intent_type: ${parsed.intentType ?? "unknown"}`,
      `modality: ${parsed.modality ?? "either"}`,
      `topics: ${(parsed.topics ?? []).join(", ")}`,
      `activities: ${(parsed.activities ?? []).join(", ")}`,
    ].join("\n");

    return this.upsertEmbedding({
      ownerType: "intent",
      ownerId: intent.id,
      embeddingType: "intent_text",
      text,
    });
  }

  async upsertConversationSummaryEmbedding(
    ownerId: string,
    summary: string,
    ownerType:
      | "chat"
      | "connection"
      | "interaction_summary" = "interaction_summary",
  ) {
    return this.upsertEmbedding({
      ownerType,
      ownerId,
      embeddingType: "conversation_summary",
      text: summary,
    });
  }

  private async loadAvailabilityWindows(userIds: string[]) {
    if (userIds.length === 0 || !this.prisma.userAvailabilityWindow?.findMany) {
      return [] as Array<{
        userId: string;
        dayOfWeek: number;
        startMinute: number;
        endMinute: number;
        mode: string;
      }>;
    }

    return this.prisma.userAvailabilityWindow.findMany({
      where: {
        userId: {
          in: userIds,
        },
      },
      select: {
        userId: true,
        dayOfWeek: true,
        startMinute: true,
        endMinute: true,
        mode: true,
      },
    });
  }

  private async loadOpenReports(candidateUserIds: string[]) {
    if (candidateUserIds.length === 0 || !this.prisma.userReport?.findMany) {
      return [] as Array<{ targetUserId: string | null }>;
    }

    return this.prisma.userReport.findMany({
      where: {
        targetUserId: {
          in: candidateUserIds,
        },
        status: "open",
      },
      select: {
        targetUserId: true,
      },
    });
  }

  private indexAvailabilityWindowsByUser(
    windows: Array<{
      userId: string;
      dayOfWeek: number;
      startMinute: number;
      endMinute: number;
      mode: string;
    }>,
  ) {
    const byUser = new Map<
      string,
      Array<{
        dayOfWeek: number;
        startMinute: number;
        endMinute: number;
        mode: string;
      }>
    >();
    for (const window of windows) {
      const existing = byUser.get(window.userId) ?? [];
      existing.push({
        dayOfWeek: window.dayOfWeek,
        startMinute: window.startMinute,
        endMinute: window.endMinute,
        mode: window.mode,
      });
      byUser.set(window.userId, existing);
    }
    return byUser;
  }

  private computeAvailabilityScore(input: {
    userId: string;
    availabilityMode: string | null;
    modality?: string;
    timingConstraints: string[];
    availabilityWindowsByUser: Map<
      string,
      Array<{
        dayOfWeek: number;
        startMinute: number;
        endMinute: number;
        mode: string;
      }>
    >;
    senderUserId: string;
  }) {
    const modeScoreByAvailability: Record<string, number> = {
      now: 1,
      later_today: 0.78,
      flexible: 0.58,
      away: 0.15,
      invisible: 0.1,
    };
    let score =
      modeScoreByAvailability[input.availabilityMode ?? "flexible"] ?? 0.58;

    const now = new Date();
    const utcDay = now.getUTCDay();
    const utcMinute = now.getUTCHours() * 60 + now.getUTCMinutes();

    const senderWindows = (
      input.availabilityWindowsByUser.get(input.senderUserId) ?? []
    )
      .filter((window) => window.dayOfWeek === utcDay)
      .filter((window) => window.mode === "available");
    const candidateWindows = (
      input.availabilityWindowsByUser.get(input.userId) ?? []
    )
      .filter((window) => window.dayOfWeek === utcDay)
      .filter((window) => window.mode === "available");

    if (senderWindows.length > 0 && candidateWindows.length > 0) {
      const overlapMinutes = this.computeWindowOverlapMinutes(
        senderWindows,
        candidateWindows,
      );
      const overlapScore = this.clampUnitInterval(overlapMinutes / 120);
      score = score * 0.65 + overlapScore * 0.35;
    } else if (candidateWindows.length > 0) {
      const activeNow = candidateWindows.some(
        (window) =>
          utcMinute >= window.startMinute && utcMinute <= window.endMinute,
      );
      if (activeNow) {
        score = Math.min(1, score + 0.08);
      }
    }

    const timingSignals = input.timingConstraints.map((value) =>
      value.toLowerCase(),
    );
    const immediateRequested = timingSignals.some((signal) =>
      ["now", "asap", "today", "tonight"].some((token) =>
        signal.includes(token),
      ),
    );
    if (immediateRequested) {
      if (
        input.availabilityMode === "now" ||
        input.availabilityMode === "later_today"
      ) {
        score = Math.min(1, score + 0.07);
      } else {
        score = Math.max(0, score - 0.12);
      }
    }

    if (
      input.modality === "offline" &&
      input.availabilityMode === "later_today"
    ) {
      score = Math.min(1, score + 0.04);
    }

    return this.clampUnitInterval(score);
  }

  private computeWindowOverlapMinutes(
    senderWindows: Array<{ startMinute: number; endMinute: number }>,
    candidateWindows: Array<{ startMinute: number; endMinute: number }>,
  ) {
    let overlapMinutes = 0;
    for (const senderWindow of senderWindows) {
      for (const candidateWindow of candidateWindows) {
        const overlapStart = Math.max(
          senderWindow.startMinute,
          candidateWindow.startMinute,
        );
        const overlapEnd = Math.min(
          senderWindow.endMinute,
          candidateWindow.endMinute,
        );
        if (overlapEnd > overlapStart) {
          overlapMinutes += overlapEnd - overlapStart;
        }
      }
    }
    return overlapMinutes;
  }

  private computeCurrentDayWindowOverlapMinutes(
    requesterWindows: Array<{
      dayOfWeek: number;
      startMinute: number;
      endMinute: number;
      mode: string;
    }>,
    candidateWindows: Array<{
      dayOfWeek: number;
      startMinute: number;
      endMinute: number;
      mode: string;
    }>,
  ) {
    const now = new Date();
    const utcDay = now.getUTCDay();
    const requesterCurrentDay = requesterWindows
      .filter((window) => window.dayOfWeek === utcDay)
      .filter((window) => window.mode === "available");
    const candidateCurrentDay = candidateWindows
      .filter((window) => window.dayOfWeek === utcDay)
      .filter((window) => window.mode === "available");

    if (requesterCurrentDay.length === 0 || candidateCurrentDay.length === 0) {
      return 0;
    }

    return this.computeWindowOverlapMinutes(
      requesterCurrentDay,
      candidateCurrentDay,
    );
  }

  private isCurrentlyAvailable(
    availabilityMode: string | null,
    windows: Array<{
      dayOfWeek: number;
      startMinute: number;
      endMinute: number;
      mode: string;
    }>,
  ) {
    if (availabilityMode === "away" || availabilityMode === "invisible") {
      return false;
    }
    if (availabilityMode === "now") {
      return true;
    }

    const now = new Date();
    const utcDay = now.getUTCDay();
    const utcMinute = now.getUTCHours() * 60 + now.getUTCMinutes();
    return windows.some(
      (window) =>
        window.dayOfWeek === utcDay &&
        window.mode === "available" &&
        utcMinute >= window.startMinute &&
        utcMinute <= window.endMinute,
    );
  }

  private computeTrustScore(input: {
    trust: number;
    moderationState: string;
    openReportCount: number;
  }) {
    const base = this.clampUnitInterval(input.trust / 100);
    const moderationPenaltyByState: Record<string, number> = {
      clean: 0,
      flagged: 0.2,
      review: 0.3,
      blocked: 0.45,
    };
    const moderationPenalty =
      moderationPenaltyByState[input.moderationState] ?? 0;
    const reportPenalty = Math.min(0.35, input.openReportCount * 0.08);
    return this.clampUnitInterval(base - moderationPenalty - reportPenalty);
  }

  private computeNoveltyScore(recentInteractionCount: number) {
    if (recentInteractionCount <= 0) {
      return 0.8;
    }
    if (recentInteractionCount === 1) {
      return 0.45;
    }
    return 0.2;
  }

  private computeProximityScore(input: {
    modality?: string;
    senderCity: string | null;
    senderCountry: string | null;
    candidateCity: string | null;
    candidateCountry: string | null;
  }) {
    if (input.modality !== "offline") {
      return 0.5;
    }
    const senderCity = input.senderCity?.toLowerCase();
    const senderCountry = input.senderCountry?.toLowerCase();
    const candidateCity = input.candidateCity?.toLowerCase();
    const candidateCountry = input.candidateCountry?.toLowerCase();

    if (
      senderCity &&
      candidateCity &&
      senderCountry &&
      candidateCountry &&
      senderCity === candidateCity &&
      senderCountry === candidateCountry
    ) {
      return 1;
    }
    if (
      senderCountry &&
      candidateCountry &&
      senderCountry === candidateCountry
    ) {
      return 0.75;
    }
    if (!senderCountry || !candidateCountry) {
      return 0.45;
    }
    return 0.25;
  }

  private computeStyleCompatibilityScore(input: {
    styleSignals: Set<string>;
    labels: Set<string>;
  }) {
    if (input.styleSignals.size === 0) {
      return 0.5;
    }
    let matches = 0;
    for (const signal of input.styleSignals) {
      const normalizedSignal = signal.toLowerCase();
      const hit = Array.from(input.labels).some(
        (label) =>
          label === normalizedSignal ||
          label.includes(normalizedSignal) ||
          normalizedSignal.includes(label),
      );
      if (hit) {
        matches += 1;
      }
    }
    if (matches === 0) {
      return 0.2;
    }
    return this.clampUnitInterval(matches / input.styleSignals.size);
  }

  private computePersonalizationBoost(input: {
    requestedLabels: Set<string>;
    candidateDisplayName: string;
    personalizationProfile: PersonalizationProfile;
  }) {
    let score = 0.5;
    for (const label of input.requestedLabels) {
      const positiveWeight =
        input.personalizationProfile.positiveLabels.get(label) ?? 0;
      const avoidWeight =
        input.personalizationProfile.avoidLabels.get(label) ?? 0;
      score += this.clampUnitInterval(positiveWeight) * 0.12;
      score -= this.clampUnitInterval(avoidWeight) * 0.16;
    }

    const nameKey = input.candidateDisplayName.toLowerCase();
    const highSuccessWeight =
      input.personalizationProfile.highSuccessPeople.get(nameKey) ?? 0;
    score += this.clampUnitInterval(highSuccessWeight) * 0.15;

    return this.clampUnitInterval(score);
  }

  private async fetchRecentInteractionCounts(
    senderUserId: string,
    candidateUserIds: string[],
  ) {
    const counts = new Map<string, number>();
    if (
      candidateUserIds.length === 0 ||
      !this.prisma.connectionParticipant?.findMany
    ) {
      return counts;
    }

    const recentCutoff = new Date(
      Date.now() - RECENT_INTERACTION_SUPPRESSION_DAYS * 24 * 60 * 60_000,
    );
    const senderConnections = await this.prisma.connectionParticipant.findMany({
      where: {
        userId: senderUserId,
        connection: {
          createdAt: {
            gte: recentCutoff,
          },
        },
      },
      select: {
        connectionId: true,
      },
      take: 300,
    });
    if (senderConnections.length === 0) {
      return counts;
    }

    const peers = await this.prisma.connectionParticipant.findMany({
      where: {
        connectionId: {
          in: senderConnections.map((item) => item.connectionId),
        },
        userId: {
          in: candidateUserIds,
          not: senderUserId,
        },
      },
      select: {
        userId: true,
      },
      take: 1000,
    });

    for (const peer of peers) {
      counts.set(peer.userId, (counts.get(peer.userId) ?? 0) + 1);
    }
    return counts;
  }

  private async fetchPersonalizationProfile(
    senderUserId: string,
  ): Promise<PersonalizationProfile> {
    const emptyProfile: PersonalizationProfile = {
      positiveLabels: new Map(),
      avoidLabels: new Map(),
      highSuccessPeople: new Map(),
    };
    if (
      !this.prisma.lifeGraphEdge?.findMany ||
      !this.prisma.lifeGraphNode?.findMany
    ) {
      return emptyProfile;
    }

    const edges = await this.prisma.lifeGraphEdge.findMany({
      where: {
        userId: senderUserId,
        edgeType: {
          in: [
            "likes",
            "prefers",
            "recently_engaged_with",
            "avoids",
            "high_success_with",
          ],
        },
      },
      select: {
        edgeType: true,
        weight: true,
        targetNodeId: true,
      },
      orderBy: {
        updatedAt: "desc",
      },
      take: 120,
    });
    if (edges.length === 0) {
      return emptyProfile;
    }

    const nodes = await this.prisma.lifeGraphNode.findMany({
      where: {
        id: {
          in: edges.map((edge) => edge.targetNodeId),
        },
      },
      select: {
        id: true,
        nodeType: true,
        label: true,
      },
    });
    const nodeById = new Map(nodes.map((node) => [node.id, node]));

    for (const edge of edges) {
      const node = nodeById.get(edge.targetNodeId);
      if (!node) {
        continue;
      }
      const weight = this.clampUnitInterval(Number(edge.weight));
      const label = node.label.toLowerCase();

      if (edge.edgeType === "avoids") {
        emptyProfile.avoidLabels.set(
          label,
          Math.max(emptyProfile.avoidLabels.get(label) ?? 0, weight),
        );
        continue;
      }

      if (edge.edgeType === "high_success_with" && node.nodeType === "person") {
        emptyProfile.highSuccessPeople.set(
          label,
          Math.max(emptyProfile.highSuccessPeople.get(label) ?? 0, weight),
        );
      }
      emptyProfile.positiveLabels.set(
        label,
        Math.max(emptyProfile.positiveLabels.get(label) ?? 0, weight),
      );
    }

    return emptyProfile;
  }

  private passesHardConstraints(
    user: {
      id: string;
      createdAt: Date;
      email: string | null;
      googleSubjectId: string | null;
      profile?: {
        availabilityMode?: string | null;
        visibility?: string | null;
        city?: string | null;
        country?: string | null;
      } | null;
    },
    input: {
      blockedUserIds: Set<string>;
      suppressedUserIds: Set<string>;
      preferencesByUser: Map<string, Map<string, unknown>>;
      senderVerificationLevel: "trusted" | "verified" | "unverified";
      senderRequireVerifiedUsers: boolean;
      senderModalityPreference: "online" | "offline" | "either";
      candidateVerificationByUser: Map<
        string,
        "trusted" | "verified" | "unverified"
      >;
      intentModality?: string;
      intentType?: string;
      sender: {
        id: string;
        createdAt: Date;
        email: string | null;
        googleSubjectId: string | null;
        profile?: {
          availabilityMode?: string | null;
          visibility?: string | null;
          city?: string | null;
          country?: string | null;
        } | null;
      } | null;
    },
  ) {
    if (input.blockedUserIds.has(user.id)) {
      return false;
    }
    if (input.suppressedUserIds.has(user.id)) {
      return false;
    }
    if (
      !this.isReachabilityAllowed(
        user.id,
        input.preferencesByUser,
        user.profile?.availabilityMode,
      )
    ) {
      return false;
    }
    if (
      !this.isContactAllowedByGlobalRules(
        user.id,
        input.preferencesByUser,
        input.senderVerificationLevel,
      )
    ) {
      return false;
    }
    if (
      !this.isIntentModeAllowed(
        user.id,
        input.preferencesByUser,
        input.intentType,
      )
    ) {
      return false;
    }
    if (
      !this.isLanguageAllowedByGlobalRules(
        user.id,
        input.preferencesByUser,
        input.sender?.id ?? null,
      )
    ) {
      return false;
    }
    if (
      !this.isCountryAllowedByGlobalRules(
        user.id,
        input.preferencesByUser,
        input.sender,
        user,
      )
    ) {
      return false;
    }
    if (
      !this.isModalityAllowedByGlobalRules(
        user.id,
        input.preferencesByUser,
        input.intentModality,
        input.senderModalityPreference,
      )
    ) {
      return false;
    }
    if (
      input.senderRequireVerifiedUsers &&
      (input.candidateVerificationByUser.get(user.id) ?? "unverified") ===
        "unverified"
    ) {
      return false;
    }
    const senderId = input.sender?.id ?? null;
    if (
      senderId &&
      (this.isUserMutedInPreferences(
        input.preferencesByUser,
        senderId,
        user.id,
      ) ||
        this.isUserMutedInPreferences(
          input.preferencesByUser,
          user.id,
          senderId,
        ))
    ) {
      return false;
    }
    if (
      !this.passesOfflineSafetyConstraints({
        intentModality: input.intentModality,
        sender: input.sender,
        candidate: user,
      })
    ) {
      return false;
    }
    if (
      user.profile?.availabilityMode === "away" ||
      user.profile?.availabilityMode === "invisible"
    ) {
      return false;
    }

    return true;
  }

  private async retrieveSemanticCandidates(input: {
    intentId?: string;
    candidateUserIds: string[];
    take: number;
  }) {
    if (!input.intentId || input.candidateUserIds.length === 0) {
      return [] as SemanticCandidateRow[];
    }
    if (typeof this.prisma.$queryRawUnsafe !== "function") {
      return [] as SemanticCandidateRow[];
    }

    const distinctCandidateIds = Array.from(new Set(input.candidateUserIds));
    const candidatePlaceholders = distinctCandidateIds
      .map((_, idx) => `$${idx + 2}::uuid`)
      .join(", ");
    const limitPlaceholder = distinctCandidateIds.length + 2;
    const query = `
      SELECT
        candidate.owner_id::text AS "userId",
        (1 - (candidate.vector <=> intent.vector))::double precision AS "semanticScore"
      FROM "embeddings" candidate
      INNER JOIN "embeddings" intent
        ON intent.owner_type = 'intent'
       AND intent.owner_id = $1::uuid
       AND intent.embedding_type = 'intent_text'
      WHERE candidate.owner_type = 'user_profile'
        AND candidate.embedding_type = 'profile_summary'
        AND candidate.owner_id IN (${candidatePlaceholders})
      ORDER BY candidate.vector <=> intent.vector ASC
      LIMIT $${limitPlaceholder}::int
    `;

    try {
      const rows = (await this.prisma.$queryRawUnsafe(
        query,
        input.intentId,
        ...distinctCandidateIds,
        input.take,
      )) as Array<{ userId?: unknown; semanticScore?: unknown }>;

      return rows
        .map((row) => {
          if (typeof row.userId !== "string") {
            return null;
          }
          const semanticScore =
            typeof row.semanticScore === "number" &&
            Number.isFinite(row.semanticScore)
              ? this.clampUnitInterval(row.semanticScore)
              : 0;

          return {
            userId: row.userId,
            semanticScore,
          } satisfies SemanticCandidateRow;
        })
        .filter((row): row is SemanticCandidateRow => row !== null);
    } catch (error) {
      this.logger.warn(
        `semantic candidate retrieval failed for intent ${input.intentId}: ${String(
          error,
        )}`,
      );
      return [] as SemanticCandidateRow[];
    }
  }

  private async logRetrievalSnapshot(input: {
    senderUserId: string;
    intentId?: string;
    traceId?: string;
    requestedLabelCount: number;
    eligibleUserCount: number;
    semanticUserCount: number;
    fallbackUserCount: number;
    scoredCandidates: RetrievedCandidate[];
  }) {
    if (!input.intentId) {
      return;
    }

    const topCandidates = input.scoredCandidates
      .slice(0, 10)
      .map((candidate) => ({
        userId: candidate.userId,
        score: candidate.score,
        rationale: candidate.rationale,
      }));

    try {
      await this.prisma.auditLog.create({
        data: {
          actorUserId: input.senderUserId,
          actorType: "system",
          action: "matching.candidates_retrieved",
          entityType: "intent",
          entityId: input.intentId,
          metadata: this.toJsonObject({
            traceId: input.traceId,
            requestedLabelCount: input.requestedLabelCount,
            eligibleUserCount: input.eligibleUserCount,
            semanticUserCount: input.semanticUserCount,
            fallbackUserCount: input.fallbackUserCount,
            topCandidates,
          }),
        },
      });
    } catch (error) {
      this.logger.warn(
        `candidate retrieval logging failed for intent ${input.intentId}: ${String(
          error,
        )}`,
      );
    }
  }

  private isReachabilityAllowed(
    userId: string,
    preferencesByUser: Map<string, Map<string, unknown>>,
    availabilityMode?: string | null,
  ) {
    const reachablePref = this.readStringPreference(
      preferencesByUser,
      userId,
      "global_rules_reachable",
    );

    if (reachablePref === "do_not_disturb") {
      return false;
    }

    if (reachablePref === "available_only") {
      return availabilityMode !== "away" && availabilityMode !== "invisible";
    }

    return true;
  }

  private isContactAllowedByGlobalRules(
    userId: string,
    preferencesByUser: Map<string, Map<string, unknown>>,
    senderVerificationLevel: "trusted" | "verified" | "unverified",
  ) {
    const whoCanContact =
      this.readStringPreference(
        preferencesByUser,
        userId,
        "global_rules_who_can_contact",
      ) ?? "anyone";
    const requireVerifiedUsers =
      this.readBooleanPreference(
        preferencesByUser,
        userId,
        "global_rules_require_verified_users",
      ) ?? false;
    const senderIsVerified = senderVerificationLevel !== "unverified";
    const senderIsTrusted = senderVerificationLevel === "trusted";

    if (requireVerifiedUsers && !senderIsVerified) {
      return false;
    }
    if (whoCanContact === "verified_only" && !senderIsVerified) {
      return false;
    }
    if (whoCanContact === "trusted_only" && !senderIsTrusted) {
      return false;
    }

    return true;
  }

  private isIntentModeAllowed(
    userId: string,
    preferencesByUser: Map<string, Map<string, unknown>>,
    intentType?: string,
  ) {
    const intentModePref =
      this.readStringPreference(
        preferencesByUser,
        userId,
        "global_rules_intent_mode",
      ) ?? "balanced";
    const isGroupIntent = intentType === "group";

    if (intentModePref === "one_to_one" && isGroupIntent) {
      return false;
    }
    if (intentModePref === "group" && !isGroupIntent) {
      return false;
    }

    return true;
  }

  private isModalityAllowedByGlobalRules(
    userId: string,
    preferencesByUser: Map<string, Map<string, unknown>>,
    intentModality: string | undefined,
    senderModalityPreference: "online" | "offline" | "either",
  ) {
    const candidateModality = this.resolveModalityPreference(
      this.readStringPreference(
        preferencesByUser,
        userId,
        "global_rules_modality",
      ),
    );
    const requestedModality =
      intentModality === "online" || intentModality === "offline"
        ? intentModality
        : "either";

    if (
      requestedModality !== "either" &&
      candidateModality !== "either" &&
      candidateModality !== requestedModality
    ) {
      return false;
    }
    if (
      senderModalityPreference !== "either" &&
      candidateModality !== "either" &&
      candidateModality !== senderModalityPreference
    ) {
      return false;
    }

    return true;
  }

  private isLanguageAllowedByGlobalRules(
    candidateUserId: string,
    preferencesByUser: Map<string, Map<string, unknown>>,
    senderUserId: string | null,
  ) {
    if (!senderUserId) {
      return true;
    }

    const senderLanguages = this.readNormalizedStringArrayPreference(
      preferencesByUser,
      senderUserId,
      "global_rules_language_preferences",
    );
    const candidateLanguages = this.readNormalizedStringArrayPreference(
      preferencesByUser,
      candidateUserId,
      "global_rules_language_preferences",
    );

    if (senderLanguages.length === 0 && candidateLanguages.length === 0) {
      return true;
    }
    if (senderLanguages.length === 0 || candidateLanguages.length === 0) {
      return false;
    }

    return senderLanguages.some((language) =>
      candidateLanguages.includes(language),
    );
  }

  private isCountryAllowedByGlobalRules(
    candidateUserId: string,
    preferencesByUser: Map<string, Map<string, unknown>>,
    sender: {
      id?: string;
      profile?: {
        country?: string | null;
      } | null;
    } | null,
    candidate: {
      profile?: {
        country?: string | null;
      } | null;
    },
  ) {
    const senderUserId = typeof sender?.id === "string" ? sender.id : null;
    const senderCountry = this.normalizeCountry(sender?.profile?.country);
    const candidateCountry = this.normalizeCountry(candidate.profile?.country);
    const senderCountryPreferences = senderUserId
      ? this.readNormalizedStringArrayPreference(
          preferencesByUser,
          senderUserId,
          "global_rules_country_preferences",
        )
      : [];
    const candidateCountryPreferences =
      this.readNormalizedStringArrayPreference(
        preferencesByUser,
        candidateUserId,
        "global_rules_country_preferences",
      );

    if (
      senderCountryPreferences.length > 0 &&
      (!candidateCountry ||
        !senderCountryPreferences.includes(candidateCountry))
    ) {
      return false;
    }
    if (
      candidateCountryPreferences.length > 0 &&
      (!senderCountry || !candidateCountryPreferences.includes(senderCountry))
    ) {
      return false;
    }

    return true;
  }

  private readStringPreference(
    preferencesByUser: Map<string, Map<string, unknown>>,
    userId: string,
    key: string,
  ): string | null {
    const value = preferencesByUser.get(userId)?.get(key);
    return typeof value === "string" ? value : null;
  }

  private readBooleanPreference(
    preferencesByUser: Map<string, Map<string, unknown>>,
    userId: string,
    key: string,
  ): boolean | null {
    const value = preferencesByUser.get(userId)?.get(key);
    return typeof value === "boolean" ? value : null;
  }

  private readNormalizedStringArrayPreference(
    preferencesByUser: Map<string, Map<string, unknown>>,
    userId: string,
    key: string,
  ) {
    const value = preferencesByUser.get(userId)?.get(key);
    if (!Array.isArray(value)) {
      return [];
    }
    return value
      .map((item) =>
        typeof item === "string" ? item.trim().toLowerCase() : "",
      )
      .filter((item) => item.length > 0);
  }

  private isUserMutedInPreferences(
    preferencesByUser: Map<string, Map<string, unknown>>,
    sourceUserId: string,
    targetUserId: string,
  ) {
    const normalizedTarget = targetUserId.trim().toLowerCase();
    if (!normalizedTarget) {
      return false;
    }
    const mutedUserIds = this.readNormalizedStringArrayPreference(
      preferencesByUser,
      sourceUserId,
      MUTE_USER_IDS_PREFERENCE_KEY,
    );
    return mutedUserIds.includes(normalizedTarget);
  }

  private resolveVerificationLevel(input: {
    googleSubjectId: string | null;
    email: string | null;
    trustScore: number;
  }): "trusted" | "verified" | "unverified" {
    const hasIdentity = Boolean(input.googleSubjectId || input.email);
    if (!hasIdentity) {
      return "unverified";
    }
    return input.trustScore >= 80 ? "trusted" : "verified";
  }

  private resolveModalityPreference(
    value: string | null,
  ): "online" | "offline" | "either" {
    if (value === "online" || value === "offline" || value === "either") {
      return value;
    }
    return "either";
  }

  private passesOfflineSafetyConstraints(input: {
    intentModality?: string;
    sender: {
      createdAt: Date;
      profile?: {
        visibility?: string | null;
        country?: string | null;
      } | null;
    } | null;
    candidate: {
      createdAt: Date;
      profile?: {
        visibility?: string | null;
        country?: string | null;
      } | null;
    };
  }) {
    if (input.intentModality !== "offline") {
      return true;
    }
    if (!input.sender) {
      return false;
    }

    const senderVisibility = this.normalizeVisibility(
      input.sender.profile?.visibility,
    );
    const candidateVisibility = this.normalizeVisibility(
      input.candidate.profile?.visibility,
    );
    if (senderVisibility === "private" || candidateVisibility === "private") {
      return false;
    }

    const senderCountry = this.normalizeCountry(input.sender.profile?.country);
    const candidateCountry = this.normalizeCountry(
      input.candidate.profile?.country,
    );
    if (
      !senderCountry ||
      !candidateCountry ||
      senderCountry !== candidateCountry
    ) {
      return false;
    }

    const senderAgeDays = this.resolveAccountAgeDays(input.sender.createdAt);
    const candidateAgeDays = this.resolveAccountAgeDays(
      input.candidate.createdAt,
    );
    if (
      senderAgeDays !== null &&
      senderAgeDays < this.offlineMinAccountAgeDays
    ) {
      return false;
    }
    if (
      candidateAgeDays !== null &&
      candidateAgeDays < this.offlineMinAccountAgeDays
    ) {
      return false;
    }

    return true;
  }

  private normalizeVisibility(value: string | null | undefined) {
    if (value === "private") {
      return "private";
    }
    if (value === "limited") {
      return "limited";
    }
    return "public";
  }

  private normalizeCountry(value: string | null | undefined) {
    if (!value) {
      return null;
    }
    const normalized = value.trim().toLowerCase();
    return normalized.length > 0 ? normalized : null;
  }

  private resolveAccountAgeDays(createdAt: Date | null | undefined) {
    if (!createdAt) {
      return null;
    }
    return Math.max(
      0,
      Math.floor((Date.now() - createdAt.getTime()) / (24 * 60 * 60_000)),
    );
  }

  private resolveOfflineMinAccountAgeDays() {
    const parsed = Number(
      process.env.OFFLINE_SAFETY_MIN_ACCOUNT_AGE_DAYS ??
        DEFAULT_OFFLINE_MIN_ACCOUNT_AGE_DAYS,
    );
    if (!Number.isFinite(parsed)) {
      return DEFAULT_OFFLINE_MIN_ACCOUNT_AGE_DAYS;
    }
    return Math.min(Math.max(Math.floor(parsed), 0), 365);
  }

  private clampUnitInterval(value: number) {
    if (!Number.isFinite(value)) {
      return 0;
    }
    return Math.max(0, Math.min(1, value));
  }

  private toJsonObject(
    input: Record<string, unknown> | undefined,
  ): Prisma.InputJsonObject | undefined {
    if (!input) {
      return undefined;
    }
    return JSON.parse(JSON.stringify(input)) as Prisma.InputJsonObject;
  }

  private async upsertEmbedding(input: {
    ownerType: string;
    ownerId: string;
    embeddingType: string;
    text: string;
  }) {
    const vector = await this.generateEmbeddingVector(input.text);
    const vectorLiteral = `[${vector.map((value) => value.toFixed(6)).join(",")}]`;

    await this.prisma.$executeRawUnsafe(
      'DELETE FROM "embeddings" WHERE owner_type = $1 AND owner_id = $2::uuid AND embedding_type = $3',
      input.ownerType,
      input.ownerId,
      input.embeddingType,
    );

    await this.prisma.$executeRawUnsafe(
      'INSERT INTO "embeddings" (id, owner_type, owner_id, embedding_type, model, vector, created_at, updated_at) VALUES (gen_random_uuid(), $1, $2::uuid, $3, $4, $5::vector, NOW(), NOW())',
      input.ownerType,
      input.ownerId,
      input.embeddingType,
      EMBEDDING_MODEL,
      vectorLiteral,
    );

    return {
      ownerType: input.ownerType,
      ownerId: input.ownerId,
      embeddingType: input.embeddingType,
      model: EMBEDDING_MODEL,
      dimensions: EMBEDDING_DIMENSIONS,
    };
  }

  private async generateEmbeddingVector(text: string) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return this.generateDeterministicEmbedding(text);
    }

    const startedAt = Date.now();
    try {
      const response = await fetch("https://api.openai.com/v1/embeddings", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          input: text,
          model: EMBEDDING_MODEL,
        }),
      });
      if (!response.ok) {
        recordOpenAIMetric({
          operation: "embedding_generation",
          latencyMs: Date.now() - startedAt,
          ok: false,
        });
        return this.generateDeterministicEmbedding(text);
      }

      const payload = (await response.json()) as {
        data?: Array<{ embedding?: number[] }>;
      };
      const candidate = payload.data?.[0]?.embedding;
      if (!Array.isArray(candidate) || candidate.length === 0) {
        recordOpenAIMetric({
          operation: "embedding_generation",
          latencyMs: Date.now() - startedAt,
          ok: false,
        });
        return this.generateDeterministicEmbedding(text);
      }

      recordOpenAIMetric({
        operation: "embedding_generation",
        latencyMs: Date.now() - startedAt,
        ok: true,
      });
      return this.normalizeEmbeddingLength(candidate, EMBEDDING_DIMENSIONS);
    } catch {
      recordOpenAIMetric({
        operation: "embedding_generation",
        latencyMs: Date.now() - startedAt,
        ok: false,
      });
      return this.generateDeterministicEmbedding(text);
    }
  }

  private generateDeterministicEmbedding(text: string) {
    const hash = createHash("sha256").update(text).digest();
    let state = hash.readUInt32BE(0);
    const output: number[] = new Array(EMBEDDING_DIMENSIONS);

    for (let i = 0; i < EMBEDDING_DIMENSIONS; i += 1) {
      state = (state * 1664525 + 1013904223) >>> 0;
      output[i] = (state / 0xffffffff) * 2 - 1;
    }

    return output;
  }

  private normalizeEmbeddingLength(vector: number[], targetSize: number) {
    if (vector.length === targetSize) {
      return vector;
    }
    if (vector.length > targetSize) {
      return vector.slice(0, targetSize);
    }

    const padded = [...vector];
    while (padded.length < targetSize) {
      padded.push(0);
    }
    return padded;
  }
}
