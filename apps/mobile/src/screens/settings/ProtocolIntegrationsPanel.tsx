import { useEffect, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";

import { CalmTextField } from "../../components/CalmTextField";
import { PrimaryButton } from "../../components/PrimaryButton";
import { api } from "../../lib/api";

type ProtocolAppSummary = Awaited<
  ReturnType<typeof api.listProtocolApps>
>[number];
type ProtocolWebhookSummary = Awaited<
  ReturnType<typeof api.listProtocolWebhooks>
>[number];
type ProtocolScopeGrantRecord = Awaited<
  ReturnType<typeof api.listProtocolGrants>
>[number];
type ProtocolUsageSummary = Awaited<
  ReturnType<typeof api.getProtocolUsageSummary>
>;
type ProtocolUsageEvent = ProtocolUsageSummary["recentEvents"][number];

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <View className="min-w-[88px] flex-1 rounded-2xl border border-hairline bg-surfaceMuted/70 px-3 py-2.5">
      <Text className="text-[10px] uppercase tracking-[0.16em] text-muted">
        {label}
      </Text>
      <Text className="mt-1 text-[14px] font-semibold text-ink">{value}</Text>
    </View>
  );
}

function Chip({ label }: { label: string }) {
  return (
    <View className="rounded-full border border-hairline bg-surfaceMuted/75 px-2.5 py-1">
      <Text className="text-[11px] text-ink/88">{label}</Text>
    </View>
  );
}

