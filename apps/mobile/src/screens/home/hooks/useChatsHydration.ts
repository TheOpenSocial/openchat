import { useEffect } from "react";
import type { SetStateAction } from "react";

import { loadStoredChats } from "../../../lib/chat-storage";
import type { LocalChatThread } from "../domain/types";

type SetState<T> = (value: SetStateAction<T>) => void;

type UseChatsHydrationInput = {
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

    return () => {
      mounted = false;
    };
  }, [
    setBanner,
    setChatStorageReady,
    setChats,
    setSelectedChatId,
    skipNetwork,
    userId,
  ]);
}
