import AsyncStorage from "@react-native-async-storage/async-storage";

import type {
  ExperienceActivitySummaryResponse,
  ExperienceHomeSummaryResponse,
} from "./api";

const HOME_SUMMARY_KEY_PREFIX = "opensocial.mobile.experience.home.v1";
const ACTIVITY_SUMMARY_KEY_PREFIX = "opensocial.mobile.experience.activity.v1";

function homeSummaryStorageKey(userId: string) {
  return `${HOME_SUMMARY_KEY_PREFIX}.${userId}`;
}

function activitySummaryStorageKey(userId: string) {
  return `${ACTIVITY_SUMMARY_KEY_PREFIX}.${userId}`;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseHomeSummary(
  value: unknown,
): ExperienceHomeSummaryResponse | null {
  if (!isObject(value)) {
    return null;
  }
  if (
    typeof value.generatedAt !== "string" ||
    !isObject(value.status) ||
    !isObject(value.counts) ||
    !isObject(value.spotlight)
  ) {
    return null;
  }

  return value as unknown as ExperienceHomeSummaryResponse;
}

function parseActivitySummary(
  value: unknown,
): ExperienceActivitySummaryResponse | null {
  if (!isObject(value)) {
    return null;
  }
  if (
    typeof value.generatedAt !== "string" ||
    !isObject(value.counts) ||
    !isObject(value.sections)
  ) {
    return null;
  }

  return value as unknown as ExperienceActivitySummaryResponse;
}

export async function loadStoredHomeSummary(
  userId: string,
): Promise<ExperienceHomeSummaryResponse | null> {
  const raw = await AsyncStorage.getItem(homeSummaryStorageKey(userId));
  if (!raw) {
    return null;
  }

  try {
    return parseHomeSummary(JSON.parse(raw));
  } catch {
    return null;
  }
}

export async function saveStoredHomeSummary(
  userId: string,
  summary: ExperienceHomeSummaryResponse,
): Promise<void> {
  await AsyncStorage.setItem(
    homeSummaryStorageKey(userId),
    JSON.stringify(summary),
  );
}

export async function loadStoredActivitySummary(
  userId: string,
): Promise<ExperienceActivitySummaryResponse | null> {
  const raw = await AsyncStorage.getItem(activitySummaryStorageKey(userId));
  if (!raw) {
    return null;
  }

  try {
    return parseActivitySummary(JSON.parse(raw));
  } catch {
    return null;
  }
}

export async function saveStoredActivitySummary(
  userId: string,
  summary: ExperienceActivitySummaryResponse,
): Promise<void> {
  await AsyncStorage.setItem(
    activitySummaryStorageKey(userId),
    JSON.stringify(summary),
  );
}

export async function clearStoredExperience(userId: string): Promise<void> {
  await Promise.all([
    AsyncStorage.removeItem(homeSummaryStorageKey(userId)),
    AsyncStorage.removeItem(activitySummaryStorageKey(userId)),
  ]);
}
