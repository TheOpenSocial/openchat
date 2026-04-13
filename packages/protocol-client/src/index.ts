import {
  manifestSchema,
  type ProtocolManifest,
} from "@opensocial/protocol-types";

export type ProtocolClientTransport = {
  request: (path: string, init?: RequestInit) => Promise<Response>;
};

export type ProtocolClient = {
  getManifest: () => Promise<ProtocolManifest>;
};

export function createProtocolClient(
  transport: ProtocolClientTransport,
): ProtocolClient {
  return {
    async getManifest() {
      const response = await transport.request("/protocol/manifest");
      const payload = (await response.json()) as { data?: unknown } | undefined;
      const manifest = payload?.data ?? payload;
      return manifestSchema.parse(manifest);
    },
  };
}
