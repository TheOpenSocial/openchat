import { useSyncExternalStore } from "react";

type ActivityState = {
  hasUnread: boolean;
  pendingRequestCount: number;
  unreadNotificationCount: number;
  lastHydratedAt: string | null;
};

type ActivityActions = {
  setActivityState: (patch: Partial<ActivityState>) => void;
  resetActivity: () => void;
};

type ActivityStore = ActivityState & ActivityActions;

const defaultState: ActivityState = {
  hasUnread: false,
  pendingRequestCount: 0,
  unreadNotificationCount: 0,
  lastHydratedAt: null,
};

let state: ActivityState = defaultState;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

function setState(patch: Partial<ActivityState>) {
  state = { ...state, ...patch };
  storeSnapshot = { ...state, ...actions };
  emit();
}

const actions: ActivityActions = {
  setActivityState(patch) {
    setState(patch);
  },
  resetActivity() {
    setState(defaultState);
  },
};

let storeSnapshot: ActivityStore = { ...state, ...actions };
const defaultSnapshot: ActivityStore = { ...defaultState, ...actions };

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useActivityStore<T>(selector: (store: ActivityStore) => T): T {
  return useSyncExternalStore(
    subscribe,
    () => selector(storeSnapshot),
    () => selector(defaultSnapshot),
  );
}
