import { useEffect } from "react";
import type { SetStateAction } from "react";

import { api } from "../../../lib/api";
import { loadStoredChats } from "../../../lib/chat-storage";
import type { LocalChatThread } from "../domain/types";

type SetState<T> = (value: SetStateAction<T>) => void;

type UseChatsHydrationInput = {
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
    let mounted = true;
    setChatStorageReady(false);
    setChats([]);
    setSelectedChatId(null);

    loadStoredChats(userId)
      .then(async (storedThreads) => {
        if (!mounted) {
          return;
        }
        setChats(storedThreads);
        if (storedThreads.length > 0) {
          setSelectedChatId(storedThreads[0].id);
        }

        const liveThreads = await api.listChats(accessToken);
        if (!mounted) {
          return;
        }
        const storedById = new Map(
          storedThreads.map((thread) => [thread.id, thread]),
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

    return () => {
      mounted = false;
    };
  }, [
    setBanner,
    setChatStorageReady,
    setChats,
    setSelectedChatId,
    skipNetwork,
    accessToken,
    userId,
  ]);
}
