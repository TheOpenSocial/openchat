import { InjectQueue } from "@nestjs/bullmq";
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  UnauthorizedException,
} from "@nestjs/common";
import { Queue } from "bullmq";
import { randomUUID } from "node:crypto";
import { PrismaService } from "../database/prisma.service.js";
import {
  buildProtocolDiscoveryDocument,
  buildProtocolManifest,
} from "@opensocial/protocol-server";
import { NotificationType } from "@opensocial/types";
import { protocolEventCatalog } from "@opensocial/protocol-events";
import {
  buildProtocolWebhookDelivery,
  protocolWebhookDeliverySchema,
} from "@opensocial/protocol-types";
import {
  appRegistrationRequestSchema,
  appRegistrationSchema,
  capabilityNameSchema,
  eventNameSchema,
  manifestSchema,
  protocolAppConsentRequestCreateSchema,
  protocolAppConsentRequestDecisionSchema,
  protocolAppConsentRequestSchema,
  protocolAppUsageSummarySchema,
  protocolVisibilitySummarySchema,
  protocolWebhookDeliveryGlobalDispatchResultSchema,
  protocolWebhookDeliveryAttemptSchema,
  protocolWebhookDeliveryReplayResultSchema,
  protocolChatActionResultSchema,
  protocolChatCreateActionSchema,
  protocolChatMessageActionResultSchema,
  protocolConnectionActionResultSchema,
  protocolConnectionCreateActionSchema,
  protocolChatSendMessageActionSchema,
  protocolCircleActionResultSchema,
  protocolCircleCreateActionSchema,
  protocolCircleJoinActionSchema,
  protocolCircleLeaveActionSchema,
  protocolAppScopeGrantCreateSchema,
  protocolAppScopeGrantRevokeSchema,
  protocolAppScopeGrantSchema,
  protocolConsentRequestStatusSchema,
  protocolEventEnvelopeSchema,
  protocolIds,
  protocolIntentActionResultSchema,
  protocolIntentCancelActionSchema,
  protocolIntentCreateActionSchema,
  protocolIntentUpdateActionSchema,
  protocolIntentRequestSendActionSchema,
  protocolRequestActionResultSchema,
  protocolRequestDecisionActionSchema,
  protocolReplayCursorSchema,
  protocolGrantSubjectTypeSchema,
  protocolScopeNameSchema,
  protocolWebhookDeliveryRunResultSchema,
  webhookSubscriptionCreateSchema,
  webhookSubscriptionSchema,
  type AppRegistration,
  type AppRegistrationRequest,
  type CapabilityName,
  type ProtocolChatActionResult,
  type ProtocolChatCreateAction,
  type ProtocolChatSendMessageAction,
  type ProtocolConnectionActionResult,
  type ProtocolConnectionCreateAction,
  type ProtocolCircleCreateAction,
  type ProtocolCircleJoinAction,
  type ProtocolCircleLeaveAction,
  type EventName,
  type ProtocolAppConsentRequest,
  type ProtocolAppConsentRequestCreate,
  type ProtocolAppConsentRequestDecision,
  type ProtocolAppScopeGrant,
  type ProtocolAppScopeGrantCreate,
  type ProtocolAppScopeGrantRevoke,
  type ProtocolAppRegistrationResult,
  type ProtocolAppUsageSummary,
  type ProtocolDiscoveryDocument,
  type ProtocolEventEnvelope,
  type ProtocolJsonObject,
  type ProtocolManifest,
  type ProtocolIntentActionResult,
  type ProtocolIntentCancelAction,
  type ProtocolIntentCreateAction,
  type ProtocolIntentUpdateAction,
  type ProtocolIntentRequestSendAction,
  type ProtocolRequestDecisionAction,
  type ProtocolReplayCursor,
  type ResourceName,
  type ProtocolScopeName,
  type ProtocolVisibilitySummary,
  type WebhookSubscription,
  type WebhookSubscriptionCreate,
} from "@opensocial/protocol-types";
import {
  hashProtocolAppToken,
  issueProtocolAppToken,
  verifyProtocolAppToken,
} from "./protocol-credentials.js";
import { ChatsService } from "../chats/chats.service.js";
import { ConnectionsService } from "../connections/connections.service.js";
import { InboxService } from "../inbox/inbox.service.js";
import { IntentsService } from "../intents/intents.service.js";
import { NotificationsService } from "../notifications/notifications.service.js";
import { RecurringCirclesService } from "../recurring-circles/recurring-circles.service.js";
import { ProtocolWebhookDeliveryRunnerService } from "./protocol-webhook-delivery-runner.service.js";
import { ProtocolWebhookDeliveryWorkerService } from "./protocol-webhook-delivery-worker.service.js";
import { signProtocolWebhookPayload } from "./protocol-webhooks.js";

type ProtocolAppRow = {
  app_id: string;
  status: string;
  registration_json: unknown;
  manifest_json: unknown;
  issued_scopes: string[] | null;
  issued_capabilities: string[] | null;
  app_token_hash: string;
  updated_at: Date | string;
};

type ProtocolWebhookSubscriptionRow = {
  subscription_id: string;
  app_id: string;
  status: string;
  target_url: string;
  event_names: string[] | null;
  resource_names: string[] | null;
  delivery_mode: string;
  retry_policy: unknown;
  secret_ref: string | null;
  metadata: unknown;
  created_at: Date | string;
  updated_at: Date | string;
};

type ProtocolEventLogRow = {
  cursor: bigint | number | string;
  actor_app_id: string | null;
  event_name: string;
  resource: string | null;
  payload: unknown;
  metadata: unknown;
  created_at: Date | string;
};

type ProtocolAuthFailureType =
  | "missing_token"
  | "app_not_found"
  | "app_revoked"
  | "invalid_token"
  | "missing_scopes"
  | "missing_capabilities"
  | "missing_delegated_grant";

type ProtocolCursorRow = {
  app_id: string;
  cursor: bigint | number | string;
  updated_at: Date | string;
};

type ProtocolWebhookDeliveryRow = {
  delivery_id: string;
  subscription_id: string;
  app_id: string;
  event_cursor: bigint | number | string | null;
  event_name: string;
  status: string;
  attempt_count: number;
  next_attempt_at: Date | string | null;
  last_attempt_at: Date | string | null;
  delivered_at: Date | string | null;
  response_status_code: number | null;
  error_message: string | null;
  signature: string | null;
  payload: unknown;
  metadata: unknown;
  created_at: Date | string;
  updated_at: Date | string;
};

type ProtocolWebhookDeliveryAttemptRow = {
  delivery_id: string;
  app_id: string;
  subscription_id: string;
  attempt_number: number;
  outcome: string;
  attempted_at: Date | string;
  response_status_code: number | null;
  error_code: string | null;
  error_message: string | null;
  duration_ms: number | null;
  metadata: unknown;
  created_at: Date | string;
};

type ProtocolAppScopeGrantRow = {
  id: string;
  app_id: string;
  scope: string;
  capabilities: string[] | null;
  subject_type: string;
  subject_id: string | null;
  status: string;
  granted_by_user_id: string | null;
  granted_at: Date | string;
  revoked_at: Date | string | null;
  metadata: unknown;
  created_at: Date | string;
  updated_at: Date | string;
};

type ProtocolAppConsentRequestRow = {
  id: string;
  app_id: string;
  scope: string;
  capabilities: string[] | null;
  subject_type: string;
  subject_id: string | null;
  status: string;
  requested_by_user_id: string | null;
  approved_by_user_id: string | null;
  rejected_by_user_id: string | null;
  approved_grant_id: string | null;
  requested_at: Date | string;
  approved_at: Date | string | null;
  rejected_at: Date | string | null;
  cancelled_at: Date | string | null;
  expired_at: Date | string | null;
  metadata: unknown;
  created_at: Date | string;
  updated_at: Date | string;
};

type ProtocolDeliveryStatusCountRow = {
  status: string;
  count: bigint | number | string;
};

type ProtocolStatusCountRow = {
  status: string;
  count: bigint | number | string;
};

type RegisteredProtocolApp = {
  status: string;
  registration: AppRegistration;
  manifest: ProtocolManifest;
  issuedScopes: ProtocolScopeName[];
  issuedCapabilities: CapabilityName[];
  appTokenHash: string;
  updatedAt: string;
};

const FIRST_PARTY_PROTOCOL_ACTOR_APP_ID = "opensocial-firstparty";

@Injectable()
export class ProtocolService {
  private readonly logger = new Logger(ProtocolService.name);
  private static readonly DEFAULT_TOKEN_ROTATION_WINDOW_DAYS = 90;

  constructor(
    private readonly prisma: PrismaService,
    private readonly deliveryWorker: ProtocolWebhookDeliveryWorkerService,
    private readonly deliveryRunner: ProtocolWebhookDeliveryRunnerService,
    @InjectQueue("protocol-webhooks")
    private readonly protocolWebhooksQueue: Queue,
    @Optional() private readonly intentsService?: IntentsService,
    @Optional() private readonly inboxService?: InboxService,
    @Optional() private readonly chatsService?: ChatsService,
    @Optional() private readonly connectionsService?: ConnectionsService,
    @Optional()
    private readonly recurringCirclesService?: RecurringCirclesService,
    @Optional()
    private readonly notificationsService?: NotificationsService,
  ) {}

  getManifest(): ProtocolManifest {
    return buildProtocolManifest({
      appId: "opensocial-api",
      version: "0.1.0",
      homepageUrl: process.env.APP_BASE_URL?.trim() || undefined,
      metadata: {
        environment: process.env.NODE_ENV ?? "development",
      },
    });
  }

  getDiscovery(): ProtocolDiscoveryDocument {
    return buildProtocolDiscoveryDocument({
      appId: "opensocial-api",
      version: "0.1.0",
      homepageUrl: process.env.APP_BASE_URL?.trim() || undefined,
      metadata: {
        environment: process.env.NODE_ENV ?? "development",
      },
    });
  }

  listEvents() {
    return protocolEventCatalog;
  }

  private getTokenRotationWindowDays() {
    const configured = Number(
      process.env.PROTOCOL_APP_TOKEN_ROTATE_AFTER_DAYS ||
        ProtocolService.DEFAULT_TOKEN_ROTATION_WINDOW_DAYS,
    );
    if (!Number.isFinite(configured) || configured < 1) {
      return ProtocolService.DEFAULT_TOKEN_ROTATION_WINDOW_DAYS;
    }
    return Math.floor(configured);
  }

  private buildTokenAudit(input: {
    appUpdatedAt: string;
    appCreatedAt: string | null;
    lastRotatedAt: string | null;
    lastRevokedAt: string | null;
  }) {
    const rotationWindowDays = this.getTokenRotationWindowDays();
    const currentTokenIssuedAt =
      input.lastRotatedAt ?? input.appCreatedAt ?? input.appUpdatedAt;
    const currentIssuedAtMs = Date.parse(currentTokenIssuedAt);
    const safeIssuedAtMs = Number.isFinite(currentIssuedAtMs)
      ? currentIssuedAtMs
      : Date.now();
    const tokenAgeDays = Math.max(
      0,
      Math.floor((Date.now() - safeIssuedAtMs) / (24 * 60 * 60 * 1000)),
    );
    const recommendedRotateBy = new Date(
      safeIssuedAtMs + rotationWindowDays * 24 * 60 * 60 * 1000,
    ).toISOString();
    const freshness =
      tokenAgeDays >= rotationWindowDays
        ? "stale"
        : tokenAgeDays >= Math.max(1, rotationWindowDays - 14)
          ? "rotate_soon"
          : "current";

    return {
      appUpdatedAt: input.appUpdatedAt,
      lastRotatedAt: input.lastRotatedAt,
      lastRevokedAt: input.lastRevokedAt,
      currentTokenIssuedAt,
      recommendedRotateBy,
      tokenAgeDays,
      rotationWindowDays,
      freshness,
    };
  }

  async listApps() {
    const rows = await this.prisma.$queryRawUnsafe<ProtocolAppRow[]>(
      `SELECT app_id, status, registration_json, manifest_json, issued_scopes, issued_capabilities, app_token_hash, updated_at
       FROM protocol_apps
       ORDER BY app_id ASC`,
    );
    return rows.map((row) => this.mapAppRow(row));
  }

