import { describe, expect, it } from "vitest";
import type { AppRegistrationRequest } from "@opensocial/protocol-types";
import { ProtocolService } from "../src/protocol/protocol.service.js";

function createPrismaStub() {
  const apps = new Map<string, any>();
  const subscriptions = new Map<string, any[]>();
  const deliveries = new Map<string, any[]>();
  const events: any[] = [];
  const cursors = new Map<string, any>();
  let cursorSeq = 0n;

  return {
    async $queryRawUnsafe<T = unknown>(query: string, ...params: any[]) {
      if (query.includes("FROM protocol_apps") && query.includes("WHERE app_id =")) {
        const row = apps.get(params[0]);
        return (row ? [row] : []) as T;
      }
      if (query.includes("FROM protocol_apps")) {
        return [...apps.values()] as T;
      }
      if (query.includes("FROM protocol_webhook_subscriptions") && query.includes("status = 'active'")) {
        const [appId, eventName] = params;
        return (subscriptions.get(appId) ?? []).filter(
          (row) => row.status === "active" && (row.event_names ?? []).includes(eventName),
        ) as T;
      }
      if (query.includes("FROM protocol_webhook_subscriptions")) {
        const [appId] = params;
        return (subscriptions.get(appId) ?? []) as T;
      }
      if (query.includes("FROM protocol_webhook_deliveries")) {
        const [appId, subscriptionId] = params;
        return (deliveries.get(appId) ?? []).filter(
          (row) => row.subscription_id === subscriptionId,
        ) as T;
      }
      if (query.includes("FROM protocol_event_log")) {
        const [appId, sinceCursor] = params;
        return events.filter(
          (row) =>
            (row.actor_app_id === appId || row.actor_app_id == null) &&
            BigInt(row.cursor) > BigInt(sinceCursor),
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
        });
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
        subscriptions.set(row.app_id, [...(subscriptions.get(row.app_id) ?? []), row]);
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
        deliveries.set(row.app_id, [...(deliveries.get(row.app_id) ?? []), row]);
        return 1;
      }
      return 0;
    },
  };
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
        scopes: ["protocol.read", "webhooks.manage", "events.subscribe"],
        resources: ["app_registration", "webhook_subscription", "manifest"],
        actions: ["app.read", "webhook.subscribe", "event.replay"],
        events: ["app.registered", "webhook.delivered", "app.updated"],
        capabilities: ["app.read", "webhook.read", "webhook.write", "event.read"],
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
        scopes: ["protocol.read", "webhooks.manage", "events.subscribe"],
        resources: ["app_registration", "webhook_subscription", "manifest"],
        actions: ["app.read", "webhook.subscribe", "event.replay"],
        events: ["app.registered", "webhook.delivered", "app.updated"],
        capabilities: ["app.read", "webhook.read", "webhook.write", "event.read"],
        canActAsAgent: false,
        canManageWebhooks: true,
      },
      resources: ["app_registration", "webhook_subscription", "manifest"],
      actions: ["app.read", "webhook.subscribe", "event.replay"],
      events: ["app.registered", "webhook.delivered", "app.updated"],
      webhooks: [],
      agent: {
        enabled: false,
        modes: [],
        requiresHumanApproval: true,
      },
      metadata: {},
    },
    requestedScopes: ["protocol.read", "webhooks.manage", "events.subscribe"],
    requestedCapabilities: ["app.read", "webhook.read", "webhook.write", "event.read"],
  };
}

describe("ProtocolService", () => {
  it("registers an app and issues a token", async () => {
    const service = new ProtocolService(createPrismaStub() as any);

    const result = await service.registerApp(createRegistrationPayload());

    expect(result.registration.appId).toBe("partner.alpha");
    expect(result.credentials.appToken.length).toBeGreaterThan(20);
    expect(result.issuedScopes).toContain("webhooks.manage");
    expect(result.issuedCapabilities).toContain("webhook.write");
  });

  it("creates subscriptions, deliveries, and replay events", async () => {
    const service = new ProtocolService(createPrismaStub() as any);
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
    const service = new ProtocolService(createPrismaStub() as any);
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
});
