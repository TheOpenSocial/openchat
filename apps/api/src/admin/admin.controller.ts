import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  Logger,
  NotFoundException,
  Optional,
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
  adminModerationDecisionReviewBodySchema,
  adminMemoryInspectionQuerySchema,
  adminMemoryRetrievalPreviewBodySchema,
  adminModerationQueueQuerySchema,
  adminVerificationRunIngestBodySchema,
  adminVerificationRunListQuerySchema,
  adminRepairChatFlowBodySchema,
  adminResendNotificationBodySchema,
  adminUserActionBodySchema,
  uuidSchema,
} from "@opensocial/types";
import type { Queue } from "bullmq";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { Prisma } from "@prisma/client";
import { ChatsService } from "../chats/chats.service.js";
import { AppCacheService } from "../common/app-cache.service.js";
import { ok } from "../common/api-response.js";
import { getOpsRuntimeMetricsSnapshot } from "../common/ops-metrics.js";
import { evaluateSecurityPosture } from "../common/security-posture.js";
import { parseRequestPayload } from "../common/validation.js";
import { AnalyticsService } from "../analytics/analytics.service.js";
import { AgentWorkflowRuntimeService } from "../database/agent-workflow-runtime.service.js";
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
import { AdminPlaygroundService } from "./admin-playground.service.js";

type VerificationRunRecord = {
  runId: string;
  lane: "suite" | "verification" | "prod-smoke";
  layer: string;
  status: "passed" | "failed" | "skipped";
  generatedAt: string;
  ingestedAt: string;
  canaryVerdict: "healthy" | "watch" | "critical";
  summary: Record<string, unknown> | null;
  artifact: Record<string, unknown> | null;
};

type ProtocolQueueHealthAppRow = {
  appId: string;
  appName: string | null;
  appStatus: string;
  queuedCount: number | bigint | string;
  retryingCount: number | bigint | string;
  deadLetteredCount: number | bigint | string;
  oldestQueuedAt: Date | string | null;
  oldestRetryingAt: Date | string | null;
  lastDeadLetteredAt: Date | string | null;
};

type ProtocolQueueHealthDeliveryRow = {
  deliveryId: string;
  appId: string;
  appName: string | null;
  subscriptionId: string;
  eventName: string;
  status: string;
  attemptCount: number | bigint | string;
  nextAttemptAt: Date | string | null;
  lastAttemptAt: Date | string | null;
  deliveredAt: Date | string | null;
  responseStatusCode: number | null;
  errorMessage: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
};

type ProtocolQueueHealthAttemptRow = {
  deliveryId: string;
  appId: string;
  appName: string | null;
  subscriptionId: string;
  outcome: string;
  attemptedAt: Date | string;
  responseStatusCode: number | null;
  errorCode: string | null;
  errorMessage: string | null;
  durationMs: number | null;
};

type ProtocolQueueHealthAttemptSummaryRow = {
  outcome: string;
  errorCode: string | null;
  count: number | bigint | string;
};

type ProtocolReplayCursorHealthRow = {
  appId: string;
  appName: string | null;
  appStatus: string;
  savedCursor: number | bigint | string;
  latestEventCursor: number | bigint | string;
  updatedAt: Date | string | null;
};

type ProtocolAuthHealthAppRow = {
  appId: string;
  appName: string | null;
  appStatus: string;
  issuedScopeCount: number | bigint | string;
  issuedCapabilityCount: number | bigint | string;
  activeGrantCount: number | bigint | string;
  revokedGrantCount: number | bigint | string;
  pendingConsentCount: number | bigint | string;
  approvedConsentCount: number | bigint | string;
  executableGrantCount: number | bigint | string;
  modeledOnlyGrantCount: number | bigint | string;
  recentAuthFailureCount: number | bigint | string;
};

type ProtocolAuthHealthFailureSummaryRow = {
  failureType: string;
  count: number | bigint | string;
};

type ProtocolAuthHealthRecentFailureRow = {
  appId: string | null;
  appName: string | null;
  createdAt: Date | string;
  payload: unknown;
};

type RequestPressureRecipientRow = {
  recipientUserId: string;
  pendingInboundCount: number | bigint | string;
  windowInboundCount: number | bigint | string;
  lastSentAt: Date | string | null;
};

type OpsRiskLevel = "healthy" | "watch" | "critical";

type ManualVerificationFinding = {
  id: string;
  level: OpsRiskLevel;
  area: "request_pressure" | "protocol_queue" | "protocol_auth";
  summary: string;
  detail: string;
};

type ManualVerificationNextAction = {
  id: string;
  label: string;
  endpoint: string;
  reason: string;
};

const DEFAULT_MAX_PENDING_INBOUND_REQUESTS_PER_RECIPIENT = 6;
const DEFAULT_MAX_DAILY_INBOUND_REQUESTS_PER_RECIPIENT = 12;

@PublicRoute()
@Controller("admin")
export class AdminController {
  private readonly logger = new Logger(AdminController.name);
  private static readonly VERIFICATION_RUN_CACHE_KEY =
    "ops:agent-verification-runs:v1";
  private static readonly VERIFICATION_RUN_CACHE_MAX_ITEMS = 200;

