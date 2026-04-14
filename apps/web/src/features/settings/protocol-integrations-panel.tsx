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

  const resetInspectionState = (options?: { clearToken?: boolean }) => {
    setDetailsError(null);
    setWebhooks([]);
    setGrants([]);
    setDeliveries({});
    setReplayCursor(null);
    setUsageSummary(null);
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
      const [
        appWebhooksResult,
        appGrantsResult,
        cursorResult,
        usageResult,
      ] = await Promise.allSettled([
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
      if (cursorResult.status !== "fulfilled" || usageResult.status !== "fulfilled") {
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
    } catch (error) {
      setDetailsError(String(error));
    } finally {
      setDispatchingQueue(false);
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
              dispatchingQueue || loadingDetails || !selectedAppId.trim() || !appToken.trim()
            }
            onClick={() => {
              void dispatchQueue();
            }}
            type="button"
            variant="secondary"
          >
            {dispatchingQueue ? "Dispatching…" : "Dispatch queue"}
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

        {grants.length > 0 || webhooks.length > 0 || replayCursor || usageSummary ? (
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
                    Latest cursor: {usageSummary.latestCursor}
                  </Badge>
                </div>
                {usageSummary.recentEvents.length > 0 ? (
                  <div className="mt-3 space-y-2">
                    {usageSummary.recentEvents.slice(0, 5).map((event, index) => (
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

            {grants.length > 0 ? (
              <WorkspaceMutedPanel>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-[hsl(var(--muted-foreground))]">
                      Scope grants
                    </p>
                    <p className="mt-1 text-sm text-[hsl(var(--foreground))]">
                      {grants.length} grant{grants.length === 1 ? "" : "s"} for{" "}
                      {selectedApp?.registration.appId ?? selectedAppId}
                    </p>
                  </div>
                  <Badge variant="default">Read-first</Badge>
                </div>
                <div className="mt-3 space-y-2">
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