  async getVisibilitySummary(): Promise<ProtocolVisibilitySummary> {
    const [
      apps,
      deliveryRows,
      grantRows,
      consentRequestRows,
      webhookRows,
      queueState,
    ] = await Promise.all([
      this.listApps(),
      this.prisma.$queryRawUnsafe<ProtocolDeliveryStatusCountRow[]>(
        `SELECT status, COUNT(*)::bigint AS count
         FROM protocol_webhook_deliveries
         GROUP BY status`,
      ),
      this.prisma.$queryRawUnsafe<ProtocolStatusCountRow[]>(
        `SELECT status, COUNT(*)::bigint AS count
         FROM protocol_app_scope_grants
         GROUP BY status`,
      ),
      this.prisma.$queryRawUnsafe<ProtocolStatusCountRow[]>(
        `SELECT status, COUNT(*)::bigint AS count
         FROM protocol_app_consent_requests
         GROUP BY status`,
      ),
      this.prisma.$queryRawUnsafe<ProtocolStatusCountRow[]>(
        `SELECT status, COUNT(*)::bigint AS count
         FROM protocol_webhook_subscriptions
         GROUP BY status`,
      ),
      this.protocolWebhooksQueue.getJobCounts(
        "waiting",
        "active",
        "delayed",
        "completed",
        "failed",
      ),
    ]);
    const deliveryCounts = Object.fromEntries(
      deliveryRows.map((row) => [row.status, Number(row.count)]),
    ) as Record<string, number>;
    const grantCounts = Object.fromEntries(
      grantRows.map((row) => [row.status, Number(row.count)]),
    ) as Record<string, number>;
    const consentRequestCounts = Object.fromEntries(
      consentRequestRows.map((row) => [row.status, Number(row.count)]),
    ) as Record<string, number>;
    const webhookCounts = Object.fromEntries(
      webhookRows.map((row) => [row.status, Number(row.count)]),
    ) as Record<string, number>;

    return protocolVisibilitySummarySchema.parse({
      generatedAt: new Date().toISOString(),
      linkedApps: apps.length,
      apps: apps.slice(0, 6).map((app) => ({
        appId: app.registration.appId,
        name: app.registration.name,
        summary: app.registration.summary,
        kind: app.registration.kind,
        status: app.registration.status,
        issuedScopes: app.issuedScopes,
        issuedCapabilities: app.issuedCapabilities,
      })),
      recentEvents: protocolEventCatalog.slice(0, 6),
      queue: {
        queuedCount: deliveryCounts.queued ?? 0,
        retryingCount: deliveryCounts.retrying ?? 0,
        deliveredCount: deliveryCounts.delivered ?? 0,
        failedCount: deliveryCounts.failed ?? 0,
        deadLetteredCount: deliveryCounts.dead_lettered ?? 0,
        replayableCount: deliveryCounts.dead_lettered ?? 0,
        workerQueue: {
          waiting: queueState.waiting ?? 0,
          active: queueState.active ?? 0,
          delayed: queueState.delayed ?? 0,
          completed: queueState.completed ?? 0,
          failed: queueState.failed ?? 0,
        },
      },
      access: {
        grantCounts: {
          active: grantCounts.active ?? 0,
          revoked: grantCounts.revoked ?? 0,
        },
        consentRequestCounts: {
          pending: consentRequestCounts.pending ?? 0,
          approved: consentRequestCounts.approved ?? 0,
          rejected: consentRequestCounts.rejected ?? 0,
          cancelled: consentRequestCounts.cancelled ?? 0,
          expired: consentRequestCounts.expired ?? 0,
        },
        webhookCounts: {
          active: webhookCounts.active ?? 0,
          paused: webhookCounts.paused ?? 0,
          failed: webhookCounts.failed ?? 0,
          revoked: webhookCounts.revoked ?? 0,
        },
      },
    });
  }

  async getApp(appId: string) {
    const row = await this.findAppRow(appId);
    if (!row) {
      throw new NotFoundException("protocol app not found");
    }
    return this.mapAppRow(row);
  }

  async listAppGrants(appId: string, appToken: string) {
    const app = await this.requireAppAccess(appId, appToken, {
      scopes: ["protocol.read"],
      capabilities: ["app.read"],
    });

    const rows = await this.prisma.$queryRawUnsafe<ProtocolAppScopeGrantRow[]>(
      `SELECT id, app_id, scope, capabilities, subject_type, subject_id, status, granted_by_user_id, granted_at, revoked_at, metadata, created_at, updated_at
       FROM protocol_app_scope_grants
       WHERE app_id = $1
       ORDER BY created_at DESC`,
      app.registration.appId,
    );

    return rows.map((row) => this.mapGrantRow(row));
  }

  async listAppConsentRequests(appId: string, appToken: string) {
    const app = await this.requireAppAccess(appId, appToken, {
      scopes: ["protocol.read"],
      capabilities: ["app.read"],
    });

    const rows = await this.prisma.$queryRawUnsafe<
      ProtocolAppConsentRequestRow[]
    >(
      `SELECT id, app_id, scope, capabilities, subject_type, subject_id, status, requested_by_user_id, approved_by_user_id, rejected_by_user_id, approved_grant_id, requested_at, approved_at, rejected_at, cancelled_at, expired_at, metadata, created_at, updated_at
       FROM protocol_app_consent_requests
       WHERE app_id = $1
       ORDER BY created_at DESC`,
      app.registration.appId,
    );

    return rows.map((row) => this.mapConsentRequestRow(row));
  }

  async createAppGrant(
    appId: string,
    appToken: string,
    input: ProtocolAppScopeGrantCreate,
  ) {
    const app = await this.requireAppAccess(appId, appToken, {
      scopes: ["protocol.write"],
      capabilities: ["app.write"],
    });
    const payload = protocolAppScopeGrantCreateSchema.parse(input);
    const now = new Date().toISOString();
    const grant = await this.upsertAppGrantRecord(app, payload, now);
    await this.recordEvent({
      actorAppId: app.registration.appId,
      event: "app.updated",
      resource: "app_registration",
      payload: {
        appId: app.registration.appId,
        update: "scope_grant_upserted",
        grantId: grant.grantId,
        scope: grant.scope,
        subjectType: grant.subjectType,
        subjectId: grant.subjectId,
      },
    });
    return grant;
  }

  async createAppConsentRequest(
    appId: string,
    appToken: string,
    input: ProtocolAppConsentRequestCreate,
  ) {
    const app = await this.requireAppAccess(appId, appToken, {
      scopes: ["protocol.write"],
      capabilities: ["app.write"],
    });
    const payload = protocolAppConsentRequestCreateSchema.parse(input);
    const now = new Date().toISOString();
    const subjectType = protocolGrantSubjectTypeSchema.parse(
      payload.subjectType,
    );
    const subjectId =
      subjectType === "app"
        ? payload.subjectId?.trim() || app.registration.appId
        : payload.subjectId?.trim();

    if (!subjectId) {
      throw new ForbiddenException(`${subjectType} subjectId is required`);
    }

    const rows = await this.prisma.$queryRawUnsafe<
      ProtocolAppConsentRequestRow[]
    >(
      `INSERT INTO protocol_app_consent_requests
       (app_id, scope, capabilities, subject_type, subject_id, status, requested_by_user_id, requested_at, metadata, created_at, updated_at)
       VALUES ($1, $2, $3::text[], $4, $5, 'pending', $6::uuid, $7::timestamptz, $8::jsonb, $9::timestamptz, $10::timestamptz)
       RETURNING id, app_id, scope, capabilities, subject_type, subject_id, status, requested_by_user_id, approved_by_user_id, rejected_by_user_id, approved_grant_id, requested_at, approved_at, rejected_at, cancelled_at, expired_at, metadata, created_at, updated_at`,
      app.registration.appId,
      payload.scope,
      payload.capabilities,
      subjectType,
      subjectId,
      payload.requestedByUserId ?? null,
      now,
      JSON.stringify(payload.metadata ?? {}),
      now,
      now,
    );

    const consentRequest = this.mapConsentRequestRow(rows[0]);
    await this.recordEvent({
      actorAppId: app.registration.appId,
      event: "app.updated",
      resource: "app_consent_request",
      payload: {
        appId: app.registration.appId,
        update: "consent_request_created",
        requestId: consentRequest.requestId,
        scope: consentRequest.scope,
        subjectType: consentRequest.subjectType,
        subjectId: consentRequest.subjectId,
      },
    });
    return consentRequest;
  }

  async approveAppConsentRequest(
    appId: string,
    requestId: string,
    appToken: string,
    input: ProtocolAppConsentRequestDecision,
  ) {
    const app = await this.requireAppAccess(appId, appToken, {
      scopes: ["protocol.write"],
      capabilities: ["app.write"],
    });
    const payload = protocolAppConsentRequestDecisionSchema.parse(input);
    const now = new Date().toISOString();
    const rows = await this.prisma.$queryRawUnsafe<
      ProtocolAppConsentRequestRow[]
    >(
      `SELECT id, app_id, scope, capabilities, subject_type, subject_id, status, requested_by_user_id, approved_by_user_id, rejected_by_user_id, approved_grant_id, requested_at, approved_at, rejected_at, cancelled_at, expired_at, metadata, created_at, updated_at
       FROM protocol_app_consent_requests
       WHERE app_id = $1 AND id = $2::uuid
       LIMIT 1`,
      app.registration.appId,
      requestId,
    );
    const requestRow = rows[0];
    if (!requestRow) {
      throw new NotFoundException("protocol app consent request not found");
    }
    if (requestRow.status !== "pending") {
      throw new ConflictException(
        "protocol app consent request is not pending",
      );
    }
    const grantedByUserId =
      payload.approvedByUserId ?? requestRow.requested_by_user_id ?? undefined;

    const grant = await this.upsertAppGrantRecord(
      app,
      {
        scope: requestRow.scope as ProtocolScopeName,
        capabilities: (requestRow.capabilities ?? []).map((capability) =>
          capabilityNameSchema.parse(capability),
        ),
        subjectType: protocolGrantSubjectTypeSchema.parse(
          requestRow.subject_type,
        ),
        subjectId: requestRow.subject_id ?? requestRow.app_id,
        ...(grantedByUserId ? { grantedByUserId } : {}),
        metadata: {
          ...((requestRow.metadata && typeof requestRow.metadata === "object"
            ? requestRow.metadata
            : {}) as ProtocolJsonObject),
          ...(payload.metadata ?? {}),
        },
      },
      now,
    );

    const updatedRows = await this.prisma.$queryRawUnsafe<
      ProtocolAppConsentRequestRow[]
    >(
      `UPDATE protocol_app_consent_requests
       SET status = 'approved',
           approved_grant_id = $3::uuid,
           approved_by_user_id = $4::uuid,
           approved_at = $5::timestamptz,
           metadata = COALESCE(metadata, '{}'::jsonb) || $6::jsonb,
           updated_at = $5::timestamptz
       WHERE app_id = $1 AND id = $2::uuid
       RETURNING id, app_id, scope, capabilities, subject_type, subject_id, status, requested_by_user_id, approved_by_user_id, rejected_by_user_id, approved_grant_id, requested_at, approved_at, rejected_at, cancelled_at, expired_at, metadata, created_at, updated_at`,
      app.registration.appId,
      requestId,
      grant.grantId,
      payload.approvedByUserId ?? requestRow.requested_by_user_id ?? null,
      now,
      JSON.stringify(payload.metadata ?? {}),
    );

    const consentRequest = this.mapConsentRequestRow(updatedRows[0]);
    await this.recordEvent({
      actorAppId: app.registration.appId,
      event: "app.updated",
      resource: "app_consent_request",
      payload: {
        appId: app.registration.appId,
        update: "consent_request_approved",
        requestId: consentRequest.requestId,
        grantId: consentRequest.approvedGrantId,
      },
    });
    return consentRequest;
  }

  async rejectAppConsentRequest(
    appId: string,
    requestId: string,
    appToken: string,
    input: ProtocolAppConsentRequestDecision,
  ) {
    const app = await this.requireAppAccess(appId, appToken, {
      scopes: ["protocol.write"],
      capabilities: ["app.write"],
    });
    const payload = protocolAppConsentRequestDecisionSchema.parse(input);
    const now = new Date().toISOString();
    const rows = await this.prisma.$queryRawUnsafe<
      ProtocolAppConsentRequestRow[]
    >(
      `SELECT id, app_id, scope, capabilities, subject_type, subject_id, status, requested_by_user_id, approved_by_user_id, rejected_by_user_id, approved_grant_id, requested_at, approved_at, rejected_at, cancelled_at, expired_at, metadata, created_at, updated_at
       FROM protocol_app_consent_requests
       WHERE app_id = $1 AND id = $2::uuid
       LIMIT 1`,
      app.registration.appId,
      requestId,
    );
    const requestRow = rows[0];
    if (!requestRow) {
      throw new NotFoundException("protocol app consent request not found");
    }
    if (requestRow.status !== "pending") {
      throw new ConflictException(
        "protocol app consent request is not pending",
      );
    }

    const updatedRows = await this.prisma.$queryRawUnsafe<
      ProtocolAppConsentRequestRow[]
    >(
      `UPDATE protocol_app_consent_requests
       SET status = 'rejected',
           rejected_by_user_id = $3::uuid,
           rejected_at = $4::timestamptz,
           metadata = COALESCE(metadata, '{}'::jsonb) || $5::jsonb,
           updated_at = $4::timestamptz
       WHERE app_id = $1 AND id = $2::uuid
       RETURNING id, app_id, scope, capabilities, subject_type, subject_id, status, requested_by_user_id, approved_by_user_id, rejected_by_user_id, approved_grant_id, requested_at, approved_at, rejected_at, cancelled_at, expired_at, metadata, created_at, updated_at`,
      app.registration.appId,
      requestId,
      payload.rejectedByUserId ?? requestRow.requested_by_user_id ?? null,
      now,
      JSON.stringify(payload.metadata ?? {}),
    );

    const consentRequest = this.mapConsentRequestRow(updatedRows[0]);
    await this.recordEvent({
      actorAppId: app.registration.appId,
      event: "app.updated",
      resource: "app_consent_request",
      payload: {
        appId: app.registration.appId,
        update: "consent_request_rejected",
        requestId: consentRequest.requestId,
      },
    });
    return consentRequest;
  }

  async revokeAppGrant(
    appId: string,
    grantId: string,
    appToken: string,
    input: ProtocolAppScopeGrantRevoke,
  ) {
    const app = await this.requireAppAccess(appId, appToken, {
      scopes: ["protocol.write"],
      capabilities: ["app.write"],
    });
    const payload = protocolAppScopeGrantRevokeSchema.parse(input);
    const now = new Date().toISOString();

    const rows = await this.prisma.$queryRawUnsafe<ProtocolAppScopeGrantRow[]>(
      `UPDATE protocol_app_scope_grants
       SET status = 'revoked',
           revoked_at = $3::timestamptz,
           metadata = COALESCE(metadata, '{}'::jsonb) || $4::jsonb,
           updated_at = $3::timestamptz
       WHERE app_id = $1 AND id = $2::uuid
       RETURNING id, app_id, scope, capabilities, subject_type, subject_id, status, granted_by_user_id, granted_at, revoked_at, metadata, created_at, updated_at`,
      app.registration.appId,
      grantId,
      now,
      JSON.stringify({
        revokedByUserId: payload.revokedByUserId ?? null,
        ...(payload.metadata ?? {}),
      }),
    );

    const row = rows[0];
    if (!row) {
      throw new NotFoundException("protocol app grant not found");
    }

    const grant = this.mapGrantRow(row);
    await this.recordEvent({
      actorAppId: app.registration.appId,
      event: "app.updated",
      resource: "app_registration",
      payload: {
        appId: app.registration.appId,
        update: "scope_grant_revoked",
        grantId: grant.grantId,
        scope: grant.scope,
      },
    });
    return grant;
  }

