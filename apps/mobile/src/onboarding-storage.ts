import AsyncStorage from "@react-native-async-storage/async-storage";

import type {
  OnboardingAvailability,
  OnboardingFormat,
  OnboardingMode,
  OnboardingStyle,
  ProfilePhotoDraft,
} from "./types";

export interface StoredOnboardingDraft {
  stepIndex: number;
  goals: string[];
  interests: string[];
  availability: OnboardingAvailability;
  format: OnboardingFormat;
  mode: OnboardingMode;
  style: OnboardingStyle;
  name: string;
  bio: string;
  location: string;
  firstIntentText: string;
  profilePhoto: ProfilePhotoDraft | null;
}

const VERSION = "v1";

function draftKey(userId: string) {
  return `opensocial.mobile.onboarding.${VERSION}.${userId}`;
}

export async function loadOnboardingDraft(userId: string) {
  const raw = await AsyncStorage.getItem(draftKey(userId));
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as StoredOnboardingDraft;
  } catch {
    await AsyncStorage.removeItem(draftKey(userId));
    return null;
  }
}

export function saveOnboardingDraft(
  userId: string,
  draft: StoredOnboardingDraft,
) {
  return AsyncStorage.setItem(draftKey(userId), JSON.stringify(draft));
}

export function clearOnboardingDraft(userId: string) {
  return AsyncStorage.removeItem(draftKey(userId));
}
