import Ionicons from "@expo/vector-icons/Ionicons";
import * as Device from "expo-device";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";

import {
  registerForPushNotificationsAsync,
  registerNotificationListeners,
} from "../../../lib/notifications";
import { useActivityStore } from "../../../store/activity-store";
import { useChatsStore } from "../../../store/chats-store";
import { useInboxStore } from "../../../store/inbox-store";
import { usePushStore } from "../../../store/push-store";
import {
  describeNotificationRouteIntent,
  describePushPermission,
} from "../domain/diagnostics";

type DebugDiagnosticsPanelProps = {
  visible?: boolean;
};

const DEV_DIAGNOSTICS_ENABLED =
  __DEV__ || process.env.EXPO_PUBLIC_ENABLE_DEV_TOOLS === "1";

function formatTimestamp(value: string | null) {
  if (!value) {
    return "not hydrated yet";
  }
  return new Date(value).toLocaleString();
}

function formatToken(value: string | null) {
  if (!value) {
    return "not registered";
  }
  if (value.length <= 12) {
    return value;
  }
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

function SnapshotRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="rounded-2xl border border-white/8 bg-white/[0.04] px-3 py-2.5">
      <Text className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/38">
        {label}
      </Text>
      <Text className="mt-1 text-[13px] leading-[19px] text-white/88">
        {value}
      </Text>
    </View>
  );
}

function EventCard({
  title,
  body,
  routeLabel,
  routeTarget,
  emptyLabel,
}: {
  body: string | null;
  emptyLabel: string;
  routeLabel: string | null;
  routeTarget: string | null;
  title: string;
}) {
  return (
    <View className="rounded-[22px] border border-white/8 bg-white/[0.03] px-4 py-4">
      <Text className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/34">
        {title}
      </Text>
      {body ? (
        <>
          <Text className="mt-2 text-[15px] font-semibold tracking-[-0.03em] text-white">
            {body}
          </Text>
          {routeLabel ? (
            <Text className="mt-1 text-[12px] text-white/42">
              Route: {routeLabel}
              {routeTarget ? ` · ${routeTarget}` : ""}
            </Text>
          ) : null}
        </>
      ) : (
        <Text className="mt-2 text-[13px] leading-[20px] text-white/52">
          {emptyLabel}
        </Text>
      )}
    </View>
  );
}

function EmptyBodyCard({ title, value }: { title: string; value: string }) {
  return (
    <View className="rounded-[22px] border border-white/8 bg-white/[0.03] px-4 py-4">
      <Text className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/34">
        {title}
      </Text>
      <Text className="mt-2 text-[13px] leading-[20px] text-white/68">
        {value}
      </Text>
    </View>
  );
}

