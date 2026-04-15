import {
  protocolWebhookDeliverySchema,
  type ProtocolWebhookDelivery,
  appRegistrationRequestSchema,
  protocolAppUsageSummarySchema,
  protocolChatMessageActionResultSchema,
  protocolChatSendMessageActionSchema,
  protocolCircleActionResultSchema,
  protocolCircleCreateActionSchema,
  protocolCircleJoinActionSchema,
  protocolCircleLeaveActionSchema,
  protocolAppConsentRequestCreateSchema,
  protocolAppConsentRequestDecisionSchema,
  protocolAppConsentRequestSchema,
  protocolAppScopeGrantCreateSchema,
  protocolAppScopeGrantRevokeSchema,
  protocolAppScopeGrantSchema,
  protocolAppRegistrationResultSchema,
  protocolDiscoveryDocumentSchema,
  protocolIntentActionResultSchema,
  protocolIntentCancelActionSchema,
  protocolIntentCreateActionSchema,
  protocolIntentUpdateActionSchema,
  protocolIntentRequestSendActionSchema,
  protocolRequestActionResultSchema,
  protocolRequestDecisionActionSchema,
  protocolEventEnvelopeSchema,
  protocolReplayCursorSchema,
  protocolWebhookDeliveryDispatchResultSchema,
  protocolWebhookDeliveryAttemptSchema,
  protocolWebhookDeliveryReplayBatchResultSchema,
  protocolWebhookDeliveryReplayResultSchema,
  protocolWebhookDeliveryRunRequestSchema,
  protocolWebhookDeliveryRunResultSchema,
  manifestSchema,
  webhookSubscriptionCreateSchema,
  webhookSubscriptionSchema,
  type ProtocolAppRecord,
  type ProtocolAppRegistrationRequest,
  type ProtocolAppTokenRotateResult,
  type ProtocolAppTokenRevokeResult,
  type ProtocolDeliveryQueueInspection,
  type ProtocolAppScopeGrant,
  type ProtocolAppScopeGrantCreate,
  type ProtocolAppScopeGrantRevoke,
  type ProtocolAppRegistrationResult,
  type ProtocolAppConsentRequest,
  type ProtocolAppConsentRequestCreate,
  type ProtocolAppConsentRequestDecision,
  type ProtocolAppUsageSummary,
  type ProtocolChatMessageActionResult,
  type ProtocolChatSendMessageAction,
  type ProtocolCircleActionResult,
  type ProtocolCircleCreateAction,
  type ProtocolCircleJoinAction,
  type ProtocolCircleLeaveAction,
  type ProtocolDiscoveryDocument,
  type ProtocolEventEnvelope,
  type ProtocolIntentActionResult,
  type ProtocolIntentCancelAction,
  type ProtocolIntentCreateAction,
  type ProtocolIntentUpdateAction,
  type ProtocolIntentRequestSendAction,
  type ProtocolManifest,
  type ProtocolRequestActionResult,
  type ProtocolRequestDecisionAction,
  type ProtocolReplayCursor,
  type ProtocolScopeName,
  type ProtocolWebhookDeliveryDispatchResult,
  type ProtocolWebhookDeliveryAttempt,
  type ProtocolWebhookDeliveryReplayBatchResult,
  type ProtocolWebhookDeliveryReplayResult,
  type ProtocolWebhookDeliveryRunRequest,
  type ProtocolWebhookDeliveryRunResult,
  type WebhookSubscription,
  type WebhookSubscriptionCreate,
} from "@opensocial/protocol-types";

export type ProtocolClientTransport = {
  request: (path: string, init?: RequestInit) => Promise<Response>;
};