  private static readonly WORKFLOW_FAILURE_CLASSES = [
    "none",
    "llm_or_schema",
    "moderation_or_policy",
    "matching_or_negotiation",
    "queue_or_replay",
    "persistence_or_dedupe",
    "notification_or_followup",
    "latency_or_capacity",
    "observability_gap",
  ] as const;

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
    @Optional()
    private readonly workflowRuntimeService?: AgentWorkflowRuntimeService,
    @Optional()
    private readonly adminPlaygroundService?: AdminPlaygroundService,
  ) {}

  @Post("ops/smoke-session/exchange")
  async issueSmokeSessionWithApplicationCredentials(
    @Body() body: unknown,
    @Headers("x-application-key") applicationKeyHeader?: string,
    @Headers("x-application-token") applicationTokenHeader?: string,
  ) {
    if (process.env.SMOKE_SESSION_APPLICATION_ENABLED !== "true") {
      throw new ForbiddenException("application exchange is disabled");
    }
    if (!this.adminPlaygroundService) {
      throw new NotFoundException("playground service unavailable");
    }

    const expectedKey = process.env.SMOKE_SESSION_APPLICATION_KEY?.trim() ?? "";
    const expectedToken =
      process.env.SMOKE_SESSION_APPLICATION_TOKEN?.trim() ?? "";
    const providedKey = applicationKeyHeader?.trim() ?? "";
    const providedToken = applicationTokenHeader?.trim() ?? "";

    if (!expectedKey || !expectedToken) {
      throw new ForbiddenException(
        "application exchange credentials are not configured",
      );
    }
    if (
      !this.safeEqual(providedKey, expectedKey) ||
      !this.safeEqual(providedToken, expectedToken)
    ) {
      throw new ForbiddenException(
        "application exchange credentials are invalid",
      );
    }

    const adminUserId =
      process.env.PLAYGROUND_SMOKE_ADMIN_USER_ID?.trim() ??
      process.env.SMOKE_ADMIN_USER_ID?.trim() ??
      "11111111-1111-4111-8111-111111111111";
    const adminRoleRaw = process.env.PLAYGROUND_SMOKE_ADMIN_ROLE?.trim();
    const adminRole: AdminRole =
      adminRoleRaw === "support" || adminRoleRaw === "moderator"
        ? adminRoleRaw
        : "admin";

    const payload =
      body && typeof body === "object" && !Array.isArray(body)
        ? (body as Record<string, unknown>)
        : {};
    const laneId =
      typeof payload.laneId === "string" && payload.laneId.trim().length > 0
        ? payload.laneId.trim()
        : undefined;
    const smokeBaseUrl =
      typeof payload.smokeBaseUrl === "string" &&
      payload.smokeBaseUrl.trim().length > 0
        ? payload.smokeBaseUrl.trim()
        : undefined;
    const smokeUserId =
      typeof payload.smokeUserId === "string" &&
      payload.smokeUserId.trim().length > 0
        ? payload.smokeUserId.trim()
        : undefined;

    const session = await this.adminPlaygroundService.bootstrap(
      {
        laneId,
        smokeBaseUrl,
        smokeUserId,
      },
      {
        adminUserId,
        role: adminRole,
      },
    );

    return ok(session);
  }
  @Post("ops/smoke-session")
  async issueSmokeSession(
    @Body() body: unknown,
    @Headers("x-admin-user-id") adminUserIdHeader?: string,
    @Headers("x-admin-role") adminRoleHeader?: string,
  ) {
    const admin = this.parseAdminContext(adminUserIdHeader, adminRoleHeader, [
      "admin",
    ]);
    const payload =
      body && typeof body === "object" && !Array.isArray(body)
        ? (body as Record<string, unknown>)
        : {};
    const laneId =
      typeof payload.laneId === "string" && payload.laneId.trim().length > 0
        ? payload.laneId.trim()
        : undefined;
    const smokeBaseUrl =
      typeof payload.smokeBaseUrl === "string" &&
      payload.smokeBaseUrl.trim().length > 0
        ? payload.smokeBaseUrl.trim()
        : undefined;
    const smokeUserId =
      typeof payload.smokeUserId === "string" &&
      payload.smokeUserId.trim().length > 0
        ? payload.smokeUserId.trim()
        : undefined;

    if (!this.adminPlaygroundService) {
      throw new NotFoundException("playground service unavailable");
    }

    const session = await this.adminPlaygroundService.bootstrap(
      {
        laneId,
        smokeBaseUrl,
        smokeUserId,
      },
      admin,
    );

    return ok(session);
  }

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
    const queueDepthSnapshot = await Promise.all(
      JOB_QUEUE_NAMES.map((queueName) => this.inspectQueue(queueName)),
    );

    const moderationIncidentRatePer100Users =
      counts.totalUsers === 0
        ? 0
        : ((counts.reports24h + counts.moderationFlags24h) /
            counts.totalUsers) *
          100;
    const pushReadRate24h =
      counts.pushSent24h === 0 ? 0 : counts.pushRead24h / counts.pushSent24h;
    const moderationOverturnRate24h =
      counts.moderationFlags24h === 0
        ? 0
        : counts.moderationDecisionReviews24h / counts.moderationFlags24h;

    await this.adminAuditService.recordAction({
      adminUserId: admin.adminUserId,
      role: admin.role,
      action: "admin.ops_metrics_view",
      entityType: "ops_metrics",
      metadata: {
        queueCount: runtime.queues.length,
        queueDepthSnapshotCount: queueDepthSnapshot.length,
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
      queueDepth: queueDepthSnapshot.map((entry) => ({
        queue: entry.queue,
        available: entry.available,
        waiting: entry.counts?.waiting ?? 0,
        active: entry.counts?.active ?? 0,
        delayed: entry.counts?.delayed ?? 0,
        failed: entry.counts?.failed ?? 0,
      })),
      dbLatency: {
        pingMs: counts.dbLatencyMs,
      },
      openaiLatencyCost: runtime.openai,
      openaiBudget: getOpenAIBudgetGuardrailSnapshot(),
      moderationRuntime: runtime.moderation,
      moderationRates: {
        reports24h: counts.reports24h,
        moderationFlags24h: counts.moderationFlags24h,
        moderationDecisionReviews24h: counts.moderationDecisionReviews24h,
        blockedProfiles: counts.blockedProfiles,
        incidentRatePer100Users: moderationIncidentRatePer100Users,
        overturnRate24h: moderationOverturnRate24h,
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

  @Get("ops/llm-runtime-health")
  async llmRuntimeHealth(
    @Headers("x-admin-user-id") adminUserIdHeader?: string,
    @Headers("x-admin-role") adminRoleHeader?: string,
  ) {
    const admin = this.parseAdminContext(adminUserIdHeader, adminRoleHeader, [
      "admin",
      "support",
      "moderator",
    ]);
    const runtime = getOpsRuntimeMetricsSnapshot();
    const openaiBudget = getOpenAIBudgetGuardrailSnapshot();
    const onboardingRich = runtime.onboardingInference.byMode.find(
      (entry) => entry.mode === "rich",
    );
    const onboardingFast = runtime.onboardingInference.byMode.find(
      (entry) => entry.mode === "fast",
    );

    await this.adminAuditService.recordAction({
      adminUserId: admin.adminUserId,
      role: admin.role,
      action: "admin.ops_llm_runtime_health_view",
      entityType: "ops_llm_runtime_health",
    });

    return ok({
      generatedAt: new Date().toISOString(),
      onboarding: {
        calls: runtime.onboardingInference.calls,
        fallbackRate: runtime.onboardingInference.fallbackRate,
        unavailableRate: runtime.onboardingInference.unavailableRate,
        p95LatencyMs: runtime.onboardingInference.latencyMs.p95Ms,
        byMode: {
          fast: onboardingFast ?? null,
          rich: onboardingRich ?? null,
        },
      },
      openai: {
        calls: runtime.openai.calls,
        errorRate: runtime.openai.errorRate,
        avgLatencyMs: runtime.openai.avgLatencyMs,
        operations: runtime.openai.operations,
      },
      budget: {
        clientCount: openaiBudget.clientCount,
        anyCircuitOpen: openaiBudget.anyCircuitOpen,
        openCircuitCount: openaiBudget.openCircuitCount,
      },
    });
  }

  @Get("ops/memory/users/:userId/recent-writes")
  async recentMemoryWrites(
    @Param("userId") userIdParam: string,
    @Query() query: Record<string, unknown>,
    @Headers("x-admin-user-id") adminUserIdHeader?: string,
    @Headers("x-admin-role") adminRoleHeader?: string,
  ) {
    const admin = this.parseAdminContext(adminUserIdHeader, adminRoleHeader, [
      "admin",
      "support",
      "moderator",
    ]);
    const userId = parseRequestPayload(uuidSchema, userIdParam);
    const filters = parseRequestPayload(
      adminMemoryInspectionQuerySchema,
      query,
    );
    const extendedFilters = filters as typeof filters & {
      governanceTier?: "explicit_only" | "inferable" | "ephemeral";
      domain?:
        | "profile"
        | "preference"
        | "relationship"
        | "safety"
        | "commerce"
        | "interaction";
    };
    const timeline = await this.personalizationService.listMemoryTimeline(
      userId,
      {
        limit: filters.limit,
        memoryClass: filters.class,
        key: filters.key,
        state: filters.state,
        governanceTier: extendedFilters.governanceTier,
        sourceSurface: filters.sourceSurface,
        domain: extendedFilters.domain,
      },
    );
    const writes = await Promise.all(
      timeline.map((entry) => this.enrichMemoryWriteForAdmin(entry)),
    );
    await this.adminAuditService.recordAction({
      adminUserId: admin.adminUserId,
      role: admin.role,
      action: "admin.ops_memory_recent_writes_view",
      entityType: "memory",
      entityId: userId,
      metadata: extendedFilters,
    });
    return ok({
      userId,
      count: writes.length,
      writes,
    });
  }

  @Get("ops/memory/users/:userId/contradictions")
  async memoryContradictions(
    @Param("userId") userIdParam: string,
    @Query("limit") limitRaw: string | undefined,
    @Headers("x-admin-user-id") adminUserIdHeader?: string,
    @Headers("x-admin-role") adminRoleHeader?: string,
  ) {
    const admin = this.parseAdminContext(adminUserIdHeader, adminRoleHeader, [
      "admin",
      "support",
      "moderator",
    ]);
    const userId = parseRequestPayload(uuidSchema, userIdParam);
    const limit = Math.min(Math.max(Number(limitRaw ?? "25") || 25, 1), 100);
    const contradictions =
      await this.personalizationService.listMemoryContradictions(userId, limit);
    const auditTrail = await this.personalizationService.listMemoryAuditTrail(
      userId,
      limit,
    );
    const contradictionEntries = await Promise.all(
      contradictions.map((entry) => this.enrichMemoryWriteForAdmin(entry)),
    );
    await this.adminAuditService.recordAction({
      adminUserId: admin.adminUserId,
      role: admin.role,
      action: "admin.ops_memory_contradictions_view",
      entityType: "memory",
      entityId: userId,
      metadata: { limit },
    });
    return ok({
      userId,
      contradictions: contradictionEntries,
      auditTrail,
    });
  }

  @Get("ops/memory/users/:userId/writes/:documentId")
  async memoryWriteDetails(
    @Param("userId") userIdParam: string,
    @Param("documentId") documentIdParam: string,
    @Query("auditLimit") auditLimitRaw: string | undefined,
    @Headers("x-admin-user-id") adminUserIdHeader?: string,
    @Headers("x-admin-role") adminRoleHeader?: string,
  ) {
    const admin = this.parseAdminContext(adminUserIdHeader, adminRoleHeader, [
      "admin",
      "support",
      "moderator",
    ]);
    const userId = parseRequestPayload(uuidSchema, userIdParam);
    const documentId = parseRequestPayload(uuidSchema, documentIdParam);
    const auditLimit = Math.min(
      Math.max(Number(auditLimitRaw ?? "20") || 20, 1),
      100,
    );
    const entry = await this.personalizationService.getMemoryRecord(
      userId,
      documentId,
    );
    if (!entry) {
      throw new NotFoundException("memory write not found");
    }
    const enriched = await this.enrichMemoryWriteForAdmin(entry);
    const auditTrail = await this.personalizationService.listMemoryAuditTrail(
      userId,
      auditLimit,
    );
    const retrievalCheck = await this.buildMemoryRetrievalCheck(
      userId,
      enriched,
    );
    const relatedAuditTrail = this.filterAuditTrailForMemory(
      auditTrail,
      enriched,
    );
    await this.adminAuditService.recordAction({
      adminUserId: admin.adminUserId,
      role: admin.role,
      action: "admin.ops_memory_write_details_view",
      entityType: "memory",
      entityId: userId,
      metadata: {
        documentId,
        auditLimit,
      },
    });
    return ok({
      userId,
      documentId,
      write: enriched,
      sourceLinks: enriched.explainability?.provenanceSummary ?? null,
      retrievalCheck,
      relatedAuditTrail,
    });
  }

  @Post("ops/memory/users/:userId/retrieval-preview")
  async previewMemoryRetrieval(
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
    const payload = parseRequestPayload(
      adminMemoryRetrievalPreviewBodySchema,
      body,
    );
    const preview =
      await this.personalizationService.retrievePersonalizationContext(
        userId,
        payload,
      );
    await this.adminAuditService.recordAction({
      adminUserId: admin.adminUserId,
      role: admin.role,
      action: "admin.ops_memory_retrieval_preview_view",
      entityType: "memory",
      entityId: userId,
      metadata: {
        query: payload.query,
        maxChunks: payload.maxChunks ?? null,
      },
    });
    return ok(preview);
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
    const degradedReadWarnings: string[] = [];
    const [
      dbLatencyMs,
      stalledJobCount,
      openModerationFlags,
      staleModerationFlags1h,
      staleModerationFlags24h,
      queueStates,
    ] = await Promise.all([
      this.measureDbLatencyMs(),
      this.prisma.auditLog?.count
        ? this.executeAdminReadWithSchemaFallback(
            "ops_alerts.audit_log_count",
            0,
            () =>
              this.prisma.auditLog.count({
                where: {
                  action: "queue.job_stalled",
                  createdAt: { gte: alertWindowStart },
                },
              }),
            degradedReadWarnings,
          )
        : 0,
      this.prisma.moderationFlag?.count
        ? this.executeAdminReadWithSchemaFallback(
            "ops_alerts.open_moderation_flag_count",
            0,
            () =>
              this.prisma.moderationFlag.count({
                where: { status: "open" },
              }),
            degradedReadWarnings,
          )
        : 0,
      this.prisma.moderationFlag?.count
        ? this.executeAdminReadWithSchemaFallback(
            "ops_alerts.stale_moderation_flags_1h",
            0,
            () =>
              this.prisma.moderationFlag.count({
                where: {
                  status: "open",
                  createdAt: { lt: new Date(Date.now() - 60 * 60_000) },
                },
              }),
            degradedReadWarnings,
          )
        : 0,
      this.prisma.moderationFlag?.count
        ? this.executeAdminReadWithSchemaFallback(
            "ops_alerts.stale_moderation_flags_24h",
            0,
            () =>
              this.prisma.moderationFlag.count({
                where: {
                  status: "open",
                  createdAt: { lt: new Date(Date.now() - 24 * 60 * 60_000) },
                },
              }),
            degradedReadWarnings,
          )
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
    const staleModerationBacklog1hThreshold = this.parseThreshold(
      process.env.ALERT_STALE_MODERATION_1H_THRESHOLD,
      25,
    );
    const staleModerationBacklog24hThreshold = this.parseThreshold(
      process.env.ALERT_STALE_MODERATION_24H_THRESHOLD,
      5,
    );
    const onboardingFallbackRateThreshold = this.parseThreshold(
      process.env.ALERT_ONBOARDING_FALLBACK_RATE_THRESHOLD,
      0.2,
    );
    const onboardingUnavailableRateThreshold = this.parseThreshold(
      process.env.ALERT_ONBOARDING_UNAVAILABLE_RATE_THRESHOLD,
      0.12,
    );
    const onboardingFastP95LatencyThresholdMs = this.parseThreshold(
      process.env.ALERT_ONBOARDING_FAST_P95_LATENCY_THRESHOLD_MS,
      4_000,
    );
    const onboardingRichP95LatencyThresholdMs = this.parseThreshold(
      process.env.ALERT_ONBOARDING_RICH_P95_LATENCY_THRESHOLD_MS,
      6_000,
    );
    const onboardingMinCallsThreshold = this.parseThreshold(
      process.env.ALERT_ONBOARDING_MIN_CALLS_THRESHOLD,
      10,
    );
    const onboardingActivationFailureRateThreshold = this.parseThreshold(
      process.env.ALERT_ONBOARDING_ACTIVATION_FAILURE_RATE_THRESHOLD,
      0.25,
    );
    const onboardingActivationProcessingRateThreshold = this.parseThreshold(
      process.env.ALERT_ONBOARDING_ACTIVATION_PROCESSING_RATE_THRESHOLD,
      0.2,
    );
    const onboardingActivationMinStartedThreshold = this.parseThreshold(
      process.env.ALERT_ONBOARDING_ACTIVATION_MIN_STARTED_THRESHOLD,
      8,
    );

    const activationRows = this.prisma.clientMutation?.findMany
      ? await this.executeAdminReadWithSchemaFallback(
          "ops_alerts.onboarding_activation_rows",
          [] as Array<{
            status: string;
            createdAt: Date;
            updatedAt: Date;
          }>,
          () =>
            this.prisma.clientMutation.findMany({
              where: {
                scope: "intent.create_from_agent",
                idempotencyKey: {
                  startsWith: "onboarding-carryover:",
                },
                createdAt: {
                  gte: new Date(Date.now() - 24 * 60 * 60_000),
                },
              },
              select: {
                status: true,
                createdAt: true,
                updatedAt: true,
              },
              take: 5000,
            }),
          degradedReadWarnings,
        )
      : [];
    const onboardingActivationStarted = activationRows.length;
    const onboardingActivationFailed = activationRows.filter(
      (row) => row.status === "failed",
    ).length;
    const onboardingActivationProcessing = activationRows.filter(
      (row) => row.status === "processing",
    ).length;
    const onboardingActivationFailureRate =
      onboardingActivationStarted === 0
        ? 0
        : onboardingActivationFailed / onboardingActivationStarted;
    const onboardingActivationProcessingRate =
      onboardingActivationStarted === 0
        ? 0
        : onboardingActivationProcessing / onboardingActivationStarted;
    const onboardingActivationAvgCompletionSecondsThreshold =
      this.parseThreshold(
        process.env
          .ALERT_ONBOARDING_ACTIVATION_AVG_COMPLETION_SECONDS_THRESHOLD,
        8,
      );
    const onboardingActivationCompletionDurations = activationRows
      .filter((row) => row.status === "completed")
      .map((row) =>
        Math.max(0, (row.updatedAt.getTime() - row.createdAt.getTime()) / 1000),
      );
    const onboardingActivationAvgCompletionSeconds =
      onboardingActivationCompletionDurations.length === 0
        ? null
        : onboardingActivationCompletionDurations.reduce(
            (sum, current) => sum + current,
            0,
          ) / onboardingActivationCompletionDurations.length;

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
      ...(staleModerationFlags1h >= staleModerationBacklog1hThreshold
        ? [
            {
              key: "moderation_sla_1h_breach",
              status: "triggered" as const,
              severity: "warning" as const,
              message: `Open moderation flags older than 1 hour are high (${staleModerationFlags1h}).`,
              value: staleModerationFlags1h,
              threshold: staleModerationBacklog1hThreshold,
            },
          ]
        : []),
      ...(staleModerationFlags24h >= staleModerationBacklog24hThreshold
        ? [
            {
              key: "moderation_sla_24h_breach",
              status: "triggered" as const,
              severity: "critical" as const,
              message: `Open moderation flags older than 24 hours are high (${staleModerationFlags24h}).`,
              value: staleModerationFlags24h,
              threshold: staleModerationBacklog24hThreshold,
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
      ...(runtime.onboardingInference.calls >= onboardingMinCallsThreshold &&
      runtime.onboardingInference.unavailableRate >=
        onboardingUnavailableRateThreshold
        ? [
            {
              key: "onboarding_unavailable_spike",
              status: "triggered" as const,
              severity: "warning" as const,
              message: `Onboarding unavailable rate is elevated (${runtime.onboardingInference.unavailableRate.toFixed(2)} over ${runtime.onboardingInference.calls} calls).`,
              value: runtime.onboardingInference.unavailableRate,
              threshold: onboardingUnavailableRateThreshold,
              calls: runtime.onboardingInference.calls,
            },
          ]
        : []),
      ...runtime.onboardingInference.byMode
        .filter(
          (mode) =>
            mode.mode === "fast" &&
            mode.calls >= onboardingMinCallsThreshold &&
            mode.latencyMs.p95Ms >= onboardingFastP95LatencyThresholdMs,
        )
        .map((mode) => ({
          key: "onboarding_fast_latency_high",
          status: "triggered" as const,
          severity: "warning" as const,
          message: `Onboarding fast latency p95 is elevated (${Math.round(mode.latencyMs.p95Ms)}ms over ${mode.calls} calls).`,
          mode: mode.mode,
          value: mode.latencyMs.p95Ms,
          threshold: onboardingFastP95LatencyThresholdMs,
          calls: mode.calls,
        })),
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
      ...(onboardingActivationStarted >=
        onboardingActivationMinStartedThreshold &&
      onboardingActivationFailureRate >=
        onboardingActivationFailureRateThreshold
        ? [
            {
              key: "onboarding_activation_failure_high",
              status: "triggered" as const,
              severity: "warning" as const,
              message: `Onboarding activation failure rate is elevated (${onboardingActivationFailureRate.toFixed(2)} over ${onboardingActivationStarted} executions).`,
              value: onboardingActivationFailureRate,
              threshold: onboardingActivationFailureRateThreshold,
              started: onboardingActivationStarted,
              failed: onboardingActivationFailed,
            },
          ]
        : []),
      ...(onboardingActivationStarted >=
        onboardingActivationMinStartedThreshold &&
      onboardingActivationProcessingRate >=
        onboardingActivationProcessingRateThreshold
        ? [
            {
              key: "onboarding_activation_processing_high",
              status: "triggered" as const,
              severity: "warning" as const,
              message: `Onboarding activation processing rate is elevated (${onboardingActivationProcessingRate.toFixed(2)} over ${onboardingActivationStarted} executions).`,
              value: onboardingActivationProcessingRate,
              threshold: onboardingActivationProcessingRateThreshold,
              started: onboardingActivationStarted,
              processing: onboardingActivationProcessing,
            },
          ]
        : []),
      ...(onboardingActivationStarted >=
        onboardingActivationMinStartedThreshold &&
      onboardingActivationAvgCompletionSeconds != null &&
      onboardingActivationAvgCompletionSeconds >=
        onboardingActivationAvgCompletionSecondsThreshold
        ? [
            {
              key: "onboarding_activation_latency_high",
              status: "triggered" as const,
              severity: "warning" as const,
              message: `Onboarding activation completion latency is elevated (${Math.round(onboardingActivationAvgCompletionSeconds)}s average).`,
              value: onboardingActivationAvgCompletionSeconds,
              threshold: onboardingActivationAvgCompletionSecondsThreshold,
              started: onboardingActivationStarted,
            },
          ]
        : []),
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
      degradedReadWarnings,
      summary: {
        status: alerts.length === 0 ? "healthy" : "degraded",
        criticalCount,
        warningCount,
        onboardingActivation: {
          started: onboardingActivationStarted,
          failureRate: onboardingActivationFailureRate,
          processingRate: onboardingActivationProcessingRate,
          avgCompletionSeconds: onboardingActivationAvgCompletionSeconds,
        },
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
        traceGradeStatus:
          typeof snapshot.traceGrade?.status === "string"
            ? snapshot.traceGrade.status
            : null,
        regressionCount: Array.isArray(snapshot.regressions)
          ? snapshot.regressions.length
          : 0,
      },
    });

    return ok(snapshot);
  }

  @Post("ops/verification-runs")
  async ingestVerificationRun(
    @Body() body: unknown,
    @Headers("x-admin-user-id") adminUserIdHeader?: string,
    @Headers("x-admin-role") adminRoleHeader?: string,
  ) {
    const admin = this.parseAdminContext(adminUserIdHeader, adminRoleHeader, [
      "admin",
      "support",
      "moderator",
    ]);
    const payload = parseRequestPayload(
      adminVerificationRunIngestBodySchema,
      body ?? {},
    );
    const generatedAt = payload.generatedAt ?? new Date().toISOString();
    const ingestedAt = new Date().toISOString();
    const canaryVerdict =
      payload.canaryVerdict ??
      this.resolveVerificationRunCanaryVerdict(payload.status);
    const existingRuns = await this.readVerificationRuns();
    const runRecord: VerificationRunRecord = {
      runId: payload.runId,
      lane: payload.lane as VerificationRunRecord["lane"],
      layer: payload.layer,
      status: payload.status as VerificationRunRecord["status"],
      generatedAt,
      ingestedAt,
      canaryVerdict: canaryVerdict as VerificationRunRecord["canaryVerdict"],
      summary:
        payload.summary &&
        typeof payload.summary === "object" &&
        !Array.isArray(payload.summary)
          ? payload.summary
          : null,
      artifact:
        payload.artifact &&
        typeof payload.artifact === "object" &&
        !Array.isArray(payload.artifact)
          ? payload.artifact
          : null,
    };
    const nextRuns: VerificationRunRecord[] = [
      runRecord,
      ...existingRuns.filter(
        (run) => !(run.runId === payload.runId && run.lane === payload.lane),
      ),
    ]
      .sort((left, right) => right.generatedAt.localeCompare(left.generatedAt))
      .slice(0, AdminController.VERIFICATION_RUN_CACHE_MAX_ITEMS);
    await this.writeVerificationRuns(nextRuns);

    await this.adminAuditService.recordAction({
      adminUserId: admin.adminUserId,
      role: admin.role,
      action: "admin.ops_verification_run_ingest",
      entityType: "ops_verification_run",
      entityId: payload.runId,
      metadata: {
        lane: payload.lane,
        layer: payload.layer,
        status: payload.status,
        canaryVerdict,
      },
    });

    return ok({
      stored: runRecord,
      totalRuns: nextRuns.length,
    });
  }

  @Get("ops/verification-runs")
  async opsVerificationRuns(
    @Headers("x-admin-user-id") adminUserIdHeader?: string,
    @Headers("x-admin-role") adminRoleHeader?: string,
    @Query("limit") limitParam?: string,
    @Query("lane") laneParam?: string,
    @Query("status") statusParam?: string,
  ) {
    const admin = this.parseAdminContext(adminUserIdHeader, adminRoleHeader, [
      "admin",
      "support",
      "moderator",
    ]);
    const query = parseRequestPayload(adminVerificationRunListQuerySchema, {
      limit: limitParam,
      lane: laneParam,
      status: statusParam,
    });
    const limit = query.limit ?? 20;
    const allRuns = await this.readVerificationRuns();
    const filteredRuns = allRuns.filter((run) => {
      if (query.lane && run.lane !== query.lane) {
        return false;
      }
      if (query.status && run.status !== query.status) {
        return false;
      }
      return true;
    });
    const runs = filteredRuns.slice(0, limit);
    const byStatus = {
      passed: runs.filter((run) => run.status === "passed").length,
      failed: runs.filter((run) => run.status === "failed").length,
      skipped: runs.filter((run) => run.status === "skipped").length,
    };
    const byLane = {
      suite: runs.filter((run) => run.lane === "suite").length,
      verification: runs.filter((run) => run.lane === "verification").length,
      prodSmoke: runs.filter((run) => run.lane === "prod-smoke").length,
    };
    const latestByLane = {
      suite: filteredRuns.find((run) => run.lane === "suite") ?? null,
      verification:
        filteredRuns.find((run) => run.lane === "verification") ?? null,
      prodSmoke: filteredRuns.find((run) => run.lane === "prod-smoke") ?? null,
    };
    const explainability = this.buildVerificationRunsExplainability({
      runs,
      filteredRuns,
      latestByLane,
      query: {
        lane: query.lane ?? null,
        status: query.status ?? null,
      },
    });

    await this.adminAuditService.recordAction({
      adminUserId: admin.adminUserId,
      role: admin.role,
      action: "admin.ops_verification_runs_view",
      entityType: "ops_verification_run",
      metadata: {
        totalRuns: runs.length,
        availableRuns: filteredRuns.length,
        lane: query.lane ?? null,
        status: query.status ?? null,
      },
    });

    return ok({
      generatedAt: new Date().toISOString(),
      summary: {
        totalRuns: runs.length,
        availableRuns: filteredRuns.length,
        byStatus,
        byLane,
        latestByLane,
      },
      explainability,
      runs,
    });
  }

  @Get("ops/agent-reliability")
  async opsAgentReliability(
    @Headers("x-admin-user-id") adminUserIdHeader?: string,
    @Headers("x-admin-role") adminRoleHeader?: string,
    @Query("workflowLimit") workflowLimitParam?: string,
    @Query("verificationLimit") verificationLimitParam?: string,
  ) {
    const admin = this.parseAdminContext(adminUserIdHeader, adminRoleHeader, [
      "admin",
      "support",
      "moderator",
    ]);
    const workflowLimit = this.normalizeOpsLimit(workflowLimitParam, 25, 100);
    const verificationLimit = this.normalizeOpsLimit(
      verificationLimitParam,
      10,
      50,
    );
    const runs =
      (await this.workflowRuntimeService?.listRecentRuns(workflowLimit)) ?? [];
    const enrichedRuns = runs
      .map((run) => this.enrichWorkflowRun(run))
      .map((run) => this.addWorkflowTriage(run));
    const stageStatusCounts = {
      started: 0,
      completed: 0,
      skipped: 0,
      blocked: 0,
      degraded: 0,
      failed: 0,
      unknown: 0,
    };
    for (const run of enrichedRuns) {
      stageStatusCounts.started += run.stageStatusCounts.started;
      stageStatusCounts.completed += run.stageStatusCounts.completed;
      stageStatusCounts.skipped += run.stageStatusCounts.skipped;
      stageStatusCounts.blocked += run.stageStatusCounts.blocked;
      stageStatusCounts.degraded += run.stageStatusCounts.degraded;
      stageStatusCounts.failed += run.stageStatusCounts.failed;
      stageStatusCounts.unknown += run.stageStatusCounts.unknown;
    }
    const failureClasses = {
      none: 0,
      llmOrSchema: 0,
      moderationOrPolicy: 0,
      matchingOrNegotiation: 0,
      queueOrReplay: 0,
      persistenceOrDedupe: 0,
      notificationOrFollowup: 0,
      latencyOrCapacity: 0,
      observabilityGap: 0,
    };
    for (const run of enrichedRuns) {
      const failureClass = this.classifyWorkflowFailure(run);
      if (failureClass === "none") {
        failureClasses.none += 1;
        continue;
      }
      if (failureClass === "llm_or_schema") {
        failureClasses.llmOrSchema += 1;
        continue;
      }
      if (failureClass === "moderation_or_policy") {
        failureClasses.moderationOrPolicy += 1;
        continue;
      }
      if (failureClass === "matching_or_negotiation") {
        failureClasses.matchingOrNegotiation += 1;
        continue;
      }
      if (failureClass === "queue_or_replay") {
        failureClasses.queueOrReplay += 1;
        continue;
      }
      if (failureClass === "persistence_or_dedupe") {
        failureClasses.persistenceOrDedupe += 1;
        continue;
      }
      if (failureClass === "notification_or_followup") {
        failureClasses.notificationOrFollowup += 1;
        continue;
      }
      if (failureClass === "latency_or_capacity") {
        failureClasses.latencyOrCapacity += 1;
        continue;
      }
      failureClasses.observabilityGap += 1;
    }
    const failureStageMap = new Map<
      string,
      {
        stage: string;
        status: "failed" | "blocked" | "degraded";
        count: number;
      }
    >();
    for (const run of enrichedRuns) {
      for (const stage of run.stages) {
        if (
          stage.status !== "failed" &&
          stage.status !== "blocked" &&
          stage.status !== "degraded"
        ) {
          continue;
        }
        const status = stage.status as "failed" | "blocked" | "degraded";
        const key = `${status}:${stage.stage}`;
        const current = failureStageMap.get(key);
        if (current) {
          current.count += 1;
          continue;
        }
        failureStageMap.set(key, {
          stage: stage.stage,
          status,
          count: 1,
        });
      }
    }
    const topFailureStages = Array.from(failureStageMap.values())
      .sort((left, right) => {
        if (right.count !== left.count) {
          return right.count - left.count;
        }
        if (left.status !== right.status) {
          return left.status.localeCompare(right.status);
        }
        return left.stage.localeCompare(right.stage);
      })
      .slice(0, 10);
    const workflowHealth = {
      healthy: enrichedRuns.filter((run) => run.health === "healthy").length,
      watch: enrichedRuns.filter((run) => run.health === "watch").length,
      critical: enrichedRuns.filter((run) => run.health === "critical").length,
    };
    const domainSignals = {
      datingConsentBlockedRuns: enrichedRuns.filter(
        (run) =>
          run.domain === "dating" &&
          run.stages.some(
            (stage) =>
              stage.stage === "dating_consent" && stage.status === "blocked",
          ),
      ).length,
      datingEligibilityBlockedRuns: enrichedRuns.filter(
        (run) =>
          run.domain === "dating" &&
          run.stages.some(
            (stage) =>
              stage.stage === "dating_eligibility" &&
              stage.status === "blocked",
          ),
      ).length,
      commerceEscrowFrozenRuns: enrichedRuns.filter(
        (run) =>
          run.domain === "commerce" &&
          run.stages.some(
            (stage) =>
              stage.stage === "commerce_escrow" &&
              (stage.summary ?? "").toLowerCase().includes("frozen"),
          ),
      ).length,
      commerceDisputeRuns: enrichedRuns.filter(
        (run) =>
          run.domain === "commerce" &&
          run.stages.some(
            (stage) =>
              stage.stage === "commerce_dispute" &&
              stage.status === "completed",
          ),
      ).length,
      commerceDedupedSideEffects: enrichedRuns.filter(
        (run) =>
          run.domain === "commerce" && run.integrity.dedupedSideEffectCount > 0,
      ).length,
    };
    const memorySignals = {
      memoryIngestionFailedRuns: enrichedRuns.filter((run) =>
        run.stages.some(
          (stage) =>
            stage.stage.toLowerCase().includes("memory") &&
            stage.status === "failed",
        ),
      ).length,
      memoryIngestionBlockedRuns: enrichedRuns.filter((run) =>
        run.stages.some(
          (stage) =>
            stage.stage.toLowerCase().includes("memory") &&
            stage.status === "blocked",
        ),
      ).length,
      memoryIngestionDegradedRuns: enrichedRuns.filter((run) =>
        run.stages.some(
          (stage) =>
            stage.stage.toLowerCase().includes("memory") &&
            stage.status === "degraded",
        ),
      ).length,
      memoryConflictRuns: enrichedRuns.filter((run) =>
        run.stages.some((stage) => {
          const normalized = stage.stage.toLowerCase();
          return (
            (normalized.includes("memory") &&
              (normalized.includes("contradiction") ||
                normalized.includes("conflict"))) ||
            (stage.summary ?? "").toLowerCase().includes("contradiction")
          );
        }),
      ).length,
    };

    const [evalSnapshot, verificationRuns] = await Promise.all([
      this.agenticEvalsService.runSnapshot(),
      this.readVerificationRuns(),
    ]);
    const recentVerificationRuns = verificationRuns.slice(0, verificationLimit);
    const latestVerificationRun = recentVerificationRuns[0] ?? null;
    const canary = this.resolveAgentReliabilityCanaryVerdict({
      evalStatus:
        typeof evalSnapshot.summary?.status === "string"
          ? evalSnapshot.summary.status
          : "watch",
      workflowHealth,
      latestVerificationRun,
    });
    const failureClassSummary = this.buildFailureClassSummary(failureClasses);
    const explainability = this.buildAgentReliabilityExplainability({
      workflowHealth,
      failureClassSummary,
      topFailureStages,
      latestVerificationRun,
      evalSnapshot,
      canaryVerdict: canary.verdict,
      memorySignals,
    });

    await this.adminAuditService.recordAction({
      adminUserId: admin.adminUserId,
      role: admin.role,
      action: "admin.ops_agent_reliability_view",
      entityType: "ops_agent_reliability",
      metadata: {
        workflowRunCount: enrichedRuns.length,
        verificationRunCount: verificationRuns.length,
        evalStatus: evalSnapshot.summary?.status ?? null,
        canaryVerdict: canary.verdict,
      },
    });

    return ok({
      generatedAt: new Date().toISOString(),
      workflow: {
        totalRuns: enrichedRuns.length,
        health: workflowHealth,
        failureClasses,
        failureClassSummary,
        stageStatusCounts,
        topFailureStages,
        domainSignals,
        memorySignals,
      },
      eval: {
        status: evalSnapshot.summary.status,
        passRate: evalSnapshot.summary.passRate,
        score: evalSnapshot.summary.score,
        regressionCount: evalSnapshot.summary.regressionCount,
        traceGrade: evalSnapshot.traceGrade,
        regressions: evalSnapshot.regressions,
        explainability:
          (evalSnapshot as { explainability?: unknown }).explainability ?? null,
      },
      verification: {
        totalRuns: verificationRuns.length,
        latest: latestVerificationRun,
        recentRuns: recentVerificationRuns,
      },
      canary,
      explainability,
    });
  }

  @Get("ops/agent-workflows")
  async opsAgentWorkflows(
    @Headers("x-admin-user-id") adminUserIdHeader?: string,
    @Headers("x-admin-role") adminRoleHeader?: string,
    @Query("limit") limitParam?: string,
    @Query("replayability") replayabilityParam?: string,
    @Query("domain") domainParam?: string,
    @Query("dedupeOnly") dedupeOnlyParam?: string,
    @Query("health") healthParam?: string,
    @Query("failureClass") failureClassParam?: string,
    @Query("failuresOnly") failuresOnlyParam?: string,
    @Query("suspectStage") suspectStageParam?: string,
  ) {
    const admin = this.parseAdminContext(adminUserIdHeader, adminRoleHeader, [
      "admin",
      "support",
      "moderator",
    ]);
    const limit = Number.parseInt(limitParam ?? "20", 10);
    const replayabilityFilter =
      this.parseReplayabilityFilter(replayabilityParam);
    const domainFilter = this.readString(domainParam);
    const dedupeOnly = this.parseOptionalBooleanQuery(dedupeOnlyParam);
    const healthFilter = this.parseWorkflowHealthFilter(healthParam);
    const failureClassFilter =
      this.parseWorkflowFailureClassFilter(failureClassParam);
    const failuresOnly = this.parseOptionalBooleanQuery(failuresOnlyParam);
    const suspectStageFilter =
      this.parseWorkflowSuspectStageFilter(suspectStageParam);
    const runs =
      (await this.workflowRuntimeService?.listRecentRuns(
        Number.isFinite(limit) ? limit : 20,
      )) ?? [];
    const enrichedRuns = runs.map((run) => this.enrichWorkflowRun(run));
    const filteredRuns = enrichedRuns.filter((run) => {
      if (replayabilityFilter && run.replayability !== replayabilityFilter) {
        return false;
      }
      if (domainFilter && run.domain !== domainFilter) {
        return false;
      }
      if (dedupeOnly === true && run.integrity.dedupedSideEffectCount === 0) {
        return false;
      }
      if (dedupeOnly === false && run.integrity.dedupedSideEffectCount > 0) {
        return false;
      }
      if (healthFilter && run.health !== healthFilter) {
        return false;
      }
      if (
        failureClassFilter &&
        this.classifyWorkflowFailure(run) !== failureClassFilter
      ) {
        return false;
      }
      if (failuresOnly === true && run.health === "healthy") {
        return false;
      }
      if (failuresOnly === false && run.health !== "healthy") {
        return false;
      }
      if (suspectStageFilter.length > 0) {
        const suspectStages = this.collectWorkflowSuspectStages(run.stages).map(
          (stage) => stage.toLowerCase(),
        );
        if (
          !suspectStageFilter.some((candidate) =>
            suspectStages.includes(candidate),
          )
        ) {
          return false;
        }
      }
      return true;
    });
    const stageStatusCounts = {
      started: 0,
      completed: 0,
      skipped: 0,
      blocked: 0,
      degraded: 0,
      failed: 0,
      unknown: 0,
    };
    for (const run of filteredRuns) {
      stageStatusCounts.started += run.stageStatusCounts.started;
      stageStatusCounts.completed += run.stageStatusCounts.completed;
      stageStatusCounts.skipped += run.stageStatusCounts.skipped;
      stageStatusCounts.blocked += run.stageStatusCounts.blocked;
      stageStatusCounts.degraded += run.stageStatusCounts.degraded;
      stageStatusCounts.failed += run.stageStatusCounts.failed;
      stageStatusCounts.unknown += run.stageStatusCounts.unknown;
    }

    await this.adminAuditService.recordAction({
      adminUserId: admin.adminUserId,
      role: admin.role,
      action: "admin.ops_agent_workflows_view",
      entityType: "ops_agent_workflows",
      metadata: {
        runCount: filteredRuns.length,
        unfilteredRunCount: enrichedRuns.length,
        replayabilityFilter,
        domainFilter,
        dedupeOnly,
        healthFilter,
        failureClassFilter,
        failuresOnly,
        suspectStageFilter:
          suspectStageFilter.length > 0 ? suspectStageFilter : null,
      },
    });

    const failureClasses = {
      none: 0,
      llmOrSchema: 0,
      moderationOrPolicy: 0,
      matchingOrNegotiation: 0,
      queueOrReplay: 0,
      persistenceOrDedupe: 0,
      notificationOrFollowup: 0,
      latencyOrCapacity: 0,
      observabilityGap: 0,
    };
    for (const run of filteredRuns) {
      const failureClass = this.classifyWorkflowFailure(run);
      if (failureClass === "none") {
        failureClasses.none += 1;
        continue;
      }
      if (failureClass === "llm_or_schema") {
        failureClasses.llmOrSchema += 1;
        continue;
      }
      if (failureClass === "moderation_or_policy") {
        failureClasses.moderationOrPolicy += 1;
        continue;
      }
      if (failureClass === "matching_or_negotiation") {
        failureClasses.matchingOrNegotiation += 1;
        continue;
      }
      if (failureClass === "queue_or_replay") {
        failureClasses.queueOrReplay += 1;
        continue;
      }
      if (failureClass === "persistence_or_dedupe") {
        failureClasses.persistenceOrDedupe += 1;
        continue;
      }
      if (failureClass === "notification_or_followup") {
        failureClasses.notificationOrFollowup += 1;
        continue;
      }
      if (failureClass === "latency_or_capacity") {
        failureClasses.latencyOrCapacity += 1;
        continue;
      }
      failureClasses.observabilityGap += 1;
    }
    const failureStageMap = new Map<
      string,
      {
        stage: string;
        status: "failed" | "blocked" | "degraded";
        count: number;
      }
    >();
    for (const run of filteredRuns) {
      for (const stage of run.stages) {
        if (
          stage.status !== "failed" &&
          stage.status !== "blocked" &&
          stage.status !== "degraded"
        ) {
          continue;
        }
        const status = stage.status as "failed" | "blocked" | "degraded";
        const key = `${status}:${stage.stage}`;
        const current = failureStageMap.get(key);
        if (current) {
          current.count += 1;
          continue;
        }
        failureStageMap.set(key, {
          stage: stage.stage,
          status,
          count: 1,
        });
      }
    }
    const topFailureStages = Array.from(failureStageMap.values())
      .sort((left, right) => {
        if (right.count !== left.count) {
          return right.count - left.count;
        }
        if (left.status !== right.status) {
          return left.status.localeCompare(right.status);
        }
        return left.stage.localeCompare(right.stage);
      })
      .slice(0, 10);
    const explainability = this.buildWorkflowListExplainability({
      filteredRuns,
      failureClasses,
      topFailureStages,
      stageStatusCounts,
    });

    return ok({
      generatedAt: new Date().toISOString(),
      summary: {
        totalRuns: filteredRuns.length,
        runsWithCompletedStages: filteredRuns.filter((run) =>
          run.stages.some((stage) => stage.status === "completed"),
        ).length,
        runsWithSideEffects: filteredRuns.filter(
          (run) => run.sideEffects.length > 0,
        ).length,
        replayability: {
          replayable: filteredRuns.filter(
            (run) => run.replayability === "replayable",
          ).length,
          partial: filteredRuns.filter((run) => run.replayability === "partial")
            .length,
          inspectOnly: filteredRuns.filter(
            (run) => run.replayability === "inspect_only",
          ).length,
        },
        runsWithDedupedSideEffects: filteredRuns.filter(
          (run) => run.integrity.dedupedSideEffectCount > 0,
        ).length,
        health: {
          healthy: filteredRuns.filter((run) => run.health === "healthy")
            .length,
          watch: filteredRuns.filter((run) => run.health === "watch").length,
          critical: filteredRuns.filter((run) => run.health === "critical")
            .length,
        },
        failureClasses,
        topFailureStages,
        stageStatusCounts,
      },
      explainability,
      runs: filteredRuns.map((run) => this.addWorkflowTriage(run)),
    });
  }

  @Get("ops/agent-workflows/details")
  async opsAgentWorkflowDetails(
    @Headers("x-admin-user-id") adminUserIdHeader?: string,
    @Headers("x-admin-role") adminRoleHeader?: string,
    @Query("workflowRunId") workflowRunIdParam?: string,
  ) {
    const admin = this.parseAdminContext(adminUserIdHeader, adminRoleHeader, [
      "admin",
      "support",
      "moderator",
    ]);
    const workflowRunId = workflowRunIdParam?.trim();
    if (!workflowRunId) {
      throw new BadRequestException("workflowRunId is required");
    }

    const details =
      (await this.workflowRuntimeService?.getRunDetails(workflowRunId)) ?? null;
    if (!details) {
      throw new NotFoundException("workflow run not found");
    }

    await this.adminAuditService.recordAction({
      adminUserId: admin.adminUserId,
      role: admin.role,
      action: "admin.ops_agent_workflow_detail_view",
      entityType: "ops_agent_workflows",
      entityId: workflowRunId,
      metadata: {
        traceId: details.run.traceId,
        stageCount: details.run.stages.length,
        sideEffectCount: details.run.sideEffects.length,
        traceEventCount: details.trace.eventCount,
        health: this.enrichWorkflowRun(details.run).health,
        failureClass: this.classifyWorkflowFailure(
          this.enrichWorkflowRun(details.run),
        ),
      },
    });

    const enrichedInsights = this.addWorkflowTriage(
      this.enrichWorkflowRun(details.run),
    );
    return ok({
      generatedAt: new Date().toISOString(),
      ...details,
      insights: enrichedInsights,
    });
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

    return ok({
      ...snapshot,
      explainability: this.buildAgentOutcomesExplainability(snapshot),
    });
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

    const items = normalizedRows.map((row) => {
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
    });
    const explainability = this.buildAgentActionsExplainability({
      filters: {
        limit,
        tool: payload.tool ?? null,
        status: payload.status ?? null,
        actorUserId: payload.actorUserId ?? null,
        threadId: payload.threadId ?? null,
        traceId: payload.traceId ?? null,
      },
      items,
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
      explainability,
      items,
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

  @Post("maintenance/moderation-retention")
  async runModerationRetentionCleanup(
    @Headers("x-admin-user-id") adminUserIdHeader?: string,
    @Headers("x-admin-role") adminRoleHeader?: string,
  ) {
    const admin = this.parseAdminContext(adminUserIdHeader, adminRoleHeader, [
      "admin",
      "support",
    ]);
    const queue = this.resolveQueue("cleanup");
    if (!queue) {
      throw new NotFoundException("cleanup queue unavailable");
    }
    const retentionDays = Number.parseInt(
      process.env.MODERATION_DECISION_RETENTION_DAYS ?? "180",
      10,
    );
    const idempotencyKey = `moderation-retention:${new Date().toISOString().slice(0, 10)}`;
    const job = await queue.add(
      "ModerationDecisionRetentionCleanup",
      {
        version: 1,
        traceId: randomUUID(),
        idempotencyKey,
        timestamp: new Date().toISOString(),
        retentionDays:
          Number.isFinite(retentionDays) && retentionDays >= 1
            ? retentionDays
            : 180,
      },
      {
        jobId: idempotencyKey,
        attempts: 2,
        removeOnComplete: 500,
      },
    );
    await this.adminAuditService.recordAction({
      adminUserId: admin.adminUserId,
      role: admin.role,
      action: "admin.moderation_retention_cleanup_enqueued",
      entityType: "moderation_decision",
      metadata: {
        queue: "cleanup",
        jobName: "ModerationDecisionRetentionCleanup",
        jobId: job.id ? String(job.id) : null,
      },
    });
    return ok({
      enqueued: true,
      queue: "cleanup",
      jobName: "ModerationDecisionRetentionCleanup",
      jobId: job.id ? String(job.id) : null,
    });
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

  @Get("ops/protocol-queue-health")
  async protocolQueueHealth(
    @Headers("x-admin-user-id") adminUserIdHeader?: string,
    @Headers("x-admin-role") adminRoleHeader?: string,
  ) {
    const admin = this.parseAdminContext(adminUserIdHeader, adminRoleHeader, [
      "admin",
      "support",
    ]);
    const snapshot = await this.readProtocolQueueHealthSnapshot();
    await this.adminAuditService.recordAction({
      adminUserId: admin.adminUserId,
      role: admin.role,
      action: "admin.ops_protocol_queue_health_view",
      entityType: "protocol_webhook_delivery",
      metadata: {
        appCount: snapshot.summary.appCount,
        queuedCount: snapshot.summary.queuedCount,
        retryingCount: snapshot.summary.retryingCount,
        deadLetteredCount: snapshot.summary.deadLetteredCount,
        replayableCount: snapshot.summary.replayableCount,
      },
    });
    return ok(snapshot);
  }

  @Get("ops/request-pressure")
  async requestPressureSnapshot(
    @Headers("x-admin-user-id") adminUserIdHeader?: string,
    @Headers("x-admin-role") adminRoleHeader?: string,
    @Query("limit") limitParam?: string,
    @Query("hours") hoursParam?: string,
  ) {
    const admin = this.parseAdminContext(adminUserIdHeader, adminRoleHeader, [
      "admin",
      "support",
      "moderator",
    ]);
    const limit = this.parseLimit(limitParam);
    const hours = this.normalizeWindowHours(hoursParam);
    const snapshot = await this.readRequestPressureSnapshot({ limit, hours });

    await this.adminAuditService.recordAction({
      adminUserId: admin.adminUserId,
      role: admin.role,
      action: "admin.ops_request_pressure_view",
      entityType: "intent_request",
      metadata: {
        limit,
        hours,
        overloadedRecipientCount: snapshot.summary.overloadedRecipientCount,
        nearCapacityRecipientCount: snapshot.summary.nearCapacityRecipientCount,
        totalPendingInboundCount: snapshot.summary.totalPendingInboundCount,
        totalWindowInboundCount: snapshot.summary.totalWindowInboundCount,
      },
    });

    return ok(snapshot);
  }

  @Get("ops/protocol-auth-health")
  async protocolAuthHealth(
    @Headers("x-admin-user-id") adminUserIdHeader?: string,
    @Headers("x-admin-role") adminRoleHeader?: string,
  ) {
    const admin = this.parseAdminContext(adminUserIdHeader, adminRoleHeader, [
      "admin",
      "support",
    ]);
    const snapshot = await this.readProtocolAuthHealthSnapshot();
    await this.adminAuditService.recordAction({
      adminUserId: admin.adminUserId,
      role: admin.role,
      action: "admin.ops_protocol_auth_health_view",
      entityType: "protocol_app",
      metadata: {
        appCount: snapshot.summary.appCount,
        activeGrantCount: snapshot.summary.activeGrantCount,
        pendingConsentCount: snapshot.summary.pendingConsentCount,
        recentAuthFailureCount: snapshot.summary.recentAuthFailureCount,
        executableDelegationAppCount: snapshot.summary.executableDelegationAppCount,
        modeledOnlyDelegationAppCount: snapshot.summary.modeledOnlyDelegationAppCount,
      },
    });
    return ok(snapshot);
  }

  @Get("ops/manual-verification")
  async manualVerificationSnapshot(
    @Headers("x-admin-user-id") adminUserIdHeader?: string,
    @Headers("x-admin-role") adminRoleHeader?: string,
    @Query("limit") limitParam?: string,
    @Query("hours") hoursParam?: string,
  ) {
    const admin = this.parseAdminContext(adminUserIdHeader, adminRoleHeader, [
      "admin",
      "support",
      "moderator",
    ]);
    const limit = this.parseLimit(limitParam);
    const hours = this.normalizeWindowHours(hoursParam);
    const [requestPressure, protocolQueueHealth, protocolAuthHealth] =
      await Promise.all([
        this.readRequestPressureSnapshot({ limit, hours }),
        this.readProtocolQueueHealthSnapshot(),
        this.readProtocolAuthHealthSnapshot(),
      ]);

    await this.adminAuditService.recordAction({
      adminUserId: admin.adminUserId,
      role: admin.role,
      action: "admin.ops_manual_verification_view",
      entityType: "protocol_app",
      metadata: {
        limit,
        hours,
        overloadedRecipientCount:
          requestPressure.summary.overloadedRecipientCount,
        queuedCount: protocolQueueHealth.summary.queuedCount,
        deadLetteredCount: protocolQueueHealth.summary.deadLetteredCount,
        pendingConsentCount: protocolAuthHealth.summary.pendingConsentCount,
        recentAuthFailureCount:
          protocolAuthHealth.summary.recentAuthFailureCount,
      },
    });

    const assessment = this.buildManualVerificationAssessment({
      limit,
      hours,
      requestPressure,
      protocolQueueHealth,
      protocolAuthHealth,
    });

    return ok({
      generatedAt: new Date().toISOString(),
      assessment,
      requestPressure,
      protocolQueueHealth,
      protocolAuthHealth,
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
    const queue = await this.adminAuditService.listModerationQueue({
      limit: parsedLimit,
      status: payload.status,
      entityType: payload.entityType,
      reasonContains: payload.reasonContains,
    });
    const queueWithPriority = queue.map((flag) => {
      const ageMs = Date.now() - flag.createdAt.getTime();
      const slaBand = this.resolveModerationSlaBand(ageMs);
      return {
        ...flag,
        queuePriority: this.resolveModerationQueuePriority(
          flag.reason,
          slaBand,
        ),
        slaBand,
        ageMinutes: Math.max(0, Math.floor(ageMs / 60_000)),
      };
    });
    return ok(queueWithPriority);
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
    const degradedReadWarnings: string[] = [];

    const where = {
      entityType: "agent_thread",
      status: statusFilter,
      ...(payload.decision
        ? { reason: { contains: `_${payload.decision}:` } }
        : {}),
    };

    const { flags, totalMatching } =
      await this.executeAdminReadWithSchemaFallback(
        "moderation_agent_risk_flags.read",
        {
          flags: [] as Array<{
            id: string;
            entityType: string;
            entityId: string;
            reason: string;
            status: string;
            assigneeUserId: string | null;
            assignmentNote: string | null;
            assignedAt: Date | null;
            lastDecision: string | null;
            triageNote: string | null;
            triagedByAdminUserId: string | null;
            triagedAt: Date | null;
            createdAt: Date;
          }>,
          totalMatching: 0,
        },
        async () => {
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
          return { flags, totalMatching };
        },
        degradedReadWarnings,
      );

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
      degradedReadWarnings,
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
    let humanReviewResult: unknown = null;

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

    if (payload.decisionId) {
      const mappedAction =
        payload.humanReviewAction ??
        (payload.action === "resolve"
          ? "approve"
          : payload.action === "reopen"
            ? "escalate"
            : "reject");
      humanReviewResult = await this.moderationService.submitHumanReview({
        decisionId: payload.decisionId,
        action: mappedAction,
        reviewerUserId: admin.adminUserId,
        note: payload.reason,
      });
      if (!humanReviewResult) {
        throw new NotFoundException("moderation decision not found");
      }
    }

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
        decisionId: payload.decisionId ?? null,
        humanReviewAction: payload.humanReviewAction ?? null,
      },
    });

    return ok({
      flag: updatedFlag,
      action: payload.action,
      strikeResult,
      restrictionResult,
      humanReviewResult,
    });
  }

  @Post("moderation/decisions/:decisionId/review")
  async submitModerationDecisionReview(
    @Param("decisionId") decisionId: string,
    @Body() body: unknown,
    @Headers("x-admin-user-id") adminUserIdHeader?: string,
    @Headers("x-admin-role") adminRoleHeader?: string,
  ) {
    const admin = this.parseAdminContext(adminUserIdHeader, adminRoleHeader, [
      "admin",
      "support",
      "moderator",
    ]);
    const payload = parseRequestPayload(
      adminModerationDecisionReviewBodySchema,
      {
        ...(body && typeof body === "object" ? body : {}),
      },
    );
    const reviewed = await this.moderationService.submitHumanReview({
      decisionId: decisionId.trim(),
      action: payload.action,
      reviewerUserId: admin.adminUserId,
      note: payload.note,
    });
    if (!reviewed) {
      throw new NotFoundException("moderation decision not found");
    }

    await this.adminAuditService.recordAction({
      adminUserId: admin.adminUserId,
      role: admin.role,
      action: "admin.moderation_decision_review",
      entityType: "moderation_decision",
      entityId: decisionId.trim(),
      metadata: {
        action: payload.action,
        note: payload.note ?? null,
      },
    });

    return ok({
      action: payload.action,
      decision: reviewed,
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

  private normalizeOpsLimit(
    rawValue: string | undefined,
    fallback: number,
    max: number,
  ) {
    if (!rawValue) {
      return fallback;
    }
    const parsed = Number(rawValue);
    if (!Number.isFinite(parsed)) {
      return fallback;
    }
    return Math.min(Math.max(Math.floor(parsed), 1), max);
  }

  private resolveVerificationRunCanaryVerdict(
    status: "passed" | "failed" | "skipped",
  ) {
    if (status === "failed") {
      return "critical" as const;
    }
    if (status === "skipped") {
      return "watch" as const;
    }
    return "healthy" as const;
  }

  private resolveAgentReliabilityCanaryVerdict(input: {
    evalStatus: string;
    workflowHealth: {
      healthy: number;
      watch: number;
      critical: number;
    };
    latestVerificationRun: VerificationRunRecord | null;
  }) {
    const reasons: string[] = [];

    if (input.latestVerificationRun?.status === "failed") {
      reasons.push("latest verification lane failed");
    }
    if (input.latestVerificationRun?.canaryVerdict === "critical") {
      reasons.push("latest verification lane marked critical");
    }
    if (input.evalStatus === "critical") {
      reasons.push("eval snapshot is critical");
    }
    if (input.workflowHealth.critical > 0) {
      reasons.push("critical workflow runs detected");
    }
    if (reasons.length > 0) {
      return {
        verdict: "critical" as const,
        reasons,
      };
    }

    if (!input.latestVerificationRun) {
      reasons.push("no verification lane run has been ingested");
    }
    if (input.latestVerificationRun?.status === "skipped") {
      reasons.push("latest verification lane was skipped");
    }
    if (input.latestVerificationRun?.canaryVerdict === "watch") {
      reasons.push("latest verification lane marked watch");
    }
    if (input.evalStatus === "watch") {
      reasons.push("eval snapshot is watch");
    }
    if (input.workflowHealth.watch > 0) {
      reasons.push("watch-level workflow runs detected");
    }
    if (reasons.length > 0) {
      return {
        verdict: "watch" as const,
        reasons,
      };
    }

    return {
      verdict: "healthy" as const,
      reasons: ["eval, workflow, and verification signals are healthy"],
    };
  }

  private buildVerificationRunsExplainability(input: {
    runs: VerificationRunRecord[];
    filteredRuns: VerificationRunRecord[];
    latestByLane: {
      suite: VerificationRunRecord | null;
      verification: VerificationRunRecord | null;
      prodSmoke: VerificationRunRecord | null;
    };
    query: {
      lane: string | null;
      status: string | null;
    };
  }) {
    const latestProblemRun =
      input.filteredRuns.find(
        (run) =>
          run.status === "failed" ||
          run.canaryVerdict === "critical" ||
          run.status === "skipped" ||
          run.canaryVerdict === "watch",
      ) ?? null;
    const latestBlockedReasons = this.readStringArray(
      latestProblemRun?.summary?.blockedReasons ??
        latestProblemRun?.artifact?.blockedReasons,
    );
    const latestStepId = this.readString(latestProblemRun?.summary?.stepId);
    const laneCoverage = {
      suite: Boolean(input.latestByLane.suite),
      verification: Boolean(input.latestByLane.verification),
      prodSmoke: Boolean(input.latestByLane.prodSmoke),
    };
    const allLanesHealthy = Object.values(input.latestByLane).every(
      (run) =>
        run && run.status === "passed" && run.canaryVerdict === "healthy",
    );
    const summary =
      input.runs.length === 0
        ? "No verification runs have been ingested yet."
        : allLanesHealthy
          ? "Latest verification evidence is healthy across all lanes."
          : latestProblemRun
            ? `Latest risky verification signal is ${latestProblemRun.lane}:${latestProblemRun.status} (${latestProblemRun.canaryVerdict}).`
            : "Verification evidence exists but lane health is mixed.";

    const nextActions = [
      {
        id: "open_latest_verification_runs",
        label: "Inspect recent verification runs",
        endpoint: "/api/admin/ops/verification-runs?limit=10",
        reason:
          latestProblemRun?.status === "failed"
            ? "The latest risky verification run failed and should be reviewed first."
            : "Review the most recent verification evidence before rollout.",
      },
      {
        id: "open_failed_workflows",
        label: "Inspect non-healthy workflow runs",
        endpoint: "/api/admin/ops/agent-workflows?failuresOnly=true",
        reason:
          "Use workflow failures to confirm whether verification issues are runtime regressions or isolated drill failures.",
      },
    ];
    if (!laneCoverage.prodSmoke) {
      nextActions.push({
        id: "ingest_prod_smoke_lane",
        label: "Ingest prod-smoke evidence",
        endpoint: "/api/admin/ops/verification-runs?lane=prod-smoke",
        reason:
          "No prod-smoke run is present in admin evidence yet; canary confidence is incomplete.",
      });
    }

    return {
      summary,
      latestProblemRun: latestProblemRun
        ? {
            runId: latestProblemRun.runId,
            lane: latestProblemRun.lane,
            status: latestProblemRun.status,
            canaryVerdict: latestProblemRun.canaryVerdict,
            blockedReasons: latestBlockedReasons,
            stepId: latestStepId,
          }
        : null,
      laneCoverage,
      allLanesHealthy,
      nextActions,
      activeFilters: input.query,
    };
  }

  private async readVerificationRuns(): Promise<VerificationRunRecord[]> {
    const value = await this.appCacheService.getJson<unknown[]>(
      AdminController.VERIFICATION_RUN_CACHE_KEY,
    );
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .map((entry) => this.parseVerificationRunRecord(entry))
      .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
      .sort((left, right) => right.generatedAt.localeCompare(left.generatedAt))
      .slice(0, AdminController.VERIFICATION_RUN_CACHE_MAX_ITEMS);
  }

  private parseVerificationRunRecord(
    input: unknown,
  ): VerificationRunRecord | null {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      return null;
    }
    const row = input as Record<string, unknown>;
    const runId = this.readString(row.runId);
    const lane =
      row.lane === "suite" ||
      row.lane === "verification" ||
      row.lane === "prod-smoke"
        ? row.lane
        : null;
    const layer = this.readString(row.layer);
    const status =
      row.status === "passed" ||
      row.status === "failed" ||
      row.status === "skipped"
        ? row.status
        : null;
    const generatedAt = this.readString(row.generatedAt);
    const ingestedAt = this.readString(row.ingestedAt);
    const canaryVerdict =
      row.canaryVerdict === "healthy" ||
      row.canaryVerdict === "watch" ||
      row.canaryVerdict === "critical"
        ? row.canaryVerdict
        : null;
    const summary =
      row.summary &&
      typeof row.summary === "object" &&
      !Array.isArray(row.summary)
        ? (row.summary as Record<string, unknown>)
        : null;
    const artifact =
      row.artifact &&
      typeof row.artifact === "object" &&
      !Array.isArray(row.artifact)
        ? (row.artifact as Record<string, unknown>)
        : null;
    if (
      !runId ||
      !lane ||
      !layer ||
      !status ||
      !generatedAt ||
      !ingestedAt ||
      !canaryVerdict
    ) {
      return null;
    }
    return {
      runId,
      lane,
      layer,
      status,
      generatedAt,
      ingestedAt,
      canaryVerdict,
      summary,
      artifact,
    };
  }

  private async writeVerificationRuns(runs: VerificationRunRecord[]) {
    const ttlSeconds = Math.max(
      60,
      Math.floor(
        this.parseThreshold(
          process.env.ADMIN_VERIFICATION_RUN_TTL_SECONDS,
          60 * 60 * 24 * 14,
        ),
      ),
    );
    await this.appCacheService.setJson(
      AdminController.VERIFICATION_RUN_CACHE_KEY,
      runs.slice(0, AdminController.VERIFICATION_RUN_CACHE_MAX_ITEMS),
      ttlSeconds,
    );
  }

  private async readProtocolQueueHealthSnapshot() {
    const appRows = await this.prisma.$queryRawUnsafe<
      ProtocolQueueHealthAppRow[]
    >(
      `SELECT d.app_id AS "appId",
              MAX(COALESCE(pa.registration_json->>'name', d.app_id)) AS "appName",
              MAX(COALESCE(pa.status, 'unknown')) AS "appStatus",
              COUNT(*) FILTER (WHERE d.status = 'queued')::bigint AS "queuedCount",
              COUNT(*) FILTER (WHERE d.status = 'retrying')::bigint AS "retryingCount",
              COUNT(*) FILTER (WHERE d.status = 'dead_lettered')::bigint AS "deadLetteredCount",
              MIN(d.created_at) FILTER (WHERE d.status = 'queued') AS "oldestQueuedAt",
              MIN(d.updated_at) FILTER (WHERE d.status = 'retrying') AS "oldestRetryingAt",
              MAX(d.updated_at) FILTER (WHERE d.status = 'dead_lettered') AS "lastDeadLetteredAt"
       FROM protocol_webhook_deliveries d
       LEFT JOIN protocol_apps pa ON pa.app_id = d.app_id
       GROUP BY d.app_id
       ORDER BY COUNT(*) FILTER (WHERE d.status = 'dead_lettered') DESC,
                COUNT(*) FILTER (WHERE d.status = 'retrying') DESC,
                COUNT(*) FILTER (WHERE d.status = 'queued') DESC,
                d.app_id ASC`,
    );
    const deadLetterSampleRows = await this.prisma.$queryRawUnsafe<
      ProtocolQueueHealthDeliveryRow[]
    >(
      `SELECT d.delivery_id AS "deliveryId",
              d.app_id AS "appId",
              COALESCE(pa.registration_json->>'name', d.app_id) AS "appName",
              d.subscription_id AS "subscriptionId",
              d.event_name AS "eventName",
              d.status AS "status",
              d.attempt_count AS "attemptCount",
              d.next_attempt_at AS "nextAttemptAt",
              d.last_attempt_at AS "lastAttemptAt",
              d.delivered_at AS "deliveredAt",
              d.response_status_code AS "responseStatusCode",
              d.error_message AS "errorMessage",
              d.created_at AS "createdAt",
              d.updated_at AS "updatedAt"
       FROM protocol_webhook_deliveries d
       LEFT JOIN protocol_apps pa ON pa.app_id = d.app_id
       WHERE d.status = 'dead_lettered'
       ORDER BY d.updated_at DESC
       LIMIT 10`,
    );
    const recentAttemptRows = await this.prisma.$queryRawUnsafe<
      ProtocolQueueHealthAttemptRow[]
    >(
      `SELECT a.delivery_id AS "deliveryId",
              a.app_id AS "appId",
              COALESCE(pa.registration_json->>'name', a.app_id) AS "appName",
              a.subscription_id AS "subscriptionId",
              a.outcome AS "outcome",
              a.attempted_at AS "attemptedAt",
              a.response_status_code AS "responseStatusCode",
              a.error_code AS "errorCode",
              a.error_message AS "errorMessage",
              a.duration_ms AS "durationMs"
       FROM protocol_webhook_delivery_attempts a
       LEFT JOIN protocol_apps pa ON pa.app_id = a.app_id
       ORDER BY a.attempted_at DESC
       LIMIT 20`,
    );
    const attemptSummaryRows = await this.prisma.$queryRawUnsafe<
      ProtocolQueueHealthAttemptSummaryRow[]
    >(
      `SELECT outcome,
              error_code AS "errorCode",
              COUNT(*)::bigint AS count
       FROM protocol_webhook_delivery_attempts
       WHERE attempted_at >= NOW() - INTERVAL '24 hours'
       GROUP BY outcome, error_code
       ORDER BY COUNT(*) DESC, outcome ASC
       LIMIT 20`,
    );
    const replayCursorRows = await this.prisma.$queryRawUnsafe<
      ProtocolReplayCursorHealthRow[]
    >(
      `SELECT pa.app_id AS "appId",
              COALESCE(pa.registration_json->>'name', pa.app_id) AS "appName",
              pa.status AS "appStatus",
              COALESCE(pec.cursor, 0) AS "savedCursor",
              latest.latest_cursor AS "latestEventCursor",
              pec.updated_at AS "updatedAt"
       FROM protocol_apps pa
       CROSS JOIN (
         SELECT COALESCE(MAX(cursor), 0)::bigint AS latest_cursor
         FROM protocol_event_log
       ) latest
       LEFT JOIN protocol_event_cursors pec ON pec.app_id = pa.app_id
       ORDER BY (latest.latest_cursor - COALESCE(pec.cursor, 0)) DESC,
                pec.updated_at ASC NULLS FIRST,
                pa.app_id ASC
       LIMIT 50`,
    );

    const toIsoString = (value: Date | string | null | undefined) => {
      if (!value) {
        return null;
      }
      if (value instanceof Date) {
        return value.toISOString();
      }
      return value;
    };
    const now = Date.now();

    const apps = appRows.map((row) => ({
      appId: row.appId,
      appName: row.appName,
      appStatus: row.appStatus,
      queuedCount: Number(row.queuedCount ?? 0),
      retryingCount: Number(row.retryingCount ?? 0),
      deadLetteredCount: Number(row.deadLetteredCount ?? 0),
      replayableCount: Number(row.deadLetteredCount ?? 0),
      oldestQueuedAt: toIsoString(row.oldestQueuedAt),
      oldestRetryingAt: toIsoString(row.oldestRetryingAt),
      lastDeadLetteredAt: toIsoString(row.lastDeadLetteredAt),
    }));

    const summary = apps.reduce(
      (accumulator, row) => ({
        appCount: accumulator.appCount + 1,
        queuedCount: accumulator.queuedCount + row.queuedCount,
        retryingCount: accumulator.retryingCount + row.retryingCount,
        deadLetteredCount:
          accumulator.deadLetteredCount + row.deadLetteredCount,
        replayableCount: accumulator.replayableCount + row.replayableCount,
      }),
      {
        appCount: 0,
        queuedCount: 0,
        retryingCount: 0,
        deadLetteredCount: 0,
        replayableCount: 0,
      },
    );

    const replayCursorHealth = replayCursorRows.map((row) => {
      const savedCursor = Number(row.savedCursor ?? 0);
      const latestEventCursor = Number(row.latestEventCursor ?? 0);
      const cursorLag = Math.max(0, latestEventCursor - savedCursor);
      const updatedAt = toIsoString(row.updatedAt);
      const stale =
        cursorLag > 0 &&
        updatedAt !== null &&
        now - new Date(updatedAt).getTime() >= 24 * 60 * 60_000;
      return {
        appId: row.appId,
        appName: row.appName,
        appStatus: row.appStatus,
        savedCursor,
        latestEventCursor,
        cursorLag,
        updatedAt,
        stale,
      };
    });

    const replayCursorSummary = replayCursorHealth.reduce(
      (accumulator, row) => ({
        latestEventCursor: Math.max(
          accumulator.latestEventCursor,
          row.latestEventCursor,
        ),
        trackedAppCount: accumulator.trackedAppCount + 1,
        laggingAppCount: accumulator.laggingAppCount + (row.cursorLag > 0 ? 1 : 0),
        staleAppCount: accumulator.staleAppCount + (row.stale ? 1 : 0),
        maxCursorLag: Math.max(accumulator.maxCursorLag, row.cursorLag),
      }),
      {
        latestEventCursor: 0,
        trackedAppCount: 0,
        laggingAppCount: 0,
        staleAppCount: 0,
        maxCursorLag: 0,
      },
    );

    return {
      generatedAt: new Date().toISOString(),
      summary,
      replayCursorSummary,
      apps,
      recentAttemptSummary: attemptSummaryRows.map((row) => ({
        outcome: row.outcome,
        errorCode: row.errorCode,
        count: Number(row.count ?? 0),
      })),
      recentAttempts: recentAttemptRows.map((row) => ({
        deliveryId: row.deliveryId,
        appId: row.appId,
        appName: row.appName,
        subscriptionId: row.subscriptionId,
        outcome: row.outcome,
        attemptedAt: toIsoString(row.attemptedAt) ?? new Date().toISOString(),
        responseStatusCode: row.responseStatusCode,
        errorCode: row.errorCode,
        errorMessage: row.errorMessage,
        durationMs: row.durationMs,
      })),
      deadLetterSample: deadLetterSampleRows.map((row) => ({
        deliveryId: row.deliveryId,
        appId: row.appId,
        appName: row.appName,
        subscriptionId: row.subscriptionId,
        eventName: row.eventName,
        status: row.status,
        attemptCount: Number(row.attemptCount ?? 0),
        nextAttemptAt: toIsoString(row.nextAttemptAt),
        lastAttemptAt: toIsoString(row.lastAttemptAt),
        deliveredAt: toIsoString(row.deliveredAt),
        responseStatusCode: row.responseStatusCode,
        errorMessage: row.errorMessage,
        createdAt: toIsoString(row.createdAt) ?? new Date().toISOString(),
        updatedAt: toIsoString(row.updatedAt) ?? new Date().toISOString(),
      })),
      replayCursorHealth,
    };
  }

  private async readProtocolAuthHealthSnapshot() {
    const appRows = await this.prisma.$queryRawUnsafe<ProtocolAuthHealthAppRow[]>(
      `SELECT pa.app_id AS "appId",
              COALESCE(pa.registration_json->>'name', pa.app_id) AS "appName",
              pa.status AS "appStatus",
              CARDINALITY(pa.issued_scopes) AS "issuedScopeCount",
              CARDINALITY(pa.issued_capabilities) AS "issuedCapabilityCount",
              COALESCE(g.active_grants, 0)::bigint AS "activeGrantCount",
              COALESCE(g.revoked_grants, 0)::bigint AS "revokedGrantCount",
              COALESCE(c.pending_consents, 0)::bigint AS "pendingConsentCount",
              COALESCE(c.approved_consents, 0)::bigint AS "approvedConsentCount",
              COALESCE(g.executable_grants, 0)::bigint AS "executableGrantCount",
              COALESCE(g.modeled_only_grants, 0)::bigint AS "modeledOnlyGrantCount",
              COALESCE(f.recent_auth_failures, 0)::bigint AS "recentAuthFailureCount"
       FROM protocol_apps pa
       LEFT JOIN (
         SELECT app_id,
                COUNT(*) FILTER (WHERE status = 'active') AS active_grants,
                COUNT(*) FILTER (WHERE status = 'revoked') AS revoked_grants,
                COUNT(*) FILTER (WHERE status = 'active' AND subject_type = 'user') AS executable_grants,
                COUNT(*) FILTER (WHERE status = 'active' AND subject_type IN ('app', 'service', 'agent')) AS modeled_only_grants
         FROM protocol_app_scope_grants
         GROUP BY app_id
       ) g ON g.app_id = pa.app_id
       LEFT JOIN (
         SELECT app_id,
                COUNT(*) FILTER (WHERE status = 'pending') AS pending_consents,
                COUNT(*) FILTER (WHERE status = 'approved') AS approved_consents
         FROM protocol_app_consent_requests
         GROUP BY app_id
       ) c ON c.app_id = pa.app_id
       LEFT JOIN (
         SELECT actor_app_id AS app_id,
                COUNT(*) AS recent_auth_failures
         FROM protocol_event_log
         WHERE event_name = 'protocol.auth.failure'
           AND created_at >= NOW() - INTERVAL '24 hours'
           AND actor_app_id IS NOT NULL
         GROUP BY actor_app_id
       ) f ON f.app_id = pa.app_id
       ORDER BY COALESCE(f.recent_auth_failures, 0) DESC,
                COALESCE(c.pending_consents, 0) DESC,
                COALESCE(g.active_grants, 0) DESC,
                pa.app_id ASC`,
    );

    const authFailureSummaryRows = await this.prisma.$queryRawUnsafe<
      ProtocolAuthHealthFailureSummaryRow[]
    >(
      `SELECT payload->>'failureType' AS "failureType",
              COUNT(*)::bigint AS count
       FROM protocol_event_log
       WHERE event_name = 'protocol.auth.failure'
         AND created_at >= NOW() - INTERVAL '24 hours'
       GROUP BY payload->>'failureType'
       ORDER BY COUNT(*) DESC, payload->>'failureType' ASC`,
    );
    const recentAuthFailureRows = await this.prisma.$queryRawUnsafe<
      ProtocolAuthHealthRecentFailureRow[]
    >(
      `SELECT pel.actor_app_id AS "appId",
              COALESCE(pa.registration_json->>'name', pel.actor_app_id) AS "appName",
              pel.created_at AS "createdAt",
              pel.payload AS payload
       FROM protocol_event_log pel
       LEFT JOIN protocol_apps pa ON pa.app_id = pel.actor_app_id
       WHERE pel.event_name = 'protocol.auth.failure'
       ORDER BY pel.created_at DESC
       LIMIT 20`,
    );

    const apps = appRows.map((row) => ({
      appId: row.appId,
      appName: row.appName,
      appStatus: row.appStatus,
      issuedScopeCount: Number(row.issuedScopeCount ?? 0),
      issuedCapabilityCount: Number(row.issuedCapabilityCount ?? 0),
      activeGrantCount: Number(row.activeGrantCount ?? 0),
      revokedGrantCount: Number(row.revokedGrantCount ?? 0),
      pendingConsentCount: Number(row.pendingConsentCount ?? 0),
      approvedConsentCount: Number(row.approvedConsentCount ?? 0),
      executableGrantCount: Number(row.executableGrantCount ?? 0),
      modeledOnlyGrantCount: Number(row.modeledOnlyGrantCount ?? 0),
      recentAuthFailureCount: Number(row.recentAuthFailureCount ?? 0),
      hasExecutableDelegation: Number(row.executableGrantCount ?? 0) > 0,
      hasModeledOnlyDelegation: Number(row.modeledOnlyGrantCount ?? 0) > 0,
    }));

    const summary = apps.reduce(
      (accumulator, app) => ({
        appCount: accumulator.appCount + 1,
        activeGrantCount: accumulator.activeGrantCount + app.activeGrantCount,
        pendingConsentCount:
          accumulator.pendingConsentCount + app.pendingConsentCount,
        recentAuthFailureCount:
          accumulator.recentAuthFailureCount + app.recentAuthFailureCount,
        executableDelegationAppCount:
          accumulator.executableDelegationAppCount +
          (app.hasExecutableDelegation ? 1 : 0),
        modeledOnlyDelegationAppCount:
          accumulator.modeledOnlyDelegationAppCount +
          (app.hasModeledOnlyDelegation ? 1 : 0),
      }),
      {
        appCount: 0,
        activeGrantCount: 0,
        pendingConsentCount: 0,
        recentAuthFailureCount: 0,
        executableDelegationAppCount: 0,
        modeledOnlyDelegationAppCount: 0,
      },
    );

    return {
      generatedAt: new Date().toISOString(),
      delegatedExecutionSupport: {
        executableSubjectTypes: ["user"],
        modeledOnlySubjectTypes: ["app", "service", "agent"],
      },
      summary,
      authFailureSummary: authFailureSummaryRows.map((row) => ({
        failureType: row.failureType,
        count: Number(row.count ?? 0),
      })),
      recentAuthFailures: recentAuthFailureRows
        .map((row) => {
          if (!row.payload || typeof row.payload !== "object") {
            return null;
          }
          const payload = row.payload as Record<string, unknown>;
          return {
            appId:
              typeof payload.appId === "string"
                ? payload.appId
                : (row.appId ?? "unknown"),
            appName: row.appName ?? row.appId ?? "unknown",
            failureType:
              typeof payload.failureType === "string"
                ? payload.failureType
                : "unknown",
            action:
              typeof payload.action === "string" ? payload.action : null,
            issuedAt:
              typeof payload.issuedAt === "string"
                ? payload.issuedAt
                : row.createdAt instanceof Date
                  ? row.createdAt.toISOString()
                  : String(row.createdAt),
            details:
              payload.details &&
              typeof payload.details === "object" &&
              !Array.isArray(payload.details)
                ? payload.details
                : {},
          };
        })
        .filter((entry): entry is NonNullable<typeof entry> => entry !== null),
      apps,
    };
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

  private safeEqual(left: string, right: string) {
    const leftBuffer = Buffer.from(left);
    const rightBuffer = Buffer.from(right);
    if (leftBuffer.length !== rightBuffer.length) {
      return false;
    }
    return timingSafeEqual(leftBuffer, rightBuffer);
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

  private resolveModerationSlaBand(ageMs: number) {
    if (ageMs >= 24 * 60 * 60_000) {
      return "critical_24h";
    }
    if (ageMs >= 60 * 60_000) {
      return "warning_1h";
    }
    if (ageMs >= 15 * 60_000) {
      return "watch_15m";
    }
    return "fresh";
  }

  private resolveModerationQueuePriority(reason: string, slaBand: string) {
    const normalizedReason = reason.toLowerCase();
    const hasCriticalSignal = [
      "violence",
      "threat",
      "terror",
      "sexual",
      "child",
      "exploit",
      "underage",
    ].some((token) => normalizedReason.includes(token));
    if (slaBand === "critical_24h") {
      return "p0";
    }
    if (hasCriticalSignal || slaBand === "warning_1h") {
      return "p1";
    }
    if (slaBand === "watch_15m") {
      return "p2";
    }
    return "p3";
  }

  private parseReplayabilityFilter(rawValue: string | undefined) {
    if (!rawValue) {
      return null;
    }
    const normalized = rawValue.trim();
    if (
      normalized === "replayable" ||
      normalized === "partial" ||
      normalized === "inspect_only"
    ) {
      return normalized;
    }
    throw new BadRequestException(
      "replayability must be replayable, partial, or inspect_only",
    );
  }

  private parseWorkflowHealthFilter(rawValue: string | undefined) {
    if (!rawValue) {
      return null;
    }
    const normalized = rawValue.trim();
    if (
      normalized === "healthy" ||
      normalized === "watch" ||
      normalized === "critical"
    ) {
      return normalized;
    }
    throw new BadRequestException("health must be healthy, watch, or critical");
  }

  private parseWorkflowFailureClassFilter(rawValue: string | undefined) {
    if (!rawValue) {
      return null;
    }
    const normalized = rawValue.trim();
    if (
      (AdminController.WORKFLOW_FAILURE_CLASSES as readonly string[]).includes(
        normalized,
      )
    ) {
      return normalized as
        | "none"
        | "llm_or_schema"
        | "moderation_or_policy"
        | "matching_or_negotiation"
        | "queue_or_replay"
        | "persistence_or_dedupe"
        | "notification_or_followup"
        | "latency_or_capacity"
        | "observability_gap";
    }
    throw new BadRequestException(
      `failureClass must be one of: ${AdminController.WORKFLOW_FAILURE_CLASSES.join(", ")}`,
    );
  }

  private parseWorkflowSuspectStageFilter(rawValue: string | undefined) {
    if (!rawValue) {
      return [];
    }
    return Array.from(
      new Set(
        rawValue
          .split(",")
          .map((entry) => entry.trim().toLowerCase())
          .filter((entry) => entry.length > 0),
      ),
    ).slice(0, 10);
  }

  private enrichWorkflowRun<
    T extends {
      replayability: "replayable" | "partial" | "inspect_only";
      stages: Array<{ stage: string; status: string; at: string }>;
      health?: "healthy" | "watch" | "critical";
      latestCheckpoint?: {
        stage: string;
        status: string;
        at: string;
      } | null;
      stageStatusCounts?: {
        started: number;
        completed: number;
        skipped: number;
        blocked: number;
        degraded: number;
        failed: number;
        unknown: number;
      };
    },
  >(run: T) {
    const stageStatusCounts = {
      started: run.stageStatusCounts?.started ?? 0,
      completed: run.stageStatusCounts?.completed ?? 0,
      skipped: run.stageStatusCounts?.skipped ?? 0,
      blocked: run.stageStatusCounts?.blocked ?? 0,
      degraded: run.stageStatusCounts?.degraded ?? 0,
      failed: run.stageStatusCounts?.failed ?? 0,
      unknown: run.stageStatusCounts?.unknown ?? 0,
    };

    if (!run.stageStatusCounts) {
      for (const stage of run.stages) {
        if (stage.status === "started") {
          stageStatusCounts.started += 1;
          continue;
        }
        if (stage.status === "completed") {
          stageStatusCounts.completed += 1;
          continue;
        }
        if (stage.status === "skipped") {
          stageStatusCounts.skipped += 1;
          continue;
        }
        if (stage.status === "blocked") {
          stageStatusCounts.blocked += 1;
          continue;
        }
        if (stage.status === "degraded") {
          stageStatusCounts.degraded += 1;
          continue;
        }
        if (stage.status === "failed") {
          stageStatusCounts.failed += 1;
          continue;
        }
        stageStatusCounts.unknown += 1;
      }
    }

    const latestCheckpoint =
      run.latestCheckpoint ??
      (run.stages.length === 0 ? null : run.stages[run.stages.length - 1]);
    const health: "healthy" | "watch" | "critical" =
      run.health ??
      (stageStatusCounts.failed > 0 || stageStatusCounts.blocked > 0
        ? "critical"
        : stageStatusCounts.degraded > 0 ||
            stageStatusCounts.skipped > 0 ||
            stageStatusCounts.started > 0 ||
            run.replayability !== "replayable"
          ? "watch"
          : "healthy");

    return {
      ...run,
      health,
      latestCheckpoint,
      stageStatusCounts,
    };
  }

  private addWorkflowTriage<
    T extends {
      stageStatusCounts: {
        started: number;
        completed: number;
        skipped: number;
        blocked: number;
        degraded: number;
        failed: number;
        unknown: number;
      };
      replayability: "replayable" | "partial" | "inspect_only";
      health: "healthy" | "watch" | "critical";
      integrity: {
        sideEffectCount: number;
        dedupedSideEffectCount: number;
        reusedRelations: string[];
      };
      stages: Array<{ stage: string; status: string; at: string }>;
      latestCheckpoint: {
        stage: string;
        status: string;
        at: string;
      } | null;
    },
  >(run: T) {
    const failureClass = this.classifyWorkflowFailure(run);
    const suspectStages = this.collectWorkflowSuspectStages(run.stages);
    const replayHint = this.buildWorkflowReplayHint({
      replayability: run.replayability,
      failureClass,
      health: run.health,
    });
    const recommendation =
      failureClass === "none"
        ? "No action needed."
        : failureClass === "llm_or_schema"
          ? "Inspect prompt/schema and model output validation in this trace."
          : failureClass === "moderation_or_policy"
            ? "Review moderation/policy checkpoints and approval-state transitions."
            : failureClass === "matching_or_negotiation"
              ? "Review ranking/negotiation/fanout candidate decisions for this run."
              : failureClass === "queue_or_replay"
                ? "Inspect queue lag, replay safety, and run replayability metadata."
                : failureClass === "persistence_or_dedupe"
                  ? "Inspect persistence writes and dedupe/reuse side-effect signals."
                  : failureClass === "notification_or_followup"
                    ? "Inspect follow-up enqueue/delivery and notification fanout logs."
                    : failureClass === "latency_or_capacity"
                      ? "Inspect timeout budgets, queue capacity, and fallback thresholds."
                      : "Inspect trace events and workflow checkpoints for missing signals.";
    const summary =
      failureClass === "none"
        ? "Workflow run is healthy."
        : `Primary failure class is ${failureClass}.`;

    return {
      ...run,
      triage: {
        failureClass,
        summary,
        recommendation,
        suspectStages,
        replayHint,
      },
    };
  }

  private collectWorkflowSuspectStages(
    stages: Array<{ stage: string; status: string; at: string }>,
  ) {
    const unique = new Set<string>();
    const suspects: string[] = [];
    for (const stage of stages) {
      if (
        stage.status !== "failed" &&
        stage.status !== "blocked" &&
        stage.status !== "degraded"
      ) {
        continue;
      }
      if (unique.has(stage.stage)) {
        continue;
      }
      unique.add(stage.stage);
      suspects.push(stage.stage);
      if (suspects.length >= 5) {
        break;
      }
    }
    return suspects;
  }

  private buildWorkflowReplayHint(input: {
    replayability: "replayable" | "partial" | "inspect_only";
    health: "healthy" | "watch" | "critical";
    failureClass:
      | "none"
      | "llm_or_schema"
      | "moderation_or_policy"
      | "matching_or_negotiation"
      | "queue_or_replay"
      | "persistence_or_dedupe"
      | "notification_or_followup"
      | "latency_or_capacity"
      | "observability_gap";
  }) {
    if (input.replayability === "replayable" && input.failureClass === "none") {
      return "Replay is available if investigation is needed, but this run is healthy.";
    }
    if (input.replayability === "replayable") {
      return "Replay is available for this run. Start with trace-linked stage checkpoints.";
    }
    if (input.replayability === "partial") {
      return input.failureClass === "queue_or_replay"
        ? "Replay is partial. Validate queue/retry checkpoints before re-running."
        : "Replay is partial. Validate missing checkpoints before re-running.";
    }
    return input.health === "critical"
      ? "Inspect-only run. Do not replay yet; fill missing trace/checkpoint instrumentation first."
      : "Inspect-only run. Add trace/checkpoint coverage before attempting replay.";
  }

  private buildFailureClassSummary(failureClasses: {
    none: number;
    llmOrSchema: number;
    moderationOrPolicy: number;
    matchingOrNegotiation: number;
    queueOrReplay: number;
    persistenceOrDedupe: number;
    notificationOrFollowup: number;
    latencyOrCapacity: number;
    observabilityGap: number;
  }) {
    const entries = [
      {
        class: "llm_or_schema",
        count: failureClasses.llmOrSchema,
        hint: "Inspect planning/compose/schema traces and model-output validation.",
      },
      {
        class: "moderation_or_policy",
        count: failureClasses.moderationOrPolicy,
        hint: "Inspect moderation decisions, policy gates, and approval transitions.",
      },
      {
        class: "matching_or_negotiation",
        count: failureClasses.matchingOrNegotiation,
        hint: "Inspect ranking, candidate fanout, and negotiation stage outcomes.",
      },
      {
        class: "queue_or_replay",
        count: failureClasses.queueOrReplay,
        hint: "Inspect queue lag, retries, dedupe keys, and replayability signals.",
      },
      {
        class: "persistence_or_dedupe",
        count: failureClasses.persistenceOrDedupe,
        hint: "Inspect write paths, idempotency keys, and side-effect reuse metadata.",
      },
      {
        class: "notification_or_followup",
        count: failureClasses.notificationOrFollowup,
        hint: "Inspect follow-up scheduling and notification enqueue/delivery events.",
      },
      {
        class: "latency_or_capacity",
        count: failureClasses.latencyOrCapacity,
        hint: "Inspect timeout budgets, queue pressure, and fallback thresholds.",
      },
      {
        class: "observability_gap",
        count: failureClasses.observabilityGap,
        hint: "Add missing checkpoints and trace events before replaying.",
      },
      {
        class: "none",
        count: failureClasses.none,
        hint: "No workflow failures classified for these runs.",
      },
    ] as const;

    return entries
      .filter((entry) => entry.count > 0)
      .sort((left, right) => right.count - left.count);
  }

  private buildWorkflowListExplainability(input: {
    filteredRuns: Array<{
      workflowRunId: string;
      health: "healthy" | "watch" | "critical";
      replayability: "replayable" | "partial" | "inspect_only";
      integrity: {
        sideEffectCount: number;
        dedupedSideEffectCount: number;
        reusedRelations: string[];
      };
      stages: Array<{ stage: string; status: string; at: string }>;
      stageStatusCounts: {
        started: number;
        completed: number;
        skipped: number;
        blocked: number;
        degraded: number;
        failed: number;
        unknown: number;
      };
      latestCheckpoint: {
        stage: string;
        status: string;
        at: string;
      } | null;
    }>;
    failureClasses: {
      none: number;
      llmOrSchema: number;
      moderationOrPolicy: number;
      matchingOrNegotiation: number;
      queueOrReplay: number;
      persistenceOrDedupe: number;
      notificationOrFollowup: number;
      latencyOrCapacity: number;
      observabilityGap: number;
    };
    topFailureStages: Array<{
      stage: string;
      status: "failed" | "blocked" | "degraded";
      count: number;
    }>;
    stageStatusCounts: {
      started: number;
      completed: number;
      skipped: number;
      blocked: number;
      degraded: number;
      failed: number;
      unknown: number;
    };
  }) {
    const enrichedRuns = input.filteredRuns.map((run) =>
      this.addWorkflowTriage(run),
    );
    const primaryFailureClass =
      this.buildFailureClassSummary(input.failureClasses)[0] ?? null;
    const primaryFailureStage = input.topFailureStages[0] ?? null;
    const criticalRun =
      enrichedRuns.find((run) => run.health === "critical") ?? null;
    const summary =
      enrichedRuns.length === 0
        ? "No workflow runs matched the current filter."
        : !primaryFailureClass || primaryFailureClass.class === "none"
          ? "Filtered workflow runs are healthy."
          : `Primary workflow failure class is ${primaryFailureClass.class}.`;

    const nextActions: Array<{
      id: string;
      label: string;
      endpoint: string;
      reason: string;
    }> = [
      {
        id: "open_workflow_failures",
        label: "Inspect workflow failures",
        endpoint: "/api/admin/ops/agent-workflows?failuresOnly=true",
        reason:
          primaryFailureClass?.hint ??
          "Inspect the most recent non-healthy workflow runs.",
      },
    ];
    if (primaryFailureStage) {
      nextActions.push({
        id: "filter_by_primary_stage",
        label: "Filter by suspect stage",
        endpoint: `/api/admin/ops/agent-workflows?suspectStage=${encodeURIComponent(primaryFailureStage.stage)}&failuresOnly=true`,
        reason:
          "Filter to the most common degraded/blocked/failed stage first.",
      });
    }

    return {
      summary,
      primaryFailureClass,
      primaryFailureStage,
      criticalRun: criticalRun
        ? {
            workflowRunId: criticalRun.workflowRunId,
            replayability: criticalRun.replayability,
            triage: criticalRun.triage,
          }
        : null,
      stageStatusCounts: input.stageStatusCounts,
      nextActions,
    };
  }

  private buildAgentReliabilityExplainability(input: {
    workflowHealth: { healthy: number; watch: number; critical: number };
    failureClassSummary: Array<{
      class: string;
      count: number;
      hint: string;
    }>;
    topFailureStages: Array<{
      stage: string;
      status: "failed" | "blocked" | "degraded";
      count: number;
    }>;
    latestVerificationRun: VerificationRunRecord | null;
    evalSnapshot: {
      summary: {
        status?: string;
        regressionCount?: number;
      };
    };
    canaryVerdict: "healthy" | "watch" | "critical";
    memorySignals: {
      memoryIngestionFailedRuns: number;
      memoryIngestionBlockedRuns: number;
      memoryIngestionDegradedRuns: number;
      memoryConflictRuns: number;
    };
  }) {
    const primaryFailureClass = input.failureClassSummary[0] ?? null;
    const primaryFailureStage = input.topFailureStages[0] ?? null;
    const verificationStatus = input.latestVerificationRun?.status ?? "unknown";
    const evalStatus = input.evalSnapshot.summary.status ?? "watch";
    const memoryPressure =
      input.memorySignals.memoryIngestionFailedRuns +
      input.memorySignals.memoryIngestionBlockedRuns +
      input.memorySignals.memoryIngestionDegradedRuns;

    const summary =
      input.canaryVerdict === "healthy"
        ? "Reliability is healthy. No immediate operator intervention required."
        : input.canaryVerdict === "critical"
          ? `Reliability is critical. Primary failure class: ${primaryFailureClass?.class ?? "unknown"}; verification status: ${verificationStatus}.`
          : `Reliability is watch. Primary failure class: ${primaryFailureClass?.class ?? "none"}; eval status: ${evalStatus}.`;

    const nextActions = [
      {
        id: "open_failure_class_runs",
        label: "Open workflow runs for the primary failure class",
        endpoint: primaryFailureClass
          ? `/api/admin/ops/agent-workflows?failureClass=${primaryFailureClass.class}&failuresOnly=true`
          : "/api/admin/ops/agent-workflows?failuresOnly=true",
        reason: primaryFailureClass
          ? primaryFailureClass.hint
          : "No dominant failure class; inspect all non-healthy runs.",
      },
      {
        id: "open_latest_verification",
        label: "Inspect latest verification lane run",
        endpoint: "/api/admin/ops/verification-runs?limit=10",
        reason:
          verificationStatus === "failed"
            ? "Latest verification run failed and is currently gating canary confidence."
            : "Verify recent run stability before rollout.",
      },
      {
        id: "open_eval_regressions",
        label: "Inspect eval regressions",
        endpoint: "/api/admin/ops/agentic-evals",
        reason:
          (input.evalSnapshot.summary.regressionCount ?? 0) > 0
            ? "Eval regressions are active and can explain user-facing quality drift."
            : "No active eval regressions; use this view to confirm trace-grade stability.",
      },
    ];
    if (memoryPressure > 0 || input.memorySignals.memoryConflictRuns > 0) {
      nextActions.push({
        id: "open_memory_pipeline_health",
        label: "Inspect memory pipeline health",
        endpoint:
          "/api/admin/ops/agent-workflows?suspectStage=memory&failuresOnly=true",
        reason:
          "Memory-stage degradation/conflicts detected; verify ingestion and contradiction handling traces.",
      });
    }

    return {
      summary,
      canaryVerdict: input.canaryVerdict,
      primaryFailureClass,
      primaryFailureStage,
      verificationStatus,
      evalStatus,
      memorySignals: input.memorySignals,
      workflowHealth: input.workflowHealth,
      nextActions,
    };
  }

  private buildAgentOutcomesExplainability(input: {
    summary: {
      totalActions: number;
      executedActions: number;
      deniedActions: number;
      failedActions: number;
    };
    toolAttempts: Array<{
      tool: string;
      attempted: number;
      executed: number;
      denied: number;
      failed: number;
    }>;
    introRequestAcceptance?: {
      acceptanceRate: number | null;
    };
    circleJoinConversion?: {
      conversionRate: number | null;
    };
    followupUsefulness?: {
      usefulnessRate: number | null;
      completionRate: number | null;
    };
  }) {
    const topTool =
      [...input.toolAttempts].sort(
        (left, right) => right.attempted - left.attempted,
      )[0] ?? null;
    const failedOrDenied =
      input.summary.deniedActions + input.summary.failedActions;
    const summary =
      input.summary.totalActions === 0
        ? "No recent agent action telemetry is available."
        : failedOrDenied === 0
          ? "Agent outcomes are healthy across the current window."
          : `Agent outcomes show ${failedOrDenied} denied/failed actions in the current window.`;

    const nextActions = [
      {
        id: "open_agent_actions",
        label: "Inspect recent agent actions",
        endpoint: "/api/admin/ops/agent-actions?limit=25",
        reason:
          failedOrDenied > 0
            ? "Denied/failed actions are the fastest path to root cause."
            : "Use action traces to confirm healthy execution patterns.",
      },
      {
        id: "open_agent_reliability",
        label: "Inspect reliability snapshot",
        endpoint: "/api/admin/ops/agent-reliability",
        reason:
          "Cross-check outcomes against workflow failures and verification status.",
      },
    ];
    if ((input.followupUsefulness?.usefulnessRate ?? 1) < 0.6) {
      nextActions.push({
        id: "inspect_followup_usefulness",
        label: "Inspect follow-up usefulness",
        endpoint: "/api/admin/ops/agent-outcomes",
        reason:
          "Follow-up usefulness is low; confirm whether follow-up scheduling or action quality is drifting.",
      });
    }

    return {
      summary,
      topTool,
      rates: {
        introAcceptanceRate:
          input.introRequestAcceptance?.acceptanceRate ?? null,
        circleConversionRate:
          input.circleJoinConversion?.conversionRate ?? null,
        followupUsefulnessRate:
          input.followupUsefulness?.usefulnessRate ?? null,
        followupCompletionRate:
          input.followupUsefulness?.completionRate ?? null,
      },
      nextActions,
    };
  }

  private buildAgentActionsExplainability(input: {
    filters: {
      limit: number;
      tool: string | null;
      status: string | null;
      actorUserId: string | null;
      threadId: string | null;
      traceId: string | null;
    };
    items: Array<{
      tool: string | null;
      status: string | null;
      replayHint: string;
      linkedCheckpoint: {
        id: string;
        status: string;
        decisionReason: string | null;
      } | null;
      traceId: string | null;
    }>;
  }) {
    const statusCounts = {
      executed: input.items.filter((item) => item.status === "executed").length,
      denied: input.items.filter((item) => item.status === "denied").length,
      failed: input.items.filter((item) => item.status === "failed").length,
      pending: input.items.filter((item) => item.status === "pending").length,
      other: input.items.filter(
        (item) =>
          item.status !== "executed" &&
          item.status !== "denied" &&
          item.status !== "failed" &&
          item.status !== "pending",
      ).length,
    };
    const primaryItem =
      input.items.find((item) => item.status === "failed") ??
      input.items.find((item) => item.status === "denied") ??
      input.items.find((item) => item.status === "pending") ??
      input.items[0] ??
      null;
    const summary =
      input.items.length === 0
        ? "No agent actions matched the current filter."
        : primaryItem?.status === "failed"
          ? "Recent agent actions include failures that require trace inspection."
          : primaryItem?.status === "denied"
            ? "Recent agent actions are being denied; review approval and policy checkpoints."
            : "Recent agent actions are available for trace inspection.";

    const nextActions = primaryItem
      ? [
          {
            id: "inspect_primary_action_trace",
            label: "Inspect primary action trace",
            endpoint: primaryItem.traceId
              ? `/api/admin/ops/agent-actions?traceId=${encodeURIComponent(primaryItem.traceId)}`
              : "/api/admin/ops/agent-actions?limit=25",
            reason: primaryItem.replayHint,
          },
        ]
      : [];

    return {
      summary,
      statusCounts,
      primaryItem: primaryItem
        ? {
            tool: primaryItem.tool,
            status: primaryItem.status,
            checkpointStatus: primaryItem.linkedCheckpoint?.status ?? null,
            checkpointDecisionReason:
              primaryItem.linkedCheckpoint?.decisionReason ?? null,
          }
        : null,
      activeFilters: input.filters,
      nextActions,
    };
  }

  private classifyWorkflowFailure(input: {
    stageStatusCounts: {
      started: number;
      completed: number;
      skipped: number;
      blocked: number;
      degraded: number;
      failed: number;
      unknown: number;
    };
    replayability: "replayable" | "partial" | "inspect_only";
    health: "healthy" | "watch" | "critical";
    integrity: {
      sideEffectCount: number;
      dedupedSideEffectCount: number;
      reusedRelations: string[];
    };
    stages: Array<{ stage: string; status: string; at: string }>;
  }) {
    if (input.health === "healthy") {
      return "none" as const;
    }

    if (input.stageStatusCounts.blocked > 0) {
      return "moderation_or_policy" as const;
    }

    const failedStages = input.stages
      .filter((stage) => stage.status === "failed")
      .map((stage) => stage.stage.toLowerCase());
    const degradedStages = input.stages
      .filter((stage) => stage.status === "degraded")
      .map((stage) => stage.stage.toLowerCase());
    const touchedStages = [...failedStages, ...degradedStages];

    if (
      touchedStages.some((stage) =>
        ["parse", "compose", "planning", "schema", "llm", "onboarding"].some(
          (token) => stage.includes(token),
        ),
      )
    ) {
      return "llm_or_schema" as const;
    }

    if (
      touchedStages.some((stage) =>
        ["moderation", "policy", "safety", "risk", "approval"].some((token) =>
          stage.includes(token),
        ),
      )
    ) {
      return "moderation_or_policy" as const;
    }

    if (
      touchedStages.some((stage) =>
        ["ranking", "match", "negotiation", "fanout", "discovery"].some(
          (token) => stage.includes(token),
        ),
      )
    ) {
      return "matching_or_negotiation" as const;
    }

    if (
      touchedStages.some((stage) =>
        ["followup", "notification", "reminder"].some((token) =>
          stage.includes(token),
        ),
      )
    ) {
      return "notification_or_followup" as const;
    }

    if (
      touchedStages.some((stage) =>
        ["queue", "retry", "replay", "dead_letter"].some((token) =>
          stage.includes(token),
        ),
      )
    ) {
      return "queue_or_replay" as const;
    }

    if (
      input.stageStatusCounts.failed > 0 &&
      (input.integrity.dedupedSideEffectCount > 0 ||
        input.integrity.reusedRelations.length > 0)
    ) {
      return "persistence_or_dedupe" as const;
    }

    if (
      input.stageStatusCounts.failed > 0 ||
      input.stageStatusCounts.unknown > 0
    ) {
      return "observability_gap" as const;
    }

    if (
      input.stageStatusCounts.degraded > 0 ||
      input.stageStatusCounts.skipped > 0
    ) {
      return "latency_or_capacity" as const;
    }

    if (input.replayability !== "replayable") {
      return "queue_or_replay" as const;
    }

    return "observability_gap" as const;
  }

  private parseOptionalBooleanQuery(rawValue: string | undefined) {
    if (!rawValue) {
      return null;
    }
    const normalized = rawValue.trim().toLowerCase();
    if (["1", "true", "yes", "on"].includes(normalized)) {
      return true;
    }
    if (["0", "false", "no", "off"].includes(normalized)) {
      return false;
    }
    throw new BadRequestException("boolean query must be true/false");
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

  private resolveMatchingPositiveIntegerEnv(key: string, fallback: number) {
    const rawValue = process.env[key]?.trim();
    if (!rawValue) {
      return fallback;
    }
    const parsed = Number.parseInt(rawValue, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return fallback;
    }
    return parsed;
  }

  private async readRequestPressureSnapshot(input: {
    limit: number;
    hours: number;
  }) {
    const windowStart = new Date(Date.now() - input.hours * 60 * 60_000);
    const pendingCap = this.resolveMatchingPositiveIntegerEnv(
      "MATCHING_MAX_PENDING_INBOUND_REQUESTS_PER_RECIPIENT",
      DEFAULT_MAX_PENDING_INBOUND_REQUESTS_PER_RECIPIENT,
    );
    const dailyCap = this.resolveMatchingPositiveIntegerEnv(
      "MATCHING_MAX_DAILY_INBOUND_REQUESTS_PER_RECIPIENT",
      DEFAULT_MAX_DAILY_INBOUND_REQUESTS_PER_RECIPIENT,
    );

    const rows = await this.prisma.$queryRaw<RequestPressureRecipientRow[]>`
      SELECT
        recipient_user_id AS "recipientUserId",
        COUNT(*) FILTER (WHERE status = 'pending') AS "pendingInboundCount",
        COUNT(*) FILTER (WHERE sent_at >= ${windowStart}) AS "windowInboundCount",
        MAX(sent_at) AS "lastSentAt"
      FROM intent_requests
      WHERE status = 'pending' OR sent_at >= ${windowStart}
      GROUP BY recipient_user_id
      ORDER BY
        COUNT(*) FILTER (WHERE status = 'pending') DESC,
        COUNT(*) FILTER (WHERE sent_at >= ${windowStart}) DESC,
        MAX(sent_at) DESC
      LIMIT ${input.limit}
    `;

    const recipientUserIds = rows.map((row) => row.recipientUserId);
    const users =
      recipientUserIds.length === 0
        ? []
        : await this.prisma.user.findMany({
            where: {
              id: {
                in: recipientUserIds,
              },
            },
            include: {
              profile: true,
            },
          });
    const usersById = new Map(users.map((user) => [user.id, user]));

    const recipients = rows.map((row) => {
      const pendingInboundCount = Number(row.pendingInboundCount ?? 0);
      const windowInboundCount = Number(row.windowInboundCount ?? 0);
      const suppressed =
        pendingInboundCount >= pendingCap || windowInboundCount >= dailyCap;
      const pendingRatio = pendingInboundCount / pendingCap;
      const windowRatio = windowInboundCount / dailyCap;
      const penalty = suppressed
        ? 1
        : Math.min(
            1,
            Math.max(0, pendingRatio - 0.35) * 0.35 +
              Math.max(0, windowRatio - 0.4) * 0.25,
          );
      const user = usersById.get(row.recipientUserId);
      return {
        recipientUserId: row.recipientUserId,
        displayName:
          user?.displayName?.trim() ||
          user?.email?.trim() ||
          row.recipientUserId,
        avatarUrl: null,
        city: user?.profile?.city ?? null,
        country: user?.profile?.country ?? null,
        pendingInboundCount,
        windowInboundCount,
        pendingCapacityRatio: Math.min(1, pendingRatio),
        windowCapacityRatio: Math.min(1, windowRatio),
        loadPenalty: penalty,
        suppressed,
        suppressionReason: suppressed
          ? pendingInboundCount >= pendingCap
            ? "pending_inbound_cap"
            : "window_inbound_cap"
          : null,
        lastSentAt:
          row.lastSentAt instanceof Date
            ? row.lastSentAt.toISOString()
            : typeof row.lastSentAt === "string"
              ? row.lastSentAt
              : null,
      };
    });

    const overloadedRecipientCount = recipients.filter(
      (recipient) => recipient.suppressed,
    ).length;
    const nearCapacityRecipientCount = recipients.filter(
      (recipient) =>
        !recipient.suppressed &&
        (recipient.pendingCapacityRatio >= 0.7 ||
          recipient.windowCapacityRatio >= 0.7),
    ).length;

    return {
      generatedAt: new Date().toISOString(),
      window: {
        hours: input.hours,
        start: windowStart.toISOString(),
        end: new Date().toISOString(),
      },
      thresholds: {
        pendingInboundCap: pendingCap,
        windowInboundCap: dailyCap,
      },
      summary: {
        recipientCount: recipients.length,
        overloadedRecipientCount,
        nearCapacityRecipientCount,
        totalPendingInboundCount: recipients.reduce(
          (sum, recipient) => sum + recipient.pendingInboundCount,
          0,
        ),
        totalWindowInboundCount: recipients.reduce(
          (sum, recipient) => sum + recipient.windowInboundCount,
          0,
        ),
      },
      recipients,
    };
  }

  private buildManualVerificationAssessment(input: {
    limit: number;
    hours: number;
    requestPressure: Awaited<ReturnType<AdminController["readRequestPressureSnapshot"]>>;
    protocolQueueHealth: Awaited<
      ReturnType<AdminController["readProtocolQueueHealthSnapshot"]>
    >;
    protocolAuthHealth: Awaited<
      ReturnType<AdminController["readProtocolAuthHealthSnapshot"]>
    >;
  }) {
    const findings: ManualVerificationFinding[] = [];
    const nextActions: ManualVerificationNextAction[] = [];

    const topOverloadedRecipient = input.requestPressure.recipients.find(
      (recipient) => recipient.suppressed,
    );
    if (topOverloadedRecipient) {
      findings.push({
        id: "request_pressure_overloaded",
        level: "critical",
        area: "request_pressure",
        summary: "One or more recipients are currently suppressed by load.",
        detail: `${topOverloadedRecipient.displayName} is at ${topOverloadedRecipient.pendingInboundCount}/${input.requestPressure.thresholds.pendingInboundCap} pending inbound requests and ${topOverloadedRecipient.windowInboundCount}/${input.requestPressure.thresholds.windowInboundCap} rolling-window requests.`,
      });
      nextActions.push({
        id: "inspect_request_pressure",
        label: "Inspect overloaded recipients",
        endpoint: `/admin/ops/request-pressure?limit=${input.limit}&hours=${input.hours}`,
        reason:
          "Use recipient-level pressure detail to confirm whether matching is over-targeting a cohort and whether caps need tuning.",
      });
    } else if (input.requestPressure.summary.nearCapacityRecipientCount > 0) {
      findings.push({
        id: "request_pressure_near_capacity",
        level: "watch",
        area: "request_pressure",
        summary: "Some recipients are nearing the inbound request caps.",
        detail: `${input.requestPressure.summary.nearCapacityRecipientCount} recipients are above the near-capacity threshold without being hard-suppressed yet.`,
      });
    }

    const latestDeadLetter = input.protocolQueueHealth.deadLetterSample[0];
    if (input.protocolQueueHealth.summary.deadLetteredCount > 0) {
      findings.push({
        id: "protocol_queue_dead_letters",
        level: "critical",
        area: "protocol_queue",
        summary: "Protocol webhook deliveries are currently dead-lettered.",
        detail: latestDeadLetter
          ? `The newest dead-lettered delivery is ${latestDeadLetter.deliveryId} for ${latestDeadLetter.appName ?? latestDeadLetter.appId} on ${latestDeadLetter.eventName}.`
          : `${input.protocolQueueHealth.summary.deadLetteredCount} deliveries are dead-lettered and replayable.`,
      });
      nextActions.push({
        id: "inspect_protocol_queue_health",
        label: "Inspect queue and replay state",
        endpoint: "/admin/ops/protocol-queue-health",
        reason:
          "Review recent attempts, dead-letter samples, and outcome buckets before replaying anything.",
      });
    } else if (input.protocolQueueHealth.summary.retryingCount > 0) {
      findings.push({
        id: "protocol_queue_retrying",
        level: "watch",
        area: "protocol_queue",
        summary: "Protocol deliveries are retrying but have not dead-lettered.",
        detail: `${input.protocolQueueHealth.summary.retryingCount} deliveries are currently retrying, so downstream failures may still be resolving without manual replay.`,
      });
    }

    const stalestReplayCursor = input.protocolQueueHealth.replayCursorHealth.find(
      (row) => row.stale,
    );
    if (stalestReplayCursor) {
      findings.push({
        id: "protocol_replay_cursor_stale",
        level: "watch",
        area: "protocol_queue",
        summary: "At least one replay cursor is lagging behind the protocol event log.",
        detail: `${stalestReplayCursor.appName ?? stalestReplayCursor.appId} is ${stalestReplayCursor.cursorLag} events behind and has not updated its cursor recently.`,
      });
      nextActions.push({
        id: "inspect_replay_cursor_health",
        label: "Inspect replay cursor lag",
        endpoint: "/admin/ops/protocol-queue-health",
        reason:
          "Queue delivery can look healthy while a consumer still trails the event log, so use replay cursor health before assuming downstream state is current.",
      });
    } else if (input.protocolQueueHealth.replayCursorSummary.maxCursorLag > 0) {
      findings.push({
        id: "protocol_replay_cursor_lag",
        level: "watch",
        area: "protocol_queue",
        summary: "Replay cursors are behind the latest protocol event log.",
        detail: `${input.protocolQueueHealth.replayCursorSummary.laggingAppCount} apps have cursor lag, with a maximum lag of ${input.protocolQueueHealth.replayCursorSummary.maxCursorLag} events.`,
      });
    }

    const latestAuthFailure = input.protocolAuthHealth.recentAuthFailures[0];
    if (
      input.protocolAuthHealth.summary.modeledOnlyDelegationAppCount > 0 &&
      input.protocolAuthHealth.summary.executableDelegationAppCount === 0
    ) {
      findings.push({
        id: "protocol_auth_modeled_only_delegation",
        level: "watch",
        area: "protocol_auth",
        summary: "Delegated access is configured, but only in modeled-only subject types.",
        detail: `${input.protocolAuthHealth.summary.modeledOnlyDelegationAppCount} apps have active app, service, or agent grants without an executable user delegation path, so delegated actions may still fail at runtime.`,
      });
      nextActions.push({
        id: "inspect_modeled_only_delegation",
        label: "Review delegated grant subject mix",
        endpoint: "/admin/ops/protocol-auth-health",
        reason:
          "Use the auth-health snapshot to confirm whether integrations need executable user grants instead of modeled-only app, service, or agent grants.",
      });
    }

    if (input.protocolAuthHealth.summary.recentAuthFailureCount > 0) {
      findings.push({
        id: "protocol_auth_failures",
        level: latestAuthFailure?.failureType === "missing_delegated_grant"
          ? "watch"
          : "critical",
        area: "protocol_auth",
        summary: "Recent protocol auth failures were recorded.",
        detail: latestAuthFailure
          ? `${latestAuthFailure.appName} most recently failed with ${latestAuthFailure.failureType}${latestAuthFailure.action ? ` on ${latestAuthFailure.action}` : ""}.`
          : `${input.protocolAuthHealth.summary.recentAuthFailureCount} auth failures were recorded in the last 24 hours.`,
      });
      nextActions.push({
        id: "inspect_protocol_auth_health",
        label: "Inspect auth and grant diagnostics",
        endpoint: "/admin/ops/protocol-auth-health",
        reason:
          "Use auth-failure samples and grant subject mix to separate missing delegated grants from broader app-token or consent problems.",
      });
    } else if (input.protocolAuthHealth.summary.pendingConsentCount > 0) {
      findings.push({
        id: "protocol_auth_pending_consent",
        level: "watch",
        area: "protocol_auth",
        summary: "Consent requests are pending without active auth failures.",
        detail: `${input.protocolAuthHealth.summary.pendingConsentCount} consent requests are still pending, so delegated actions may remain blocked until they are approved or rejected.`,
      });
    }

    if (findings.length === 0) {
      findings.push({
        id: "manual_verification_healthy",
        level: "healthy",
        area: "protocol_queue",
        summary: "No immediate request pressure, queue, or auth blockers were found.",
        detail:
          "Manual verification can proceed to product behavior checks without an obvious operator-side blocker in the current snapshots.",
      });
    }

    if (nextActions.length === 0) {
      nextActions.push({
        id: "recheck_manual_verification",
        label: "Refresh the combined manual verification snapshot",
        endpoint: `/admin/ops/manual-verification?limit=${input.limit}&hours=${input.hours}`,
        reason:
          "No immediate blocker is visible right now, so use the combined snapshot again after the next manual app scenario to catch new drift quickly.",
      });
    }

    return {
      overallStatus: this.resolveOverallOpsRisk(findings),
      findings,
      nextActions,
    };
  }

  private resolveOverallOpsRisk(findings: ManualVerificationFinding[]): OpsRiskLevel {
    if (findings.some((finding) => finding.level === "critical")) {
      return "critical";
    }
    if (findings.some((finding) => finding.level === "watch")) {
      return "watch";
    }
    return "healthy";
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

  private readStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) {
      return [];
    }
    return value
      .map((entry) => this.readString(entry))
      .filter((entry): entry is string => Boolean(entry));
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

  private async enrichMemoryWriteForAdmin(entry: {
    id: string;
    docType: string;
    createdAt: Date;
    summary: string | null;
    memory: {
      class: string | null;
      governanceTier: string | null;
      domain?: string | null;
      key: string | null;
      value: string | null;
      state: string;
      confidence: number | null;
      contradictionDetected: boolean;
      conflictingDocumentId: string | null;
      provenance: Record<string, unknown>;
    };
  }) {
    const provenance = entry.memory.provenance ?? {};
    const workflowRunId = this.readString(provenance.workflowRunId);
    const traceId = this.readString(provenance.traceId);
    const replay = await this.readMemoryReplayDetails(workflowRunId);

    return {
      ...entry,
      memory: {
        ...entry.memory,
        domain: entry.memory.domain ?? "interaction",
      },
      explainability: {
        provenanceSummary: {
          sourceSurface: this.readString(provenance.sourceSurface),
          sourceType: this.readString(provenance.sourceType),
          sourceEntityId: this.readString(provenance.sourceEntityId),
          messageId: this.readString(provenance.messageId),
          chatId: this.readString(provenance.chatId),
          threadId: this.readString(provenance.threadId),
          workflowRunId,
          traceId,
        },
        replayability: replay?.replayability ?? null,
        workflowHealth: replay?.health ?? null,
        replayHint: replay?.hint ?? null,
        traceAvailable: Boolean(traceId),
      },
    };
  }

  private filterAuditTrailForMemory(
    auditTrail: Array<{
      id: string;
      action: string;
      createdAt: Date;
      metadata: unknown;
    }>,
    entry: {
      id: string;
      memory: {
        key: string | null;
        provenance: Record<string, unknown>;
      };
    },
  ) {
    const workflowRunId = this.readString(
      entry.memory.provenance.workflowRunId,
    );
    const traceId = this.readString(entry.memory.provenance.traceId);
    const key = entry.memory.key;

    return auditTrail.filter((row) => {
      const metadata = this.readJsonObject(
        row.metadata as Prisma.JsonValue | null | undefined,
      );
      const metadataWorkflowRunId = this.readString(metadata.workflowRunId);
      const metadataTraceId = this.readString(metadata.traceId);
      const metadataKey = this.readString(metadata.key);
      const nestedProvenance = this.readJsonObject(
        metadata.provenance as Prisma.JsonValue | null | undefined,
      );
      return (
        (workflowRunId &&
          (metadataWorkflowRunId === workflowRunId ||
            this.readString(nestedProvenance.workflowRunId) ===
              workflowRunId)) ||
        (traceId &&
          (metadataTraceId === traceId ||
            this.readString(nestedProvenance.traceId) === traceId)) ||
        (key && metadataKey === key)
      );
    });
  }

  private async buildMemoryRetrievalCheck(
    userId: string,
    entry: {
      id: string;
      summary: string | null;
      memory: {
        key: string | null;
        value: string | null;
      };
    },
  ) {
    const query = [entry.memory.key, entry.memory.value, entry.summary]
      .filter(
        (value): value is string =>
          typeof value === "string" && value.trim().length > 0,
      )
      .join(" ")
      .trim();
    if (!query) {
      return {
        query: null,
        currentDocumentIncluded: false,
        topMatchDocumentId: null,
        resultCount: 0,
      };
    }
    const preview =
      await this.personalizationService.retrievePersonalizationContext(userId, {
        query,
        maxChunks: 5,
        maxAgeDays: 30,
      });
    const topMatchDocumentId =
      preview.results[0] && "documentId" in preview.results[0]
        ? ((preview.results[0] as { documentId?: string }).documentId ?? null)
        : null;
    return {
      query,
      currentDocumentIncluded: preview.results.some(
        (item) =>
          "documentId" in item &&
          (item as { documentId?: string }).documentId === entry.id,
      ),
      topMatchDocumentId,
      resultCount: preview.results.length,
    };
  }

  private async readMemoryReplayDetails(workflowRunId: string | null) {
    if (!workflowRunId || !this.workflowRuntimeService?.getRunDetails) {
      return null;
    }
    const details =
      await this.workflowRuntimeService.getRunDetails(workflowRunId);
    const run = details?.run;
    if (!run) {
      return null;
    }
    return {
      replayability: run.replayability,
      health: run.health,
      hint: this.buildWorkflowReplayHint({
        replayability: run.replayability,
        health: run.health,
        failureClass: this.classifyWorkflowFailure({
          stageStatusCounts: run.stageStatusCounts,
          replayability: run.replayability,
          health: run.health,
          integrity: run.integrity,
          stages: run.stages,
        }),
      }),
    };
  }

  private async executeAdminReadWithSchemaFallback<T>(
    operation: string,
    fallbackValue: T,
    run: () => Promise<T>,
    warnings: string[],
  ) {
    try {
      return await run();
    } catch (error) {
      if (this.isPrismaSchemaDriftError(error)) {
        warnings.push(operation);
        this.logger.warn(
          JSON.stringify({
            event: "admin.read.schema_drift_fallback",
            operation,
            code: this.readString((error as { code?: unknown }).code),
          }),
        );
        return fallbackValue;
      }
      throw error;
    }
  }

  private isPrismaSchemaDriftError(error: unknown) {
    const code = this.readString((error as { code?: unknown }).code);
    return code === "P2021" || code === "P2022";
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
      moderationDecisionReviews24h?: number;
      blockedProfiles: number;
      pushSent24h: number;
      pushRead24h: number;
    }>(cacheKey);
    if (cached) {
      return {
        ...cached,
        moderationDecisionReviews24h: cached.moderationDecisionReviews24h ?? 0,
      };
    }

    const windowStart = new Date(Date.now() - 24 * 60 * 60_000);
    const [
      dbLatencyMs,
      totalUsers,
      reports24h,
      moderationFlags24h,
      moderationDecisionReviews24h,
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
      this.prisma.auditLog?.count
        ? this.prisma.auditLog.count({
            where: {
              action: "admin.moderation_decision_review",
              createdAt: { gte: windowStart },
            },
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
      moderationDecisionReviews24h,
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
