import { Injectable, Logger, Optional } from "@nestjs/common";
import { OpenAIClient } from "@opensocial/openai";
import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { AnalyticsService } from "../analytics/analytics.service.js";
import { PrismaService } from "../database/prisma.service.js";
import { RealtimeEventsService } from "../realtime/realtime-events.service.js";

const STRIKE_PREFERENCE_KEY = "moderation.strikes.v1";
const AUTO_STRIKE_REASON_TERMS = [
  "abuse",
  "harassment",
  "threat",
  "violence",
  "hate",
  "impersonation",
];
const URL_PATTERN = /(https?:\/\/|www\.)/gi;
const MENTION_PATTERN = /(^|\s)@[a-z0-9_]{2,32}\b/gi;
const BLOCKLIST_TERMS = [
  "kill yourself",
  "bomb threat",
  "terror attack",
  "sexual assault",
  "exploit child",
];
const REVIEW_TERMS = [
  "weapon meetup",
  "illegal deal",
  "underage meetup",
  "buy drugs",
  "scam",
  "impersonate",
];

type StrikeEnforcementAction = "warn" | "flag" | "restrict" | "suspend";

interface StrikeState {
  count: number;
  history: Array<{
    issuedAt: string;
    reason: string;
    severity: number;
    moderatorUserId: string;
    entityType?: string;
    entityId?: string;
  }>;
  updatedAt: string;
}

type ModerationRiskDecision = "clean" | "review" | "blocked";

export interface ContentRiskAssessment {
  decision: ModerationRiskDecision;
  score: number;
  reasons: string[];
  surface: string;
  signals: {
    urlCount: number;
    mentionCount: number;
    repeatedWordRatio: number;
    repeatedCharacterRun: boolean;
  };
}

@Injectable()
export class ModerationService {
  private readonly logger = new Logger(ModerationService.name);
  private readonly openAIClient: OpenAIClient;
  private readonly openAIModerationEnabled: boolean;

  constructor(
    private readonly prisma: PrismaService,
    @Optional()
    private readonly analyticsService?: AnalyticsService,
    @Optional()
    private readonly realtimeEventsService?: RealtimeEventsService,
    @Optional()
    private readonly moderationOpenAIClient?: OpenAIClient,
  ) {
    this.openAIClient =
      moderationOpenAIClient ??
      new OpenAIClient({
        apiKey: process.env.OPENAI_API_KEY ?? "",
      });
    this.openAIModerationEnabled = this.readBooleanEnv(
      process.env.OPENAI_MODERATION_ENABLED,
      process.env.NODE_ENV !== "test",
    );
  }

  async createReport(
    reporterUserId: string,
    targetUserId: string | null,
    reason: string,
    details?: string,
    options?: {
      entityType?: "chat_message" | "intent" | "profile" | "user";
      entityId?: string;
    },
  ) {
    const report = await this.prisma.userReport.create({
      data: { reporterUserId, targetUserId, reason, details },
    });
    await this.trackAnalyticsEventSafe({
      eventType: "report_submitted",
      actorUserId: reporterUserId,
      entityType: options?.entityType ?? "user_report",
      entityId: options?.entityId ?? report.id,
      properties: {
        reportId: report.id,
        targetUserId,
        reason,
      },
    });

    let moderationFlag: { id: string } | null = null;
    if (options?.entityType && options.entityId && this.prisma.moderationFlag) {
      moderationFlag = await this.prisma.moderationFlag.create({
        data: {
          entityType: options.entityType,
          entityId: options.entityId,
          reason: `report:${reason}`,
          status: "open",
        },
        select: {
          id: true,
        },
      });
    }

    if (this.prisma.auditLog?.create) {
      await this.prisma.auditLog.create({
        data: {
          actorUserId: reporterUserId,
          actorType: "user",
          action: "moderation.report_submitted",
          entityType: options?.entityType ?? "user_report",
          entityId: options?.entityId ?? null,
          metadata: {
            reportId: report.id,
            targetUserId,
            reason,
            details: details ?? null,
          } as Prisma.InputJsonValue,
        },
      });
    }

    if (
      targetUserId &&
      reason.toLowerCase().includes("impersonation") &&
      this.prisma.userProfile?.upsert
    ) {
      await this.prisma.userProfile.upsert({
        where: { userId: targetUserId },
        create: {
          userId: targetUserId,
          moderationState: "review",
        },
        update: {
          moderationState: "review",
        },
      });
    }
    if (targetUserId) {
      this.realtimeEventsService?.emitModerationNotice(
        targetUserId,
        "A moderation report related to your account is under review.",
      );
    }

    let strike: Awaited<ReturnType<ModerationService["issueStrike"]>> | null =
      null;
    if (
      targetUserId &&
      this.shouldAutoIssueStrike(reason, options?.entityType)
    ) {
      strike = await this.issueStrike({
        moderatorUserId: reporterUserId,
        targetUserId,
        reason: `report:${reason}`,
        severity: options?.entityType === "chat_message" ? 2 : 1,
        entityType: options?.entityType,
        entityId: options?.entityId,
      });
    }

    return {
      report,
      moderationFlagId: moderationFlag?.id ?? null,
      strike,
    };
  }

