import AsyncStorage from "@react-native-async-storage/async-storage";

import { api, isOfflineApiError, isRetryableApiError } from "./api";
import { uploadProfilePhotoFromPickerAsset } from "./profile-photo-upload";

const OUTBOX_KEY_PREFIX = "opensocial.mobile.outbox.v1";
const OUTBOX_MAX_ITEMS = 100;
const BASE_RETRY_DELAY_MS = 1_000;
const MAX_RETRY_DELAY_MS = 5 * 60_000;

export type MobileOfflineOutboxItem =
  | {
      id: string;
      userId: string;
      kind: "composer_send";
      dedupeKey: string;
      createdAt: string;
      attemptCount: number;
      nextAttemptAt: string;
      lastError: string | null;
      payload: {
        mode: "chat" | "intent";
        threadId: string | null;
        text: string;
        voiceTranscript?: string;
        attachments?: Array<
          | { kind: "image_url"; url: string; caption?: string }
          | { kind: "file_ref"; fileId: string; caption?: string }
        >;
        allowDecomposition?: boolean;
        maxIntents?: number;
      };
    }
  | {
      id: string;
      userId: string;
      kind: "profile_save";
      dedupeKey: string;
      createdAt: string;
      attemptCount: number;
      nextAttemptAt: string;
      lastError: string | null;
      payload: {
        displayName?: string;
        bio?: string;
        city?: string;
        country?: string;
        visibility?: "public" | "limited" | "private";
        interests: string[];
        socialMode: {
          socialMode: "chill" | "balanced" | "high_energy";
          preferOneToOne: boolean;
          allowGroupInvites: boolean;
        };
        globalRules: {
          whoCanContact: "anyone" | "verified_only" | "trusted_only";
          reachable: "always" | "available_only" | "do_not_disturb";
          intentMode: "one_to_one" | "group" | "balanced";
          modality: "online" | "offline" | "either";
          languagePreferences: string[];
          countryPreferences: string[];
          requireVerifiedUsers: boolean;
          notificationMode: "immediate" | "digest" | "quiet";
          agentAutonomy: "manual" | "suggest_only" | "auto_non_risky";
          memoryMode: "minimal" | "standard" | "extended";
        };
        profilePhoto?: {
          uri: string;
          mimeType?: string;
          fileSize?: number;
        };
      };
    };

export type ProcessOutboxResult = {
  processed: number;
  remaining: number;
  failed: number;
  sentThreadIds: string[];
  savedProfiles: number;
};

function storageKey(userId: string) {
  return `${OUTBOX_KEY_PREFIX}.${userId}`;
}

