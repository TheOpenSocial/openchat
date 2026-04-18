import { describe, expect, it, vi } from "vitest";
import type { AppRegistrationRequest } from "@opensocial/protocol-types";
import { ProtocolService } from "../src/protocol/protocol.service.js";
import { ProtocolWebhookDeliveryWorkerService } from "../src/protocol/protocol-webhook-delivery-worker.service.js";

function createPrismaStub() {
  const apps = new Map<string, any>();
  const subscriptions = new Map<string, any[]>();
  const deliveries = new Map<string, any[]>();
  const attempts = new Map<string, any[]>();
  const grants = new Map<string, any[]>();
  const consentRequests = new Map<string, any[]>();
  const events: any[] = [];
  const cursors = new Map<string, any>();
  let cursorSeq = 0n;
  let grantSeq = 0;
  let consentSeq = 0;

  return {
    datingConsentArtifact: {
      create: vi.fn().mockResolvedValue({}),
    },
    userPreference: {
      create: vi.fn().mockResolvedValue({}),
    },
    async $queryRawUnsafe<T = unknown>(query: string, ...params: any[]) {
      if (
        query.includes("FROM protocol_app_scope_grants") &&
        query.includes("GROUP BY status")
      ) {
        const [appId] = params;
        const rows = grants.get(appId) ?? [];
        const counts = rows.reduce(
          (acc, row) => {
            acc[row.status] = (acc[row.status] ?? 0n) + 1n;
            return acc;
          },
          {} as Record<string, bigint>,
        );
        return Object.entries(counts).map(([status, count]) => ({
          status,
          count,
        })) as T;
      }
      if (
        query.includes("FROM protocol_app_scope_grants") &&
        query.includes("GROUP BY subject_type")
      ) {
        const [appId] = params;
        const rows = grants.get(appId) ?? [];
        const counts = rows.reduce(
          (acc, row) => {
            acc[row.subject_type] = (acc[row.subject_type] ?? 0n) + 1n;
            return acc;
          },
          {} as Record<string, bigint>,
        );
        return Object.entries(counts).map(([subject_type, count]) => ({
          subject_type,
          count,
        })) as T;
      }
      if (
        query.includes("FROM protocol_app_consent_requests") &&
        query.includes("GROUP BY status")
      ) {
        const [appId] = params;
        const rows = consentRequests.get(appId) ?? [];
        const counts = rows.reduce(
          (acc, row) => {
            acc[row.status] = (acc[row.status] ?? 0n) + 1n;
            return acc;
          },
          {} as Record<string, bigint>,
        );
        return Object.entries(counts).map(([status, count]) => ({
          status,
          count,
        })) as T;
      }
      if (
        query.includes("FROM protocol_webhook_deliveries") &&
        query.includes("GROUP BY status")
      ) {
        const [appId] = params;
        const rows = deliveries.get(appId) ?? [];
        const counts = rows.reduce(
          (acc, row) => {
            acc[row.status] = (acc[row.status] ?? 0n) + 1n;
            return acc;
          },
          {} as Record<string, bigint>,
        );
        return Object.entries(counts).map(([status, count]) => ({
          status,
          count,
        })) as T;
      }
      if (query.includes("MIN(created_at) FILTER (WHERE status = 'queued')")) {
        const [appId] = params;
        const rows = deliveries.get(appId) ?? [];
        const queued =
          rows
            .filter((row) => row.status === "queued")
            .map((row) => row.created_at)
            .sort()[0] ?? null;
        const retrying =
          rows
            .filter((row) => row.status === "retrying")
            .map((row) => row.updated_at)
            .sort()[0] ?? null;
        const deadLettered =
          rows
            .filter((row) => row.status === "dead_lettered")
            .map((row) => row.updated_at)
            .sort()
            .at(-1) ?? null;
        return [
          {
            oldest_queued_at: queued,
            oldest_retrying_at: retrying,
            last_dead_lettered_at: deadLettered,
          },
        ] as T;
      }
      if (
        query.includes("FROM protocol_apps") &&
        query.includes("WHERE app_id =")
      ) {
        const row = apps.get(params[0]);
        return (row ? [row] : []) as T;
      }
      if (query.includes("FROM protocol_apps")) {
        return [...apps.values()] as T;
      }
      if (
        query.includes("FROM protocol_webhook_subscriptions") &&
        query.includes("status = 'active'")
      ) {
        const [appId, eventName] = params;
        return (subscriptions.get(appId) ?? []).filter(
          (row) =>
            row.status === "active" &&
            (row.event_names ?? []).includes(eventName),
        ) as T;
      }
      if (query.includes("FROM protocol_webhook_subscriptions")) {
        const [appId] = params;
        return (subscriptions.get(appId) ?? []) as T;
      }
      if (query.includes("FROM protocol_app_scope_grants")) {
        const [appId] = params;
        return (grants.get(appId) ?? []) as T;
      }
      if (
        query.includes("FROM protocol_app_consent_requests") &&
        query.includes("id = $2::uuid")
      ) {
        const [appId, requestId] = params;
        return (consentRequests.get(appId) ?? []).filter(
          (row) => row.id === requestId,
        ) as T;
      }
      if (query.includes("FROM protocol_app_consent_requests")) {
        const [appId] = params;
        return [...(consentRequests.get(appId) ?? [])].sort((left, right) =>
          String(right.created_at).localeCompare(String(left.created_at)),
        ) as T;
      }
      if (
        query.includes("FROM protocol_webhook_deliveries") &&
        query.includes("subscription_id = $2")
      ) {
        const [appId, subscriptionId] = params;
        return (deliveries.get(appId) ?? []).filter(
          (row) => row.subscription_id === subscriptionId,
        ) as T;
      }
      if (
        query.includes("FROM protocol_webhook_deliveries") &&
        query.includes("status = 'dead_lettered'")
      ) {
        const [appId, limit] = params;
        return (deliveries.get(appId) ?? [])
          .filter((row) => row.status === "dead_lettered")
          .slice(0, Number(limit))
          .map((row) => ({
            delivery_id: row.delivery_id,
          })) as T;
      }
      if (query.includes("FROM protocol_webhook_deliveries")) {
        const [appId, sinceCursor] = params;
        return (deliveries.get(appId) ?? []).filter((row) => {
          const eventCursor =
            row.event_cursor == null ? 0 : Number(row.event_cursor);
          return sinceCursor === 0 || eventCursor > Number(sinceCursor);
        }) as T;
      }
      if (
        query.includes("UPDATE protocol_webhook_deliveries") &&
        query.includes("status = 'queued'")
      ) {
        const [deliveryId, replayedAt] = params;
        for (const [appId, rows] of deliveries.entries()) {
          const row = rows.find(
            (entry) =>
              entry.delivery_id === deliveryId &&
              entry.status === "dead_lettered",
          );
          if (!row) {
            continue;
          }
          row.status = "queued";
          row.attempt_count = 0;
          row.next_attempt_at = replayedAt;
          row.delivered_at = null;
          row.failed_at = null;
          row.response_status_code = null;
          row.response_body = null;
          row.error_code = null;
          row.error_message = null;
          row.updated_at = replayedAt;
          row.app_id = appId;
          return [
            {
              deliveryId: row.delivery_id,
              appId: row.app_id,
              subscriptionId: row.subscription_id,
              eventId: null,
              eventType: row.event_name,
              payload: row.payload,
              dedupeKey: null,
              attemptCount: row.attempt_count,
              status: row.status,
              nextAttemptAt: row.next_attempt_at,
              deliveredAt: row.delivered_at,
              failedAt: row.failed_at,
              responseStatus: row.response_status_code,
              responseBody: row.response_body ?? null,
              errorCode: row.error_code ?? null,
              errorMessage: row.error_message ?? null,
              createdAt: row.created_at,
              updatedAt: row.updated_at,
            },
          ] as T;
        }
        return [] as T;
      }
      if (query.includes("FROM protocol_webhook_delivery_attempts")) {
        const [appId, deliveryId] = params;
        return (attempts.get(appId) ?? []).filter(
          (row) => row.delivery_id === deliveryId,
        ) as T;
      }
      if (
        query.includes("FROM protocol_event_log") &&
        query.includes("ORDER BY cursor DESC")
      ) {
        const [appId] = params;
        return events
          .filter((row) => row.actor_app_id === appId)
          .slice()
          .sort(
            (left, right) => Number(right.cursor) - Number(left.cursor),
          ) as T;
      }
      if (query.includes("FROM protocol_event_log")) {
        const [appId, sinceCursor] = params;
        const lowerBound = sinceCursor == null ? 0n : BigInt(sinceCursor);
        return events.filter(
          (row) =>
            (row.actor_app_id === appId || row.actor_app_id == null) &&
            BigInt(row.cursor) > lowerBound,
        ) as T;
      }
      if (query.includes("FROM protocol_event_cursors")) {
        const row = cursors.get(params[0]);
        return (row ? [row] : []) as T;
      }
      if (query.includes("RETURNING cursor, actor_app_id")) {
        cursorSeq += 1n;
        const row = {
          cursor: cursorSeq,
          actor_app_id: params[0],
          event_name: params[1],
          resource: params[2],
          payload: JSON.parse(params[3]),
          metadata: JSON.parse(params[4]),
          created_at: params[5],
        };
        events.push(row);
        return [row] as T;
      }
      if (query.includes("RETURNING app_id, cursor, updated_at")) {
        const row = {
          app_id: params[0],
          cursor: BigInt(params[1]),
          updated_at: params[2],
        };
        cursors.set(params[0], row);
        return [row] as T;
      }
      if (query.includes("INSERT INTO protocol_app_scope_grants")) {
        const existing = grants.get(params[0]) ?? [];
        const duplicate = existing.find(
          (row) =>
            row.scope === params[1] &&
            row.subject_type === params[3] &&
            row.subject_id === params[4],
        );
        if (!duplicate) {
          grantSeq += 1;
        }
        const row = {
          id:
            duplicate?.id ??
            `00000000-0000-4000-8000-${String(grantSeq).padStart(12, "0")}`,
          app_id: params[0],
          scope: params[1],
          capabilities: params[2],
          subject_type: params[3],
          subject_id: params[4],
          status: "active",
          granted_by_user_id: params[5],
          granted_at: params[6],
          revoked_at: null,
          metadata: JSON.parse(params[7]),
          created_at: duplicate?.created_at ?? params[8],
          updated_at: params[9],
        };
        grants.set(
          params[0],
          duplicate
            ? existing.map((entry) => (entry.id === duplicate.id ? row : entry))
            : [...existing, row],
        );
        return [row] as T;
      }
      if (query.includes("INSERT INTO protocol_app_consent_requests")) {
        const existing = consentRequests.get(params[0]) ?? [];
        consentSeq += 1;
        const row = {
          id: `00000000-0000-4000-8000-${String(consentSeq).padStart(12, "0")}`,
          app_id: params[0],
          scope: params[1],
          capabilities: params[2],
          subject_type: params[3],
          subject_id: params[4],
          status: "pending",
          requested_by_user_id: params[5],
          approved_by_user_id: null,
          rejected_by_user_id: null,
          approved_grant_id: null,
          requested_at: params[6],
          approved_at: null,
          rejected_at: null,
          cancelled_at: null,
          expired_at: null,
          metadata: JSON.parse(params[7]),
          created_at: params[8],
          updated_at: params[9],
        };
        consentRequests.set(row.app_id, [...existing, row]);
        return [row] as T;
      }
      if (
        query.includes("UPDATE protocol_app_consent_requests") &&
        query.includes("status = 'approved'")
      ) {
        const [
          appId,
          requestId,
          grantId,
          approvedByUserId,
          approvedAt,
          metadata,
        ] = params;
        const existing = consentRequests.get(appId) ?? [];
        const row = existing.find((entry) => entry.id === requestId);
        if (!row) {
          return [] as T;
        }
        row.status = "approved";
        row.approved_grant_id = grantId;
        row.approved_by_user_id = approvedByUserId;
        row.approved_at = approvedAt;
        row.metadata = {
          ...(row.metadata ?? {}),
          ...JSON.parse(metadata),
        };
        row.updated_at = approvedAt;
        return [row] as T;
      }
      if (
        query.includes("UPDATE protocol_app_consent_requests") &&
        query.includes("status = 'rejected'")
      ) {
        const [appId, requestId, rejectedByUserId, rejectedAt, metadata] =
          params;
        const existing = consentRequests.get(appId) ?? [];
        const row = existing.find((entry) => entry.id === requestId);
        if (!row) {
          return [] as T;
        }
        row.status = "rejected";
        row.rejected_by_user_id = rejectedByUserId;
        row.rejected_at = rejectedAt;
        row.metadata = {
          ...(row.metadata ?? {}),
          ...JSON.parse(metadata),
        };
        row.updated_at = rejectedAt;
        return [row] as T;
      }
      if (query.includes("UPDATE protocol_app_scope_grants")) {
        const existing = grants.get(params[0]) ?? [];
        const row = existing.find((entry) => entry.id === params[1]);
        if (!row) {
          return [] as T;
        }
        row.status = "revoked";
        row.revoked_at = params[2];
        row.metadata = {
          ...(row.metadata ?? {}),
          ...JSON.parse(params[3]),
        };
        row.updated_at = params[2];
        return [row] as T;
      }
      return [] as T;
    },
    async $executeRawUnsafe(query: string, ...params: any[]) {
      if (query.includes("INSERT INTO protocol_apps")) {
        apps.set(params[0], {
          app_id: params[0],
          status: params[1],
          registration_json: JSON.parse(params[2]),
          manifest_json: JSON.parse(params[3]),
          issued_scopes: params[4],
          issued_capabilities: params[5],
          app_token_hash: params[6],
          updated_at: new Date().toISOString(),
        });
        return 1;
      }
      if (query.includes("UPDATE protocol_apps")) {
        const existing = apps.get(params[0]);
        if (!existing) {
          return 0;
        }
        const updated = {
          ...existing,
          status: params[1],
          registration_json: JSON.parse(params[2]),
          app_token_hash: params[3],
          updated_at: new Date().toISOString(),
        };
        apps.set(params[0], updated);
        return 1;
      }
      if (query.includes("INSERT INTO protocol_webhook_subscriptions")) {
        const row = {
          subscription_id: params[0],
          app_id: params[1],
          status: params[2],
          target_url: params[3],
          event_names: params[4],
          resource_names: params[5],
          delivery_mode: params[6],
          retry_policy: JSON.parse(params[7]),
          secret_ref: params[8],
          metadata: JSON.parse(params[9]),
          created_at: params[10],
          updated_at: params[11],
        };
        subscriptions.set(row.app_id, [
          ...(subscriptions.get(row.app_id) ?? []),
          row,
        ]);
        return 1;
      }
      if (query.includes("INSERT INTO protocol_webhook_deliveries")) {
        const row = {
          delivery_id: params[0],
          subscription_id: params[1],
          app_id: params[2],
          event_cursor: params[3],
          event_name: params[4],
          status: params[5],
          attempt_count: params[6],
          next_attempt_at: params[7],
          last_attempt_at: params[8],
          delivered_at: params[9],
          response_status_code: params[10],
          error_message: params[11],
          signature: params[12],
          payload: JSON.parse(params[13]),
          metadata: JSON.parse(params[14]),
          created_at: params[15],
          updated_at: params[16],
        };
        deliveries.set(row.app_id, [
          ...(deliveries.get(row.app_id) ?? []),
          row,
        ]);
        return 1;
      }
      if (query.includes("INSERT INTO protocol_webhook_delivery_attempts")) {
        const row = {
          delivery_id: params[0],
          app_id: params[1],
          subscription_id: params[2],
          attempt_number: params[3],
          outcome: params[4],
          attempted_at: params[5],
          response_status_code: params[6],
          error_code: params[7],
          error_message: params[8],
          duration_ms: params[9],
          metadata: JSON.parse(params[10]),
          created_at: params[11],
        };
        attempts.set(row.app_id, [...(attempts.get(row.app_id) ?? []), row]);
        return 1;
      }
      return 0;
    },
  };
}

