import {
  protocolWebhookDeliverySchema,
  type ProtocolWebhookDelivery,
} from "@opensocial/protocol-events";
import {
  appRegistrationRequestSchema,
  protocolAppRegistrationResultSchema,
  protocolDiscoveryDocumentSchema,
  protocolEventEnvelopeSchema,
  protocolReplayCursorSchema,
  manifestSchema,
  webhookSubscriptionCreateSchema,
  webhookSubscriptionSchema,
  type AppRegistration,
  type AppRegistrationRequest,
  type CapabilityName,
  type ProtocolAppRegistrationResult,
  type ProtocolDiscoveryDocument,
  type ProtocolEventEnvelope,
  type ProtocolManifest,
  type ProtocolReplayCursor,
  type ProtocolScopeName,
  type WebhookSubscription,
  type WebhookSubscriptionCreate,
} from "@opensocial/protocol-types";

export type ProtocolClientTransport = {
  request: (path: string, init?: RequestInit) => Promise<Response>;
};

export type ProtocolClient = {
  getManifest: () => Promise<ProtocolManifest>;
  getDiscovery: () => Promise<ProtocolDiscoveryDocument>;
  registerApp: (
    input: ProtocolAppRegistrationRequestInput,
  ) => Promise<ProtocolAppRegistrationResult>;
  listWebhooks: (
    appId: string,
    appToken: string,
  ) => Promise<WebhookSubscription[]>;
  createWebhook: (
    appId: string,
    appToken: string,
    payload: WebhookSubscriptionCreate,
  ) => Promise<WebhookSubscription>;
  listWebhookDeliveries: (
    appId: string,
    appToken: string,
    subscriptionId: string,
  ) => Promise<ProtocolWebhookDelivery[]>;
  replayEvents: (
    appId: string,
    appToken: string,
    cursor?: string,
  ) => Promise<ProtocolEventEnvelope[]>;
  getReplayCursor: (
    appId: string,
    appToken: string,
  ) => Promise<ProtocolReplayCursor>;
  saveReplayCursor: (
    appId: string,
    appToken: string,
    cursor: string,
  ) => Promise<ProtocolReplayCursor>;
  buildAppRegistrationRequest: (
    input: ProtocolAppRegistrationRequestInput,
  ) => AppRegistrationRequest;
};

export type ProtocolAppRegistrationRequestInput = {
  registration: AppRegistration;
  manifest: ProtocolManifest;
  requestedScopes?: ProtocolScopeName[];
  requestedCapabilities?: CapabilityName[];
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
    async getDiscovery() {
      const response = await transport.request("/protocol/discovery");
      const payload = (await response.json()) as { data?: unknown } | undefined;
      return protocolDiscoveryDocumentSchema.parse(payload?.data ?? payload);
    },
    async registerApp(input) {
      const requestPayload = buildProtocolAppRegistrationRequest(input);
      const response = await transport.request("/protocol/apps/register", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(requestPayload),
      });
      const payload = (await response.json()) as { data?: unknown } | undefined;
      return protocolAppRegistrationResultSchema.parse(payload?.data ?? payload);
    },
    async listWebhooks(appId, appToken) {
      const response = await transport.request(`/protocol/apps/${appId}/webhooks`, {
        headers: {
          "x-protocol-app-token": appToken,
        },
      });
      const payload = (await response.json()) as { data?: unknown } | undefined;
      return webhookSubscriptionSchema.array().parse(payload?.data ?? payload);
    },
    async createWebhook(appId, appToken, payload) {
      const requestPayload = webhookSubscriptionCreateSchema.parse(payload);
      const response = await transport.request(`/protocol/apps/${appId}/webhooks`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-protocol-app-token": appToken,
        },
        body: JSON.stringify(requestPayload),
      });
      const envelope = (await response.json()) as { data?: unknown } | undefined;
      return webhookSubscriptionSchema.parse(envelope?.data ?? envelope);
    },
    async listWebhookDeliveries(appId, appToken, subscriptionId) {
      const response = await transport.request(
        `/protocol/apps/${appId}/webhooks/${subscriptionId}/deliveries`,
        {
          headers: {
            "x-protocol-app-token": appToken,
          },
        },
      );
      const payload = (await response.json()) as { data?: unknown } | undefined;
      return protocolWebhookDeliverySchema.array().parse(payload?.data ?? payload);
    },
    async replayEvents(appId, appToken, cursor) {
      const search = cursor
        ? `?cursor=${encodeURIComponent(cursor)}`
        : "";
      const response = await transport.request(
        `/protocol/apps/${appId}/events/replay${search}`,
        {
          headers: {
            "x-protocol-app-token": appToken,
          },
        },
      );
      const payload = (await response.json()) as { data?: unknown } | undefined;
      return protocolEventEnvelopeSchema
        .array()
        .parse(payload?.data ?? payload);
    },
    async getReplayCursor(appId, appToken) {
      const response = await transport.request(
        `/protocol/apps/${appId}/events/cursor`,
        {
          headers: {
            "x-protocol-app-token": appToken,
          },
        },
      );
      const payload = (await response.json()) as { data?: unknown } | undefined;
      return protocolReplayCursorSchema.parse(payload?.data ?? payload);
    },
    async saveReplayCursor(appId, appToken, cursor) {
      const response = await transport.request(
        `/protocol/apps/${appId}/events/cursor`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-protocol-app-token": appToken,
          },
          body: JSON.stringify({ cursor }),
        },
      );
      const payload = (await response.json()) as { data?: unknown } | undefined;
      return protocolReplayCursorSchema.parse(payload?.data ?? payload);
    },
    buildAppRegistrationRequest(input) {
      return buildProtocolAppRegistrationRequest(input);
    },
  };
}

export function buildProtocolAppRegistrationRequest(
  input: ProtocolAppRegistrationRequestInput,
): AppRegistrationRequest {
  return appRegistrationRequestSchema.parse({
    registration: input.registration,
    manifest: input.manifest,
    requestedScopes: input.requestedScopes ?? [],
    requestedCapabilities: input.requestedCapabilities ?? [],
  });
}
