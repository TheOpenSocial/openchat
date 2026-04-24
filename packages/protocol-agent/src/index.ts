import {
  type ProtocolAppClient,
  type ProtocolAppSession,
  createBoundProtocolAppClientFromBaseUrl,
  loadProtocolAppOperationalSnapshot,
} from "@opensocial/protocol-client";
import type {
  ProtocolAppOperationalSnapshot,
  ProtocolChatCreateAction as ProtocolChatCreateInput,
  ProtocolChatActionResult,
  ProtocolChatSendMessageAction as ProtocolChatSendMessageInput,
  ProtocolConnectionCreateAction as ProtocolConnectionCreateInput,
  ProtocolCircleCreateAction as ProtocolCircleCreateInput,
  ProtocolCircleJoinAction as ProtocolCircleJoinInput,
  ProtocolCircleLeaveAction as ProtocolCircleLeaveInput,
  ProtocolIntentActionResult,
  ProtocolIntentCancelAction as ProtocolIntentCancelInput,
  ProtocolIntentCreateAction as ProtocolIntentCreateInput,
  ProtocolIntentUpdateAction as ProtocolIntentUpdateInput,
  ProtocolJsonObject,
  ProtocolJsonValue,
  ProtocolRequestActionResult,
  ProtocolRequestDecisionAction as ProtocolRequestDecisionInput,
  ProtocolIntentRequestSendAction as ProtocolRequestSendInput,
} from "@opensocial/protocol-types";

export type ProtocolAgentSession = ProtocolAppSession & {
  actorUserId: string;
  agentId?: string;
  metadata?: ProtocolJsonObject;
};

export type ProtocolAgentReadinessIssueCode =
  | "auth_failures_present"
  | "dead_letters_present"
  | "retrying_deliveries_present"
  | "queued_backlog_present"
  | "token_rotation_due_soon"
  | "token_rotation_stale"
  | "no_active_grants"
  | "no_executable_grants"
  | "pending_consent_requests";

export type ProtocolAgentReadinessIssue = {
  code: ProtocolAgentReadinessIssueCode;
  severity: "warning" | "blocking";
  message: string;
};

export type ProtocolAgentReadinessReport = {
  ok: boolean;
  issues: ProtocolAgentReadinessIssue[];
  snapshot: ProtocolAppOperationalSnapshot;
};

export type ProtocolAgentReadinessOptions = {
  actorUserId?: string;
  requireActiveGrant?: boolean;
  failOnDeadLetters?: boolean;
  failOnAuthFailures?: boolean;
  failOnQueuedBacklog?: boolean;
  failOnStaleToken?: boolean;
  queuedBacklogThreshold?: number;
};

