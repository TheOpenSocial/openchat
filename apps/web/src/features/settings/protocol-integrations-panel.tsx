"use client";

import { useEffect, useMemo, useState } from "react";

import {
  WorkspaceHeader,
  WorkspaceList,
  WorkspaceListItem,
  WorkspaceMutedPanel,
  WorkspacePanel,
  WorkspaceKicker,
} from "@/src/components/layout/workspace";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import { api } from "@/src/lib/api";
import { cn } from "@/src/lib/cn";

type ProtocolAppRecord = Awaited<
  ReturnType<typeof api.listProtocolApps>
>[number];
type ProtocolWebhookRecord = Awaited<
  ReturnType<typeof api.listProtocolWebhooks>
>[number];
type ProtocolWebhookDeliveryRecord = Awaited<
  ReturnType<typeof api.listProtocolWebhookDeliveries>
>[number];
type ProtocolGrantRecord = Awaited<
  ReturnType<typeof api.listProtocolGrants>
>[number];
type ProtocolReplayCursor = Awaited<
  ReturnType<typeof api.getProtocolReplayCursor>
>;
type ProtocolUsageSummary = Awaited<
  ReturnType<typeof api.getProtocolUsageSummary>
>;
type ProtocolDeliveryQueueInspection = Awaited<
  ReturnType<typeof api.inspectProtocolDeliveryQueue>
>;
type ProtocolWebhookDeliveryAttempt = Awaited<
  ReturnType<typeof api.listProtocolWebhookDeliveryAttempts>
>[number];

function joinNames(values?: readonly string[] | null) {
  if (!values || values.length === 0) {
    return "None";
  }
  return values.join(", ");
}

