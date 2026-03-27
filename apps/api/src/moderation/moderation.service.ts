import { Injectable, Logger, Optional } from "@nestjs/common";
import { OpenAIClient } from "@opensocial/openai";
import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { AnalyticsService } from "../analytics/analytics.service.js";
import { recordModerationDecisionMetric } from "../common/ops-metrics.js";
import { PrismaService } from "../database/prisma.service.js";
import { RealtimeEventsService } from "../realtime/realtime-events.service.js";

const STRIKE_PREFERENCE_KEY = "moderation.strikes.v1";
const MODERATION_DECISION_KEY_PREFIX = "moderation.decision.v1";
const MODERATION_POLICY_VERSION = "moderation.policy.v1.strict";
const MODERATION_SYSTEM_USER_ID = "00000000-0000-4000-8000-000000000000";
const DEFAULT_MODERATION_DECISION_RETENTION_DAYS = 180;
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

type UnifiedRiskLevel = "allow" | "review" | "block";
type ModerationDecisionSource = "rules" | "openai" | "human";

interface ModerationDecisionRecord {
  id: string;
  idempotencyKey: string;
  contentRef: string;
  contentType: string;
  actorUserId: string | null;
  surface: string;
  riskLevel: UnifiedRiskLevel;
  decisionSource: ModerationDecisionSource;
  policyVersion: string;
  reasons: string[];
  evidenceRefs: string[];
  metadata: Record<string, unknown> | null;
  createdAt: string;
  decidedAt: string;
  reviewedAt: string | null;
  reviewerUserId: string | null;
  reviewNote: string | null;
}

