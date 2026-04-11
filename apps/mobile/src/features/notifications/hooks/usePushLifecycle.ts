import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";

import {
  registerNotificationListeners,
  registerForPushNotificationsAsync,
  type NotificationListenerEvent,
  type NotificationListenerResponseEvent,
  type PushRegistrationResult,
} from "../../../lib/notifications";
import type { NotificationRouteIntent } from "../domain/notification-route-intent";
import { usePushStore as useSharedPushStore } from "../../../store/push-store";

type PushPermissionStatus =
  | "idle"
  | "granted"
  | "denied"
  | "unavailable"
  | "error";

export type PushRouteIntent =
  | { kind: "activity" }
  | { kind: "connections" }
  | { kind: "discovery" }
  | { kind: "home" }
  | { kind: "inbox" }
  | { kind: "intent"; intentId: string }
  | { kind: "profile"; userId: string }
  | { kind: "recurringCircles" }
  | { kind: "savedSearches" }
  | { kind: "scheduledTasks" }
  | { kind: "settings" }
  | { kind: "chat"; chatId: string; connectionId?: string };

type PushState = {
  enabled: boolean;
  lastError: string | null;
  lastRegisteredAt: string | null;
  permissionStatus: PushPermissionStatus;
  token: string | null;
  userId: string | null;
};

type PushDebugState = {
  listenerState: "idle" | "listening" | "stopped";
  lastEventAt: string | null;
  lastNotificationBody: string | null;
  lastNotificationData: Record<string, unknown> | null;
  lastNotificationTitle: string | null;
  lastRouteIntent: PushRouteIntent | null;
  notificationReceivedCount: number;
  notificationResponseCount: number;
  registration: PushRegistrationResult | null;
};

type SetStateAction<T> = T | ((prev: T) => T);

type PushStore = PushState & {
  resetPush: () => void;
  setPushState: (value: SetStateAction<PushState>) => void;
};

type PushDebugStore = PushDebugState & {
  resetPushDebug: () => void;
  setPushDebugState: (value: SetStateAction<PushDebugState>) => void;
};

type UsePushLifecycleArgs = {
  enabled?: boolean;
  onRouteIntent?: (intent: PushRouteIntent) => void;
  userId: string;
};

const defaultPushState: PushState = {
  enabled: false,
  lastError: null,
  lastRegisteredAt: null,
  permissionStatus: "idle",
  token: null,
  userId: null,
};

const defaultPushDebugState: PushDebugState = {
  listenerState: "idle",
  lastEventAt: null,
  lastNotificationBody: null,
  lastNotificationData: null,
  lastNotificationTitle: null,
  lastRouteIntent: null,
  notificationReceivedCount: 0,
  notificationResponseCount: 0,
  registration: null,
};

let pushState: PushState = defaultPushState;
let pushDebugState: PushDebugState = defaultPushDebugState;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => {
    listener();
  });
}

function resolveNext<T>(prev: T, value: SetStateAction<T>) {
  return typeof value === "function" ? (value as (prev: T) => T)(prev) : value;
}

function setPushState(patch: Partial<PushState> | SetStateAction<PushState>) {
  pushState =
    typeof patch === "function"
      ? resolveNext(pushState, patch)
      : { ...pushState, ...patch };
  pushStoreSnapshot = { ...pushState, ...pushActions };
  emit();
}

function setPushDebugState(
  patch: Partial<PushDebugState> | SetStateAction<PushDebugState>,
) {
  pushDebugState =
    typeof patch === "function"
      ? resolveNext(pushDebugState, patch)
      : { ...pushDebugState, ...patch };
  pushDebugStoreSnapshot = { ...pushDebugState, ...pushDebugActions };
  emit();
}

const pushActions = {
  resetPush() {
    pushState = defaultPushState;
    pushStoreSnapshot = { ...pushState, ...pushActions };
    emit();
  },
  setPushState(value: SetStateAction<PushState>) {
    setPushState(value);
  },
};

const pushDebugActions = {
  resetPushDebug() {
    pushDebugState = defaultPushDebugState;
    pushDebugStoreSnapshot = { ...pushDebugState, ...pushDebugActions };
    emit();
  },
  setPushDebugState(value: SetStateAction<PushDebugState>) {
    setPushDebugState(value);
  },
};

