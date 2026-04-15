import {
  type ProtocolAppClient,
  type ProtocolAppOperationalSnapshot,
  type ProtocolAppSession,
  type ProtocolChatSendMessageInput,
  type ProtocolCircleCreateInput,
  type ProtocolCircleJoinInput,
  type ProtocolCircleLeaveInput,
  type ProtocolIntentActionResult,
  type ProtocolIntentCancelInput,
  type ProtocolIntentCreateInput,
  type ProtocolIntentUpdateInput,
  type ProtocolRequestActionResult,
  type ProtocolRequestDecisionInput,
  type ProtocolRequestSendInput,
  createBoundProtocolAppClientFromBaseUrl,
  loadProtocolAppOperationalSnapshot,
} from "@opensocial/protocol-client";

export type ProtocolAgentSession = ProtocolAppSession & {
  actorUserId: string;
  agentId?: string;
  metadata?: Record<string, unknown>;
};

export type ProtocolAgentClient = {
  inspectReadiness: () => Promise<ProtocolAppOperationalSnapshot>;
  createIntent: (
    input: Omit<ProtocolIntentCreateInput, "actorUserId" | "metadata"> & {
      metadata?: Record<string, unknown>;
    },
  ) => Promise<ProtocolIntentActionResult>;
  updateIntent: (
    intentId: string,
    input: Omit<ProtocolIntentUpdateInput, "actorUserId" | "metadata"> & {
      metadata?: Record<string, unknown>;
    },
  ) => Promise<ProtocolIntentActionResult>;
  cancelIntent: (
    intentId: string,
    input?: Omit<ProtocolIntentCancelInput, "actorUserId" | "metadata"> & {
      metadata?: Record<string, unknown>;
    },
  ) => Promise<ProtocolIntentActionResult>;
  sendRequest: (
    input: Omit<ProtocolRequestSendInput, "actorUserId" | "metadata"> & {
      metadata?: Record<string, unknown>;
    },
  ) => Promise<ProtocolRequestActionResult>;
  acceptRequest: (
    requestId: string,
    input?: Omit<ProtocolRequestDecisionInput, "actorUserId" | "metadata"> & {
      metadata?: Record<string, unknown>;
    },
  ) => Promise<ProtocolRequestActionResult>;
  rejectRequest: (
    requestId: string,
    input?: Omit<ProtocolRequestDecisionInput, "actorUserId" | "metadata"> & {
      metadata?: Record<string, unknown>;
    },
  ) => Promise<ProtocolRequestActionResult>;
  sendChatMessage: (
    chatId: string,
    input: Omit<ProtocolChatSendMessageInput, "actorUserId" | "metadata"> & {
      metadata?: Record<string, unknown>;
    },
  ) => ReturnType<ProtocolAppClient["sendChatMessage"]>;
  createCircle: (
    input: Omit<ProtocolCircleCreateInput, "actorUserId" | "metadata"> & {
      metadata?: Record<string, unknown>;
    },
  ) => ReturnType<ProtocolAppClient["createCircle"]>;
  joinCircle: (
    circleId: string,
    input: Omit<ProtocolCircleJoinInput, "actorUserId" | "metadata"> & {
      metadata?: Record<string, unknown>;
    },
  ) => ReturnType<ProtocolAppClient["joinCircle"]>;
  leaveCircle: (
    circleId: string,
    input: Omit<ProtocolCircleLeaveInput, "actorUserId" | "metadata"> & {
      metadata?: Record<string, unknown>;
    },
  ) => ReturnType<ProtocolAppClient["leaveCircle"]>;
};

function mergeMetadata(
  session: ProtocolAgentSession,
  metadata?: Record<string, unknown>,
): Record<string, unknown> {
  return {
    ...(session.metadata ?? {}),
    ...(session.agentId ? { agentId: session.agentId } : {}),
    ...(metadata ?? {}),
  };
}

export function bindProtocolAgentClient(
  app: ProtocolAppClient,
  session: ProtocolAgentSession,
): ProtocolAgentClient {
  return {
    inspectReadiness: () => loadProtocolAppOperationalSnapshot(app),
    createIntent: (input) =>
      app.createIntent({
        ...input,
        actorUserId: session.actorUserId,
        metadata: mergeMetadata(session, input.metadata),
      }),
    updateIntent: (intentId, input) =>
      app.updateIntent(intentId, {
        ...input,
        actorUserId: session.actorUserId,
        metadata: mergeMetadata(session, input.metadata),
      }),
    cancelIntent: (intentId, input = {}) =>
      app.cancelIntent(intentId, {
        ...input,
        actorUserId: session.actorUserId,
        metadata: mergeMetadata(session, input.metadata),
      }),
    sendRequest: (input) =>
      app.sendRequest({
        ...input,
        actorUserId: session.actorUserId,
        metadata: mergeMetadata(session, input.metadata),
      }),
    acceptRequest: (requestId, input = {}) =>
      app.acceptRequest(requestId, {
        ...input,
        actorUserId: session.actorUserId,
        metadata: mergeMetadata(session, input.metadata),
      }),
    rejectRequest: (requestId, input = {}) =>
      app.rejectRequest(requestId, {
        ...input,
        actorUserId: session.actorUserId,
        metadata: mergeMetadata(session, input.metadata),
      }),
    sendChatMessage: (chatId, input) =>
      app.sendChatMessage(chatId, {
        ...input,
        actorUserId: session.actorUserId,
        metadata: mergeMetadata(session, input.metadata),
      }),
    createCircle: (input) =>
      app.createCircle({
        ...input,
        actorUserId: session.actorUserId,
        metadata: mergeMetadata(session, input.metadata),
      }),
    joinCircle: (circleId, input) =>
      app.joinCircle(circleId, {
        ...input,
        actorUserId: session.actorUserId,
        metadata: mergeMetadata(session, input.metadata),
      }),
    leaveCircle: (circleId, input) =>
      app.leaveCircle(circleId, {
        ...input,
        actorUserId: session.actorUserId,
        metadata: mergeMetadata(session, input.metadata),
      }),
  };
}

export function createProtocolAgentClientFromBaseUrl(
  baseUrl: string,
  session: ProtocolAgentSession,
  fetchImpl?: typeof fetch,
): ProtocolAgentClient {
  return bindProtocolAgentClient(
    createBoundProtocolAppClientFromBaseUrl(baseUrl, session, fetchImpl),
    session,
  );
}