  async blockUser(blockerUserId: string, blockedUserId: string) {
    const block = await this.prisma.block.create({
      data: { blockerUserId, blockedUserId },
    });
    await this.trackAnalyticsEventSafe({
      eventType: "user_blocked",
      actorUserId: blockerUserId,
      entityType: "block",
      entityId: block.id,
      properties: {
        blockedUserId,
      },
    });
    return block;
  }

  async unblockUser(blockerUserId: string, blockedUserId: string) {
    const result = await this.prisma.block.deleteMany({
      where: { blockerUserId, blockedUserId },
    });
    await this.trackAnalyticsEventSafe({
      eventType: "user_unblocked",
      actorUserId: blockerUserId,
      entityType: "block",
      entityId: blockedUserId,
      properties: {
        blockedUserId,
        removedCount: result.count,
      },
    });
    return {
      blockerUserId,
      blockedUserId,
      removed: result.count > 0,
      removedCount: result.count,
    };
  }

  async listBlocks(blockerUserId: string) {
    return this.prisma.block.findMany({
      where: { blockerUserId },
      orderBy: { createdAt: "desc" },
    });
  }

  async issueStrike(input: {
    moderatorUserId: string;
    targetUserId: string;
    reason: string;
    severity: number;
    entityType?: "chat_message" | "intent" | "profile" | "user";
    entityId?: string;
  }) {
    const normalizedSeverity = Math.min(
      Math.max(Math.floor(input.severity), 1),
      3,
    );
    const previous = await this.loadStrikeState(input.targetUserId);
    const nextCount = previous.state.count + normalizedSeverity;

    const nextState: StrikeState = {
      count: nextCount,
      history: [
        ...previous.state.history,
        {
          issuedAt: new Date().toISOString(),
          reason: input.reason,
          severity: normalizedSeverity,
          moderatorUserId: input.moderatorUserId,
          ...(input.entityType ? { entityType: input.entityType } : {}),
          ...(input.entityId ? { entityId: input.entityId } : {}),
        },
      ].slice(-50),
      updatedAt: new Date().toISOString(),
    };

    await this.saveStrikeState(
      input.targetUserId,
      previous.preferenceId,
      nextState,
    );

    const enforcement = this.resolveStrikeEnforcement(nextCount);
    const existingProfile = this.prisma.userProfile?.findUnique
      ? await this.prisma.userProfile.findUnique({
          where: { userId: input.targetUserId },
          select: { moderationState: true },
        })
      : null;
    const effectiveModerationState = this.pickMoreRestrictiveModerationState(
      existingProfile?.moderationState ?? "clean",
      enforcement.profileModerationState,
    );
    if (this.prisma.userProfile?.upsert) {
      await this.prisma.userProfile.upsert({
        where: { userId: input.targetUserId },
        create: {
          userId: input.targetUserId,
          moderationState: effectiveModerationState,
        },
        update: {
          moderationState: effectiveModerationState,
        },
      });
    }
    if (enforcement.userStatus && this.prisma.user?.update) {
      await this.prisma.user.update({
        where: { id: input.targetUserId },
        data: {
          status: enforcement.userStatus,
        },
      });
    }

    if (this.prisma.moderationFlag?.create) {
      await this.prisma.moderationFlag.create({
        data: {
          entityType: "user",
          entityId: input.targetUserId,
          reason: `strike_${enforcement.action}:${nextCount}`,
          status: "open",
        },
      });
    }

    if (this.prisma.auditLog?.create) {
      await this.prisma.auditLog.create({
        data: {
          actorUserId: input.moderatorUserId,
          actorType: "system",
          action: "moderation.strike_issued",
          entityType: "user",
          entityId: input.targetUserId,
          metadata: {
            reason: input.reason,
            severity: normalizedSeverity,
            strikeCount: nextCount,
            action: enforcement.action,
            entityType: input.entityType ?? null,
            entityId: input.entityId ?? null,
          } as Prisma.InputJsonValue,
        },
      });
    }
    this.realtimeEventsService?.emitModerationNotice(
      input.targetUserId,
      `Account moderation action applied: ${enforcement.action}.`,
    );

    return {
      targetUserId: input.targetUserId,
      strikeCount: nextCount,
      moderationState: effectiveModerationState,
      userStatus: enforcement.userStatus ?? "active",
      action: enforcement.action,
    };
  }