function createDeliveryWorkerStub() {
  return {
    claimDueDeliveries: async (limit = 25) => ({
      claimedCount: 0,
      claimedAt: "2026-04-13T00:00:00.000Z",
      deliveries: [],
      limit,
    }),
    replayDeadLetteredDelivery: async (deliveryId: string) => ({
      deliveryId,
      appId: "partner.alpha",
      subscriptionId: "subscription-1",
      previousStatus: "dead_lettered",
      status: "queued",
      attemptCount: 0,
      replayedAt: "2026-04-13T00:00:00.000Z",
      nextAttemptAt: "2026-04-13T00:00:00.000Z",
    }),
    recordAttempt: async () => undefined,
  };
}

function createDeliveryRunnerStub() {
  return {
    runDueDeliveries: async () => ({
      claimedCount: 0,
      attemptedCount: 0,
      deliveredCount: 0,
      retryScheduledCount: 0,
      deadLetteredCount: 0,
      skippedCount: 0,
      ranAt: "2026-04-13T00:00:00.000Z",
      results: [],
    }),
  };
}

function createProtocolQueueStub() {
  return {
    add: async () => ({
      id: "job-1",
    }),
    getJobCounts: async () => ({
      waiting: 2,
      active: 1,
      delayed: 3,
      completed: 4,
      failed: 5,
    }),
  };
}

