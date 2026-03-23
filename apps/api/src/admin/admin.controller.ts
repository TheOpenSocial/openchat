import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  NotFoundException,
  Param,
  Post,
  Query,
} from "@nestjs/common";
import { getQueueToken } from "@nestjs/bullmq";
import { ModuleRef } from "@nestjs/core";
import { getOpenAIBudgetGuardrailSnapshot } from "@opensocial/openai";
import {
  adminAgentActionDebugQuerySchema,
  adminModerationFlagAssignBodySchema,
  adminModerationAgentRiskQuerySchema,
  adminModerationFlagTriageBodySchema,
  adminModerationQueueQuerySchema,
  adminRepairChatFlowBodySchema,
  adminResendNotificationBodySchema,
  adminUserActionBodySchema,
  uuidSchema,
} from "@opensocial/types";
import type { Queue } from "bullmq";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { ChatsService } from "../chats/chats.service.js";
import { AppCacheService } from "../common/app-cache.service.js";
import { ok } from "../common/api-response.js";
import { getOpsRuntimeMetricsSnapshot } from "../common/ops-metrics.js";
import { evaluateSecurityPosture } from "../common/security-posture.js";
import { parseRequestPayload } from "../common/validation.js";
import { AnalyticsService } from "../analytics/analytics.service.js";
import { DatabaseLatencyService } from "../database/database-latency.service.js";
import { PrismaService } from "../database/prisma.service.js";
import { IntentsService } from "../intents/intents.service.js";
import { DeadLetterService } from "../jobs/dead-letter.service.js";
import { OutboxRelayService } from "../jobs/outbox-relay.service.js";
import { JOB_QUEUE_NAMES } from "../jobs/jobs.module.js";
import { ModerationService } from "../moderation/moderation.service.js";
import { NotificationsService } from "../notifications/notifications.service.js";
import { PersonalizationService } from "../personalization/personalization.service.js";
import { PublicRoute } from "../auth/public-route.decorator.js";
import { AgenticEvalsService } from "./agentic-evals.service.js";
import { type AdminRole, AdminAuditService } from "./admin-audit.service.js";

@PublicRoute()
@Controller("admin")
export class AdminController {
  constructor(
    private readonly deadLetterService: DeadLetterService,
    private readonly outboxRelayService: OutboxRelayService,
    private readonly adminAuditService: AdminAuditService,
    private readonly appCacheService: AppCacheService,
    private readonly databaseLatencyService: DatabaseLatencyService,
    private readonly prisma: PrismaService,
    private readonly analyticsService: AnalyticsService,
    private readonly intentsService: IntentsService,
    private readonly moderationService: ModerationService,
    private readonly personalizationService: PersonalizationService,
    private readonly notificationsService: NotificationsService,
    private readonly chatsService: ChatsService,
    private readonly moduleRef: ModuleRef,
    private readonly agenticEvalsService: AgenticEvalsService,
  ) {}

  @Get("health")
  async health(
    @Headers("x-admin-user-id") adminUserIdHeader?: string,
    @Headers("x-admin-role") adminRoleHeader?: string,
  ) {
    const admin = this.parseAdminContext(adminUserIdHeader, adminRoleHeader, [
      "admin",
      "support",
      "moderator",
    ]);
    await this.adminAuditService.recordAction({
      adminUserId: admin.adminUserId,
      role: admin.role,
      action: "admin.health_check",
      entityType: "admin_api",
    });
    return ok({ status: "ok", service: "admin" });
  }

  @Get("ops/metrics")
  async opsMetrics(
    @Headers("x-admin-user-id") adminUserIdHeader?: string,
    @Headers("x-admin-role") adminRoleHeader?: string,
  ) {
    const admin = this.parseAdminContext(adminUserIdHeader, adminRoleHeader, [
      "admin",
      "support",
      "moderator",
    ]);
    const runtime = getOpsRuntimeMetricsSnapshot();
    const counts = await this.getCachedOpsMetricCounts();

    const moderationIncidentRatePer100Users =
      counts.totalUsers === 0
        ? 0
        : ((counts.reports24h + counts.moderationFlags24h) /
            counts.totalUsers) *
          100;
    const pushReadRate24h =
      counts.pushSent24h === 0 ? 0 : counts.pushRead24h / counts.pushSent24h;

    await this.adminAuditService.recordAction({
      adminUserId: admin.adminUserId,
      role: admin.role,
      action: "admin.ops_metrics_view",
      entityType: "ops_metrics",
      metadata: {
        queueCount: runtime.queues.length,
      },
    });

    return ok({
      generatedAt: new Date().toISOString(),
      apiLatency: runtime.http.latencyMs,
      apiRequestCounts: runtime.http.statusCounts,
      websocketConnectionCounts: runtime.websocket,
      queueLag: runtime.queues.map((queue) => ({
        queue: queue.queue,
        ...queue.lagMs,
      })),
      jobFailureRates: runtime.queues.map((queue) => ({
        queue: queue.queue,
        processed: queue.processed,
        failed: queue.failed,
        skipped: queue.skipped,
        failureRate: queue.failureRate,
      })),
      dbLatency: {
        pingMs: counts.dbLatencyMs,
      },
      openaiLatencyCost: runtime.openai,
      openaiBudget: getOpenAIBudgetGuardrailSnapshot(),
      moderationRates: {
        reports24h: counts.reports24h,
        moderationFlags24h: counts.moderationFlags24h,
        blockedProfiles: counts.blockedProfiles,
        incidentRatePer100Users: moderationIncidentRatePer100Users,
      },
      pushDeliverySuccess: {
        pushSent24h: counts.pushSent24h,
        pushRead24h: counts.pushRead24h,
        pushReadRate24h,
        runtimePushOpenRate: runtime.notifications.pushOpenRate,
      },
      onboardingInference: runtime.onboardingInference,
    });
  }

