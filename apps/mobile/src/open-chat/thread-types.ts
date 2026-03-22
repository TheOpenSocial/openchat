import type { PendingIntentsSummaryResponse } from "../lib/api";
import type { AgentTimelineMessage } from "../types";

export type ThreadPhase =
  | "empty"
  | "active"
  | "partial"
  | "ready"
  | "no_match"
  | "follow_up";

export function hasUserTurn(messages: AgentTimelineMessage[]) {
  return messages.some((m) => m.role === "user");
}

export function deriveThreadPhase(
  messages: AgentTimelineMessage[],
  pending: PendingIntentsSummaryResponse | null,
  sending: boolean,
  threadLoading: boolean,
): ThreadPhase {
  const userTurn = hasUserTurn(messages);
  if (!userTurn) {
    return "empty";
  }
  if (sending || threadLoading) {
    return "active";
  }
  if (!pending?.intents.length) {
    return "follow_up";
  }

  let totalAccepted = 0;
  let totalPending = 0;
  for (const row of pending.intents) {
    totalAccepted += row.requests.accepted;
    totalPending += row.requests.pending;
  }

  if (totalAccepted >= 2) {
    return "ready";
  }
  if (totalAccepted === 1 && totalPending === 0) {
    return "partial";
  }
  if (
    totalAccepted === 0 &&
    totalPending === 0 &&
    pending.activeIntentCount === 0
  ) {
    return "no_match";
  }
  return "active";
}

export function compactProgressHint(
  pending: PendingIntentsSummaryResponse | null,
): string | null {
  if (!pending) return null;
  if (pending.summaryText?.trim()) {
    return pending.summaryText.trim();
  }
  if (!pending.intents.length) return null;
  const i = pending.intents[0];
  const { pending: p, accepted: a } = i.requests;
  if (a > 0 && p > 0) {
    return `${a} accepted · ${p} pending`;
  }
  if (a > 0) {
    return `${a} accepted`;
  }
  if (p > 0) {
    return `${p} requests out`;
  }
  return null;
}