function createIntentsServiceStub() {
  return {
    createIntent: async (
      userId: string,
      rawText: string,
      traceId: string,
      agentThreadId?: string,
    ) => ({
      id: "00000000-0000-4000-8000-000000000101",
      userId,
      rawText,
      traceId,
      status: "active",
      safetyState: "clean",
      agentThreadId: agentThreadId ?? null,
    }),
    assertIntentOwnership: async () => undefined,
    sendIntentRequest: async (input: {
      intentId: string;
      recipientUserId: string;
    }) => ({
      id: "00000000-0000-4000-8000-000000000102",
      intentId: input.intentId,
      recipientUserId: input.recipientUserId,
      status: "pending",
    }),
  };
}

function createInboxServiceStub() {
  return {
    updateStatus: async (
      requestId: string,
      status: "accepted" | "rejected",
      actorUserId?: string,
    ) => ({
      request: {
        id: requestId,
        intentId: "00000000-0000-4000-8000-000000000103",
        status,
        recipientUserId: actorUserId ?? "00000000-0000-4000-8000-000000000010",
      },
      queued: status === "accepted",
      unchanged: false,
    }),
  };
}

function createChatsServiceStub() {
  return {
    createChat: async (
      connectionId: string,
      type: "dm" | "group",
      createdByUserId: string,
    ) => ({
      id: "00000000-0000-4000-8000-000000000109",
      connectionId,
      type,
      createdByUserId,
      createdAt: new Date("2026-04-13T00:00:00.000Z"),
    }),
    createMessage: async (
      chatId: string,
      senderUserId: string,
      body: string,
      options?: { replyToMessageId?: string | undefined },
    ) => ({
      id: "00000000-0000-4000-8000-000000000104",
      chatId,
      senderUserId,
      body,
      replyToMessageId: options?.replyToMessageId ?? null,
      createdAt: new Date("2026-04-13T00:00:00.000Z"),
    }),
  };
}

function createConnectionsServiceStub() {
  return {
    createConnection: async (
      type: "dm" | "group",
      createdByUserId: string,
      originIntentId?: string,
    ) => ({
      id: "00000000-0000-4000-8000-000000000110",
      type,
      createdByUserId,
      originIntentId: originIntentId ?? null,
    }),
  };
}

function createRecurringCirclesServiceStub() {
  return {
    createCircle: async (
      ownerUserId: string,
      body: {
        title: string;
        targetSize?: number;
        cadence: { timezone: string };
      },
    ) => ({
      id: "00000000-0000-4000-8000-000000000105",
      ownerUserId,
      title: body.title,
      status: "active",
      nextSessionAt: new Date("2026-04-20T21:00:00.000Z"),
    }),
    addMember: async (
      circleId: string,
      ownerUserId: string,
      body: { userId: string; role: "member" | "admin" },
    ) => ({
      id: "00000000-0000-4000-8000-000000000106",
      circleId,
      ownerUserId,
      userId: body.userId,
      role: body.role,
      status: "active",
    }),
    removeMember: async (
      circleId: string,
      ownerUserId: string,
      memberUserId: string,
    ) => ({
      id: "00000000-0000-4000-8000-000000000107",
      circleId,
      ownerUserId,
      userId: memberUserId,
      status: "removed",
    }),
  };
}

