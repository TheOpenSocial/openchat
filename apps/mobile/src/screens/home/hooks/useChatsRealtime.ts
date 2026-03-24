import {
  useCallback,
  useEffect,
  useRef,
  type MutableRefObject,
  type SetStateAction,
} from "react";

import type { ChatMessageRecord } from "../../../lib/api";
import {
  createRealtimeSession,
  type RealtimeConnectionState,
  type RealtimeSession,
} from "../../../lib/realtime";
import { mergeChatMessages } from "../domain/chat-utils";
import type { LocalChatThread } from "../domain/types";

type SetState<T> = (value: SetStateAction<T>) => void;

type UseChatsRealtimeInput = {
  applyRealtimeChatMessage: (
    chatId: string,
    message: ChatMessageRecord,
  ) => void;
  chatStorageReady: boolean;
  chats: LocalChatThread[];
  chatsRef: MutableRefObject<LocalChatThread[]>;
  localTypingActiveRef: MutableRefObject<boolean>;
  localTypingChatIdRef: MutableRefObject<string | null>;
  localTypingStopTimeoutRef: MutableRefObject<ReturnType<
    typeof setTimeout
  > | null>;
  realtimeSessionRef: MutableRefObject<RealtimeSession | null>;
  selectedChatId: string | null;
  selectedChatIdRef: MutableRefObject<string | null>;
  sessionAccessToken: string;
  sessionUserId: string;
  setChats: SetState<LocalChatThread[]>;
  setRealtimeState: (value: SetStateAction<RealtimeConnectionState>) => void;
  setTypingUsersByChat: SetState<Record<string, string[]>>;
  skipNetwork: boolean;
};

export function useChatsRealtime({
  applyRealtimeChatMessage,
  chatStorageReady,
  chats,
  chatsRef,
  localTypingActiveRef,
  localTypingChatIdRef,
  localTypingStopTimeoutRef,
  realtimeSessionRef,
  selectedChatId,
  selectedChatIdRef,
  sessionAccessToken,
  sessionUserId,
  setChats,
  setRealtimeState,
  setTypingUsersByChat,
  skipNetwork,
}: UseChatsRealtimeInput) {
  const typingClearTimersRef = useRef<
    Map<string, ReturnType<typeof setTimeout>>
  >(new Map());

  const clearTypingUser = useCallback(
    (chatId: string, userId: string) => {
      setTypingUsersByChat((current) => {
        const users = current[chatId];
        if (!users || users.length === 0) {
          return current;
        }
        const nextUsers = users.filter((candidate) => candidate !== userId);
        if (nextUsers.length === users.length) {
          return current;
        }
        if (nextUsers.length === 0) {
          const next = { ...current };
          delete next[chatId];
          return next;
        }
        return {
          ...current,
          [chatId]: nextUsers,
        };
      });
    },
    [setTypingUsersByChat],
  );

  useEffect(() => {
    chatsRef.current = chats;
  }, [chats, chatsRef]);

  useEffect(() => {
    selectedChatIdRef.current = selectedChatId;
  }, [selectedChatId, selectedChatIdRef]);

  useEffect(() => {
    if (skipNetwork) {
      return;
    }
    if (!chatStorageReady) {
      return;
    }

    const replaySince = new Date(Date.now() - 5 * 60_000).toISOString();
    const realtimeSession = createRealtimeSession({
      userId: sessionUserId,
      accessToken: sessionAccessToken,
      roomIds: chatsRef.current.map((thread) => thread.id),
      replaySince,
      callbacks: {
        onConnectionStateChange: setRealtimeState,
        onChatMessageCreated: (chatId, message) => {
          applyRealtimeChatMessage(chatId, message);
        },
        onChatReplay: (chatId, messages) => {
          if (messages.length === 0) {
            return;
          }
          setChats((current) =>
            current.map((thread) => {
              if (thread.id !== chatId) {
                return thread;
              }
              const mergedMessages = mergeChatMessages(
                thread.messages,
                messages,
              );
              return {
                ...thread,
                messages: mergedMessages,
                highWatermark:
                  mergedMessages.at(-1)?.createdAt ?? thread.highWatermark,
              };
            }),
          );
        },
        onTyping: ({ roomId, userId, isTyping }) => {
          if (userId === sessionUserId) {
            return;
          }

          const timerKey = `${roomId}:${userId}`;
          const currentTimer = typingClearTimersRef.current.get(timerKey);
          if (currentTimer) {
            clearTimeout(currentTimer);
            typingClearTimersRef.current.delete(timerKey);
          }

          if (!isTyping) {
            clearTypingUser(roomId, userId);
            return;
          }

          setTypingUsersByChat((current) => {
            const currentUsers = current[roomId] ?? [];
            if (currentUsers.includes(userId)) {
              return current;
            }
            return {
              ...current,
              [roomId]: [...currentUsers, userId],
            };
          });

          const clearTimer = setTimeout(() => {
            clearTypingUser(roomId, userId);
            typingClearTimersRef.current.delete(timerKey);
          }, 3_000);
          typingClearTimersRef.current.set(timerKey, clearTimer);
        },
      },
    });

    realtimeSessionRef.current = realtimeSession;

    return () => {
      for (const timer of typingClearTimersRef.current.values()) {
        clearTimeout(timer);
      }
      typingClearTimersRef.current.clear();
      if (localTypingStopTimeoutRef.current) {
        clearTimeout(localTypingStopTimeoutRef.current);
        localTypingStopTimeoutRef.current = null;
      }
      localTypingActiveRef.current = false;
      localTypingChatIdRef.current = null;
      setTypingUsersByChat({});
      realtimeSession.disconnect();
      realtimeSessionRef.current = null;
    };
  }, [
    applyRealtimeChatMessage,
    chatStorageReady,
    chatsRef,
    clearTypingUser,
    localTypingActiveRef,
    localTypingChatIdRef,
    localTypingStopTimeoutRef,
    realtimeSessionRef,
    sessionAccessToken,
    sessionUserId,
    setChats,
    setRealtimeState,
    setTypingUsersByChat,
    skipNetwork,
  ]);

  useEffect(() => {
    if (skipNetwork) {
      return;
    }
    realtimeSessionRef.current?.updateRooms(chats.map((thread) => thread.id));
  }, [chats, realtimeSessionRef, skipNetwork]);

  useEffect(() => {
    const previousChatId = localTypingChatIdRef.current;
    if (
      previousChatId &&
      previousChatId !== selectedChatId &&
      localTypingActiveRef.current
    ) {
      realtimeSessionRef.current?.publishTyping(
        previousChatId,
        sessionUserId,
        false,
      );
      localTypingActiveRef.current = false;
    }
    localTypingChatIdRef.current = selectedChatId;
  }, [
    localTypingActiveRef,
    localTypingChatIdRef,
    realtimeSessionRef,
    selectedChatId,
    sessionUserId,
  ]);
}
