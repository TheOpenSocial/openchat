import { useEffect } from "react";
import type { SetStateAction } from "react";

import { api } from "../../../lib/api";
import { loadStoredChats } from "../../../lib/chat-storage";
import type { LocalChatThread } from "../domain/types";

type SetState<T> = (value: SetStateAction<T>) => void;

type UseChatsHydrationInput = {
  sessionAccessToken: string;
  skipNetwork: boolean;
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
      .then((storedThreads) => {
        if (!mounted) {
          return;
        }
        setChats(storedThreads);
        if (storedThreads.length > 0) {
          setSelectedChatId(storedThreads[0].id);
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
    userId,
  ]);
}
