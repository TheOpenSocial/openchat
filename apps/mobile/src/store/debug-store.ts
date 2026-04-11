import { useSyncExternalStore } from "react";

import type { RealtimeConnectionState } from "../lib/realtime";

export type RealtimeDiagnosticsEventSnapshot = {
  occurredAt: string;
  payload: Record<string, unknown> | null;
  name: string;
};

export type RealtimeDiagnosticsCounters = {
  byEvent: Record<string, number>;
  connectionStateChanges: number;
  total: number;
};

export type RealtimeDiagnosticsSnapshot = {
  connectionState: RealtimeConnectionState;
  counters: RealtimeDiagnosticsCounters;
  lastEvent: RealtimeDiagnosticsEventSnapshot | null;
  lastUpdatedAt: string | null;
};

type DebugState = {
  realtime: RealtimeDiagnosticsSnapshot;
};

type DebugActions = {
  recordRealtimeEvent: (input: {
    name: string;
    payload?: Record<string, unknown> | null;
    occurredAt?: string;
  }) => void;
  setRealtimeConnectionState: (state: RealtimeConnectionState) => void;
  resetDebug: () => void;
};

type DebugStore = DebugState & DebugActions;

const defaultCounters: RealtimeDiagnosticsCounters = {
  byEvent: {},
  connectionStateChanges: 0,
  total: 0,
};

const defaultState: DebugState = {
  realtime: {
    connectionState: "offline",
    counters: defaultCounters,
    lastEvent: null,
    lastUpdatedAt: null,
  },
};

let state: DebugState = defaultState;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => {
    listener();
  });
}

function now() {
  return new Date().toISOString();
}

function setState(patch: Partial<DebugState>) {
  state = { ...state, ...patch };
  storeSnapshot = { ...state, ...actions };
  emit();
}

function updateRealtime(
  updater: (
    current: RealtimeDiagnosticsSnapshot,
  ) => RealtimeDiagnosticsSnapshot,
) {
  setState({
    realtime: updater(state.realtime),
  });
}

function cloneCounters(counters: RealtimeDiagnosticsCounters) {
  return {
    byEvent: { ...counters.byEvent },
    connectionStateChanges: counters.connectionStateChanges,
    total: counters.total,
  };
}

const actions: DebugActions = {
  recordRealtimeEvent(input) {
    const occurredAt = input.occurredAt ?? now();
    updateRealtime((current) => {
      const counters = cloneCounters(current.counters);
      counters.total += 1;
      counters.byEvent[input.name] = (counters.byEvent[input.name] ?? 0) + 1;

      return {
        ...current,
        counters,
        lastEvent: {
          name: input.name,
          occurredAt,
          payload: input.payload ?? null,
        },
        lastUpdatedAt: occurredAt,
      };
    });
  },
  setRealtimeConnectionState(nextState) {
    const occurredAt = now();
    updateRealtime((current) => {
      const counters = cloneCounters(current.counters);
      if (current.connectionState !== nextState) {
        counters.connectionStateChanges += 1;
      }

      return {
        ...current,
        connectionState: nextState,
        counters,
        lastUpdatedAt: occurredAt,
      };
    });
  },
  resetDebug() {
    setState({
      realtime: {
        ...defaultState.realtime,
        counters: cloneCounters(defaultCounters),
      },
    });
  },
};

let storeSnapshot: DebugStore = { ...state, ...actions };
const defaultSnapshot: DebugStore = { ...defaultState, ...actions };

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useDebugStore<T>(selector: (store: DebugStore) => T): T {
  return useSyncExternalStore(
    subscribe,
    () => selector(storeSnapshot),
    () => selector(defaultSnapshot),
  );
}