  @Get("ops/alerts")
  async opsAlerts(
    @Headers("x-admin-user-id") adminUserIdHeader?: string,
    @Headers("x-admin-role") adminRoleHeader?: string,
  ) {
    const admin = this.parseAdminContext(adminUserIdHeader, adminRoleHeader, [
      "admin",
      "support",
      "moderator",
    ]);
    const runtime = getOpsRuntimeMetricsSnapshot();
    const alertWindowStart = new Date(Date.now() - 15 * 60_000);
    const [dbLatencyMs, stalledJobCount, openModerationFlags, queueStates] =
      await Promise.all([
        this.measureDbLatencyMs(),
        this.prisma.auditLog?.count
          ? this.prisma.auditLog.count({
              where: {
                action: "queue.job_stalled",
                createdAt: { gte: alertWindowStart },
              },
            })
          : 0,
        this.prisma.moderationFlag?.count
          ? this.prisma.moderationFlag.count({
              where: { status: "open" },
            })
          : 0,
        Promise.all(
          JOB_QUEUE_NAMES.map((queueName) => this.inspectQueue(queueName)),
        ),
      ]);

    const queueBacklogThreshold = this.parseThreshold(
      process.env.ALERT_QUEUE_BACKLOG_THRESHOLD,
      250,
    );
    const websocketErrorThreshold = this.parseThreshold(
      process.env.ALERT_WEBSOCKET_ERROR_THRESHOLD,
      25,
    );
    const websocketErrorRateThreshold = this.parseThreshold(
      process.env.ALERT_WEBSOCKET_ERROR_RATE_THRESHOLD,
      0.2,
    );
    const dbLatencyThresholdMs = this.parseThreshold(
      process.env.ALERT_DB_LATENCY_THRESHOLD_MS,
      500,
    );
    const openAIErrorRateThreshold = this.parseThreshold(
      process.env.ALERT_OPENAI_ERROR_RATE_THRESHOLD,
      0.25,
    );
    const openAIMinCallsThreshold = this.parseThreshold(
      process.env.ALERT_OPENAI_MIN_CALLS_THRESHOLD,
      20,
    );
    const moderationBacklogThreshold = this.parseThreshold(
      process.env.ALERT_MODERATION_BACKLOG_THRESHOLD,
      150,
    );
    const onboardingFallbackRateThreshold = this.parseThreshold(
      process.env.ALERT_ONBOARDING_FALLBACK_RATE_THRESHOLD,
      0.2,
    );
    const onboardingRichP95LatencyThresholdMs = this.parseThreshold(
      process.env.ALERT_ONBOARDING_RICH_P95_LATENCY_THRESHOLD_MS,
      6_000,
    );
    const onboardingMinCallsThreshold = this.parseThreshold(
      process.env.ALERT_ONBOARDING_MIN_CALLS_THRESHOLD,
      10,
    );

    const queueBacklogAlerts = queueStates
      .filter((queue) => queue.available && queue.counts)
      .map((queue) => {
        const counts = queue.counts as Record<string, number>;
        const backlog =
          Number(counts.waiting ?? 0) +
          Number(counts.active ?? 0) +
          Number(counts.delayed ?? 0) +
          Number(counts.paused ?? 0) +
          Number(counts.prioritized ?? 0) +
          Number(counts["waiting-children"] ?? 0);
        return {
          queue: queue.queue,
          backlog,
        };
      })
      .filter((entry) => entry.backlog >= queueBacklogThreshold);

    const alerts = [
      ...(stalledJobCount > 0
        ? [
            {
              key: "queue_stalled",
              status: "triggered" as const,
              severity: "critical" as const,
              message: `Detected ${stalledJobCount} stalled queue job events in the last 15 minutes.`,
              value: stalledJobCount,
              threshold: 0,
            },
          ]
        : []),
      ...queueBacklogAlerts.map((entry) => ({
        key: "queue_backlog_high",
        status: "triggered" as const,
        severity: "warning" as const,
        message: `Queue ${entry.queue} backlog is high (${entry.backlog}).`,
        queue: entry.queue,
        value: entry.backlog,
        threshold: queueBacklogThreshold,
      })),
      ...(runtime.websocket.errors >= websocketErrorThreshold ||
      runtime.websocket.errorRate >= websocketErrorRateThreshold
        ? [
            {
              key: "websocket_error_spike",
              status: "triggered" as const,
              severity: "warning" as const,
              message: `Websocket error spike detected (${runtime.websocket.errors} errors, rate ${runtime.websocket.errorRate.toFixed(2)}).`,
              value: runtime.websocket.errors,
              threshold: websocketErrorThreshold,
              errorRate: runtime.websocket.errorRate,
              errorRateThreshold: websocketErrorRateThreshold,
            },
          ]
        : []),
      ...(dbLatencyMs === null || dbLatencyMs >= dbLatencyThresholdMs
        ? [
            {
              key: "db_connection_saturation",
              status: "triggered" as const,
              severity: "critical" as const,
              message:
                dbLatencyMs === null
                  ? "Database ping failed during health evaluation."
                  : `Database latency is elevated (${dbLatencyMs}ms).`,
              value: dbLatencyMs,
              threshold: dbLatencyThresholdMs,
            },
          ]
        : []),
      ...(runtime.openai.calls >= openAIMinCallsThreshold &&
      runtime.openai.errorRate >= openAIErrorRateThreshold
        ? [
            {
              key: "openai_error_spike",
              status: "triggered" as const,
              severity: "warning" as const,
              message: `OpenAI error rate is high (${runtime.openai.errorRate.toFixed(2)} over ${runtime.openai.calls} calls).`,
              value: runtime.openai.errorRate,
              threshold: openAIErrorRateThreshold,
              calls: runtime.openai.calls,
            },
          ]
        : []),
      ...(openModerationFlags >= moderationBacklogThreshold
        ? [
            {
              key: "moderation_backlog_high",
              status: "triggered" as const,
              severity: "warning" as const,
              message: `Open moderation queue backlog is high (${openModerationFlags}).`,
              value: openModerationFlags,
              threshold: moderationBacklogThreshold,
            },
          ]
        : []),
      ...(runtime.onboardingInference.calls >= onboardingMinCallsThreshold &&
      runtime.onboardingInference.fallbackRate >=
        onboardingFallbackRateThreshold
        ? [
            {
              key: "onboarding_fallback_spike",
              status: "triggered" as const,
              severity: "warning" as const,
              message: `Onboarding fallback rate is elevated (${runtime.onboardingInference.fallbackRate.toFixed(2)} over ${runtime.onboardingInference.calls} calls).`,
              value: runtime.onboardingInference.fallbackRate,
              threshold: onboardingFallbackRateThreshold,
              calls: runtime.onboardingInference.calls,
            },
          ]
        : []),
      ...runtime.onboardingInference.byMode
        .filter(
          (mode) =>
            mode.mode === "rich" &&
            mode.calls >= onboardingMinCallsThreshold &&
            mode.latencyMs.p95Ms >= onboardingRichP95LatencyThresholdMs,
        )
        .map((mode) => ({
          key: "onboarding_rich_latency_high",
          status: "triggered" as const,
          severity: "warning" as const,
          message: `Onboarding rich latency p95 is elevated (${Math.round(mode.latencyMs.p95Ms)}ms over ${mode.calls} calls).`,
          mode: mode.mode,
          value: mode.latencyMs.p95Ms,
          threshold: onboardingRichP95LatencyThresholdMs,
          calls: mode.calls,
        })),
    ];

    await this.adminAuditService.recordAction({
      adminUserId: admin.adminUserId,
      role: admin.role,
      action: "admin.ops_alerts_view",
      entityType: "ops_alerts",
      metadata: {
        alertCount: alerts.length,
      },
    });

    const criticalCount = alerts.filter(
      (alert) => alert.severity === "critical",
    ).length;
    const warningCount = alerts.filter(
      (alert) => alert.severity === "warning",
    ).length;

    return ok({
      generatedAt: new Date().toISOString(),
      alertWindowMinutes: 15,
      alerts,
      summary: {
        status: alerts.length === 0 ? "healthy" : "degraded",
        criticalCount,
        warningCount,
      },
    });
  }

  @Get("ops/onboarding-activation")
  async onboardingActivationSnapshot(
    @Headers("x-admin-user-id") adminUserIdHeader?: string,
    @Headers("x-admin-role") adminRoleHeader?: string,
    @Query("hours") hoursParam?: string,
  ) {
    const admin = this.parseAdminContext(adminUserIdHeader, adminRoleHeader, [
      "admin",
      "support",
      "moderator",
    ]);
    const hours = this.normalizeWindowHours(hoursParam);
    const windowStart = new Date(Date.now() - hours * 60 * 60_000);

    const rows = this.prisma.clientMutation?.findMany
      ? await this.prisma.clientMutation.findMany({
          where: {
            scope: "intent.create_from_agent",
            idempotencyKey: {
              startsWith: "onboarding-carryover:",
            },
            createdAt: {
              gte: windowStart,
            },
          },
          select: {
            status: true,
            createdAt: true,
            updatedAt: true,
          },
          orderBy: {
            createdAt: "desc",
          },
          take: 5000,
        })
      : [];

    const started = rows.length;
    const succeeded = rows.filter((row) => row.status === "completed").length;
    const failed = rows.filter((row) => row.status === "failed").length;
    const processing = rows.filter((row) => row.status === "processing").length;
    const fallbackQueuedLike = processing;
    const completionSeconds = rows
      .filter((row) => row.status === "completed")
      .map((row) =>
        Math.max(0, (row.updatedAt.getTime() - row.createdAt.getTime()) / 1000),
      );
    const avgCompletionSeconds =
      completionSeconds.length === 0
        ? null
        : completionSeconds.reduce((sum, current) => sum + current, 0) /
          completionSeconds.length;

    await this.adminAuditService.recordAction({
      adminUserId: admin.adminUserId,
      role: admin.role,
      action: "admin.ops_onboarding_activation_view",
      entityType: "ops_metrics",
      metadata: {
        windowHours: hours,
        rows: started,
      },
    });

    return ok({
      generatedAt: new Date().toISOString(),
      window: {
        hours,
        start: windowStart.toISOString(),
        end: new Date().toISOString(),
      },
      counters: {
        started,
        succeeded,
        failed,
        processing,
      },
      metrics: {
        successRate: started === 0 ? null : succeeded / started,
        failureRate: started === 0 ? null : failed / started,
        processingRate: started === 0 ? null : processing / started,
        avgCompletionSeconds,
      },
      notes: {
        queuedApproximation: fallbackQueuedLike,
        queuedApproximationReason:
          "server-side snapshot infers queued-like pressure from in-flight processing mutations",
      },
    });
  }

  @Get("ops/agentic-evals")
  async opsAgenticEvals(
    @Headers("x-admin-user-id") adminUserIdHeader?: string,
    @Headers("x-admin-role") adminRoleHeader?: string,
  ) {
    const admin = this.parseAdminContext(adminUserIdHeader, adminRoleHeader, [
      "admin",
      "support",
      "moderator",
    ]);
    const snapshot = await this.agenticEvalsService.runSnapshot();

    await this.adminAuditService.recordAction({
      adminUserId: admin.adminUserId,
      role: admin.role,
      action: "admin.ops_agentic_evals_view",
      entityType: "ops_agentic_evals",
      metadata: {
        scenarioCount: snapshot.summary.total,
        passRate: snapshot.summary.passRate,
      },
    });

    return ok(snapshot);
  }