  async getEnforcementStatus(userId: string) {
    const [strikes, profile, user] = await Promise.all([
      this.loadStrikeState(userId),
      this.prisma.userProfile?.findUnique
        ? this.prisma.userProfile.findUnique({
            where: { userId },
            select: { moderationState: true },
          })
        : Promise.resolve(null),
      this.prisma.user?.findUnique
        ? this.prisma.user.findUnique({
            where: { id: userId },
            select: { status: true },
          })
        : Promise.resolve(null),
    ]);

    const resolved = this.resolveStrikeEnforcement(strikes.state.count);
    return {
      userId,
      strikeCount: strikes.state.count,
      strikeHistory: strikes.state.history,
      enforcementAction: resolved.action,
      moderationState:
        profile?.moderationState ?? resolved.profileModerationState,
      userStatus: user?.status ?? resolved.userStatus ?? "active",
    };
  }

  assessContentRisk(input: {
    content: string;
    context?: string;
    surface?: string;
  }): ContentRiskAssessment {
    const content = input.content.trim();
    const normalized = content.toLowerCase();
    const reasons: string[] = [];
    let score = 0;

    const blockedMatches = BLOCKLIST_TERMS.filter((term) =>
      normalized.includes(term),
    );
    if (blockedMatches.length > 0) {
      reasons.push(`blocked_term:${blockedMatches[0]}`);
      score += 0.8;
    }

    const reviewMatches = REVIEW_TERMS.filter((term) =>
      normalized.includes(term),
    );
    if (reviewMatches.length > 0) {
      reasons.push(`review_term:${reviewMatches[0]}`);
      score += 0.45;
    }

    const urlCount = normalized.match(URL_PATTERN)?.length ?? 0;
    const mentionCount = normalized.match(MENTION_PATTERN)?.length ?? 0;
    if (urlCount >= 3) {
      reasons.push("url_spam");
      score += Math.min(0.35, urlCount * 0.08);
    }
    if (mentionCount >= 6) {
      reasons.push("mention_spam");
      score += Math.min(0.25, mentionCount * 0.03);
    }

    const repeatedCharacterRun = /(.)\1{7,}/.test(normalized);
    if (repeatedCharacterRun) {
      reasons.push("repeated_character_run");
      score += 0.15;
    }

    const words = normalized
      .split(/\s+/)
      .map((word) => word.trim())
      .filter((word) => word.length > 0);
    const repeatedWordRatio = this.computeRepeatedWordRatio(words);
    if (repeatedWordRatio >= 0.45 && words.length >= 8) {
      reasons.push("repeated_word_spam");
      score += 0.2;
    }

    if ((input.context ?? "").toLowerCase().includes("bypass safety")) {
      reasons.push("safety_evasion_context");
      score += 0.25;
    }

    const boundedScore = Math.max(0, Math.min(1, score));
    const decision = this.resolveRiskDecision(
      boundedScore,
      blockedMatches.length > 0,
      reviewMatches.length > 0,
      urlCount,
      mentionCount,
    );

    return {
      decision,
      score: boundedScore,
      reasons: reasons.length > 0 ? reasons : ["no_risk_signal"],
      surface: input.surface ?? "unknown",
      signals: {
        urlCount,
        mentionCount,
        repeatedWordRatio,
        repeatedCharacterRun,
      },
    };
  }

