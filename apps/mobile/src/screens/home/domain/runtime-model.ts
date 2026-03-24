import type { PendingIntentsSummaryResponse } from "../../../lib/api";
import type { AgentTimelineMessage } from "../../../types";
import {
  deriveThreadRuntimeModel,
  type ThreadRuntimeState,
} from "../../../open-chat/thread-types";
import type { HomeRuntimeState, HomeRuntimeViewModel } from "./types";

function mapThreadStateToHomeState(
  state: ThreadRuntimeState,
  hasError: boolean,
): HomeRuntimeState {
  if (hasError) {
    return "error";
  }
  switch (state) {
    case "sending":
      return "sending";
    case "loading":
      return "loading";
    case "matching":
      return "matching";
    case "waiting":
      return "waiting";
    case "ready":
      return "ready";
    case "no_match":
      return "no_match";
    default:
      return "idle";
  }
}

type DeriveHomeRuntimeViewModelInput = {
  messages: AgentTimelineMessage[];
  pending: PendingIntentsSummaryResponse | null;
  sending: boolean;
  threadLoading: boolean;
  hasDraft: boolean;
  hasError?: boolean;
  pendingUpdatesCount?: number;
};

export function deriveHomeRuntimeViewModel({
  messages,
  pending,
  sending,
  threadLoading,
  hasDraft,
  hasError = false,
  pendingUpdatesCount = 0,
}: DeriveHomeRuntimeViewModelInput): HomeRuntimeViewModel {
  const runtime = deriveThreadRuntimeModel(
    messages,
    pending,
    sending,
    threadLoading,
  );
  const state = mapThreadStateToHomeState(runtime.state, hasError);

  return {
    state,
    contextLabel: runtime.contextLabel,
    hint: runtime.hint,
    thinkingLabel: runtime.thinkingLabel,
    canSend: hasDraft && !sending,
    canRetry: state === "no_match" || state === "error",
    pendingUpdatesCount: Math.max(0, pendingUpdatesCount),
  };
}