export type ProtocolClientFetchLike = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

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
  listConsentRequests: (
    appId: string,
    appToken: string,
  ) => Promise<ProtocolConsentRequestRecord[]>;
  createGrant: (
    appId: string,
    appToken: string,
    payload: ProtocolGrantCreateInput,
  ) => Promise<ProtocolGrantRecord>;
  createConsentRequest: (
    appId: string,
    appToken: string,
    payload: ProtocolConsentRequestCreateInput,
  ) => Promise<ProtocolConsentRequestRecord>;
  approveConsentRequest: (
    appId: string,
    appToken: string,
    requestId: string,
    payload: ProtocolConsentRequestDecisionInput,
  ) => Promise<ProtocolConsentRequestRecord>;
  rejectConsentRequest: (
    appId: string,
    appToken: string,
    requestId: string,
    payload: ProtocolConsentRequestDecisionInput,
  ) => Promise<ProtocolConsentRequestRecord>;
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
  replayDeadLetteredDeliveries: (
    appId: string,
    appToken: string,
    input?: ProtocolWebhookDeliveryRunInput,
  ) => Promise<ProtocolWebhookDeliveryReplayBatchResult>;
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
  updateIntent: (
    appId: string,
    appToken: string,
    intentId: string,
    payload: ProtocolIntentUpdateInput,
  ) => Promise<ProtocolIntentActionResult>;
  cancelIntent: (
    appId: string,
    appToken: string,
    intentId: string,
    payload: ProtocolIntentCancelInput,
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
  createCircle: (
    appId: string,
    appToken: string,
    payload: ProtocolCircleCreateInput,
  ) => Promise<ProtocolCircleActionResult>;
  joinCircle: (
    appId: string,
    appToken: string,
    circleId: string,
    payload: ProtocolCircleJoinInput,
  ) => Promise<ProtocolCircleActionResult>;
  leaveCircle: (
    appId: string,
    appToken: string,
    circleId: string,
    payload: ProtocolCircleLeaveInput,
  ) => Promise<ProtocolCircleActionResult>;
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

export type ProtocolAppSession = {
  appId: string;
  appToken: string;
};

export type ProtocolAppClient = {
  listWebhooks: () => Promise<WebhookSubscription[]>;
  createWebhook: (
    payload: WebhookSubscriptionCreate,
  ) => Promise<WebhookSubscription>;
  listGrants: () => Promise<ProtocolGrantRecord[]>;
  listConsentRequests: () => Promise<ProtocolConsentRequestRecord[]>;
  createGrant: (
    payload: ProtocolGrantCreateInput,
  ) => Promise<ProtocolGrantRecord>;
  createConsentRequest: (
    payload: ProtocolConsentRequestCreateInput,
  ) => Promise<ProtocolConsentRequestRecord>;
  approveConsentRequest: (
    requestId: string,
    payload: ProtocolConsentRequestDecisionInput,
  ) => Promise<ProtocolConsentRequestRecord>;
  rejectConsentRequest: (
    requestId: string,
    payload: ProtocolConsentRequestDecisionInput,
  ) => Promise<ProtocolConsentRequestRecord>;
  revokeGrant: (
    grantId: string,
    input?: ProtocolGrantRevokeInput,
  ) => Promise<ProtocolGrantRecord>;
  rotateAppToken: (
    input?: ProtocolAppTokenRotateInput,
  ) => Promise<ProtocolAppTokenRotateResult>;
  rotateToken: (
    input?: ProtocolAppTokenRotateInput,
  ) => Promise<ProtocolAppTokenRotateResult>;
  revokeAppToken: (
    input?: ProtocolAppTokenRevokeInput,
  ) => Promise<ProtocolAppTokenRevokeResult>;
  revokeToken: (
    input?: ProtocolAppTokenRevokeInput,
  ) => Promise<ProtocolAppTokenRevokeResult>;
  listWebhookDeliveries: (
    subscriptionId: string,
  ) => Promise<ProtocolWebhookDelivery[]>;
  listWebhookDeliveryAttempts: (
    deliveryId: string,
  ) => Promise<ProtocolWebhookDeliveryAttempt[]>;
  replayWebhookDelivery: (
    deliveryId: string,
  ) => Promise<ProtocolWebhookDeliveryReplayResult>;
  replayDeadLetteredDeliveries: (
    input?: ProtocolWebhookDeliveryRunInput,
  ) => Promise<ProtocolWebhookDeliveryReplayBatchResult>;
  inspectDeliveryQueue: (
    cursor?: string,
  ) => Promise<ProtocolDeliveryQueueInspection>;
  replayEvents: (cursor?: string) => Promise<ProtocolEventEnvelope[]>;
  getReplayCursor: () => Promise<ProtocolReplayCursor>;
  saveReplayCursor: (cursor: string) => Promise<ProtocolReplayCursor>;
  createIntent: (
    payload: ProtocolIntentCreateInput,
  ) => Promise<ProtocolIntentActionResult>;
  updateIntent: (
    intentId: string,
    payload: ProtocolIntentUpdateInput,
  ) => Promise<ProtocolIntentActionResult>;
  cancelIntent: (
    intentId: string,
    payload: ProtocolIntentCancelInput,
  ) => Promise<ProtocolIntentActionResult>;
  sendRequest: (
    payload: ProtocolRequestSendInput,
  ) => Promise<ProtocolRequestActionResult>;
  acceptRequest: (
    requestId: string,
    payload: ProtocolRequestDecisionInput,
  ) => Promise<ProtocolRequestActionResult>;
  rejectRequest: (
    requestId: string,
    payload: ProtocolRequestDecisionInput,
  ) => Promise<ProtocolRequestActionResult>;
  sendChatMessage: (
    chatId: string,
    payload: ProtocolChatSendMessageInput,
  ) => Promise<ProtocolChatMessageActionResult>;
  createCircle: (
    payload: ProtocolCircleCreateInput,
  ) => Promise<ProtocolCircleActionResult>;
  joinCircle: (
    circleId: string,
    payload: ProtocolCircleJoinInput,
  ) => Promise<ProtocolCircleActionResult>;
  leaveCircle: (
    circleId: string,
    payload: ProtocolCircleLeaveInput,
  ) => Promise<ProtocolCircleActionResult>;
  runWebhookDeliveryQueue: (
    input?: ProtocolWebhookDeliveryRunInput,
  ) => Promise<ProtocolWebhookDeliveryRunResult>;
  dispatchWebhookDeliveryQueue: (
    input?: ProtocolWebhookDeliveryRunInput,
  ) => Promise<ProtocolWebhookDeliveryDispatchResult>;
  getAppUsageSummary: () => Promise<ProtocolAppUsageSummary>;
};

export type ProtocolAppOperationalSnapshot = {
  usage: ProtocolAppUsageSummary;
  queue: ProtocolDeliveryQueueInspection;
  grants: ProtocolGrantRecord[];
  consentRequests: ProtocolConsentRequestRecord[];
  webhooks: WebhookSubscription[];
};

export type ProtocolAppRegistrationRequestInput =
  ProtocolAppRegistrationRequest;

export type ProtocolAppTokenRotateInput = {
  reason?: string;
  metadata?: Record<string, unknown>;
};

export type ProtocolAppTokenRevokeInput = {
  reason?: string;
  metadata?: Record<string, unknown>;
};

export type ProtocolGrantRecord = ProtocolAppScopeGrant;
export type ProtocolGrantCreateInput = ProtocolAppScopeGrantCreate;
export type ProtocolGrantRevokeInput = ProtocolAppScopeGrantRevoke;
export type ProtocolConsentRequestRecord = ProtocolAppConsentRequest;
export type ProtocolConsentRequestCreateInput = ProtocolAppConsentRequestCreate;
export type ProtocolConsentRequestDecisionInput =
  ProtocolAppConsentRequestDecision;
export type ProtocolIntentCreateInput = ProtocolIntentCreateAction;
export type ProtocolIntentUpdateInput = ProtocolIntentUpdateAction;
export type ProtocolIntentCancelInput = ProtocolIntentCancelAction;
export type ProtocolRequestSendInput = ProtocolIntentRequestSendAction;
export type ProtocolRequestDecisionInput = ProtocolRequestDecisionAction;
export type ProtocolChatSendMessageInput = ProtocolChatSendMessageAction;
export type ProtocolCircleCreateInput = ProtocolCircleCreateAction;
export type ProtocolCircleJoinInput = ProtocolCircleJoinAction;
export type ProtocolCircleLeaveInput = ProtocolCircleLeaveAction;
export type ProtocolWebhookDeliveryRunInput = ProtocolWebhookDeliveryRunRequest;

type ProtocolResponseEnvelope = {
  data?: unknown;
};

async function readProtocolResponseData<T>(
  response: Response,
  parser?: {
    parse: (input: unknown) => T;
  },
): Promise<T> {
  const payload = (await response.json()) as ProtocolResponseEnvelope | undefined;
  const data = payload?.data ?? payload;
  return parser ? parser.parse(data) : (data as T);
}

function buildProtocolAppTokenHeaders(appToken: string): HeadersInit {
  return {
    "x-protocol-app-token": appToken,
  };
}

function buildProtocolJsonRequestInit(
  appToken: string,
  body: unknown,
  method: RequestInit["method"] = "POST",
): RequestInit {
  return {
    method,
    headers: {
      "content-type": "application/json",
      "x-protocol-app-token": appToken,
    },
    body: JSON.stringify(body),
  };
}

export function createProtocolClient(
  transport: ProtocolClientTransport,
): ProtocolClient {
  return {
    async getManifest() {
      const response = await transport.request("/protocol/manifest");
      return readProtocolResponseData(response, manifestSchema);
    },
    async getDiscovery() {
      const response = await transport.request("/protocol/discovery");
      return readProtocolResponseData(response, protocolDiscoveryDocumentSchema);
    },
    async listApps() {
      const response = await transport.request("/protocol/apps");
      return readProtocolResponseData<ProtocolAppRecord[]>(response);
    },
    async getApp(appId) {
      const response = await transport.request(`/protocol/apps/${appId}`);
      return readProtocolResponseData<ProtocolAppRecord>(response);
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
      return readProtocolResponseData(
        response,
        protocolAppRegistrationResultSchema,
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
      return readProtocolResponseData(
        response,
        webhookSubscriptionSchema.array(),
      );
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
      return readProtocolResponseData(response, webhookSubscriptionSchema);
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
      return readProtocolResponseData(
        response,
        protocolAppScopeGrantSchema.array(),
      );
    },
    async listConsentRequests(appId, appToken) {
      const response = await transport.request(
        `/protocol/apps/${appId}/consent-requests`,
        {
          headers: {
            "x-protocol-app-token": appToken,
          },
        },
      );
      return readProtocolResponseData(
        response,
        protocolAppConsentRequestSchema.array(),
      );
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
      return readProtocolResponseData(response, protocolAppScopeGrantSchema);
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
      return readProtocolResponseData(response, protocolAppScopeGrantSchema);
    },
    async createConsentRequest(appId, appToken, payload) {
      const requestPayload =
        protocolAppConsentRequestCreateSchema.parse(payload);
      const response = await transport.request(
        `/protocol/apps/${appId}/consent-requests`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-protocol-app-token": appToken,
          },
          body: JSON.stringify(requestPayload),
        },
      );
      return readProtocolResponseData(
        response,
        protocolAppConsentRequestSchema,
      );
    },
    async approveConsentRequest(appId, appToken, requestId, payload) {
      const requestPayload =
        protocolAppConsentRequestDecisionSchema.parse(payload);
      const response = await transport.request(
        `/protocol/apps/${appId}/consent-requests/${requestId}/approve`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-protocol-app-token": appToken,
          },
          body: JSON.stringify(requestPayload),
        },
      );
      return readProtocolResponseData(
        response,
        protocolAppConsentRequestSchema,
      );
    },
    async rejectConsentRequest(appId, appToken, requestId, payload) {
      const requestPayload =
        protocolAppConsentRequestDecisionSchema.parse(payload);
      const response = await transport.request(
        `/protocol/apps/${appId}/consent-requests/${requestId}/reject`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-protocol-app-token": appToken,
          },
          body: JSON.stringify(requestPayload),
        },
      );
      return readProtocolResponseData(
        response,
        protocolAppConsentRequestSchema,
      );
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
      return readProtocolResponseData(
        response,
        protocolAppRegistrationResultSchema,
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
      return readProtocolResponseData(
        response,
        protocolAppRegistrationResultSchema,
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
      return readProtocolResponseData<ProtocolAppTokenRevokeResult>(response);
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
      return readProtocolResponseData<ProtocolAppTokenRevokeResult>(response);
    },
    async listWebhookDeliveries(appId, appToken, subscriptionId) {
      const response = await transport.request(
        `/protocol/apps/${appId}/webhooks/${subscriptionId}/deliveries`,
        {
          headers: buildProtocolAppTokenHeaders(appToken),
        },
      );
      return readProtocolResponseData(
        response,
        protocolWebhookDeliverySchema.array(),
      );
    },
    async listWebhookDeliveryAttempts(appId, appToken, deliveryId) {
      const response = await transport.request(
        `/protocol/apps/${appId}/deliveries/${deliveryId}/attempts`,
        {
          headers: buildProtocolAppTokenHeaders(appToken),
        },
      );
      return readProtocolResponseData(
        response,
        protocolWebhookDeliveryAttemptSchema.array(),
      );
    },
    async replayWebhookDelivery(appId, appToken, deliveryId) {
      const response = await transport.request(
        `/protocol/apps/${appId}/deliveries/${deliveryId}/replay`,
        buildProtocolJsonRequestInit(appToken, {}),
      );
      return readProtocolResponseData(
        response,
        protocolWebhookDeliveryReplayResultSchema,
      );
    },
    async replayDeadLetteredDeliveries(appId, appToken, input) {
      const response = await transport.request(
        `/protocol/apps/${appId}/delivery-queue/replay-dead-lettered`,
        buildProtocolJsonRequestInit(
          appToken,
          protocolWebhookDeliveryRunRequestSchema.parse(input ?? {}),
        ),
      );
      return readProtocolResponseData(
        response,
        protocolWebhookDeliveryReplayBatchResultSchema,
      );
    },
    async inspectDeliveryQueue(appId, appToken, cursor) {
      const search = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
      const response = await transport.request(
        `/protocol/apps/${appId}/delivery-queue${search}`,
        {
          headers: buildProtocolAppTokenHeaders(appToken),
        },
      );
      return readProtocolResponseData<ProtocolDeliveryQueueInspection>(
        response,
      );
    },
    async replayEvents(appId, appToken, cursor) {
      const search = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
      const response = await transport.request(
        `/protocol/apps/${appId}/events/replay${search}`,
        {
          headers: buildProtocolAppTokenHeaders(appToken),
        },
      );
      return readProtocolResponseData(
        response,
        protocolEventEnvelopeSchema.array(),
      );
    },
    async getReplayCursor(appId, appToken) {
      const response = await transport.request(
        `/protocol/apps/${appId}/events/cursor`,
        {
          headers: buildProtocolAppTokenHeaders(appToken),
        },
      );
      return readProtocolResponseData(response, protocolReplayCursorSchema);
    },
    async saveReplayCursor(appId, appToken, cursor) {
      const response = await transport.request(
        `/protocol/apps/${appId}/events/cursor`,
        buildProtocolJsonRequestInit(appToken, { cursor }),
      );
      return readProtocolResponseData(response, protocolReplayCursorSchema);
    },
    async createIntent(appId, appToken, payload) {
      const requestPayload = protocolIntentCreateActionSchema.parse(payload);
      const response = await transport.request(
        `/protocol/apps/${appId}/actions/intents`,
        buildProtocolJsonRequestInit(appToken, requestPayload),
      );
      return readProtocolResponseData(response, protocolIntentActionResultSchema);
    },
    async updateIntent(appId, appToken, intentId, payload) {
      const requestPayload = protocolIntentUpdateActionSchema.parse(payload);
      const response = await transport.request(
        `/protocol/apps/${appId}/actions/intents/${intentId}`,
        buildProtocolJsonRequestInit(appToken, requestPayload, "PATCH"),
      );
      return readProtocolResponseData(response, protocolIntentActionResultSchema);
    },
    async cancelIntent(appId, appToken, intentId, payload) {
      const requestPayload = protocolIntentCancelActionSchema.parse(payload);
      const response = await transport.request(
        `/protocol/apps/${appId}/actions/intents/${intentId}/cancel`,
        buildProtocolJsonRequestInit(appToken, requestPayload),
      );
      return readProtocolResponseData(response, protocolIntentActionResultSchema);
    },
    async sendRequest(appId, appToken, payload) {
      const requestPayload =
        protocolIntentRequestSendActionSchema.parse(payload);
      const response = await transport.request(
        `/protocol/apps/${appId}/actions/requests`,
        buildProtocolJsonRequestInit(appToken, requestPayload),
      );
      return readProtocolResponseData(response, protocolRequestActionResultSchema);
    },
    async acceptRequest(appId, appToken, requestId, payload) {
      const requestPayload = protocolRequestDecisionActionSchema.parse(payload);
      const response = await transport.request(
        `/protocol/apps/${appId}/actions/requests/${requestId}/accept`,
        buildProtocolJsonRequestInit(appToken, requestPayload),
      );
      return readProtocolResponseData(response, protocolRequestActionResultSchema);
    },
    async rejectRequest(appId, appToken, requestId, payload) {
      const requestPayload = protocolRequestDecisionActionSchema.parse(payload);
      const response = await transport.request(
        `/protocol/apps/${appId}/actions/requests/${requestId}/reject`,
        buildProtocolJsonRequestInit(appToken, requestPayload),
      );
      return readProtocolResponseData(response, protocolRequestActionResultSchema);
    },
    async sendChatMessage(appId, appToken, chatId, payload) {
      const requestPayload = protocolChatSendMessageActionSchema.parse(payload);
      const response = await transport.request(
        `/protocol/apps/${appId}/actions/chats/${chatId}/messages`,
        buildProtocolJsonRequestInit(appToken, requestPayload),
      );
      return readProtocolResponseData(
        response,
        protocolChatMessageActionResultSchema,
      );
    },
    async createCircle(appId, appToken, payload) {
      const requestPayload = protocolCircleCreateActionSchema.parse(payload);
      const response = await transport.request(
        `/protocol/apps/${appId}/actions/circles`,
        buildProtocolJsonRequestInit(appToken, requestPayload),
      );
      return readProtocolResponseData(response, protocolCircleActionResultSchema);
    },
    async joinCircle(appId, appToken, circleId, payload) {
      const requestPayload = protocolCircleJoinActionSchema.parse(payload);
      const response = await transport.request(
        `/protocol/apps/${appId}/actions/circles/${circleId}/join`,
        buildProtocolJsonRequestInit(appToken, requestPayload),
      );
      return readProtocolResponseData(response, protocolCircleActionResultSchema);
    },
    async leaveCircle(appId, appToken, circleId, payload) {
      const requestPayload = protocolCircleLeaveActionSchema.parse(payload);
      const response = await transport.request(
        `/protocol/apps/${appId}/actions/circles/${circleId}/leave`,
        buildProtocolJsonRequestInit(appToken, requestPayload),
      );
      return readProtocolResponseData(response, protocolCircleActionResultSchema);
    },
    async runWebhookDeliveryQueue(appId, appToken, input) {
      const requestPayload = protocolWebhookDeliveryRunRequestSchema.parse(
        input ?? {},
      );
      const response = await transport.request(
        `/protocol/apps/${appId}/delivery-queue/run`,
        buildProtocolJsonRequestInit(appToken, requestPayload),
      );
      return readProtocolResponseData(
        response,
        protocolWebhookDeliveryRunResultSchema,
      );
    },
    async dispatchWebhookDeliveryQueue(appId, appToken, input) {
      const requestPayload = protocolWebhookDeliveryRunRequestSchema.parse(
        input ?? {},
      );
      const response = await transport.request(
        `/protocol/apps/${appId}/delivery-queue/dispatch`,
        buildProtocolJsonRequestInit(appToken, requestPayload),
      );
      return readProtocolResponseData(
        response,
        protocolWebhookDeliveryDispatchResultSchema,
      );
    },
    async getAppUsageSummary(appId, appToken) {
      const response = await transport.request(
        `/protocol/apps/${appId}/usage`,
        {
          headers: buildProtocolAppTokenHeaders(appToken),
        },
      );
      return readProtocolResponseData(response, protocolAppUsageSummarySchema);
    },
    buildAppRegistrationRequest(input) {
      return buildProtocolAppRegistrationRequest(input);
    },
  };
}

