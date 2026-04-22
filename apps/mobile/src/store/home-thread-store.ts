import { useSyncExternalStore } from "react";

import type { AgentTimelineMessage } from "../types";

type SetStateAction<T> = T | ((prev: T) => T);

type OnboardingCarryoverState = "processing" | "queued" | "ready" | null;
type AgentComposerMode = "chat" | "intent";

type HomeThreadState = {
  draftIntentText: string;
  agentImageUrlDraft: string;
  onboardingCarryoverSeed: string;
  onboardingCarryoverIdempotencyKey: string | null;
  onboardingCarryoverState: OnboardingCarryoverState;
  sendingIntent: boolean;
  decomposeIntent: boolean;
  decomposeMaxIntents: number;
  agentComposerMode: AgentComposerMode;
  agentTimeline: AgentTimelineMessage[];
};

type HomeThreadActions = {
  setDraftIntentText: (value: SetStateAction<string>) => void;
  setAgentImageUrlDraft: (value: SetStateAction<string>) => void;
  setOnboardingCarryoverSeed: (value: SetStateAction<string>) => void;
  setOnboardingCarryoverIdempotencyKey: (
    value: SetStateAction<string | null>,
  ) => void;
  setOnboardingCarryoverState: (
    value: SetStateAction<OnboardingCarryoverState>,
  ) => void;
  setSendingIntent: (value: SetStateAction<boolean>) => void;
  setDecomposeIntent: (value: SetStateAction<boolean>) => void;
  setDecomposeMaxIntents: (value: SetStateAction<number>) => void;
  setAgentComposerMode: (value: SetStateAction<AgentComposerMode>) => void;
  setAgentTimeline: (value: SetStateAction<AgentTimelineMessage[]>) => void;
  resetHomeThread: (input?: {
    agentTimeline?: AgentTimelineMessage[];
    draftIntentText?: string;
    agentComposerMode?: AgentComposerMode;
  }) => void;
};

type HomeThreadStore = HomeThreadState & HomeThreadActions;

const defaultState: HomeThreadState = {
  draftIntentText: "",
  agentImageUrlDraft: "",
  onboardingCarryoverSeed: "",
  onboardingCarryoverIdempotencyKey: null,
  onboardingCarryoverState: null,
  sendingIntent: false,
  decomposeIntent: true,
  decomposeMaxIntents: 3,
  agentComposerMode: "intent",
  agentTimeline: [],
};

let state: HomeThreadState = defaultState;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

function resolveNext<T>(prev: T, value: SetStateAction<T>) {
  return typeof value === "function" ? (value as (prev: T) => T)(prev) : value;
}

function setState(patch: Partial<HomeThreadState>) {
  state = { ...state, ...patch };
  storeSnapshot = { ...state, ...actions };
  emit();
}

const actions: HomeThreadActions = {
  setDraftIntentText(value) {
    setState({ draftIntentText: resolveNext(state.draftIntentText, value) });
  },
  setAgentImageUrlDraft(value) {
    setState({
      agentImageUrlDraft: resolveNext(state.agentImageUrlDraft, value),
    });
  },
  setOnboardingCarryoverSeed(value) {
    setState({
      onboardingCarryoverSeed: resolveNext(
        state.onboardingCarryoverSeed,
        value,
      ),
    });
  },
  setOnboardingCarryoverIdempotencyKey(value) {
    setState({
      onboardingCarryoverIdempotencyKey: resolveNext(
        state.onboardingCarryoverIdempotencyKey,
        value,
      ),
    });
  },
  setOnboardingCarryoverState(value) {
    setState({
      onboardingCarryoverState: resolveNext(
        state.onboardingCarryoverState,
        value,
      ),
    });
  },
  setSendingIntent(value) {
    setState({ sendingIntent: resolveNext(state.sendingIntent, value) });
  },
  setDecomposeIntent(value) {
    setState({ decomposeIntent: resolveNext(state.decomposeIntent, value) });
  },
  setDecomposeMaxIntents(value) {
    setState({
      decomposeMaxIntents: resolveNext(state.decomposeMaxIntents, value),
    });
  },
  setAgentComposerMode(value) {
    setState({
      agentComposerMode: resolveNext(state.agentComposerMode, value),
    });
  },
  setAgentTimeline(value) {
    setState({ agentTimeline: resolveNext(state.agentTimeline, value) });
  },
  resetHomeThread(input) {
    setState({
      ...defaultState,
      ...(input?.agentTimeline ? { agentTimeline: input.agentTimeline } : {}),
      ...(input?.draftIntentText !== undefined
        ? { draftIntentText: input.draftIntentText }
        : {}),
      ...(input?.agentComposerMode
        ? { agentComposerMode: input.agentComposerMode }
        : {}),
    });
  },
};

let storeSnapshot: HomeThreadStore = { ...state, ...actions };
const defaultSnapshot: HomeThreadStore = { ...defaultState, ...actions };

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useHomeThreadStore<T>(
  selector: (store: HomeThreadStore) => T,
): T {
  return useSyncExternalStore(
    subscribe,
    () => selector(storeSnapshot),
    () => selector(defaultSnapshot),
  );
}
