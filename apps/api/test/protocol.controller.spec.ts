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
    } as any);

    const response = (await controller.getManifest()) as any;

    expect(response.success).toBe(true);
    expect(response.data.protocolId).toBe("opensocial.manifest.v1");
    expect(response.data.appId).toBe("opensocial-api");
  });
});
