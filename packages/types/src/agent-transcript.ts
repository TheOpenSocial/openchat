/**
 * Shared agent-thread → UI transcript mapping for web and mobile clients.
 * Aligns with `GET /api/agent/threads/:threadId/messages` message shape.
 */

export type AgentTranscriptBubbleRole =
  | "user"
  | "agent"
  | "workflow"
  | "system"
  | "error";

export interface AgentTranscriptRow {
  id: string;
  role: AgentTranscriptBubbleRole;
  body: string;
}

export interface AgentThreadMessageLike {
  id: string;
  role: string;
  content: string;
}

/** Optional metadata on persisted agent messages (workflow stages, trace correlation). */
export interface AgentThreadWorkflowMetadata {
  traceId?: string;
  stage?: string;
  details?: Record<string, unknown>;
}

/**
 * If this is a workflow `response_token` event for the given trace, returns the token chunk text.
 * Used when subscribing to `GET /api/agent/threads/:id/stream` during `respond/stream`.
 */
export function extractResponseTokenDelta(
  message: {
    role: string;
    content: string;
    metadata?: unknown;
  },
  traceId: string,
): string | null {
  if (message.role !== "workflow") {
    return null;
  }
  const meta = message.metadata as AgentThreadWorkflowMetadata | undefined;
  if (meta?.stage !== "response_token" || meta.traceId !== traceId) {
    return null;
  }
  return message.content ?? "";
}

export function normalizeAgentThreadMessageRole(
  role: string,
): AgentTranscriptBubbleRole {
  if (
    role === "user" ||
    role === "agent" ||
    role === "workflow" ||
    role === "system" ||
    role === "error"
  ) {
    return role;
  }
  return "agent";
}

export function agentThreadMessagesToTranscript(
  messages: AgentThreadMessageLike[],
): AgentTranscriptRow[] {
  return messages.map((message) => ({
    id: message.id,
    role: normalizeAgentThreadMessageRole(message.role),
    body: message.content,
  }));
}
