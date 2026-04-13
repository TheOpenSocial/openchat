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
      listWebhooks: () => [],
      createWebhook: (_appId: string, token: string, payload: unknown) => ({
        token,
        payload,
      }),
      replayEvents: () => [],
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
      listWebhooks: () => [],
      createWebhook: (_appId: string, token: string, payload: Record<string, unknown>) => ({
        token,
        payload,
      }),
      replayEvents: () => [],
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
});
