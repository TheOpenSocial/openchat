import { useSyncExternalStore } from "react";

import type { InboxRequestRecord } from "../lib/api";

type InboxState = {
  lastHydratedAt: string | null;
  pendingRequestCount: number;
  requests: InboxRequestRecord[];
};

type InboxActions = {
  resetInbox: () => void;
  setRequests: (requests: InboxRequestRecord[]) => void;
  setPendingRequestCount: (count: number) => void;
  setLastHydratedAt: (value: string | null) => void;
};

type InboxStore = InboxState & InboxActions;

const defaultState: InboxState = {
  lastHydratedAt: null,
  pendingRequestCount: 0,
  requests: [],
};

let state: InboxState = defaultState;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => {
    listener();
  });
}

function countPendingRequests(requests: InboxRequestRecord[]) {
  return requests.reduce(
    (count, request) => count + (request.status === "pending" ? 1 : 0),
    0,
  );
}

function setState(patch: Partial<InboxState>) {
  state = { ...state, ...patch };
  storeSnapshot = { ...state, ...actions };
  emit();
}

const actions: InboxActions = {
  resetInbox() {
    setState(defaultState);
  },
  setRequests(requests) {
    setState({
      lastHydratedAt: new Date().toISOString(),
      pendingRequestCount: countPendingRequests(requests),
      requests,
    });
  },
  setPendingRequestCount(count) {
    setState({
      pendingRequestCount: Math.max(0, count),
      lastHydratedAt: new Date().toISOString(),
    });
  },
  setLastHydratedAt(value) {
    setState({ lastHydratedAt: value });
  },
};

let storeSnapshot: InboxStore = { ...state, ...actions };
const defaultSnapshot: InboxStore = { ...defaultState, ...actions };

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useInboxStore<T>(selector: (store: InboxStore) => T): T {
  return useSyncExternalStore(
    subscribe,
    () => selector(storeSnapshot),
    () => selector(defaultSnapshot),
  );
}