function createNotificationsServiceStub() {
  return {
    createInAppNotification: vi.fn().mockResolvedValue({
      id: "00000000-0000-4000-8000-000000000108",
    }),
  };
}

function createProtocolService() {
  return new ProtocolService(
    createPrismaStub() as any,
    createDeliveryWorkerStub() as any,
    createDeliveryRunnerStub() as any,
    createProtocolQueueStub() as any,
    createIntentsServiceStub() as any,
    createInboxServiceStub() as any,
    createChatsServiceStub() as any,
    createConnectionsServiceStub() as any,
    createRecurringCirclesServiceStub() as any,
    createNotificationsServiceStub() as any,
  );
}

function createRegistrationPayload(): AppRegistrationRequest {
  return {
    registration: {
      protocolId: "opensocial.app-registration.v1",
      appId: "partner.alpha",
      name: "Partner Alpha",
      kind: "server",
      status: "draft",
      redirectUris: ["https://alpha.example.com/oauth/callback"],
      webhookUrl: "https://alpha.example.com/hooks/opensocial",
      metadata: {},
      capabilities: {
        scopes: [
          "protocol.read",
          "protocol.write",
          "actions.invoke",
          "webhooks.manage",
          "events.subscribe",
        ],
        resources: ["app_registration", "webhook_subscription", "manifest"],
        actions: [
          "app.read",
          "app.update",
          "webhook.subscribe",
          "event.replay",
        ],
        events: ["app.registered", "webhook.delivered", "app.updated"],
        capabilities: [
          "app.read",
          "app.write",
          "intent.write",
          "request.write",
          "chat.write",
          "circle.write",
          "webhook.read",
          "webhook.write",
          "event.read",
        ],
        canActAsAgent: false,
        canManageWebhooks: true,
      },
    },
    manifest: {
      protocolId: "opensocial.manifest.v1",
      manifestId: "partner-alpha-manifest",
      appId: "partner.alpha",
      name: "Partner Alpha",
      version: "0.1.0",
      summary: "Protocol partner",
      categories: ["coordination"],
      capabilities: {
        scopes: [
          "protocol.read",
          "protocol.write",
          "actions.invoke",
          "webhooks.manage",
          "events.subscribe",
        ],
        resources: ["app_registration", "webhook_subscription", "manifest"],
        actions: [
          "app.read",
          "app.update",
          "webhook.subscribe",
          "event.replay",
        ],
        events: ["app.registered", "webhook.delivered", "app.updated"],
        capabilities: [
          "app.read",
          "app.write",
          "intent.write",
          "request.write",
          "chat.write",
          "circle.write",
          "webhook.read",
          "webhook.write",
          "event.read",
        ],
        canActAsAgent: false,
        canManageWebhooks: true,
      },
      resources: ["app_registration", "webhook_subscription", "manifest"],
      actions: ["app.read", "app.update", "webhook.subscribe", "event.replay"],
      events: ["app.registered", "webhook.delivered", "app.updated"],
      webhooks: [],
      agent: {
        enabled: false,
        modes: [],
        requiresHumanApproval: true,
      },
      metadata: {},
    },
    requestedScopes: [
      "protocol.read",
      "protocol.write",
      "actions.invoke",
      "webhooks.manage",
      "events.subscribe",
    ],
    requestedCapabilities: [
      "app.read",
      "app.write",
      "intent.write",
      "request.write",
      "chat.write",
      "circle.write",
      "webhook.read",
      "webhook.write",
      "event.read",
    ],
  };
}