  async assessContentRiskWithPolicy(input: {
    content: string;
    context?: string;
    surface?: string;
    traceId?: string;
  }): Promise<ContentRiskAssessment> {
    const deterministicAssessment = this.assessContentRisk({
      content: input.content,
      context: input.context,
      surface: input.surface,
    });
    if (!this.shouldUseOpenAIModeration()) {
      return deterministicAssessment;
    }

    try {
      const assistedAssessment = await this.openAIClient.assistModeration(
        {
          content: input.content,
          context: input.context,
        },
        input.traceId?.trim() || randomUUID(),
      );
      return this.mergeAssessmentsWithOpenAIAssist(
        deterministicAssessment,
        assistedAssessment,
      );
    } catch (error) {
      this.logger.warn(
        `openai moderation assist failed; using deterministic fallback: ${String(error)}`,
      );
      return deterministicAssessment;
    }
  }

  private shouldAutoIssueStrike(reason: string, entityType?: string) {
    if (entityType === "chat_message") {
      return true;
    }
    const normalizedReason = reason.toLowerCase();
    return AUTO_STRIKE_REASON_TERMS.some((term) =>
      normalizedReason.includes(term),
    );
  }

  private computeRepeatedWordRatio(words: string[]) {
    if (words.length === 0) {
      return 0;
    }
    const counts = new Map<string, number>();
    for (const word of words) {
      counts.set(word, (counts.get(word) ?? 0) + 1);
    }
    const repeated = Array.from(counts.values()).reduce(
      (total, count) => total + (count > 1 ? count - 1 : 0),
      0,
    );
    return repeated / words.length;
  }

  private resolveRiskDecision(
    score: number,
    hasBlockedTerm: boolean,
    hasReviewTerm: boolean,
    urlCount: number,
    mentionCount: number,
  ): ModerationRiskDecision {
    if (hasBlockedTerm || score >= 0.85) {
      return "blocked";
    }
    if (hasReviewTerm || score >= 0.45 || urlCount >= 4 || mentionCount >= 10) {
      return "review";
    }
    return "clean";
  }

  private shouldUseOpenAIModeration() {
    if (!this.openAIModerationEnabled) {
      return false;
    }
    return Boolean(process.env.OPENAI_API_KEY || this.moderationOpenAIClient);
  }

  private mergeAssessmentsWithOpenAIAssist(
    deterministic: ContentRiskAssessment,
    assisted: {
      decision: "clean" | "review" | "blocked";
      reason?: string;
    },
  ): ContentRiskAssessment {
    const decision = this.pickMoreRestrictiveRiskDecision(
      deterministic.decision,
      assisted.decision,
    );
    const reasons = deterministic.reasons.filter(
      (reason) => reason !== "no_risk_signal",
    );
    if (assisted.decision !== "clean") {
      reasons.push(`openai_decision:${assisted.decision}`);
    }
    const normalizedReason = this.normalizeReasonToken(assisted.reason);
    if (normalizedReason) {
      reasons.push(`openai_reason:${normalizedReason}`);
    }

    let score = deterministic.score;
    if (assisted.decision === "review") {
      score = Math.max(score, 0.55);
    }
    if (assisted.decision === "blocked") {
      score = Math.max(score, 0.9);
    }

    return {
      ...deterministic,
      decision,
      score: Math.max(0, Math.min(1, score)),
      reasons:
        reasons.length > 0 ? Array.from(new Set(reasons)) : ["no_risk_signal"],
    };
  }

  private pickMoreRestrictiveRiskDecision(
    current: ModerationRiskDecision,
    next: ModerationRiskDecision,
  ): ModerationRiskDecision {
    const rank: Record<ModerationRiskDecision, number> = {
      clean: 0,
      review: 1,
      blocked: 2,
    };
    return rank[current] >= rank[next] ? current : next;
  }

