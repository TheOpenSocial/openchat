import { useSyncExternalStore } from "react";

import type { NotificationRouteIntent } from "../features/notifications/domain/notification-route-intent";

export type PushPermissionStatus =
  | "unknown"
  | "undetermined"
  | "granted"
  | "denied";

export type PushEventKind =
  | "permission"
  | "registration"
  | "received"
  | "response"
  | "route-intent"
  | "error";

export type PushEventSnapshot = {
  kind: PushEventKind;
  occurredAt: string;
  details: Record<string, unknown> | null;
};

export type PushNotificationSnapshot = {
  body: string | null;
  data: Record<string, unknown>;
  notificationId: string | null;
  routeIntent: NotificationRouteIntent | null;
  title: string | null;
};

export type PushNotificationResponseSnapshot = PushNotificationSnapshot & {
  actionIdentifier: string;
};

type PushState = {
  permissionStatus: PushPermissionStatus;
  pushEnabled: boolean;
  pushToken: string | null;
  pushTokenUpdatedAt: string | null;
  lastEvent: PushEventSnapshot | null;
  lastReceivedEvent: PushNotificationSnapshot | null;
  lastResponseEvent: PushNotificationResponseSnapshot | null;
  lastRouteIntent: NotificationRouteIntent | null;
  lastError: string | null;
};

type PushActions = {
  setPermissionStatus: (status: PushPermissionStatus) => void;
  setPushRegistration: (input: {
    enabled: boolean;
    token: string | null;
    permissionStatus?: PushPermissionStatus;
  }) => void;
  recordPushEvent: (event: PushEventSnapshot) => void;
  setLastReceivedEvent: (event: PushNotificationSnapshot | null) => void;
  setLastResponseEvent: (
    event: PushNotificationResponseSnapshot | null,
  ) => void;
  setLastRouteIntent: (value: NotificationRouteIntent | null) => void;
  setLastError: (message: string | null) => void;
  resetPush: () => void;
};

type PushStore = PushState & PushActions;

const defaultState: PushState = {
  permissionStatus: "unknown",
  pushEnabled: false,
  pushToken: null,
  pushTokenUpdatedAt: null,
  lastEvent: null,
  lastReceivedEvent: null,
  lastResponseEvent: null,
  lastRouteIntent: null,
  lastError: null,
};

let state: PushState = defaultState;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => {
    listener();
  });
}

function setState(patch: Partial<PushState>) {
  state = { ...state, ...patch };
  storeSnapshot = { ...state, ...actions };
  emit();
}

function now() {
  return new Date().toISOString();
}

const actions: PushActions = {
  setPermissionStatus(status) {
    setState({
      permissionStatus: status,
      lastEvent: {
        kind: "permission",
        occurredAt: now(),
        details: { status },
      },
    });
  },
  setPushRegistration(input) {
    const tokenChanged = input.token !== state.pushToken;
    const tokenUpdatedAt = tokenChanged ? now() : state.pushTokenUpdatedAt;
    setState({
      permissionStatus: input.permissionStatus ?? state.permissionStatus,
      pushEnabled: input.enabled,
      pushToken: input.token,
      pushTokenUpdatedAt: tokenUpdatedAt,
      lastEvent: {
        kind: "registration",
        occurredAt: now(),
        details: {
          enabled: input.enabled,
          permissionStatus: input.permissionStatus ?? state.permissionStatus,
          tokenPresent: input.token != null,
        },
      },
    });
  },
  recordPushEvent(event) {
    setState({
      lastEvent: event,
      ...(event.kind === "error"
        ? { lastError: String(event.details?.message ?? "Unknown error") }
        : {}),
    });
  },
  setLastReceivedEvent(event) {
    setState({
      lastReceivedEvent: event,
      lastRouteIntent: event?.routeIntent ?? state.lastRouteIntent,
      ...(event
        ? {
            lastEvent: {
              kind: "received",
              occurredAt: now(),
              details: {
                body: event.body,
                notificationId: event.notificationId,
                title: event.title,
              },
            },
          }
        : {}),
    });
  },
  setLastResponseEvent(event) {
    setState({
      lastResponseEvent: event,
      lastRouteIntent: event?.routeIntent ?? state.lastRouteIntent,
      ...(event
        ? {
            lastEvent: {
              kind: "response",
              occurredAt: now(),
              details: {
                actionIdentifier: event.actionIdentifier,
                notificationId: event.notificationId,
                title: event.title,
              },
            },
          }
        : {}),
    });
  },
  setLastRouteIntent(value) {
    setState({
      lastRouteIntent: value,
      ...(value
        ? {
            lastEvent: {
              kind: "route-intent",
              occurredAt: now(),
              details: { targetKind: value.target.kind },
            },
          }
        : {}),
    });
  },
  setLastError(message) {
    setState({
      lastError: message,
      ...(message
        ? {
            lastEvent: {
              kind: "error",
              occurredAt: now(),
              details: { message },
            },
          }
        : {}),
    });
  },
  resetPush() {
    setState({ ...defaultState });
  },
};

let storeSnapshot: PushStore = { ...state, ...actions };
const defaultSnapshot: PushStore = { ...defaultState, ...actions };

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function usePushStore<T>(selector: (store: PushStore) => T): T {
  return useSyncExternalStore(
    subscribe,
    () => selector(storeSnapshot),
    () => selector(defaultSnapshot),
  );
}