  private async upsertAppGrantRecord(
    app: RegisteredProtocolApp,
    input: ProtocolAppScopeGrantCreate,
    now: string,
  ) {
    const payload = protocolAppScopeGrantCreateSchema.parse(input);
    const subjectType = protocolGrantSubjectTypeSchema.parse(
      payload.subjectType,
    );
    const subjectId =
      subjectType === "app"
        ? payload.subjectId?.trim() || app.registration.appId
        : payload.subjectId?.trim();

    if (!subjectId) {
      throw new ForbiddenException(`${subjectType} subjectId is required`);
    }

    const rows = await this.prisma.$queryRawUnsafe<ProtocolAppScopeGrantRow[]>(
      `INSERT INTO protocol_app_scope_grants
       (app_id, scope, capabilities, subject_type, subject_id, status, granted_by_user_id, granted_at, metadata, created_at, updated_at)
       VALUES ($1, $2, $3::text[], $4, $5, 'active', $6::uuid, $7::timestamptz, $8::jsonb, $9::timestamptz, $10::timestamptz)
       ON CONFLICT (app_id, scope, subject_type, subject_id)
       DO UPDATE SET capabilities = EXCLUDED.capabilities,
                     status = 'active',
                     granted_by_user_id = EXCLUDED.granted_by_user_id,
                     granted_at = EXCLUDED.granted_at,
                     revoked_at = NULL,
                     metadata = EXCLUDED.metadata,
                     updated_at = EXCLUDED.updated_at
       RETURNING id, app_id, scope, capabilities, subject_type, subject_id, status, granted_by_user_id, granted_at, revoked_at, metadata, created_at, updated_at`,
      app.registration.appId,
      payload.scope,
      payload.capabilities,
      subjectType,
      subjectId,
      payload.grantedByUserId ?? null,
      now,
      JSON.stringify(payload.metadata ?? {}),
      now,
      now,
    );

    const grant = rows[0];
    if (!grant) {
      throw new NotFoundException("protocol app grant not found");
    }
    return this.mapGrantRow(grant);
  }

  async rotateAppToken(appId: string, appToken: string) {
    const app = await this.requireAppAccess(appId, appToken, {
      scopes: ["protocol.write"],
      capabilities: ["app.write"],
    });

    const now = new Date().toISOString();
    const nextToken = issueProtocolAppToken();
    const nextTokenHash = hashProtocolAppToken(nextToken);
    const nextRegistration = appRegistrationSchema.parse({
      ...app.registration,
      status: app.registration.status === "revoked" ? "draft" : "active",
      updatedAt: now,
    });

    await this.prisma.$executeRawUnsafe(
      `UPDATE protocol_apps
       SET status = $2,
           registration_json = $3::jsonb,
           app_token_hash = $4,
           updated_at = $5::timestamptz
       WHERE app_id = $1`,
      app.registration.appId,
      "active",
      JSON.stringify(nextRegistration),
      nextTokenHash,
      now,
    );

    await this.recordEvent({
      actorAppId: app.registration.appId,
      event: "app.updated",
      resource: "app_registration",
      payload: {
        appId: app.registration.appId,
        update: "app_token_rotated",
      },
    });

    return {
      registration: nextRegistration,
      manifest: app.manifest,
      issuedScopes: app.issuedScopes,
      issuedCapabilities: app.issuedCapabilities,
      credentials: {
        appToken: nextToken,
      },
    };
  }

  async revokeAppToken(appId: string, appToken: string) {
    const app = await this.requireAppAccess(appId, appToken, {
      scopes: ["protocol.write"],
      capabilities: ["app.write"],
    });

    const now = new Date().toISOString();
    const revokedRegistration = appRegistrationSchema.parse({
      ...app.registration,
      status: "revoked",
      updatedAt: now,
    });
    const revokedHash = hashProtocolAppToken(issueProtocolAppToken());

    await this.prisma.$executeRawUnsafe(
      `UPDATE protocol_apps
       SET status = $2,
           registration_json = $3::jsonb,
           app_token_hash = $4,
           updated_at = $5::timestamptz
       WHERE app_id = $1`,
      app.registration.appId,
      "revoked",
      JSON.stringify(revokedRegistration),
      revokedHash,
      now,
    );

    await this.recordEvent({
      actorAppId: app.registration.appId,
      event: "app.updated",
      resource: "app_registration",
      payload: {
        appId: app.registration.appId,
        update: "app_token_revoked",
      },
    });

    return {
      registration: revokedRegistration,
      manifest: app.manifest,
      issuedScopes: app.issuedScopes,
      issuedCapabilities: app.issuedCapabilities,
      revoked: true,
    };
  }

  async registerApp(
    input: AppRegistrationRequest,
  ): Promise<ProtocolAppRegistrationResult> {
    const payload = appRegistrationRequestSchema.parse(input);
    const registration = appRegistrationSchema.parse(payload.registration);
    const manifest = buildProtocolManifest({
      appId: payload.manifest.appId,
      version: payload.manifest.version,
      name: payload.manifest.name,
      summary: payload.manifest.summary,
      description: payload.manifest.description,
      homepageUrl: payload.manifest.homepageUrl,
      iconUrl: payload.manifest.iconUrl,
      categories: payload.manifest.categories,
      capabilities: payload.manifest.capabilities,
      metadata: payload.manifest.metadata,
    });

    if (registration.appId !== manifest.appId) {
      throw new ConflictException(
        "registration app id must match manifest app id",
      );
    }

    const existing = await this.findAppRow(registration.appId);
    if (existing) {
      throw new ConflictException("protocol app already registered");
    }

    const issuedScopes = this.issueScopes(
      payload.requestedScopes,
      registration.capabilities.scopes,
      manifest.capabilities.scopes,
    );
    const issuedCapabilities = this.issueCapabilities(
      payload.requestedCapabilities,
      registration.capabilities.capabilities,
      manifest.capabilities.capabilities,
    );

    const now = new Date().toISOString();
    const storedRegistration = appRegistrationSchema.parse({
      ...registration,
      status: registration.status === "revoked" ? "draft" : "active",
      createdAt: now,
      updatedAt: now,
      capabilities: {
        ...registration.capabilities,
        scopes: issuedScopes,
        capabilities: issuedCapabilities,
      },
    });
    const storedManifest = manifestSchema.parse({
      ...manifest,
      capabilities: {
        ...manifest.capabilities,
        scopes: issuedScopes,
        capabilities: issuedCapabilities,
      },
    });

    const appToken = issueProtocolAppToken();
    const appTokenHash = hashProtocolAppToken(appToken);

    await this.prisma.$executeRawUnsafe(
      `INSERT INTO protocol_apps
       (app_id, status, registration_json, manifest_json, issued_scopes, issued_capabilities, app_token_hash, created_at, updated_at)
       VALUES ($1, $2, $3::jsonb, $4::jsonb, $5::text[], $6::text[], $7, $8::timestamptz, $9::timestamptz)`,
      storedRegistration.appId,
      "active",
      JSON.stringify(storedRegistration),
      JSON.stringify(storedManifest),
      issuedScopes,
      issuedCapabilities,
      appTokenHash,
      now,
      now,
    );

    await this.recordEvent({
      actorAppId: storedRegistration.appId,
      event: "app.registered",
      resource: "app_registration",
      payload: {
        appId: storedRegistration.appId,
        kind: storedRegistration.kind,
        scopes: issuedScopes,
        capabilities: issuedCapabilities,
      },
    });

    return {
      registration: storedRegistration,
      manifest: storedManifest,
      issuedScopes,
      issuedCapabilities,
      credentials: {
        appToken,
      },
    };
  }

  async listWebhooks(appId: string, appToken: string) {
    const app = await this.requireAppAccess(appId, appToken, {
      scopes: ["webhooks.manage"],
      capabilities: ["webhook.read"],
    });

    const rows = await this.prisma.$queryRawUnsafe<
      ProtocolWebhookSubscriptionRow[]
    >(
      `SELECT subscription_id, app_id, status, target_url, event_names, resource_names, delivery_mode, retry_policy, secret_ref, metadata, created_at, updated_at
       FROM protocol_webhook_subscriptions
       WHERE app_id = $1
       ORDER BY created_at ASC`,
      app.registration.appId,
    );

    return rows.map((row) => this.mapWebhookRow(row));
  }

  async createWebhook(
    appId: string,
    appToken: string,
    input: WebhookSubscriptionCreate,
  ) {
    const app = await this.requireAppAccess(appId, appToken, {
      scopes: ["webhooks.manage"],
      capabilities: ["webhook.write"],
    });
    const payload = webhookSubscriptionCreateSchema.parse(input);
    const now = new Date().toISOString();
    const subscription = webhookSubscriptionSchema.parse({
      protocolId: protocolIds.webhookSubscription,
      subscriptionId: `${app.registration.appId}.${randomUUID()}`,
      appId: app.registration.appId,
      targetUrl: payload.targetUrl,
      events: payload.events,
      resources: payload.resources,
      status: "active",
      deliveryMode: payload.deliveryMode,
      secretRef: payload.secretRef,
      retryPolicy: payload.retryPolicy,
      metadata: payload.metadata,
      createdAt: now,
      updatedAt: now,
    });

    await this.prisma.$executeRawUnsafe(
      `INSERT INTO protocol_webhook_subscriptions
       (subscription_id, app_id, status, target_url, event_names, resource_names, delivery_mode, retry_policy, secret_ref, metadata, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5::text[], $6::text[], $7, $8::jsonb, $9, $10::jsonb, $11::timestamptz, $12::timestamptz)`,
      subscription.subscriptionId,
      subscription.appId,
      subscription.status,
      subscription.targetUrl,
      subscription.events,
      subscription.resources,
      subscription.deliveryMode,
      JSON.stringify(subscription.retryPolicy),
      subscription.secretRef ?? null,
      JSON.stringify(subscription.metadata),
      now,
      now,
    );

    await this.recordEvent({
      actorAppId: app.registration.appId,
      event: "app.updated",
      resource: "app_registration",
      payload: {
        appId: app.registration.appId,
        update: "webhook_subscription_added",
        subscriptionId: subscription.subscriptionId,
      },
    });

    return subscription;
  }

  async listWebhookDeliveries(
    appId: string,
    appToken: string,
    subscriptionId: string,
  ) {
    const app = await this.requireAppAccess(appId, appToken, {
      scopes: ["webhooks.manage"],
      capabilities: ["webhook.read"],
    });
    const rows = await this.prisma.$queryRawUnsafe<
      ProtocolWebhookDeliveryRow[]
    >(
      `SELECT delivery_id, subscription_id, app_id, event_cursor, event_name, status, attempt_count, next_attempt_at, last_attempt_at, delivered_at, response_status_code, error_message, signature, payload, metadata, created_at, updated_at
       FROM protocol_webhook_deliveries
       WHERE app_id = $1 AND subscription_id = $2
       ORDER BY created_at DESC`,
      app.registration.appId,
      subscriptionId,
    );
    return rows.map((row) => this.mapDeliveryRow(row));
  }

  async listWebhookDeliveryAttempts(
    appId: string,
    appToken: string,
    deliveryId: string,
  ) {
    const app = await this.requireAppAccess(appId, appToken, {
      scopes: ["webhooks.manage"],
      capabilities: ["webhook.read"],
    });
    const rows = await this.prisma.$queryRawUnsafe<
      ProtocolWebhookDeliveryAttemptRow[]
    >(
      `SELECT delivery_id, app_id, subscription_id, attempt_number, outcome, attempted_at, response_status_code, error_code, error_message, duration_ms, metadata, created_at
       FROM protocol_webhook_delivery_attempts
       WHERE app_id = $1 AND delivery_id = $2
       ORDER BY attempted_at DESC`,
      app.registration.appId,
      deliveryId,
    );
    return rows.map((row) => this.mapDeliveryAttemptRow(row));
  }