let pushStoreSnapshot: PushStore = { ...pushState, ...pushActions };
const defaultPushStoreSnapshot: PushStore = {
  ...defaultPushState,
  ...pushActions,
};
let pushDebugStoreSnapshot: PushDebugStore = {
  ...pushDebugState,
  ...pushDebugActions,
};
const defaultPushDebugStoreSnapshot: PushDebugStore = {
  ...defaultPushDebugState,
  ...pushDebugActions,
};

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function usePushStore<T>(selector: (store: PushStore) => T): T {
  return useSyncExternalStore(
    subscribe,
    () => selector(pushStoreSnapshot),
    () => selector(defaultPushStoreSnapshot),
  );
}

export function usePushDebugStore<T>(
  selector: (store: PushDebugStore) => T,
): T {
  return useSyncExternalStore(
    subscribe,
    () => selector(pushDebugStoreSnapshot),
    () => selector(defaultPushDebugStoreSnapshot),
  );
}

function toPushRouteIntent(
  notificationRouteIntent: NotificationRouteIntent | null,
): PushRouteIntent | null {
  if (!notificationRouteIntent) {
    return null;
  }

  switch (notificationRouteIntent.target.kind) {
    case "activity":
      return { kind: "activity" };
    case "connections":
      return { kind: "connections" };
    case "discovery":
      return { kind: "discovery" };
    case "inbox":
      return { kind: "inbox" };
    case "intent":
      return {
        kind: "intent",
        intentId: notificationRouteIntent.target.intentId,
      };
    case "profile":
      return {
        kind: "profile",
        userId: notificationRouteIntent.target.userId,
      };
    case "recurringCircles":
      return { kind: "recurringCircles" };
    case "savedSearches":
      return { kind: "savedSearches" };
    case "scheduledTasks":
      return { kind: "scheduledTasks" };
    case "settings":
      return { kind: "settings" };
    case "chat":
      return { kind: "chat", chatId: notificationRouteIntent.target.chatId };
    default:
      return null;
  }
}

function toSharedReceivedEvent(event: NotificationListenerEvent) {
  return {
    body: event.body,
    data: event.data,
    notificationId: event.notificationId,
    routeIntent: event.routeIntent,
    title: event.title,
  };
}

function toSharedResponseEvent(event: NotificationListenerResponseEvent) {
  return {
    ...toSharedReceivedEvent(event),
    actionIdentifier: event.actionIdentifier,
  };
}

