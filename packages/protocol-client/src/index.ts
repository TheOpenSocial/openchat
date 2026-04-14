import {
  protocolWebhookDeliverySchema,
  type ProtocolWebhookDelivery,
} from "@opensocial/protocol-events";
import {
  appRegistrationRequestSchema,
  protocolAppUsageSummarySchema,
  protocolChatMessageActionResultSchema,
  protocolChatSendMessageActionSchema,
  protocolAppScopeGrantCreateSchema,
  protocolAppScopeGrantRevokeSchema,
  protocolAppScopeGrantSchema,
  protocolAppRegistrationResultSchema,
  protocolDiscoveryDocumentSchema,
  protocolIntentActionResultSchema,
  protocolIntentCreateActionSchema,
  protocolIntentRequestSendActionSchema,
  protocolRequestActionResultSchema,
  protocolRequestDecisionActionSchema,
  protocolEventEnvelopeSchema,
  protocolReplayCursorSchema,
  protocolWebhookDeliveryDispatchResultSchema,
  protocolWebhookDeliveryAttemptSchema,
  protocolWebhookDeliveryReplayResultSchema,
  protocolWebhookDeliveryRunRequestSchema,
  protocolWebhookDeliveryRunResultSchema,
  manifestSchema,
  webhookSubscriptionCreateSchema,
  webhookSubscriptionSchema,
  type AppRegistration,
  type AppRegistrationRequest,
  type CapabilityName,
  type ProtocolAppScopeGrant,
  type ProtocolAppScopeGrantCreate,
  type ProtocolAppScopeGrantRevoke,
  type ProtocolAppRegistrationResult,
  type ProtocolAppUsageSummary,
  type ProtocolChatMessageActionResult,
  type ProtocolChatSendMessageAction,
  type ProtocolDiscoveryDocument,
  type ProtocolEventEnvelope,
  type ProtocolIntentActionResult,
  type ProtocolIntentCreateAction,
  type ProtocolIntentRequestSendAction,
  type ProtocolManifest,
  type ProtocolRequestActionResult,
  type ProtocolRequestDecisionAction,
  type ProtocolReplayCursor,
  type ProtocolScopeName,
  type ProtocolWebhookDeliveryDispatchResult,
  type ProtocolWebhookDeliveryAttempt,
  type ProtocolWebhookDeliveryReplayResult,
  type ProtocolWebhookDeliveryRunRequest,
  type ProtocolWebhookDeliveryRunResult,
  type WebhookSubscription,
  type WebhookSubscriptionCreate,
} from "@opensocial/protocol-types";

export type ProtocolClientTransport = {
  request: (path: string, init?: RequestInit) => Promise<Response>;
};

export type ProtocolClient = {
  getManifest: () => Promise<ProtocolManifest>;
  getDiscovery: () => Promise<ProtocolDiscoveryDocument>;
  listApps: () => Promise<ProtocolAppRecord[]>;
  getApp: (appId: string) => Promise<ProtocolAppRecord>;
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
  listGrants: (
    appId: string,
    appToken: string,
  ) => Promise<ProtocolGrantRecord[]>;
  createGrant: (
    appId: string,
    appToken: string,
    payload: ProtocolGrantCreateInput,
  ) => Promise<ProtocolGrantRecord>;
  revokeGrant: (
    appId: string,
    appToken: string,
    grantId: string,
    input?: ProtocolGrantRevokeInput,
  ) => Promise<ProtocolGrantRecord>;
  rotateAppToken: (
    appId: string,
    appToken: string,
    input?: ProtocolAppTokenRotateInput,
  ) => Promise<ProtocolAppTokenRotateResult>;
  rotateToken: (
    appId: string,
    appToken: string,
    input?: ProtocolAppTokenRotateInput,
  ) => Promise<ProtocolAppTokenRotateResult>;
  revokeAppToken: (
    appId: string,
    appToken: string,
    input?: ProtocolAppTokenRevokeInput,
  ) => Promise<ProtocolAppTokenRevokeResult>;
  revokeToken: (
    appId: string,
    appToken: string,
    input?: ProtocolAppTokenRevokeInput,
  ) => Promise<ProtocolAppTokenRevokeResult>;
  listWebhookDeliveries: (
    appId: string,
    appToken: string,
    subscriptionId: string,
  ) => Promise<ProtocolWebhookDelivery[]>;
  listWebhookDeliveryAttempts: (
    appId: string,
    appToken: string,
    deliveryId: string,
  ) => Promise<ProtocolWebhookDeliveryAttempt[]>;
  replayWebhookDelivery: (
    appId: string,
    appToken: string,
    deliveryId: string,
  ) => Promise<ProtocolWebhookDeliveryReplayResult>;
  inspectDeliveryQueue: (
    appId: string,
    appToken: string,
    cursor?: string,
  ) => Promise<ProtocolDeliveryQueueInspection>;
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
  createIntent: (
    appId: string,
    appToken: string,
    payload: ProtocolIntentCreateInput,
  ) => Promise<ProtocolIntentActionResult>;
  sendRequest: (
    appId: string,
    appToken: string,
    payload: ProtocolRequestSendInput,
  ) => Promise<ProtocolRequestActionResult>;
  acceptRequest: (
    appId: string,
    appToken: string,
    requestId: string,
    payload: ProtocolRequestDecisionInput,
  ) => Promise<ProtocolRequestActionResult>;
  rejectRequest: (
    appId: string,
    appToken: string,
    requestId: string,
    payload: ProtocolRequestDecisionInput,
  ) => Promise<ProtocolRequestActionResult>;
  sendChatMessage: (
    appId: string,
    appToken: string,
    chatId: string,
    payload: ProtocolChatSendMessageInput,
  ) => Promise<ProtocolChatMessageActionResult>;
  runWebhookDeliveryQueue: (
    appId: string,
    appToken: string,
    input?: ProtocolWebhookDeliveryRunInput,
  ) => Promise<ProtocolWebhookDeliveryRunResult>;
  dispatchWebhookDeliveryQueue: (
    appId: string,
    appToken: string,
    input?: ProtocolWebhookDeliveryRunInput,
  ) => Promise<ProtocolWebhookDeliveryDispatchResult>;
  getAppUsageSummary: (
    appId: string,
    appToken: string,
  ) => Promise<ProtocolAppUsageSummary>;
  buildAppRegistrationRequest: (
    input: ProtocolAppRegistrationRequestInput,
  ) => AppRegistrationRequest;
};