  async inspectDeliveryQueue(appId: string, appToken: string, cursor?: string) {
    const app = await this.requireAppAccess(appId, appToken, {
      scopes: ["webhooks.manage"],
      capabilities: ["webhook.read"],
    });
    const sinceCursor = cursor ? Number.parseInt(cursor, 10) : 0;
    if (Number.isNaN(sinceCursor) || sinceCursor < 0) {
      throw new ForbiddenException("invalid delivery queue cursor");
    }

    const rows = await this.prisma.$queryRawUnsafe<
      ProtocolWebhookDeliveryRow[]
    >(
      `SELECT delivery_id, subscription_id, app_id, event_cursor, event_name, status, attempt_count, next_attempt_at, last_attempt_at, delivered_at, response_status_code, error_message, signature, payload, metadata, created_at, updated_at
       FROM protocol_webhook_deliveries
       WHERE app_id = $1
         AND ($2::bigint = 0 OR COALESCE(event_cursor, 0) > $2::bigint)
       ORDER BY created_at DESC
       LIMIT 100`,
      app.registration.appId,
      sinceCursor,
    );

    const deliveries = rows.map((row) => this.mapDeliveryRow(row));
    const queueState = await this.protocolWebhooksQueue.getJobCounts(
      "waiting",
      "active",
      "delayed",
      "completed",
      "failed",
    );
    const oldestQueuedAt =
      deliveries
        .filter((row) => row.status === "queued")
        .map((row) => row.createdAt)
        .sort()[0] ?? null;
    const oldestRetryingAt =
      deliveries
        .filter((row) => row.status === "retrying")
        .map((row) => row.updatedAt)
        .sort()[0] ?? null;
    const lastDeadLetteredAt =
      deliveries
        .filter((row) => row.status === "dead_lettered")
        .map((row) => row.updatedAt)
        .sort()
        .at(-1) ?? null;
    return {
      appId: app.registration.appId,
      generatedAt: new Date().toISOString(),
      queuedCount: deliveries.filter((row) => row.status === "queued").length,
      inFlightCount: deliveries.filter((row) => row.status === "retrying")
        .length,
      failedCount: deliveries.filter((row) => row.status === "failed").length,
      deadLetteredCount: deliveries.filter(
        (row) => row.status === "dead_lettered",
      ).length,
      replayableCount: deliveries.filter(
        (row) => row.status === "dead_lettered",
      ).length,
      oldestQueuedAt,
      oldestRetryingAt,
      lastDeadLetteredAt,
      queueState: {
        waiting: queueState.waiting ?? 0,
        active: queueState.active ?? 0,
        delayed: queueState.delayed ?? 0,
        completed: queueState.completed ?? 0,
        failed: queueState.failed ?? 0,
      },
      deliveries,
    };
  }

  async claimDueWebhookDeliveries(limit = 25) {
    return this.deliveryWorker.claimDueDeliveries(limit);
  }

  async replayWebhookDelivery(
    appId: string,
    appToken: string,
    deliveryId: string,
  ) {
    const app = await this.requireAppAccess(appId, appToken, {
      scopes: ["webhooks.manage"],
      capabilities: ["webhook.write"],
    });
    const replayed = await this.deliveryWorker.replayDeadLetteredDelivery(
      deliveryId,
      app.registration.appId,
      new Date(),
    );

    await this.deliveryWorker.recordAttempt({
      deliveryId: replayed.deliveryId,
      appId: replayed.appId,
      subscriptionId: replayed.subscriptionId,
      attemptNumber: 1,
      outcome: "replayed",
      attemptedAt: new Date(replayed.replayedAt),
      metadata: {
        previousStatus: replayed.previousStatus,
        nextAttemptAt: replayed.nextAttemptAt,
      },
    });

    await this.recordEvent({
      actorAppId: app.registration.appId,
      event: "app.updated",
      resource: "app_registration",
      payload: {
        appId: app.registration.appId,
        update: "webhook_delivery_replayed",
        deliveryId: replayed.deliveryId,
        subscriptionId: replayed.subscriptionId,
      },
    });

    return protocolWebhookDeliveryReplayResultSchema.parse(replayed);
  }

  async replayDeadLetteredDeliveries(
    appId: string,
    appToken: string,
    input: { limit?: number } = {},
  ) {
    const app = await this.requireAppAccess(appId, appToken, {
      scopes: ["webhooks.manage"],
      capabilities: ["webhook.write"],
    });
    const limit = Math.min(Math.max(input.limit ?? 25, 1), 100);
    const rows = await this.prisma.$queryRawUnsafe<
      Array<{ delivery_id: string }>
    >(
      `SELECT delivery_id
       FROM protocol_webhook_deliveries
       WHERE app_id = $1
         AND status = 'dead_lettered'
       ORDER BY updated_at ASC
       LIMIT $2`,
      app.registration.appId,
      limit,
    );
    const deliveryIds = rows.map((row) => row.delivery_id);
    const replayedAt = new Date().toISOString();

    for (const deliveryId of deliveryIds) {
      const replayed = await this.deliveryWorker.replayDeadLetteredDelivery(
        deliveryId,
        app.registration.appId,
        new Date(replayedAt),
      );
      await this.deliveryWorker.recordAttempt({
        deliveryId: replayed.deliveryId,
        appId: replayed.appId,
        subscriptionId: replayed.subscriptionId,
        attemptNumber: 1,
        outcome: "replayed",
        attemptedAt: new Date(replayedAt),
        metadata: {
          previousStatus: replayed.previousStatus,
          nextAttemptAt: replayed.nextAttemptAt,
          source: "batch_replay",
        },
      });
      await this.recordEvent({
        actorAppId: app.registration.appId,
        event: "app.updated",
        resource: "app_registration",
        payload: {
          appId: app.registration.appId,
          update: "webhook_delivery_replayed",
          deliveryId: replayed.deliveryId,
          subscriptionId: replayed.subscriptionId,
          source: "batch_replay",
        },
      });
    }

    return {
      appId: app.registration.appId,
      replayedCount: deliveryIds.length,
      replayedAt,
      deliveryIds,
    };
  }

  async replayEvents(appId: string, appToken: string, cursor?: string) {
    const app = await this.requireAppAccess(appId, appToken, {
      scopes: ["events.subscribe"],
      capabilities: ["event.read"],
    });
    const sinceCursor = cursor ? Number.parseInt(cursor, 10) : 0;
    if (Number.isNaN(sinceCursor) || sinceCursor < 0) {
      throw new ForbiddenException("invalid event replay cursor");
    }

    const rows = await this.prisma.$queryRawUnsafe<ProtocolEventLogRow[]>(
      `SELECT cursor, actor_app_id, event_name, resource, payload, metadata, created_at
       FROM protocol_event_log
       WHERE (actor_app_id = $1 OR actor_app_id IS NULL) AND cursor > $2
       ORDER BY cursor ASC
       LIMIT 200`,
      app.registration.appId,
      sinceCursor,
    );

    return rows.map((row) => this.mapEventRow(row));
  }

  async getReplayCursor(appId: string, appToken: string) {
    const app = await this.requireAppAccess(appId, appToken, {
      scopes: ["events.subscribe"],
      capabilities: ["event.read"],
    });
    const rows = await this.prisma.$queryRawUnsafe<ProtocolCursorRow[]>(
      `SELECT app_id, cursor, updated_at
       FROM protocol_event_cursors
       WHERE app_id = $1
       LIMIT 1`,
      app.registration.appId,
    );
    const row = rows[0];
    if (!row) {
      return protocolReplayCursorSchema.parse({
        appId: app.registration.appId,
        cursor: "0",
        updatedAt: new Date().toISOString(),
      });
    }
    return this.mapCursorRow(row);
  }

  async saveReplayCursor(appId: string, appToken: string, cursor: string) {
    const app = await this.requireAppAccess(appId, appToken, {
      scopes: ["events.subscribe"],
      capabilities: ["event.read"],
    });
    const parsedCursor = Number.parseInt(cursor, 10);
    if (Number.isNaN(parsedCursor) || parsedCursor < 0) {
      throw new ForbiddenException("invalid event replay cursor");
    }
    const now = new Date().toISOString();
    const rows = await this.prisma.$queryRawUnsafe<ProtocolCursorRow[]>(
      `INSERT INTO protocol_event_cursors (app_id, cursor, updated_at)
       VALUES ($1, $2::bigint, $3::timestamptz)
       ON CONFLICT (app_id)
       DO UPDATE SET cursor = EXCLUDED.cursor, updated_at = EXCLUDED.updated_at
       RETURNING app_id, cursor, updated_at`,
      app.registration.appId,
      parsedCursor,
      now,
    );
    return this.mapCursorRow(rows[0]);
  }

  async createIntentAction(
    appId: string,
    appToken: string,
    input: ProtocolIntentCreateAction,
  ) {
    const payload = protocolIntentCreateActionSchema.parse(input);
    const { app, grant } = await this.requireDelegatedActionGrant(
      appId,
      appToken,
      payload.actorUserId,
      "intent.create",
      ["intent.write"],
    );
    if (!this.intentsService) {
      throw new NotFoundException("intent actions unavailable");
    }
    return this.executeIntentCreateAction(payload, {
      actorAppId: app.registration.appId,
      grantId: grant.grantId,
    });
  }

  async updateIntentAction(
    appId: string,
    appToken: string,
    intentId: string,
    input: ProtocolIntentUpdateAction,
  ) {
    const payload = protocolIntentUpdateActionSchema.parse(input);
    const { app, grant } = await this.requireDelegatedActionGrant(
      appId,
      appToken,
      payload.actorUserId,
      "intent.update",
      ["intent.write"],
    );
    if (!this.intentsService) {
      throw new NotFoundException("intent actions unavailable");
    }
    return this.executeIntentUpdateAction(intentId, payload, {
      actorAppId: app.registration.appId,
      grantId: grant.grantId,
    });
  }

  async cancelIntentAction(
    appId: string,
    appToken: string,
    intentId: string,
    input: ProtocolIntentCancelAction,
  ) {
    const payload = protocolIntentCancelActionSchema.parse(input);
    const { app, grant } = await this.requireDelegatedActionGrant(
      appId,
      appToken,
      payload.actorUserId,
      "intent.cancel",
      ["intent.write"],
    );
    if (!this.intentsService) {
      throw new NotFoundException("intent actions unavailable");
    }
    return this.executeIntentCancelAction(intentId, payload, {
      actorAppId: app.registration.appId,
      grantId: grant.grantId,
    });
  }

  async sendRequestAction(
    appId: string,
    appToken: string,
    input: ProtocolIntentRequestSendAction,
  ) {
    const payload = protocolIntentRequestSendActionSchema.parse(input);
    const { app, grant } = await this.requireDelegatedActionGrant(
      appId,
      appToken,
      payload.actorUserId,
      "request.send",
      ["request.write"],
    );
    if (!this.intentsService) {
      throw new NotFoundException("request actions unavailable");
    }
    return this.executeRequestSendAction(payload, {
      actorAppId: app.registration.appId,
      grantId: grant.grantId,
    });
  }

  async acceptRequestAction(
    appId: string,
    appToken: string,
    requestId: string,
    input: ProtocolRequestDecisionAction,
  ) {
    const payload = protocolRequestDecisionActionSchema.parse(input);
    const { app, grant } = await this.requireDelegatedActionGrant(
      appId,
      appToken,
      payload.actorUserId,
      "request.accept",
      ["request.write"],
    );
    if (!this.inboxService) {
      throw new NotFoundException("request actions unavailable");
    }
    return this.executeRequestDecisionAction("accept", requestId, payload, {
      actorAppId: app.registration.appId,
      grantId: grant.grantId,
    });
  }

  async rejectRequestAction(
    appId: string,
    appToken: string,
    requestId: string,
    input: ProtocolRequestDecisionAction,
  ) {
    const payload = protocolRequestDecisionActionSchema.parse(input);
    const { app, grant } = await this.requireDelegatedActionGrant(
      appId,
      appToken,
      payload.actorUserId,
      "request.reject",
      ["request.write"],
    );
    if (!this.inboxService) {
      throw new NotFoundException("request actions unavailable");
    }
    return this.executeRequestDecisionAction("reject", requestId, payload, {
      actorAppId: app.registration.appId,
      grantId: grant.grantId,
    });
  }

  async sendChatMessageAction(
    appId: string,
    appToken: string,
    chatId: string,
    input: ProtocolChatSendMessageAction,
  ) {
    const payload = protocolChatSendMessageActionSchema.parse(input);
    const { app, grant } = await this.requireDelegatedActionGrant(
      appId,
      appToken,
      payload.actorUserId,
      "chat.send_message",
      ["chat.write"],
    );
    if (!this.chatsService) {
      throw new NotFoundException("chat actions unavailable");
    }
    return this.executeChatSendMessageAction(chatId, payload, {
      actorAppId: app.registration.appId,
      grantId: grant.grantId,
    });
  }

  async createChatAction(
    appId: string,
    appToken: string,
    input: ProtocolChatCreateAction,
  ) {
    const payload = protocolChatCreateActionSchema.parse(input);
    const { app, grant } = await this.requireDelegatedActionGrant(
      appId,
      appToken,
      payload.actorUserId,
      "chat.create",
      ["chat.write"],
    );
    if (!this.chatsService) {
      throw new NotFoundException("chat actions unavailable");
    }
    return this.executeChatCreateAction(payload, {
      actorAppId: app.registration.appId,
      grantId: grant.grantId,
    });
  }

  async createConnectionAction(
    appId: string,
    appToken: string,
    input: ProtocolConnectionCreateAction,
  ) {
    const payload = protocolConnectionCreateActionSchema.parse(input);
    const { app, grant } = await this.requireDelegatedActionGrant(
      appId,
      appToken,
      payload.actorUserId,
      "connection.create",
      ["connection.write"],
    );
    if (!this.connectionsService) {
      throw new NotFoundException("connection actions unavailable");
    }
    return this.executeConnectionCreateAction(payload, {
      actorAppId: app.registration.appId,
      grantId: grant.grantId,
    });
  }

  async createCircleAction(
    appId: string,
    appToken: string,
    input: ProtocolCircleCreateAction,
  ) {
    const payload = protocolCircleCreateActionSchema.parse(input);
    const { app, grant } = await this.requireDelegatedActionGrant(
      appId,
      appToken,
      payload.actorUserId,
      "circle.create",
      ["circle.write"],
    );
    if (!this.recurringCirclesService) {
      throw new NotFoundException("circle actions unavailable");
    }
    return this.executeCircleCreateAction(payload, {
      actorAppId: app.registration.appId,
      grantId: grant.grantId,
    });
  }