export function createFetchProtocolTransport(
  baseUrl: string,
  fetchImpl: ProtocolClientFetchLike = fetch,
): ProtocolClientTransport {
  const normalizedBaseUrl = baseUrl.replace(/\/+$/, "");
  return {
    request(path, init) {
      return fetchImpl(`${normalizedBaseUrl}${path}`, init);
    },
  };
}

export function createProtocolClientFromBaseUrl(
  baseUrl: string,
  fetchImpl?: ProtocolClientFetchLike,
): ProtocolClient {
  return createProtocolClient(
    createFetchProtocolTransport(baseUrl, fetchImpl ?? fetch),
  );
}

export function createBoundProtocolAppClientFromBaseUrl(
  baseUrl: string,
  session: ProtocolAppSession,
  fetchImpl?: ProtocolClientFetchLike,
): ProtocolAppClient {
  return bindProtocolAppClient(
    createProtocolClientFromBaseUrl(baseUrl, fetchImpl),
    session,
  );
}

export function bindProtocolAppClient(
  client: ProtocolClient,
  session: ProtocolAppSession,
): ProtocolAppClient {
  return {
    listWebhooks: () => client.listWebhooks(session.appId, session.appToken),
    createWebhook: (payload) =>
      client.createWebhook(session.appId, session.appToken, payload),
    listGrants: () => client.listGrants(session.appId, session.appToken),
    listConsentRequests: () =>
      client.listConsentRequests(session.appId, session.appToken),
    createGrant: (payload) =>
      client.createGrant(session.appId, session.appToken, payload),
    createConsentRequest: (payload) =>
      client.createConsentRequest(session.appId, session.appToken, payload),
    approveConsentRequest: (requestId, payload) =>
      client.approveConsentRequest(
        session.appId,
        session.appToken,
        requestId,
        payload,
      ),
    rejectConsentRequest: (requestId, payload) =>
      client.rejectConsentRequest(
        session.appId,
        session.appToken,
        requestId,
        payload,
      ),
    revokeGrant: (grantId, input) =>
      client.revokeGrant(session.appId, session.appToken, grantId, input),
    rotateAppToken: (input) =>
      client.rotateAppToken(session.appId, session.appToken, input),
    rotateToken: (input) =>
      client.rotateToken(session.appId, session.appToken, input),
    revokeAppToken: (input) =>
      client.revokeAppToken(session.appId, session.appToken, input),
    revokeToken: (input) =>
      client.revokeToken(session.appId, session.appToken, input),
    listWebhookDeliveries: (subscriptionId) =>
      client.listWebhookDeliveries(
        session.appId,
        session.appToken,
        subscriptionId,
      ),
    listWebhookDeliveryAttempts: (deliveryId) =>
      client.listWebhookDeliveryAttempts(
        session.appId,
        session.appToken,
        deliveryId,
      ),
    replayWebhookDelivery: (deliveryId) =>
      client.replayWebhookDelivery(session.appId, session.appToken, deliveryId),
    replayDeadLetteredDeliveries: (input) =>
      client.replayDeadLetteredDeliveries(
        session.appId,
        session.appToken,
        input,
      ),
    inspectDeliveryQueue: (cursor) =>
      client.inspectDeliveryQueue(session.appId, session.appToken, cursor),
    replayEvents: (cursor) =>
      client.replayEvents(session.appId, session.appToken, cursor),
    getReplayCursor: () =>
      client.getReplayCursor(session.appId, session.appToken),
    saveReplayCursor: (cursor) =>
      client.saveReplayCursor(session.appId, session.appToken, cursor),
    createIntent: (payload) =>
      client.createIntent(session.appId, session.appToken, payload),
    updateIntent: (intentId, payload) =>
      client.updateIntent(session.appId, session.appToken, intentId, payload),
    cancelIntent: (intentId, payload) =>
      client.cancelIntent(session.appId, session.appToken, intentId, payload),
    sendRequest: (payload) =>
      client.sendRequest(session.appId, session.appToken, payload),
    acceptRequest: (requestId, payload) =>
      client.acceptRequest(session.appId, session.appToken, requestId, payload),
    rejectRequest: (requestId, payload) =>
      client.rejectRequest(session.appId, session.appToken, requestId, payload),
    sendChatMessage: (chatId, payload) =>
      client.sendChatMessage(session.appId, session.appToken, chatId, payload),
    createCircle: (payload) =>
      client.createCircle(session.appId, session.appToken, payload),
    joinCircle: (circleId, payload) =>
      client.joinCircle(session.appId, session.appToken, circleId, payload),
    leaveCircle: (circleId, payload) =>
      client.leaveCircle(session.appId, session.appToken, circleId, payload),
    runWebhookDeliveryQueue: (input) =>
      client.runWebhookDeliveryQueue(session.appId, session.appToken, input),
    dispatchWebhookDeliveryQueue: (input) =>
      client.dispatchWebhookDeliveryQueue(
        session.appId,
        session.appToken,
        input,
      ),
    getAppUsageSummary: () =>
      client.getAppUsageSummary(session.appId, session.appToken),
  };
}

export async function loadProtocolAppOperationalSnapshot(
  app: ProtocolAppClient,
  options?: {
    queueCursor?: string;
  },
): Promise<ProtocolAppOperationalSnapshot> {
  const [usage, queue, grants, consentRequests, webhooks] = await Promise.all([
    app.getAppUsageSummary(),
    app.inspectDeliveryQueue(options?.queueCursor),
    app.listGrants(),
    app.listConsentRequests(),
    app.listWebhooks(),
  ]);

  return {
    usage,
    queue,
    grants,
    consentRequests,
    webhooks,
  };
}

export function buildProtocolAppRegistrationRequest(
  input: ProtocolAppRegistrationRequestInput,
): ProtocolAppRegistrationRequest {
  return appRegistrationRequestSchema.parse({
    registration: input.registration,
    manifest: input.manifest,
    requestedScopes: input.requestedScopes ?? [],
    requestedCapabilities: input.requestedCapabilities ?? [],
  });
}