export function ProtocolIntegrationsPanel() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [manifest, setManifest] = useState<Awaited<
    ReturnType<typeof api.getProtocolManifest>
  > | null>(null);
  const [discovery, setDiscovery] = useState<Awaited<
    ReturnType<typeof api.getProtocolDiscovery>
  > | null>(null);
  const [apps, setApps] = useState<ProtocolAppSummary[]>([]);
  const [selectedAppId, setSelectedAppId] = useState("");
  const [appToken, setAppToken] = useState("");
  const [webhooks, setWebhooks] = useState<ProtocolWebhookSummary[]>([]);
  const [webhooksLoading, setWebhooksLoading] = useState(false);
  const [webhooksError, setWebhooksError] = useState<string | null>(null);
  const [grants, setGrants] = useState<ProtocolScopeGrantRecord[]>([]);
  const [grantsLoading, setGrantsLoading] = useState(false);
  const [grantsError, setGrantsError] = useState<string | null>(null);
  const [usageSummary, setUsageSummary] = useState<ProtocolUsageSummary | null>(
    null,
  );
  const [usageLoading, setUsageLoading] = useState(false);
  const [usageError, setUsageError] = useState<string | null>(null);
  const [usageNotice, setUsageNotice] = useState<string | null>(null);
  const [dispatchingQueue, setDispatchingQueue] = useState(false);

  const resetInspectionState = (options?: { clearToken?: boolean }) => {
    setWebhooks([]);
    setWebhooksError(null);
    setGrants([]);
    setGrantsError(null);
    setUsageSummary(null);
    setUsageError(null);
    setUsageNotice(null);
    if (options?.clearToken) {
      setAppToken("");
    }
  };

  useEffect(() => {
    let cancelled = false;

    const loadOverview = async () => {
      setLoading(true);
      setError(null);
      try {
        const [nextManifest, nextDiscovery, nextApps] = await Promise.all([
          api.getProtocolManifest(),
          api.getProtocolDiscovery(),
          api.listProtocolApps(),
        ]);
        if (cancelled) {
          return;
        }
        setManifest(nextManifest);
        setDiscovery(nextDiscovery);
        setApps(nextApps);
        setSelectedAppId(
          (current) => current || nextApps[0]?.registration.appId || "",
        );
      } catch (loadError) {
        if (!cancelled) {
          setError(
            `Could not load protocol integrations: ${String(loadError)}`,
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void loadOverview();

    return () => {
      cancelled = true;
    };
  }, []);

  const selectedApp = useMemo(
    () => apps.find((app) => app.registration.appId === selectedAppId) ?? null,
    [apps, selectedAppId],
  );

  const inspectWebhooks = async () => {
    if (!selectedAppId.trim() || !appToken.trim()) {
      setWebhooksError(
        "Select an app and paste its token to inspect webhooks.",
      );
      setWebhooks([]);
      return;
    }

    setWebhooksLoading(true);
    setWebhooksError(null);
    try {
      const nextWebhooks = await api.listProtocolWebhooks(
        selectedAppId.trim(),
        appToken.trim(),
      );
      setWebhooks(nextWebhooks);
    } catch (loadError) {
      setWebhooks([]);
      setWebhooksError(`Could not load webhooks: ${String(loadError)}`);
    } finally {
      setWebhooksLoading(false);
    }
  };

  const loadGrants = async () => {
    if (!selectedAppId.trim() || !appToken.trim()) {
      setGrantsError("Select an app and paste its token to inspect grants.");
      setGrants([]);
      return;
    }

    setGrantsLoading(true);
    setGrantsError(null);
    try {
      const nextGrants = await api.listProtocolGrants(
        selectedAppId.trim(),
        appToken.trim(),
      );
      setGrants(nextGrants);
    } catch (loadError) {
      setGrants([]);
      setGrantsError(`Could not load grants: ${String(loadError)}`);
    } finally {
      setGrantsLoading(false);
    }
  };

  const loadUsageSummary = async () => {
    if (!selectedAppId.trim() || !appToken.trim()) {
      setUsageError("Select an app and paste its token to inspect usage.");
      setUsageSummary(null);
      return;
    }

    setUsageLoading(true);
    setUsageError(null);
    setUsageNotice(null);
    try {
      const summary = await api.getProtocolUsageSummary(
        selectedAppId.trim(),
        appToken.trim(),
      );
      setUsageSummary(summary);
    } catch (loadError) {
      setUsageSummary(null);
      setUsageError(`Could not load usage summary: ${String(loadError)}`);
    } finally {
      setUsageLoading(false);
    }
  };

  const dispatchQueue = async () => {
    if (!selectedAppId.trim() || !appToken.trim()) {
      setUsageError("Select an app and paste its token before dispatching.");
      return;
    }
    setDispatchingQueue(true);
    setUsageError(null);
    setUsageNotice(null);
    try {
      await api.dispatchProtocolDeliveryQueue(
        selectedAppId.trim(),
        appToken.trim(),
        { limit: 25 },
      );
      setUsageNotice(
        "Queue dispatch enqueued. Usage metrics update after the worker drains pending deliveries.",
      );
      void loadUsageSummary();
    } catch (dispatchError) {
      setUsageError(`Could not dispatch delivery queue: ${String(dispatchError)}`);
    } finally {
      setDispatchingQueue(false);
    }
  };

  const revokeGrant = async (grantId: string) => {
    if (!selectedAppId.trim() || !appToken.trim()) {
      setGrantsError("Select an app and paste its token before revoking.");
      return;
    }

    setGrantsLoading(true);
    setGrantsError(null);
    try {
      await api.revokeProtocolGrant(
        selectedAppId.trim(),
        appToken.trim(),
        grantId,
      );
      setGrants((current) =>
        current.map((grant) =>
          grant.grantId === grantId
            ? {
                ...grant,
                status: "revoked",
                revokedAt: new Date().toISOString(),
              }
            : grant,
        ),
      );
    } catch (revokeError) {
      setGrantsError(`Could not revoke grant: ${String(revokeError)}`);
    } finally {
      setGrantsLoading(false);
    }
  };

  return (
    <View className="space-y-4 rounded-[28px] border border-hairline bg-surfaceMuted/70 p-4">
      <View className="space-y-2">
        <Text className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
          Protocol integrations
        </Text>
        <Text className="text-[18px] font-semibold tracking-[-0.03em] text-ink">
          Apps, webhooks, and protocol shape
        </Text>
        <Text className="text-[13px] leading-6 text-muted">
          Inspect the active protocol manifest, registered apps, and token-gated
          webhook state. Delivery queue dispatch is available for operational testing.
        </Text>
      </View>

      {error ? (
        <Text className="text-[13px] leading-6 text-[#fca5a5]">{error}</Text>
      ) : null}

      <View className="flex-row flex-wrap gap-3">
        <Metric label="Manifest" value={manifest?.name ?? "Loading..."} />
        <Metric
          label="Discovery events"
          value={discovery?.events.length ?? 0}
        />
        <Metric label="Apps" value={apps.length} />
      </View>

      <View className="space-y-2">
        <Text className="text-[12px] font-semibold uppercase tracking-[0.16em] text-muted">
          Registered apps
        </Text>
        <View className="divide-y divide-hairline overflow-hidden rounded-[24px] border border-hairline bg-surface">
          {loading ? (
            <View className="px-4 py-4">
              <Text className="text-[13px] text-muted">
                Loading protocol apps...
              </Text>
            </View>
          ) : apps.length === 0 ? (
            <View className="px-4 py-4">
              <Text className="text-[13px] text-muted">
                No protocol apps registered yet.
              </Text>
            </View>
          ) : (
            apps.map((app) => {
              const active = app.registration.appId === selectedAppId;
              return (
                <Pressable
                  key={app.registration.appId}
                  onPress={() => {
                    setSelectedAppId(app.registration.appId);
                    resetInspectionState({ clearToken: true });
                  }}
                >
                  <View
                    className={`gap-2 px-4 py-3 ${
                      active ? "bg-white/[0.04]" : "bg-transparent"
                    }`}
                  >
                    <View className="flex-row items-center justify-between gap-3">
                      <View className="min-w-0 flex-1">
                        <Text className="text-[14px] font-medium text-ink">
                          {app.registration.name}
                        </Text>
                        <Text className="text-[12px] text-muted">
                          {app.registration.appId} · {app.status}
                        </Text>
                      </View>
                      <Text className="text-[11px] uppercase tracking-[0.16em] text-muted">
                        {active ? "Selected" : "Tap to inspect"}
                      </Text>
                    </View>
                    <View className="flex-row flex-wrap gap-2">
                      {(app.issuedScopes.length > 0
                        ? app.issuedScopes
                        : ["no scopes"]
                      ).map((scope: string) => (
                        <Chip
                          key={`${app.registration.appId}:${scope}`}
                          label={scope}
                        />
                      ))}
                    </View>
                    <Text className="text-[12px] leading-5 text-muted">
                      {app.registration.summary ?? "No summary provided."}
                    </Text>
                  </View>
                </Pressable>
              );
            })
          )}
        </View>
      </View>

      <View className="space-y-3 rounded-[24px] border border-hairline bg-surface px-4 py-4">
        <View className="space-y-1">
          <Text className="text-[12px] font-semibold uppercase tracking-[0.16em] text-muted">
            Webhook inspector
          </Text>
          <Text className="text-[13px] leading-6 text-muted">
            Enter a protocol app id and token to inspect its subscriptions. No
            writes are performed here.
          </Text>
        </View>

        <CalmTextField
          autoCapitalize="none"
          autoCorrect={false}
          containerClassName="gap-2"
          inputClassName="text-ink"
          label="App ID"
          onChangeText={(value) => {
            setSelectedAppId(value);
            resetInspectionState();
          }}
          placeholder="select or paste an app id"
          value={selectedAppId}
        />

        <CalmTextField
          autoCapitalize="none"
          autoCorrect={false}
          containerClassName="gap-2"
          inputClassName="text-ink"
          label="App token"
          helperText="Used only to inspect webhook subscriptions on device."
          onChangeText={setAppToken}
          placeholder="paste app token"
          secureTextEntry
          value={appToken}
        />

        <PrimaryButton
          label={webhooksLoading ? "Loading..." : "Load webhooks"}
          loading={webhooksLoading}
          onPress={() => {
            void inspectWebhooks();
          }}
        />

        {webhooksError ? (
          <Text className="text-[13px] leading-6 text-[#fca5a5]">
            {webhooksError}
          </Text>
        ) : null}

        <View className="space-y-2">
          <Text className="text-[12px] font-semibold uppercase tracking-[0.16em] text-muted">
            Loaded webhooks
          </Text>
          {webhooks.length === 0 ? (
            <Text className="text-[13px] text-muted">
              {selectedApp
                ? "No webhook subscriptions loaded yet."
                : "Select an app above to inspect its webhooks."}
            </Text>
          ) : (
            webhooks.map((webhook) => (
              <View
                key={webhook.subscriptionId}
                className="gap-1 rounded-2xl border border-hairline bg-surfaceMuted/70 px-3 py-3"
              >
                <Text className="text-[13px] font-medium text-ink">
                  {webhook.targetUrl}
                </Text>
                <Text className="text-[12px] text-muted">
                  {webhook.subscriptionId} · {webhook.status} ·{" "}
                  {webhook.deliveryMode}
                </Text>
                <Text className="text-[12px] text-muted">
                  Events: {webhook.events.join(", ")}
                </Text>
              </View>
            ))
          )}
        </View>
      </View>

      <View className="space-y-3 rounded-[24px] border border-hairline bg-surface px-4 py-4">
        <View className="space-y-1">
          <Text className="text-[12px] font-semibold uppercase tracking-[0.16em] text-muted">
            Usage and activity
          </Text>
          <Text className="text-[13px] leading-6 text-muted">
            Inspect recent protocol activity, grant counts, and queued webhook
            deliveries for the selected app.
          </Text>
        </View>

        <View className="flex-row flex-wrap gap-2">
          <PrimaryButton
            label={usageLoading ? "Loading..." : "Load activity"}
            loading={usageLoading}
            onPress={() => {
              void loadUsageSummary();
            }}
          />
          <PrimaryButton
            label={dispatchingQueue ? "Dispatching..." : "Dispatch queue"}
            loading={dispatchingQueue}
            onPress={() => {
              void dispatchQueue();
            }}
            variant="secondary"
          />
        </View>

        {usageError ? (
          <Text className="text-[13px] leading-6 text-[#fca5a5]">
            {usageError}
          </Text>
        ) : null}

        {usageNotice ? (
          <Text className="text-[13px] leading-6 text-muted">
            {usageNotice}
          </Text>
        ) : null}

        {usageSummary ? (
          <View className="space-y-3">
            <View className="flex-row flex-wrap gap-3">
              <Metric label="Active grants" value={usageSummary.grantCounts.active} />
              <Metric label="Revoked grants" value={usageSummary.grantCounts.revoked} />
              <Metric label="Queued deliveries" value={usageSummary.deliveryCounts.queued} />
              <Metric label="Latest cursor" value={usageSummary.latestCursor} />
            </View>

            <View className="gap-2 rounded-2xl border border-hairline bg-surfaceMuted/70 px-3 py-3">
              <Text className="text-[12px] font-semibold uppercase tracking-[0.16em] text-muted">
                Token audit
              </Text>
              <Text className="text-[12px] text-muted">
                Last rotated: {usageSummary.tokenAudit.lastRotatedAt ?? "Never"}
              </Text>
              <Text className="text-[12px] text-muted">
                Last revoked: {usageSummary.tokenAudit.lastRevokedAt ?? "Never"}
              </Text>
              <Text className="text-[12px] text-muted">
                App updated: {usageSummary.tokenAudit.appUpdatedAt}
              </Text>
            </View>

            <View className="gap-2 rounded-2xl border border-hairline bg-surfaceMuted/70 px-3 py-3">
              <Text className="text-[12px] font-semibold uppercase tracking-[0.16em] text-muted">
                Grant audit
              </Text>
              <Text className="text-[12px] text-muted">
                Last granted: {usageSummary.grantAudit.lastGrantedAt ?? "Never"}
              </Text>
              <Text className="text-[12px] text-muted">
                Last revoked: {usageSummary.grantAudit.lastRevokedAt ?? "Never"}
              </Text>
            </View>

            <View className="space-y-2">
              <Text className="text-[12px] font-semibold uppercase tracking-[0.16em] text-muted">
                Recent events
              </Text>
              {usageSummary.recentEvents.length === 0 ? (
                <Text className="text-[13px] text-muted">
                  No protocol activity recorded yet.
                </Text>
              ) : (
                usageSummary.recentEvents
                  .slice(0, 5)
                  .map((event: ProtocolUsageEvent, index: number) => (
                  <View
                    key={`${event.event}:${event.issuedAt}:${index}`}
                    className="gap-1 rounded-2xl border border-hairline bg-surfaceMuted/70 px-3 py-3"
                  >
                    <View className="flex-row items-start justify-between gap-3">
                      <Text className="min-w-0 flex-1 text-[13px] font-medium text-ink">
                        {event.event}
                      </Text>
                      <Text className="text-[11px] uppercase tracking-[0.16em] text-muted">
                        {event.resource ?? "protocol"}
                      </Text>
                    </View>
                    <Text className="text-[12px] text-muted">{event.issuedAt}</Text>
                  </View>
                  ))
              )}
            </View>
          </View>
        ) : null}
      </View>

      <View className="space-y-3 rounded-[24px] border border-hairline bg-surface px-4 py-4">
        <View className="space-y-1">
          <Text className="text-[12px] font-semibold uppercase tracking-[0.16em] text-muted">
            Scope grants
          </Text>
          <Text className="text-[13px] leading-6 text-muted">
            Read the active grants for the selected app, and revoke one if you
            need to test a rollback.
          </Text>
        </View>

        <PrimaryButton
          label={grantsLoading ? "Loading..." : "Load grants"}
          loading={grantsLoading}
          onPress={() => {
            void loadGrants();
          }}
        />

        {grantsError ? (
          <Text className="text-[13px] leading-6 text-[#fca5a5]">
            {grantsError}
          </Text>
        ) : null}

        <View className="space-y-2">
          <Text className="text-[12px] font-semibold uppercase tracking-[0.16em] text-muted">
            Loaded grants
          </Text>
          {grants.length === 0 ? (
            <Text className="text-[13px] text-muted">
              {selectedApp
                ? "No grants loaded yet."
                : "Select an app above to inspect its grants."}
            </Text>
          ) : (
            grants.map((grant) => (
              <View
                key={grant.grantId}
                className="gap-2 rounded-2xl border border-hairline bg-surfaceMuted/70 px-3 py-3"
              >
                <View className="flex-row items-start justify-between gap-3">
                  <View className="min-w-0 flex-1">
                    <Text className="text-[13px] font-medium text-ink">
                      {grant.scope}
                    </Text>
                    <Text className="text-[12px] text-muted">
                      {grant.subjectType} · {grant.subjectId}
                    </Text>
                  </View>
                  <Text className="text-[11px] uppercase tracking-[0.16em] text-muted">
                    {grant.status}
                  </Text>
                </View>
                <Text className="text-[12px] text-muted">{grant.grantId}</Text>
                <View className="flex-row flex-wrap gap-2">
                  <Chip label={`created ${grant.createdAt.slice(0, 10)}`} />
                  {grant.revokedAt ? (
                    <Chip label={`revoked ${grant.revokedAt.slice(0, 10)}`} />
                  ) : null}
                </View>
                {grant.status === "active" ? (
                  <PrimaryButton
                    label="Revoke"
                    loading={grantsLoading}
                    onPress={() => {
                      void revokeGrant(grant.grantId);
                    }}
                    variant="secondary"
                  />
                ) : null}
              </View>
            ))
          )}
        </View>
      </View>
    </View>
  );
}