export type ProtocolAppRecord = {
  status: string;
  registration: AppRegistration;
  manifest: ProtocolManifest;
  issuedScopes: ProtocolScopeName[];
  issuedCapabilities: CapabilityName[];
};

export type ProtocolAppRegistrationRequestInput = {
  registration: AppRegistration;
  manifest: ProtocolManifest;
  requestedScopes?: ProtocolScopeName[];
  requestedCapabilities?: CapabilityName[];
};

export type ProtocolAppTokenRotateInput = {
  reason?: string;
  metadata?: Record<string, unknown>;
};

export type ProtocolAppTokenRotateResult = {
  registration: AppRegistration;
  manifest: ProtocolManifest;
  issuedScopes: ProtocolScopeName[];
  issuedCapabilities: CapabilityName[];
  credentials: {
    appToken: string;
  };
};

export type ProtocolAppTokenRevokeInput = {
  reason?: string;
  metadata?: Record<string, unknown>;
};

export type ProtocolAppTokenRevokeResult = {
  registration: AppRegistration;
  manifest: ProtocolManifest;
  issuedScopes: ProtocolScopeName[];
  issuedCapabilities: CapabilityName[];
  revoked: boolean;
};

export type ProtocolDeliveryQueueInspection = {
  appId: string;
  generatedAt: string;
  queuedCount: number;
  inFlightCount: number;
  failedCount: number;
  deadLetteredCount: number;
  replayableCount?: number;
  queueState?: {
    waiting: number;
    active: number;
    delayed: number;
    completed: number;
    failed: number;
  };
  deliveries: ProtocolWebhookDelivery[];
};

