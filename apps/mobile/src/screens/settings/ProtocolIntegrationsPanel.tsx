import Ionicons from "@expo/vector-icons/Ionicons";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";

import { API_BASE_URL } from "../../lib/api";
import { appTheme } from "../../theme";

type ProtocolEventItem = {
  title: string;
  subtitle: string;
  detail: string;
};

type ProtocolQueueItem = {
  title: string;
  value: string;
};

type ProtocolSnapshot = {
  linkedApps: number;
  recentEvents: ProtocolEventItem[];
  queueItems: ProtocolQueueItem[];
  source: "live" | "empty";
  updatedAt: string | null;
};

function extractEnvelopeData(payload: unknown) {
  if (
    typeof payload === "object" &&
    payload !== null &&
    "success" in payload &&
    typeof (payload as { success?: unknown }).success === "boolean"
  ) {
    const envelope = payload as {
      success: boolean;
      data?: unknown;
    };

    return envelope.success ? envelope.data : null;
  }

  return payload;
}

function toStringOrEmpty(value: unknown) {
  return typeof value === "string" ? value : "";
}

function toDisplayString(value: unknown) {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "bigint") {
    return String(value);
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  return "";
}

function asProtocolEvents(payload: unknown): ProtocolEventItem[] {
  const data = extractEnvelopeData(payload);
  if (!Array.isArray(data)) {
    return [];
  }

  return data
    .map((entry) => {
      if (typeof entry !== "object" || entry === null) {
        return null;
      }

      const record = entry as Record<string, unknown>;
      const title =
        toStringOrEmpty(record.title) ||
        toStringOrEmpty(record.eventType) ||
        toStringOrEmpty(record.type) ||
        toStringOrEmpty(record.kind) ||
        "Protocol event";
      const subtitle =
        toStringOrEmpty(record.subtitle) ||
        toStringOrEmpty(record.appName) ||
        toStringOrEmpty(record.appId) ||
        toStringOrEmpty(record.subjectId) ||
        "Recent activity";
      const detail =
        toStringOrEmpty(record.detail) ||
        toStringOrEmpty(record.summary) ||
        toStringOrEmpty(record.message) ||
        toStringOrEmpty(record.createdAt) ||
        "";

      return { title, subtitle, detail };
    })
    .filter((item): item is ProtocolEventItem => item != null)
    .slice(0, 3);
}

function asQueueSummary(payload: unknown): ProtocolQueueItem[] {
  const data = extractEnvelopeData(payload);
  if (typeof data !== "object" || data === null) {
    return [];
  }

  const record = data as Record<string, unknown>;
  const counts = [
    {
      title: "Queued",
      value:
        toDisplayString(record.queuedCount) ||
        toDisplayString(record.queued) ||
        toDisplayString(record.pendingCount) ||
        toDisplayString(record.pending) ||
        "0",
    },
    {
      title: "Failed",
      value:
        toDisplayString(record.failedCount) ||
        toDisplayString(record.failed) ||
        toDisplayString(record.deadLetteredCount) ||
        toDisplayString(record.deadLettered) ||
        "0",
    },
    {
      title: "Delivered",
      value:
        toDisplayString(record.deliveredCount) ||
        toDisplayString(record.delivered) ||
        "0",
    },
  ];

  return counts;
}

async function fetchProtocolJson(
  path: string,
  accessToken: string,
  signal?: AbortSignal,
) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      authorization: `Bearer ${accessToken}`,
      accept: "application/json",
    },
    signal,
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    return null;
  }

  return response.json().catch(() => null);
}

