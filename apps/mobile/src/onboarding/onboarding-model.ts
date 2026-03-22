import type { SocialMode, UserProfileDraft } from "../types";

export const ONBOARDING_STEP_COUNT = 6;

export const ONBOARDING_GOAL_OPTIONS = [
  "Meet people",
  "Talk about interests",
  "Find things to do",
  "Make plans",
  "Join small groups",
  "Explore what’s happening",
  "Dating",
  "Gaming",
  "Professional / ideas",
] as const;

export const ONBOARDING_TOPIC_SUGGESTIONS = [
  "Music",
  "Movies",
  "Startups",
  "Design",
  "Fitness",
  "Football",
  "Table tennis",
  "Gaming",
  "Travel",
  "Crypto",
  "Food",
  "Books",
  "AI",
  "Running",
  "Nightlife",
  "Language exchange",
] as const;

export const AVAILABILITY_OPTIONS = [
  "Right now",
  "Evenings",
  "Weekends",
  "Flexible",
] as const;

export const CONNECT_FORMAT_OPTIONS = [
  { id: "one_to_one" as const, label: "1:1" },
  { id: "group" as const, label: "Small groups" },
  { id: "both" as const, label: "Both" },
];

export const CONNECT_MODE_OPTIONS = [
  { id: "online" as const, label: "Online" },
  { id: "in_person" as const, label: "In person" },
  { id: "both" as const, label: "Both" },
];

export const STYLE_OPTIONS = [
  "Chill",
  "Spontaneous",
  "Planned",
  "Focused",
  "Outgoing",
] as const;

export type PreferredFormatId = "one_to_one" | "group" | "both";
export type PreferredModeId = "online" | "in_person" | "both";

export interface OnboardingDraftState {
  stepIndex: number;
  onboardingGoals: string[];
  interests: string[];
  preferredAvailability: (typeof AVAILABILITY_OPTIONS)[number];
  preferredFormat: PreferredFormatId;
  preferredMode: PreferredModeId;
  preferredStyle: (typeof STYLE_OPTIONS)[number];
  displayName: string;
  profilePhotoUri: string | null;
  profilePhotoMimeType: string | null;
  profilePhotoFileSize: number | null;
  shortBio: string;
  area: string;
  country: string;
  firstIntentText: string;
}

export function defaultOnboardingState(
  displayNameFromSession: string,
): OnboardingDraftState {
  return {
    stepIndex: 0,
    onboardingGoals: [],
    interests: ["Design", "AI", "Football"],
    preferredAvailability: "Flexible",
    preferredFormat: "both",
    preferredMode: "both",
    preferredStyle: "Chill",
    displayName: displayNameFromSession.trim() || "",
    profilePhotoUri: null,
    profilePhotoMimeType: null,
    profilePhotoFileSize: null,
    shortBio: "",
    area: "",
    country: "",
    firstIntentText: "",
  };
}

export function mergeLoadedDraft(
  base: OnboardingDraftState,
  partial: Partial<OnboardingDraftState> | null,
): OnboardingDraftState {
  if (!partial || typeof partial !== "object") {
    return base;
  }
  return {
    ...base,
    ...partial,
    stepIndex: Math.min(
      Math.max(
        0,
        typeof partial.stepIndex === "number"
          ? partial.stepIndex
          : base.stepIndex,
      ),
      ONBOARDING_STEP_COUNT - 1,
    ),
    onboardingGoals: Array.isArray(partial.onboardingGoals)
      ? partial.onboardingGoals
      : base.onboardingGoals,
    interests: Array.isArray(partial.interests)
      ? partial.interests
      : base.interests,
  };
}

function socialModeFromFormat(format: PreferredFormatId): SocialMode {
  if (format === "one_to_one") return "one_to_one";
  if (format === "group") return "group";
  return "either";
}

function modalityFromMode(
  mode: PreferredModeId,
): "online" | "offline" | "either" {
  if (mode === "online") return "online";
  if (mode === "in_person") return "offline";
  return "either";
}

function reachableFromAvailability(
  availability: (typeof AVAILABILITY_OPTIONS)[number],
): "always" | "available_only" {
  if (availability === "Right now" || availability === "Flexible") {
    return "always";
  }
  return "available_only";
}

function intentModeFromFormat(
  format: PreferredFormatId,
): "one_to_one" | "group" | "balanced" {
  if (format === "one_to_one") return "one_to_one";
  if (format === "group") return "group";
  return "balanced";
}

function buildBio(state: OnboardingDraftState): string {
  const lines: string[] = [];
  const bio = state.shortBio.trim();
  if (bio.length > 0) {
    lines.push(bio);
  }
  const prefs = [
    state.preferredAvailability,
    state.preferredFormat === "both"
      ? "1:1 & groups"
      : state.preferredFormat === "one_to_one"
        ? "1:1"
        : "Small groups",
    state.preferredMode === "both"
      ? "online or in person"
      : state.preferredMode === "online"
        ? "online"
        : "in person",
    state.preferredStyle,
  ].join(" · ");
  lines.push(prefs);
  return lines.join("\n");
}

function dedupeLabels(labels: string[]) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of labels) {
    const label = raw.trim();
    if (!label) continue;
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(label);
  }
  return out;
}

export function draftStateToUserProfileDraft(
  state: OnboardingDraftState,
): UserProfileDraft {
  const interestLabels = dedupeLabels([
    ...state.interests,
    ...state.onboardingGoals,
  ]);
  const country = state.country.trim() || "Other";
  const city = state.area.trim() || "—";

  return {
    displayName: state.displayName.trim(),
    bio: buildBio(state),
    city,
    country,
    interests: interestLabels.length > 0 ? interestLabels : ["OpenSocial"],
    socialMode: socialModeFromFormat(state.preferredFormat),
    notificationMode: "live",
  };
}

export function socialModePayload(state: OnboardingDraftState) {
  const f = state.preferredFormat;
  if (f === "one_to_one") {
    return {
      socialMode: "balanced" as const,
      preferOneToOne: true,
      allowGroupInvites: false,
    };
  }
  if (f === "group") {
    return {
      socialMode: "high_energy" as const,
      preferOneToOne: false,
      allowGroupInvites: true,
    };
  }
  return {
    socialMode: "balanced" as const,
    preferOneToOne: false,
    allowGroupInvites: true,
  };
}

export function globalRulesPayload(state: OnboardingDraftState) {
  const f = state.preferredFormat;
  return {
    whoCanContact: "anyone" as const,
    reachable: reachableFromAvailability(state.preferredAvailability),
    intentMode: intentModeFromFormat(f),
    modality: modalityFromMode(state.preferredMode),
    languagePreferences: ["en"],
    countryPreferences: [],
    requireVerifiedUsers: false,
    notificationMode: "immediate" as const,
    agentAutonomy: "suggest_only" as const,
    memoryMode: "standard" as const,
  };
}

export function stepValidation(
  step: number,
  state: OnboardingDraftState,
): boolean {
  switch (step) {
    case 0:
      return true;
    case 1:
      return state.onboardingGoals.length > 0;
    case 2:
      return state.interests.length > 0;
    case 3:
      return true;
    case 4:
      return (
        state.displayName.trim().length > 0 &&
        state.area.trim().length > 0 &&
        state.country.trim().length > 0
      );
    case 5:
      return true;
    default:
      return false;
  }
}
