import { describe, expect, it } from "vitest";
import { ProtocolService } from "../src/protocol/protocol.service.js";

describe("ProtocolService", () => {
  function createRegistrationPayload() {
    return {
      registration: {
        protocolId: "opensocial.app-registration.v1",
        appId: "partner.alpha",
        name: "Partner Alpha",
        kind: "server",
        status: "draft",
        redirectUris: ["https://alpha.example.com/oauth/callback"],
        webhookUrl: "https://alpha.example.com/hooks/opensocial",
        capabilities: {
          scopes: ["protocol.read", "webhooks.manage", "events.subscribe"],
          resources: ["app_registration", "webhook_subscription", "manifest"],
          actions: ["app.read", "webhook.subscribe", "event.replay"],
          events: ["app.registered", "webhook.delivered"],
          capabilities: [
            "app.read",
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
        capabilities: {
          scopes: ["protocol.read", "webhooks.manage", "events.subscribe"],
          resources: ["app_registration", "webhook_subscription", "manifest"],
          actions: ["app.read", "webhook.subscribe", "event.replay"],
          events: ["app.registered", "webhook.delivered"],
          capabilities: [
            "app.read",
            "webhook.read",
            "webhook.write",
            "event.read",
          ],
          canActAsAgent: false,
          canManageWebhooks: true,
        },
        resources: ["app_registration", "webhook_subscription", "manifest"],
        actions: ["app.read", "webhook.subscribe", "event.replay"],
        events: ["app.registered", "webhook.delivered"],
        webhooks: [],
        agent: {
          enabled: false,
          modes: [],
          requiresHumanApproval: true,
        },
        metadata: {},
      },
      requestedScopes: ["protocol.read", "webhooks.manage", "events.subscribe"],
      requestedCapabilities: [
        "app.read",
        "webhook.read",
        "webhook.write",
        "event.read",
      ],
    } as const;
  }

  it("registers an app and issues a token", () => {
    const service = new ProtocolService();

    const result = service.registerApp(createRegistrationPayload());

    expect(result.registration.appId).toBe("partner.alpha");
    expect(result.credentials.appToken.length).toBeGreaterThan(20);
    expect(result.issuedScopes).toContain("webhooks.manage");
    expect(result.issuedCapabilities).toContain("webhook.write");
  });

  it("creates and lists webhook subscriptions for a registered app", () => {
    const service = new ProtocolService();
    const registration = service.registerApp(createRegistrationPayload());

    const subscription = service.createWebhook(
      "partner.alpha",
      registration.credentials.appToken,
      {
        targetUrl: "https://alpha.example.com/hooks/opensocial",
        events: ["app.registered", "webhook.delivered"],
        resources: ["app_registration", "webhook_subscription"],
        deliveryMode: "json",
        retryPolicy: {
          maxAttempts: 5,
          backoffMs: 1000,
          maxBackoffMs: 10000,
        },
        metadata: {
          tenant: "alpha",
        },
      },
    );

    const subscriptions = service.listWebhooks(
      "partner.alpha",
      registration.credentials.appToken,
    );
    const events = service.replayEvents(
      "partner.alpha",
      registration.credentials.appToken,
    );

    expect(subscription.appId).toBe("partner.alpha");
    expect(subscriptions).toHaveLength(1);
    expect(events.some((entry) => entry.event === "app.registered")).toBe(true);
    expect(
      events.some(
        (entry) =>
          entry.event === "webhook.delivered" &&
          (entry.payload as { subscriptionId?: string }).subscriptionId ===
            subscription.subscriptionId,
      ),
    ).toBe(true);
  });
});
