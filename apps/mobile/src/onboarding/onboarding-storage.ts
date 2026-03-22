import AsyncStorage from "@react-native-async-storage/async-storage";

import type { OnboardingDraftState } from "./onboarding-model";

function storageKey(userId: string) {
  return `opensocial.onboarding.draft.v2.${userId}`;
}

export async function loadOnboardingDraft(
  userId: string,
): Promise<Partial<OnboardingDraftState> | null> {
  try {
    const raw = await AsyncStorage.getItem(storageKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<OnboardingDraftState>;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

export async function saveOnboardingDraft(
  userId: string,
  draft: OnboardingDraftState,
): Promise<void> {
  try {
    await AsyncStorage.setItem(storageKey(userId), JSON.stringify(draft));
  } catch {
    // best-effort persistence
  }
}

export async function clearOnboardingDraft(userId: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(storageKey(userId));
  } catch {
    // ignore
  }
}