export function DebugDiagnosticsPanel({
  visible = true,
}: DebugDiagnosticsPanelProps) {
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [bootstrapping, setBootstrapping] = useState(false);
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);

  const pushStore = usePushStore((store) => store);
  const pushState = useMemo(
    () => ({
      enabled: pushStore.pushEnabled,
      lastError: pushStore.lastError,
      lastEvent: pushStore.lastEvent,
      lastReceivedEvent: pushStore.lastReceivedEvent,
      lastResponseEvent: pushStore.lastResponseEvent,
      lastRouteIntent: pushStore.lastRouteIntent,
      permissionStatus: pushStore.permissionStatus,
      token: pushStore.pushToken,
      tokenUpdatedAt: pushStore.pushTokenUpdatedAt,
    }),
    [pushStore],
  );
  const setLastError = usePushStore((store) => store.setLastError);
  const setLastReceivedEvent = usePushStore(
    (store) => store.setLastReceivedEvent,
  );
  const setLastResponseEvent = usePushStore(
    (store) => store.setLastResponseEvent,
  );
  const setLastRouteIntent = usePushStore((store) => store.setLastRouteIntent);
  const setPushRegistration = usePushStore(
    (store) => store.setPushRegistration,
  );

  const realtimeState = useChatsStore((store) => store.realtimeState);
  const pendingOutboxCount = useChatsStore((store) => store.pendingOutboxCount);
  const activityPendingRequestCount = useActivityStore(
    (store) => store.pendingRequestCount,
  );
  const activityLastHydratedAt = useActivityStore(
    (store) => store.lastHydratedAt,
  );
  const inboxPendingRequestCount = useInboxStore(
    (store) => store.pendingRequestCount,
  );
  const inboxLastHydratedAt = useInboxStore((store) => store.lastHydratedAt);

  useEffect(() => {
    if (!DEV_DIAGNOSTICS_ENABLED || !visible) {
      return;
    }

    let cancelled = false;
    let subscriptionSet: { remove: () => void } | null = null;

    setBootstrapping(true);
    setBootstrapError(null);

    const bootstrap = async () => {
      try {
        const registration = await registerForPushNotificationsAsync();
        if (cancelled) {
          return;
        }

        setPushRegistration({
          enabled: registration.enabled,
          permissionStatus: Device.isDevice
            ? registration.enabled
              ? "granted"
              : "denied"
            : "unknown",
          token: registration.token,
        });
        setLastError(null);

        subscriptionSet = await registerNotificationListeners({
          onReceived: (event) => {
            setLastReceivedEvent(event);
            setLastRouteIntent(event.routeIntent);
            setLastError(null);
          },
          onResponse: (event) => {
            setLastResponseEvent(event);
            setLastRouteIntent(event.routeIntent);
            setLastError(null);
          },
        });
      } catch (error) {
        if (cancelled) {
          return;
        }

        const message =
          error instanceof Error
            ? error.message
            : "Unable to bootstrap push diagnostics.";
        setBootstrapError(message);
        setLastError(message);
        setPushRegistration({
          enabled: false,
          permissionStatus: "unknown",
          token: null,
        });
      } finally {
        if (!cancelled) {
          setBootstrapping(false);
        }
      }
    };

    void bootstrap();

    return () => {
      cancelled = true;
      subscriptionSet?.remove();
    };
  }, [
    refreshNonce,
    visible,
    setLastError,
    setLastReceivedEvent,
    setLastResponseEvent,
    setLastRouteIntent,
    setPushRegistration,
  ]);

  if (!DEV_DIAGNOSTICS_ENABLED || !visible) {
    return null;
  }

  const permissionText = describePushPermission(pushState.permissionStatus);
  const lastRoute = describeNotificationRouteIntent(pushState.lastRouteIntent);
  const lastReceivedRoute = describeNotificationRouteIntent(
    pushState.lastReceivedEvent?.routeIntent ?? null,
  );
  const lastResponseRoute = describeNotificationRouteIntent(
    pushState.lastResponseEvent?.routeIntent ?? null,
  );

  return (
    <View className="rounded-[28px] border border-white/8 bg-[#0a0c11] px-4 py-4 shadow-lg shadow-black/40">
      <View className="flex-row items-center justify-between">
        <View className="min-w-0 flex-1">
          <Text className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/34">
            Diagnostics
          </Text>
          <Text className="mt-1 text-[16px] font-semibold tracking-[-0.03em] text-white">
            Push, realtime, and route events
          </Text>
        </View>
        <Pressable
          className="ml-3 h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.04]"
          disabled={bootstrapping}
          onPress={() => {
            setRefreshNonce((value) => value + 1);
          }}
        >
          {bootstrapping ? (
            <ActivityIndicator color="rgba(255,255,255,0.82)" />
          ) : (
            <Ionicons color="rgba(255,255,255,0.82)" name="refresh" size={17} />
          )}
        </Pressable>
      </View>

      <ScrollView
        className="mt-4"
        contentContainerStyle={{ paddingBottom: 8 }}
        showsVerticalScrollIndicator={false}
      >
        <View className="gap-3">
          <View className="rounded-[22px] border border-white/8 bg-white/[0.03] px-4 py-4">
            <Text className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/34">
              Push
            </Text>
            <View className="mt-3 gap-2">
              <SnapshotRow label="Permission" value={permissionText} />
              <SnapshotRow label="Token" value={formatToken(pushState.token)} />
              <SnapshotRow
                label="Token active"
                value={pushState.enabled ? "Yes" : "No"}
              />
              <SnapshotRow
                label="Token updated"
                value={formatTimestamp(pushState.tokenUpdatedAt)}
              />
              {pushState.lastError || bootstrapError ? (
                <Text className="text-[12px] text-rose-200/90">
                  {pushState.lastError ?? bootstrapError}
                </Text>
              ) : null}
            </View>
          </View>

          <View className="rounded-[22px] border border-white/8 bg-white/[0.03] px-4 py-4">
            <Text className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/34">
              Realtime
            </Text>
            <View className="mt-3 gap-2">
              <SnapshotRow label="Socket" value={realtimeState} />
              <SnapshotRow
                label="Pending outbox"
                value={String(pendingOutboxCount)}
              />
              <SnapshotRow
                label="Activity pending"
                value={String(activityPendingRequestCount)}
              />
              <SnapshotRow
                label="Inbox pending"
                value={String(inboxPendingRequestCount)}
              />
            </View>
          </View>

          <View className="rounded-[22px] border border-white/8 bg-white/[0.03] px-4 py-4">
            <Text className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/34">
              Hydration
            </Text>
            <View className="mt-3 gap-2">
              <SnapshotRow
                label="Activity sync"
                value={formatTimestamp(activityLastHydratedAt)}
              />
              <SnapshotRow
                label="Inbox sync"
                value={formatTimestamp(inboxLastHydratedAt)}
              />
            </View>
          </View>

          <EventCard
            body={pushState.lastReceivedEvent?.title ?? null}
            emptyLabel="No recent notification received."
            routeLabel={lastReceivedRoute?.label ?? null}
            routeTarget={lastReceivedRoute?.targetId ?? null}
            title="Last notification"
          />

          <EmptyBodyCard
            title="Notification body"
            value={pushState.lastReceivedEvent?.body ?? "No body captured yet."}
          />

          <EventCard
            body={pushState.lastResponseEvent?.title ?? null}
            emptyLabel="No recent notification open action."
            routeLabel={lastResponseRoute?.label ?? null}
            routeTarget={lastResponseRoute?.targetId ?? null}
            title="Last notification open"
          />

          <EmptyBodyCard
            title="Open body"
            value={
              pushState.lastResponseEvent?.body ??
              "No response body captured yet."
            }
          />

          <EventCard
            body={lastRoute?.label ?? null}
            emptyLabel="No route intent captured yet."
            routeLabel={lastRoute?.label ?? null}
            routeTarget={lastRoute?.targetId ?? null}
            title="Last route intent"
          />

          <View className="rounded-[22px] border border-white/8 bg-white/[0.03] px-4 py-4">
            <Text className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/34">
              Event state
            </Text>
            <View className="mt-3 gap-2">
              <SnapshotRow
                label="Last event"
                value={pushState.lastEvent?.kind ?? "none"}
              />
              <SnapshotRow
                label="Last event time"
                value={formatTimestamp(pushState.lastEvent?.occurredAt ?? null)}
              />
              <SnapshotRow
                label="Listener summary"
                value={
                  pushState.lastRouteIntent
                    ? "Route intent captured"
                    : "No route intent captured"
                }
              />
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