export type ProtocolAgentClient = {
  inspectReadiness: () => Promise<ProtocolAppOperationalSnapshot>;
  checkReadiness: (
    options?: ProtocolAgentReadinessOptions,
  ) => Promise<ProtocolAgentReadinessReport>;
  assertReady: (
    options?: ProtocolAgentReadinessOptions,
  ) => Promise<ProtocolAgentReadinessReport>;
  createIntent: (
    input: Omit<ProtocolIntentCreateInput, "actorUserId" | "metadata"> & {
      metadata?: ProtocolJsonObject;
    },
  ) => Promise<ProtocolIntentActionResult>;
  updateIntent: (
    intentId: string,
    input: Omit<ProtocolIntentUpdateInput, "actorUserId" | "metadata"> & {
      metadata?: ProtocolJsonObject;
    },
  ) => Promise<ProtocolIntentActionResult>;
  cancelIntent: (
    intentId: string,
    input?: Omit<ProtocolIntentCancelInput, "actorUserId" | "metadata"> & {
      metadata?: ProtocolJsonObject;
    },
  ) => Promise<ProtocolIntentActionResult>;
  sendRequest: (
    input: Omit<ProtocolRequestSendInput, "actorUserId" | "metadata"> & {
      metadata?: ProtocolJsonObject;
    },
  ) => Promise<ProtocolRequestActionResult>;
  acceptRequest: (
    requestId: string,
    input?: Omit<ProtocolRequestDecisionInput, "actorUserId" | "metadata"> & {
      metadata?: ProtocolJsonObject;
    },
  ) => Promise<ProtocolRequestActionResult>;
  rejectRequest: (
    requestId: string,
    input?: Omit<ProtocolRequestDecisionInput, "actorUserId" | "metadata"> & {
      metadata?: ProtocolJsonObject;
    },
  ) => Promise<ProtocolRequestActionResult>;
  createChat: (
    input: Omit<ProtocolChatCreateInput, "actorUserId" | "metadata"> & {
      metadata?: ProtocolJsonObject;
    },
  ) => Promise<ProtocolChatActionResult>;
  createConnection: (
    input: Omit<ProtocolConnectionCreateInput, "actorUserId" | "metadata"> & {
      metadata?: ProtocolJsonObject;
    },
  ) => ReturnType<ProtocolAppClient["createConnection"]>;
  sendChatMessage: (
    chatId: string,
    input: Omit<ProtocolChatSendMessageInput, "actorUserId" | "metadata"> & {
      metadata?: ProtocolJsonObject;
    },
  ) => ReturnType<ProtocolAppClient["sendChatMessage"]>;
  createCircle: (
    input: Omit<ProtocolCircleCreateInput, "actorUserId" | "metadata"> & {
      metadata?: ProtocolJsonObject;
    },
  ) => ReturnType<ProtocolAppClient["createCircle"]>;
  joinCircle: (
    circleId: string,
    input: Omit<ProtocolCircleJoinInput, "actorUserId" | "metadata"> & {
      metadata?: ProtocolJsonObject;
    },
  ) => ReturnType<ProtocolAppClient["joinCircle"]>;
  leaveCircle: (
    circleId: string,
    input: Omit<ProtocolCircleLeaveInput, "actorUserId" | "metadata"> & {
      metadata?: ProtocolJsonObject;
    },
  ) => ReturnType<ProtocolAppClient["leaveCircle"]>;
};

export type ProtocolAgentToolDefinition = {
  name: string;
  description: string;
  inputSchema: ProtocolJsonObject;
  invoke: (input?: ProtocolJsonObject) => Promise<ProtocolJsonValue>;
};

export type ProtocolAgentToolMap = Record<string, ProtocolAgentToolDefinition>;

export type ProtocolAgentToolkit = {
  session: ProtocolAgentSession;
  agent: ProtocolAgentClient;
  tools: ProtocolAgentToolDefinition[];
  toolsByName: ProtocolAgentToolMap;
};

export type ProtocolAgentToolSummary = Pick<
  ProtocolAgentToolDefinition,
  "name" | "description" | "inputSchema"
>;

export type ProtocolAgentToolkitSummary = {
  session: ProtocolAgentSession;
  toolCount: number;
  tools: ProtocolAgentToolSummary[];
};

const readinessOptionsSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    requireActiveGrant: { type: "boolean" },
    failOnDeadLetters: { type: "boolean" },
    failOnAuthFailures: { type: "boolean" },
    failOnQueuedBacklog: { type: "boolean" },
    failOnStaleToken: { type: "boolean" },
    queuedBacklogThreshold: { type: "integer", minimum: 0 },
  },
} satisfies ProtocolJsonObject;

const metadataSchema = {
  type: "object",
  additionalProperties: true,
} satisfies ProtocolJsonObject;

function readProtocolAgentToolInput<T extends ProtocolJsonObject>(
  input?: ProtocolJsonObject,
): T {
  if (input == null) {
    return {} as T;
  }
  if (typeof input !== "object" || Array.isArray(input)) {
    throw new Error("Protocol agent tool input must be an object.");
  }
  return input as T;
}

function mergeMetadata(
  session: ProtocolAgentSession,
  metadata?: ProtocolJsonObject,
): ProtocolJsonObject {
  return {
    ...(session.metadata ?? {}),
    ...(session.agentId ? { agentId: session.agentId } : {}),
    ...(metadata ?? {}),
  };
}

function formatIssues(issues: ProtocolAgentReadinessIssue[]): string {
  return issues.map((issue) => `${issue.code}: ${issue.message}`).join("; ");
}

function countAuthFailures(snapshot: ProtocolAppOperationalSnapshot): number {
  return Object.values(snapshot.usage.authFailureCounts).reduce(
    (total, count) => total + count,
    0,
  );
}

