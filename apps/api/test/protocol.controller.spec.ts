import { describe, expect, it } from "vitest";
import { ProtocolController } from "../src/protocol/protocol.controller.js";

describe("ProtocolController", () => {
  it("returns the protocol manifest envelope", async () => {
    const controller = new ProtocolController({
      getManifest: () => ({
        protocolId: "opensocial.manifest.v1",
        appId: "opensocial-api",
        manifestId: "opensocial-protocol-manifest",
      }),
      getDiscovery: () => ({
        manifest: {
          protocolId: "opensocial.manifest.v1",
          appId: "opensocial-api",
        },
        events: [],
      }),
      listEvents: () => [],
      listApps: () => [],
      registerApp: (payload: unknown) => payload,
      getApp: () => ({ appId: "alpha" }),
      listAppGrants: () => [],
      createAppGrant: () => ({}),
      revokeAppGrant: () => ({}),
      rotateAppToken: (_appId: string, token: string) => ({ token }),
      revokeAppToken: (_appId: string, token: string) => ({
        token,
        revoked: true,
      }),
      listWebhooks: () => [],
      listWebhookDeliveries: () => [],
      inspectDeliveryQueue: () => ({
        appId: "alpha.app",
        generatedAt: "2026-04-13T00:00:00.000Z",
        queuedCount: 0,
        inFlightCount: 0,
        failedCount: 0,
        deadLetteredCount: 0,
        deliveries: [],
      }),
      createWebhook: (_appId: string, token: string, payload: unknown) => ({
        token,
        payload,
      }),
      replayEvents: () => [],
      getReplayCursor: () => ({
        appId: "alpha.app",
        cursor: "0",
        updatedAt: "2026-04-13T00:00:00.000Z",
      }),
      saveReplayCursor: (_appId: string, _token: string, cursor: string) => ({
        appId: "alpha.app",
        cursor,
        updatedAt: "2026-04-13T00:00:00.000Z",
      }),
    } as any);

    const response = (await controller.getManifest()) as any;

    expect(response.success).toBe(true);
    expect(response.data.protocolId).toBe("opensocial.manifest.v1");
    expect(response.data.appId).toBe("opensocial-api");
  });

  it("reads the protocol app token header for webhook creation", async () => {
    const controller = new ProtocolController({
      getManifest: () => ({}),
      getDiscovery: () => ({}),
      listEvents: () => [],
      listApps: () => [],
      registerApp: () => ({}),
      getApp: () => ({}),
      listAppGrants: () => [],
      createAppGrant: () => ({}),
      revokeAppGrant: () => ({}),
      rotateAppToken: (_appId: string, token: string) => ({ token }),
      revokeAppToken: (_appId: string, token: string) => ({
        token,
        revoked: true,
      }),
      listWebhooks: () => [],
      listWebhookDeliveries: () => [],
      inspectDeliveryQueue: () => ({
        appId: "alpha.app",
        generatedAt: "2026-04-13T00:00:00.000Z",
        queuedCount: 0,
        inFlightCount: 0,
        failedCount: 0,
        deadLetteredCount: 0,
        deliveries: [],
      }),
      createWebhook: (
        _appId: string,
        token: string,
        payload: Record<string, unknown>,
      ) => ({
        token,
        payload,
      }),
      replayEvents: () => [],
      getReplayCursor: () => ({
        appId: "alpha.app",
        cursor: "0",
        updatedAt: "2026-04-13T00:00:00.000Z",
      }),
      saveReplayCursor: (_appId: string, _token: string, cursor: string) => ({
        appId: "alpha.app",
        cursor,
        updatedAt: "2026-04-13T00:00:00.000Z",
      }),
    } as any);

    const response = (await controller.createWebhook(
      "alpha.app",
      {
        "x-protocol-app-token": "secret-token",
      },
      {
        targetUrl: "https://example.com/hooks/opensocial",
        events: ["app.registered"],
      },
    )) as any;

    expect(response.success).toBe(true);
    expect(response.data.token).toBe("secret-token");
    expect(response.data.payload.targetUrl).toContain("example.com");
  });

  it("routes delivery and cursor endpoints through the app token", async () => {
    const controller = new ProtocolController({
      getManifest: () => ({}),
      getDiscovery: () => ({}),
      listEvents: () => [],
      listApps: () => [],
      registerApp: () => ({}),
      getApp: () => ({}),
      listAppGrants: (_appId: string, token: string) => ({ token }),
      createAppGrant: (
        _appId: string,
        token: string,
        payload: Record<string, unknown>,
      ) => ({
        token,
        payload,
      }),
      revokeAppGrant: (
        _appId: string,
        grantId: string,
        token: string,
        payload: Record<string, unknown>,
      ) => ({
        token,
        grantId,
        payload,
      }),
      rotateAppToken: (_appId: string, token: string) => ({ token }),
      revokeAppToken: (_appId: string, token: string) => ({
        token,
        revoked: true,
      }),
      listWebhooks: () => [],
      listWebhookDeliveries: (
        _appId: string,
        token: string,
        subscriptionId: string,
      ) => ({
        token,
        subscriptionId,
      }),
      inspectDeliveryQueue: (
        _appId: string,
        token: string,
        cursor?: string,
      ) => ({
        token,
        cursor,
      }),
      createWebhook: () => ({}),
      replayEvents: (_appId: string, token: string, cursor?: string) => ({
        token,
        cursor,
      }),
      getReplayCursor: (_appId: string, token: string) => ({
        appId: "alpha.app",
        token,
        cursor: "0",
        updatedAt: "2026-04-13T00:00:00.000Z",
      }),
      saveReplayCursor: (_appId: string, token: string, cursor: string) => ({
        appId: "alpha.app",
        token,
        cursor,
        updatedAt: "2026-04-13T00:00:00.000Z",
      }),
    } as any);

    const deliveries = (await controller.listWebhookDeliveries(
      "alpha.app",
      "subscription-1",
      {
        "x-protocol-app-token": "secret-token",
      },
    )) as any;
    const replay = (await controller.replayEvents(
      "alpha.app",
      {
        "x-protocol-app-token": "secret-token",
      },
      "12",
    )) as any;
    const grants = (await controller.listAppGrants("alpha.app", {
      "x-protocol-app-token": "secret-token",
    })) as any;
    const createdGrant = (await controller.createAppGrant(
      "alpha.app",
      {
        "x-protocol-app-token": "secret-token",
      },
      {
        scope: "resources.read",
        capabilities: ["app.read"],
        subjectType: "user",
        subjectId: "00000000-0000-4000-8000-000000000001",
      },
    )) as any;
    const revokedGrant = (await controller.revokeAppGrant(
      "alpha.app",
      "grant-1",
      {
        "x-protocol-app-token": "secret-token",
      },
      {
        metadata: { reason: "done" },
      },
    )) as any;
    const queue = (await controller.inspectDeliveryQueue(
      "alpha.app",
      {
        "x-protocol-app-token": "secret-token",
      },
      "7",
    )) as any;
    const currentCursor = (await controller.getReplayCursor("alpha.app", {
      "x-protocol-app-token": "secret-token",
    })) as any;
    const savedCursor = (await controller.saveReplayCursor(
      "alpha.app",
      {
        "x-protocol-app-token": "secret-token",
      },
      {
        cursor: "44",
      },
    )) as any;

    expect(deliveries.data.token).toBe("secret-token");
    expect(deliveries.data.subscriptionId).toBe("subscription-1");
    expect(grants.data.token).toBe("secret-token");
    expect(createdGrant.data.token).toBe("secret-token");
    expect(createdGrant.data.payload.scope).toBe("resources.read");
    expect(revokedGrant.data.grantId).toBe("grant-1");
    expect(queue.data.token).toBe("secret-token");
    expect(queue.data.cursor).toBe("7");
    expect(replay.data.cursor).toBe("12");
    expect(currentCursor.data.cursor).toBe("0");
    expect(savedCursor.data.cursor).toBe("44");
  });

  it("routes app token rotate and revoke through the app token header", async () => {
    const controller = new ProtocolController({
      getManifest: () => ({}),
      getDiscovery: () => ({}),
      listEvents: () => [],
      listApps: () => [],
      registerApp: () => ({}),
      getApp: () => ({}),
      listAppGrants: () => [],
      createAppGrant: () => ({}),
      revokeAppGrant: () => ({}),
      rotateAppToken: (_appId: string, token: string) => ({
        token,
        rotated: true,
      }),
      revokeAppToken: (_appId: string, token: string) => ({
        token,
        revoked: true,
      }),
      listWebhooks: () => [],
      listWebhookDeliveries: () => [],
      inspectDeliveryQueue: () => ({
        appId: "alpha.app",
        generatedAt: "2026-04-13T00:00:00.000Z",
        queuedCount: 0,
        inFlightCount: 0,
        failedCount: 0,
        deadLetteredCount: 0,
        deliveries: [],
      }),
      createWebhook: () => ({}),
      replayEvents: () => [],
      getReplayCursor: () => ({
        appId: "alpha.app",
        cursor: "0",
        updatedAt: "2026-04-13T00:00:00.000Z",
      }),
      saveReplayCursor: (_appId: string, _token: string, cursor: string) => ({
        appId: "alpha.app",
        cursor,
        updatedAt: "2026-04-13T00:00:00.000Z",
      }),
    } as any);

    const rotated = (await controller.rotateAppToken("alpha.app", {
      "x-protocol-app-token": "secret-token",
    })) as any;
    const revoked = (await controller.revokeAppToken("alpha.app", {
      "x-protocol-app-token": "secret-token",
    })) as any;

    expect(rotated.success).toBe(true);
    expect(rotated.data.token).toBe("secret-token");
    expect(rotated.data.rotated).toBe(true);
    expect(revoked.success).toBe(true);
    expect(revoked.data.token).toBe("secret-token");
    expect(revoked.data.revoked).toBe(true);
  });
});
