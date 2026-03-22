"use client";

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
import { Textarea } from "@/src/components/ui/textarea";
import { useAppSession } from "@/src/features/app-shell/app-session";
import { api } from "@/src/lib/api";
import type { SocialMode } from "@/src/types";

export function ProfileScreen() {
  const {
    locale,
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
  const [trustSummary, setTrustSummary] = useState("trust profile not loaded");
  const [memoryBusy, setMemoryBusy] = useState(false);
  const [memorySnapshot, setMemorySnapshot] = useState<{
    lifeGraph: Record<string, unknown> | null;
    retrieval: Record<string, unknown> | null;
  }>({ lifeGraph: null, retrieval: null });

  useEffect(() => {
    if (!session) {
      return;
    }
    void Promise.all([
      api.getTrustProfile(session.userId, session.accessToken),
      api.getGlobalRules(session.userId, session.accessToken),
    ])
      .then(([trust, rules]) => {
        setTrustSummary(
          `badge: ${String(trust.verificationBadge ?? "unknown")} · reputation: ${String(
            trust.reputationScore ?? "n/a",
          )}`,
        );
        setProfileDraft((current) => ({
          ...current,
          notificationMode:
            rules.notificationMode === "digest"
              ? "digest"
              : current.notificationMode,
        }));
      })
      .catch((error) => {
        setBanner({
          tone: "error",
          text: `Could not load trust and rules: ${String(error)}`,
        });
      });
  }, [session, setBanner, setProfileDraft]);

  const refreshMemory = async () => {
    if (!session) {
      return;
    }
    setMemoryBusy(true);
    try {
      const [lifeGraph, retrieval] = await Promise.all([
        api.getLifeGraph(session.userId, session.accessToken),
        api.queryRetrievalContext(
          session.userId,
          {
            query: "Summarize my most relevant social memory context.",
            maxChunks: 4,
            maxAgeDays: 90,
          },
          session.accessToken,
        ),
      ]);
      setMemorySnapshot({ lifeGraph, retrieval });
      setBanner({ tone: "success", text: "Memory snapshot refreshed." });
    } catch (error) {
      setBanner({
        tone: "error",
        text: `Could not refresh memory snapshot: ${String(error)}`,
      });
    } finally {
      setMemoryBusy(false);
    }
  };

  const resetMemory = async () => {
    if (!session) {
      return;
    }
    setMemoryBusy(true);
    try {
      await api.resetMemory(
        session.userId,
        {
          actorUserId: session.userId,
          mode: "learned_memory",
          reason: "user_requested_from_profile",
        },
        session.accessToken,
      );
      setMemorySnapshot({ lifeGraph: null, retrieval: null });
      setBanner({ tone: "success", text: "Learned memory reset completed." });
    } catch (error) {
      setBanner({
        tone: "error",
        text: `Could not reset memory: ${String(error)}`,
      });
    } finally {
      setMemoryBusy(false);
    }
  };

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

  return (
    <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
      <WorkspacePanel>
        <WorkspaceHeader
          description="Edit identity, interests, privacy posture, and routing defaults."
          title="Profile and preferences"
        />
        <div className="mt-4 space-y-4">
          <div className="flex items-center gap-4">
            <Avatar
              alt={profileDraft.displayName}
              fallback={profileDraft.displayName.slice(0, 2).toUpperCase()}
              src={profilePhotoUrl}
            />
            <div>
              <Label htmlFor="photo">Profile photo</Label>
              <Input
                accept="image/jpeg,image/png,image/webp"
                id="photo"
                onChange={onPhotoChange}
                type="file"
              />
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
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
              <Label htmlFor="city">City</Label>
              <Input
                id="city"
                onChange={(event) =>
                  setProfileDraft((current) => ({
                    ...current,
                    city: event.currentTarget.value,
                  }))
                }
                value={profileDraft.city}
              />
            </div>
            <div>
              <Label htmlFor="country">Country</Label>
              <Input
                id="country"
                onChange={(event) =>
                  setProfileDraft((current) => ({
                    ...current,
                    country: event.currentTarget.value,
                  }))
                }
                value={profileDraft.country}
              />
            </div>
            <div>
              <Label>Locale</Label>
              <div className="mt-2 flex gap-2">
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
          </div>

          <div>
            <Label htmlFor="bio">Bio</Label>
            <Textarea
              id="bio"
              onChange={(event) =>
                setProfileDraft((current) => ({
                  ...current,
                  bio: event.currentTarget.value,
                }))
              }
              value={profileDraft.bio}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label>Social mode</Label>
              <div className="mt-2 flex flex-wrap gap-2">
                {(["one_to_one", "group", "either"] as SocialMode[]).map(
                  (mode) => (
                    <Button
                      key={mode}
                      onClick={() =>
                        setProfileDraft((current) => ({
                          ...current,
                          socialMode: mode,
                        }))
                      }
                      type="button"
                      variant={
                        profileDraft.socialMode === mode
                          ? "primary"
                          : "secondary"
                      }
                    >
                      {mode.replaceAll("_", " ")}
                    </Button>
                  ),
                )}
              </div>
            </div>
            <div>
              <Label>Notification mode</Label>
              <div className="mt-2 flex gap-2">
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
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => void saveProfileSettings()}
              type="button"
              variant="primary"
            >
              Save settings
            </Button>
            <Button
              onClick={() => {
                if (!session) return;
                void api
                  .sendDigest(session.userId, session.accessToken)
                  .then(() =>
                    setBanner({
                      tone: "success",
                      text: "Digest request sent.",
                    }),
                  )
                  .catch((error) =>
                    setBanner({
                      tone: "error",
                      text: `Digest request failed: ${String(error)}`,
                    }),
                  );
              }}
              type="button"
              variant="secondary"
            >
              Request digest
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
            description="Verification and reputation snapshot."
            title="Trust summary"
          />
          <div className="mt-4">
            <p className="text-sm text-ash">{trustSummary}</p>
          </div>
        </WorkspacePanel>

        <WorkspacePanel>
          <WorkspaceHeader
            description="Inspect and reset learned social memory while keeping user control explicit."
            title="Memory controls"
          />
          <div className="mt-4 space-y-3">
            <div className="flex gap-2">
              <Button
                disabled={memoryBusy}
                onClick={() => void refreshMemory()}
                type="button"
                variant="secondary"
              >
                {memoryBusy ? "Refreshing…" : "Refresh memory"}
              </Button>
              <Button
                disabled={memoryBusy}
                onClick={() => void resetMemory()}
                type="button"
                variant="destructive"
              >
                Reset learned memory
              </Button>
            </div>
            <WorkspaceMutedPanel className="text-sm text-ash">
              life graph loaded: {memorySnapshot.lifeGraph ? "yes" : "no"} ·
              retrieval loaded: {memorySnapshot.retrieval ? "yes" : "no"}
            </WorkspaceMutedPanel>
          </div>
        </WorkspacePanel>
      </div>
    </div>
  );
}