  async joinCircleAction(
    appId: string,
    appToken: string,
    circleId: string,
    input: ProtocolCircleJoinAction,
  ) {
    const payload = protocolCircleJoinActionSchema.parse(input);
    const { app, grant } = await this.requireDelegatedActionGrant(
      appId,
      appToken,
      payload.actorUserId,
      "circle.join",
      ["circle.write"],
    );
    if (!this.recurringCirclesService) {
      throw new NotFoundException("circle actions unavailable");
    }
    return this.executeCircleJoinAction(circleId, payload, {
      actorAppId: app.registration.appId,
      grantId: grant.grantId,
    });
  }

  async leaveCircleAction(
    appId: string,
    appToken: string,
    circleId: string,
    input: ProtocolCircleLeaveAction,
  ) {
    const payload = protocolCircleLeaveActionSchema.parse(input);
    const { app, grant } = await this.requireDelegatedActionGrant(
      appId,
      appToken,
      payload.actorUserId,
      "circle.leave",
      ["circle.write"],
    );
    if (!this.recurringCirclesService) {
      throw new NotFoundException("circle actions unavailable");
    }
    return this.executeCircleLeaveAction(circleId, payload, {
      actorAppId: app.registration.appId,
      grantId: grant.grantId,
    });
  }

  async createFirstPartyIntentAction(input: ProtocolIntentCreateAction) {
    return this.executeIntentCreateAction(input, {
      actorAppId: FIRST_PARTY_PROTOCOL_ACTOR_APP_ID,
    });
  }

  async updateFirstPartyIntentAction(
    intentId: string,
    input: ProtocolIntentUpdateAction,
  ) {
    return this.executeIntentUpdateAction(intentId, input, {
      actorAppId: FIRST_PARTY_PROTOCOL_ACTOR_APP_ID,
    });
  }

  async cancelFirstPartyIntentAction(
    intentId: string,
    input: ProtocolIntentCancelAction,
  ) {
    return this.executeIntentCancelAction(intentId, input, {
      actorAppId: FIRST_PARTY_PROTOCOL_ACTOR_APP_ID,
    });
  }

  async retryFirstPartyIntentAction(input: {
    intentId: string;
    actorUserId: string;
    traceId?: string;
    agentThreadId?: string;
    metadata?: Record<string, unknown>;
  }) {
    await this.intentsService!.assertIntentOwnership(
      input.intentId,
      input.actorUserId,
    );
    const traceId = input.traceId ?? randomUUID();
    const result = await this.intentsService!.retryIntent(
      input.intentId,
      traceId,
      input.agentThreadId,
    );

    await this.recordEvent({
      actorAppId: FIRST_PARTY_PROTOCOL_ACTOR_APP_ID,
      event: "intent.updated",
      resource: "intent",
      payload: {
        intentId: result.intentId,
        actorUserId: input.actorUserId,
        traceId,
        operation: "intent.retry",
        source: "first_party",
      },
    });

    return {
      ...result,
      traceId,
      metadata: input.metadata ?? {},
    };
  }

  async widenFirstPartyIntentAction(input: {
    intentId: string;
    actorUserId: string;
    traceId?: string;
    agentThreadId?: string;
    metadata?: Record<string, unknown>;
  }) {
    await this.intentsService!.assertIntentOwnership(
      input.intentId,
      input.actorUserId,
    );
    const traceId = input.traceId ?? randomUUID();
    const result = await this.intentsService!.widenIntentFilters(
      input.intentId,
      traceId,
      input.agentThreadId,
    );

    await this.recordEvent({
      actorAppId: FIRST_PARTY_PROTOCOL_ACTOR_APP_ID,
      event: "intent.updated",
      resource: "intent",
      payload: {
        intentId: result.intentId,
        actorUserId: input.actorUserId,
        traceId,
        operation: "intent.widen",
        source: "first_party",
      },
    });

    return {
      ...result,
      traceId,
      metadata: input.metadata ?? {},
    };
  }

  async convertFirstPartyIntentAction(input: {
    intentId: string;
    actorUserId: string;
    mode: "one_to_one" | "group";
    groupSizeTarget?: number;
    metadata?: Record<string, unknown>;
  }) {
    await this.intentsService!.assertIntentOwnership(
      input.intentId,
      input.actorUserId,
    );
    const result = await this.intentsService!.convertIntentMode(
      input.intentId,
      input.mode,
      {
        groupSizeTarget: input.groupSizeTarget,
      },
    );

    await this.recordEvent({
      actorAppId: FIRST_PARTY_PROTOCOL_ACTOR_APP_ID,
      event: "intent.updated",
      resource: "intent",
      payload: {
        intentId: result.id,
        actorUserId: input.actorUserId,
        operation: "intent.convert",
        mode: input.mode,
        groupSizeTarget:
          input.mode === "group"
            ? Math.min(Math.max(input.groupSizeTarget ?? 3, 2), 4)
            : undefined,
        source: "first_party",
      },
    });

    return protocolIntentActionResultSchema.parse({
      action: "intent.update",
      status: result.status,
      actorUserId: input.actorUserId,
      intentId: result.id,
      metadata: input.metadata ?? {},
    });
  }

  async createFirstPartyDatingConsentAction(input: {
    id: string;
    userId: string;
    targetUserId: string;
    scope: string;
    consentStatus: "pending" | "granted" | "revoked";
    verificationStatus: "unverified" | "verified" | "rejected";
    reason: string | null;
    expiresAt: Date | null;
  }) {
    const persistedPrimary = await this.persistDatingConsent({
      ...input,
      workflowRunId: `protocol:firstparty:dating_consent:${input.id}`,
      traceId: input.id,
    });

    if (input.consentStatus === "granted") {
      await this.notificationsService?.createInAppNotification(
        input.targetUserId,
        NotificationType.AGENT_UPDATE,
        "You received a dating-intro consent request. Review and respond when ready.",
        {
          source: "protocol",
          operation: "dating_consent",
          consentId: input.id,
          scope: input.scope,
          targetUserId: input.targetUserId,
        },
      );
    }

    return persistedPrimary;
  }

  async sendFirstPartyRequestAction(input: ProtocolIntentRequestSendAction) {
    return this.executeRequestSendAction(input, {
      actorAppId: FIRST_PARTY_PROTOCOL_ACTOR_APP_ID,
    });
  }

  async acceptFirstPartyRequestAction(
    requestId: string,
    input: ProtocolRequestDecisionAction,
  ) {
    return this.executeRequestDecisionAction("accept", requestId, input, {
      actorAppId: FIRST_PARTY_PROTOCOL_ACTOR_APP_ID,
    });
  }

  async rejectFirstPartyRequestAction(
    requestId: string,
    input: ProtocolRequestDecisionAction,
  ) {
    return this.executeRequestDecisionAction("reject", requestId, input, {
      actorAppId: FIRST_PARTY_PROTOCOL_ACTOR_APP_ID,
    });
  }

  async cancelFirstPartyRequestAction(input: {
    requestId: string;
    actorUserId: string;
    metadata?: Record<string, unknown>;
  }) {
    const result = await this.inboxService!.cancelByOriginator(
      input.requestId,
      input.actorUserId,
    );

    if (!result.unchanged) {
      await this.recordEvent({
        actorAppId: FIRST_PARTY_PROTOCOL_ACTOR_APP_ID,
        event: "request.cancelled",
        resource: "intent_request",
        payload: {
          requestId: result.request.id,
          intentId: result.request.intentId,
          actorUserId: input.actorUserId,
          senderUserId: result.request.senderUserId,
          recipientUserId: result.request.recipientUserId,
          operation: "request.cancel",
          source: "first_party",
        },
      });
    }

    return {
      action: "request.cancel",
      status: result.request.status,
      actorUserId: input.actorUserId,
      requestId: result.request.id,
      intentId: result.request.intentId,
      senderUserId: result.request.senderUserId,
      recipientUserId: result.request.recipientUserId,
      ...(result.unchanged ? { unchanged: true } : {}),
      metadata: input.metadata ?? {},
    };
  }

  async sendFirstPartyChatMessageAction(
    chatId: string,
    input: ProtocolChatSendMessageAction,
  ) {
    return this.executeChatSendMessageAction(chatId, input, {
      actorAppId: FIRST_PARTY_PROTOCOL_ACTOR_APP_ID,
    });
  }

  async createFirstPartyChatAction(input: ProtocolChatCreateAction) {
    return this.executeChatCreateAction(input, {
      actorAppId: FIRST_PARTY_PROTOCOL_ACTOR_APP_ID,
    });
  }

  async createFirstPartyConnectionAction(
    input: ProtocolConnectionCreateAction,
  ) {
    return this.executeConnectionCreateAction(input, {
      actorAppId: FIRST_PARTY_PROTOCOL_ACTOR_APP_ID,
    });
  }

  async createFirstPartyCircleAction(input: ProtocolCircleCreateAction) {
    return this.executeCircleCreateAction(input, {
      actorAppId: FIRST_PARTY_PROTOCOL_ACTOR_APP_ID,
    });
  }

  async joinFirstPartyCircleAction(
    circleId: string,
    input: ProtocolCircleJoinAction,
  ) {
    return this.executeCircleJoinAction(circleId, input, {
      actorAppId: FIRST_PARTY_PROTOCOL_ACTOR_APP_ID,
    });
  }

  async leaveFirstPartyCircleAction(
    circleId: string,
    input: ProtocolCircleLeaveAction,
  ) {
    return this.executeCircleLeaveAction(circleId, input, {
      actorAppId: FIRST_PARTY_PROTOCOL_ACTOR_APP_ID,
    });
  }

  async runDueWebhookDeliveries(
    appId: string,
    appToken: string,
    input: { limit?: number } = {},
  ) {
    const app = await this.requireAppAccess(appId, appToken, {
      scopes: ["webhooks.manage"],
      capabilities: ["webhook.write"],
    });
    const result = await this.deliveryRunner.runDueDeliveries({
      limit: input.limit,
      appId: app.registration.appId,
    });
    return protocolWebhookDeliveryRunResultSchema.parse(result);
  }

  async dispatchDueWebhookDeliveries(
    appId: string,
    appToken: string,
    input: { limit?: number } = {},
  ) {
    const app = await this.requireAppAccess(appId, appToken, {
      scopes: ["webhooks.manage"],
      capabilities: ["webhook.write"],
    });
    const limit = Math.min(Math.max(input.limit ?? 25, 1), 100);
    const enqueuedAt = new Date().toISOString();
    await this.protocolWebhooksQueue.add(
      "RunProtocolWebhookDeliveries",
      {
        type: "RunProtocolWebhookDeliveries",
        traceId: randomUUID(),
        appId: app.registration.appId,
        limit,
        enqueuedAt,
      },
      {
        removeOnComplete: 500,
        removeOnFail: 500,
      },
    );

    return {
      queueName: "protocol-webhooks" as const,
      jobName: "RunProtocolWebhookDeliveries" as const,
      appId: app.registration.appId,
      limit,
      enqueuedAt,
    };
  }

  async dispatchGlobalDueWebhookDeliveries(
    input: {
      limit?: number;
      source?: "cron" | "manual";
    } = {},
  ) {
    const limit = Math.min(Math.max(input.limit ?? 100, 1), 100);
    const source = input.source ?? "cron";
    const enqueuedAt = new Date().toISOString();
    await this.protocolWebhooksQueue.add(
      "RunProtocolWebhookDeliveries",
      {
        type: "RunProtocolWebhookDeliveries",
        traceId: randomUUID(),
        limit,
        source,
      },
      {
        removeOnComplete: 200,
        removeOnFail: 200,
        attempts: 3,
        backoff: { type: "exponential", delay: 1000 },
      },
    );
    return protocolWebhookDeliveryGlobalDispatchResultSchema.parse({
      queueName: "protocol-webhooks",
      jobName: "RunProtocolWebhookDeliveries",
      limit,
      source,
      enqueuedAt,
    });
  }

