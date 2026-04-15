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

export type ProtocolAgentReadinessIssueCode =
  | "auth_failures_present"
  | "dead_letters_present"
  | "retrying_deliveries_present"
  | "queued_backlog_present"
  | "no_active_grants"
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
  requireActiveGrant?: boolean;
  failOnDeadLetters?: boolean;
  failOnAuthFailures?: boolean;
  failOnQueuedBacklog?: boolean;
  queuedBacklogThreshold?: number;
};

export type ProtocolAgentClient = {
  inspectReadiness: () => Promise<ProtocolAppOperationalSnapshot>;
  checkReadiness: (
    options?: ProtocolAgentReadinessOptions,
  ) => Promise<ProtocolAgentReadinessReport>;
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

function formatIssues(issues: ProtocolAgentReadinessIssue[]): string {
  return issues.map((issue) => `${issue.code}: ${issue.message}`).join("; ");
}

export function evaluateProtocolAgentReadiness(
  snapshot: ProtocolAppOperationalSnapshot,
  options: ProtocolAgentReadinessOptions = {},
): ProtocolAgentReadinessReport {
  const requireActiveGrant = options.requireActiveGrant ?? true;
  const failOnDeadLetters = options.failOnDeadLetters ?? true;
  const failOnAuthFailures = options.failOnAuthFailures ?? true;
  const failOnQueuedBacklog = options.failOnQueuedBacklog ?? false;
  const queuedBacklogThreshold = options.queuedBacklogThreshold ?? 10;

  const issues: ProtocolAgentReadinessIssue[] = [];

  if (failOnAuthFailures && snapshot.usage.authFailures.total > 0) {
    issues.push({
      code: "auth_failures_present",
      severity: "blocking",
      message: `Recent auth failures: ${snapshot.usage.authFailures.total}`,
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

  if (requireActiveGrant && snapshot.grants.length === 0) {
    issues.push({
      code: "no_active_grants",
      severity: "blocking",
      message: "No active delegated grants are present for this app.",
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
        options,
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