export function usePushLifecycle({
  enabled = true,
  onRouteIntent,
  userId,
}: UsePushLifecycleArgs) {
  const pushStore = usePushStore((store) => store);
  const pushDebugStore = usePushDebugStore((store) => store);
  const setPermissionStatus = useSharedPushStore(
    (store) => store.setPermissionStatus,
  );
  const setPushRegistration = useSharedPushStore(
    (store) => store.setPushRegistration,
  );
  const setLastReceivedEvent = useSharedPushStore(
    (store) => store.setLastReceivedEvent,
  );
  const setLastResponseEvent = useSharedPushStore(
    (store) => store.setLastResponseEvent,
  );
  const setLastError = useSharedPushStore((store) => store.setLastError);

  const onRouteIntentRef = useRef(onRouteIntent);

  useEffect(() => {
    onRouteIntentRef.current = onRouteIntent;
  }, [onRouteIntent]);

  useEffect(() => {
    if (!enabled) {
      setPushDebugState({ listenerState: "stopped" });
      return;
    }

    let cancelled = false;
    let listenerRemoval: (() => void) | null = null;

    const updateFromReceivedEvent = (
      notification: NotificationListenerEvent,
    ) => {
      const routeIntent = toPushRouteIntent(notification.routeIntent);

      setPushDebugState((current) => ({
        ...current,
        lastEventAt: new Date().toISOString(),
        lastNotificationBody: notification.body,
        lastNotificationData: notification.data,
        lastNotificationTitle: notification.title,
        lastRouteIntent: routeIntent,
        notificationReceivedCount: current.notificationReceivedCount + 1,
        notificationResponseCount: current.notificationResponseCount,
      }));

      setLastReceivedEvent(toSharedReceivedEvent(notification));

      if (routeIntent) {
        onRouteIntentRef.current?.(routeIntent);
      }
    };

    const updateFromResponseEvent = (
      notification: NotificationListenerResponseEvent,
    ) => {
      const routeIntent = toPushRouteIntent(notification.routeIntent);

      setPushDebugState((current) => ({
        ...current,
        lastEventAt: new Date().toISOString(),
        lastNotificationBody: notification.body,
        lastNotificationData: notification.data,
        lastNotificationTitle: notification.title,
        lastRouteIntent: routeIntent,
        notificationReceivedCount: current.notificationReceivedCount,
        notificationResponseCount: current.notificationResponseCount + 1,
      }));

      setLastResponseEvent(toSharedResponseEvent(notification));

      if (routeIntent) {
        onRouteIntentRef.current?.(routeIntent);
      }
    };

    void (async () => {
      setPushDebugState((current) => ({
        ...current,
        listenerState: "listening",
        lastEventAt: new Date().toISOString(),
      }));
      try {
        const registration = await registerForPushNotificationsAsync();
        if (cancelled) {
          return;
        }

        setPushState({
          enabled: registration.enabled,
          lastError: null,
          lastRegisteredAt: new Date().toISOString(),
          permissionStatus: registration.enabled ? "granted" : "unavailable",
          token: registration.token,
          userId,
        });
        setPermissionStatus(registration.enabled ? "granted" : "undetermined");
        setPushRegistration({
          enabled: registration.enabled,
          token: registration.token,
          permissionStatus: registration.enabled ? "granted" : "undetermined",
        });
        setLastError(null);
        setPushDebugState((current) => ({
          ...current,
          registration,
          lastEventAt: new Date().toISOString(),
        }));

        const subscriptions = await registerNotificationListeners({
          onReceived: updateFromReceivedEvent,
          onResponse: updateFromResponseEvent,
        });
        listenerRemoval = subscriptions.remove;

        if (!cancelled) {
          setPushDebugState((current) => ({
            ...current,
            listenerState: "listening",
            lastEventAt: new Date().toISOString(),
          }));
        }
      } catch (error) {
        if (cancelled) {
          return;
        }

        setPushState({
          enabled: false,
          lastError:
            error instanceof Error ? error.message : "Push lifecycle failed",
          lastRegisteredAt: new Date().toISOString(),
          permissionStatus: "error",
          token: null,
          userId,
        });
        setLastError(
          error instanceof Error ? error.message : "Push lifecycle failed",
        );
        setPermissionStatus("unknown");
        setPushDebugState((current) => ({
          ...current,
          listenerState: "stopped",
          lastEventAt: new Date().toISOString(),
        }));
      }
    })();

    return () => {
      cancelled = true;
      listenerRemoval?.();
      setPushDebugState((current) => ({
        ...current,
        listenerState: "stopped",
        lastEventAt: new Date().toISOString(),
      }));
    };
  }, [enabled, userId]);

  const push = useMemo(
    () => ({
      enabled: pushStore.enabled,
      lastError: pushStore.lastError,
      lastRegisteredAt: pushStore.lastRegisteredAt,
      permissionStatus: pushStore.permissionStatus,
      token: pushStore.token,
      userId: pushStore.userId,
    }),
    [pushStore],
  );
  const pushDebug = useMemo(
    () => ({
      lastEventAt: pushDebugStore.lastEventAt,
      lastNotificationBody: pushDebugStore.lastNotificationBody,
      lastNotificationData: pushDebugStore.lastNotificationData,
      lastNotificationTitle: pushDebugStore.lastNotificationTitle,
      lastRouteIntent: pushDebugStore.lastRouteIntent,
      listenerState: pushDebugStore.listenerState,
      notificationReceivedCount: pushDebugStore.notificationReceivedCount,
      notificationResponseCount: pushDebugStore.notificationResponseCount,
    }),
    [pushDebugStore],
  );

  return {
    push,
    pushDebug,
  };
}
