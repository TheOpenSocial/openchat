import { useCallback, useEffect } from "react";
import type { MutableRefObject, SetStateAction } from "react";

import { api } from "../../../lib/api";
import { saveStoredChats } from "../../../lib/chat-storage";
import type { TelemetryEventName } from "../../../lib/telemetry";
import { mergeChatMessages } from "../domain/chat-utils";
import type { LocalChatThread } from "../domain/types";

type BannerInput = {
  tone: "error" | "info" | "success";
  text: string;
};

type SetState<T> = (value: SetStateAction<T>) => void;

type UseChatSyncControllerInput = {
  chatStorageReady: boolean;
  chats: LocalChatThread[];
  chatsRef: MutableRefObject<LocalChatThread[]>;
  designMock: boolean;
  enableE2ELocalMode: boolean;
  netOnline: boolean;
  selectedChatIdRef: MutableRefObject<string | null>;
  sessionAccessToken: string;
  sessionUserId: string;
  setBanner: (input: BannerInput | null) => void;
  setChats: SetState<LocalChatThread[]>;
  setSyncingChats: SetState<Record<string, boolean>>;
  skipNetwork: boolean;
  trackTelemetry: (
    name: TelemetryEventName,
    properties?: Record<string, unknown>,
  ) => void;
};

export function useChatSyncController({
  chatStorageReady,
  chats,
  chatsRef,
  designMock,
  enableE2ELocalMode,
  netOnline,
  selectedChatIdRef,
  sessionAccessToken,
  sessionUserId,
  setBanner,
  setChats,
  setSyncingChats,
  skipNetwork,
  trackTelemetry,
}: UseChatSyncControllerInput) {
  const setChatSyncingState = useCallback(
    (chatId: string, syncing: boolean) => {
      setSyncingChats((current) => {
        if (syncing) {
          if (current[chatId]) {
            return current;
          }
          return { ...current, [chatId]: true };
        }

        if (!current[chatId]) {
          return current;
        }

        const next = { ...current };
        delete next[chatId];
        return next;
      });
    },
    [setSyncingChats],
  );

  const syncChatThread = useCallback(
    async (
      chatId: string,
      options?: {
        force?: boolean;
        quiet?: boolean;
      },
    ) => {
      if (enableE2ELocalMode || designMock) {
        return true;
      }

      const currentThread = chatsRef.current.find(
        (thread) => thread.id === chatId,
      );
      const after = options?.force
        ? undefined
        : (currentThread?.highWatermark ?? undefined);

      setChatSyncingState(chatId, true);
      try {
        const [syncResult, metadata] = await Promise.all([
          api.syncChatMessages(
            chatId,
            sessionUserId,
            { after, limit: 100 },
            sessionAccessToken,
          ),
          api.getChatMetadata(chatId, sessionAccessToken).catch(() => null),
        ]);

        setChats((current) =>
          current.map((thread) => {
            if (thread.id !== chatId) {
              return thread;
            }

            const mergedMessages = mergeChatMessages(
              thread.messages,
              syncResult.messages,
            );
            const selected = selectedChatIdRef.current === chatId;

            return {
              ...thread,
              messages: mergedMessages,
              highWatermark:
                syncResult.highWatermark ??
                mergedMessages.at(-1)?.createdAt ??
                thread.highWatermark,
              unreadCount: selected ? 0 : Math.max(syncResult.unreadCount, 0),
              participantCount:
                typeof metadata?.participantCount === "number"
                  ? metadata.participantCount
                  : thread.participantCount,
              connectionStatus:
                typeof metadata?.connectionStatus === "string"
                  ? metadata.connectionStatus
                  : thread.connectionStatus,
            };
          }),
        );
        return true;
      } catch (error) {
        if (!options?.quiet) {
          setBanner({
            tone: "error",
            text: `Failed to sync chat: ${String(error)}`,
          });
        }
        return false;
      } finally {
        setChatSyncingState(chatId, false);
      }
    },
    [
      chatsRef,
      designMock,
      enableE2ELocalMode,
      selectedChatIdRef,
      sessionAccessToken,
      sessionUserId,
      setBanner,
      setChatSyncingState,
      setChats,
    ],
  );

  useEffect(() => {
    if (skipNetwork) {
      return;
    }
    if (!chatStorageReady) {
      return;
    }

    saveStoredChats(sessionUserId, chats).catch((error) => {
      setBanner({
        tone: "error",
        text: `Failed to persist chats: ${String(error)}`,
      });
    });
  }, [chatStorageReady, chats, sessionUserId, setBanner, skipNetwork]);

  useEffect(() => {
    if (skipNetwork) {
      return;
    }
    if (!netOnline) {
      return;
    }
    if (!chatStorageReady || chats.length === 0) {
      return;
    }

    let cancelled = false;
    const syncAll = async () => {
      const chatIds = chatsRef.current.map((thread) => thread.id);
      for (const chatId of chatIds) {
        if (cancelled) {
          return;
        }
        await syncChatThread(chatId, { quiet: true });
      }
    };

    syncAll().catch(() => {});
    const interval = setInterval(() => {
      syncAll().catch(() => {});
    }, 30_000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [
    chatStorageReady,
    chats.length,
    chatsRef,
    netOnline,
    skipNetwork,
    syncChatThread,
  ]);

  const syncChatsNow = useCallback(async () => {
    const chatIds = chatsRef.current.map((thread) => thread.id);
    if (chatIds.length === 0) {
      return;
    }

    if (designMock) {
      setBanner({
        tone: "success",
        text: "Chats up to date (preview).",
      });
      return;
    }

    trackTelemetry("chat_sync_manual", {
      threads: chatIds.length,
    });
    let failures = 0;
    for (const chatId of chatIds) {
      const ok = await syncChatThread(chatId, { quiet: true });
      if (!ok) {
        failures += 1;
      }
    }

    if (failures === 0) {
      setBanner({
        tone: "success",
        text: "Chats synced.",
      });
      return;
    }

    setBanner({
      tone: "error",
      text: `Chat sync completed with ${failures} failure${failures === 1 ? "" : "s"}.`,
    });
    trackTelemetry("chat_sync_failed", {
      failures,
      total: chatIds.length,
    });
  }, [chatsRef, designMock, setBanner, syncChatThread, trackTelemetry]);

  return {
    syncChatThread,
    syncChatsNow,
  };
}