function countExecutableGrants(
  snapshot: ProtocolAppOperationalSnapshot,
  actorUserId?: string,
): number {
  return snapshot.grants.filter(
    (grant) =>
      grant.status === "active" &&
      grant.executionMode === "executable" &&
      grant.subjectType === "user" &&
      (actorUserId ? grant.subjectId === actorUserId : true),
  ).length;
}

function countModeledOnlyGrants(
  snapshot: ProtocolAppOperationalSnapshot,
): number {
  return snapshot.grants.filter(
    (grant) =>
      grant.status === "active" && grant.executionMode === "modeled_only",
  ).length;
}

export function evaluateProtocolAgentReadiness(
  snapshot: ProtocolAppOperationalSnapshot,
  options: ProtocolAgentReadinessOptions = {},
): ProtocolAgentReadinessReport {
  const requireActiveGrant = options.requireActiveGrant ?? true;
  const failOnDeadLetters = options.failOnDeadLetters ?? true;
  const failOnAuthFailures = options.failOnAuthFailures ?? true;
  const failOnQueuedBacklog = options.failOnQueuedBacklog ?? false;
  const failOnStaleToken = options.failOnStaleToken ?? false;
  const queuedBacklogThreshold = options.queuedBacklogThreshold ?? 10;

  const issues: ProtocolAgentReadinessIssue[] = [];

  const authFailureCount = countAuthFailures(snapshot);

  if (failOnAuthFailures && authFailureCount > 0) {
    issues.push({
      code: "auth_failures_present",
      severity: "blocking",
      message: `Recent auth failures: ${authFailureCount}`,
    });
  }

  if (failOnDeadLetters && snapshot.queue.deadLetteredCount > 0) {
    issues.push({
      code: "dead_letters_present",
      severity: "blocking",
      message: `Dead-lettered deliveries present: ${snapshot.queue.deadLetteredCount}`,
    });
  }

  if (snapshot.queue.failedCount > 0 || snapshot.queue.inFlightCount > 0) {
    issues.push({
      code: "retrying_deliveries_present",
      severity: "warning",
      message: `Active or failed deliveries present: inFlight=${snapshot.queue.inFlightCount}, failed=${snapshot.queue.failedCount}`,
    });
  }

  if (
    failOnQueuedBacklog &&
    snapshot.queue.queuedCount >= queuedBacklogThreshold
  ) {
    issues.push({
      code: "queued_backlog_present",
      severity: "blocking",
      message: `Queued delivery backlog is ${snapshot.queue.queuedCount}`,
    });
  }

  if (snapshot.usage.tokenAudit.freshness === "stale") {
    issues.push({
      code: "token_rotation_stale",
      severity: failOnStaleToken ? "blocking" : "warning",
      message: `App token is ${snapshot.usage.tokenAudit.tokenAgeDays} days old and outside the ${snapshot.usage.tokenAudit.rotationWindowDays}-day recommended rotation window.`,
    });
  } else if (snapshot.usage.tokenAudit.freshness === "rotate_soon") {
    issues.push({
      code: "token_rotation_due_soon",
      severity: "warning",
      message: `App token should rotate soon; recommended rotation date is ${snapshot.usage.tokenAudit.recommendedRotateBy}.`,
    });
  }

  const executableGrantCount = countExecutableGrants(
    snapshot,
    options.actorUserId,
  );
  const modeledOnlyGrantCount = countModeledOnlyGrants(snapshot);

  if (requireActiveGrant && executableGrantCount === 0) {
    issues.push({
      code:
        modeledOnlyGrantCount > 0 ? "no_executable_grants" : "no_active_grants",
      severity: "blocking",
      message:
        modeledOnlyGrantCount > 0
          ? `Only modeled-only delegated grants are present (${modeledOnlyGrantCount}); executable user grants are still required.`
          : "No active delegated grants are present for this app.",
    });
  }

  if (
    snapshot.consentRequests.some((request) => request.status === "pending")
  ) {
    issues.push({
      code: "pending_consent_requests",
      severity: "warning",
      message:
        "Pending consent requests exist and may still block delegated actions.",
    });
  }

  return {
    ok: !issues.some((issue) => issue.severity === "blocking"),
    issues,
    snapshot,
  };
}