  async getAppUsageSummary(
    appId: string,
    appToken: string,
  ): Promise<ProtocolAppUsageSummary> {
    const app = await this.requireAppAccess(appId, appToken, {
      scopes: ["protocol.read"],
      capabilities: ["app.read"],
    });
    const grantRows = await this.prisma.$queryRawUnsafe<
      Array<{ status: string; count: bigint | number | string }>
    >(
      `SELECT status, COUNT(*)::bigint AS count
       FROM protocol_app_scope_grants
       WHERE app_id = $1
       GROUP BY status`,
      app.registration.appId,
    );
    const consentRequestRows = await this.prisma.$queryRawUnsafe<
      Array<{ status: string; count: bigint | number | string }>
    >(
      `SELECT status, COUNT(*)::bigint AS count
       FROM protocol_app_consent_requests
       WHERE app_id = $1
       GROUP BY status`,
      app.registration.appId,
    );
    const deliveryRows = await this.prisma.$queryRawUnsafe<
      Array<{ status: string; count: bigint | number | string }>
    >(
      `SELECT status, COUNT(*)::bigint AS count
       FROM protocol_webhook_deliveries
       WHERE app_id = $1
      GROUP BY status`,
      app.registration.appId,
    );
    const grantSubjectRows = await this.prisma.$queryRawUnsafe<
      Array<{ subject_type: string; count: bigint | number | string }>
    >(
      `SELECT subject_type, COUNT(*)::bigint AS count
       FROM protocol_app_scope_grants
       WHERE app_id = $1
       GROUP BY subject_type`,
      app.registration.appId,
    );
    const queueHealthRows = await this.prisma.$queryRawUnsafe<
      Array<{
        oldest_queued_at: Date | string | null;
        oldest_retrying_at: Date | string | null;
        last_dead_lettered_at: Date | string | null;
      }>
    >(
      `SELECT MIN(created_at) FILTER (WHERE status = 'queued') AS oldest_queued_at,
              MIN(updated_at) FILTER (WHERE status = 'retrying') AS oldest_retrying_at,
              MAX(updated_at) FILTER (WHERE status = 'dead_lettered') AS last_dead_lettered_at
       FROM protocol_webhook_deliveries
       WHERE app_id = $1`,
      app.registration.appId,
    );
    const recentEventRows = await this.prisma.$queryRawUnsafe<
      ProtocolEventLogRow[]
    >(
      `SELECT cursor, actor_app_id, event_name, resource, payload, metadata, created_at
       FROM protocol_event_log
       WHERE actor_app_id = $1
       ORDER BY cursor DESC
       LIMIT 20`,
      app.registration.appId,
    );
    const recentEvents = recentEventRows
      .map((row) => this.mapEventRow(row))
      .sort(
        (left, right) => Date.parse(right.issuedAt) - Date.parse(left.issuedAt),
      );
    const authFailureRows = await this.prisma.$queryRawUnsafe<
      Array<{
        failure_type: ProtocolAuthFailureType;
        count: bigint | number | string;
      }>
    >(
      `SELECT payload->>'failureType' AS failure_type, COUNT(*)::bigint AS count
       FROM protocol_event_log
       WHERE actor_app_id = $1
         AND event_name = 'app.updated'
         AND payload->>'update' = 'auth_failed'
       GROUP BY payload->>'failureType'`,
      app.registration.appId,
    );
    const recentAuthFailureRows = await this.prisma.$queryRawUnsafe<
      ProtocolEventLogRow[]
    >(
      `SELECT cursor, actor_app_id, event_name, resource, payload, metadata, created_at
       FROM protocol_event_log
       WHERE actor_app_id = $1
         AND event_name = 'app.updated'
         AND payload->>'update' = 'auth_failed'
       ORDER BY cursor DESC
       LIMIT 20`,
      app.registration.appId,
    );
    const lastRotatedAt =
      recentEvents.find(
        (event) =>
          event.payload &&
          typeof event.payload === "object" &&
          (event.payload as Record<string, unknown>).update ===
            "app_token_rotated",
      )?.issuedAt ?? null;
    const lastRevokedAt =
      recentEvents.find(
        (event) =>
          event.payload &&
          typeof event.payload === "object" &&
          (event.payload as Record<string, unknown>).update ===
            "app_token_revoked",
      )?.issuedAt ?? null;
    const lastGrantedAt =
      recentEvents.find(
        (event) =>
          event.payload &&
          typeof event.payload === "object" &&
          (event.payload as Record<string, unknown>).update ===
            "scope_grant_upserted",
      )?.issuedAt ?? null;
    const lastGrantRevokedAt =
      recentEvents.find(
        (event) =>
          event.payload &&
          typeof event.payload === "object" &&
          (event.payload as Record<string, unknown>).update ===
            "scope_grant_revoked",
      )?.issuedAt ?? null;
    const latestCursor =
      recentEventRows.length > 0 ? String(recentEventRows[0].cursor) : "0";
    const grantCounts = Object.fromEntries(
      grantRows.map((row) => [row.status, Number(row.count)]),
    ) as Record<string, number>;
    const grantSubjectCounts = Object.fromEntries(
      grantSubjectRows.map((row) => [row.subject_type, Number(row.count)]),
    ) as Partial<Record<"user" | "app" | "service" | "agent", number>>;
    const consentRequestCounts = Object.fromEntries(
      consentRequestRows.map((row) => [row.status, Number(row.count)]),
    ) as Record<string, number>;
    const deliveryCounts = Object.fromEntries(
      deliveryRows.map((row) => [row.status, Number(row.count)]),
    ) as Record<string, number>;
    const authFailureCounts = Object.fromEntries(
      authFailureRows.map((row) => [row.failure_type, Number(row.count)]),
    ) as Partial<Record<ProtocolAuthFailureType, number>>;
    const queueHealth = queueHealthRows[0] ?? {
      oldest_queued_at: null,
      oldest_retrying_at: null,
      last_dead_lettered_at: null,
    };
    const recentAuthFailures = recentAuthFailureRows
      .map((row) => row.payload)
      .filter(
        (
          payload,
        ): payload is {
          appId: string;
          failureType: ProtocolAuthFailureType;
          action: string | null;
          issuedAt: string;
          details?: Record<string, unknown>;
        } =>
          !!payload &&
          typeof payload === "object" &&
          typeof (payload as Record<string, unknown>).appId === "string" &&
          typeof (payload as Record<string, unknown>).failureType ===
            "string" &&
          typeof (payload as Record<string, unknown>).issuedAt === "string",
      )
      .map((payload) => ({
        appId: payload.appId,
        failureType: payload.failureType,
        action: payload.action ?? null,
        issuedAt: payload.issuedAt,
        details: payload.details ?? {},
      }));

    return protocolAppUsageSummarySchema.parse({
      appId: app.registration.appId,
      generatedAt: new Date().toISOString(),
      appStatus: app.registration.status,
      issuedScopes: app.issuedScopes,
      issuedCapabilities: app.issuedCapabilities,
      grantCounts: {
        active: grantCounts.active ?? 0,
        revoked: grantCounts.revoked ?? 0,
      },
      grantSubjectCounts: {
        user: grantSubjectCounts.user ?? 0,
        app: grantSubjectCounts.app ?? 0,
        service: grantSubjectCounts.service ?? 0,
        agent: grantSubjectCounts.agent ?? 0,
      },
      delegatedExecutionSupport: {
        executableSubjectTypes: ["user"],
        modeledOnlySubjectTypes: ["app", "service", "agent"],
      },
      consentRequestCounts: {
        pending: consentRequestCounts.pending ?? 0,
        approved: consentRequestCounts.approved ?? 0,
        rejected: consentRequestCounts.rejected ?? 0,
        cancelled: consentRequestCounts.cancelled ?? 0,
        expired: consentRequestCounts.expired ?? 0,
      },
      deliveryCounts: {
        queued: deliveryCounts.queued ?? 0,
        retrying: deliveryCounts.retrying ?? 0,
        delivered: deliveryCounts.delivered ?? 0,
        failed: deliveryCounts.failed ?? 0,
        deadLettered: deliveryCounts.dead_lettered ?? 0,
      },
      queueHealth: {
        replayableCount: deliveryCounts.dead_lettered ?? 0,
        oldestQueuedAt: queueHealth.oldest_queued_at
          ? this.toIsoString(queueHealth.oldest_queued_at)
          : null,
        oldestRetryingAt: queueHealth.oldest_retrying_at
          ? this.toIsoString(queueHealth.oldest_retrying_at)
          : null,
        lastDeadLetteredAt: queueHealth.last_dead_lettered_at
          ? this.toIsoString(queueHealth.last_dead_lettered_at)
          : null,
      },
      tokenAudit: this.buildTokenAudit({
        appUpdatedAt: app.updatedAt,
        appCreatedAt: app.registration.createdAt ?? null,
        lastRotatedAt,
        lastRevokedAt,
      }),
      grantAudit: {
        lastGrantedAt,
        lastRevokedAt: lastGrantRevokedAt,
      },
      authFailureCounts: {
        missingToken: authFailureCounts.missing_token ?? 0,
        appNotFound: authFailureCounts.app_not_found ?? 0,
        appRevoked: authFailureCounts.app_revoked ?? 0,
        invalidToken: authFailureCounts.invalid_token ?? 0,
        missingScopes: authFailureCounts.missing_scopes ?? 0,
        missingCapabilities: authFailureCounts.missing_capabilities ?? 0,
        missingDelegatedGrant: authFailureCounts.missing_delegated_grant ?? 0,
      },
      recentAuthFailures,
      latestCursor,
      recentEvents,
    });
  }

  private async executeIntentCreateAction(
    input: ProtocolIntentCreateAction,
    context: { actorAppId: string; grantId?: string },
  ) {
    const payload = protocolIntentCreateActionSchema.parse(input);
    const traceId = payload.traceId ?? randomUUID();
    const intent = await this.intentsService!.createIntent(
      payload.actorUserId,
      payload.rawText,
      traceId,
      payload.agentThreadId,
    );

    await this.recordEvent({
      actorAppId: context.actorAppId,
      event: "intent.created",
      resource: "intent",
      payload: {
        intentId: intent.id,
        actorUserId: payload.actorUserId,
        traceId,
        grantId: context.grantId ?? null,
        source:
          context.actorAppId === FIRST_PARTY_PROTOCOL_ACTOR_APP_ID
            ? "first_party"
            : "app",
      },
    });

    return protocolIntentActionResultSchema.parse({
      action: "intent.create",
      status: intent.status,
      actorUserId: payload.actorUserId,
      intentId: intent.id,
      traceId,
      safetyState:
        typeof intent.safetyState === "string" ? intent.safetyState : null,
      metadata: payload.metadata ?? {},
    });
  }

  private async executeIntentUpdateAction(
    intentId: string,
    input: ProtocolIntentUpdateAction,
    context: { actorAppId: string; grantId?: string },
  ): Promise<ProtocolIntentActionResult> {
    const payload = protocolIntentUpdateActionSchema.parse(input);
    await this.intentsService!.assertIntentOwnership(
      intentId,
      payload.actorUserId,
    );
    const intent = await this.intentsService!.updateIntent(
      intentId,
      payload.rawText,
    );

    await this.recordEvent({
      actorAppId: context.actorAppId,
      event: "intent.updated",
      resource: "intent",
      payload: {
        intentId: intent.id,
        actorUserId: payload.actorUserId,
        grantId: context.grantId ?? null,
        source:
          context.actorAppId === FIRST_PARTY_PROTOCOL_ACTOR_APP_ID
            ? "first_party"
            : "app",
      },
    });

    return protocolIntentActionResultSchema.parse({
      action: "intent.update",
      status: intent.status,
      actorUserId: payload.actorUserId,
      intentId: intent.id,
      safetyState:
        typeof intent.safetyState === "string" ? intent.safetyState : null,
      metadata: payload.metadata ?? {},
    });
  }

  private async executeIntentCancelAction(
    intentId: string,
    input: ProtocolIntentCancelAction,
    context: { actorAppId: string; grantId?: string },
  ): Promise<ProtocolIntentActionResult> {
    const payload = protocolIntentCancelActionSchema.parse(input);
    const result = await this.intentsService!.cancelIntent(intentId, {
      userId: payload.actorUserId,
      agentThreadId: payload.agentThreadId,
    });

    await this.recordEvent({
      actorAppId: context.actorAppId,
      event: "intent.cancelled",
      resource: "intent",
      payload: {
        intentId: result.intent.id,
        actorUserId: payload.actorUserId,
        cancelledRequestCount: result.cancelledRequestCount,
        grantId: context.grantId ?? null,
        source:
          context.actorAppId === FIRST_PARTY_PROTOCOL_ACTOR_APP_ID
            ? "first_party"
            : "app",
      },
    });

    return protocolIntentActionResultSchema.parse({
      action: "intent.cancel",
      status: result.intent.status,
      actorUserId: payload.actorUserId,
      intentId: result.intent.id,
      safetyState:
        typeof result.intent.safetyState === "string"
          ? result.intent.safetyState
          : null,
      cancelledRequestCount: result.cancelledRequestCount,
      unchanged: "unchanged" in result ? Boolean(result.unchanged) : false,
      metadata: payload.metadata ?? {},
    });
  }

  private async executeRequestSendAction(
    input: ProtocolIntentRequestSendAction,
    context: { actorAppId: string; grantId?: string },
  ) {
    const payload = protocolIntentRequestSendActionSchema.parse(input);
    await this.intentsService!.assertIntentOwnership(
      payload.intentId,
      payload.actorUserId,
    );
    const traceId = payload.traceId ?? randomUUID();
    const request = await this.intentsService!.sendIntentRequest({
      intentId: payload.intentId,
      recipientUserId: payload.recipientUserId,
      traceId,
      agentThreadId: payload.agentThreadId,
      notificationMetadata: {
        provenance: {
          source: "protocol",
          action: "request.send",
          resource: "intent_request",
          actorAppId: context.actorAppId,
          intentId: payload.intentId,
          senderUserId: payload.actorUserId,
          recipientUserId: payload.recipientUserId,
        },
      },
      requestMetadata: {
        provenance: {
          source: "protocol",
          action: "request.send",
          resource: "intent_request",
          actorAppId: context.actorAppId,
          intentId: payload.intentId,
          senderUserId: payload.actorUserId,
          recipientUserId: payload.recipientUserId,
        },
      },
    });
    const requestId =
      "requestId" in request
        ? request.requestId
        : (request as { id?: string }).id;

    await this.recordEvent({
      actorAppId: context.actorAppId,
      event: "request.sent",
      resource: "intent_request",
      payload: {
        requestId,
        intentId: payload.intentId,
        actorUserId: payload.actorUserId,
        recipientUserId: payload.recipientUserId,
        grantId: context.grantId ?? null,
        source:
          context.actorAppId === FIRST_PARTY_PROTOCOL_ACTOR_APP_ID
            ? "first_party"
            : "app",
      },
    });

    return protocolRequestActionResultSchema.parse({
      action: "request.send",
      status: request.status,
      actorUserId: payload.actorUserId,
      requestId: requestId ?? null,
      intentId: payload.intentId,
      senderUserId: payload.actorUserId,
      recipientUserId: payload.recipientUserId,
      metadata: payload.metadata ?? {},
    });
  }