export type ProtocolGrantRecord = ProtocolAppScopeGrant;
export type ProtocolGrantCreateInput = ProtocolAppScopeGrantCreate;
export type ProtocolGrantRevokeInput = ProtocolAppScopeGrantRevoke;
export type ProtocolIntentCreateInput = ProtocolIntentCreateAction;
export type ProtocolRequestSendInput = ProtocolIntentRequestSendAction;
export type ProtocolRequestDecisionInput = ProtocolRequestDecisionAction;
export type ProtocolChatSendMessageInput = ProtocolChatSendMessageAction;
export type ProtocolWebhookDeliveryRunInput = ProtocolWebhookDeliveryRunRequest;

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
    async listApps() {
      const response = await transport.request("/protocol/apps");
      const payload = (await response.json()) as { data?: unknown } | undefined;
      return (payload?.data ?? payload) as ProtocolAppRecord[];
    },
    async getApp(appId) {
      const response = await transport.request(`/protocol/apps/${appId}`);
      const payload = (await response.json()) as { data?: unknown } | undefined;
      return (payload?.data ?? payload) as ProtocolAppRecord;
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
      return protocolAppRegistrationResultSchema.parse(
        payload?.data ?? payload,
      );
    },
    async listWebhooks(appId, appToken) {
      const response = await transport.request(
        `/protocol/apps/${appId}/webhooks`,
        {
          headers: {
            "x-protocol-app-token": appToken,
          },
        },
      );
      const payload = (await response.json()) as { data?: unknown } | undefined;
      return webhookSubscriptionSchema.array().parse(payload?.data ?? payload);
    },
    async createWebhook(appId, appToken, payload) {
      const requestPayload = webhookSubscriptionCreateSchema.parse(payload);
      const response = await transport.request(
        `/protocol/apps/${appId}/webhooks`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-protocol-app-token": appToken,
          },
          body: JSON.stringify(requestPayload),
        },
      );
      const envelope = (await response.json()) as
        | { data?: unknown }
        | undefined;
      return webhookSubscriptionSchema.parse(envelope?.data ?? envelope);
    },
    async listGrants(appId, appToken) {
      const response = await transport.request(
        `/protocol/apps/${appId}/grants`,
        {
          headers: {
            "x-protocol-app-token": appToken,
          },
        },
      );
      const payload = (await response.json()) as { data?: unknown } | undefined;
      return protocolAppScopeGrantSchema
        .array()
        .parse(payload?.data ?? payload);
    },
    async createGrant(appId, appToken, payload) {
      const requestPayload = protocolAppScopeGrantCreateSchema.parse(payload);
      const response = await transport.request(
        `/protocol/apps/${appId}/grants`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-protocol-app-token": appToken,
          },
          body: JSON.stringify(requestPayload),
        },
      );
      const envelope = (await response.json()) as
        | { data?: unknown }
        | undefined;
      return protocolAppScopeGrantSchema.parse(envelope?.data ?? envelope);
    },
    async revokeGrant(appId, appToken, grantId, input) {
      const response = await transport.request(
        `/protocol/apps/${appId}/grants/${grantId}/revoke`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-protocol-app-token": appToken,
          },
          body: JSON.stringify(
            protocolAppScopeGrantRevokeSchema.parse(input ?? {}),
          ),
        },
      );
      const envelope = (await response.json()) as
        | { data?: unknown }
        | undefined;
      return protocolAppScopeGrantSchema.parse(envelope?.data ?? envelope);
    },
    async rotateAppToken(appId, appToken, input) {
      const response = await transport.request(
        `/protocol/apps/${appId}/token/rotate`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-protocol-app-token": appToken,
          },
          body: JSON.stringify(input ?? {}),
        },
      );
      const envelope = (await response.json()) as
        | { data?: unknown }
        | undefined;
      return protocolAppRegistrationResultSchema.parse(
        envelope?.data ?? envelope,
      );
    },
    async rotateToken(appId, appToken, input) {
      const response = await transport.request(
        `/protocol/apps/${appId}/token/rotate`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-protocol-app-token": appToken,
          },
          body: JSON.stringify(input ?? {}),
        },
      );
      const envelope = (await response.json()) as
        | { data?: unknown }
        | undefined;
      return protocolAppRegistrationResultSchema.parse(
        envelope?.data ?? envelope,
      );
    },
    async revokeAppToken(appId, appToken, input) {
      const response = await transport.request(
        `/protocol/apps/${appId}/token/revoke`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-protocol-app-token": appToken,
          },
          body: JSON.stringify(input ?? {}),
        },
      );
      const envelope = (await response.json()) as
        | { data?: unknown }
        | undefined;
      return (envelope?.data ?? envelope) as ProtocolAppTokenRevokeResult;
    },
    async revokeToken(appId, appToken, input) {
      const response = await transport.request(
        `/protocol/apps/${appId}/token/revoke`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-protocol-app-token": appToken,
          },
          body: JSON.stringify(input ?? {}),
        },
      );
      const envelope = (await response.json()) as
        | { data?: unknown }
        | undefined;
      return (envelope?.data ?? envelope) as ProtocolAppTokenRevokeResult;
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
      return protocolWebhookDeliverySchema
        .array()
        .parse(payload?.data ?? payload);
    },
    async listWebhookDeliveryAttempts(appId, appToken, deliveryId) {
      const response = await transport.request(
        `/protocol/apps/${appId}/deliveries/${deliveryId}/attempts`,
        {
          headers: {
            "x-protocol-app-token": appToken,
          },
        },
      );
      const payload = (await response.json()) as { data?: unknown } | undefined;
      return protocolWebhookDeliveryAttemptSchema
        .array()
        .parse(payload?.data ?? payload);
    },
    async replayWebhookDelivery(appId, appToken, deliveryId) {
      const response = await transport.request(
        `/protocol/apps/${appId}/deliveries/${deliveryId}/replay`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-protocol-app-token": appToken,
          },
          body: JSON.stringify({}),
        },
      );
      const payload = (await response.json()) as { data?: unknown } | undefined;
      return protocolWebhookDeliveryReplayResultSchema.parse(
        payload?.data ?? payload,
      );
    },
    async inspectDeliveryQueue(appId, appToken, cursor) {
      const search = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
      const response = await transport.request(
        `/protocol/apps/${appId}/delivery-queue${search}`,
        {
          headers: {
            "x-protocol-app-token": appToken,
          },
        },
      );
      const envelope = (await response.json()) as
        | { data?: unknown }
        | undefined;
      return (envelope?.data ?? envelope) as ProtocolDeliveryQueueInspection;
    },
    async replayEvents(appId, appToken, cursor) {
      const search = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
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
    async createIntent(appId, appToken, payload) {
      const requestPayload = protocolIntentCreateActionSchema.parse(payload);
      const response = await transport.request(
        `/protocol/apps/${appId}/actions/intents`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-protocol-app-token": appToken,
          },
          body: JSON.stringify(requestPayload),
        },
      );
      const envelope = (await response.json()) as
        | { data?: unknown }
        | undefined;
      return protocolIntentActionResultSchema.parse(envelope?.data ?? envelope);
    },
    async sendRequest(appId, appToken, payload) {
      const requestPayload =
        protocolIntentRequestSendActionSchema.parse(payload);
      const response = await transport.request(
        `/protocol/apps/${appId}/actions/requests`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-protocol-app-token": appToken,
          },
          body: JSON.stringify(requestPayload),
        },
      );
      const envelope = (await response.json()) as
        | { data?: unknown }
        | undefined;
      return protocolRequestActionResultSchema.parse(
        envelope?.data ?? envelope,
      );
    },
    async acceptRequest(appId, appToken, requestId, payload) {
      const requestPayload = protocolRequestDecisionActionSchema.parse(payload);
      const response = await transport.request(
        `/protocol/apps/${appId}/actions/requests/${requestId}/accept`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-protocol-app-token": appToken,
          },
          body: JSON.stringify(requestPayload),
        },
      );
      const envelope = (await response.json()) as
        | { data?: unknown }
        | undefined;
      return protocolRequestActionResultSchema.parse(
        envelope?.data ?? envelope,
      );
    },
    async rejectRequest(appId, appToken, requestId, payload) {
      const requestPayload = protocolRequestDecisionActionSchema.parse(payload);
      const response = await transport.request(
        `/protocol/apps/${appId}/actions/requests/${requestId}/reject`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-protocol-app-token": appToken,
          },
          body: JSON.stringify(requestPayload),
        },
      );
      const envelope = (await response.json()) as
        | { data?: unknown }
        | undefined;
      return protocolRequestActionResultSchema.parse(
        envelope?.data ?? envelope,
      );
    },
    async sendChatMessage(appId, appToken, chatId, payload) {
      const requestPayload = protocolChatSendMessageActionSchema.parse(payload);
      const response = await transport.request(
        `/protocol/apps/${appId}/actions/chats/${chatId}/messages`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-protocol-app-token": appToken,
          },
          body: JSON.stringify(requestPayload),
        },
      );
      const envelope = (await response.json()) as
        | { data?: unknown }
        | undefined;
      return protocolChatMessageActionResultSchema.parse(
        envelope?.data ?? envelope,
      );
    },
    async runWebhookDeliveryQueue(appId, appToken, input) {
      const requestPayload = protocolWebhookDeliveryRunRequestSchema.parse(
        input ?? {},
      );
      const response = await transport.request(
        `/protocol/apps/${appId}/delivery-queue/run`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-protocol-app-token": appToken,
          },
          body: JSON.stringify(requestPayload),
        },
      );
      const envelope = (await response.json()) as
        | { data?: unknown }
        | undefined;
      return protocolWebhookDeliveryRunResultSchema.parse(
        envelope?.data ?? envelope,
      );
    },
    async dispatchWebhookDeliveryQueue(appId, appToken, input) {
      const requestPayload = protocolWebhookDeliveryRunRequestSchema.parse(
        input ?? {},
      );
      const response = await transport.request(
        `/protocol/apps/${appId}/delivery-queue/dispatch`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-protocol-app-token": appToken,
          },
          body: JSON.stringify(requestPayload),
        },
      );
      const envelope = (await response.json()) as
        | { data?: unknown }
        | undefined;
      return protocolWebhookDeliveryDispatchResultSchema.parse(
        envelope?.data ?? envelope,
      );
    },
    async getAppUsageSummary(appId, appToken) {
      const response = await transport.request(
        `/protocol/apps/${appId}/usage`,
        {
          headers: {
            "x-protocol-app-token": appToken,
          },
        },
      );
      const envelope = (await response.json()) as
        | { data?: unknown }
        | undefined;
      return protocolAppUsageSummarySchema.parse(envelope?.data ?? envelope);
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
