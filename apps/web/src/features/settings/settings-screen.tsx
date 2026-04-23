"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import {
  WorkspaceHeader,
  WorkspaceMutedPanel,
  WorkspacePanel,
} from "@/src/components/layout/workspace";
import { Avatar } from "@/src/components/ui/avatar";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import { useAppSession } from "@/src/features/app-shell/app-session";
import { API_BASE_URL, api } from "@/src/lib/api";

interface ProtocolAppVisibility {
  appId: string;
  name: string;
  status: string;
  createdAt: string | null;
  capabilities: string[];
  scopes: string[];
}

interface ProtocolEventVisibility {
  eventId: string;
  eventName: string;
  occurredAt: string | null;
  summary: string;
}

interface ProtocolQueueVisibility {
  totalDue: number | null;
  pending: number | null;
  retrying: number | null;
  deadLetter: number | null;
  lastRunAt: string | null;
  nextRunAt: string | null;
}

interface ApiEnvelope<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asString(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim().length > 0
    ? value
    : fallback;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((entry): entry is string => typeof entry === "string");
}

async function loadProtocolEnvelope<T>(
  path: string,
  accessToken: string,
  signal?: AbortSignal,
) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      authorization: `Bearer ${accessToken}`,
    },
    signal,
  });

  if (response.status === 404) {
    return null;
  }

  const raw = (await response.json().catch(() => null)) as unknown;
  if (!isRecord(raw) || typeof raw.success !== "boolean") {
    if (!response.ok) {
      throw new Error(
        `Protocol visibility request failed (${response.status})`,
      );
    }
    return null;
  }

  const envelope = raw as unknown as ApiEnvelope<T>;
  if (!response.ok || !envelope.success) {
    throw new Error(envelope.error?.message ?? "Could not load protocol data.");
  }

  return envelope.data ?? null;
}

