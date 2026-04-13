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
          Read-only inspection of the active protocol manifest, registered apps,
          and any webhook subscriptions you can inspect with an app token.
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
          onChangeText={setSelectedAppId}
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
    </View>
  );
}