interface SubmitModerationInput {
  contentRef: string;
  contentType: "chat_message" | "avatar_image" | string;
  actorUserId?: string;
  surface: string;
  content?: string;
  metadata?: Record<string, unknown>;
  evidenceRefs?: string[];
  strictMode?: boolean;
  traceId?: string;
  idempotencyKey?: string;
}

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

  async submitForModeration(
    input: SubmitModerationInput,
  ): Promise<ModerationDecisionRecord> {
    const idempotencyKey =
      input.idempotencyKey?.trim() ||
      `${input.contentType}:${input.contentRef}:${input.surface}`;
    const existing = await this.findDecisionByIdempotencyKey(idempotencyKey);
    if (existing) {
      return existing;
    }

    const strictMode = Boolean(input.strictMode);
    let deterministicDecision: ModerationRiskDecision = "clean";
    let reasons: string[] = [];

    if (input.contentType === "avatar_image") {
      const avatarAssessment = this.assessAvatarRisk(input.metadata);
      deterministicDecision = avatarAssessment.decision;
      reasons = avatarAssessment.reasons;
    } else {
      const textAssessment = this.assessContentRisk({
        content: input.content ?? "",
        context: input.surface,
        surface: input.surface,
      });
      deterministicDecision = textAssessment.decision;
      reasons = textAssessment.reasons;
    }

    let finalDecision = deterministicDecision;
    let decisionSource: ModerationDecisionSource = "rules";

    if (this.shouldUseOpenAIModeration()) {
      try {
        const contentForAssist =
          input.contentType === "avatar_image"
            ? this.buildAvatarModerationPrompt(input)
            : (input.content ?? "");
        const assisted = await this.openAIClient.assistModeration(
          {
            content: contentForAssist,
            context: input.surface,
          },
          input.traceId?.trim() || randomUUID(),
        );
        finalDecision = this.pickMoreRestrictiveRiskDecision(
          deterministicDecision,
          assisted.decision,
        );
        if (assisted.decision !== "clean") {
          reasons.push(`openai_decision:${assisted.decision}`);
        }
        const normalizedReason = this.normalizeReasonToken(assisted.reason);
        if (normalizedReason) {
          reasons.push(`openai_reason:${normalizedReason}`);
        }
        decisionSource = "openai";
      } catch (error) {
        this.logger.warn(
          `openai moderation assist failed; deterministic fallback used: ${String(error)}`,
        );
        if (strictMode && finalDecision === "clean") {
          finalDecision = "review";
          reasons.push("strict_fallback_review");
        }
      }
    } else if (strictMode && finalDecision === "clean" && !input.content) {
      finalDecision = "review";
      reasons.push("strict_ambiguous_review");
    }

    const nowIso = new Date().toISOString();
    const decisionRecord: ModerationDecisionRecord = {
      id: randomUUID(),
      idempotencyKey,
      contentRef: input.contentRef,
      contentType: input.contentType,
      actorUserId: input.actorUserId ?? null,
      surface: input.surface,
      riskLevel: this.toUnifiedRiskLevel(finalDecision),
      decisionSource,
      policyVersion: MODERATION_POLICY_VERSION,
      reasons:
        reasons.length > 0 ? Array.from(new Set(reasons)) : ["no_risk_signal"],
      evidenceRefs: Array.from(new Set(input.evidenceRefs ?? [])),
      metadata: input.metadata ?? null,
      createdAt: nowIso,
      decidedAt: nowIso,
      reviewedAt: null,
      reviewerUserId: null,
      reviewNote: null,
    };

    await this.saveModerationDecision(decisionRecord);
    await this.writeDecisionArtifacts(decisionRecord);
    recordModerationDecisionMetric({
      riskLevel: decisionRecord.riskLevel,
      source: decisionRecord.decisionSource,
    });
    return decisionRecord;
  }

  async getDecision(contentRef: string) {
    if (!this.prisma.userPreference?.findMany) {
      return null;
    }
    const rows = await this.prisma.userPreference.findMany({
      where: {
        userId: MODERATION_SYSTEM_USER_ID,
        key: {
          startsWith: `${MODERATION_DECISION_KEY_PREFIX}:`,
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 200,
      select: {
        value: true,
      },
    });

    for (const row of rows) {
      const parsed = this.parseModerationDecisionRecord(row.value);
      if (parsed && parsed.contentRef === contentRef) {
        return parsed;
      }
    }
    return null;
  }

  async submitHumanReview(input: {
    decisionId: string;
    action: "approve" | "reject" | "escalate";
    reviewerUserId: string;
    note?: string;
  }) {
    const existing = await this.findDecisionById(input.decisionId);
    if (!existing) {
      return null;
    }

    const resolvedRiskLevel: UnifiedRiskLevel =
      input.action === "approve"
        ? "allow"
        : input.action === "reject"
          ? "block"
          : "review";

    const updated: ModerationDecisionRecord = {
      ...existing,
      riskLevel: resolvedRiskLevel,
      decisionSource: "human",
      reviewedAt: new Date().toISOString(),
      reviewerUserId: input.reviewerUserId,
      reviewNote: input.note?.trim() ?? null,
      reasons: Array.from(
        new Set([...existing.reasons, `human_action:${input.action}`]),
      ),
    };

    await this.saveModerationDecision(updated);
    await this.writeDecisionArtifacts(updated);
    recordModerationDecisionMetric({
      riskLevel: updated.riskLevel,
      source: updated.decisionSource,
    });
    return updated;
  }

  async cleanupExpiredDecisions(input?: { retentionDays?: number }) {
    if (!this.prisma.userPreference?.deleteMany) {
      return {
        deletedCount: 0,
        retentionDays: this.resolveModerationDecisionRetentionDays(
          input?.retentionDays,
        ),
      };
    }
    const retentionDays = this.resolveModerationDecisionRetentionDays(
      input?.retentionDays,
    );
    const cutoff = new Date(Date.now() - retentionDays * 86_400_000);
    const result = await this.prisma.userPreference.deleteMany({
      where: {
        userId: MODERATION_SYSTEM_USER_ID,
        key: {
          startsWith: `${MODERATION_DECISION_KEY_PREFIX}:`,
        },
        createdAt: {
          lt: cutoff,
        },
      },
    });

    if (this.prisma.auditLog?.create) {
      await this.prisma.auditLog.create({
        data: {
          actorUserId: null,
          actorType: "system",
          action: "moderation.decisions_retention_cleanup",
          entityType: "moderation_decision",
          metadata: {
            retentionDays,
            cutoff: cutoff.toISOString(),
            deletedCount: result.count,
          } as Prisma.InputJsonValue,
        },
      });
    }

    return {
      deletedCount: result.count,
      retentionDays,
      cutoff: cutoff.toISOString(),
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

  private assessAvatarRisk(metadata?: Record<string, unknown>) {
    const reasons: string[] = [];
    const mimeType = this.readString(metadata?.mimeType);
    const magicMimeType = this.readString(metadata?.magicMimeType);
    const byteSize = this.readFiniteNumber(metadata?.byteSize);
    const allowedMimeTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

    if (!mimeType || !allowedMimeTypes.has(mimeType.toLowerCase())) {
      reasons.push("unsupported_mime_type");
      return { decision: "blocked" as ModerationRiskDecision, reasons };
    }

    if (magicMimeType === "unknown") {
      reasons.push("unknown_binary_signature");
      return { decision: "blocked" as ModerationRiskDecision, reasons };
    }
    if (
      magicMimeType &&
      magicMimeType !== "unknown" &&
      magicMimeType.toLowerCase() !== mimeType.toLowerCase()
    ) {
      reasons.push("mime_magic_mismatch");
      return { decision: "blocked" as ModerationRiskDecision, reasons };
    }

    if (typeof byteSize === "number") {
      if (byteSize <= 0) {
        reasons.push("invalid_byte_size");
        return { decision: "blocked" as ModerationRiskDecision, reasons };
      }
      if (byteSize > 10 * 1024 * 1024) {
        reasons.push("avatar_too_large");
        return { decision: "blocked" as ModerationRiskDecision, reasons };
      }
    } else {
      reasons.push("missing_byte_size");
      return { decision: "review" as ModerationRiskDecision, reasons };
    }

    reasons.push("avatar_metadata_ok");
    return { decision: "clean" as ModerationRiskDecision, reasons };
  }

  private buildAvatarModerationPrompt(input: SubmitModerationInput) {
    const mimeType = this.readString(input.metadata?.mimeType) ?? "unknown";
    const byteSize = this.readFiniteNumber(input.metadata?.byteSize) ?? -1;
    const storageKey = this.readString(input.metadata?.storageKey) ?? "unknown";
    const magicMimeType =
      this.readString(input.metadata?.magicMimeType) ?? "unknown";
    const byteSampleSha256 =
      this.readString(input.metadata?.byteSampleSha256) ?? "none";
    const byteSampleLength =
      this.readFiniteNumber(input.metadata?.byteSampleLength) ?? -1;
    return [
      "Avatar image moderation request.",
      `surface=${input.surface}`,
      `contentRef=${input.contentRef}`,
      `mimeType=${mimeType}`,
      `magicMimeType=${magicMimeType}`,
      `byteSize=${byteSize}`,
      `byteSampleLength=${byteSampleLength}`,
      `byteSampleSha256=${byteSampleSha256}`,
      `storageKey=${storageKey}`,
    ].join(" ");
  }

  private async writeDecisionArtifacts(decision: ModerationDecisionRecord) {
    if (decision.riskLevel !== "allow" && this.prisma.moderationFlag?.create) {
      await this.prisma.moderationFlag.create({
        data: {
          entityType: decision.contentType,
          entityId: decision.contentRef,
          reason: `decision:${decision.riskLevel}:${decision.reasons.join(",")}`,
          status: "open",
        },
      });
    }

    if (this.prisma.auditLog?.create) {
      await this.prisma.auditLog.create({
        data: {
          actorUserId: decision.actorUserId,
          actorType: decision.decisionSource === "human" ? "admin" : "system",
          action: "moderation.decision_recorded",
          entityType: decision.contentType,
          entityId: decision.contentRef,
          metadata: {
            riskLevel: decision.riskLevel,
            decisionSource: decision.decisionSource,
            policyVersion: decision.policyVersion,
            reasons: decision.reasons,
            evidenceRefs: decision.evidenceRefs,
            idempotencyKey: decision.idempotencyKey,
          } as Prisma.InputJsonValue,
        },
      });
    }
  }

  private async saveModerationDecision(decision: ModerationDecisionRecord) {
    if (!this.prisma.userPreference?.create) {
      return;
    }
    await this.prisma.userPreference.create({
      data: {
        userId: MODERATION_SYSTEM_USER_ID,
        key: `${MODERATION_DECISION_KEY_PREFIX}:${decision.idempotencyKey}`,
        value: decision as unknown as Prisma.InputJsonValue,
      },
    });
  }

  private async findDecisionByIdempotencyKey(idempotencyKey: string) {
    if (!this.prisma.userPreference?.findFirst) {
      return null;
    }
    const existing = await this.prisma.userPreference.findFirst({
      where: {
        userId: MODERATION_SYSTEM_USER_ID,
        key: `${MODERATION_DECISION_KEY_PREFIX}:${idempotencyKey}`,
      },
      orderBy: {
        createdAt: "desc",
      },
      select: {
        value: true,
      },
    });
    return this.parseModerationDecisionRecord(existing?.value ?? null);
  }

  private async findDecisionById(decisionId: string) {
    if (!this.prisma.userPreference?.findMany) {
      return null;
    }
    const rows = await this.prisma.userPreference.findMany({
      where: {
        userId: MODERATION_SYSTEM_USER_ID,
        key: {
          startsWith: `${MODERATION_DECISION_KEY_PREFIX}:`,
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 200,
      select: {
        value: true,
      },
    });
    for (const row of rows) {
      const parsed = this.parseModerationDecisionRecord(row.value);
      if (parsed && parsed.id === decisionId) {
        return parsed;
      }
    }
    return null;
  }

  private parseModerationDecisionRecord(value: Prisma.JsonValue | null) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return null;
    }
    const raw = value as Record<string, unknown>;
    const id = this.readString(raw.id);
    const idempotencyKey = this.readString(raw.idempotencyKey);
    const contentRef = this.readString(raw.contentRef);
    const contentType = this.readString(raw.contentType);
    const surface = this.readString(raw.surface);
    const riskLevel = this.readString(raw.riskLevel);
    const decisionSource = this.readString(raw.decisionSource);
    if (
      !id ||
      !idempotencyKey ||
      !contentRef ||
      !contentType ||
      !surface ||
      !riskLevel ||
      !decisionSource
    ) {
      return null;
    }
    if (!["allow", "review", "block"].includes(riskLevel)) {
      return null;
    }
    if (!["rules", "openai", "human"].includes(decisionSource)) {
      return null;
    }
    return raw as unknown as ModerationDecisionRecord;
  }

  private toUnifiedRiskLevel(
    decision: ModerationRiskDecision,
  ): UnifiedRiskLevel {
    if (decision === "blocked") {
      return "block";
    }
    if (decision === "review") {
      return "review";
    }
    return "allow";
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

  private readString(value: unknown) {
    if (typeof value !== "string") {
      return null;
    }
    const normalized = value.trim();
    return normalized.length > 0 ? normalized : null;
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

    const parsedState = this.parseStrikeState(existing?.value ?? null);
    return {
      preferenceId: existing?.id ?? null,
      state: this.applyStrikeDecayWindow(parsedState),
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

  private applyStrikeDecayWindow(state: StrikeState): StrikeState {
    const windowDays = this.resolveStrikeDecayWindowDays();
    if (windowDays <= 0) {
      return state;
    }
    const cutoff = Date.now() - windowDays * 86_400_000;
    const knownHistoryCount = state.history.reduce(
      (sum, entry) => sum + Math.max(1, Math.floor(entry.severity)),
      0,
    );
    const carryForwardCount = Math.max(0, state.count - knownHistoryCount);
    const filteredHistory = state.history.filter((entry) => {
      const issuedAtMs = new Date(entry.issuedAt).getTime();
      return Number.isFinite(issuedAtMs) && issuedAtMs >= cutoff;
    });
    const filteredKnownCount = filteredHistory.reduce(
      (sum, entry) => sum + Math.max(1, Math.floor(entry.severity)),
      0,
    );
    const decayedCount = carryForwardCount + filteredKnownCount;
    return {
      ...state,
      count: decayedCount,
      history: filteredHistory,
      updatedAt: new Date().toISOString(),
    };
  }

  private resolveStrikeDecayWindowDays() {
    const raw = Number.parseInt(
      process.env.MODERATION_STRIKE_DECAY_WINDOW_DAYS ?? "30",
      10,
    );
    if (!Number.isFinite(raw)) {
      return 30;
    }
    return Math.max(0, raw);
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

  private resolveModerationDecisionRetentionDays(value?: number) {
    if (typeof value === "number" && Number.isFinite(value) && value >= 1) {
      return Math.floor(value);
    }
    const fromEnv = Number.parseInt(
      process.env.MODERATION_DECISION_RETENTION_DAYS ?? "",
      10,
    );
    if (Number.isFinite(fromEnv) && fromEnv >= 1) {
      return fromEnv;
    }
    return DEFAULT_MODERATION_DECISION_RETENTION_DAYS;
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
