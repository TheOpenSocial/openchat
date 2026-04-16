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
type ProtocolConsentRequestRecord = Awaited<
  ReturnType<typeof api.listProtocolConsentRequests>
>[number];
type ProtocolUsageSummary = Awaited<
  ReturnType<typeof api.getProtocolUsageSummary>
>;
type ProtocolUsageEvent = ProtocolUsageSummary["recentEvents"][number];
type ProtocolDeliveryQueueInspection = Awaited<
  ReturnType<typeof api.inspectProtocolDeliveryQueue>
>;
type ProtocolWebhookDelivery =
  ProtocolDeliveryQueueInspection["deliveries"][number];
type ProtocolWebhookDeliveryAttempt = Awaited<
  ReturnType<typeof api.listProtocolWebhookDeliveryAttempts>
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
  const [grants, setGrants] = useState<ProtocolScopeGrantRecord[]>([]);
  const [grantsLoading, setGrantsLoading] = useState(false);
  const [grantsError, setGrantsError] = useState<string | null>(null);
  const [consentRequests, setConsentRequests] = useState<
    ProtocolConsentRequestRecord[]
  >([]);
  const [consentRequestsLoading, setConsentRequestsLoading] = useState(false);
  const [consentRequestsError, setConsentRequestsError] = useState<
    string | null
  >(null);
  const [usageSummary, setUsageSummary] = useState<ProtocolUsageSummary | null>(
    null,
  );
  const [usageLoading, setUsageLoading] = useState(false);
  const [usageError, setUsageError] = useState<string | null>(null);
  const [usageNotice, setUsageNotice] = useState<string | null>(null);
  const [dispatchingQueue, setDispatchingQueue] = useState(false);
  const [queueInspection, setQueueInspection] =
    useState<ProtocolDeliveryQueueInspection | null>(null);
  const [deliveryAttempts, setDeliveryAttempts] = useState<
    Record<string, ProtocolWebhookDeliveryAttempt[]>
  >({});
  const [tokenNotice, setTokenNotice] = useState<string | null>(null);
  const [rotatingToken, setRotatingToken] = useState(false);
  const [revokingToken, setRevokingToken] = useState(false);
  const [replayingDeliveryId, setReplayingDeliveryId] = useState<string | null>(
    null,
  );
  const [replayingDeadLetters, setReplayingDeadLetters] = useState(false);
  const [grantScope, setGrantScope] = useState("actions.invoke");
  const [grantCapabilities, setGrantCapabilities] = useState(
    "intent.write,request.write,chat.write",
  );
  const [grantSubjectType, setGrantSubjectType] = useState("user");
  const [grantSubjectId, setGrantSubjectId] = useState("");
  const [requestScope, setRequestScope] = useState("actions.invoke");
  const [requestCapabilities, setRequestCapabilities] = useState(
    "intent.write,request.write,chat.write",
  );
  const [requestSubjectType, setRequestSubjectType] = useState("user");
  const [requestSubjectId, setRequestSubjectId] = useState("");

  const resetInspectionState = (options?: { clearToken?: boolean }) => {
    setWebhooks([]);
    setWebhooksError(null);
    setGrants([]);
    setGrantsError(null);
    setConsentRequests([]);
    setConsentRequestsError(null);
    setUsageSummary(null);
    setUsageError(null);
    setUsageNotice(null);
    setQueueInspection(null);
    setDeliveryAttempts({});
    setTokenNotice(null);
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
    setConsentRequestsError(null);
    try {
      const [nextGrantsResult, nextConsentRequestsResult] =
        await Promise.allSettled([
          api.listProtocolGrants(selectedAppId.trim(), appToken.trim()),
          api.listProtocolConsentRequests(
            selectedAppId.trim(),
            appToken.trim(),
          ),
        ]);
      if (nextGrantsResult.status === "fulfilled") {
        setGrants(nextGrantsResult.value);
      } else {
        setGrants([]);
        setGrantsError(
          `Could not load grants: ${String(nextGrantsResult.reason)}`,
        );
      }
      if (nextConsentRequestsResult.status === "fulfilled") {
        setConsentRequests(nextConsentRequestsResult.value);
        setConsentRequestsError(null);
      } else {
        setConsentRequests([]);
        setConsentRequestsError(
          `Could not load consent requests: ${String(
            nextConsentRequestsResult.reason,
          )}`,
        );
      }
    } catch (loadError) {
      setGrants([]);
      setConsentRequests([]);
      setGrantsError(`Could not load grants: ${String(loadError)}`);
      setConsentRequestsError(
        `Could not load consent requests: ${String(loadError)}`,
      );
    } finally {
      setGrantsLoading(false);
    }
  };

  const createConsentRequest = async () => {
    if (!selectedAppId.trim() || !appToken.trim()) {
      setConsentRequestsError(
        "Select an app and paste its token before creating a consent request.",
      );
      return;
    }
    setConsentRequestsLoading(true);
    setConsentRequestsError(null);
    try {
      const created = await api.createProtocolConsentRequest(
        selectedAppId.trim(),
        appToken.trim(),
        {
          scope: requestScope as never,
          capabilities: requestCapabilities
            .split(",")
            .map((value) => value.trim())
            .filter(Boolean) as never,
          subjectType: requestSubjectType as never,
          subjectId: requestSubjectId.trim() || undefined,
          metadata: { source: "mobile_settings_panel" },
        },
      );
      setConsentRequests((current) => [
        created,
        ...current.filter((request) => request.requestId !== created.requestId),
      ]);
    } catch (createError) {
      setConsentRequestsError(
        `Could not create consent request: ${String(createError)}`,
      );
    } finally {
      setConsentRequestsLoading(false);
    }
  };

  const approveConsentRequest = async (requestId: string) => {
    if (!selectedAppId.trim() || !appToken.trim()) {
      setConsentRequestsError(
        "Select an app and paste its token before approving.",
      );
      return;
    }
    setConsentRequestsLoading(true);
    setConsentRequestsError(null);
    try {
      const updated = await api.approveProtocolConsentRequest(
        selectedAppId.trim(),
        appToken.trim(),
        requestId,
        {
          metadata: { source: "mobile_settings_panel" },
        },
      );
      setConsentRequests((current) =>
        current.map((request) =>
          request.requestId === requestId ? updated : request,
        ),
      );
    } catch (approveError) {
      setConsentRequestsError(
        `Could not approve request: ${String(approveError)}`,
      );
    } finally {
      setConsentRequestsLoading(false);
    }
  };

  const rejectConsentRequest = async (requestId: string) => {
    if (!selectedAppId.trim() || !appToken.trim()) {
      setConsentRequestsError(
        "Select an app and paste its token before rejecting.",
      );
      return;
    }
    setConsentRequestsLoading(true);
    setConsentRequestsError(null);
    try {
      const updated = await api.rejectProtocolConsentRequest(
        selectedAppId.trim(),
        appToken.trim(),
        requestId,
        {
          metadata: { source: "mobile_settings_panel" },
        },
      );
      setConsentRequests((current) =>
        current.map((request) =>
          request.requestId === requestId ? updated : request,
        ),
      );
    } catch (rejectError) {
      setConsentRequestsError(
        `Could not reject request: ${String(rejectError)}`,
      );
    } finally {
      setConsentRequestsLoading(false);
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

  const loadQueueInspection = async () => {
    if (!selectedAppId.trim() || !appToken.trim()) {
      setUsageError(
        "Select an app and paste its token to inspect queue state.",
      );
      return;
    }
    try {
      const inspection = await api.inspectProtocolDeliveryQueue(
        selectedAppId.trim(),
        appToken.trim(),
      );
      setQueueInspection(inspection);
    } catch (loadError) {
      setUsageError(`Could not inspect queue: ${String(loadError)}`);
      setQueueInspection(null);
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
      void loadQueueInspection();
    } catch (dispatchError) {
      setUsageError(
        `Could not dispatch delivery queue: ${String(dispatchError)}`,
      );
    } finally {
      setDispatchingQueue(false);
    }
  };

  const createGrant = async () => {
    if (!selectedAppId.trim() || !appToken.trim()) {
      setGrantsError(
        "Select an app and paste its token before creating a grant.",
      );
      return;
    }
    setGrantsLoading(true);
    setGrantsError(null);
    try {
      const created = await api.createProtocolGrant(
        selectedAppId.trim(),
        appToken.trim(),
        {
          scope: grantScope as never,
          capabilities: grantCapabilities
            .split(",")
            .map((value) => value.trim())
            .filter(Boolean) as never,
          subjectType: grantSubjectType as never,
          subjectId: grantSubjectId.trim() || undefined,
          metadata: { source: "mobile_settings_panel" },
        },
      );
      setGrants((current) => [
        created,
        ...current.filter((g) => g.grantId !== created.grantId),
      ]);
    } catch (createError) {
      setGrantsError(`Could not create grant: ${String(createError)}`);
    } finally {
      setGrantsLoading(false);
    }
  };

  const rotateToken = async () => {
    if (!selectedAppId.trim() || !appToken.trim()) {
      setUsageError("Select an app and paste its token before rotating.");
      return;
    }
    setRotatingToken(true);
    setUsageError(null);
    setTokenNotice(null);
    try {
      const rotated = await api.rotateProtocolAppToken(
        selectedAppId.trim(),
        appToken.trim(),
      );
      setAppToken(rotated.credentials.appToken);
      setTokenNotice(
        "Token rotated. The new token is now loaded in this inspector.",
      );
      void loadUsageSummary();
    } catch (rotateError) {
      setUsageError(`Could not rotate token: ${String(rotateError)}`);
    } finally {
      setRotatingToken(false);
    }
  };

  const revokeToken = async () => {
    if (!selectedAppId.trim() || !appToken.trim()) {
      setUsageError("Select an app and paste its token before revoking.");
      return;
    }
    setRevokingToken(true);
    setUsageError(null);
    setTokenNotice(null);
    try {
      await api.revokeProtocolAppToken(selectedAppId.trim(), appToken.trim());
      setAppToken("");
      resetInspectionState();
      setTokenNotice(
        "Token revoked. Rotate or re-register the app before inspecting again.",
      );
    } catch (revokeError) {
      setUsageError(`Could not revoke token: ${String(revokeError)}`);
    } finally {
      setRevokingToken(false);
    }
  };

  const inspectAttempts = async (deliveryId: string) => {
    if (!selectedAppId.trim() || !appToken.trim()) {
      return;
    }
    try {
      const attempts = await api.listProtocolWebhookDeliveryAttempts(
        selectedAppId.trim(),
        appToken.trim(),
        deliveryId,
      );
      setDeliveryAttempts((current) => ({
        ...current,
        [deliveryId]: attempts,
      }));
    } catch (loadError) {
      setUsageError(
        `Could not inspect delivery attempts: ${String(loadError)}`,
      );
    }
  };

  const replayDelivery = async (deliveryId: string) => {
    if (!selectedAppId.trim() || !appToken.trim()) {
      setUsageError(
        "Select an app and paste its token before replaying a delivery.",
      );
      return;
    }
    setReplayingDeliveryId(deliveryId);
    setUsageError(null);
    setUsageNotice(null);
    try {
      const result = await api.replayProtocolWebhookDelivery(
        selectedAppId.trim(),
        appToken.trim(),
        deliveryId,
      );
      setUsageNotice(
        `Re-queued delivery ${result.deliveryId.slice(0, 8)} for replay.`,
      );
      await Promise.all([loadQueueInspection(), loadUsageSummary()]);
    } catch (replayError) {
      setUsageError(`Could not replay delivery: ${String(replayError)}`);
    } finally {
      setReplayingDeliveryId(null);
    }
  };

  const replayDeadLetters = async () => {
    if (!selectedAppId.trim() || !appToken.trim()) {
      setUsageError(
        "Select an app and paste its token before replaying dead letters.",
      );
      return;
    }
    setReplayingDeadLetters(true);
    setUsageError(null);
    setUsageNotice(null);
    try {
      const result = await api.replayProtocolDeadLetteredDeliveries(
        selectedAppId.trim(),
        appToken.trim(),
        { limit: 25 },
      );
      setUsageNotice(
        result.replayedCount === 0
          ? "No dead-lettered deliveries were eligible for replay."
          : `Re-queued ${result.replayedCount} dead-lettered deliveries.`,
      );
      await Promise.all([loadQueueInspection(), loadUsageSummary()]);
    } catch (replayError) {
      setUsageError(`Could not replay dead letters: ${String(replayError)}`);
    } finally {
      setReplayingDeadLetters(false);
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
          webhook state. Delivery queue dispatch is available for operational
          testing.
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
                {queueInspection?.deliveries
                  .filter(
                    (delivery: ProtocolWebhookDelivery) =>
                      delivery.subscriptionId === webhook.subscriptionId,
                  )
                  .slice(0, 2)
                  .map((delivery: ProtocolWebhookDelivery) => (
                    <View
                      key={delivery.deliveryId}
                      className="mt-2 gap-1 rounded-xl border border-hairline bg-surface px-3 py-2"
                    >
                      <Text className="text-[12px] font-medium text-ink">
                        {delivery.eventName} · {delivery.status}
                      </Text>
                      <Pressable
                        onPress={() => {
                          void inspectAttempts(delivery.deliveryId);
                        }}
                      >
                        <Text className="text-[12px] text-muted">
                          Inspect attempts
                        </Text>
                      </Pressable>
                      {delivery.status === "dead_lettered" ? (
                        <Pressable
                          onPress={() => {
                            void replayDelivery(delivery.deliveryId);
                          }}
                        >
                          <Text className="text-[12px] text-muted">
                            {replayingDeliveryId === delivery.deliveryId
                              ? "Replaying..."
                              : "Replay delivery"}
                          </Text>
                        </Pressable>
                      ) : null}
                      {(deliveryAttempts[delivery.deliveryId] ?? [])
                        .slice(0, 2)
                        .map((attempt) => (
                          <Text
                            key={`${attempt.deliveryId}:${attempt.attemptNumber}`}
                            className="text-[11px] text-muted"
                          >
                            Attempt {attempt.attemptNumber} · {attempt.outcome}
                            {attempt.errorCode ? ` · ${attempt.errorCode}` : ""}
                          </Text>
                        ))}
                    </View>
                  ))}
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
          <PrimaryButton
            label="Inspect queue"
            onPress={() => {
              void loadQueueInspection();
            }}
            variant="secondary"
          />
          <PrimaryButton
            label={
              replayingDeadLetters ? "Replaying..." : "Replay dead letters"
            }
            loading={replayingDeadLetters}
            onPress={() => {
              void replayDeadLetters();
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

        {tokenNotice ? (
          <Text className="text-[13px] leading-6 text-muted">
            {tokenNotice}
          </Text>
        ) : null}

        {usageSummary ? (
          <View className="space-y-3">
            <View className="flex-row flex-wrap gap-3">
              <Metric
                label="Active grants"
                value={usageSummary.grantCounts.active}
              />
              <Metric
                label="Pending requests"
                value={usageSummary.consentRequestCounts.pending}
              />
              <Metric
                label="Revoked grants"
                value={usageSummary.grantCounts.revoked}
              />
              <Metric
                label="Queued deliveries"
                value={usageSummary.deliveryCounts.queued}
              />
              <Metric
                label="Replayable"
                value={usageSummary.queueHealth.replayableCount}
              />
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
              <Text className="text-[12px] text-muted">
                Subjects: user {usageSummary.grantSubjectCounts.user} · app{" "}
                {usageSummary.grantSubjectCounts.app} · service{" "}
                {usageSummary.grantSubjectCounts.service} · agent{" "}
                {usageSummary.grantSubjectCounts.agent}
              </Text>
              <Text className="text-[12px] text-muted">
                Delegated execution currently runs for:{" "}
                {usageSummary.delegatedExecutionSupport.executableSubjectTypes.join(
                  ", ",
                )}
              </Text>
            </View>

            <View className="gap-2 rounded-2xl border border-hairline bg-surfaceMuted/70 px-3 py-3">
              <Text className="text-[12px] font-semibold uppercase tracking-[0.16em] text-muted">
                Queue health
              </Text>
              <Text className="text-[12px] text-muted">
                Oldest queued:{" "}
                {usageSummary.queueHealth.oldestQueuedAt ?? "None"}
              </Text>
              <Text className="text-[12px] text-muted">
                Oldest retrying:{" "}
                {usageSummary.queueHealth.oldestRetryingAt ?? "None"}
              </Text>
              <Text className="text-[12px] text-muted">
                Last dead-lettered:{" "}
                {usageSummary.queueHealth.lastDeadLetteredAt ?? "Never"}
              </Text>
            </View>

            {queueInspection ? (
              <View className="gap-2 rounded-2xl border border-hairline bg-surfaceMuted/70 px-3 py-3">
                <Text className="text-[12px] font-semibold uppercase tracking-[0.16em] text-muted">
                  Queue state
                </Text>
                <Text className="text-[12px] text-muted">
                  Waiting {queueInspection.queueState?.waiting ?? 0} · Active{" "}
                  {queueInspection.queueState?.active ?? 0} · Delayed{" "}
                  {queueInspection.queueState?.delayed ?? 0}
                </Text>
                <Text className="text-[12px] text-muted">
                  Completed {queueInspection.queueState?.completed ?? 0} ·
                  Failed {queueInspection.queueState?.failed ?? 0}
                </Text>
                <Text className="text-[12px] text-muted">
                  Replayable dead letters {queueInspection.replayableCount ?? 0}
                </Text>
              </View>
            ) : null}

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
                      <Text className="text-[12px] text-muted">
                        {event.issuedAt}
                      </Text>
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
            Delegated access
          </Text>
          <Text className="text-[13px] leading-6 text-muted">
            Grant a selected app scoped permission to act on behalf of a user,
            service, or agent.
          </Text>
        </View>

        <CalmTextField
          autoCapitalize="none"
          autoCorrect={false}
          containerClassName="gap-2"
          inputClassName="text-ink"
          label="Permission scope"
          onChangeText={setGrantScope}
          placeholder="actions.invoke"
          value={grantScope}
        />
        <CalmTextField
          autoCapitalize="none"
          autoCorrect={false}
          containerClassName="gap-2"
          inputClassName="text-ink"
          label="Allowed capabilities"
          onChangeText={setGrantCapabilities}
          placeholder="intent.write,request.write,chat.write"
          value={grantCapabilities}
        />
        <CalmTextField
          autoCapitalize="none"
          autoCorrect={false}
          containerClassName="gap-2"
          inputClassName="text-ink"
          label="Subject kind"
          onChangeText={setGrantSubjectType}
          placeholder="user"
          value={grantSubjectType}
        />
        <CalmTextField
          autoCapitalize="none"
          autoCorrect={false}
          containerClassName="gap-2"
          inputClassName="text-ink"
          label="Subject id"
          onChangeText={setGrantSubjectId}
          placeholder="user uuid"
          value={grantSubjectId}
        />

        <View className="flex-row flex-wrap gap-2">
          <PrimaryButton
            label={grantsLoading ? "Loading..." : "Load delegated access"}
            loading={grantsLoading}
            onPress={() => {
              void loadGrants();
            }}
          />
          <PrimaryButton
            label={grantsLoading ? "Saving..." : "Grant access"}
            loading={grantsLoading}
            onPress={() => {
              void createGrant();
            }}
            variant="secondary"
          />
        </View>

        {grantsError ? (
          <Text className="text-[13px] leading-6 text-[#fca5a5]">
            {grantsError}
          </Text>
        ) : null}

        <View className="space-y-2 rounded-[24px] border border-hairline bg-surfaceMuted/50 px-3 py-3">
          <Text className="text-[12px] font-semibold uppercase tracking-[0.16em] text-muted">
            Pending consent requests
          </Text>
          <Text className="text-[13px] leading-6 text-muted">
            Requests stay separate from active grants. Approving one resolves it
            into a grant; rejecting leaves current grants untouched.
          </Text>

          <CalmTextField
            autoCapitalize="none"
            autoCorrect={false}
            containerClassName="gap-2"
            inputClassName="text-ink"
            label="Permission scope"
            onChangeText={setRequestScope}
            placeholder="actions.invoke"
            value={requestScope}
          />
          <CalmTextField
            autoCapitalize="none"
            autoCorrect={false}
            containerClassName="gap-2"
            inputClassName="text-ink"
            label="Allowed capabilities"
            onChangeText={setRequestCapabilities}
            placeholder="intent.write,request.write,chat.write"
            value={requestCapabilities}
          />
          <CalmTextField
            autoCapitalize="none"
            autoCorrect={false}
            containerClassName="gap-2"
            inputClassName="text-ink"
            label="Subject kind"
            onChangeText={setRequestSubjectType}
            placeholder="user"
            value={requestSubjectType}
          />
          <CalmTextField
            autoCapitalize="none"
            autoCorrect={false}
            containerClassName="gap-2"
            inputClassName="text-ink"
            label="Subject id"
            onChangeText={setRequestSubjectId}
            placeholder="user uuid"
            value={requestSubjectId}
          />

          <PrimaryButton
            label={
              consentRequestsLoading ? "Saving..." : "Request consent approval"
            }
            loading={consentRequestsLoading}
            onPress={() => {
              void createConsentRequest();
            }}
            variant="secondary"
          />
        </View>

        {consentRequestsError ? (
          <Text className="text-[13px] leading-6 text-[#fca5a5]">
            {consentRequestsError}
          </Text>
        ) : null}

        <View className="space-y-2">
          <Text className="text-[12px] font-semibold uppercase tracking-[0.16em] text-muted">
            Consent request ledger
          </Text>
          {consentRequests.length === 0 ? (
            <Text className="text-[13px] text-muted">
              {selectedApp
                ? "No consent requests loaded yet."
                : "Select an app above to inspect its consent requests."}
            </Text>
          ) : (
            consentRequests.map((request) => (
              <View
                key={request.requestId}
                className="gap-2 rounded-2xl border border-hairline bg-surfaceMuted/70 px-3 py-3"
              >
                <View className="flex-row items-start justify-between gap-3">
                  <View className="min-w-0 flex-1">
                    <Text className="text-[13px] font-medium text-ink">
                      {request.scope}
                    </Text>
                    <Text className="text-[12px] text-muted">
                      {request.subjectType} · {request.subjectId}
                    </Text>
                  </View>
                  <Text className="text-[11px] uppercase tracking-[0.16em] text-muted">
                    {request.status}
                  </Text>
                </View>
                <Text className="text-[12px] text-muted">
                  {request.requestId}
                </Text>
                <View className="flex-row flex-wrap gap-2">
                  <Chip
                    label={`requested ${request.requestedAt.slice(0, 10)}`}
                  />
                  {request.approvedAt ? (
                    <Chip
                      label={`approved ${request.approvedAt.slice(0, 10)}`}
                    />
                  ) : null}
                  {request.rejectedAt ? (
                    <Chip
                      label={`rejected ${request.rejectedAt.slice(0, 10)}`}
                    />
                  ) : null}
                </View>
                {request.status === "pending" ? (
                  <View className="flex-row flex-wrap gap-2">
                    <PrimaryButton
                      label="Approve"
                      loading={consentRequestsLoading}
                      onPress={() => {
                        void approveConsentRequest(request.requestId);
                      }}
                    />
                    <PrimaryButton
                      label="Reject"
                      loading={consentRequestsLoading}
                      onPress={() => {
                        void rejectConsentRequest(request.requestId);
                      }}
                      variant="secondary"
                    />
                  </View>
                ) : null}
              </View>
            ))
          )}
        </View>

        <View className="space-y-2">
          <Text className="text-[12px] font-semibold uppercase tracking-[0.16em] text-muted">
            Active access grants
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

      <View className="space-y-3 rounded-[24px] border border-hairline bg-surface px-4 py-4">
        <View className="space-y-1">
          <Text className="text-[12px] font-semibold uppercase tracking-[0.16em] text-muted">
            Token controls
          </Text>
          <Text className="text-[13px] leading-6 text-muted">
            Rotate or revoke the selected app token. Rotation replaces the token
            in this inspector.
          </Text>
        </View>
        <View className="flex-row flex-wrap gap-2">
          <PrimaryButton
            label={rotatingToken ? "Rotating..." : "Rotate token"}
            loading={rotatingToken}
            onPress={() => {
              void rotateToken();
            }}
            variant="secondary"
          />
          <PrimaryButton
            label={revokingToken ? "Revoking..." : "Revoke token"}
            loading={revokingToken}
            onPress={() => {
              void revokeToken();
            }}
            variant="secondary"
          />
        </View>
      </View>
    </View>
  );
}