  @Get("ops/agent-outcomes")
  async opsAgentOutcomes(
    @Headers("x-admin-user-id") adminUserIdHeader?: string,
    @Headers("x-admin-role") adminRoleHeader?: string,
    @Query("days") daysParam?: string,
  ) {
    const admin = this.parseAdminContext(adminUserIdHeader, adminRoleHeader, [
      "admin",
      "support",
      "moderator",
    ]);
    const days = Number(daysParam ?? 30);
    const snapshot = await this.analyticsService.getAgentOutcomeMetrics({
      days: Number.isFinite(days) ? days : 30,
    });

    await this.adminAuditService.recordAction({
      adminUserId: admin.adminUserId,
      role: admin.role,
      action: "admin.ops_agent_outcomes_view",
      entityType: "ops_agent_outcomes",
      metadata: {
        totalActions: snapshot.summary.totalActions,
        toolCount: snapshot.toolAttempts.length,
      },
    });

    return ok(snapshot);
  }

  @Get("ops/agent-actions")
  async opsAgentActions(
    @Headers("x-admin-user-id") adminUserIdHeader?: string,
    @Headers("x-admin-role") adminRoleHeader?: string,
    @Query() query?: unknown,
  ) {
    const admin = this.parseAdminContext(adminUserIdHeader, adminRoleHeader, [
      "admin",
      "support",
      "moderator",
    ]);
    const payload = parseRequestPayload(
      adminAgentActionDebugQuerySchema,
      query,
    );
    const limit = payload.limit ?? 25;

    const actionRows = this.prisma.auditLog?.findMany
      ? await this.prisma.auditLog.findMany({
          where: {
            action: "agent.tool_action_executed",
            entityType: "agent_thread",
            ...(payload.actorUserId
              ? { actorUserId: payload.actorUserId }
              : {}),
            ...(payload.threadId ? { entityId: payload.threadId } : {}),
          },
          orderBy: { createdAt: "desc" },
          take: Math.min(limit * 8, 500),
          select: {
            id: true,
            actorUserId: true,
            entityId: true,
            createdAt: true,
            metadata: true,
          },
        })
      : [];

    const normalizedRows = actionRows
      .map((row) => {
        const metadata = this.readJsonObject(row.metadata);
        return {
          id: row.id,
          actorUserId: row.actorUserId,
          threadId: row.entityId,
          createdAt: row.createdAt,
          metadata,
          traceId: this.readString(metadata["traceId"]),
          tool: this.readString(metadata["tool"]),
          status: this.readString(metadata["status"]),
          role: this.readString(metadata["role"]),
          reason: this.readString(metadata["reason"]),
          summary: this.readString(metadata["summary"]),
          input: metadata["input"],
          output: metadata["output"],
        };
      })
      .filter((row) => (payload.tool ? row.tool === payload.tool : true))
      .filter((row) => (payload.status ? row.status === payload.status : true))
      .filter((row) =>
        payload.traceId ? row.traceId === payload.traceId : true,
      )
      .slice(0, limit);

    const threadIds = Array.from(
      new Set(
        normalizedRows
          .map((row) => row.threadId)
          .filter((value): value is string => typeof value === "string"),
      ),
    );
    const traceIds = Array.from(
      new Set(
        normalizedRows
          .map((row) => row.traceId)
          .filter((value): value is string => typeof value === "string"),
      ),
    );

    const [checkpoints, threads, userMessages, relatedTraceAuditRows] =
      await Promise.all([
        this.prisma.agentPlanCheckpoint?.findMany
          ? this.prisma.agentPlanCheckpoint.findMany({
              where: {
                ...(threadIds.length > 0
                  ? {
                      threadId: {
                        in: threadIds,
                      },
                    }
                  : {}),
                ...(traceIds.length > 0
                  ? {
                      traceId: {
                        in: traceIds,
                      },
                    }
                  : {}),
              },
              orderBy: { createdAt: "desc" },
              select: {
                id: true,
                threadId: true,
                traceId: true,
                actionType: true,
                riskLevel: true,
                status: true,
                decisionReason: true,
                requestedByRole: true,
                tool: true,
                createdAt: true,
                resolvedAt: true,
              },
            })
          : [],
        this.prisma.agentThread?.findMany
          ? this.prisma.agentThread.findMany({
              where: {
                id: {
                  in: threadIds,
                },
              },
              select: {
                id: true,
                title: true,
                createdAt: true,
              },
            })
          : [],
        this.prisma.agentMessage?.findMany
          ? this.prisma.agentMessage.findMany({
              where: {
                threadId: {
                  in: threadIds,
                },
                role: "user",
              },
              orderBy: { createdAt: "desc" },
              take: Math.max(threadIds.length * 3, 20),
              select: {
                id: true,
                threadId: true,
                content: true,
                createdAt: true,
              },
            })
          : [],
        traceIds.length > 0
          ? this.prisma.auditLog.findMany({
              where: {
                action: {
                  in: [
                    "matching.candidates_retrieved",
                    "routing.filters_widened",
                    "moderation.agent_risk_assessed",
                    "analytics.event",
                  ],
                },
              },
              orderBy: { createdAt: "desc" },
              take: 500,
              select: {
                id: true,
                action: true,
                entityType: true,
                entityId: true,
                metadata: true,
                createdAt: true,
              },
            })
          : [],
      ]);

    const latestUserMessageByThreadId = new Map<
      string,
      { id: string; content: string; createdAt: Date }
    >();
    for (const message of userMessages) {
      if (!latestUserMessageByThreadId.has(message.threadId)) {
        latestUserMessageByThreadId.set(message.threadId, message);
      }
    }

    const threadById = new Map(threads.map((thread) => [thread.id, thread]));
    const checkpointByTraceId = new Map<string, (typeof checkpoints)[number]>();
    for (const checkpoint of checkpoints) {
      if (!checkpointByTraceId.has(checkpoint.traceId)) {
        checkpointByTraceId.set(checkpoint.traceId, checkpoint);
      }
    }

    const relatedTraceEventsByTraceId = new Map<
      string,
      Array<{
        id: string;
        action: string;
        entityType: string;
        entityId: string | null;
        createdAt: string;
        summary: string | null;
      }>
    >();
    for (const row of relatedTraceAuditRows) {
      const metadata = this.readJsonObject(row.metadata);
      const traceId = this.readString(metadata["traceId"]);
      if (!traceId || !traceIds.includes(traceId)) {
        continue;
      }
      const existing = relatedTraceEventsByTraceId.get(traceId) ?? [];
      existing.push({
        id: row.id,
        action: row.action,
        entityType: row.entityType,
        entityId: row.entityId,
        createdAt: row.createdAt.toISOString(),
        summary:
          this.readString(metadata["summary"]) ??
          this.readString(metadata["eventType"]) ??
          null,
      });
      relatedTraceEventsByTraceId.set(traceId, existing.slice(0, 5));
    }

    await this.adminAuditService.recordAction({
      adminUserId: admin.adminUserId,
      role: admin.role,
      action: "admin.ops_agent_actions_view",
      entityType: "ops_agent_actions",
      metadata: {
        limit,
        tool: payload.tool ?? null,
        status: payload.status ?? null,
        actorUserId: payload.actorUserId ?? null,
        threadId: payload.threadId ?? null,
        traceId: payload.traceId ?? null,
        resultCount: normalizedRows.length,
      },
    });

    return ok({
      filters: {
        limit,
        tool: payload.tool ?? null,
        status: payload.status ?? null,
        actorUserId: payload.actorUserId ?? null,
        threadId: payload.threadId ?? null,
        traceId: payload.traceId ?? null,
      },
      items: normalizedRows.map((row) => {
        const thread = row.threadId
          ? (threadById.get(row.threadId) ?? null)
          : null;
        const latestUserMessage = row.threadId
          ? (latestUserMessageByThreadId.get(row.threadId) ?? null)
          : null;
        const checkpoint = row.traceId
          ? (checkpointByTraceId.get(row.traceId) ?? null)
          : null;
        return {
          id: row.id,
          actorUserId: row.actorUserId,
          threadId: row.threadId,
          createdAt: row.createdAt.toISOString(),
          traceId: row.traceId,
          tool: row.tool,
          status: row.status,
          role: row.role,
          reason: row.reason,
          summary: row.summary,
          input: row.input ?? null,
          output: row.output ?? null,
          thread: thread
            ? {
                title: thread.title ?? null,
                createdAt: thread.createdAt.toISOString(),
              }
            : null,
          latestUserMessage: latestUserMessage
            ? {
                id: latestUserMessage.id,
                content: latestUserMessage.content,
                createdAt: latestUserMessage.createdAt.toISOString(),
              }
            : null,
          linkedCheckpoint: checkpoint
            ? {
                id: checkpoint.id,
                actionType: checkpoint.actionType,
                tool: checkpoint.tool,
                riskLevel: checkpoint.riskLevel,
                status: checkpoint.status,
                decisionReason: checkpoint.decisionReason,
                requestedByRole: checkpoint.requestedByRole,
                createdAt: checkpoint.createdAt.toISOString(),
                resolvedAt: checkpoint.resolvedAt?.toISOString() ?? null,
              }
            : null,
          relatedTraceEvents: row.traceId
            ? (relatedTraceEventsByTraceId.get(row.traceId) ?? [])
            : [],
          replayHint: this.buildAgentActionReplayHint({
            status: row.status,
            tool: row.tool,
            reason: row.reason,
            checkpointStatus: checkpoint?.status ?? null,
          }),
        };
      }),
    });
  }

