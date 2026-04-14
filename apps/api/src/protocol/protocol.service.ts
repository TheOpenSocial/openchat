import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { PrismaService } from "../database/prisma.service.js";
import {
  buildProtocolDiscoveryDocument,
  buildProtocolManifest,
} from "@opensocial/protocol-server";
import {
  buildProtocolWebhookDelivery,
  protocolEventCatalog,
  protocolWebhookDeliverySchema,
} from "@opensocial/protocol-events";
import {
  appRegistrationRequestSchema,
  appRegistrationSchema,
  capabilityNameSchema,
  eventNameSchema,
  manifestSchema,
  protocolAppScopeGrantCreateSchema,
  protocolAppScopeGrantRevokeSchema,
  protocolAppScopeGrantSchema,
  protocolEventEnvelopeSchema,
  protocolIds,
  protocolReplayCursorSchema,
  protocolGrantSubjectTypeSchema,
  protocolScopeNameSchema,
  webhookSubscriptionCreateSchema,
  webhookSubscriptionSchema,
  type AppRegistration,
  type AppRegistrationRequest,
  type CapabilityName,
  type EventName,
  type ProtocolAppScopeGrant,
  type ProtocolAppScopeGrantCreate,
  type ProtocolAppScopeGrantRevoke,
  type ProtocolAppRegistrationResult,
  type ProtocolDiscoveryDocument,
  type ProtocolEventEnvelope,
  type ProtocolManifest,
  type ProtocolReplayCursor,
  type ProtocolScopeName,
  type WebhookSubscription,
  type WebhookSubscriptionCreate,
} from "@opensocial/protocol-types";
import {
  hashProtocolAppToken,
  issueProtocolAppToken,
  verifyProtocolAppToken,
} from "./protocol-credentials.js";
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

type RegisteredProtocolApp = {
  status: string;
  registration: AppRegistration;
  manifest: ProtocolManifest;
  issuedScopes: ProtocolScopeName[];
  issuedCapabilities: CapabilityName[];
  appTokenHash: string;
};

@Injectable()
export class ProtocolService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly deliveryWorker: ProtocolWebhookDeliveryWorkerService,
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

  async listApps() {
    const rows = await this.prisma.$queryRawUnsafe<ProtocolAppRow[]>(
      `SELECT app_id, status, registration_json, manifest_json, issued_scopes, issued_capabilities, app_token_hash
       FROM protocol_apps
       ORDER BY app_id ASC`,
    );
    return rows.map((row) => this.mapAppRow(row));
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

    const grant = this.mapGrantRow(rows[0]);
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
      deliveries,
    };
  }

  async claimDueWebhookDeliveries(limit = 25) {
    return this.deliveryWorker.claimDueDeliveries(limit);
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
      throw new NotFoundException("protocol app not found");
    }
    if (!appToken?.trim()) {
      throw new UnauthorizedException("missing protocol app token");
    }
    const app = this.mapStoredApp(row);
    if (app.status === "revoked") {
      throw new ForbiddenException("protocol app is revoked");
    }
    if (!verifyProtocolAppToken(appToken, app.appTokenHash)) {
      throw new ForbiddenException("invalid protocol app token");
    }

    const missingScopes = (requirements.scopes ?? []).filter(
      (scope) => !app.issuedScopes.includes(scope),
    );
    if (missingScopes.length > 0) {
      throw new ForbiddenException(
        `missing protocol scopes: ${missingScopes.join(", ")}`,
      );
    }

    const missingCapabilities = (requirements.capabilities ?? []).filter(
      (capability) => !app.issuedCapabilities.includes(capability),
    );
    if (missingCapabilities.length > 0) {
      throw new ForbiddenException(
        `missing protocol capabilities: ${missingCapabilities.join(", ")}`,
      );
    }

    return app;
  }

  private async findAppRow(appId: string) {
    const rows = await this.prisma.$queryRawUnsafe<ProtocolAppRow[]>(
      `SELECT app_id, status, registration_json, manifest_json, issued_scopes, issued_capabilities, app_token_hash
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
    return protocolAppScopeGrantSchema.parse({
      grantId: row.id,
      appId: row.app_id,
      scope: protocolScopeNameSchema.parse(row.scope),
      capabilities: (row.capabilities ?? []).map((capability) =>
        capabilityNameSchema.parse(capability),
      ),
      subjectType: protocolGrantSubjectTypeSchema.parse(row.subject_type),
      subjectId: row.subject_id ?? row.app_id,
      status: row.status,
      grantedByUserId: row.granted_by_user_id,
      grantedAt: this.toIsoString(row.granted_at),
      revokedAt: this.toIsoString(row.revoked_at) ?? null,
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

  private async recordEvent(input: {
    actorAppId?: string;
    event: EventName;
    resource?: "app_registration" | "webhook_subscription";
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