describe("ProtocolService", () => {
  it("registers an app and issues a token", async () => {
    const service = createProtocolService();

    const result = await service.registerApp(createRegistrationPayload());

    expect(result.registration.appId).toBe("partner.alpha");
    expect(result.credentials.appToken.length).toBeGreaterThan(20);
    expect(result.issuedScopes).toContain("webhooks.manage");
    expect(result.issuedCapabilities).toContain("webhook.write");
  });

  it("creates subscriptions, deliveries, and replay events", async () => {
    const service = createProtocolService();
    const registration = await service.registerApp(createRegistrationPayload());

    const subscription = await service.createWebhook(
      "partner.alpha",
      registration.credentials.appToken,
      {
        targetUrl: "https://alpha.example.com/hooks/opensocial",
        events: ["app.updated", "webhook.delivered"],
        resources: ["app_registration", "webhook_subscription"],
        deliveryMode: "json",
        retryPolicy: {
          maxAttempts: 5,
          backoffMs: 1000,
          maxBackoffMs: 10000,
        },
        metadata: { tenant: "alpha" },
      },
    );

    const webhooks = await service.listWebhooks(
      "partner.alpha",
      registration.credentials.appToken,
    );
    const deliveries = await service.listWebhookDeliveries(
      "partner.alpha",
      registration.credentials.appToken,
      subscription.subscriptionId,
    );
    const events = await service.replayEvents(
      "partner.alpha",
      registration.credentials.appToken,
    );

    expect(webhooks).toHaveLength(1);
    expect(deliveries).toHaveLength(1);
    expect(deliveries[0].signature).toBeTruthy();
    expect(events.some((entry) => entry.event === "app.registered")).toBe(true);
    expect(events.some((entry) => entry.event === "app.updated")).toBe(true);
  });

  it("stores and returns replay cursors", async () => {
    const service = createProtocolService();
    const registration = await service.registerApp(createRegistrationPayload());

    const initial = await service.getReplayCursor(
      "partner.alpha",
      registration.credentials.appToken,
    );
    const saved = await service.saveReplayCursor(
      "partner.alpha",
      registration.credentials.appToken,
      "21",
    );

    expect(initial.cursor).toBe("0");
    expect(saved.cursor).toBe("21");
  });

  it("rejects invalid replay cursors for replay and cursor persistence", async () => {
    const service = createProtocolService();
    const registration = await service.registerApp(createRegistrationPayload());

    await expect(
      service.replayEvents(
        "partner.alpha",
        registration.credentials.appToken,
        "not-a-cursor",
      ),
    ).rejects.toThrow("invalid event replay cursor");

    await expect(
      service.saveReplayCursor(
        "partner.alpha",
        registration.credentials.appToken,
        "-1",
      ),
    ).rejects.toThrow("invalid event replay cursor");
  });

  it("rotates app tokens and invalidates the previous token", async () => {
    const service = createProtocolService();
    const registration = await service.registerApp(createRegistrationPayload());

    const rotated = await service.rotateAppToken(
      "partner.alpha",
      registration.credentials.appToken,
    );

    expect(rotated.credentials.appToken).not.toBe(
      registration.credentials.appToken,
    );

    await expect(
      service.listWebhooks("partner.alpha", registration.credentials.appToken),
    ).rejects.toThrow("invalid protocol app token");

    const refreshed = await service.listWebhooks(
      "partner.alpha",
      rotated.credentials.appToken,
    );
    expect(refreshed).toEqual([]);
  });

  it("revokes app tokens and blocks subsequent access", async () => {
    const service = createProtocolService();
    const registration = await service.registerApp(createRegistrationPayload());

    const revoked = await service.revokeAppToken(
      "partner.alpha",
      registration.credentials.appToken,
    );

    expect(revoked.revoked).toBe(true);
    expect(revoked.registration.status).toBe("revoked");

    await expect(service.listApps()).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          status: "revoked",
          registration: expect.objectContaining({ status: "revoked" }),
        }),
      ]),
    );

    await expect(
      service.listWebhooks("partner.alpha", registration.credentials.appToken),
    ).rejects.toThrow("protocol app is revoked");
  });

  it("inspects the delivery queue for an app", async () => {
    const service = createProtocolService();
    const registration = await service.registerApp(createRegistrationPayload());
    const subscription = await service.createWebhook(
      "partner.alpha",
      registration.credentials.appToken,
      {
        targetUrl: "https://alpha.example.com/hooks/opensocial",
        events: ["app.updated"],
        resources: ["app_registration"],
        deliveryMode: "json",
        retryPolicy: {
          maxAttempts: 5,
          backoffMs: 1000,
          maxBackoffMs: 10000,
        },
        metadata: {},
      },
    );

    const queue = await service.inspectDeliveryQueue(
      "partner.alpha",
      registration.credentials.appToken,
    );

    expect(queue.appId).toBe("partner.alpha");
    expect(queue.deliveries).toHaveLength(1);
    expect(queue.deliveries[0].subscriptionId).toBe(
      subscription.subscriptionId,
    );
    expect(queue.queuedCount).toBe(1);
    expect(queue.replayableCount).toBe(0);
    expect(queue.oldestQueuedAt).not.toBeNull();
  });

  it("creates, lists, and revokes app scope grants", async () => {
    const service = createProtocolService();
    const registration = await service.registerApp(createRegistrationPayload());

    const created = await service.createAppGrant(
      "partner.alpha",
      registration.credentials.appToken,
      {
        scope: "resources.read",
        capabilities: ["app.read"],
        subjectType: "user",
        subjectId: "00000000-0000-4000-8000-000000000001",
        grantedByUserId: "00000000-0000-4000-8000-000000000002",
        metadata: { source: "test" },
      },
    );
    const listed = await service.listAppGrants(
      "partner.alpha",
      registration.credentials.appToken,
    );
    const revoked = await service.revokeAppGrant(
      "partner.alpha",
      created.grantId,
      registration.credentials.appToken,
      {
        revokedByUserId: "00000000-0000-4000-8000-000000000003",
        metadata: { reason: "done" },
      },
    );

    expect(created.scope).toBe("resources.read");
    expect(created.subjectType).toBe("user");
    expect(listed).toHaveLength(1);
    expect(revoked.status).toBe("revoked");
    expect(revoked.metadata).toMatchObject({
      source: "test",
      reason: "done",
      revokedByUserId: "00000000-0000-4000-8000-000000000003",
    });
  });

  it("requires an active delegated grant before invoking external actions", async () => {
    const service = createProtocolService();
    const registration = await service.registerApp(createRegistrationPayload());

    await expect(
      service.createIntentAction(
        "partner.alpha",
        registration.credentials.appToken,
        {
          actorUserId: "00000000-0000-4000-8000-000000000001",
          rawText: "Find a thoughtful dinner group this week",
          metadata: {},
        },
      ),
    ).rejects.toThrow("missing active protocol grant for intent.create");
  });

  it("invokes protocol actions after a delegated grant is present", async () => {
    const notificationsService = createNotificationsServiceStub();
    const service = new ProtocolService(
      createPrismaStub() as any,
      createDeliveryWorkerStub() as any,
      createDeliveryRunnerStub() as any,
      createProtocolQueueStub() as any,
      createIntentsServiceStub() as any,
      createInboxServiceStub() as any,
      createChatsServiceStub() as any,
      createConnectionsServiceStub() as any,
      createRecurringCirclesServiceStub() as any,
      notificationsService as any,
    );
    const registration = await service.registerApp(createRegistrationPayload());
    await service.createAppGrant(
      "partner.alpha",
      registration.credentials.appToken,
      {
        scope: "actions.invoke",
        capabilities: [
          "intent.write",
          "request.write",
          "chat.write",
          "circle.write",
        ],
        subjectType: "user",
        subjectId: "00000000-0000-4000-8000-000000000001",
        metadata: { source: "test" },
      },
    );

    const createdIntent = await service.createIntentAction(
      "partner.alpha",
      registration.credentials.appToken,
      {
        actorUserId: "00000000-0000-4000-8000-000000000001",
        rawText: "Find a thoughtful dinner group this week",
        metadata: {},
      },
    );
    const sentRequest = await service.sendRequestAction(
      "partner.alpha",
      registration.credentials.appToken,
      {
        actorUserId: "00000000-0000-4000-8000-000000000001",
        intentId: "00000000-0000-4000-8000-000000000101",
        recipientUserId: "00000000-0000-4000-8000-000000000002",
        metadata: {},
      },
    );
    const acceptedRequest = await service.acceptRequestAction(
      "partner.alpha",
      registration.credentials.appToken,
      "00000000-0000-4000-8000-000000000200",
      {
        actorUserId: "00000000-0000-4000-8000-000000000001",
        metadata: {},
      },
    );
    const chatMessage = await service.sendChatMessageAction(
      "partner.alpha",
      registration.credentials.appToken,
      "00000000-0000-4000-8000-000000000300",
      {
        actorUserId: "00000000-0000-4000-8000-000000000001",
        body: "Thursday works for me.",
        metadata: {},
      },
    );
    const createdCircle = await service.createCircleAction(
      "partner.alpha",
      registration.credentials.appToken,
      {
        actorUserId: "00000000-0000-4000-8000-000000000001",
        title: "Design dinner circle",
        visibility: "private",
        topicTags: ["design", "dinner"],
        targetSize: 4,
        cadence: {
          kind: "weekly",
          days: ["thu"],
          hour: 18,
          minute: 0,
          timezone: "America/Argentina/Buenos_Aires",
          intervalWeeks: 1,
        },
        metadata: {},
      },
    );
    const joinedCircle = await service.joinCircleAction(
      "partner.alpha",
      registration.credentials.appToken,
      "00000000-0000-4000-8000-000000000105",
      {
        actorUserId: "00000000-0000-4000-8000-000000000001",
        memberUserId: "00000000-0000-4000-8000-000000000002",
        role: "member",
        metadata: {},
      },
    );
    const leftCircle = await service.leaveCircleAction(
      "partner.alpha",
      registration.credentials.appToken,
      "00000000-0000-4000-8000-000000000105",
      {
        actorUserId: "00000000-0000-4000-8000-000000000001",
        memberUserId: "00000000-0000-4000-8000-000000000002",
        metadata: {},
      },
    );

    expect(createdIntent.action).toBe("intent.create");
    expect(sentRequest.action).toBe("request.send");
    expect(acceptedRequest.action).toBe("request.accept");
    expect(chatMessage.action).toBe("chat.send_message");
    expect(createdCircle.action).toBe("circle.create");
    expect(joinedCircle.action).toBe("circle.join");
    expect(leftCircle.action).toBe("circle.leave");
    expect(notificationsService.createInAppNotification).toHaveBeenCalledTimes(
      3,
    );
  });

  it("normalizes first-party dating consent persistence through the protocol service", async () => {
    const notificationsService = createNotificationsServiceStub();
    const service = new ProtocolService(
      createPrismaStub() as any,
      createDeliveryWorkerStub() as any,
      createDeliveryRunnerStub() as any,
      createProtocolQueueStub() as any,
      createIntentsServiceStub() as any,
      createInboxServiceStub() as any,
      createChatsServiceStub() as any,
      createConnectionsServiceStub() as any,
      createRecurringCirclesServiceStub() as any,
      notificationsService as any,
    );

    const persisted = await service.createFirstPartyDatingConsentAction({
      id: "00000000-0000-4000-8000-000000000200",
      userId: "00000000-0000-4000-8000-000000000001",
      targetUserId: "00000000-0000-4000-8000-000000000002",
      scope: "dm_intro",
      consentStatus: "granted",
      verificationStatus: "verified",
      reason: null,
      expiresAt: null,
    });

    expect(persisted).toBe(true);
    expect(notificationsService.createInAppNotification).toHaveBeenCalledWith(
      "00000000-0000-4000-8000-000000000002",
      expect.anything(),
      expect.stringContaining("dating-intro consent request"),
      expect.objectContaining({
        source: "protocol",
        operation: "dating_consent",
      }),
    );
  });

  it("runs due deliveries through the app-scoped runner endpoint", async () => {
    const service = createProtocolService();
    const registration = await service.registerApp(createRegistrationPayload());

    const result = await service.runDueWebhookDeliveries(
      "partner.alpha",
      registration.credentials.appToken,
      { limit: 5 },
    );

    expect(result.claimedCount).toBe(0);
    expect(result.ranAt).toBe("2026-04-13T00:00:00.000Z");
  });

  it("forwards protocol provenance metadata through request actions", async () => {
    const intentsService = {
      createIntent: vi.fn(),
      assertIntentOwnership: vi.fn().mockResolvedValue(undefined),
      sendIntentRequest: vi.fn().mockResolvedValue({
        id: "00000000-0000-4000-8000-000000000102",
        intentId: "00000000-0000-4000-8000-000000000101",
        recipientUserId: "00000000-0000-4000-8000-000000000002",
        status: "pending",
      }),
    };
    const inboxService = {
      updateStatus: vi.fn().mockResolvedValue({
        request: {
          id: "00000000-0000-4000-8000-000000000102",
          intentId: "00000000-0000-4000-8000-000000000101",
          status: "rejected",
          senderUserId: "00000000-0000-4000-8000-000000000001",
          recipientUserId: "00000000-0000-4000-8000-000000000002",
        },
        queued: false,
        unchanged: false,
      }),
    };
    const service = new ProtocolService(
      createPrismaStub() as any,
      createDeliveryWorkerStub() as any,
      createDeliveryRunnerStub() as any,
      createProtocolQueueStub() as any,
      intentsService as any,
      inboxService as any,
      createChatsServiceStub() as any,
      createConnectionsServiceStub() as any,
      createRecurringCirclesServiceStub() as any,
      createNotificationsServiceStub() as any,
    );
    const registration = await service.registerApp(createRegistrationPayload());
    await service.createAppGrant(
      "partner.alpha",
      registration.credentials.appToken,
      {
        scope: "actions.invoke",
        capabilities: ["request.write"],
        subjectType: "user",
        subjectId: "00000000-0000-4000-8000-000000000001",
        metadata: { source: "test" },
      },
    );
    await service.createAppGrant(
      "partner.alpha",
      registration.credentials.appToken,
      {
        scope: "actions.invoke",
        capabilities: ["request.write"],
        subjectType: "user",
        subjectId: "00000000-0000-4000-8000-000000000002",
        metadata: { source: "test" },
      },
    );

    await service.sendRequestAction(
      "partner.alpha",
      registration.credentials.appToken,
      {
        actorUserId: "00000000-0000-4000-8000-000000000001",
        intentId: "00000000-0000-4000-8000-000000000101",
        recipientUserId: "00000000-0000-4000-8000-000000000002",
        metadata: {},
      },
    );
    await service.rejectRequestAction(
      "partner.alpha",
      registration.credentials.appToken,
      "00000000-0000-4000-8000-000000000102",
      {
        actorUserId: "00000000-0000-4000-8000-000000000002",
        metadata: {},
      },
    );

    expect(intentsService.sendIntentRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        notificationMetadata: {
          provenance: expect.objectContaining({
            source: "protocol",
            action: "request.send",
            resource: "intent_request",
            actorAppId: "partner.alpha",
          }),
        },
        requestMetadata: {
          provenance: expect.objectContaining({
            source: "protocol",
            action: "request.send",
            resource: "intent_request",
            actorAppId: "partner.alpha",
          }),
        },
      }),
    );
    expect(inboxService.updateStatus).toHaveBeenCalledWith(
      "00000000-0000-4000-8000-000000000102",
      "rejected",
      "00000000-0000-4000-8000-000000000002",
      {
        notificationMetadata: {
          provenance: expect.objectContaining({
            source: "protocol",
            action: "request.reject",
            resource: "intent_request",
            actorAppId: "partner.alpha",
          }),
        },
      },
    );
  });

  it("lists webhook delivery attempts for an app delivery", async () => {
    const prisma = createPrismaStub() as any;
    const queue = createProtocolQueueStub() as any;
    const worker = createDeliveryWorkerStub() as any;
    const seeded = new ProtocolService(
      prisma,
      worker,
      createDeliveryRunnerStub() as any,
      queue,
      createIntentsServiceStub() as any,
      createInboxServiceStub() as any,
      createChatsServiceStub() as any,
      createConnectionsServiceStub() as any,
      createRecurringCirclesServiceStub() as any,
      createNotificationsServiceStub() as any,
    );
    const seededRegistration = await seeded.registerApp(
      createRegistrationPayload(),
    );
    await prisma.$executeRawUnsafe(
      `INSERT INTO protocol_webhook_delivery_attempts
       (delivery_id, app_id, subscription_id, attempt_number, outcome, attempted_at, response_status_code, error_code, error_message, duration_ms, metadata, created_at)
       VALUES ($1, $2, $3, $4, $5, $6::timestamptz, $7, $8, $9, $10, $11::jsonb, $12::timestamptz)`,
      "00000000-0000-4000-8000-000000000401",
      "partner.alpha",
      "subscription-1",
      1,
      "retrying",
      "2026-04-13T00:00:00.000Z",
      503,
      "http_503",
      "temporarily unavailable",
      120,
      JSON.stringify({
        endpointUrl: "https://alpha.example.com/hooks/opensocial",
      }),
      "2026-04-13T00:00:00.000Z",
    );

    const attempts = await seeded.listWebhookDeliveryAttempts(
      "partner.alpha",
      seededRegistration.credentials.appToken,
      "00000000-0000-4000-8000-000000000401",
    );

    expect(attempts).toHaveLength(1);
    expect(attempts[0]?.outcome).toBe("retrying");
  });

  it("replays a dead-lettered delivery for an app", async () => {
    const prisma = createPrismaStub() as any;
    const queue = createProtocolQueueStub() as any;
    const worker = new ProtocolWebhookDeliveryWorkerService(prisma as any);
    const service = new ProtocolService(
      prisma,
      worker as any,
      createDeliveryRunnerStub() as any,
      queue,
      createIntentsServiceStub() as any,
      createInboxServiceStub() as any,
      createChatsServiceStub() as any,
      createConnectionsServiceStub() as any,
      createRecurringCirclesServiceStub() as any,
      createNotificationsServiceStub() as any,
    );
    const registration = await service.registerApp(createRegistrationPayload());
    await prisma.$executeRawUnsafe(
      `INSERT INTO protocol_webhook_deliveries
       (delivery_id, subscription_id, app_id, event_cursor, event_name, status, attempt_count, next_attempt_at, last_attempt_at, delivered_at, response_status_code, error_message, signature, payload, metadata, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::timestamptz, $9::timestamptz, $10::timestamptz, $11, $12, $13, $14::jsonb, $15::jsonb, $16::timestamptz, $17::timestamptz)`,
      "00000000-0000-4000-8000-000000000402",
      "subscription-1",
      "partner.alpha",
      7,
      "webhook.failed",
      "dead_lettered",
      5,
      null,
      "2026-04-13T00:00:00.000Z",
      null,
      503,
      "temporarily unavailable",
      null,
      JSON.stringify({ eventName: "webhook.failed" }),
      JSON.stringify({ source: "test" }),
      "2026-04-13T00:00:00.000Z",
      "2026-04-13T00:00:00.000Z",
    );

    const replayed = await service.replayWebhookDelivery(
      "partner.alpha",
      registration.credentials.appToken,
      "00000000-0000-4000-8000-000000000402",
    );

    expect(replayed.previousStatus).toBe("dead_lettered");
    expect(replayed.status).toBe("queued");
    expect(replayed.attemptCount).toBe(0);

    const queueInspection = await service.inspectDeliveryQueue(
      "partner.alpha",
      registration.credentials.appToken,
    );
    expect(
      queueInspection.deliveries.find(
        (delivery) =>
          delivery.deliveryId === "00000000-0000-4000-8000-000000000402",
      )?.status,
    ).toBe("queued");
  });

  it("replays dead-lettered deliveries in batch for an app", async () => {
    const prisma = createPrismaStub() as any;
    const queue = createProtocolQueueStub() as any;
    const worker = new ProtocolWebhookDeliveryWorkerService(prisma as any);
    const service = new ProtocolService(
      prisma,
      worker as any,
      createDeliveryRunnerStub() as any,
      queue,
      createIntentsServiceStub() as any,
      createInboxServiceStub() as any,
      createChatsServiceStub() as any,
      createConnectionsServiceStub() as any,
      createRecurringCirclesServiceStub() as any,
      createNotificationsServiceStub() as any,
    );
    const registration = await service.registerApp(createRegistrationPayload());

    for (const deliveryId of [
      "00000000-0000-4000-8000-000000000451",
      "00000000-0000-4000-8000-000000000452",
    ]) {
      await prisma.$executeRawUnsafe(
        `INSERT INTO protocol_webhook_deliveries
         (delivery_id, subscription_id, app_id, event_cursor, event_name, status, attempt_count, next_attempt_at, last_attempt_at, delivered_at, response_status_code, error_message, signature, payload, metadata, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8::timestamptz, $9::timestamptz, $10::timestamptz, $11, $12, $13, $14::jsonb, $15::jsonb, $16::timestamptz, $17::timestamptz)`,
        deliveryId,
        "subscription-1",
        "partner.alpha",
        7,
        "webhook.failed",
        "dead_lettered",
        5,
        null,
        "2026-04-13T00:00:00.000Z",
        null,
        503,
        "temporarily unavailable",
        null,
        JSON.stringify({ eventName: "webhook.failed" }),
        JSON.stringify({ source: "test" }),
        "2026-04-13T00:00:00.000Z",
        "2026-04-13T00:00:00.000Z",
      );
    }

    const replayed = await service.replayDeadLetteredDeliveries(
      "partner.alpha",
      registration.credentials.appToken,
      { limit: 10 },
    );

    expect(replayed.replayedCount).toBe(2);
    expect(replayed.deliveryIds).toHaveLength(2);
  });

  it("dispatches due deliveries onto the protocol queue", async () => {
    const queue = {
      add: async (_name: string, payload: Record<string, unknown>) => payload,
    };
    const service = new ProtocolService(
      createPrismaStub() as any,
      createDeliveryWorkerStub() as any,
      createDeliveryRunnerStub() as any,
      queue as any,
      createIntentsServiceStub() as any,
      createInboxServiceStub() as any,
      createChatsServiceStub() as any,
      createConnectionsServiceStub() as any,
      createRecurringCirclesServiceStub() as any,
      createNotificationsServiceStub() as any,
    );
    const registration = await service.registerApp(createRegistrationPayload());

    const result = await service.dispatchDueWebhookDeliveries(
      "partner.alpha",
      registration.credentials.appToken,
      { limit: 7 },
    );

    expect(result.queueName).toBe("protocol-webhooks");
    expect(result.jobName).toBe("RunProtocolWebhookDeliveries");
    expect(result.limit).toBe(7);
  });

  it("dispatches due deliveries globally onto the protocol queue", async () => {
    const queue = {
      add: async (_name: string, payload: Record<string, unknown>) => payload,
    };
    const service = new ProtocolService(
      createPrismaStub() as any,
      createDeliveryWorkerStub() as any,
      createDeliveryRunnerStub() as any,
      queue as any,
      createIntentsServiceStub() as any,
      createInboxServiceStub() as any,
      createChatsServiceStub() as any,
      createConnectionsServiceStub() as any,
      createRecurringCirclesServiceStub() as any,
      createNotificationsServiceStub() as any,
    );

    const result = await service.dispatchGlobalDueWebhookDeliveries({
      limit: 11,
      source: "manual",
    });

    expect(result.queueName).toBe("protocol-webhooks");
    expect(result.jobName).toBe("RunProtocolWebhookDeliveries");
    expect(result.limit).toBe(11);
    expect(result.source).toBe("manual");
  });

  it("returns a protocol usage summary for an app", async () => {
    const service = createProtocolService();
    const registration = await service.registerApp(createRegistrationPayload());
    await service.createAppGrant(
      "partner.alpha",
      registration.credentials.appToken,
      {
        scope: "actions.invoke",
        capabilities: ["chat.write"],
        subjectType: "user",
        subjectId: "00000000-0000-4000-8000-000000000001",
        metadata: { source: "test" },
      },
    );

    const summary = await service.getAppUsageSummary(
      "partner.alpha",
      registration.credentials.appToken,
    );

    expect(summary.appId).toBe("partner.alpha");
    expect(summary.grantCounts.active).toBe(1);
    expect(summary.queueHealth.replayableCount).toBe(0);
    expect(summary.tokenAudit.appUpdatedAt).not.toBe("");
    expect(summary.tokenAudit.currentTokenIssuedAt).not.toBe("");
    expect(summary.tokenAudit.recommendedRotateBy).not.toBe("");
    expect(summary.tokenAudit.rotationWindowDays).toBeGreaterThan(0);
    expect(summary.tokenAudit.tokenAgeDays).toBeGreaterThanOrEqual(0);
    expect(summary.tokenAudit.freshness).toBe("current");
    expect(summary.grantAudit.lastGrantedAt).not.toBeNull();
    expect(summary.latestCursor).not.toBe("");
  });

  it("marks protocol tokens as stale after the rotation window", async () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    vi.useFakeTimers();
    vi.setSystemTime(now);

    try {
      const service = createProtocolService();
      const registration = await service.registerApp(
        createRegistrationPayload(),
      );

      vi.setSystemTime(new Date(now.getTime() + 95 * 24 * 60 * 60 * 1000));

      const summary = await service.getAppUsageSummary(
        "partner.alpha",
        registration.credentials.appToken,
      );

      expect(summary.tokenAudit.rotationWindowDays).toBe(90);
      expect(summary.tokenAudit.tokenAgeDays).toBe(95);
      expect(summary.tokenAudit.freshness).toBe("stale");
    } finally {
      vi.useRealTimers();
    }
  });

  it("creates, approves, and rejects consent requests independently of grants", async () => {
    const service = createProtocolService();
    const registration = await service.registerApp(createRegistrationPayload());

    const created = await service.createAppConsentRequest(
      "partner.alpha",
      registration.credentials.appToken,
      {
        scope: "actions.invoke",
        capabilities: ["chat.write"],
        subjectType: "user",
        subjectId: "00000000-0000-4000-8000-000000000001",
        requestedByUserId: "00000000-0000-4000-8000-000000000009",
        metadata: { source: "test" },
      },
    );

    expect(created.status).toBe("pending");
    expect(created.requestedByUserId).toBe(
      "00000000-0000-4000-8000-000000000009",
    );

    const summaryBeforeApproval = await service.getAppUsageSummary(
      "partner.alpha",
      registration.credentials.appToken,
    );
    expect(summaryBeforeApproval.consentRequestCounts.pending).toBe(1);

    const approved = await service.approveAppConsentRequest(
      "partner.alpha",
      created.requestId,
      registration.credentials.appToken,
      {
        approvedByUserId: "00000000-0000-4000-8000-000000000010",
        metadata: { source: "approval" },
      },
    );

    expect(approved.status).toBe("approved");
    expect(approved.approvedGrantId).not.toBeNull();
    expect(approved.approvedByUserId).toBe(
      "00000000-0000-4000-8000-000000000010",
    );

    const rejectedRequest = await service.createAppConsentRequest(
      "partner.alpha",
      registration.credentials.appToken,
      {
        scope: "actions.invoke",
        capabilities: ["notification.read"],
        subjectType: "user",
        subjectId: "00000000-0000-4000-8000-000000000011",
        requestedByUserId: "00000000-0000-4000-8000-000000000012",
        metadata: {},
      },
    );

    const rejected = await service.rejectAppConsentRequest(
      "partner.alpha",
      rejectedRequest.requestId,
      registration.credentials.appToken,
      {
        rejectedByUserId: "00000000-0000-4000-8000-000000000013",
        metadata: { source: "rejection" },
      },
    );

    expect(rejected.status).toBe("rejected");
    expect(rejected.rejectedByUserId).toBe(
      "00000000-0000-4000-8000-000000000013",
    );

    const summaryAfterDecision = await service.getAppUsageSummary(
      "partner.alpha",
      registration.credentials.appToken,
    );
    expect(summaryAfterDecision.consentRequestCounts.approved).toBe(1);
    expect(summaryAfterDecision.consentRequestCounts.rejected).toBe(1);
  });

  it("includes runtime queue state in delivery queue inspection", async () => {
    const service = createProtocolService();
    const registration = await service.registerApp(createRegistrationPayload());
    const queue = await service.inspectDeliveryQueue(
      "partner.alpha",
      registration.credentials.appToken,
    );

    expect(queue.queueState?.waiting).toBe(2);
    expect(queue.queueState?.failed).toBe(5);
  });

  it("supports first-party protocol action wrappers", async () => {
    const service = createProtocolService();

    const createdIntent = await service.createFirstPartyIntentAction({
      actorUserId: "00000000-0000-4000-8000-000000000001",
      rawText: "Find dinner this week",
      metadata: {},
    });
    const sentRequest = await service.sendFirstPartyRequestAction({
      actorUserId: "00000000-0000-4000-8000-000000000001",
      intentId: "00000000-0000-4000-8000-000000000101",
      recipientUserId: "00000000-0000-4000-8000-000000000002",
      metadata: {},
    });
    const createdCircle = await service.createFirstPartyCircleAction({
      actorUserId: "00000000-0000-4000-8000-000000000001",
      title: "Weekly design circle",
      visibility: "private",
      topicTags: ["design"],
      targetSize: 4,
      cadence: {
        kind: "weekly",
        days: ["wed"],
        hour: 19,
        minute: 0,
        timezone: "America/Argentina/Buenos_Aires",
        intervalWeeks: 1,
      },
      metadata: {},
    });
    const joinedCircle = await service.joinFirstPartyCircleAction(
      "00000000-0000-4000-8000-000000000105",
      {
        actorUserId: "00000000-0000-4000-8000-000000000001",
        memberUserId: "00000000-0000-4000-8000-000000000002",
        role: "member",
        metadata: {},
      },
    );

    expect(createdIntent.action).toBe("intent.create");
    expect(sentRequest.action).toBe("request.send");
    expect(createdCircle.action).toBe("circle.create");
    expect(joinedCircle.action).toBe("circle.join");
  });
});
