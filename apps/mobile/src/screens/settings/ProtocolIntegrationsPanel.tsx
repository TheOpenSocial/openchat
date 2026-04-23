import Ionicons from "@expo/vector-icons/Ionicons";
import { useMemo } from "react";
import { Pressable, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";

import { api } from "../../lib/api";
import { mobileQueryKeys } from "../../lib/query-client";
import { appTheme } from "../../theme";

function formatUpdatedAt(value: string | null) {
  if (!value) {
    return "No protocol data loaded yet.";
  }

  return `Last refreshed ${new Date(value).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  })}`;
}

function protocolTestId(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, "-").toLowerCase();
}

export function ProtocolIntegrationsPanel({
  accessToken,
}: {
  accessToken: string;
}) {
  const protocolVisibilityQuery = useQuery({
    queryKey: mobileQueryKeys.protocolVisibility(),
    queryFn: ({ signal }) =>
      api.getProtocolVisibilitySummary(accessToken, { signal }),
  });
  const snapshot = protocolVisibilityQuery.data ?? null;
  const loading =
    protocolVisibilityQuery.isLoading || protocolVisibilityQuery.isRefetching;
  const queueItems = useMemo(() => {
    if (!snapshot) {
      return [];
    }
    return [
      { title: "Queued", value: String(snapshot.queue.queuedCount) },
      { title: "Retrying", value: String(snapshot.queue.retryingCount) },
      { title: "Failed", value: String(snapshot.queue.failedCount) },
      { title: "Replayable", value: String(snapshot.queue.replayableCount) },
    ];
  }, [snapshot]);
  const accessItems = useMemo(() => {
    if (!snapshot) {
      return [];
    }
    return [
      {
        title: "Active grants",
        value: String(snapshot.access.grantCounts.active),
      },
      {
        title: "Pending consent",
        value: String(snapshot.access.consentRequestCounts.pending),
      },
      {
        title: "Active webhooks",
        value: String(snapshot.access.webhookCounts.active),
      },
    ];
  }, [snapshot]);
  const recentEvents = snapshot?.recentEvents.slice(0, 3) ?? [];
  const visibleApps = snapshot?.apps.slice(0, 4) ?? [];
  const linkedApps = snapshot?.linkedApps ?? 0;
  const hasLiveData =
    linkedApps > 0 ||
    recentEvents.length > 0 ||
    accessItems.some((item) => item.value !== "0") ||
    queueItems.some((item) => item.value !== "0");
  const statusLabel = loading ? "Refreshing" : hasLiveData ? "Live" : "Ready";

  return (
    <View
      className="rounded-[28px] border border-hairline bg-surfaceMuted/70 p-4"
      testID="settings-protocol-panel"
    >
      <View className="mb-4 flex-row items-start justify-between gap-3">
        <View className="flex-1 gap-2">
          <Text className="text-[12px] font-semibold uppercase tracking-[0.14em] text-muted">
            Protocol
          </Text>
          <Text className="text-[22px] font-semibold tracking-[-0.04em] text-ink">
            Usage and delivery
          </Text>
          <Text className="text-[13px] leading-[19px] text-muted">
            Visibility for protocol apps, supported events, and the delivery
            queue.
          </Text>
        </View>

        <Pressable
          accessibilityHint="Refreshes protocol activity and queue summaries."
          accessibilityLabel="Refresh protocol visibility"
          accessibilityRole="button"
          className="min-h-11 flex-row items-center gap-2 rounded-full border border-hairline bg-canvas px-3"
          disabled={loading}
          onPress={() => {
            void protocolVisibilityQuery.refetch();
          }}
          testID="settings-protocol-refresh"
        >
          <Ionicons color={appTheme.colors.ink} name="refresh" size={15} />
          <Text className="text-[12px] font-semibold text-ink">
            {statusLabel}
          </Text>
        </Pressable>
      </View>

      <Text className="mb-4 text-[12px] font-medium text-muted">
        {formatUpdatedAt(snapshot?.generatedAt ?? null)}
      </Text>

      {protocolVisibilityQuery.error ? (
        <View className="mb-4 rounded-2xl border border-red-400/25 bg-red-400/10 px-3 py-3">
          <Text className="text-[13px] font-medium text-red-100">
            Protocol visibility is unavailable right now.
          </Text>
        </View>
      ) : null}

      <View className="mb-4 flex-row flex-wrap gap-2">
        <View className="min-w-[96px] flex-1 rounded-2xl border border-hairline bg-canvas px-3 py-2.5">
          <Text className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
            Linked apps
          </Text>
          <Text className="mt-1 text-[18px] font-semibold tracking-[-0.03em] text-ink">
            {linkedApps}
          </Text>
        </View>
        <View className="min-w-[96px] flex-1 rounded-2xl border border-hairline bg-canvas px-3 py-2.5">
          <Text className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
            Event catalog
          </Text>
          <Text className="mt-1 text-[18px] font-semibold tracking-[-0.03em] text-ink">
            {snapshot?.recentEvents.length ?? 0}
          </Text>
        </View>
        <View className="min-w-[96px] flex-1 rounded-2xl border border-hairline bg-canvas px-3 py-2.5">
          <Text className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
            Queue summary
          </Text>
          <Text className="mt-1 text-[18px] font-semibold tracking-[-0.03em] text-ink">
            {snapshot ? "Live" : "Idle"}
          </Text>
        </View>
      </View>

      <View className="gap-4">
        <View className="gap-3" testID="settings-protocol-linked-apps">
          <View className="flex-row items-end justify-between gap-3">
            <Text className="text-[12px] font-semibold uppercase tracking-[0.12em] text-muted">
              Linked protocol apps
            </Text>
            {linkedApps > visibleApps.length ? (
              <Text className="text-[12px] font-medium text-muted">
                +{linkedApps - visibleApps.length} more
              </Text>
            ) : null}
          </View>
          {visibleApps.length > 0 ? (
            <View className="gap-2">
              {visibleApps.map((app) => (
                <View
                  key={app.appId}
                  className="rounded-2xl border border-hairline bg-canvas px-3 py-2.5"
                  testID={`settings-protocol-app-${protocolTestId(app.appId)}`}
                >
                  <View className="flex-row items-start justify-between gap-3">
                    <View className="min-w-0 flex-1">
                      <Text
                        className="text-[14px] font-semibold tracking-[-0.02em] text-ink"
                        numberOfLines={1}
                      >
                        {app.name}
                      </Text>
                      <Text
                        className="mt-1 text-[12px] font-medium text-muted"
                        numberOfLines={1}
                      >
                        {app.appId}
                      </Text>
                    </View>
                    <View className="rounded-full border border-hairline bg-surfaceMuted px-2 py-1">
                      <Text className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
                        {app.status}
                      </Text>
                    </View>
                  </View>
                  {app.summary ? (
                    <Text
                      className="mt-2 text-[12px] leading-[18px] text-ink/75"
                      numberOfLines={2}
                    >
                      {app.summary}
                    </Text>
                  ) : null}
                  <Text className="mt-2 text-[11px] font-medium text-muted">
                    {`${app.kind} · ${app.issuedScopes.length} scopes · ${app.issuedCapabilities.length} capabilities`}
                  </Text>
                </View>
              ))}
            </View>
          ) : (
            <View className="rounded-2xl border border-dashed border-hairline bg-canvas/60 px-3 py-4">
              <Text className="text-[13px] font-medium text-muted">
                No protocol apps are linked yet. Registered partner apps will
                appear here with their current status and issued access.
              </Text>
            </View>
          )}
        </View>

        <View className="gap-3" testID="settings-protocol-access-summary">
          <Text className="text-[12px] font-semibold uppercase tracking-[0.12em] text-muted">
            Access and webhooks
          </Text>
          {accessItems.length > 0 ? (
            <View className="flex-row flex-wrap gap-2">
              {accessItems.map((item) => (
                <View
                  key={item.title}
                  className="min-w-[96px] flex-1 rounded-2xl border border-hairline bg-canvas px-3 py-2.5"
                >
                  <Text className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
                    {item.title}
                  </Text>
                  <Text className="mt-1 text-[18px] font-semibold tracking-[-0.03em] text-ink">
                    {item.value}
                  </Text>
                </View>
              ))}
            </View>
          ) : (
            <View className="rounded-2xl border border-dashed border-hairline bg-canvas/60 px-3 py-4">
              <Text className="text-[13px] font-medium text-muted">
                Grant, consent, and webhook counts will show here once the
                backend summary responds.
              </Text>
            </View>
          )}
        </View>

        <View className="gap-3">
          <Text className="text-[12px] font-semibold uppercase tracking-[0.12em] text-muted">
            Supported protocol events
          </Text>
          {recentEvents.length > 0 ? (
            <View className="gap-2">
              {recentEvents.map((event) => (
                <View
                  key={event.name}
                  className="rounded-2xl border border-hairline bg-canvas px-3 py-2.5"
                >
                  <Text className="text-[14px] font-semibold tracking-[-0.02em] text-ink">
                    {event.name}
                  </Text>
                  <Text className="mt-1 text-[12px] font-medium text-muted">
                    {event.resource}
                  </Text>
                  <Text className="mt-1 text-[12px] leading-[18px] text-ink/75">
                    {event.summary}
                  </Text>
                </View>
              ))}
            </View>
          ) : (
            <View className="rounded-2xl border border-dashed border-hairline bg-canvas/60 px-3 py-4">
              <Text className="text-[13px] font-medium text-muted">
                Protocol events will appear here when the visibility summary is
                available.
              </Text>
            </View>
          )}
        </View>

        <View className="gap-3">
          <Text className="text-[12px] font-semibold uppercase tracking-[0.12em] text-muted">
            Delivery queue summary
          </Text>
          {queueItems.length > 0 ? (
            <View className="flex-row flex-wrap gap-2">
              {queueItems.map((item) => (
                <View
                  key={item.title}
                  className="min-w-[96px] flex-1 rounded-2xl border border-hairline bg-canvas px-3 py-2.5"
                >
                  <Text className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
                    {item.title}
                  </Text>
                  <Text className="mt-1 text-[18px] font-semibold tracking-[-0.03em] text-ink">
                    {item.value}
                  </Text>
                </View>
              ))}
            </View>
          ) : (
            <View className="rounded-2xl border border-dashed border-hairline bg-canvas/60 px-3 py-4">
              <Text className="text-[13px] font-medium text-muted">
                Queue counts will show here once the backend summary responds.
              </Text>
            </View>
          )}
        </View>
      </View>
    </View>
  );
}