export function SettingsScreen() {
  const {
    locale,
    onboardingLoading,
    profileDraft,
    profilePhotoUrl,
    saveProfileSettings,
    session,
    setBanner,
    setLocale,
    setProfileDraft,
    signOut,
    uploadProfilePhoto,
  } = useAppSession();
  const [saving, setSaving] = useState(false);
  const [protocolLoading, setProtocolLoading] = useState(false);
  const [protocolError, setProtocolError] = useState<string | null>(null);
  const [protocolApps, setProtocolApps] = useState<ProtocolAppVisibility[]>([]);
  const [protocolEvents, setProtocolEvents] = useState<
    ProtocolEventVisibility[]
  >([]);
  const [protocolQueue, setProtocolQueue] =
    useState<ProtocolQueueVisibility | null>(null);

  const onPhotoChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    if (!file) {
      return;
    }
    try {
      await uploadProfilePhoto(file);
    } catch (error) {
      setBanner({
        tone: "error",
        text: `Could not upload profile photo: ${String(error)}`,
      });
    } finally {
      event.currentTarget.value = "";
    }
  };

  const saveSettings = async () => {
    if (!session) {
      return;
    }

    setSaving(true);
    try {
      if (!profileDraft.displayName.trim()) {
        throw new Error("Display name cannot be empty.");
      }

      if (
        !session.displayName ||
        profileDraft.displayName.trim() !== session.displayName
      ) {
        await api.updateProfile(
          session.userId,
          { displayName: profileDraft.displayName.trim() },
          session.accessToken,
        );
      }

      await saveProfileSettings();
      setBanner({ tone: "success", text: "Settings saved." });
    } catch (error) {
      setBanner({
        tone: "error",
        text: `Could not save settings: ${String(error)}`,
      });
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    const accessToken = session?.accessToken;
    if (!accessToken) {
      setProtocolApps([]);
      setProtocolEvents([]);
      setProtocolQueue(null);
      setProtocolError(null);
      setProtocolLoading(false);
      return;
    }

    const controller = new AbortController();
    setProtocolLoading(true);
    setProtocolError(null);

    void (async () => {
      try {
        const appsPayload = await loadProtocolEnvelope<unknown[]>(
          "/protocol/apps",
          accessToken,
          controller.signal,
        );
        const apps = (appsPayload ?? []).flatMap((entry, index) => {
          if (!isRecord(entry)) {
            return [];
          }
          const appId = asString(
            entry.appId ?? entry.id ?? entry.app_id,
            `app-${index + 1}`,
          );
          return [
            {
              appId,
              name: asString(entry.name ?? entry.appName ?? entry.label, appId),
              status: asString(entry.status ?? entry.state, "unknown"),
              createdAt:
                typeof entry.createdAt === "string"
                  ? entry.createdAt
                  : typeof entry.created_at === "string"
                    ? entry.created_at
                    : null,
              capabilities: asStringArray(
                entry.capabilities ?? entry.permissions,
              ),
              scopes: asStringArray(entry.scopes ?? entry.grants),
            },
          ];
        });

        setProtocolApps(apps);

        const appId = apps[0]?.appId ?? null;
        if (!appId) {
          setProtocolEvents([]);
          setProtocolQueue(null);
          return;
        }

        const [eventsPayload, queuePayload] = await Promise.all([
          loadProtocolEnvelope<unknown[]>(
            `/protocol/apps/${encodeURIComponent(appId)}/events/replay?limit=5`,
            accessToken,
            controller.signal,
          ),
          loadProtocolEnvelope<Record<string, unknown>>(
            `/protocol/apps/${encodeURIComponent(appId)}/delivery-queue`,
            accessToken,
            controller.signal,
          ),
        ]);

        const events = (eventsPayload ?? []).flatMap((entry, index) => {
          if (!isRecord(entry)) {
            return [];
          }
          return [
            {
              eventId: asString(
                entry.eventId ?? entry.id ?? entry.event_id,
                `event-${index + 1}`,
              ),
              eventName: asString(
                entry.eventName ?? entry.name ?? entry.type,
                "protocol.event",
              ),
              occurredAt:
                typeof entry.occurredAt === "string"
                  ? entry.occurredAt
                  : typeof entry.createdAt === "string"
                    ? entry.createdAt
                    : null,
              summary: asString(
                entry.summary ??
                  entry.message ??
                  entry.description ??
                  JSON.stringify(entry.payload ?? entry.data ?? {}),
                "Protocol event",
              ),
            },
          ];
        });
        setProtocolEvents(events);

        if (queuePayload && isRecord(queuePayload)) {
          setProtocolQueue({
            totalDue:
              typeof queuePayload.totalDue === "number"
                ? queuePayload.totalDue
                : typeof queuePayload.dueCount === "number"
                  ? queuePayload.dueCount
                  : null,
            pending:
              typeof queuePayload.pending === "number"
                ? queuePayload.pending
                : typeof queuePayload.pendingCount === "number"
                  ? queuePayload.pendingCount
                  : null,
            retrying:
              typeof queuePayload.retrying === "number"
                ? queuePayload.retrying
                : typeof queuePayload.retryCount === "number"
                  ? queuePayload.retryCount
                  : null,
            deadLetter:
              typeof queuePayload.deadLetter === "number"
                ? queuePayload.deadLetter
                : typeof queuePayload.deadLetterCount === "number"
                  ? queuePayload.deadLetterCount
                  : null,
            lastRunAt:
              typeof queuePayload.lastRunAt === "string"
                ? queuePayload.lastRunAt
                : typeof queuePayload.updatedAt === "string"
                  ? queuePayload.updatedAt
                  : null,
            nextRunAt:
              typeof queuePayload.nextRunAt === "string"
                ? queuePayload.nextRunAt
                : null,
          });
        } else {
          setProtocolQueue(null);
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setProtocolError(
            error instanceof Error
              ? error.message
              : "Could not load protocol activity.",
          );
          setProtocolApps([]);
          setProtocolEvents([]);
          setProtocolQueue(null);
        }
      } finally {
        if (!controller.signal.aborted) {
          setProtocolLoading(false);
        }
      }
    })();

    return () => controller.abort();
  }, [session?.accessToken]);

  return (
    <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
      <WorkspacePanel>
        <WorkspaceHeader
          description="Adjust the identity and preference layer that sits above the profile tab."
          title="Settings"
        />

        <div className="mt-4 space-y-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <Avatar
              alt={profileDraft.displayName}
              fallback={profileDraft.displayName.slice(0, 2).toUpperCase()}
              src={profilePhotoUrl}
            />
            <div className="min-w-0">
              <Label htmlFor="photo">Profile photo</Label>
              <Input
                accept="image/jpeg,image/png,image/webp"
                id="photo"
                onChange={onPhotoChange}
                type="file"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="display-name">Display name</Label>
            <Input
              id="display-name"
              onChange={(event) =>
                setProfileDraft((current) => ({
                  ...current,
                  displayName: event.currentTarget.value,
                }))
              }
              value={profileDraft.displayName}
            />
          </div>

          <div>
            <Label>Locale</Label>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button
                onClick={() => setLocale("en")}
                type="button"
                variant={locale === "en" ? "primary" : "secondary"}
              >
                English
              </Button>
              <Button
                onClick={() => setLocale("es")}
                type="button"
                variant={locale === "es" ? "primary" : "secondary"}
              >
                Espanol
              </Button>
            </div>
          </div>

          <div>
            <Label>Notification mode</Label>
            <div className="mt-2 flex flex-wrap gap-2">
              {(["live", "digest"] as const).map((mode) => (
                <Button
                  key={mode}
                  onClick={() =>
                    setProfileDraft((current) => ({
                      ...current,
                      notificationMode: mode,
                    }))
                  }
                  type="button"
                  variant={
                    profileDraft.notificationMode === mode
                      ? "primary"
                      : "secondary"
                  }
                >
                  {mode}
                </Button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              disabled={saving || onboardingLoading}
              onClick={() => {
                void saveSettings();
              }}
              type="button"
              variant="primary"
            >
              {saving || onboardingLoading ? "Saving…" : "Save changes"}
            </Button>
            <Button onClick={signOut} type="button" variant="destructive">
              Sign out
            </Button>
          </div>
        </div>
      </WorkspacePanel>

      <div className="space-y-4">
        <WorkspacePanel>
          <WorkspaceHeader
            description="Keep the shell lightweight while still making the route easy to reach."
            title="Where settings live"
          />
          <div className="mt-4 space-y-3">
            <WorkspaceMutedPanel>
              <p className="text-sm leading-6 text-ash">
                Profile and memory stay on the profile tab. This route is for
                app-level preferences and identity controls.
              </p>
            </WorkspaceMutedPanel>
            <div className="flex flex-wrap gap-2">
              <Link href="/profile">
                <Button type="button" variant="secondary">
                  Open profile
                </Button>
              </Link>
              <Link href="/activity">
                <Button type="button" variant="secondary">
                  Open activity
                </Button>
              </Link>
              <Link href="/connections">
                <Button type="button" variant="secondary">
                  Open connections
                </Button>
              </Link>
            </div>
          </div>
        </WorkspacePanel>

        <WorkspacePanel>
          <WorkspaceHeader
            description="Read-only visibility into protocol activity, app registrations, and delivery health."
            title="Protocol usage"
          />
          <div className="mt-4 space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <WorkspaceMutedPanel>
                <p className="text-xs uppercase tracking-[0.24em] text-ash/60">
                  Registered apps
                </p>
                <p className="mt-2 text-2xl font-semibold text-white">
                  {protocolLoading ? "…" : String(protocolApps.length)}
                </p>
              </WorkspaceMutedPanel>
              <WorkspaceMutedPanel>
                <p className="text-xs uppercase tracking-[0.24em] text-ash/60">
                  Recent events
                </p>
                <p className="mt-2 text-2xl font-semibold text-white">
                  {protocolLoading ? "…" : String(protocolEvents.length)}
                </p>
              </WorkspaceMutedPanel>
              <WorkspaceMutedPanel>
                <p className="text-xs uppercase tracking-[0.24em] text-ash/60">
                  Delivery queue
                </p>
                <p className="mt-2 text-2xl font-semibold text-white">
                  {protocolLoading ? "…" : (protocolQueue?.totalDue ?? "—")}
                </p>
              </WorkspaceMutedPanel>
            </div>

            {protocolError ? (
              <WorkspaceMutedPanel>
                <p className="text-sm leading-6 text-ash">
                  Protocol visibility is unavailable right now.
                </p>
                <p className="mt-2 text-sm leading-6 text-ash/70">
                  {protocolError}
                </p>
              </WorkspaceMutedPanel>
            ) : null}

            <div className="grid gap-4 lg:grid-cols-2">
              <WorkspaceMutedPanel>
                <div>
                  <p className="text-xs uppercase tracking-[0.24em] text-ash/60">
                    Recent protocol events
                  </p>
                  <p className="mt-2 text-sm leading-6 text-ash/80">
                    Latest activity from the first visible protocol app.
                  </p>
                </div>
                <div className="mt-4 space-y-3">
                  {protocolEvents.length > 0 ? (
                    protocolEvents.slice(0, 5).map((event) => (
                      <div
                        className="rounded-2xl border border-white/8 bg-white/[0.03] p-3"
                        key={event.eventId}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-white">
                              {event.eventName}
                            </p>
                            <p className="mt-1 text-sm leading-6 text-ash/70">
                              {event.summary}
                            </p>
                          </div>
                          <p className="shrink-0 text-[11px] uppercase tracking-[0.24em] text-ash/40">
                            {event.occurredAt
                              ? new Date(event.occurredAt).toLocaleString()
                              : "recent"}
                          </p>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm leading-6 text-ash/70">
                      No protocol events are visible yet.
                    </p>
                  )}
                </div>
              </WorkspaceMutedPanel>

              <WorkspaceMutedPanel>
                <div>
                  <p className="text-xs uppercase tracking-[0.24em] text-ash/60">
                    Delivery queue summary
                  </p>
                  <p className="mt-2 text-sm leading-6 text-ash/80">
                    Current due, retrying, and dead-letter counts for webhook
                    delivery.
                  </p>
                </div>
                <div className="mt-4 space-y-3">
                  {protocolQueue ? (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-3">
                        <p className="text-xs uppercase tracking-[0.24em] text-ash/60">
                          Due
                        </p>
                        <p className="mt-2 text-2xl font-semibold text-white">
                          {protocolQueue.totalDue ?? "—"}
                        </p>
                      </div>
                      <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-3">
                        <p className="text-xs uppercase tracking-[0.24em] text-ash/60">
                          Pending / retrying
                        </p>
                        <p className="mt-2 text-2xl font-semibold text-white">
                          {[
                            protocolQueue.pending ?? "—",
                            protocolQueue.retrying ?? "—",
                          ].join(" / ")}
                        </p>
                      </div>
                      <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-3 sm:col-span-2">
                        <p className="text-xs uppercase tracking-[0.24em] text-ash/60">
                          Dead-letter
                        </p>
                        <p className="mt-2 text-lg font-medium text-white">
                          {protocolQueue.deadLetter ?? "—"}
                        </p>
                        <p className="mt-2 text-sm leading-6 text-ash/70">
                          Last run{" "}
                          {protocolQueue.lastRunAt
                            ? new Date(protocolQueue.lastRunAt).toLocaleString()
                            : "not available"}
                          {protocolQueue.nextRunAt
                            ? ` · next ${new Date(
                                protocolQueue.nextRunAt,
                              ).toLocaleString()}`
                            : ""}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm leading-6 text-ash/70">
                      No queue summary is available yet.
                    </p>
                  )}
                </div>
              </WorkspaceMutedPanel>
            </div>

            <WorkspaceMutedPanel>
              <p className="text-xs uppercase tracking-[0.24em] text-ash/60">
                Protocol apps
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {protocolApps.length > 0 ? (
                  protocolApps.map((app) => (
                    <div
                      className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-sm text-ash"
                      key={app.appId}
                    >
                      {app.name}
                      <span className="ml-2 text-ash/50">{app.status}</span>
                    </div>
                  ))
                ) : (
                  <span className="text-sm leading-6 text-ash/70">
                    No protocol apps are registered for this session yet.
                  </span>
                )}
              </div>
            </WorkspaceMutedPanel>
          </div>
        </WorkspacePanel>
      </div>
    </div>
  );
}
