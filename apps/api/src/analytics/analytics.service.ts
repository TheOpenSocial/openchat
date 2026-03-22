import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { createHash } from "node:crypto";
import { PrismaService } from "../database/prisma.service.js";

const ANALYTICS_ACTION = "analytics.event";

interface TrackEventInput {
  eventType: string;
  actorUserId?: string;
  entityType?: string;
  entityId?: string;
  properties?: Record<string, unknown>;
  occurredAt?: string;
}

interface ExperimentDefinition {
  key: string;
  description: string;
  variants: string[];
  rolloutPercent: number;
}

const EXPERIMENT_ASSIGNMENT_PREFIX = "experiment.assignment.";

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async trackEvent(input: TrackEventInput) {
    if (!this.prisma.auditLog?.create) {
      return {
        recorded: false,
        eventType: input.eventType,
      };
    }

    const event = await this.prisma.auditLog.create({
      data: {
        actorUserId: input.actorUserId ?? null,
        actorType: input.actorUserId ? "user" : "system",
        action: ANALYTICS_ACTION,
        entityType: input.entityType ?? "analytics_event",
        entityId: input.entityId ?? null,
        metadata: this.toJsonValue({
          eventType: input.eventType,
          occurredAt: input.occurredAt ?? new Date().toISOString(),
          properties: input.properties ?? {},
        }),
      },
      select: {
        id: true,
      },
    });

    return {
      recorded: true,
      eventId: event.id,
      eventType: input.eventType,
    };
  }

  async listEvents(input: {
    limit?: number;
    eventType?: string;
    actorUserId?: string;
  }) {
    const limit = this.normalizeLimit(input.limit, 100, 500);
    if (!this.prisma.auditLog?.findMany) {
      return [];
    }

    const rows = await this.prisma.auditLog.findMany({
      where: {
        action: ANALYTICS_ACTION,
        ...(input.actorUserId ? { actorUserId: input.actorUserId } : {}),
      },
      orderBy: {
        createdAt: "desc",
      },
      take: Math.min(limit * 3, 500),
    });

    const events = rows
      .map((row) => {
        const metadata = this.readJsonObject(row.metadata);
        const eventType = this.readString(metadata["eventType"]) ?? "unknown";
        return {
          id: row.id,
          eventType,
          actorUserId: row.actorUserId,
          entityType: row.entityType,
          entityId: row.entityId,
          occurredAt:
            this.readString(metadata["occurredAt"]) ??
            row.createdAt.toISOString(),
          recordedAt: row.createdAt.toISOString(),
          properties: this.readJsonObject(metadata["properties"]),
        };
      })
      .filter((event) =>
        input.eventType ? event.eventType === input.eventType : true,
      );

    return events.slice(0, limit);
  }

  async getCoreMetrics(input: { days?: number } = {}) {
    const days = this.normalizeLimit(input.days, 30, 365);
    const windowStart = new Date(Date.now() - days * 24 * 60 * 60_000);

    const [
      intentTiming,
      connectionMetrics,
      groupMetrics,
      notificationMetrics,
      repeatConnectionMetrics,
      moderationMetrics,
    ] = await Promise.all([
      this.computeIntentTimingMetrics(windowStart),
      this.computeConnectionSuccessRate(windowStart),
      this.computeGroupFormationCompletionRate(windowStart),
      this.computeNotificationOpenRate(windowStart),
      this.computeRepeatConnectionRate(windowStart),
      this.computeModerationIncidentRate(windowStart),
    ]);

    return {
      window: {
        days,
        start: windowStart.toISOString(),
        end: new Date().toISOString(),
      },
      metrics: {
        intentToFirstAcceptance: intentTiming.intentToFirstAcceptance,
        intentToFirstMessage: intentTiming.intentToFirstMessage,
        connectionSuccessRate: connectionMetrics,
        groupFormationCompletionRate: groupMetrics,
        notificationToOpenRate: notificationMetrics,
        repeatConnectionRate: repeatConnectionMetrics,
        moderationIncidentRate: moderationMetrics,
      },
    };
  }

  async getExperimentGuardrails() {
    const core = await this.getCoreMetrics({ days: 14 });
    const moderationRatePer100 =
      core.metrics.moderationIncidentRate.ratePer100Users ?? null;
    const notificationOpenRate = core.metrics.notificationToOpenRate.rate;
    const connectionSuccessRate = core.metrics.connectionSuccessRate.rate;

    const thresholds = {
      moderationRatePer100UsersMax: 8,
      notificationOpenRateMin: 0.05,
      connectionSuccessRateMin: 0.2,
    };

    const checks = {
      moderationRateWithinThreshold:
        moderationRatePer100 == null
          ? true
          : moderationRatePer100 <= thresholds.moderationRatePer100UsersMax,
      notificationOpenRateHealthy:
        notificationOpenRate == null
          ? true
          : notificationOpenRate >= thresholds.notificationOpenRateMin,
      connectionSuccessHealthy:
        connectionSuccessRate == null
          ? true
          : connectionSuccessRate >= thresholds.connectionSuccessRateMin,
    };

    return {
      onTrack:
        checks.moderationRateWithinThreshold &&
        checks.notificationOpenRateHealthy &&
        checks.connectionSuccessHealthy,
      thresholds,
      checks,
      observed: {
        moderationRatePer100Users: moderationRatePer100,
        notificationOpenRate,
        connectionSuccessRate,
      },
      generatedAt: new Date().toISOString(),
    };
  }

  async getExperimentAssignments(userId: string) {
    const guardrails = await this.getExperimentGuardrails();
    const experiments = this.loadExperimentDefinitions();
    const assignments = [];

    for (const experiment of experiments) {
      const bucket = this.hashBucket(`${experiment.key}:${userId}`);
      const inRollout = bucket < experiment.rolloutPercent;
      const enabled = guardrails.onTrack && inRollout;
      const variant = enabled
        ? experiment.variants[bucket % experiment.variants.length]
        : "control";
      const assignment = {
        experiment: experiment.key,
        description: experiment.description,
        rolloutPercent: experiment.rolloutPercent,
        bucket,
        inRollout,
        enabled,
        variant,
        guardrailOnTrack: guardrails.onTrack,
        assignedAt: new Date().toISOString(),
      };

      await Promise.all([
        this.saveExperimentAssignment(userId, experiment.key, assignment),
        this.trackEvent({
          eventType: "experiment_assignment",
          actorUserId: userId,
          entityType: "experiment",
          properties: assignment,
        }),
      ]);
      assignments.push(assignment);
    }

    return {
      userId,
      guardrails,
      assignments,
      generatedAt: new Date().toISOString(),
    };
  }

  async getAgentOutcomeMetrics(
    input: {
      days?: number;
      followupEngagementHours?: number;
    } = {},
  ) {
    const days = this.normalizeLimit(input.days, 30, 365);
    const followupEngagementHours = this.normalizeLimit(
      input.followupEngagementHours,
      24,
      168,
    );
    const windowStart = new Date(Date.now() - days * 24 * 60 * 60_000);

    if (!this.prisma.auditLog?.findMany) {
      return {
        window: {
          days,
          start: windowStart.toISOString(),
          end: new Date().toISOString(),
          followupEngagementHours,
        },
        summary: {
          totalActions: 0,
          executedActions: 0,
          deniedActions: 0,
          failedActions: 0,
        },
        toolAttempts: [],
        introRequestAcceptance: {
          attempted: 0,
          accepted: 0,
          pending: 0,
          rejected: 0,
          cancelled: 0,
          expired: 0,
          settled: 0,
          acceptanceRate: null,
          settledRate: null,
        },
        circleJoinConversion: {
          attempted: 0,
          executed: 0,
          converted: 0,
          failed: 0,
          conversionRate: null,
        },
        followupUsefulness: {
          scheduled: 0,
          completedRuns: 0,
          skippedRuns: 0,
          failedRuns: 0,
          engagedRuns: 0,
          completionRate: null,
          usefulnessRate: null,
          engagementWindowHours: followupEngagementHours,
        },
      };
    }

    const analyticsRows = await this.prisma.auditLog.findMany({
      where: {
        action: ANALYTICS_ACTION,
        createdAt: {
          gte: windowStart,
        },
      },
      orderBy: {
        createdAt: "asc",
      },
      take: 5000,
    });

    const socialActions = analyticsRows
      .map((row) => this.toAnalyticsEvent(row))
      .filter((event) => event.eventType === "agent_social_action");

    const toolCounts = new Map<
      string,
      { attempted: number; executed: number; denied: number; failed: number }
    >();

    for (const event of socialActions) {
      const tool = this.readString(event.properties.tool) ?? "unknown";
      const status = this.readString(event.properties.status) ?? "unknown";
      const counts = toolCounts.get(tool) ?? {
        attempted: 0,
        executed: 0,
        denied: 0,
        failed: 0,
      };
      counts.attempted += 1;
      if (status === "executed") {
        counts.executed += 1;
      } else if (status === "denied") {
        counts.denied += 1;
      } else if (status === "failed") {
        counts.failed += 1;
      }
      toolCounts.set(tool, counts);
    }

    const introMetrics =
      await this.computeAgentIntroAcceptanceMetrics(socialActions);
    const circleMetrics = this.computeAgentCircleJoinMetrics(socialActions);
    const followupMetrics = await this.computeAgentFollowupUsefulness(
      socialActions,
      analyticsRows,
      followupEngagementHours,
    );

    return {
      window: {
        days,
        start: windowStart.toISOString(),
        end: new Date().toISOString(),
        followupEngagementHours,
      },
      summary: {
        totalActions: socialActions.length,
        executedActions: socialActions.filter(
          (event) => event.properties.status === "executed",
        ).length,
        deniedActions: socialActions.filter(
          (event) => event.properties.status === "denied",
        ).length,
        failedActions: socialActions.filter(
          (event) => event.properties.status === "failed",
        ).length,
      },
      toolAttempts: Array.from(toolCounts.entries())
        .map(([tool, counts]) => ({
          tool,
          ...counts,
        }))
        .sort((left, right) => left.tool.localeCompare(right.tool)),
      introRequestAcceptance: introMetrics,
      circleJoinConversion: circleMetrics,
      followupUsefulness: followupMetrics,
    };
  }

  private async computeIntentTimingMetrics(windowStart: Date) {
    if (!this.prisma.intent?.findMany) {
      return {
        intentToFirstAcceptance: {
          rate: null,
          sampleSize: 0,
        },
        intentToFirstMessage: {
          rate: null,
          sampleSize: 0,
        },
      };
    }

    const intents = await this.prisma.intent.findMany({
      where: {
        createdAt: {
          gte: windowStart,
        },
      },
      select: {
        id: true,
        createdAt: true,
      },
      take: 2000,
      orderBy: {
        createdAt: "desc",
      },
    });
    if (intents.length === 0) {
      return {
        intentToFirstAcceptance: {
          rate: null,
          sampleSize: 0,
        },
        intentToFirstMessage: {
          rate: null,
          sampleSize: 0,
        },
      };
    }

    const intentIds = intents.map((intent) => intent.id);
    const intentCreatedAtById = new Map(
      intents.map((intent) => [intent.id, intent.createdAt]),
    );

    const acceptedRows = this.prisma.intentRequest?.findMany
      ? await this.prisma.intentRequest.findMany({
          where: {
            intentId: {
              in: intentIds,
            },
            status: "accepted",
            respondedAt: {
              not: null,
            },
          },
          select: {
            intentId: true,
            respondedAt: true,
          },
          orderBy: {
            respondedAt: "asc",
          },
          take: 5000,
        })
      : [];
    const firstAcceptanceByIntentId = new Map<string, Date>();
    for (const row of acceptedRows) {
      if (!row.respondedAt || firstAcceptanceByIntentId.has(row.intentId)) {
        continue;
      }
      firstAcceptanceByIntentId.set(row.intentId, row.respondedAt);
    }

    const acceptanceDurations = Array.from(firstAcceptanceByIntentId.entries())
      .map(([intentId, firstAcceptedAt]) => {
        const createdAt = intentCreatedAtById.get(intentId);
        if (!createdAt) {
          return null;
        }
        return (firstAcceptedAt.getTime() - createdAt.getTime()) / 60_000;
      })
      .filter((value): value is number => typeof value === "number")
      .filter((value) => value >= 0);

    const firstMessageRows = this.prisma.chatMessage?.findMany
      ? await this.prisma.chatMessage.findMany({
          where: {
            chat: {
              connection: {
                originIntentId: {
                  in: intentIds,
                },
              },
            },
          },
          select: {
            createdAt: true,
            chat: {
              select: {
                connection: {
                  select: {
                    originIntentId: true,
                  },
                },
              },
            },
          },
          orderBy: {
            createdAt: "asc",
          },
          take: 6000,
        })
      : [];
    const firstMessageByIntentId = new Map<string, Date>();
    for (const row of firstMessageRows) {
      const intentId = row.chat.connection.originIntentId;
      if (!intentId || firstMessageByIntentId.has(intentId)) {
        continue;
      }
      firstMessageByIntentId.set(intentId, row.createdAt);
    }

    const firstMessageDurations = Array.from(firstMessageByIntentId.entries())
      .map(([intentId, firstMessageAt]) => {
        const createdAt = intentCreatedAtById.get(intentId);
        if (!createdAt) {
          return null;
        }
        return (firstMessageAt.getTime() - createdAt.getTime()) / 60_000;
      })
      .filter((value): value is number => typeof value === "number")
      .filter((value) => value >= 0);

    return {
      intentToFirstAcceptance: {
        rate: this.average(acceptanceDurations),
        sampleSize: acceptanceDurations.length,
      },
      intentToFirstMessage: {
        rate: this.average(firstMessageDurations),
        sampleSize: firstMessageDurations.length,
      },
    };
  }

  private async computeConnectionSuccessRate(windowStart: Date) {
    const [acceptedRequestCount, createdConnectionCount] = await Promise.all([
      this.prisma.intentRequest.count({
        where: {
          status: "accepted",
          respondedAt: {
            gte: windowStart,
          },
        },
      }),
      this.prisma.connection.count({
        where: {
          createdAt: {
            gte: windowStart,
          },
        },
      }),
    ]);

    return {
      rate:
        acceptedRequestCount === 0
          ? null
          : this.round(
              Math.min(1, createdConnectionCount / acceptedRequestCount),
              4,
            ),
      numerator: createdConnectionCount,
      denominator: acceptedRequestCount,
    };
  }

  private async computeGroupFormationCompletionRate(windowStart: Date) {
    if (
      !this.prisma.connectionParticipant?.findMany ||
      !this.prisma.connection?.findMany
    ) {
      return {
        rate: null,
        completedGroups: 0,
        totalGroups: 0,
      };
    }

    const groups = await this.prisma.connection.findMany({
      where: {
        type: "group",
        createdAt: {
          gte: windowStart,
        },
      },
      select: {
        id: true,
        originIntentId: true,
        participants: {
          where: {
            leftAt: null,
          },
          select: {
            userId: true,
          },
        },
      },
      take: 1000,
    });
    if (groups.length === 0) {
      return {
        rate: null,
        completedGroups: 0,
        totalGroups: 0,
      };
    }

    const originIntentIds = groups
      .map((group) => group.originIntentId)
      .filter((value): value is string => Boolean(value));
    const targetByIntentId = new Map<string, number>();
    if (originIntentIds.length > 0 && this.prisma.intent?.findMany) {
      const intents = await this.prisma.intent.findMany({
        where: {
          id: {
            in: originIntentIds,
          },
        },
        select: {
          id: true,
          parsedIntent: true,
        },
      });
      for (const intent of intents) {
        const parsed =
          (intent.parsedIntent as { groupSizeTarget?: unknown } | null) ?? {};
        const value = parsed.groupSizeTarget;
        const target =
          typeof value === "number" && Number.isFinite(value)
            ? Math.min(Math.max(Math.floor(value), 2), 4)
            : 3;
        targetByIntentId.set(intent.id, target);
      }
    }

    let completedGroups = 0;
    for (const group of groups) {
      const defaultTarget = 3;
      const target = group.originIntentId
        ? (targetByIntentId.get(group.originIntentId) ?? defaultTarget)
        : defaultTarget;
      if (group.participants.length >= target) {
        completedGroups += 1;
      }
    }

    return {
      rate: this.round(completedGroups / groups.length, 4),
      completedGroups,
      totalGroups: groups.length,
    };
  }

  private async computeNotificationOpenRate(windowStart: Date) {
    const [totalCount, openedCount] = await Promise.all([
      this.prisma.notification.count({
        where: {
          createdAt: {
            gte: windowStart,
          },
        },
      }),
      this.prisma.notification.count({
        where: {
          createdAt: {
            gte: windowStart,
          },
          isRead: true,
        },
      }),
    ]);

    return {
      rate: totalCount === 0 ? null : this.round(openedCount / totalCount, 4),
      openedCount,
      totalCount,
    };
  }

  private async computeRepeatConnectionRate(windowStart: Date) {
    if (!this.prisma.connectionParticipant?.findMany) {
      return {
        rate: null,
        repeatUsers: 0,
        engagedUsers: 0,
      };
    }

    const participants = await this.prisma.connectionParticipant.findMany({
      where: {
        connection: {
          createdAt: {
            gte: windowStart,
          },
        },
      },
      select: {
        userId: true,
        connectionId: true,
      },
      take: 5000,
    });

    const uniqueConnectionsByUser = new Map<string, Set<string>>();
    for (const row of participants) {
      const existing = uniqueConnectionsByUser.get(row.userId) ?? new Set();
      existing.add(row.connectionId);
      uniqueConnectionsByUser.set(row.userId, existing);
    }

    const engagedUsers = uniqueConnectionsByUser.size;
    const repeatUsers = Array.from(uniqueConnectionsByUser.values()).filter(
      (connections) => connections.size >= 2,
    ).length;

    return {
      rate:
        engagedUsers === 0 ? null : this.round(repeatUsers / engagedUsers, 4),
      repeatUsers,
      engagedUsers,
    };
  }

  private async computeModerationIncidentRate(windowStart: Date) {
    const [reportCount, moderationFlagCount, activeUserCount] =
      await Promise.all([
        this.prisma.userReport.count({
          where: {
            createdAt: {
              gte: windowStart,
            },
          },
        }),
        this.prisma.moderationFlag?.count
          ? this.prisma.moderationFlag.count({
              where: {
                createdAt: {
                  gte: windowStart,
                },
              },
            })
          : Promise.resolve(0),
        this.prisma.user.count({
          where: {
            status: "active",
          },
        }),
      ]);

    const incidentCount = reportCount + moderationFlagCount;
    const rate =
      activeUserCount === 0
        ? null
        : this.round(incidentCount / activeUserCount, 4);
    const ratePer100Users =
      activeUserCount === 0
        ? null
        : this.round((incidentCount / activeUserCount) * 100, 4);

    return {
      rate,
      ratePer100Users,
      incidentCount,
      activeUserCount,
    };
  }

  private loadExperimentDefinitions(): ExperimentDefinition[] {
    return [
      {
        key: "ranking_v1",
        description: "Ranking experiment hook for retrieval/rerank tuning.",
        variants: ["control", "semantic_lifegraph_boost"],
        rolloutPercent: this.readRolloutPercent(
          process.env.EXPERIMENT_RANKING_ROLLOUT_PERCENT,
          20,
        ),
      },
      {
        key: "copy_v1",
        description: "Copy experiment hook for recommendation text variants.",
        variants: ["control", "concise_copy"],
        rolloutPercent: this.readRolloutPercent(
          process.env.EXPERIMENT_COPY_ROLLOUT_PERCENT,
          20,
        ),
      },
      {
        key: "notification_timing_v1",
        description:
          "Notification timing experiment hook for follow-up pacing.",
        variants: ["control", "staggered_90m"],
        rolloutPercent: this.readRolloutPercent(
          process.env.EXPERIMENT_NOTIFICATION_TIMING_ROLLOUT_PERCENT,
          20,
        ),
      },
    ];
  }

  private async saveExperimentAssignment(
    userId: string,
    experimentKey: string,
    assignment: Record<string, unknown>,
  ) {
    const key = `${EXPERIMENT_ASSIGNMENT_PREFIX}${experimentKey}`;
    if (
      !this.prisma.userPreference?.findFirst ||
      !this.prisma.userPreference?.create
    ) {
      return;
    }
    const existing = await this.prisma.userPreference.findFirst({
      where: {
        userId,
        key,
      },
      select: {
        id: true,
      },
    });
    if (existing && this.prisma.userPreference?.update) {
      await this.prisma.userPreference.update({
        where: {
          id: existing.id,
        },
        data: {
          value: this.toJsonValue(assignment),
        },
      });
      return;
    }

    await this.prisma.userPreference.create({
      data: {
        userId,
        key,
        value: this.toJsonValue(assignment),
      },
    });
  }

  private hashBucket(input: string) {
    return createHash("sha256").update(input).digest().readUInt32BE(0) % 100;
  }

  private average(values: number[]) {
    if (values.length === 0) {
      return null;
    }
    const sum = values.reduce((total, value) => total + value, 0);
    return this.round(sum / values.length, 3);
  }

  private round(value: number, precision: number) {
    const factor = 10 ** precision;
    return Math.round(value * factor) / factor;
  }

  private normalizeLimit(
    value: number | undefined,
    fallback: number,
    maximum: number,
  ) {
    if (!Number.isFinite(value)) {
      return fallback;
    }
    return Math.min(Math.max(Math.floor(value ?? fallback), 1), maximum);
  }

  private readRolloutPercent(rawValue: string | undefined, fallback: number) {
    const value = Number(rawValue ?? fallback);
    if (!Number.isFinite(value)) {
      return fallback;
    }
    return Math.min(Math.max(Math.floor(value), 0), 100);
  }

  private readJsonObject(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return {};
    }
    return value as Record<string, unknown>;
  }

  private readString(value: unknown): string | null {
    return typeof value === "string" ? value : null;
  }

  private readBoolean(value: unknown): boolean | null {
    return typeof value === "boolean" ? value : null;
  }

  private toAnalyticsEvent(row: {
    id: string;
    actorUserId: string | null;
    entityType: string;
    entityId: string | null;
    createdAt: Date;
    metadata: unknown;
  }) {
    const metadata = this.readJsonObject(row.metadata);
    return {
      id: row.id,
      actorUserId: row.actorUserId,
      entityType: row.entityType,
      entityId: row.entityId,
      createdAt: row.createdAt,
      eventType: this.readString(metadata["eventType"]) ?? "unknown",
      properties: this.readJsonObject(metadata["properties"]),
    };
  }

  private async computeAgentIntroAcceptanceMetrics(
    socialActions: Array<{
      actorUserId: string | null;
      properties: Record<string, unknown>;
    }>,
  ) {
    const introSendEvents = socialActions.filter(
      (event) => event.properties.tool === "intro.send_request",
    );
    const requestIds = introSendEvents
      .map((event) => this.readString(event.properties.requestId))
      .filter((value): value is string => Boolean(value));
    if (requestIds.length === 0 || !this.prisma.intentRequest?.findMany) {
      return {
        attempted: introSendEvents.length,
        accepted: 0,
        pending: 0,
        rejected: 0,
        cancelled: 0,
        expired: 0,
        settled: 0,
        acceptanceRate: introSendEvents.length === 0 ? null : 0,
        settledRate: introSendEvents.length === 0 ? null : 0,
      };
    }

    const requests = await this.prisma.intentRequest.findMany({
      where: {
        id: {
          in: requestIds,
        },
      },
      select: {
        id: true,
        status: true,
      },
    });

    let accepted = 0;
    let pending = 0;
    let rejected = 0;
    let cancelled = 0;
    let expired = 0;
    for (const request of requests) {
      if (request.status === "accepted") {
        accepted += 1;
      } else if (request.status === "pending") {
        pending += 1;
      } else if (request.status === "rejected") {
        rejected += 1;
      } else if (request.status === "cancelled") {
        cancelled += 1;
      } else if (request.status === "expired") {
        expired += 1;
      }
    }

    const attempted = introSendEvents.length;
    const settled = accepted + rejected + cancelled + expired;
    return {
      attempted,
      accepted,
      pending,
      rejected,
      cancelled,
      expired,
      settled,
      acceptanceRate:
        attempted === 0 ? null : this.round(accepted / attempted, 4),
      settledRate: attempted === 0 ? null : this.round(settled / attempted, 4),
    };
  }

  private computeAgentCircleJoinMetrics(
    socialActions: Array<{
      properties: Record<string, unknown>;
    }>,
  ) {
    const joinEvents = socialActions.filter(
      (event) => event.properties.tool === "circle.join",
    );
    const attempted = joinEvents.length;
    const executed = joinEvents.filter(
      (event) => event.properties.status === "executed",
    ).length;
    const converted = joinEvents.filter(
      (event) =>
        event.properties.status === "executed" &&
        this.readBoolean(event.properties.joined) === true,
    ).length;
    const failed = joinEvents.filter(
      (event) => event.properties.status === "failed",
    ).length;

    return {
      attempted,
      executed,
      converted,
      failed,
      conversionRate:
        attempted === 0 ? null : this.round(converted / attempted, 4),
    };
  }

  private async computeAgentFollowupUsefulness(
    socialActions: Array<{
      actorUserId: string | null;
      properties: Record<string, unknown>;
    }>,
    analyticsRows: Array<{
      id: string;
      actorUserId: string | null;
      entityType: string;
      entityId: string | null;
      createdAt: Date;
      metadata: unknown;
    }>,
    followupEngagementHours: number,
  ) {
    const followupEvents = socialActions.filter(
      (event) => event.properties.tool === "followup.schedule",
    );
    const scheduled = followupEvents.length;
    const taskIds = followupEvents
      .map((event) => this.readString(event.properties.taskId))
      .filter((value): value is string => Boolean(value));

    if (taskIds.length === 0 || !this.prisma.scheduledTaskRun?.findMany) {
      return {
        scheduled,
        completedRuns: 0,
        skippedRuns: 0,
        failedRuns: 0,
        engagedRuns: 0,
        completionRate: scheduled === 0 ? null : 0,
        usefulnessRate: scheduled === 0 ? null : 0,
        engagementWindowHours: followupEngagementHours,
      };
    }

    const runs = await this.prisma.scheduledTaskRun.findMany({
      where: {
        scheduledTaskId: {
          in: taskIds,
        },
      },
      select: {
        id: true,
        scheduledTaskId: true,
        userId: true,
        status: true,
        triggeredAt: true,
        finishedAt: true,
      },
      orderBy: {
        triggeredAt: "asc",
      },
    });

    const engagementEvents = analyticsRows
      .map((row) => this.toAnalyticsEvent(row))
      .filter((event) =>
        [
          "intent_created",
          "request_sent",
          "first_message_sent",
          "message_replied",
          "connection_created",
        ].includes(event.eventType),
      );

    const engagementByUserId = new Map<
      string,
      Array<{ createdAt: Date; eventType: string }>
    >();
    for (const event of engagementEvents) {
      if (!event.actorUserId) {
        continue;
      }
      const existing = engagementByUserId.get(event.actorUserId) ?? [];
      existing.push({
        createdAt: event.createdAt,
        eventType: event.eventType,
      });
      engagementByUserId.set(event.actorUserId, existing);
    }

    const completedRuns = runs.filter((run) => run.status === "completed");
    const skippedRuns = runs.filter((run) => run.status === "skipped").length;
    const failedRuns = runs.filter((run) => run.status === "failed").length;
    const engagedRuns = completedRuns.filter((run) => {
      const userEvents = engagementByUserId.get(run.userId) ?? [];
      const engagementStart = run.finishedAt ?? run.triggeredAt;
      const engagementEnd = new Date(
        engagementStart.getTime() + followupEngagementHours * 60 * 60_000,
      );
      return userEvents.some(
        (event) =>
          event.createdAt >= engagementStart &&
          event.createdAt <= engagementEnd,
      );
    }).length;

    return {
      scheduled,
      completedRuns: completedRuns.length,
      skippedRuns,
      failedRuns,
      engagedRuns,
      completionRate:
        scheduled === 0
          ? null
          : this.round(completedRuns.length / scheduled, 4),
      usefulnessRate:
        completedRuns.length === 0
          ? null
          : this.round(engagedRuns / completedRuns.length, 4),
      engagementWindowHours: followupEngagementHours,
    };
  }

  private toJsonValue(input: Record<string, unknown>): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(input)) as Prisma.InputJsonValue;
  }
}
