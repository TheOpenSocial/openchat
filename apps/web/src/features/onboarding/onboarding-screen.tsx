"use client";

import { useRouter } from "next/navigation";

import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import {
  WorkspaceKicker,
  WorkspaceMutedPanel,
  WorkspacePanel,
  WorkspaceSection,
} from "@/src/components/layout/workspace";
import { Label } from "@/src/components/ui/label";
import { Textarea } from "@/src/components/ui/textarea";
import { useAppSession } from "@/src/features/app-shell/app-session";
import type { SocialMode } from "@/src/types";

const interestOptions = [
  "Football",
  "Gaming",
  "Tennis",
  "Startups",
  "Design",
  "AI",
];

export function OnboardingScreen() {
  const router = useRouter();
  const {
    completeOnboarding,
    onboardingLoading,
    profileDraft,
    setProfileDraft,
  } = useAppSession();

  return (
    <WorkspaceSection className="min-h-[calc(100svh-7rem)]">
      <div className="grid gap-6 lg:grid-cols-[0.92fr_1.08fr] lg:items-start">
        <div className="space-y-5 pt-2 sm:pt-4">
          <WorkspaceKicker className="animate-soft-fade">
            OpenSocial onboarding
          </WorkspaceKicker>
          <div className="space-y-3">
            <h1 className="animate-soft-rise max-w-sm font-[var(--font-heading)] text-3xl font-semibold tracking-tight text-[hsl(var(--foreground))] sm:text-4xl">
              Set the way you want to show up.
            </h1>
            <p className="animate-soft-rise animate-delay-1 max-w-md text-sm leading-7 text-[hsl(var(--muted-foreground))] sm:text-[15px]">
              A few signals help us route you toward the right people, the right
              timing, and the right kind of plan.
            </p>
          </div>

          <WorkspaceMutedPanel className="animate-soft-rise animate-delay-2 space-y-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[hsl(var(--muted-foreground))]">
              What changes
            </p>
            <div className="space-y-3">
              {[
                "Your profile reads clearly on mobile before you send anything.",
                "Interest and social mode choices help route requests with less noise.",
                "You can change every field later from your profile settings.",
              ].map((item) => (
                <p
                  className="text-sm leading-6 text-[hsl(var(--foreground))]"
                  key={item}
                >
                  {item}
                </p>
              ))}
            </div>
          </WorkspaceMutedPanel>
        </div>

        <WorkspacePanel className="animate-soft-rise animate-delay-3 space-y-6">
          <div className="space-y-1">
            <h2 className="font-[var(--font-heading)] text-xl font-semibold tracking-tight text-[hsl(var(--foreground))]">
              Finish your profile
            </h2>
            <p className="text-sm leading-6 text-[hsl(var(--muted-foreground))]">
              Keep it short, specific, and easy to trust at a glance.
            </p>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <div className="md:col-span-3">
              <Label htmlFor="bio">Bio</Label>
              <Textarea
                id="bio"
                onChange={(event) =>
                  setProfileDraft((current) => ({
                    ...current,
                    bio: event.currentTarget.value,
                  }))
                }
                placeholder="I like fast plans and good conversations."
                value={profileDraft.bio}
              />
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
          </div>

          <div className="space-y-3">
            <Label>Interests</Label>
            <div className="flex flex-wrap gap-2">
              {interestOptions.map((interest) => {
                const selected = profileDraft.interests.includes(interest);
                return (
                  <Button
                    className="rounded-full"
                    key={interest}
                    onClick={() =>
                      setProfileDraft((current) => ({
                        ...current,
                        interests: current.interests.includes(interest)
                          ? current.interests.filter(
                              (value) => value !== interest,
                            )
                          : [...current.interests, interest],
                      }))
                    }
                    type="button"
                    variant={selected ? "primary" : "secondary"}
                  >
                    {interest}
                  </Button>
                );
              })}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-3">
              <Label>Social mode</Label>
              <div className="flex flex-wrap gap-2">
                {(["one_to_one", "group", "either"] as SocialMode[]).map(
                  (mode) => (
                    <Button
                      className="capitalize"
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

            <div className="space-y-3">
              <Label>Notification mode</Label>
              <div className="flex flex-wrap gap-2">
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

          <Button
            className="w-full sm:w-auto"
            data-testid="web-onboarding-continue"
            disabled={onboardingLoading}
            onClick={() => {
              void completeOnboarding().then((path) => router.push(path));
            }}
            size="lg"
            type="button"
            variant="primary"
          >
            {onboardingLoading ? "Saving..." : "Complete onboarding"}
          </Button>
        </WorkspacePanel>
      </div>
    </WorkspaceSection>
  );
}