  private normalizeReasonToken(value?: string) {
    if (!value) {
      return null;
    }
    return value
      .toLowerCase()
      .replace(/[^a-z0-9:_\-\s]/g, "")
      .trim()
      .replace(/\s+/g, "_")
      .slice(0, 100);
  }

  private async loadStrikeState(userId: string) {
    if (!this.prisma.userPreference?.findFirst) {
      return {
        preferenceId: null as string | null,
        state: this.emptyStrikeState(),
      };
    }

    const existing = await this.prisma.userPreference.findFirst({
      where: {
        userId,
        key: STRIKE_PREFERENCE_KEY,
      },
      orderBy: {
        createdAt: "desc",
      },
      select: {
        id: true,
        value: true,
      },
    });

    return {
      preferenceId: existing?.id ?? null,
      state: this.parseStrikeState(existing?.value ?? null),
    };
  }

  private async saveStrikeState(
    userId: string,
    preferenceId: string | null,
    state: StrikeState,
  ) {
    if (preferenceId && this.prisma.userPreference?.update) {
      await this.prisma.userPreference.update({
        where: { id: preferenceId },
        data: {
          value: state as unknown as Prisma.InputJsonValue,
        },
      });
      return;
    }
    if (this.prisma.userPreference?.create) {
      await this.prisma.userPreference.create({
        data: {
          userId,
          key: STRIKE_PREFERENCE_KEY,
          value: state as unknown as Prisma.InputJsonValue,
        },
      });
    }
  }

  private resolveStrikeEnforcement(strikeCount: number) {
    if (strikeCount >= 5) {
      return {
        action: "suspend" as StrikeEnforcementAction,
        profileModerationState: "blocked" as const,
        userStatus: "suspended" as const,
      };
    }
    if (strikeCount >= 3) {
      return {
        action: "restrict" as StrikeEnforcementAction,
        profileModerationState: "blocked" as const,
        userStatus: null,
      };
    }
    if (strikeCount >= 2) {
      return {
        action: "flag" as StrikeEnforcementAction,
        profileModerationState: "flagged" as const,
        userStatus: null,
      };
    }
    return {
      action: "warn" as StrikeEnforcementAction,
      profileModerationState: "clean" as const,
      userStatus: null,
    };
  }

  private parseStrikeState(value: Prisma.JsonValue | null): StrikeState {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return this.emptyStrikeState();
    }
    const raw = value as Record<string, unknown>;
    const count = this.readFiniteNumber(raw.count);
    const history = Array.isArray(raw.history)
      ? raw.history
          .filter(
            (
              item,
            ): item is {
              issuedAt: string;
              reason: string;
              severity: number;
              moderatorUserId: string;
              entityType?: string;
              entityId?: string;
            } =>
              typeof item === "object" &&
              item !== null &&
              typeof (item as Record<string, unknown>).reason === "string" &&
              typeof (item as Record<string, unknown>).issuedAt === "string" &&
              typeof (item as Record<string, unknown>).moderatorUserId ===
                "string" &&
              typeof (item as Record<string, unknown>).severity === "number",
          )
          .slice(-50)
      : [];

    return {
      count: count ?? 0,
      history,
      updatedAt:
        typeof raw.updatedAt === "string"
          ? raw.updatedAt
          : new Date().toISOString(),
    };
  }

  private emptyStrikeState(): StrikeState {
    return {
      count: 0,
      history: [],
      updatedAt: new Date().toISOString(),
    };
  }

  private readFiniteNumber(value: unknown) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return null;
    }
    return value;
  }

  private pickMoreRestrictiveModerationState(
    current: "clean" | "flagged" | "review" | "blocked",
    next: "clean" | "flagged" | "blocked",
  ) {
    const rank: Record<"clean" | "flagged" | "review" | "blocked", number> = {
      clean: 0,
      flagged: 1,
      review: 2,
      blocked: 3,
    };
    return rank[current] >= rank[next] ? current : next;
  }

  private readBooleanEnv(rawValue: string | undefined, fallback: boolean) {
    if (!rawValue) {
      return fallback;
    }
    const normalized = rawValue.toLowerCase().trim();
    if (["1", "true", "yes", "on"].includes(normalized)) {
      return true;
    }
    if (["0", "false", "no", "off"].includes(normalized)) {
      return false;
    }
    return fallback;
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