export function ProtocolIntegrationsPanel({
  accessToken,
}: {
  accessToken: string;
}) {
  const [snapshot, setSnapshot] = useState<ProtocolSnapshot>({
    linkedApps: 0,
    recentEvents: [],
    queueItems: [],
    source: "empty",
    updatedAt: null,
  });
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      try {
        const [appsPayload, eventsPayload, queuePayload] = await Promise.all([
          fetchProtocolJson("/protocol/apps", accessToken, signal),
          fetchProtocolJson("/protocol/events?limit=3", accessToken, signal),
          fetchProtocolJson(
            "/protocol/delivery-queue/summary",
            accessToken,
            signal,
          ),
        ]);

        const linkedApps = Array.isArray(extractEnvelopeData(appsPayload))
          ? (extractEnvelopeData(appsPayload) as unknown[]).length
          : 0;
        const recentEvents = asProtocolEvents(eventsPayload);
        const queueItems = asQueueSummary(queuePayload);

        setSnapshot({
          linkedApps,
          recentEvents,
          queueItems,
          source:
            linkedApps > 0 || recentEvents.length > 0 || queueItems.length > 0
              ? "live"
              : "empty",
          updatedAt: new Date().toISOString(),
        });
      } finally {
        setLoading(false);
      }
    },
    [accessToken],
  );

  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal);
    return () => controller.abort();
  }, [refresh]);

  const statusLabel = useMemo(() => {
    if (loading) {
      return "Refreshing";
    }
    return snapshot.source === "live" ? "Live" : "Not connected";
  }, [loading, snapshot.source]);

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
            Visibility for protocol apps, recent events, and the delivery queue.
            The panel stays useful even before the protocol backend is fully
            wired.
          </Text>
        </View>

        <Pressable
          accessibilityHint="Refreshes protocol activity and queue summaries."
          accessibilityLabel="Refresh protocol visibility"
          accessibilityRole="button"
          className="min-h-11 flex-row items-center gap-2 rounded-full border border-hairline bg-canvas px-3"
          disabled={loading}
          onPress={() => {
            void refresh();
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
        {snapshot.updatedAt
          ? `Last refreshed ${new Date(snapshot.updatedAt).toLocaleTimeString(
              [],
              {
                hour: "numeric",
                minute: "2-digit",
              },
            )}`
          : "No protocol data loaded yet."}
      </Text>

      <View className="mb-4 flex-row flex-wrap gap-2">
        <View className="min-w-[96px] flex-1 rounded-2xl border border-hairline bg-canvas px-3 py-2.5">
          <Text className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
            Linked apps
          </Text>
          <Text className="mt-1 text-[18px] font-semibold tracking-[-0.03em] text-ink">
            {snapshot.linkedApps}
          </Text>
        </View>
        <View className="min-w-[96px] flex-1 rounded-2xl border border-hairline bg-canvas px-3 py-2.5">
          <Text className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
            Recent events
          </Text>
          <Text className="mt-1 text-[18px] font-semibold tracking-[-0.03em] text-ink">
            {snapshot.recentEvents.length}
          </Text>
        </View>
        <View className="min-w-[96px] flex-1 rounded-2xl border border-hairline bg-canvas px-3 py-2.5">
          <Text className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
            Queue summary
          </Text>
          <Text className="mt-1 text-[18px] font-semibold tracking-[-0.03em] text-ink">
            {snapshot.queueItems.length ? "Live" : "Idle"}
          </Text>
        </View>
      </View>

      <View className="gap-4">
        <View className="gap-3">
          <Text className="text-[12px] font-semibold uppercase tracking-[0.12em] text-muted">
            Recent protocol events
          </Text>
          {snapshot.recentEvents.length > 0 ? (
            <View className="gap-2">
              {snapshot.recentEvents.map((event, index) => (
                <View
                  key={`${event.title}:${event.subtitle}:${index}`}
                  className="rounded-2xl border border-hairline bg-canvas px-3 py-2.5"
                >
                  <Text className="text-[14px] font-semibold tracking-[-0.02em] text-ink">
                    {event.title}
                  </Text>
                  <Text className="mt-1 text-[12px] font-medium text-muted">
                    {event.subtitle}
                  </Text>
                  {event.detail ? (
                    <Text className="mt-1 text-[12px] leading-[18px] text-ink/75">
                      {event.detail}
                    </Text>
                  ) : null}
                </View>
              ))}
            </View>
          ) : (
            <View className="rounded-2xl border border-dashed border-hairline bg-canvas/60 px-3 py-4">
              <Text className="text-[13px] font-medium text-muted">
                No protocol events are available yet. Once the protocol backend
                is connected, recent registrations, grants, and deliveries will
                appear here.
              </Text>
            </View>
          )}
        </View>

        <View className="gap-3">
          <Text className="text-[12px] font-semibold uppercase tracking-[0.12em] text-muted">
            Delivery queue summary
          </Text>
          {snapshot.queueItems.length > 0 ? (
            <View className="flex-row flex-wrap gap-2">
              {snapshot.queueItems.map((item) => (
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
                Delivery queue details will show here when the protocol delivery
                worker is wired to this branch.
              </Text>
            </View>
          )}
        </View>
      </View>
    </View>
  );
}