function createId() {
  return `outbox_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

function buildComposerDedupeKey(input: {
  userId: string;
  mode: "chat" | "intent";
  threadId: string | null;
  text: string;
}) {
  return [
    input.userId,
    "composer_send",
    input.mode,
    input.threadId ?? "no_thread",
    input.text.trim().toLowerCase(),
  ].join(":");
}

function isComposerItem(
  item: MobileOfflineOutboxItem,
): item is Extract<MobileOfflineOutboxItem, { kind: "composer_send" }> {
  return item.kind === "composer_send";
}

function nextAttemptIso(attemptCount: number) {
  const delay = Math.min(
    MAX_RETRY_DELAY_MS,
    BASE_RETRY_DELAY_MS * 2 ** Math.max(attemptCount - 1, 0),
  );
  return new Date(Date.now() + delay).toISOString();
}

function normalizeOutbox(raw: string | null): MobileOfflineOutboxItem[] {
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter(
      (row): row is MobileOfflineOutboxItem =>
        typeof row === "object" &&
        row !== null &&
        typeof (row as MobileOfflineOutboxItem).id === "string" &&
        typeof (row as MobileOfflineOutboxItem).userId === "string" &&
        (row as MobileOfflineOutboxItem).kind !== undefined,
    );
  } catch {
    return [];
  }
}

async function saveItems(
  userId: string,
  items: MobileOfflineOutboxItem[],
): Promise<void> {
  await AsyncStorage.setItem(storageKey(userId), JSON.stringify(items));
}

export async function loadOfflineOutbox(
  userId: string,
): Promise<MobileOfflineOutboxItem[]> {
  const raw = await AsyncStorage.getItem(storageKey(userId));
  return normalizeOutbox(raw);
}

export async function clearOfflineOutbox(userId: string): Promise<void> {
  await AsyncStorage.removeItem(storageKey(userId));
}

async function upsertOutboxItem(item: MobileOfflineOutboxItem) {
  const current = await loadOfflineOutbox(item.userId);
  const next = [
    item,
    ...current.filter((row) => row.dedupeKey !== item.dedupeKey),
  ].slice(0, OUTBOX_MAX_ITEMS);
  await saveItems(item.userId, next);
  return item;
}

export async function queueOfflineComposerSend(input: {
  userId: string;
  mode: "chat" | "intent";
  threadId: string | null;
  text: string;
  voiceTranscript?: string;
  attachments?: Array<
    | { kind: "image_url"; url: string; caption?: string }
    | { kind: "file_ref"; fileId: string; caption?: string }
  >;
  allowDecomposition?: boolean;
  maxIntents?: number;
}) {
  return upsertOutboxItem({
    id: createId(),
    userId: input.userId,
    kind: "composer_send",
    dedupeKey: buildComposerDedupeKey(input),
    createdAt: new Date().toISOString(),
    attemptCount: 0,
    nextAttemptAt: new Date().toISOString(),
    lastError: null,
    payload: {
      mode: input.mode,
      threadId: input.threadId,
      text: input.text,
      ...(input.voiceTranscript
        ? { voiceTranscript: input.voiceTranscript }
        : {}),
      ...(input.attachments?.length ? { attachments: input.attachments } : {}),
      ...(typeof input.allowDecomposition === "boolean"
        ? { allowDecomposition: input.allowDecomposition }
        : {}),
      ...(typeof input.maxIntents === "number"
        ? { maxIntents: input.maxIntents }
        : {}),
    },
  });
}

export async function queueOfflineProfileSave(input: {
  userId: string;
  displayName?: string;
  bio?: string;
  city?: string;
  country?: string;
  visibility?: "public" | "limited" | "private";
  interests: string[];
  socialMode: {
    socialMode: "chill" | "balanced" | "high_energy";
    preferOneToOne: boolean;
    allowGroupInvites: boolean;
  };
  globalRules: {
    whoCanContact: "anyone" | "verified_only" | "trusted_only";
    reachable: "always" | "available_only" | "do_not_disturb";
    intentMode: "one_to_one" | "group" | "balanced";
    modality: "online" | "offline" | "either";
    languagePreferences: string[];
    countryPreferences: string[];
    requireVerifiedUsers: boolean;
    notificationMode: "immediate" | "digest" | "quiet";
    agentAutonomy: "manual" | "suggest_only" | "auto_non_risky";
    memoryMode: "minimal" | "standard" | "extended";
  };
  profilePhoto?: {
    uri: string;
    mimeType?: string;
    fileSize?: number;
  };
}) {
  return upsertOutboxItem({
    id: createId(),
    userId: input.userId,
    kind: "profile_save",
    dedupeKey: `${input.userId}:profile_save`,
    createdAt: new Date().toISOString(),
    attemptCount: 0,
    nextAttemptAt: new Date().toISOString(),
    lastError: null,
    payload: {
      ...(input.displayName ? { displayName: input.displayName } : {}),
      ...(input.bio ? { bio: input.bio } : {}),
      ...(input.city ? { city: input.city } : {}),
      ...(input.country ? { country: input.country } : {}),
      ...(input.visibility ? { visibility: input.visibility } : {}),
      interests: input.interests,
      socialMode: input.socialMode,
      globalRules: input.globalRules,
      ...(input.profilePhoto ? { profilePhoto: input.profilePhoto } : {}),
    },
  });
}

export async function processOfflineOutbox(input: {
  userId: string;
  accessToken: string;
}) {
  const items = await loadOfflineOutbox(input.userId);
  const now = Date.now();
  const remaining: MobileOfflineOutboxItem[] = [];
  const result: ProcessOutboxResult = {
    processed: 0,
    remaining: 0,
    failed: 0,
    sentThreadIds: [],
    savedProfiles: 0,
  };

  for (const item of items) {
    if (Date.parse(item.nextAttemptAt) > now) {
      remaining.push(item);
      continue;
    }

    try {
      if (isComposerItem(item)) {
        if (item.payload.mode === "chat" && item.payload.threadId) {
          await api.agentThreadRespond(
            item.payload.threadId,
            input.userId,
            item.payload.text,
            input.accessToken,
            { idempotencyKey: item.id },
            {
              ...(item.payload.voiceTranscript
                ? { voiceTranscript: item.payload.voiceTranscript }
                : {}),
              ...(item.payload.attachments?.length
                ? { attachments: item.payload.attachments }
                : {}),
            },
          );
          result.sentThreadIds.push(item.payload.threadId);
        } else if (item.payload.mode === "intent" && item.payload.threadId) {
          await api.createIntentFromAgentMessage(
            item.payload.threadId,
            input.userId,
            item.payload.text,
            input.accessToken,
            {
              idempotencyKey: item.id,
              ...(typeof item.payload.allowDecomposition === "boolean"
                ? { allowDecomposition: item.payload.allowDecomposition }
                : {}),
              ...(typeof item.payload.maxIntents === "number"
                ? { maxIntents: item.payload.maxIntents }
                : {}),
            },
          );
          result.sentThreadIds.push(item.payload.threadId);
        } else {
          await api.createIntent(
            input.userId,
            item.payload.text,
            input.accessToken,
            { idempotencyKey: item.id },
          );
        }
      } else {
        await api.updateProfile(
          input.userId,
          {
            bio: item.payload.bio,
            city: item.payload.city,
            country: item.payload.country,
            visibility: item.payload.visibility,
          },
          input.accessToken,
          { idempotencyKey: item.id },
        );

        await Promise.all([
          api.replaceInterests(
            input.userId,
            item.payload.interests.map((interest) => ({
              kind: "topic",
              label: interest,
            })),
            input.accessToken,
          ),
          api.replaceTopics(
            input.userId,
            item.payload.interests.map((interest) => ({ label: interest })),
            input.accessToken,
          ),
          api.setSocialMode(
            input.userId,
            item.payload.socialMode,
            input.accessToken,
          ),
          api.setGlobalRules(
            input.userId,
            item.payload.globalRules,
            input.accessToken,
            { idempotencyKey: item.id },
          ),
        ]);

        if (item.payload.profilePhoto?.uri) {
          await uploadProfilePhotoFromPickerAsset(
            input.userId,
            input.accessToken,
            {
              uri: item.payload.profilePhoto.uri,
              mimeType: item.payload.profilePhoto.mimeType,
              fileSize: item.payload.profilePhoto.fileSize,
            },
          );
        }

        result.savedProfiles += 1;
      }

      result.processed += 1;
    } catch (error) {
      if (isOfflineApiError(error) || isRetryableApiError(error)) {
        remaining.push({
          ...item,
          attemptCount: item.attemptCount + 1,
          lastError: error.message,
          nextAttemptAt: nextAttemptIso(item.attemptCount + 1),
        });
        result.failed += 1;
        continue;
      }
      result.failed += 1;
    }
  }

  result.remaining = remaining.length;
  await saveItems(input.userId, remaining);
  return result;
}
