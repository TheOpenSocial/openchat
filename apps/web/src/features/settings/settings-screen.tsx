"use client";

import Link from "next/link";
import { useState, type ChangeEvent } from "react";

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
import { ProtocolIntegrationsPanel } from "@/src/features/settings/protocol-integrations-panel";
import { api } from "@/src/lib/api";

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

  const onPhotoChange = async (event: ChangeEvent<HTMLInputElement>) => {
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
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
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
        <ProtocolIntegrationsPanel />

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
      </div>
    </div>
  );
}