  @Get("security/posture")
  async securityPosture(
    @Headers("x-admin-user-id") adminUserIdHeader?: string,
    @Headers("x-admin-role") adminRoleHeader?: string,
  ) {
    const admin = this.parseAdminContext(adminUserIdHeader, adminRoleHeader, [
      "admin",
      "support",
    ]);
    const posture = evaluateSecurityPosture();

    await this.adminAuditService.recordAction({
      adminUserId: admin.adminUserId,
      role: admin.role,
      action: "admin.security_posture_view",
      entityType: "security_posture",
      metadata: {
        violationCount: posture.violations.length,
      },
    });

    return ok(posture);
  }

  @Get("jobs/dead-letters")
  async listDeadLetters(
    @Headers("x-admin-user-id") adminUserIdHeader?: string,
    @Headers("x-admin-role") adminRoleHeader?: string,
  ) {
    const admin = this.parseAdminContext(adminUserIdHeader, adminRoleHeader, [
      "admin",
      "support",
    ]);
    await this.adminAuditService.recordAction({
      adminUserId: admin.adminUserId,
      role: admin.role,
      action: "admin.dead_letter_list",
      entityType: "dead_letter_job",
    });
    return ok(await this.deadLetterService.listDeadLetters(100));
  }

  @Post("jobs/dead-letters/:deadLetterId/replay")
  async replayDeadLetter(
    @Param("deadLetterId") deadLetterIdParam: string,
    @Headers("x-admin-user-id") adminUserIdHeader?: string,
    @Headers("x-admin-role") adminRoleHeader?: string,
  ) {
    const admin = this.parseAdminContext(adminUserIdHeader, adminRoleHeader, [
      "admin",
      "support",
    ]);
    const deadLetterId = parseRequestPayload(uuidSchema, deadLetterIdParam);
    await this.adminAuditService.recordAction({
      adminUserId: admin.adminUserId,
      role: admin.role,
      action: "admin.dead_letter_replay",
      entityType: "dead_letter_job",
      entityId: deadLetterId,
    });
    return ok(await this.deadLetterService.replayDeadLetter(deadLetterId));
  }

  @Post("outbox/relay")
  async relayOutboxNow(
    @Headers("x-admin-user-id") adminUserIdHeader?: string,
    @Headers("x-admin-role") adminRoleHeader?: string,
  ) {
    const admin = this.parseAdminContext(adminUserIdHeader, adminRoleHeader, [
      "admin",
      "support",
    ]);
    await this.adminAuditService.recordAction({
      adminUserId: admin.adminUserId,
      role: admin.role,
      action: "admin.outbox_relay",
      entityType: "outbox_event",
    });
    return ok(await this.outboxRelayService.relayPendingEvents(200));
  }

  @Get("jobs/queues")
  async queueOverview(
    @Headers("x-admin-user-id") adminUserIdHeader?: string,
    @Headers("x-admin-role") adminRoleHeader?: string,
  ) {
    const admin = this.parseAdminContext(adminUserIdHeader, adminRoleHeader, [
      "admin",
      "support",
      "moderator",
    ]);
    const queues = await Promise.all(
      JOB_QUEUE_NAMES.map((queueName) => this.inspectQueue(queueName)),
    );
    await this.adminAuditService.recordAction({
      adminUserId: admin.adminUserId,
      role: admin.role,
      action: "admin.queue_overview",
      entityType: "queue",
      metadata: {
        queueCount: queues.length,
      },
    });
    return ok({
      generatedAt: new Date().toISOString(),
      queues,
    });
  }

  @Get("moderation/queue")
  async moderationQueue(
    @Headers("x-admin-user-id") adminUserIdHeader?: string,
    @Headers("x-admin-role") adminRoleHeader?: string,
    @Query("limit") limit?: string,
    @Query("status") status?: string,
    @Query("entityType") entityType?: string,
    @Query("reasonContains") reasonContains?: string,
  ) {
    const admin = this.parseAdminContext(adminUserIdHeader, adminRoleHeader, [
      "admin",
      "support",
      "moderator",
    ]);
    const payload = parseRequestPayload(adminModerationQueueQuerySchema, {
      limit,
      status,
      entityType,
      reasonContains,
    });
    const parsedLimit = payload.limit ?? 100;
    await this.adminAuditService.recordAction({
      adminUserId: admin.adminUserId,
      role: admin.role,
      action: "admin.moderation_queue_list",
      entityType: "moderation_flag",
      metadata: {
        limit: parsedLimit,
        status: payload.status ?? "open",
        entityType: payload.entityType ?? null,
        reasonContains: payload.reasonContains ?? null,
      },
    });
    return ok(
      await this.adminAuditService.listModerationQueue({
        limit: parsedLimit,
        status: payload.status,
        entityType: payload.entityType,
        reasonContains: payload.reasonContains,
      }),
    );
  }

  @Get("moderation/summary")
  async moderationSummary(
    @Headers("x-admin-user-id") adminUserIdHeader?: string,
    @Headers("x-admin-role") adminRoleHeader?: string,
  ) {
    const admin = this.parseAdminContext(adminUserIdHeader, adminRoleHeader, [
      "admin",
      "support",
      "moderator",
    ]);
    const windowStart = new Date(Date.now() - 24 * 60 * 60_000);

    const [
      openFlags,
      resolvedFlags24h,
      dismissedFlags24h,
      agentRiskOpenFlags,
      reportsOpen,
      reports24h,
      blockedProfiles,
      suspendedUsers,
      latestFlags,
      latestReports,
      flags24hForAnalytics,
    ] = await Promise.all([
      this.prisma.moderationFlag?.count
        ? this.prisma.moderationFlag.count({ where: { status: "open" } })
        : 0,
      this.prisma.moderationFlag?.count
        ? this.prisma.moderationFlag.count({
            where: { status: "resolved", createdAt: { gte: windowStart } },
          })
        : 0,
      this.prisma.moderationFlag?.count
        ? this.prisma.moderationFlag.count({
            where: { status: "dismissed", createdAt: { gte: windowStart } },
          })
        : 0,
      this.prisma.moderationFlag?.count
        ? this.prisma.moderationFlag.count({
            where: { status: "open", entityType: "agent_thread" },
          })
        : 0,
      this.prisma.userReport?.count
        ? this.prisma.userReport.count({ where: { status: "open" } })
        : 0,
      this.prisma.userReport?.count
        ? this.prisma.userReport.count({
            where: { createdAt: { gte: windowStart } },
          })
        : 0,
      this.prisma.userProfile?.count
        ? this.prisma.userProfile.count({
            where: { moderationState: "blocked" },
          })
        : 0,
      this.prisma.user?.count
        ? this.prisma.user.count({
            where: { status: "suspended" },
          })
        : 0,
      this.prisma.moderationFlag?.findMany
        ? this.prisma.moderationFlag.findMany({
            take: 5,
            orderBy: { createdAt: "desc" },
            select: {
              id: true,
              entityType: true,
              entityId: true,
              reason: true,
              status: true,
              createdAt: true,
            },
          })
        : [],
      this.prisma.userReport?.findMany
        ? this.prisma.userReport.findMany({
            take: 5,
            orderBy: { createdAt: "desc" },
            select: {
              id: true,
              reporterUserId: true,
              targetUserId: true,
              reason: true,
              status: true,
              createdAt: true,
            },
          })
        : [],
      this.prisma.moderationFlag?.findMany
        ? this.prisma.moderationFlag.findMany({
            where: { createdAt: { gte: windowStart } },
            select: {
              entityId: true,
              reason: true,
              status: true,
              createdAt: true,
              assignedAt: true,
              triagedAt: true,
            },
          })
        : [],
    ]);

    const flagsWithAssignment = flags24hForAnalytics.filter(
      (flag) => flag.assignedAt instanceof Date,
    );
    const flagsWithDecision = flags24hForAnalytics.filter(
      (flag) => flag.triagedAt instanceof Date,
    );
    const avgMinutes = (
      rows: Array<{
        createdAt: Date;
        assignedAt?: Date | null;
        triagedAt?: Date | null;
      }>,
      targetKey: "assignedAt" | "triagedAt",
    ) => {
      if (rows.length === 0) {
        return null;
      }
      const totalMs = rows.reduce((sum, row) => {
        const target = row[targetKey];
        if (!(target instanceof Date)) {
          return sum;
        }
        return sum + (target.getTime() - row.createdAt.getTime());
      }, 0);
      return Math.round(totalMs / rows.length / 60_000);
    };
    const repeatOffenders = new Set(
      flags24hForAnalytics
        .map((flag) => flag.entityId)
        .filter((entityId, index, all) => all.indexOf(entityId) !== index),
    ).size;
    const topReasons = Array.from(
      flags24hForAnalytics.reduce((counts, flag) => {
        counts.set(flag.reason, (counts.get(flag.reason) ?? 0) + 1);
        return counts;
      }, new Map<string, number>()),
    )
      .sort((left, right) => right[1] - left[1])
      .slice(0, 5)
      .map(([reason, count]) => ({ reason, count }));
    const dismissalRate24h =
      resolvedFlags24h + dismissedFlags24h === 0
        ? 0
        : Number(
            (
              dismissedFlags24h /
              (resolvedFlags24h + dismissedFlags24h)
            ).toFixed(2),
          );

    await this.adminAuditService.recordAction({
      adminUserId: admin.adminUserId,
      role: admin.role,
      action: "admin.moderation_summary_view",
      entityType: "moderation_flag",
    });

    return ok({
      generatedAt: new Date().toISOString(),
      queue: {
        openFlags,
        agentRiskOpenFlags,
        reportsOpen,
      },
      actions24h: {
        reports24h,
        resolvedFlags24h,
        dismissedFlags24h,
      },
      enforcement: {
        blockedProfiles,
        suspendedUsers,
      },
      analytics: {
        avgTimeToAssignmentMinutes: avgMinutes(
          flagsWithAssignment,
          "assignedAt",
        ),
        avgTimeToDecisionMinutes: avgMinutes(flagsWithDecision, "triagedAt"),
        dismissalRate24h,
        repeatOffenders24h: repeatOffenders,
        topReasons,
      },
      recent: {
        flags: latestFlags,
        reports: latestReports,
      },
    });
  }