  private async executeRequestDecisionAction(
    action: "accept" | "reject",
    requestId: string,
    input: ProtocolRequestDecisionAction,
    context: { actorAppId: string; grantId?: string },
  ) {
    const payload = protocolRequestDecisionActionSchema.parse(input);
    const result = await this.inboxService!.updateStatus(
      requestId,
      action === "accept" ? "accepted" : "rejected",
      payload.actorUserId,
      {
        notificationMetadata: {
          provenance: {
            source: "protocol",
            action: action === "accept" ? "request.accept" : "request.reject",
            resource: "intent_request",
            actorAppId: context.actorAppId,
            requestId,
            actorUserId: payload.actorUserId,
          },
        },
      },
    );

    await this.recordEvent({
      actorAppId: context.actorAppId,
      event: action === "accept" ? "request.accepted" : "request.rejected",
      resource: "intent_request",
      payload: {
        requestId: result.request.id,
        intentId: result.request.intentId,
        actorUserId: payload.actorUserId,
        grantId: context.grantId ?? null,
        source:
          context.actorAppId === FIRST_PARTY_PROTOCOL_ACTOR_APP_ID
            ? "first_party"
            : "app",
      },
    });

    return protocolRequestActionResultSchema.parse({
      action: action === "accept" ? "request.accept" : "request.reject",
      status: result.request.status,
      actorUserId: payload.actorUserId,
      requestId: result.request.id,
      intentId: result.request.intentId,
      senderUserId: result.request.senderUserId,
      recipientUserId: result.request.recipientUserId,
      queued:
        action === "accept" && "queued" in result
          ? Boolean(result.queued)
          : false,
      unchanged: "unchanged" in result ? Boolean(result.unchanged) : false,
      metadata: payload.metadata ?? {},
    });
  }

  private async executeChatSendMessageAction(
    chatId: string,
    input: ProtocolChatSendMessageAction,
    context: { actorAppId: string; grantId?: string },
  ) {
    const payload = protocolChatSendMessageActionSchema.parse(input);
    const message = await this.chatsService!.createMessage(
      chatId,
      payload.actorUserId,
      payload.body,
      {
        idempotencyKey: payload.clientMessageId,
        replyToMessageId: payload.replyToMessageId,
      },
    );

    await this.recordEvent({
      actorAppId: context.actorAppId,
      event: "chat.message.sent",
      resource: "chat_message",
      payload: {
        chatId,
        messageId: message.id,
        actorUserId: payload.actorUserId,
        grantId: context.grantId ?? null,
        source:
          context.actorAppId === FIRST_PARTY_PROTOCOL_ACTOR_APP_ID
            ? "first_party"
            : "app",
      },
    });

    return protocolChatMessageActionResultSchema.parse({
      action: "chat.send_message",
      actorUserId: payload.actorUserId,
      chatId,
      messageId: message.id,
      replyToMessageId: message.replyToMessageId ?? null,
      createdAt:
        this.toIsoString(message.createdAt) ?? new Date().toISOString(),
      metadata: payload.metadata ?? {},
    });
  }

  private async executeConnectionCreateAction(
    input: ProtocolConnectionCreateAction,
    context: { actorAppId: string; grantId?: string },
  ): Promise<ProtocolConnectionActionResult> {
    const payload = protocolConnectionCreateActionSchema.parse(input);
    const connection = await this.connectionsService!.createConnection(
      payload.type,
      payload.actorUserId,
      payload.originIntentId,
    );

    await this.recordEvent({
      actorAppId: context.actorAppId,
      event: "connection.created",
      resource: "connection",
      payload: {
        connectionId: connection.id,
        actorUserId: payload.actorUserId,
        createdByUserId: connection.createdByUserId,
        type: connection.type,
        originIntentId: connection.originIntentId ?? null,
        grantId: context.grantId ?? null,
        source:
          context.actorAppId === FIRST_PARTY_PROTOCOL_ACTOR_APP_ID
            ? "first_party"
            : "app",
      },
    });

    return protocolConnectionActionResultSchema.parse({
      action: "connection.create",
      status: "created",
      actorUserId: payload.actorUserId,
      connectionId: connection.id,
      type: connection.type,
      originIntentId: connection.originIntentId ?? null,
      createdByUserId: connection.createdByUserId,
      metadata: payload.metadata ?? {},
    });
  }

  private async executeChatCreateAction(
    input: ProtocolChatCreateAction,
    context: { actorAppId: string; grantId?: string },
  ): Promise<ProtocolChatActionResult> {
    const payload = protocolChatCreateActionSchema.parse(input);
    const chat = await this.chatsService!.createChat(
      payload.connectionId,
      payload.type,
      payload.actorUserId,
    );

    await this.recordEvent({
      actorAppId: context.actorAppId,
      event: "chat.created",
      resource: "chat",
      payload: {
        chatId: chat.id,
        connectionId: chat.connectionId,
        actorUserId: payload.actorUserId,
        type: chat.type,
        grantId: context.grantId ?? null,
        source:
          context.actorAppId === FIRST_PARTY_PROTOCOL_ACTOR_APP_ID
            ? "first_party"
            : "app",
      },
    });

    return protocolChatActionResultSchema.parse({
      action: "chat.create",
      actorUserId: payload.actorUserId,
      chatId: chat.id,
      connectionId: chat.connectionId,
      type: chat.type,
      createdAt: this.toIsoString(chat.createdAt) ?? new Date().toISOString(),
      metadata: payload.metadata ?? {},
    });
  }

  private async executeCircleCreateAction(
    input: ProtocolCircleCreateAction,
    context: { actorAppId: string; grantId?: string },
  ) {
    const payload = protocolCircleCreateActionSchema.parse(input);
    const circle = await this.recurringCirclesService!.createCircle(
      payload.actorUserId,
      {
        title: payload.title,
        description: payload.description,
        visibility: payload.visibility,
        topicTags: payload.topicTags,
        targetSize: payload.targetSize,
        kickoffPrompt: payload.kickoffPrompt,
        cadence: payload.cadence,
      },
    );

    await this.recordEvent({
      actorAppId: context.actorAppId,
      event: "circle.created",
      resource: "circle",
      payload: {
        circleId: circle.id,
        ownerUserId: payload.actorUserId,
        grantId: context.grantId ?? null,
        source:
          context.actorAppId === FIRST_PARTY_PROTOCOL_ACTOR_APP_ID
            ? "first_party"
            : "app",
      },
    });
    await this.emitProtocolNotification(
      payload.actorUserId,
      "A recurring circle is active.",
      {
        action: "circle.create",
        resource: "circle",
        circleId: circle.id,
        actorAppId: context.actorAppId,
      },
    );

    return protocolCircleActionResultSchema.parse({
      action: "circle.create",
      status: circle.status,
      actorUserId: payload.actorUserId,
      circleId: circle.id,
      ownerUserId: payload.actorUserId,
      nextSessionAt: this.toIsoString(circle.nextSessionAt) ?? null,
      metadata: payload.metadata ?? {},
    });
  }

  private async executeCircleJoinAction(
    circleId: string,
    input: ProtocolCircleJoinAction,
    context: { actorAppId: string; grantId?: string },
  ) {
    const payload = protocolCircleJoinActionSchema.parse(input);
    const member = await this.recurringCirclesService!.addMember(
      circleId,
      payload.actorUserId,
      {
        userId: payload.memberUserId,
        role: payload.role,
      },
    );

    await this.recordEvent({
      actorAppId: context.actorAppId,
      event: "circle.joined",
      resource: "circle",
      payload: {
        circleId: member.circleId,
        ownerUserId: payload.actorUserId,
        memberUserId: payload.memberUserId,
        role: member.role,
        grantId: context.grantId ?? null,
        source:
          context.actorAppId === FIRST_PARTY_PROTOCOL_ACTOR_APP_ID
            ? "first_party"
            : "app",
      },
    });
    await this.emitProtocolNotification(
      payload.memberUserId,
      payload.memberUserId === payload.actorUserId
        ? "Your recurring circle membership is active."
        : "You were added to a recurring circle.",
      {
        action: "circle.join",
        resource: "circle",
        circleId: member.circleId,
        actorAppId: context.actorAppId,
        ownerUserId: payload.actorUserId,
      },
    );

    return protocolCircleActionResultSchema.parse({
      action: "circle.join",
      status: member.status,
      actorUserId: payload.actorUserId,
      circleId: member.circleId,
      ownerUserId: payload.actorUserId,
      memberUserId: payload.memberUserId,
      role: member.role === "owner" ? "admin" : member.role,
      metadata: payload.metadata ?? {},
    });
  }

  private async executeCircleLeaveAction(
    circleId: string,
    input: ProtocolCircleLeaveAction,
    context: { actorAppId: string; grantId?: string },
  ) {
    const payload = protocolCircleLeaveActionSchema.parse(input);
    const member = await this.recurringCirclesService!.removeMember(
      circleId,
      payload.actorUserId,
      payload.memberUserId,
    );

    await this.recordEvent({
      actorAppId: context.actorAppId,
      event: "circle.left",
      resource: "circle",
      payload: {
        circleId: member.circleId,
        ownerUserId: payload.actorUserId,
        memberUserId: payload.memberUserId,
        grantId: context.grantId ?? null,
        source:
          context.actorAppId === FIRST_PARTY_PROTOCOL_ACTOR_APP_ID
            ? "first_party"
            : "app",
      },
    });
    await this.emitProtocolNotification(
      payload.memberUserId,
      "Your recurring circle membership changed.",
      {
        action: "circle.leave",
        resource: "circle",
        circleId: member.circleId,
        actorAppId: context.actorAppId,
        ownerUserId: payload.actorUserId,
      },
    );

    return protocolCircleActionResultSchema.parse({
      action: "circle.leave",
      status: member.status,
      actorUserId: payload.actorUserId,
      circleId: member.circleId,
      ownerUserId: payload.actorUserId,
      memberUserId: payload.memberUserId,
      metadata: payload.metadata ?? {},
    });
  }

  private async emitProtocolNotification(
    recipientUserId: string,
    body: string,
    provenance: Record<string, unknown>,
  ) {
    if (!this.notificationsService) {
      return;
    }
    await this.notificationsService.createInAppNotification(
      recipientUserId,
      NotificationType.AGENT_UPDATE,
      body,
      {
        provenance: {
          source: "protocol",
          ...provenance,
        },
      },
    );
  }

  private async recordAuthFailure(input: {
    appId: string;
    failureType: ProtocolAuthFailureType;
    action: string;
    details?: Record<string, unknown>;
  }) {
    await this.recordEvent({
      actorAppId: input.appId,
      event: "app.updated",
      resource: "app_registration",
      payload: {
        appId: input.appId,
        update: "auth_failed",
        failureType: input.failureType,
        action: input.action,
        issuedAt: new Date().toISOString(),
        details: input.details ?? {},
      },
    });
  }

  private issueScopes(
    requested: ProtocolScopeName[],
    registrationScopes: ProtocolScopeName[],
    manifestScopes: ProtocolScopeName[],
  ) {
    const available = new Set<ProtocolScopeName>([
      ...registrationScopes.map((scope) =>
        protocolScopeNameSchema.parse(scope),
      ),
      ...manifestScopes.map((scope) => protocolScopeNameSchema.parse(scope)),
    ]);
    const requestedScopes = requested.length > 0 ? requested : [...available];
    return requestedScopes.filter((scope) => available.has(scope));
  }

  private issueCapabilities(
    requested: CapabilityName[],
    registrationCapabilities: CapabilityName[],
    manifestCapabilities: CapabilityName[],
  ) {
    const available = new Set<CapabilityName>([
      ...registrationCapabilities.map((capability) =>
        capabilityNameSchema.parse(capability),
      ),
      ...manifestCapabilities.map((capability) =>
        capabilityNameSchema.parse(capability),
      ),
    ]);
    const requestedCapabilities =
      requested.length > 0 ? requested : [...available];
    return requestedCapabilities.filter((capability) =>
      available.has(capability),
    );
  }

  private async requireAppAccess(
    appId: string,
    appToken: string,
    requirements: {
      scopes?: ProtocolScopeName[];
      capabilities?: CapabilityName[];
    } = {},
  ) {
    const row = await this.findAppRow(appId);
    if (!row) {
      await this.recordAuthFailure({
        appId,
        failureType: "app_not_found",
        action: "app.access",
        details: requirements,
      });
      throw new NotFoundException("protocol app not found");
    }
    if (!appToken?.trim()) {
      await this.recordAuthFailure({
        appId,
        failureType: "missing_token",
        action: "app.access",
        details: requirements,
      });
      throw new UnauthorizedException("missing protocol app token");
    }
    const app = this.mapStoredApp(row);
    if (app.status === "revoked") {
      await this.recordAuthFailure({
        appId,
        failureType: "app_revoked",
        action: "app.access",
        details: requirements,
      });
      throw new ForbiddenException("protocol app is revoked");
    }
    if (!verifyProtocolAppToken(appToken, app.appTokenHash)) {
      await this.recordAuthFailure({
        appId,
        failureType: "invalid_token",
        action: "app.access",
        details: requirements,
      });
      throw new ForbiddenException("invalid protocol app token");
    }

    const missingScopes = (requirements.scopes ?? []).filter(
      (scope) => !app.issuedScopes.includes(scope),
    );
    if (missingScopes.length > 0) {
      await this.recordAuthFailure({
        appId,
        failureType: "missing_scopes",
        action: "app.access",
        details: {
          ...requirements,
          missingScopes,
        },
      });
      throw new ForbiddenException(
        `missing protocol scopes: ${missingScopes.join(", ")}`,
      );
    }

    const missingCapabilities = (requirements.capabilities ?? []).filter(
      (capability) => !app.issuedCapabilities.includes(capability),
    );
    if (missingCapabilities.length > 0) {
      await this.recordAuthFailure({
        appId,
        failureType: "missing_capabilities",
        action: "app.access",
        details: {
          ...requirements,
          missingCapabilities,
        },
      });
      throw new ForbiddenException(
        `missing protocol capabilities: ${missingCapabilities.join(", ")}`,
      );
    }

    return app;
  }

