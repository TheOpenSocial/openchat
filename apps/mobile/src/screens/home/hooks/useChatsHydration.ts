import { useEffect } from "react";
import type { SetStateAction } from "react";

import { api } from "../../../lib/api";
import { loadStoredChats } from "../../../lib/chat-storage";
import { buildE2EChatThreads } from "../../../features/debug/e2e-chat-fixtures";
import type { LocalChatThread } from "../domain/types";

type SetState<T> = (value: SetStateAction<T>) => void;

type UseChatsHydrationInput = {
  sessionAccessToken: string;
  skipNetwork: boolean;
  accessToken: string;
  userId: string;
  setBanner: (
    input: { tone: "error" | "info" | "success"; text: string } | null,
  ) => void;
  setChatStorageReady: SetState<boolean>;
  setChats: SetState<LocalChatThread[]>;
  setSelectedChatId: SetState<string | null>;
};

export function useChatsHydration({
  sessionAccessToken,
  skipNetwork,
  accessToken,
  userId,
  setBanner,
  setChatStorageReady,
  setChats,
  setSelectedChatId,
}: UseChatsHydrationInput) {
  useEffect(() => {
    if (skipNetwork) {
      return;
    }
    const e2eSeedChatsEnabled = Boolean(
      process.env.EXPO_PUBLIC_E2E_SESSION_B64?.trim(),
    );
    let mounted = true;
    setChatStorageReady(false);
    setChats([]);
    setSelectedChatId(null);

    loadStoredChats(userId)
      .then(async (storedThreads) => {
        if (!mounted) {
          return;
        }
        const initialThreads =
          storedThreads.length > 0
            ? storedThreads
            : e2eSeedChatsEnabled
              ? buildE2EChatThreads(userId)
              : [];
        setChats(initialThreads);
        if (initialThreads.length > 0) {
          setSelectedChatId(initialThreads[0].id);
        }

        const liveThreads = await api.listChats(accessToken);
        if (!mounted) {
          return;
        }
        const storedById = new Map(
          initialThreads.map((thread) => [thread.id, thread]),
        );
        const mergedThreads = liveThreads.map((thread) => {
          const stored = storedById.get(thread.id);
          return {
            id: thread.id,
            connectionId: thread.connectionId,
            title: thread.title,
            type: thread.type,
            messages: stored?.messages ?? [],
            highWatermark: thread.highWatermark,
            unreadCount: thread.unreadCount,
            participantCount: thread.participantCount,
            connectionStatus: thread.connectionStatus,
          };
        });
        setChats(mergedThreads);
        if (mergedThreads.length > 0) {
          setSelectedChatId((current) =>
            current && mergedThreads.some((thread) => thread.id === current)
              ? current
              : (mergedThreads[0]?.id ?? null),
          );
        }
      })
      .catch((error) => {
        if (!mounted) {
          return;
        }
        if (e2eSeedChatsEnabled) {
          const seededThreads = buildE2EChatThreads(userId);
          setChats(seededThreads);
          setSelectedChatId(seededThreads[0]?.id ?? null);
          setBanner({
            tone: "info",
            text: "Using local E2E chat fixtures while the API is unavailable.",
          });
          return;
        }
        setBanner({
          tone: "error",
          text: `Failed to restore chats: ${String(error)}`,
        });
      })
      .finally(() => {
        if (mounted) {
          setChatStorageReady(true);
        }
      });

    void api
      .listChats(sessionAccessToken)
      .then((remoteThreads) => {
        if (!mounted || remoteThreads.length === 0) {
          return;
        }
        const normalizedThreads: LocalChatThread[] = remoteThreads.map(
          (thread) => ({
            ...thread,
            messages: [],
          }),
        );
        setChats((current) => {
          const byId = new Map(current.map((thread) => [thread.id, thread]));
          for (const thread of normalizedThreads) {
            const existing = byId.get(thread.id);
            byId.set(thread.id, {
              ...thread,
              messages: existing?.messages ?? [],
              highWatermark: existing?.highWatermark ?? thread.highWatermark,
              unreadCount: existing?.unreadCount ?? thread.unreadCount,
            });
          }
          return Array.from(byId.values()).sort((left, right) => {
            const leftTs = Date.parse(
              left.highWatermark ?? left.messages.at(-1)?.createdAt ?? "",
            );
            const rightTs = Date.parse(
              right.highWatermark ?? right.messages.at(-1)?.createdAt ?? "",
            );
            return (
              (Number.isFinite(rightTs) ? rightTs : 0) -
              (Number.isFinite(leftTs) ? leftTs : 0)
            );
          });
        });
        setSelectedChatId(
          (current) => current ?? normalizedThreads[0]?.id ?? null,
        );
      })
      .catch((error) => {
        if (!mounted) {
          return;
        }
        setBanner({
          tone: "error",
          text: `Failed to load live chats: ${String(error)}`,
        });
      });

    return () => {
      mounted = false;
    };
  }, [
    setBanner,
    sessionAccessToken,
    setChatStorageReady,
    setChats,
    setSelectedChatId,
    skipNetwork,
    accessToken,
    userId,
  ]);
}
