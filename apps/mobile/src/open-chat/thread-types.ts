import type { PendingIntentsSummaryResponse } from "../lib/api";
import type { AgentTimelineMessage } from "../types";
import { THREAD_RUNTIME_COPY } from "./runtime-constants";

export type ThreadPhase =
  | "empty"
  | "active"
  | "partial"
  | "ready"
  | "no_match"
  | "follow_up";

export type ThreadRuntimeState =
  | "idle"
  | "sending"
  | "loading"
  | "matching"
  | "waiting"
  | "ready"
  | "no_match";

export type ThreadRuntimeModel = {
  phase: ThreadPhase;
  state: ThreadRuntimeState;
  contextLabel: string | null;
  hint: string | null;
  thinkingLabel: string | null;
};

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

export function deriveThreadRuntimeModel(
  messages: AgentTimelineMessage[],
  pending: PendingIntentsSummaryResponse | null,
  sending: boolean,
  threadLoading: boolean,
): ThreadRuntimeModel {
  const phase = deriveThreadPhase(messages, pending, sending, threadLoading);
  const hint = compactProgressHint(pending);

  if (!hasUserTurn(messages)) {
    return {
      phase,
      state: "idle",
      contextLabel: null,
      hint,
      thinkingLabel: null,
    };
  }

  if (sending) {
    return {
      phase,
      state: "sending",
      contextLabel: THREAD_RUNTIME_COPY.sending.contextLabel,
      hint,
      thinkingLabel: THREAD_RUNTIME_COPY.sending.thinkingLabel,
    };
  }

  if (threadLoading) {
    return {
      phase,
      state: "loading",
      contextLabel: THREAD_RUNTIME_COPY.loading.contextLabel,
      hint,
      thinkingLabel: THREAD_RUNTIME_COPY.loading.thinkingLabel,
    };
  }

  if (phase === "active") {
    return {
      phase,
      state: "matching",
      contextLabel: THREAD_RUNTIME_COPY.matching.contextLabel,
      hint,
      thinkingLabel: THREAD_RUNTIME_COPY.matching.thinkingLabel,
    };
  }

  if (phase === "partial") {
    return {
      phase,
      state: "waiting",
      contextLabel: hint
        ? THREAD_RUNTIME_COPY.waiting.contextLabelWithHint
        : THREAD_RUNTIME_COPY.waiting.contextLabelFallback,
      hint,
      thinkingLabel: THREAD_RUNTIME_COPY.waiting.thinkingLabel,
    };
  }

  if (phase === "ready") {
    return {
      phase,
      state: "ready",
      contextLabel: THREAD_RUNTIME_COPY.ready.contextLabel,
      hint,
      thinkingLabel: null,
    };
  }

  if (phase === "no_match") {
    return {
      phase,
      state: "no_match",
      contextLabel: THREAD_RUNTIME_COPY.noMatch.contextLabel,
      hint,
      thinkingLabel: null,
    };
  }

  return {
    phase,
    state: "idle",
    contextLabel: hint ? THREAD_RUNTIME_COPY.idle.contextLabelWithHint : null,
    hint,
    thinkingLabel: null,
  };
}