  @Get("moderation/settings")
  async moderationSettings(
    @Headers("x-admin-user-id") adminUserIdHeader?: string,
    @Headers("x-admin-role") adminRoleHeader?: string,
  ) {
    const admin = this.parseAdminContext(adminUserIdHeader, adminRoleHeader, [
      "admin",
      "support",
      "moderator",
    ]);

    await this.adminAuditService.recordAction({
      adminUserId: admin.adminUserId,
      role: admin.role,
      action: "admin.moderation_settings_view",
      entityType: "moderation_policy",
    });

    return ok(this.getModerationSettingsSnapshot());
  }

  @Get("moderation/agent-risk-flags")
  async moderationAgentRiskFlags(
    @Headers("x-admin-user-id") adminUserIdHeader?: string,
    @Headers("x-admin-role") adminRoleHeader?: string,
    @Query("limit") limit?: string,
    @Query("status") status?: string,
    @Query("decision") decision?: string,
  ) {
    const admin = this.parseAdminContext(adminUserIdHeader, adminRoleHeader, [
      "admin",
      "support",
      "moderator",
    ]);

    const payload = parseRequestPayload(adminModerationAgentRiskQuerySchema, {
      limit,
      status,
      decision,
    });
    const parsedLimit = payload.limit ?? 100;
    const statusFilter = payload.status ?? "open";

    const where = {
      entityType: "agent_thread",
      status: statusFilter,
      ...(payload.decision
        ? { reason: { contains: `_${payload.decision}:` } }
        : {}),
    };

    const [flags, totalMatching] = await Promise.all([
      this.prisma.moderationFlag.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: parsedLimit,
        select: {
          id: true,
          entityType: true,
          entityId: true,
          reason: true,
          status: true,
          assigneeUserId: true,
          assignmentNote: true,
          assignedAt: true,
          lastDecision: true,
          triageNote: true,
          triagedByAdminUserId: true,
          triagedAt: true,
          createdAt: true,
        },
      }),
      this.prisma.moderationFlag.count({
        where,
      }),
    ]);

    const threadIds = Array.from(
      new Set(flags.map((flag) => flag.entityId).filter(Boolean)),
    );
    const flagIds = flags.map((flag) => flag.id);
    const auditByThreadId = new Map<
      string,
      {
        id: string;
        metadata: unknown;
        createdAt: Date;
      }
    >();
    if (threadIds.length > 0 && this.prisma.auditLog?.findMany) {
      const auditRows = await this.prisma.auditLog.findMany({
        where: {
          action: "moderation.agent_risk_assessed",
          entityType: "agent_thread",
          entityId: { in: threadIds },
        },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          entityId: true,
          metadata: true,
          createdAt: true,
        },
      });
      for (const row of auditRows) {
        if (!row.entityId || auditByThreadId.has(row.entityId)) {
          continue;
        }
        auditByThreadId.set(row.entityId, {
          id: row.id,
          metadata: row.metadata,
          createdAt: row.createdAt,
        });
      }
    }

    const assignmentByFlagId = new Map<
      string,
      {
        id: string;
        metadata: unknown;
        createdAt: Date;
      }
    >();
    if (flagIds.length > 0 && this.prisma.auditLog?.findMany) {
      const assignmentRows = await this.prisma.auditLog.findMany({
        where: {
          action: "admin.moderation_flag_assigned",
          entityType: "moderation_flag",
          entityId: { in: flagIds },
        },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          entityId: true,
          metadata: true,
          createdAt: true,
        },
      });
      for (const row of assignmentRows) {
        if (!row.entityId || assignmentByFlagId.has(row.entityId)) {
          continue;
        }
        assignmentByFlagId.set(row.entityId, {
          id: row.id,
          metadata: row.metadata,
          createdAt: row.createdAt,
        });
      }
    }

    await this.adminAuditService.recordAction({
      adminUserId: admin.adminUserId,
      role: admin.role,
      action: "admin.moderation_agent_risk_list",
      entityType: "moderation_flag",
      metadata: {
        limit: parsedLimit,
        status: statusFilter,
        decision: payload.decision ?? null,
        totalMatching,
      },
    });

    return ok({
      filters: {
        limit: parsedLimit,
        status: statusFilter,
        decision: payload.decision ?? null,
      },
      totalMatching,
      items: flags.map((flag) => ({
        ...flag,
        latestRiskAudit: auditByThreadId.get(flag.entityId) ?? null,
        latestAssignment: assignmentByFlagId.get(flag.id) ?? null,
      })),
    });
  }

  @Post("moderation/flags/:flagId/assign")
  async assignModerationFlag(
    @Param("flagId") flagIdParam: string,
    @Body() body: unknown,
    @Headers("x-admin-user-id") adminUserIdHeader?: string,
    @Headers("x-admin-role") adminRoleHeader?: string,
  ) {
    const admin = this.parseAdminContext(adminUserIdHeader, adminRoleHeader, [
      "admin",
      "support",
      "moderator",
    ]);
    const flagId = parseRequestPayload(uuidSchema, flagIdParam);
    const payload = parseRequestPayload(adminModerationFlagAssignBodySchema, {
      ...(body && typeof body === "object" ? body : {}),
    });

    if (!this.prisma.moderationFlag?.findUnique) {
      throw new ForbiddenException("moderation triage is unavailable");
    }

    const flag = await this.prisma.moderationFlag.findUnique({
      where: { id: flagId },
      select: {
        id: true,
        entityType: true,
        entityId: true,
        reason: true,
        status: true,
        assigneeUserId: true,
        assignmentNote: true,
        assignedAt: true,
        lastDecision: true,
        triageNote: true,
        triagedByAdminUserId: true,
        triagedAt: true,
        createdAt: true,
      },
    });
    if (!flag) {
      throw new NotFoundException("moderation flag not found");
    }

    const assignedAt = new Date();
    if (this.prisma.moderationFlag?.update) {
      await this.prisma.moderationFlag.update({
        where: { id: flag.id },
        data: {
          assigneeUserId: payload.assigneeUserId,
          assignmentNote: payload.reason ?? null,
          assignedAt,
        },
      });
    }
    if (this.prisma.auditLog?.create) {
      await this.prisma.auditLog.create({
        data: {
          actorUserId: admin.adminUserId,
          actorType: "admin",
          action: "admin.moderation_flag_assigned",
          entityType: "moderation_flag",
          entityId: flag.id,
          metadata: {
            assignedByAdminUserId: admin.adminUserId,
            assigneeUserId: payload.assigneeUserId,
            reason: payload.reason ?? null,
            statusAtAssignment: flag.status,
          } as Prisma.InputJsonValue,
        },
      });
    }

    await this.adminAuditService.recordAction({
      adminUserId: admin.adminUserId,
      role: admin.role,
      action: "admin.moderation_flag_assign",
      entityType: "moderation_flag",
      entityId: flag.id,
      metadata: {
        assigneeUserId: payload.assigneeUserId,
        reason: payload.reason ?? null,
      },
    });

    return ok({
      flag,
      assigneeUserId: payload.assigneeUserId,
      assignmentNote: payload.reason ?? null,
      assignedAt: assignedAt.toISOString(),
    });
  }

  @Post("moderation/flags/:flagId/triage")
  async triageModerationFlag(
    @Param("flagId") flagIdParam: string,
    @Body() body: unknown,
    @Headers("x-admin-user-id") adminUserIdHeader?: string,
    @Headers("x-admin-role") adminRoleHeader?: string,
  ) {
    const admin = this.parseAdminContext(adminUserIdHeader, adminRoleHeader, [
      "admin",
      "support",
      "moderator",
    ]);
    const flagId = parseRequestPayload(uuidSchema, flagIdParam);
    const payload = parseRequestPayload(adminModerationFlagTriageBodySchema, {
      ...(body && typeof body === "object" ? body : {}),
    });

    if (
      !this.prisma.moderationFlag?.findUnique ||
      !this.prisma.moderationFlag.update
    ) {
      throw new ForbiddenException("moderation triage is unavailable");
    }

    const flag = await this.prisma.moderationFlag.findUnique({
      where: { id: flagId },
      select: {
        id: true,
        entityType: true,
        entityId: true,
        reason: true,
        status: true,
        assigneeUserId: true,
        assignmentNote: true,
        assignedAt: true,
        lastDecision: true,
        triageNote: true,
        triagedByAdminUserId: true,
        triagedAt: true,
        createdAt: true,
      },
    });
    if (!flag) {
      throw new NotFoundException("moderation flag not found");
    }

    let nextStatus = flag.status;
    let strikeResult: unknown = null;
    let restrictionResult: unknown = null;

    switch (payload.action) {
      case "resolve": {
        nextStatus = "resolved";
        break;
      }
      case "reopen": {
        nextStatus = "open";
        break;
      }
      case "restrict_user": {
        const targetUserId = payload.targetUserId;
        if (!targetUserId) {
          throw new ForbiddenException(
            "targetUserId is required for restrict_user",
          );
        }
        if (!this.prisma.userProfile?.upsert) {
          throw new ForbiddenException("user restriction is unavailable");
        }
        restrictionResult = await this.prisma.userProfile.upsert({
          where: { userId: targetUserId },
          create: {
            userId: targetUserId,
            moderationState: "blocked",
          },
          update: {
            moderationState: "blocked",
          },
          select: {
            userId: true,
            moderationState: true,
          },
        });
        nextStatus = "resolved";
        break;
      }
      case "escalate_strike": {
        const targetUserId = payload.targetUserId;
        if (!targetUserId) {
          throw new ForbiddenException(
            "targetUserId is required for escalate_strike",
          );
        }
        strikeResult = await this.moderationService.issueStrike({
          moderatorUserId: admin.adminUserId,
          targetUserId,
          reason:
            payload.strikeReason ??
            payload.reason ??
            `agent_flag:${flag.reason.slice(0, 240)}`,
          severity: payload.strikeSeverity ?? 2,
          entityType: "user",
          entityId: targetUserId,
        });
        nextStatus = "resolved";
        break;
      }
    }

    const updatedFlag = await this.prisma.moderationFlag.update({
      where: { id: flag.id },
      data: {
        status: nextStatus,
        lastDecision: payload.action,
        triageNote: payload.reason ?? null,
        triagedByAdminUserId: admin.adminUserId,
        triagedAt: new Date(),
      },
      select: {
        id: true,
        entityType: true,
        entityId: true,
        reason: true,
        status: true,
        assigneeUserId: true,
        assignmentNote: true,
        assignedAt: true,
        lastDecision: true,
        triageNote: true,
        triagedByAdminUserId: true,
        triagedAt: true,
        createdAt: true,
      },
    });

    await this.adminAuditService.recordAction({
      adminUserId: admin.adminUserId,
      role: admin.role,
      action: "admin.moderation_flag_triage",
      entityType: "moderation_flag",
      entityId: flag.id,
      metadata: {
        triageAction: payload.action,
        previousStatus: flag.status,
        nextStatus,
        triageReason: payload.reason ?? null,
        targetUserId: payload.targetUserId ?? null,
        strikeSeverity: payload.strikeSeverity ?? null,
      },
    });

    return ok({
      flag: updatedFlag,
      action: payload.action,
      strikeResult,
      restrictionResult,
    });
  }

  @Get("users")
  async listUsers(
    @Headers("x-admin-user-id") adminUserIdHeader?: string,
    @Headers("x-admin-role") adminRoleHeader?: string,
    @Query("limit") limit?: string,
  ) {
    const admin = this.parseAdminContext(adminUserIdHeader, adminRoleHeader, [
      "admin",
      "support",
      "moderator",
    ]);
    const parsedLimit = this.parseLimit(limit);
    const users = await this.prisma.user.findMany({
      take: parsedLimit,
      orderBy: { createdAt: "desc" },
      include: {
        profile: {
          select: {
            onboardingState: true,
            trustScore: true,
            moderationState: true,
            availabilityMode: true,
            visibility: true,
            lastActiveAt: true,
          },
        },
      },
    });

    await this.adminAuditService.recordAction({
      adminUserId: admin.adminUserId,
      role: admin.role,
      action: "admin.users_list",
      entityType: "user",
      metadata: {
        limit: parsedLimit,
      },
    });

    return ok(users);
  }

  @Get("intents")
  async listIntents(
    @Headers("x-admin-user-id") adminUserIdHeader?: string,
    @Headers("x-admin-role") adminRoleHeader?: string,
    @Query("limit") limit?: string,
  ) {
    const admin = this.parseAdminContext(adminUserIdHeader, adminRoleHeader, [
      "admin",
      "support",
      "moderator",
    ]);
    const parsedLimit = this.parseLimit(limit);
    const intents = await this.prisma.intent.findMany({
      take: parsedLimit,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        userId: true,
        status: true,
        safetyState: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    await this.adminAuditService.recordAction({
      adminUserId: admin.adminUserId,
      role: admin.role,
      action: "admin.intents_list",
      entityType: "intent",
      metadata: {
        limit: parsedLimit,
      },
    });

    return ok(intents);
  }

  @Get("requests")
  async listRequests(
    @Headers("x-admin-user-id") adminUserIdHeader?: string,
    @Headers("x-admin-role") adminRoleHeader?: string,
    @Query("limit") limit?: string,
  ) {
    const admin = this.parseAdminContext(adminUserIdHeader, adminRoleHeader, [
      "admin",
      "support",
      "moderator",
    ]);
    const parsedLimit = this.parseLimit(limit);
    const requests = await this.prisma.intentRequest.findMany({
      take: parsedLimit,
      orderBy: { sentAt: "desc" },
      select: {
        id: true,
        intentId: true,
        senderUserId: true,
        recipientUserId: true,
        status: true,
        wave: true,
        sentAt: true,
        respondedAt: true,
        expiresAt: true,
      },
    });

    await this.adminAuditService.recordAction({
      adminUserId: admin.adminUserId,
      role: admin.role,
      action: "admin.requests_list",
      entityType: "intent_request",
      metadata: {
        limit: parsedLimit,
      },
    });

    return ok(requests);
  }

  @Get("connections")
  async listConnections(
    @Headers("x-admin-user-id") adminUserIdHeader?: string,
    @Headers("x-admin-role") adminRoleHeader?: string,
    @Query("limit") limit?: string,
  ) {
    const admin = this.parseAdminContext(adminUserIdHeader, adminRoleHeader, [
      "admin",
      "support",
      "moderator",
    ]);
    const parsedLimit = this.parseLimit(limit);
    const connections = await this.prisma.connection.findMany({
      take: parsedLimit,
      orderBy: { createdAt: "desc" },
      include: {
        participants: {
          select: {
            userId: true,
            role: true,
            joinedAt: true,
            leftAt: true,
          },
        },
        chats: {
          select: {
            id: true,
            type: true,
            createdAt: true,
          },
        },
      },
    });

    await this.adminAuditService.recordAction({
      adminUserId: admin.adminUserId,
      role: admin.role,
      action: "admin.connections_list",
      entityType: "connection",
      metadata: {
        limit: parsedLimit,
      },
    });

    return ok(connections);
  }

  @Get("chats")
  async listChats(
    @Headers("x-admin-user-id") adminUserIdHeader?: string,
    @Headers("x-admin-role") adminRoleHeader?: string,
    @Query("limit") limit?: string,
  ) {
    const admin = this.parseAdminContext(adminUserIdHeader, adminRoleHeader, [
      "admin",
      "support",
      "moderator",
    ]);
    const parsedLimit = this.parseLimit(limit);
    const chats = await this.prisma.chat.findMany({
      take: parsedLimit,
      orderBy: { createdAt: "desc" },
      include: {
        connection: {
          select: {
            id: true,
            type: true,
            status: true,
          },
        },
        _count: {
          select: {
            messages: true,
          },
        },
      },
    });

    await this.adminAuditService.recordAction({
      adminUserId: admin.adminUserId,
      role: admin.role,
      action: "admin.chats_list",
      entityType: "chat",
      metadata: {
        limit: parsedLimit,
      },
    });

    return ok(chats);
  }

  @Get("reports")
  async listReports(
    @Headers("x-admin-user-id") adminUserIdHeader?: string,
    @Headers("x-admin-role") adminRoleHeader?: string,
    @Query("limit") limit?: string,
  ) {
    const admin = this.parseAdminContext(adminUserIdHeader, adminRoleHeader, [
      "admin",
      "support",
      "moderator",
    ]);
    const parsedLimit = this.parseLimit(limit);
    const reports = await this.prisma.userReport.findMany({
      take: parsedLimit,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        reporterUserId: true,
        targetUserId: true,
        reason: true,
        details: true,
        status: true,
        createdAt: true,
      },
    });

    await this.adminAuditService.recordAction({
      adminUserId: admin.adminUserId,
      role: admin.role,
      action: "admin.reports_list",
      entityType: "user_report",
      metadata: {
        limit: parsedLimit,
      },
    });

    return ok(reports);
  }

  @Get("audit-logs")
  async auditLogs(
    @Headers("x-admin-user-id") adminUserIdHeader?: string,
    @Headers("x-admin-role") adminRoleHeader?: string,
    @Query("limit") limit?: string,
  ) {
    const admin = this.parseAdminContext(adminUserIdHeader, adminRoleHeader, [
      "admin",
      "support",
    ]);
    const parsedLimit = this.parseLimit(limit);
    await this.adminAuditService.recordAction({
      adminUserId: admin.adminUserId,
      role: admin.role,
      action: "admin.audit_log_list",
      entityType: "audit_log",
      metadata: {
        limit: parsedLimit,
      },
    });
    return ok(await this.adminAuditService.listAuditLogs(parsedLimit));
  }

  @Post("users/:userId/deactivate")
  async deactivateUser(
    @Param("userId") userIdParam: string,
    @Body() body: unknown,
    @Headers("x-admin-user-id") adminUserIdHeader?: string,
    @Headers("x-admin-role") adminRoleHeader?: string,
  ) {
    const admin = this.parseAdminContext(adminUserIdHeader, adminRoleHeader, [
      "admin",
      "support",
    ]);
    const userId = parseRequestPayload(uuidSchema, userIdParam);
    const payload = parseRequestPayload(adminUserActionBodySchema, body);

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        status: "suspended",
      },
      select: {
        id: true,
        status: true,
      },
    });
    const revokedSessions = await this.prisma.userSession.updateMany({
      where: {
        userId,
        status: "active",
      },
      data: {
        status: "revoked",
        revokedAt: new Date(),
      },
    });

    await this.adminAuditService.recordAction({
      adminUserId: admin.adminUserId,
      role: admin.role,
      action: "admin.user_deactivate",
      entityType: "user",
      entityId: userId,
      metadata: {
        reason: payload.reason ?? null,
        revokedSessionCount: revokedSessions.count,
      },
    });

    return ok({
      userId: user.id,
      status: user.status,
      revokedSessionCount: revokedSessions.count,
    });
  }

  @Post("users/:userId/restrict")
  async restrictUser(
    @Param("userId") userIdParam: string,
    @Body() body: unknown,
    @Headers("x-admin-user-id") adminUserIdHeader?: string,
    @Headers("x-admin-role") adminRoleHeader?: string,
  ) {
    const admin = this.parseAdminContext(adminUserIdHeader, adminRoleHeader, [
      "admin",
      "support",
      "moderator",
    ]);
    const userId = parseRequestPayload(uuidSchema, userIdParam);
    const payload = parseRequestPayload(adminUserActionBodySchema, body);

    const profile = await this.prisma.userProfile.upsert({
      where: { userId },
      create: {
        userId,
        moderationState: "blocked",
      },
      update: {
        moderationState: "blocked",
      },
      select: {
        userId: true,
        moderationState: true,
      },
    });

    await this.adminAuditService.recordAction({
      adminUserId: admin.adminUserId,
      role: admin.role,
      action: "admin.user_restrict",
      entityType: "user_profile",
      entityId: userId,
      metadata: {
        reason: payload.reason ?? null,
        moderationState: profile.moderationState,
      },
    });

    return ok({
      userId: profile.userId,
      moderationState: profile.moderationState,
    });
  }

  @Post("intents/:intentId/replay")
  async replayIntentWorkflow(
    @Param("intentId") intentIdParam: string,
    @Headers("x-admin-user-id") adminUserIdHeader?: string,
    @Headers("x-admin-role") adminRoleHeader?: string,
  ) {
    const admin = this.parseAdminContext(adminUserIdHeader, adminRoleHeader, [
      "admin",
      "support",
    ]);
    const intentId = parseRequestPayload(uuidSchema, intentIdParam);
    const traceId = randomUUID();
    const result = await this.intentsService.retryIntent(intentId, traceId);

    await this.adminAuditService.recordAction({
      adminUserId: admin.adminUserId,
      role: admin.role,
      action: "admin.intent_replay",
      entityType: "intent",
      entityId: intentId,
      metadata: {
        traceId,
      },
    });

    return ok({
      traceId,
      ...result,
    });
  }

  @Get("intents/:intentId/routing-explanations")
  async inspectRoutingExplanation(
    @Param("intentId") intentIdParam: string,
    @Headers("x-admin-user-id") adminUserIdHeader?: string,
    @Headers("x-admin-role") adminRoleHeader?: string,
  ) {
    const admin = this.parseAdminContext(adminUserIdHeader, adminRoleHeader, [
      "admin",
      "support",
      "moderator",
    ]);
    const intentId = parseRequestPayload(uuidSchema, intentIdParam);
    const explanation =
      await this.intentsService.listIntentExplanations(intentId);

    await this.adminAuditService.recordAction({
      adminUserId: admin.adminUserId,
      role: admin.role,
      action: "admin.intent_explanations_view",
      entityType: "intent",
      entityId: intentId,
    });

    return ok(explanation);
  }

  @Get("users/:userId/personalization/rules")
  async inspectPersonalizationRules(
    @Param("userId") userIdParam: string,
    @Headers("x-admin-user-id") adminUserIdHeader?: string,
    @Headers("x-admin-role") adminRoleHeader?: string,
  ) {
    const admin = this.parseAdminContext(adminUserIdHeader, adminRoleHeader, [
      "admin",
      "support",
    ]);
    const userId = parseRequestPayload(uuidSchema, userIdParam);
    const rules = await this.personalizationService.getGlobalRules(userId);

    await this.adminAuditService.recordAction({
      adminUserId: admin.adminUserId,
      role: admin.role,
      action: "admin.personalization_rules_view",
      entityType: "user",
      entityId: userId,
    });

    return ok(rules);
  }

  @Post("users/:userId/notifications/resend")
  async resendNotification(
    @Param("userId") userIdParam: string,
    @Body() body: unknown,
    @Headers("x-admin-user-id") adminUserIdHeader?: string,
    @Headers("x-admin-role") adminRoleHeader?: string,
  ) {
    const admin = this.parseAdminContext(adminUserIdHeader, adminRoleHeader, [
      "admin",
      "support",
    ]);
    const userId = parseRequestPayload(uuidSchema, userIdParam);
    const payload = parseRequestPayload(
      adminResendNotificationBodySchema,
      body,
    );
    const notification =
      await this.notificationsService.createInAppNotification(
        userId,
        payload.type,
        payload.body,
      );

    await this.adminAuditService.recordAction({
      adminUserId: admin.adminUserId,
      role: admin.role,
      action: "admin.notification_resend",
      entityType: "notification",
      entityId: notification.id,
      metadata: {
        recipientUserId: userId,
        notificationType: payload.type,
      },
    });

    return ok(notification);
  }

  @Post("chats/:chatId/repair")
  async repairChatFlow(
    @Param("chatId") chatIdParam: string,
    @Body() body: unknown,
    @Headers("x-admin-user-id") adminUserIdHeader?: string,
    @Headers("x-admin-role") adminRoleHeader?: string,
  ) {
    const admin = this.parseAdminContext(adminUserIdHeader, adminRoleHeader, [
      "admin",
      "support",
      "moderator",
    ]);
    const chatId = parseRequestPayload(uuidSchema, chatIdParam);
    const payload = parseRequestPayload(
      adminRepairChatFlowBodySchema,
      body ?? {},
    );
    const actorUserId = payload.actorUserId ?? admin.adminUserId;

    const [metadata, relayedOutbox] = await Promise.all([
      this.chatsService.getChatMetadata(chatId),
      this.outboxRelayService.relayPendingEvents(50),
    ]);
    const repairMarkerMessage = await this.chatsService.createSystemMessage(
      chatId,
      actorUserId,
      "system",
      "Admin repair action executed.",
      {
        idempotencyKey: `admin-chat-repair:${chatId}`,
      },
    );

    let syncPreview: unknown = null;
    if (payload.syncUserId) {
      try {
        syncPreview = await this.chatsService.listMessagesForSync(
          chatId,
          payload.syncUserId,
          25,
        );
      } catch {
        syncPreview = { error: "sync_preview_failed" };
      }
    }

    await this.adminAuditService.recordAction({
      adminUserId: admin.adminUserId,
      role: admin.role,
      action: "admin.chat_flow_repair",
      entityType: "chat",
      entityId: chatId,
      metadata: {
        actorUserId,
        syncUserId: payload.syncUserId ?? null,
        relayedCount: relayedOutbox.relayedCount,
      },
    });

    return ok({
      metadata,
      repairMarkerMessageId: repairMarkerMessage.id,
      relayedOutbox,
      syncPreview,
    });
  }

  private parseAdminContext(
    adminUserIdHeader: string | undefined,
    adminRoleHeader: string | undefined,
    allowedRoles: AdminRole[],
  ) {
    const adminUserId = parseRequestPayload(uuidSchema, adminUserIdHeader);
    const role = this.parseAdminRole(adminRoleHeader);
    if (!allowedRoles.includes(role)) {
      throw new ForbiddenException(
        "admin role is not permitted for this action",
      );
    }

    return {
      adminUserId,
      role,
    };
  }

  private parseAdminRole(roleHeader: string | undefined): AdminRole {
    if (
      roleHeader === "admin" ||
      roleHeader === "support" ||
      roleHeader === "moderator"
    ) {
      return roleHeader;
    }
    throw new ForbiddenException("admin role is required");
  }

  private parseLimit(limitValue: string | undefined) {
    if (!limitValue) {
      return 100;
    }
    const parsed = Number(limitValue);
    if (!Number.isFinite(parsed)) {
      throw new ForbiddenException("limit must be a number");
    }
    return Math.min(Math.max(Math.floor(parsed), 1), 250);
  }

  private parseThreshold(rawValue: string | undefined, fallback: number) {
    if (!rawValue) {
      return fallback;
    }
    const parsed = Number(rawValue);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return fallback;
    }
    return parsed;
  }

  private parseBooleanEnv(
    rawValue: string | undefined,
    fallback: boolean,
  ): boolean {
    if (!rawValue) {
      return fallback;
    }
    const normalized = rawValue.trim().toLowerCase();
    if (["1", "true", "yes", "on"].includes(normalized)) {
      return true;
    }
    if (["0", "false", "no", "off"].includes(normalized)) {
      return false;
    }
    return fallback;
  }

  private normalizeWindowHours(rawHours: string | undefined) {
    if (!rawHours) {
      return 24;
    }
    const parsed = Number(rawHours);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return 24;
    }
    return Math.min(Math.max(Math.floor(parsed), 1), 24 * 14);
  }

  private readJsonObject(
    value: Prisma.JsonValue | null | undefined,
  ): Record<string, unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return {};
    }
    return value as Record<string, unknown>;
  }

  private readString(value: unknown): string | null {
    return typeof value === "string" && value.trim().length > 0 ? value : null;
  }

  private buildAgentActionReplayHint(args: {
    status: string | null;
    tool: string | null;
    reason: string | null;
    checkpointStatus: string | null;
  }) {
    if (
      args.status === "denied" &&
      (args.reason === "human_approval_required" ||
        args.checkpointStatus === "pending")
    ) {
      return "Review the linked approval checkpoint before replaying this action.";
    }
    if (args.status === "failed") {
      return "Inspect related trace events, launch controls, and domain-service availability before replaying.";
    }
    if (args.status === "executed") {
      return "Action already executed. Review related trace events and downstream outcomes before replaying.";
    }
    if (args.tool?.startsWith("intro.")) {
      return "Re-run this intro path only after confirming consent, availability overlap, and matching filters.";
    }
    if (args.tool?.startsWith("circle.") || args.tool === "group.plan") {
      return "Verify group eligibility, current supply, and recent reconciliation events before replaying.";
    }
    return "Inspect the linked trace and user context before replaying this action.";
  }

  private async measureDbLatencyMs() {
    return this.databaseLatencyService.measureLatencyMs();
  }

  private getModerationSettingsSnapshot() {
    const provider = process.env.MODERATION_PROVIDER?.trim() || "openai";
    const agentRiskEnabled = this.parseBooleanEnv(
      process.env.MODERATION_AGENT_RISK_ENABLED,
      true,
    );
    const autoBlockTermsEnabled = this.parseBooleanEnv(
      process.env.MODERATION_AUTO_BLOCK_TERMS_ENABLED,
      true,
    );
    const strictMediaReview = this.parseBooleanEnv(
      process.env.MODERATION_STRICT_MEDIA_REVIEW_ENABLED,
      true,
    );
    const userReportsEnabled = this.parseBooleanEnv(
      process.env.MODERATION_USER_REPORTS_ENABLED,
      true,
    );

    return {
      provider,
      keys: {
        moderationProviderConfigured:
          Boolean(process.env.OPENAI_API_KEY) ||
          Boolean(process.env.MODERATION_PROVIDER_API_KEY),
        openaiConfigured: Boolean(process.env.OPENAI_API_KEY),
        customProviderConfigured: Boolean(
          process.env.MODERATION_PROVIDER_API_KEY,
        ),
      },
      toggles: {
        agentRiskEnabled,
        autoBlockTermsEnabled,
        strictMediaReview,
        userReportsEnabled,
      },
      thresholds: {
        moderationBacklogAlert: this.parseThreshold(
          process.env.ALERT_MODERATION_BACKLOG_THRESHOLD,
          150,
        ),
        dbLatencyAlertMs: this.parseThreshold(
          process.env.ALERT_DB_LATENCY_THRESHOLD_MS,
          500,
        ),
        openAiErrorRateAlert: this.parseThreshold(
          process.env.ALERT_OPENAI_ERROR_RATE_THRESHOLD,
          0.25,
        ),
      },
      policyModes: {
        agentBlockedDecisionLabel:
          process.env.MODERATION_AGENT_BLOCKED_LABEL ?? "blocked",
        agentReviewDecisionLabel:
          process.env.MODERATION_AGENT_REVIEW_LABEL ?? "review",
      },
      surfaces: {
        profilePhotos: strictMediaReview,
        chatMessages: agentRiskEnabled,
        intents: agentRiskEnabled,
        agentThreads: agentRiskEnabled,
      },
    };
  }

  private async getCachedOpsMetricCounts() {
    const cacheKey = "admin:ops:metrics:counts:v1";
    const cached = await this.appCacheService.getJson<{
      dbLatencyMs: number | null;
      totalUsers: number;
      reports24h: number;
      moderationFlags24h: number;
      blockedProfiles: number;
      pushSent24h: number;
      pushRead24h: number;
    }>(cacheKey);
    if (cached) {
      return cached;
    }

    const windowStart = new Date(Date.now() - 24 * 60 * 60_000);
    const [
      dbLatencyMs,
      totalUsers,
      reports24h,
      moderationFlags24h,
      blockedProfiles,
      pushSent24h,
      pushRead24h,
    ] = await Promise.all([
      this.measureDbLatencyMs(),
      this.prisma.user?.count ? this.prisma.user.count() : 0,
      this.prisma.userReport?.count
        ? this.prisma.userReport.count({
            where: { createdAt: { gte: windowStart } },
          })
        : 0,
      this.prisma.moderationFlag?.count
        ? this.prisma.moderationFlag.count({
            where: { createdAt: { gte: windowStart } },
          })
        : 0,
      this.prisma.userProfile?.count
        ? this.prisma.userProfile.count({
            where: { moderationState: "blocked" },
          })
        : 0,
      this.prisma.notification?.count
        ? this.prisma.notification.count({
            where: {
              channel: "push",
              createdAt: { gte: windowStart },
            },
          })
        : 0,
      this.prisma.notification?.count
        ? this.prisma.notification.count({
            where: {
              channel: "push",
              createdAt: { gte: windowStart },
              isRead: true,
            },
          })
        : 0,
    ]);

    const snapshot = {
      dbLatencyMs,
      totalUsers,
      reports24h,
      moderationFlags24h,
      blockedProfiles,
      pushSent24h,
      pushRead24h,
    };

    await this.appCacheService.setJson(cacheKey, snapshot, 15);
    return snapshot;
  }

  private async inspectQueue(queueName: string) {
    const queue = this.resolveQueue(queueName);
    if (!queue) {
      return {
        queue: queueName,
        available: false,
        counts: null,
        isPaused: null,
      };
    }

    try {
      const [counts, isPaused] = await Promise.all([
        queue.getJobCounts(
          "waiting",
          "active",
          "delayed",
          "completed",
          "failed",
          "paused",
          "prioritized",
          "waiting-children",
        ),
        queue.isPaused(),
      ]);
      return {
        queue: queueName,
        available: true,
        counts,
        isPaused,
      };
    } catch {
      return {
        queue: queueName,
        available: false,
        counts: null,
        isPaused: null,
      };
    }
  }

  private resolveQueue(queueName: string): Queue | null {
    try {
      return this.moduleRef.get<Queue>(getQueueToken(queueName), {
        strict: false,
      });
    } catch {
      return null;
    }
  }
}