export function ProtocolIntegrationsPanel() {
  const [apps, setApps] = useState<ProtocolAppRecord[]>([]);
  const [loadingApps, setLoadingApps] = useState(true);
  const [appError, setAppError] = useState<string | null>(null);
  const [selectedAppId, setSelectedAppId] = useState("");
  const [appToken, setAppToken] = useState("");
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [webhooks, setWebhooks] = useState<ProtocolWebhookRecord[]>([]);
  const [grants, setGrants] = useState<ProtocolGrantRecord[]>([]);
  const [deliveries, setDeliveries] = useState<
    Record<string, ProtocolWebhookDeliveryRecord[]>
  >({});
  const [revokingGrantId, setRevokingGrantId] = useState<string | null>(null);
  const [replayCursor, setReplayCursor] = useState<ProtocolReplayCursor | null>(
    null,
  );
  const [usageSummary, setUsageSummary] = useState<ProtocolUsageSummary | null>(
    null,
  );
  const [dispatchingQueue, setDispatchingQueue] = useState(false);
  const [queueInspection, setQueueInspection] =
    useState<ProtocolDeliveryQueueInspection | null>(null);
  const [deliveryAttempts, setDeliveryAttempts] = useState<
    Record<string, ProtocolWebhookDeliveryAttempt[]>
  >({});
  const [grantScope, setGrantScope] = useState("actions.invoke");
  const [grantCapabilities, setGrantCapabilities] = useState(
    "intent.write,request.write,chat.write",
  );
  const [grantSubjectType, setGrantSubjectType] = useState("user");
  const [grantSubjectId, setGrantSubjectId] = useState("");
  const [rotatingToken, setRotatingToken] = useState(false);
  const [revokingToken, setRevokingToken] = useState(false);
  const [tokenNotice, setTokenNotice] = useState<string | null>(null);
  const [replayingDeliveryId, setReplayingDeliveryId] = useState<string | null>(
    null,
  );
  const [replayingDeadLetters, setReplayingDeadLetters] = useState(false);

  const resetInspectionState = (options?: { clearToken?: boolean }) => {
    setDetailsError(null);
    setWebhooks([]);
    setGrants([]);
    setDeliveries({});
    setReplayCursor(null);
    setUsageSummary(null);
    setQueueInspection(null);
    setDeliveryAttempts({});
    setTokenNotice(null);
    if (options?.clearToken) {
      setAppToken("");
    }
  };

  useEffect(() => {
    let active = true;
    setLoadingApps(true);
    setAppError(null);
    void api
      .listProtocolApps()
      .then((items: ProtocolAppRecord[]) => {
        if (!active) {
          return;
        }
        setApps(items);
        setSelectedAppId(
          (current) => current || items[0]?.registration.appId || "",
        );
      })
      .catch((error: unknown) => {
        if (!active) {
          return;
        }
        setAppError(String(error));
      })
      .finally(() => {
        if (active) {
          setLoadingApps(false);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  const selectedApp = useMemo(
    () =>
      apps.find(
        (entry) =>
          entry.registration.appId === selectedAppId ||
          entry.manifest.appId === selectedAppId,
      ) ?? null,
    [apps, selectedAppId],
  );

  const inspectApp = async () => {
    if (!selectedAppId.trim() || !appToken.trim()) {
      setDetailsError("App id and app token are required to inspect webhooks.");
      return;
    }

    setLoadingDetails(true);
    setDetailsError(null);
    try {
      const appId = selectedAppId.trim();
      const token = appToken.trim();
      const [appWebhooksResult, appGrantsResult, cursorResult, usageResult] =
        await Promise.allSettled([
          api.listProtocolWebhooks(appId, token),
          api.listProtocolGrants(appId, token),
          api.getProtocolReplayCursor(appId, token),
          api.getProtocolUsageSummary(appId, token),
        ]);
      if (appWebhooksResult.status !== "fulfilled") {
        throw appWebhooksResult.reason;
      }
      if (appGrantsResult.status !== "fulfilled") {
        throw appGrantsResult.reason;
      }
      const appWebhooks = appWebhooksResult.value;
      const appGrants = appGrantsResult.value;
      const deliveryEntries = await Promise.all(
        appWebhooks.map(
          async (webhook) =>
            [
              webhook.subscriptionId,
              await api
                .listProtocolWebhookDeliveries(
                  appId,
                  token,
                  webhook.subscriptionId,
                )
                .catch(() => []),
            ] as const,
        ),
      );

      setWebhooks(appWebhooks);
      setGrants(appGrants);
      setDeliveries(Object.fromEntries(deliveryEntries));
      setReplayCursor(
        cursorResult.status === "fulfilled" ? cursorResult.value : null,
      );
      setUsageSummary(
        usageResult.status === "fulfilled" ? usageResult.value : null,
      );
      if (
        cursorResult.status !== "fulfilled" ||
        usageResult.status !== "fulfilled"
      ) {
        setDetailsError(
          "Some protocol usage details could not be loaded. Core app data is shown.",
        );
      }
    } catch (error) {
      setDetailsError(String(error));
      setWebhooks([]);
      setGrants([]);
      setDeliveries({});
      setReplayCursor(null);
      setUsageSummary(null);
    } finally {
      setLoadingDetails(false);
    }
  };

  const revokeGrant = async (grantId: string) => {
    if (!selectedAppId.trim() || !appToken.trim()) {
      return;
    }

    setRevokingGrantId(grantId);
    setDetailsError(null);
    try {
      await api.revokeProtocolGrant(
        selectedAppId.trim(),
        appToken.trim(),
        grantId,
        {
          metadata: {
            source: "settings_screen",
          },
        },
      );
      setGrants((current) =>
        current.map((grant) =>
          grant.grantId === grantId
            ? {
                ...grant,
                status: "revoked",
                updatedAt: new Date().toISOString(),
                revokedAt: new Date().toISOString(),
              }
            : grant,
        ),
      );
    } catch (error) {
      setDetailsError(String(error));
    } finally {
      setRevokingGrantId(null);
    }
  };

  const dispatchQueue = async () => {
    if (!selectedAppId.trim() || !appToken.trim()) {
      return;
    }

    setDispatchingQueue(true);
    setDetailsError(null);
    try {
      await api.dispatchProtocolDeliveryQueue(
        selectedAppId.trim(),
        appToken.trim(),
        { limit: 25 },
      );
      try {
        const usage = await api.getProtocolUsageSummary(
          selectedAppId.trim(),
          appToken.trim(),
        );
        setUsageSummary(usage);
      } catch {
        setDetailsError(
          "Queue dispatch succeeded, but usage summary could not be refreshed yet.",
        );
      }
      try {
        const inspection = await api.inspectProtocolDeliveryQueue(
          selectedAppId.trim(),
          appToken.trim(),
        );
        setQueueInspection(inspection);
      } catch {
        // keep queue dispatch success state without replacing the primary result
      }
    } catch (error) {
      setDetailsError(String(error));
    } finally {
      setDispatchingQueue(false);
    }
  };

  const inspectQueue = async () => {
    if (!selectedAppId.trim() || !appToken.trim()) {
      return;
    }
    setDetailsError(null);
    try {
      const inspection = await api.inspectProtocolDeliveryQueue(
        selectedAppId.trim(),
        appToken.trim(),
      );
      setQueueInspection(inspection);
    } catch (error) {
      setDetailsError(String(error));
    }
  };

  const createGrant = async () => {
    if (!selectedAppId.trim() || !appToken.trim()) {
      return;
    }
    setDetailsError(null);
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
          metadata: {
            source: "web_settings_panel",
          },
        },
      );
      setGrants((current) => [
        created,
        ...current.filter((g) => g.grantId !== created.grantId),
      ]);
    } catch (error) {
      setDetailsError(String(error));
    }
  };

  const rotateToken = async () => {
    if (!selectedAppId.trim() || !appToken.trim()) {
      return;
    }
    setRotatingToken(true);
    setDetailsError(null);
    setTokenNotice(null);
    try {
      const rotated = await api.rotateProtocolAppToken(
        selectedAppId.trim(),
        appToken.trim(),
      );
      setAppToken(rotated.credentials.appToken);
      setTokenNotice(
        "Token rotated. The new token is now loaded in this panel.",
      );
    } catch (error) {
      setDetailsError(String(error));
    } finally {
      setRotatingToken(false);
    }
  };

  const revokeToken = async () => {
    if (!selectedAppId.trim() || !appToken.trim()) {
      return;
    }
    setRevokingToken(true);
    setDetailsError(null);
    setTokenNotice(null);
    try {
      await api.revokeProtocolAppToken(selectedAppId.trim(), appToken.trim());
      setAppToken("");
      resetInspectionState();
      setTokenNotice(
        "Token revoked. Rotate or re-register the app before inspecting again.",
      );
    } catch (error) {
      setDetailsError(String(error));
    } finally {
      setRevokingToken(false);
    }
  };

  const inspectAttempts = async (deliveryId: string) => {
    if (!selectedAppId.trim() || !appToken.trim()) {
      return;
    }
    setDetailsError(null);
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
    } catch (error) {
      setDetailsError(String(error));
    }
  };

  const replayDelivery = async (deliveryId: string) => {
    if (!selectedAppId.trim() || !appToken.trim()) {
      setDetailsError("Select an app and paste its token before replaying.");
      return;
    }
    setReplayingDeliveryId(deliveryId);
    setDetailsError(null);
    setTokenNotice(null);
    try {
      const result = await api.replayProtocolWebhookDelivery(
        selectedAppId.trim(),
        appToken.trim(),
        deliveryId,
      );
      setTokenNotice(
        `Re-queued delivery ${result.deliveryId.slice(0, 8)} for replay.`,
      );
      await Promise.all([inspectApp(), inspectQueue()]);
    } catch (replayError) {
      setDetailsError(`Could not replay delivery: ${String(replayError)}`);
    } finally {
      setReplayingDeliveryId(null);
    }
  };

  const replayDeadLetters = async () => {
    if (!selectedAppId.trim() || !appToken.trim()) {
      setDetailsError("Select an app and paste its token before replaying.");
      return;
    }
    setReplayingDeadLetters(true);
    setDetailsError(null);
    setTokenNotice(null);
    try {
      const result = await api.replayProtocolDeadLetteredDeliveries(
        selectedAppId.trim(),
        appToken.trim(),
        { limit: 25 },
      );
      setTokenNotice(
        result.replayedCount === 0
          ? "No dead-lettered deliveries were eligible for replay."
          : `Re-queued ${result.replayedCount} dead-lettered deliveries.`,
      );
      await Promise.all([inspectApp(), inspectQueue()]);
    } catch (replayError) {
      setDetailsError(`Could not replay dead letters: ${String(replayError)}`);
    } finally {
      setReplayingDeadLetters(false);
    }
  };

  return (
    <WorkspacePanel>
      <WorkspaceHeader
        description="Read-only protocol inventory for registered apps, webhooks, deliveries, and replay state."
        title="Protocol integrations"
      />

      <div className="mt-4 space-y-4">
        <WorkspaceMutedPanel>
          <p className="text-sm leading-6 text-[hsl(var(--muted-foreground))]">
            This surface reads protocol apps and webhook state only. To inspect
            a specific app’s webhooks, scope grants, and replay cursor, paste
            its app token below.
          </p>
        </WorkspaceMutedPanel>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="protocol-app-id">App id</Label>
            <Input
              id="protocol-app-id"
              onChange={(event) => {
                setSelectedAppId(event.currentTarget.value);
                resetInspectionState();
              }}
              placeholder="partner.alpha"
              value={selectedAppId}
            />
          </div>
          <div>
            <Label htmlFor="protocol-app-token">App token</Label>
            <Input
              id="protocol-app-token"
              onChange={(event) => setAppToken(event.currentTarget.value)}
              placeholder="Paste token to inspect webhooks"
              type="password"
              value={appToken}
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            disabled={
              loadingDetails || !selectedAppId.trim() || !appToken.trim()
            }
            onClick={() => {
              void inspectApp();
            }}
            type="button"
            variant="primary"
          >
            {loadingDetails ? "Inspecting…" : "Inspect webhooks"}
          </Button>
          <Button
            disabled={
              dispatchingQueue ||
              loadingDetails ||
              !selectedAppId.trim() ||
              !appToken.trim()
            }
            onClick={() => {
              void dispatchQueue();
            }}
            type="button"
            variant="secondary"
          >
            {dispatchingQueue ? "Dispatching…" : "Dispatch queue"}
          </Button>
          <Button
            disabled={
              loadingDetails || !selectedAppId.trim() || !appToken.trim()
            }
            onClick={() => {
              void inspectQueue();
            }}
            type="button"
            variant="secondary"
          >
            Inspect queue
          </Button>
          <Badge variant="default">
            {loadingApps ? "Loading apps…" : `${apps.length} protocol apps`}
          </Badge>
          {selectedApp ? (
            <Badge variant="default">
              Selected:{" "}
              {selectedApp.registration.name ?? selectedApp.registration.appId}
            </Badge>
          ) : null}
        </div>

        {appError ? (
          <WorkspaceMutedPanel>
            <p className="text-sm leading-6 text-rose-200">
              Could not load protocol apps: {appError}
            </p>
          </WorkspaceMutedPanel>
        ) : null}

        {detailsError ? (
          <WorkspaceMutedPanel>
            <p className="text-sm leading-6 text-rose-200">
              Could not inspect protocol app: {detailsError}
            </p>
          </WorkspaceMutedPanel>
        ) : null}

        {tokenNotice ? (
          <WorkspaceMutedPanel>
            <p className="text-sm leading-6 text-[hsl(var(--muted-foreground))]">
              {tokenNotice}
            </p>
          </WorkspaceMutedPanel>
        ) : null}

        <WorkspaceList>
          {apps.map((app) => (
            <WorkspaceListItem
              className={cn(
                "grid gap-3 rounded-2xl border border-transparent px-0 transition",
                app.registration.appId === selectedAppId
                  ? "bg-white/3"
                  : undefined,
              )}
              key={app.registration.appId}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <WorkspaceKicker>
                    {app.registration.kind ?? "Protocol app"}
                  </WorkspaceKicker>
                  <p className="mt-1 truncate text-sm font-semibold text-[hsl(var(--foreground))]">
                    {app.manifest.name ?? app.registration.name}
                  </p>
                  <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
                    {app.registration.appId}
                  </p>
                </div>
                <Button
                  onClick={() => {
                    setSelectedAppId(app.registration.appId);
                    resetInspectionState({ clearToken: true });
                  }}
                  type="button"
                  variant="secondary"
                >
                  Select
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge variant="default">
                  Scopes: {joinNames(app.issuedScopes)}
                </Badge>
                <Badge variant="default">
                  Capabilities: {joinNames(app.issuedCapabilities)}
                </Badge>
              </div>
            </WorkspaceListItem>
          ))}
          {loadingApps ? (
            <WorkspaceListItem>
              <p className="text-sm text-[hsl(var(--muted-foreground))]">
                Loading protocol apps…
              </p>
            </WorkspaceListItem>
          ) : apps.length === 0 ? (
            <WorkspaceListItem>
              <p className="text-sm text-[hsl(var(--muted-foreground))]">
                No protocol apps are registered yet.
              </p>
            </WorkspaceListItem>
          ) : null}
        </WorkspaceList>

        {grants.length > 0 ||
        webhooks.length > 0 ||
        replayCursor ||
        usageSummary ? (
          <div className="space-y-3">
            {usageSummary ? (
              <WorkspaceMutedPanel>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="default">
                    Active grants: {usageSummary.grantCounts.active}
                  </Badge>
                  <Badge variant="default">
                    Revoked grants: {usageSummary.grantCounts.revoked}
                  </Badge>
                  <Badge variant="default">
                    Queued deliveries: {usageSummary.deliveryCounts.queued}
                  </Badge>
                  <Badge variant="default">
                    Replayable: {usageSummary.queueHealth.replayableCount}
                  </Badge>
                  <Badge variant="default">
                    Latest cursor: {usageSummary.latestCursor}
                  </Badge>
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel))]/60 px-3 py-3 text-sm">
                    <p className="text-xs uppercase tracking-[0.2em] text-[hsl(var(--muted-foreground))]">
                      Token audit
                    </p>
                    <p className="mt-2 text-[hsl(var(--foreground))]">
                      Last rotated:{" "}
                      {usageSummary.tokenAudit.lastRotatedAt ?? "Never"}
                    </p>
                    <p className="mt-1 text-[hsl(var(--foreground))]">
                      Last revoked:{" "}
                      {usageSummary.tokenAudit.lastRevokedAt ?? "Never"}
                    </p>
                    <p className="mt-1 text-[hsl(var(--foreground))]">
                      App updated: {usageSummary.tokenAudit.appUpdatedAt}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel))]/60 px-3 py-3 text-sm">
                    <p className="text-xs uppercase tracking-[0.2em] text-[hsl(var(--muted-foreground))]">
                      Grant audit
                    </p>
                    <p className="mt-2 text-[hsl(var(--foreground))]">
                      Last granted:{" "}
                      {usageSummary.grantAudit.lastGrantedAt ?? "Never"}
                    </p>
                    <p className="mt-1 text-[hsl(var(--foreground))]">
                      Last revoked:{" "}
                      {usageSummary.grantAudit.lastRevokedAt ?? "Never"}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel))]/60 px-3 py-3 text-sm">
                    <p className="text-xs uppercase tracking-[0.2em] text-[hsl(var(--muted-foreground))]">
                      Queue health
                    </p>
                    <p className="mt-2 text-[hsl(var(--foreground))]">
                      Oldest queued:{" "}
                      {usageSummary.queueHealth.oldestQueuedAt ?? "None"}
                    </p>
                    <p className="mt-1 text-[hsl(var(--foreground))]">
                      Oldest retrying:{" "}
                      {usageSummary.queueHealth.oldestRetryingAt ?? "None"}
                    </p>
                    <p className="mt-1 text-[hsl(var(--foreground))]">
                      Last dead-lettered:{" "}
                      {usageSummary.queueHealth.lastDeadLetteredAt ?? "Never"}
                    </p>
                  </div>
                </div>
                {queueInspection ? (
                  <div className="mt-3 rounded-2xl border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel))]/60 px-3 py-3 text-sm">
                    <p className="text-xs uppercase tracking-[0.2em] text-[hsl(var(--muted-foreground))]">
                      Queue state
                    </p>
                    <p className="mt-2 text-[hsl(var(--foreground))]">
                      Waiting {queueInspection.queueState?.waiting ?? 0} ·
                      Active {queueInspection.queueState?.active ?? 0} · Delayed{" "}
                      {queueInspection.queueState?.delayed ?? 0}
                    </p>
                    <p className="mt-1 text-[hsl(var(--foreground))]">
                      Completed {queueInspection.queueState?.completed ?? 0} ·
                      Failed {queueInspection.queueState?.failed ?? 0}
                    </p>
                    <p className="mt-1 text-[hsl(var(--foreground))]">
                      Replayable dead letters{" "}
                      {queueInspection.replayableCount ?? 0}
                    </p>
                  </div>
                ) : null}
                {usageSummary.recentEvents.length > 0 ? (
                  <div className="mt-3 space-y-2">
                    {usageSummary.recentEvents
                      .slice(0, 5)
                      .map((event, index) => (
                        <div
                          className="rounded-2xl border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel))]/60 px-3 py-2 text-sm"
                          key={`${event.event}:${event.issuedAt}:${index}`}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <span className="truncate text-[hsl(var(--foreground))]">
                              {event.event}
                            </span>
                            <Badge variant="default">
                              {event.resource ?? "protocol"}
                            </Badge>
                          </div>
                          <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
                            {event.issuedAt}
                          </p>
                        </div>
                      ))}
                  </div>
                ) : null}
              </WorkspaceMutedPanel>
            ) : null}

            {selectedAppId.trim() && appToken.trim() ? (
              <WorkspaceMutedPanel>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-[hsl(var(--muted-foreground))]">
                      Scope grants
                    </p>
                    <p className="mt-1 text-sm text-[hsl(var(--foreground))]">
                      {grants.length} access grant
                      {grants.length === 1 ? "" : "s"} for{" "}
                      {selectedApp?.registration.appId ?? selectedAppId}
                    </p>
                  </div>
                  <Badge variant="default">Read-first</Badge>
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="protocol-grant-scope">
                      Permission scope
                    </Label>
                    <Input
                      id="protocol-grant-scope"
                      onChange={(event) =>
                        setGrantScope(event.currentTarget.value)
                      }
                      value={grantScope}
                    />
                  </div>
                  <div>
                    <Label htmlFor="protocol-grant-capabilities">
                      Allowed capabilities
                    </Label>
                    <Input
                      id="protocol-grant-capabilities"
                      onChange={(event) =>
                        setGrantCapabilities(event.currentTarget.value)
                      }
                      value={grantCapabilities}
                    />
                  </div>
                  <div>
                    <Label htmlFor="protocol-grant-subject-type">
                      Subject kind
                    </Label>
                    <Input
                      id="protocol-grant-subject-type"
                      onChange={(event) =>
                        setGrantSubjectType(event.currentTarget.value)
                      }
                      value={grantSubjectType}
                    />
                  </div>
                  <div>
                    <Label htmlFor="protocol-grant-subject-id">
                      Subject id
                    </Label>
                    <Input
                      id="protocol-grant-subject-id"
                      onChange={(event) =>
                        setGrantSubjectId(event.currentTarget.value)
                      }
                      value={grantSubjectId}
                    />
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    onClick={() => {
                      void createGrant();
                    }}
                    type="button"
                    variant="secondary"
                  >
                    Grant access
                  </Button>
                  <Button
                    disabled={replayingDeadLetters}
                    onClick={() => {
                      void replayDeadLetters();
                    }}
                    type="button"
                    variant="secondary"
                  >
                    {replayingDeadLetters
                      ? "Replaying…"
                      : "Replay dead letters"}
                  </Button>
                  <Button
                    disabled={rotatingToken}
                    onClick={() => {
                      void rotateToken();
                    }}
                    type="button"
                    variant="secondary"
                  >
                    {rotatingToken ? "Rotating…" : "Rotate token"}
                  </Button>
                  <Button
                    disabled={revokingToken}
                    onClick={() => {
                      void revokeToken();
                    }}
                    type="button"
                    variant="secondary"
                  >
                    {revokingToken ? "Revoking…" : "Revoke token"}
                  </Button>
                </div>
                <div className="mt-3 space-y-2">
                  {grants.length === 0 ? (
                    <div className="rounded-2xl border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel))]/60 px-3 py-3 text-sm text-[hsl(var(--muted-foreground))]">
                      No grants loaded yet.
                    </div>
                  ) : null}
                  {grants.map((grant) => (
                    <div
                      className="rounded-2xl border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel))]/60 px-3 py-3"
                      key={grant.grantId}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-[hsl(var(--foreground))]">
                            {grant.subjectType}: {grant.subjectId}
                          </p>
                          <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
                            {grant.grantId}
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="default">{grant.status}</Badge>
                          {grant.status === "active" ? (
                            <Button
                              disabled={revokingGrantId === grant.grantId}
                              onClick={() => {
                                void revokeGrant(grant.grantId);
                              }}
                              type="button"
                              variant="secondary"
                            >
                              {revokingGrantId === grant.grantId
                                ? "Revoking…"
                                : "Revoke"}
                            </Button>
                          ) : null}
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Badge variant="default">Scope: {grant.scope}</Badge>
                        <Badge variant="default">
                          Capabilities: {joinNames(grant.capabilities)}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </WorkspaceMutedPanel>
            ) : null}

            {replayCursor ? (
              <WorkspaceMutedPanel>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-[hsl(var(--muted-foreground))]">
                      Replay cursor
                    </p>
                    <p className="mt-1 text-sm text-[hsl(var(--foreground))]">
                      Updated {replayCursor.updatedAt}
                    </p>
                  </div>
                  <Badge variant="default">
                    {replayCursor.cursor.slice(0, 12)}…
                  </Badge>
                </div>
              </WorkspaceMutedPanel>
            ) : null}

            {webhooks.map((webhook) => (
              <WorkspaceMutedPanel key={webhook.subscriptionId}>
                <div className="flex flex-col gap-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-[hsl(var(--foreground))]">
                        {webhook.targetUrl}
                      </p>
                      <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
                        {webhook.subscriptionId}
                      </p>
                    </div>
                    <Badge variant="default">{webhook.status}</Badge>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Badge variant="default">
                      Events: {joinNames(webhook.events)}
                    </Badge>
                    <Badge variant="default">
                      Resources: {joinNames(webhook.resources)}
                    </Badge>
                    <Badge variant="default">
                      Deliveries:{" "}
                      {deliveries[webhook.subscriptionId]?.length ?? 0}
                    </Badge>
                  </div>

                  {deliveries[webhook.subscriptionId]?.length ? (
                    <div className="space-y-2">
                      {deliveries[webhook.subscriptionId]
                        .slice(0, 3)
                        .map((delivery) => (
                          <div
                            className="rounded-2xl border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel))]/60 px-3 py-2 text-sm"
                            key={delivery.deliveryId}
                          >
                            <div className="flex items-center justify-between gap-3">
                              <span className="truncate text-[hsl(var(--foreground))]">
                                {delivery.eventName}
                              </span>
                              <Badge variant="default">{delivery.status}</Badge>
                            </div>
                            <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
                              Delivery {delivery.deliveryId}
                            </p>
                            <div className="mt-2 flex flex-wrap items-center gap-2">
                              <Button
                                onClick={() => {
                                  void inspectAttempts(delivery.deliveryId);
                                }}
                                type="button"
                                variant="secondary"
                              >
                                Inspect attempts
                              </Button>
                              {delivery.status === "dead_lettered" ? (
                                <Button
                                  disabled={
                                    replayingDeliveryId === delivery.deliveryId
                                  }
                                  onClick={() => {
                                    void replayDelivery(delivery.deliveryId);
                                  }}
                                  type="button"
                                  variant="secondary"
                                >
                                  {replayingDeliveryId === delivery.deliveryId
                                    ? "Replaying…"
                                    : "Replay delivery"}
                                </Button>
                              ) : null}
                              {(deliveryAttempts[delivery.deliveryId] ?? [])
                                .slice(0, 2)
                                .map((attempt) => (
                                  <Badge
                                    key={`${attempt.deliveryId}:${attempt.attemptNumber}`}
                                    variant="default"
                                  >
                                    Attempt {attempt.attemptNumber}:{" "}
                                    {attempt.outcome}
                                  </Badge>
                                ))}
                            </div>
                          </div>
                        ))}
                    </div>
                  ) : null}
                </div>
              </WorkspaceMutedPanel>
            ))}
          </div>
        ) : selectedAppId.trim() && appToken.trim() ? (
          <WorkspaceMutedPanel>
            <p className="text-sm leading-6 text-[hsl(var(--muted-foreground))]">
              No webhooks were returned for this app token.
            </p>
          </WorkspaceMutedPanel>
        ) : null}
      </div>
    </WorkspacePanel>
  );
}
