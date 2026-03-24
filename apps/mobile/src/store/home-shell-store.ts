import { useSyncExternalStore } from "react";

import type { HomeTab } from "../types";

type BannerState = {
  tone: "info" | "error" | "success";
  text: string;
} | null;

type HomeShellState = {
  activeTab: HomeTab;
  banner: BannerState;
  draftIntentText: string;
  draftChatMessage: string;
  devOrbOpen: boolean;
  devOrbUnlocked: boolean;
};

type HomeShellActions = {
  setActiveTab: (tab: HomeTab) => void;
  setBanner: (banner: BannerState) => void;
  setDraftIntentText: (value: string) => void;
  setDraftChatMessage: (value: string) => void;
  setDevOrbOpen: (value: boolean) => void;
  setDevOrbUnlocked: (value: boolean) => void;
  resetShell: () => void;
};

type HomeShellStore = HomeShellState & HomeShellActions;

const defaultState: HomeShellState = {
  activeTab: "home",
  banner: null,
  draftIntentText: "",
  draftChatMessage: "",
  devOrbOpen: false,
  devOrbUnlocked: false,
};

let state: HomeShellState = defaultState;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => {
    listener();
  });
}

function setState(patch: Partial<HomeShellState>) {
  const next = { ...state, ...patch };
  state = next;
  emit();
}

const actions: HomeShellActions = {
  setActiveTab(tab) {
    setState({ activeTab: tab });
  },
  setBanner(banner) {
    setState({ banner });
  },
  setDraftIntentText(value) {
    setState({ draftIntentText: value });
  },
  setDraftChatMessage(value) {
    setState({ draftChatMessage: value });
  },
  setDevOrbOpen(value) {
    setState({ devOrbOpen: value });
  },
  setDevOrbUnlocked(value) {
    setState({ devOrbUnlocked: value });
  },
  resetShell() {
    setState(defaultState);
  },
};

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useHomeShellStore<T>(
  selector: (store: HomeShellStore) => T,
): T {
  return useSyncExternalStore(
    subscribe,
    () => selector({ ...state, ...actions }),
    () => selector({ ...defaultState, ...actions }),
  );
}