  private async requireDelegatedActionGrant(
    appId: string,
    appToken: string,
    actorUserId: string,
    action:
      | "intent.create"
      | "intent.update"
      | "intent.cancel"
      | "request.send"
      | "request.accept"
      | "request.reject"
      | "connection.create"
      | "chat.create"
      | "chat.send_message"
      | "circle.create"
      | "circle.join"
      | "circle.leave",
    capabilities: CapabilityName[],
  ) {
    const app = await this.requireAppAccess(appId, appToken, {
      scopes: ["actions.invoke"],
      capabilities,
    });
    const rows = await this.prisma.$queryRawUnsafe<ProtocolAppScopeGrantRow[]>(
      `SELECT id, app_id, scope, capabilities, subject_type, subject_id, status, granted_by_user_id, granted_at, revoked_at, metadata, created_at, updated_at
       FROM protocol_app_scope_grants
       WHERE app_id = $1
         AND status = 'active'
       ORDER BY created_at DESC`,
      app.registration.appId,
    );

    const grants = rows.map((row) => this.mapGrantRow(row));
    const grant = grants.find(
      (entry) =>
        entry.subjectType === "user" &&
        entry.subjectId === actorUserId &&
        entry.scope === "actions.invoke" &&
        (entry.capabilities.length === 0 ||
          capabilities.every((capability) =>
            entry.capabilities.includes(capability),
          )),
    );
    if (!grant) {
      const modeledOnlyGrants = grants.filter(
        (entry) =>
          entry.subjectType !== "user" &&
          entry.scope === "actions.invoke" &&
          (entry.capabilities.length === 0 ||
            capabilities.every((capability) =>
              entry.capabilities.includes(capability),
            )),
      );
      await this.recordAuthFailure({
        appId,
        failureType: "missing_delegated_grant",
        action,
        details: {
          actorUserId,
          capabilities,
          modeledOnlySubjectTypes: [
            ...new Set(modeledOnlyGrants.map((entry) => entry.subjectType)),
          ],
          hasModeledOnlyGrant: modeledOnlyGrants.length > 0,
        },
      });
      throw new ForbiddenException(
        modeledOnlyGrants.length > 0
          ? `missing executable user grant for ${action}; modeled grants exist but cannot execute delegated actions`
          : `missing active protocol grant for ${action}`,
      );
    }

    return { app, grant };
  }

  private async findAppRow(appId: string) {
    const rows = await this.prisma.$queryRawUnsafe<ProtocolAppRow[]>(
      `SELECT app_id, status, registration_json, manifest_json, issued_scopes, issued_capabilities, app_token_hash, updated_at
       FROM protocol_apps
       WHERE app_id = $1
       LIMIT 1`,
      appId,
    );
    return rows[0] ?? null;
  }

  private mapAppRow(row: ProtocolAppRow) {
    const app = this.mapStoredApp(row);
    return {
      status: app.status,
      registration: app.registration,
      manifest: app.manifest,
      issuedScopes: app.issuedScopes,
      issuedCapabilities: app.issuedCapabilities,
    };
  }

  private mapStoredApp(row: ProtocolAppRow): RegisteredProtocolApp {
    return {
      status: row.status,
      registration: appRegistrationSchema.parse(row.registration_json),
      manifest: manifestSchema.parse(row.manifest_json),
      issuedScopes: (row.issued_scopes ?? []).map((scope) =>
        protocolScopeNameSchema.parse(scope),
      ),
      issuedCapabilities: (row.issued_capabilities ?? []).map((capability) =>
        capabilityNameSchema.parse(capability),
      ),
      appTokenHash: row.app_token_hash,
      updatedAt: this.toIsoString(row.updated_at) ?? new Date().toISOString(),
    };
  }

  private mapWebhookRow(
    row: ProtocolWebhookSubscriptionRow,
  ): WebhookSubscription {
    return webhookSubscriptionSchema.parse({
      protocolId: protocolIds.webhookSubscription,
      subscriptionId: row.subscription_id,
      appId: row.app_id,
      targetUrl: row.target_url,
      events: row.event_names ?? [],
      resources: row.resource_names ?? [],
      status: row.status,
      deliveryMode: row.delivery_mode,
      retryPolicy: row.retry_policy,
      secretRef: row.secret_ref ?? undefined,
      metadata: row.metadata ?? {},
      createdAt: this.toIsoString(row.created_at),
      updatedAt: this.toIsoString(row.updated_at),
    });
  }

  private mapEventRow(row: ProtocolEventLogRow): ProtocolEventEnvelope {
    const metadata =
      row.metadata && typeof row.metadata === "object"
        ? { ...(row.metadata as Record<string, unknown>) }
        : {};
    return protocolEventEnvelopeSchema.parse({
      protocolId: protocolIds.protocol,
      actorAppId: row.actor_app_id ?? undefined,
      issuedAt: this.toIsoString(row.created_at),
      event: eventNameSchema.parse(row.event_name),
      resource: row.resource ?? undefined,
      payload: row.payload,
      metadata: {
        ...metadata,
        cursor: String(row.cursor),
      },
    });
  }

  private mapCursorRow(row: ProtocolCursorRow): ProtocolReplayCursor {
    return protocolReplayCursorSchema.parse({
      appId: row.app_id,
      cursor: String(row.cursor),
      updatedAt: this.toIsoString(row.updated_at),
    });
  }

  private mapGrantRow(row: ProtocolAppScopeGrantRow): ProtocolAppScopeGrant {
    const subjectType = protocolGrantSubjectTypeSchema.parse(row.subject_type);
    return protocolAppScopeGrantSchema.parse({
      grantId: row.id,
      appId: row.app_id,
      scope: protocolScopeNameSchema.parse(row.scope),
      capabilities: (row.capabilities ?? []).map((capability) =>
        capabilityNameSchema.parse(capability),
      ),
      subjectType,
      subjectId: row.subject_id ?? row.app_id,
      executionMode: subjectType === "user" ? "executable" : "modeled_only",
      status: row.status,
      grantedByUserId: row.granted_by_user_id,
      grantedAt: this.toIsoString(row.granted_at),
      revokedAt: this.toIsoString(row.revoked_at) ?? null,
      metadata: row.metadata ?? {},
      createdAt: this.toIsoString(row.created_at),
      updatedAt: this.toIsoString(row.updated_at),
    });
  }

  private mapConsentRequestRow(
    row: ProtocolAppConsentRequestRow,
  ): ProtocolAppConsentRequest {
    const subjectType = protocolGrantSubjectTypeSchema.parse(row.subject_type);
    return protocolAppConsentRequestSchema.parse({
      protocolId: protocolIds.appConsentRequest,
      requestId: row.id,
      appId: row.app_id,
      scope: protocolScopeNameSchema.parse(row.scope),
      capabilities: (row.capabilities ?? []).map((capability) =>
        capabilityNameSchema.parse(capability),
      ),
      subjectType,
      subjectId: row.subject_id ?? row.app_id,
      executionMode: subjectType === "user" ? "executable" : "modeled_only",
      status: protocolConsentRequestStatusSchema.parse(row.status),
      requestedByUserId: row.requested_by_user_id,
      approvedByUserId: row.approved_by_user_id,
      rejectedByUserId: row.rejected_by_user_id,
      approvedGrantId: row.approved_grant_id,
      requestedAt: this.toIsoString(row.requested_at),
      approvedAt: this.toIsoString(row.approved_at) ?? null,
      rejectedAt: this.toIsoString(row.rejected_at) ?? null,
      cancelledAt: this.toIsoString(row.cancelled_at) ?? null,
      expiredAt: this.toIsoString(row.expired_at) ?? null,
      metadata: row.metadata ?? {},
      createdAt: this.toIsoString(row.created_at),
      updatedAt: this.toIsoString(row.updated_at),
    });
  }

  private mapDeliveryRow(row: ProtocolWebhookDeliveryRow) {
    return protocolWebhookDeliverySchema.parse({
      protocolId: protocolIds.protocol,
      deliveryId: row.delivery_id,
      subscriptionId: row.subscription_id,
      eventName: row.event_name,
      status: row.status,
      attemptCount: row.attempt_count,
      nextAttemptAt: this.toIsoString(row.next_attempt_at),
      lastAttemptAt: this.toIsoString(row.last_attempt_at),
      deliveredAt: this.toIsoString(row.delivered_at),
      responseStatusCode: row.response_status_code,
      errorMessage: row.error_message,
      signature: row.signature,
      payload: row.payload,
      metadata: row.metadata ?? {},
      createdAt: this.toIsoString(row.created_at),
      updatedAt: this.toIsoString(row.updated_at),
    });
  }

  private mapDeliveryAttemptRow(row: ProtocolWebhookDeliveryAttemptRow) {
    return protocolWebhookDeliveryAttemptSchema.parse({
      deliveryId: row.delivery_id,
      appId: row.app_id,
      subscriptionId: row.subscription_id,
      attemptNumber: row.attempt_number,
      outcome: row.outcome,
      attemptedAt: this.toIsoString(row.attempted_at),
      responseStatusCode: row.response_status_code,
      errorCode: row.error_code,
      errorMessage: row.error_message,
      durationMs: row.duration_ms,
      metadata: row.metadata ?? {},
      createdAt: this.toIsoString(row.created_at),
    });
  }

  private async persistDatingConsent(input: {
    id: string;
    userId: string;
    targetUserId: string;
    scope: string;
    consentStatus: "pending" | "granted" | "revoked";
    verificationStatus: "unverified" | "verified" | "rejected";
    reason: string | null;
    expiresAt: Date | null;
    workflowRunId: string;
    traceId: string;
  }) {
    try {
      await this.prisma.datingConsentArtifact.create({
        data: {
          id: input.id,
          userId: input.userId,
          targetUserId: input.targetUserId,
          scope: input.scope,
          consentStatus: input.consentStatus,
          verificationStatus: input.verificationStatus,
          reason: input.reason,
          expiresAt: input.expiresAt,
          workflowRunId: input.workflowRunId,
          traceId: input.traceId,
        },
      });
      return true;
    } catch (error) {
      this.logger.warn(
        `dating consent persistence failed, falling back: ${String(error)}`,
      );
      await this.prisma.userPreference.create({
        data: {
          userId: input.userId,
          key: `protocol.dating_consent.${input.id}`,
          value: {
            targetUserId: input.targetUserId,
            scope: input.scope,
            consentStatus: input.consentStatus,
            verificationStatus: input.verificationStatus,
            reason: input.reason,
            expiresAt: input.expiresAt?.toISOString() ?? null,
            workflowRunId: input.workflowRunId,
            traceId: input.traceId,
          },
        },
      });
      return false;
    }
  }

  private async recordEvent(input: {
    actorAppId?: string;
    event: EventName;
    resource?: ResourceName;
    payload: unknown;
  }) {
    const issuedAt = new Date().toISOString();
    const rows = await this.prisma.$queryRawUnsafe<ProtocolEventLogRow[]>(
      `INSERT INTO protocol_event_log (actor_app_id, event_name, resource, payload, metadata, created_at)
       VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6::timestamptz)
       RETURNING cursor, actor_app_id, event_name, resource, payload, metadata, created_at`,
      input.actorAppId ?? null,
      input.event,
      input.resource ?? null,
      JSON.stringify(input.payload),
      JSON.stringify({}),
      issuedAt,
    );
    const eventRow = rows[0];
    if (!eventRow || !input.actorAppId) {
      return;
    }

    const subscriptionRows = await this.prisma.$queryRawUnsafe<
      ProtocolWebhookSubscriptionRow[]
    >(
      `SELECT subscription_id, app_id, status, target_url, event_names, resource_names, delivery_mode, retry_policy, secret_ref, metadata, created_at, updated_at
         FROM protocol_webhook_subscriptions
         WHERE app_id = $1
           AND status = 'active'
           AND $2 = ANY(event_names)`,
      input.actorAppId,
      input.event,
    );

    const envelope = this.mapEventRow(eventRow);
    for (const subscriptionRow of subscriptionRows) {
      const delivery = buildProtocolWebhookDelivery({
        deliveryId: randomUUID(),
        subscriptionId: subscriptionRow.subscription_id,
        eventName: input.event,
        status: "queued",
        attemptCount: 0,
        signature: signProtocolWebhookPayload(envelope),
        payload: envelope,
        metadata: {
          appId: input.actorAppId,
          targetUrl: subscriptionRow.target_url,
        },
        createdAt: issuedAt,
        updatedAt: issuedAt,
      });
      await this.prisma.$executeRawUnsafe(
        `INSERT INTO protocol_webhook_deliveries
         (delivery_id, subscription_id, app_id, event_cursor, event_name, status, attempt_count, next_attempt_at, last_attempt_at, delivered_at, response_status_code, error_message, signature, payload, metadata, created_at, updated_at)
         VALUES ($1, $2, $3, $4::bigint, $5, $6, $7, $8::timestamptz, $9::timestamptz, $10::timestamptz, $11, $12, $13, $14::jsonb, $15::jsonb, $16::timestamptz, $17::timestamptz)`,
        delivery.deliveryId,
        delivery.subscriptionId,
        input.actorAppId,
        String(eventRow.cursor),
        delivery.eventName,
        delivery.status,
        delivery.attemptCount,
        delivery.nextAttemptAt ?? null,
        delivery.lastAttemptAt ?? null,
        delivery.deliveredAt ?? null,
        delivery.responseStatusCode ?? null,
        delivery.errorMessage ?? null,
        delivery.signature ?? null,
        JSON.stringify(delivery.payload),
        JSON.stringify(delivery.metadata),
        issuedAt,
        issuedAt,
      );
    }
  }

  private toIsoString(value: Date | string | null | undefined) {
    if (!value) {
      return undefined;
    }
    return value instanceof Date
      ? value.toISOString()
      : new Date(value).toISOString();
  }
}