export function assertProtocolAgentReady(
  report: ProtocolAgentReadinessReport,
): ProtocolAgentReadinessReport {
  if (!report.ok) {
    throw new Error(
      `Protocol agent readiness check failed: ${formatIssues(report.issues)}`,
    );
  }
  return report;
}

export function bindProtocolAgentClient(
  app: ProtocolAppClient,
  session: ProtocolAgentSession,
): ProtocolAgentClient {
  return {
    inspectReadiness: () => loadProtocolAppOperationalSnapshot(app),
    checkReadiness: async (options) =>
      evaluateProtocolAgentReadiness(
        await loadProtocolAppOperationalSnapshot(app),
        { ...options, actorUserId: session.actorUserId },
      ),
    assertReady: async (options) =>
      assertProtocolAgentReady(
        evaluateProtocolAgentReadiness(
          await loadProtocolAppOperationalSnapshot(app),
          { ...options, actorUserId: session.actorUserId },
        ),
      ),
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
    createChat: (input) =>
      app.createChat({
        ...input,
        actorUserId: session.actorUserId,
        metadata: mergeMetadata(session, input.metadata),
      }),
    createConnection: (input) =>
      app.createConnection({
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

export function createProtocolAgentToolset(
  agent: ProtocolAgentClient,
): ProtocolAgentToolDefinition[] {
  return [
    {
      name: "protocol_agent_assert_ready",
      description:
        "Fail fast when auth, grants, consent, or delivery health block protocol agent work.",
      inputSchema: readinessOptionsSchema,
      invoke: (input) =>
        agent.assertReady(
          readProtocolAgentToolInput<ProtocolAgentReadinessOptions>(input),
        ),
    },
    {
      name: "protocol_agent_create_intent",
      description:
        "Create a new coordination intent through the OpenSocial protocol.",
      inputSchema: {
        type: "object",
        required: ["rawText"],
        additionalProperties: false,
        properties: {
          rawText: { type: "string", minLength: 1 },
          agentThreadId: { type: "string" },
          traceId: { type: "string" },
          metadata: metadataSchema,
        },
      },
      invoke: (input) =>
        agent.createIntent(
          readProtocolAgentToolInput<
            Omit<ProtocolIntentCreateInput, "actorUserId" | "metadata"> & {
              metadata?: ProtocolJsonObject;
            }
          >(input),
        ),
    },
    {
      name: "protocol_agent_update_intent",
      description:
        "Update the user-owned text of an existing coordination intent.",
      inputSchema: {
        type: "object",
        required: ["intentId", "rawText"],
        additionalProperties: false,
        properties: {
          intentId: { type: "string" },
          rawText: { type: "string", minLength: 1 },
          metadata: metadataSchema,
        },
      },
      invoke: (input) => {
        const payload = readProtocolAgentToolInput<{
          intentId: string;
          rawText: string;
          metadata?: ProtocolJsonObject;
        }>(input);
        return agent.updateIntent(payload.intentId, {
          rawText: payload.rawText,
          metadata: payload.metadata,
        });
      },
    },
    {
      name: "protocol_agent_cancel_intent",
      description:
        "Cancel a user-owned coordination intent and stop associated request flow.",
      inputSchema: {
        type: "object",
        required: ["intentId"],
        additionalProperties: false,
        properties: {
          intentId: { type: "string" },
          agentThreadId: { type: "string" },
          metadata: metadataSchema,
        },
      },
      invoke: (input) => {
        const payload = readProtocolAgentToolInput<{
          intentId: string;
          agentThreadId?: string;
          metadata?: ProtocolJsonObject;
        }>(input);
        return agent.cancelIntent(payload.intentId, {
          agentThreadId: payload.agentThreadId,
          metadata: payload.metadata,
        });
      },
    },
    {
      name: "protocol_agent_send_request",
      description:
        "Send a coordination request from the current actor to a recipient for an intent.",
      inputSchema: {
        type: "object",
        required: ["intentId", "recipientUserId"],
        additionalProperties: false,
        properties: {
          intentId: { type: "string" },
          recipientUserId: { type: "string" },
          agentThreadId: { type: "string" },
          traceId: { type: "string" },
          metadata: metadataSchema,
        },
      },
      invoke: (input) =>
        agent.sendRequest(
          readProtocolAgentToolInput<
            Omit<ProtocolRequestSendInput, "actorUserId" | "metadata"> & {
              metadata?: ProtocolJsonObject;
            }
          >(input),
        ),
    },
    {
      name: "protocol_agent_accept_request",
      description:
        "Accept a received coordination request through the OpenSocial protocol.",
      inputSchema: {
        type: "object",
        required: ["requestId"],
        additionalProperties: false,
        properties: {
          requestId: { type: "string" },
          metadata: metadataSchema,
        },
      },
      invoke: (input) => {
        const payload = readProtocolAgentToolInput<{
          requestId: string;
          metadata?: ProtocolJsonObject;
        }>(input);
        return agent.acceptRequest(payload.requestId, {
          metadata: payload.metadata,
        });
      },
    },
    {
      name: "protocol_agent_reject_request",
      description:
        "Reject a received coordination request through the OpenSocial protocol.",
      inputSchema: {
        type: "object",
        required: ["requestId"],
        additionalProperties: false,
        properties: {
          requestId: { type: "string" },
          metadata: metadataSchema,
        },
      },
      invoke: (input) => {
        const payload = readProtocolAgentToolInput<{
          requestId: string;
          metadata?: ProtocolJsonObject;
        }>(input);
        return agent.rejectRequest(payload.requestId, {
          metadata: payload.metadata,
        });
      },
    },
    {
      name: "protocol_agent_create_chat",
      description:
        "Create a direct or group chat on top of an existing connection through the OpenSocial protocol.",
      inputSchema: {
        type: "object",
        required: ["connectionId", "type"],
        additionalProperties: false,
        properties: {
          connectionId: { type: "string" },
          type: { type: "string", enum: ["dm", "group"] },
          metadata: metadataSchema,
        },
      },
      invoke: (input) =>
        agent.createChat(
          readProtocolAgentToolInput<
            Omit<ProtocolChatCreateInput, "actorUserId" | "metadata"> & {
              metadata?: ProtocolJsonObject;
            }
          >(input),
        ),
    },
    {
      name: "protocol_agent_create_connection",
      description:
        "Create a direct or group connection through the OpenSocial protocol.",
      inputSchema: {
        type: "object",
        required: ["type"],
        additionalProperties: false,
        properties: {
          type: { type: "string", enum: ["dm", "group"] },
          originIntentId: { type: "string" },
          metadata: metadataSchema,
        },
      },
      invoke: (input) =>
        agent.createConnection(
          readProtocolAgentToolInput<
            Omit<ProtocolConnectionCreateInput, "actorUserId" | "metadata"> & {
              metadata?: ProtocolJsonObject;
            }
          >(input),
        ),
    },
    {
      name: "protocol_agent_send_chat_message",
      description:
        "Send a chat message into an existing chat through the OpenSocial protocol.",
      inputSchema: {
        type: "object",
        required: ["chatId", "body"],
        additionalProperties: false,
        properties: {
          chatId: { type: "string" },
          body: { type: "string", minLength: 1 },
          clientMessageId: { type: "string" },
          replyToMessageId: { type: "string" },
          metadata: metadataSchema,
        },
      },
      invoke: (input) => {
        const payload = readProtocolAgentToolInput<{
          chatId: string;
          body: string;
          clientMessageId?: string;
          replyToMessageId?: string;
          metadata?: ProtocolJsonObject;
        }>(input);
        return agent.sendChatMessage(payload.chatId, {
          body: payload.body,
          clientMessageId: payload.clientMessageId,
          replyToMessageId: payload.replyToMessageId,
          metadata: payload.metadata,
        });
      },
    },
    {
      name: "protocol_agent_create_circle",
      description:
        "Create a recurring coordination circle through the OpenSocial protocol.",
      inputSchema: {
        type: "object",
        required: ["title", "cadence"],
        additionalProperties: false,
        properties: {
          title: { type: "string", minLength: 1 },
          description: { type: "string" },
          visibility: { type: "string" },
          topicTags: { type: "array", items: { type: "string" } },
          targetSize: { type: "integer", minimum: 2 },
          kickoffPrompt: { type: "string" },
          cadence: {
            type: "object",
            additionalProperties: false,
            required: ["kind", "days", "hour", "minute", "timezone"],
            properties: {
              kind: { type: "string" },
              days: { type: "array", items: { type: "string" } },
              hour: { type: "integer", minimum: 0, maximum: 23 },
              minute: { type: "integer", minimum: 0, maximum: 59 },
              timezone: { type: "string" },
              intervalWeeks: { type: "integer", minimum: 1 },
            },
          },
          metadata: metadataSchema,
        },
      },
      invoke: (input) =>
        agent.createCircle(
          readProtocolAgentToolInput<
            Omit<ProtocolCircleCreateInput, "actorUserId" | "metadata"> & {
              metadata?: ProtocolJsonObject;
            }
          >(input),
        ),
    },
    {
      name: "protocol_agent_join_circle",
      description:
        "Join or add a member to an existing recurring coordination circle.",
      inputSchema: {
        type: "object",
        required: ["circleId", "memberUserId"],
        additionalProperties: false,
        properties: {
          circleId: { type: "string" },
          memberUserId: { type: "string" },
          role: { type: "string", enum: ["admin", "member"] },
          metadata: metadataSchema,
        },
      },
      invoke: (input) => {
        const payload = readProtocolAgentToolInput<{
          circleId: string;
          memberUserId: string;
          role?: "admin" | "member";
          metadata?: ProtocolJsonObject;
        }>(input);
        return agent.joinCircle(payload.circleId, {
          memberUserId: payload.memberUserId,
          role: payload.role ?? "member",
          metadata: payload.metadata,
        });
      },
    },
    {
      name: "protocol_agent_leave_circle",
      description:
        "Leave or remove a member from an existing recurring coordination circle.",
      inputSchema: {
        type: "object",
        required: ["circleId", "memberUserId"],
        additionalProperties: false,
        properties: {
          circleId: { type: "string" },
          memberUserId: { type: "string" },
          metadata: metadataSchema,
        },
      },
      invoke: (input) => {
        const payload = readProtocolAgentToolInput<{
          circleId: string;
          memberUserId: string;
          metadata?: ProtocolJsonObject;
        }>(input);
        return agent.leaveCircle(payload.circleId, {
          memberUserId: payload.memberUserId,
          metadata: payload.metadata,
        });
      },
    },
  ];
}

export function indexProtocolAgentToolset(
  tools: ProtocolAgentToolDefinition[],
): ProtocolAgentToolMap {
  return Object.fromEntries(tools.map((tool) => [tool.name, tool]));
}

export function createProtocolAgentToolkit(
  agent: ProtocolAgentClient,
  session: ProtocolAgentSession,
): ProtocolAgentToolkit {
  const tools = createProtocolAgentToolset(agent);
  return {
    session,
    agent,
    tools,
    toolsByName: indexProtocolAgentToolset(tools),
  };
}

export function listProtocolAgentTools(
  toolkit: ProtocolAgentToolkit,
): ProtocolAgentToolSummary[] {
  return toolkit.tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
  }));
}

export function describeProtocolAgentToolkit(
  toolkit: ProtocolAgentToolkit,
): ProtocolAgentToolkitSummary {
  return {
    session: toolkit.session,
    toolCount: toolkit.tools.length,
    tools: listProtocolAgentTools(toolkit),
  };
}

export function getProtocolAgentTool(
  toolkit: ProtocolAgentToolkit,
  toolName: string,
): ProtocolAgentToolDefinition {
  const tool = toolkit.toolsByName[toolName];
  if (!tool) {
    const available = Object.keys(toolkit.toolsByName).sort().join(", ");
    throw new Error(
      `Unknown protocol agent tool "${toolName}". Available tools: ${available}`,
    );
  }
  return tool;
}

export async function invokeProtocolAgentTool(
  toolkit: ProtocolAgentToolkit,
  toolName: string,
  input?: ProtocolJsonObject,
): Promise<ProtocolJsonValue> {
  return getProtocolAgentTool(toolkit, toolName).invoke(input);
}

export function createProtocolAgentToolkitFromBaseUrl(
  baseUrl: string,
  session: ProtocolAgentSession,
  fetchImpl?: typeof fetch,
): ProtocolAgentToolkit {
  return createProtocolAgentToolkit(
    createProtocolAgentClientFromBaseUrl(baseUrl, session, fetchImpl),
    session,
  );
}
