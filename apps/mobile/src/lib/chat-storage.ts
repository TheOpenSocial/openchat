import AsyncStorage from "@react-native-async-storage/async-storage";

import type { ChatMessageRecord } from "./api";

export interface StoredChatThread {
  id: string;
  connectionId: string;
  title: string;
  type: "dm" | "group";
  messages: ChatMessageRecord[];
  highWatermark: string | null;
  unreadCount: number;
  participantCount: number | null;
  connectionStatus: string | null;
}

const CHAT_KEY_PREFIX = "opensocial.mobile.chats.v1";

function chatStorageKey(userId: string) {
  return `${CHAT_KEY_PREFIX}.${userId}`;
}

export async function loadStoredChats(
  userId: string,
): Promise<StoredChatThread[]> {
  const raw = await AsyncStorage.getItem(chatStorageKey(userId));
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter((row): row is StoredChatThread => {
        return (
          typeof row === "object" &&
          row !== null &&
          typeof (row as StoredChatThread).id === "string" &&
          typeof (row as StoredChatThread).connectionId === "string" &&
          typeof (row as StoredChatThread).title === "string" &&
          ((row as StoredChatThread).type === "dm" ||
            (row as StoredChatThread).type === "group") &&
          Array.isArray((row as StoredChatThread).messages)
        );
      })
      .map((row) => ({
        ...row,
        highWatermark: row.highWatermark ?? null,
        unreadCount:
          typeof row.unreadCount === "number"
            ? Math.max(row.unreadCount, 0)
            : 0,
        participantCount:
          typeof row.participantCount === "number"
            ? Math.max(Math.floor(row.participantCount), 0)
            : null,
        connectionStatus:
          typeof row.connectionStatus === "string"
            ? row.connectionStatus
            : null,
      }));
  } catch {
    return [];
  }
}

export async function saveStoredChats(
  userId: string,
  threads: StoredChatThread[],
): Promise<void> {
  await AsyncStorage.setItem(chatStorageKey(userId), JSON.stringify(threads));
}

export async function clearStoredChats(userId: string): Promise<void> {
  await AsyncStorage.removeItem(chatStorageKey(userId));
}
