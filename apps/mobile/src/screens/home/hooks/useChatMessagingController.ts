import { useCallback, type MutableRefObject, type SetStateAction } from "react";

import { api, isOfflineApiError, isRetryableApiError } from "../../../lib/api";
import { hapticImpact } from "../../../lib/haptics";
import type { RealtimeSession } from "../../../lib/realtime";
import { queueOfflineComposerSend } from "../../../lib/offline-outbox";
import { createClientMessageId, mergeChatMessages } from "../domain/chat-utils";
import type { LocalChatMessageRecord, LocalChatThread } from "../domain/types";
import type { TelemetryEventName } from "../../../lib/telemetry";

type BannerInput = {
  tone: "error" | "info" | "success";
  text: string;
};

type SetState<T> = (value: SetStateAction<T>) => void;

type UseChatMessagingControllerInput = {
  chatsRef: MutableRefObject<LocalChatThread[]>;
  draftChatMessage: string;
  localTypingActiveRef: MutableRefObject<boolean>;
  localTypingStopTimeoutRef: MutableRefObject<ReturnType<
    typeof setTimeout
  > | null>;
  netOnline: boolean;
  refreshPendingOutboxCount: () => Promise<void>;
  realtimeSessionRef: MutableRefObject<RealtimeSession | null>;
  selectedChat: LocalChatThread | null;
  selectedChatIdRef: MutableRefObject<string | null>;
  sessionAccessToken: string;
  sessionUserId: string;
  sendingChatMessage: boolean;
  setBanner: (input: BannerInput | null) => void;
  setChats: SetState<LocalChatThread[]>;
  setDraftChatMessage: (value: string) => void;
  setSendingChatMessage: SetState<boolean>;
  trackTelemetry: (
    name: TelemetryEventName,
    properties?: Record<string, unknown>,
  ) => void;
};

export function useChatMessagingController({
  chatsRef,
  draftChatMessage,
  localTypingActiveRef,
  localTypingStopTimeoutRef,
  netOnline,
  refreshPendingOutboxCount,
  realtimeSessionRef,
  selectedChat,
  selectedChatIdRef,
  sessionAccessToken,
  sessionUserId,
  sendingChatMessage,
  setBanner,
  setChats,
  setDraftChatMessage,
  setSendingChatMessage,
  trackTelemetry,
}: UseChatMessagingControllerInput) {
  const handleDraftChatMessageChange = useCallback(
    (value: string) => {
      setDraftChatMessage(value);
      const chatId = selectedChatIdRef.current;
      if (!chatId || !realtimeSessionRef.current) {
        return;
      }

      const hasText = value.trim().length > 0;
      if (hasText && !localTypingActiveRef.current) {
        realtimeSessionRef.current.publishTyping(chatId, sessionUserId, true);
        localTypingActiveRef.current = true;
      }

      if (!hasText && localTypingActiveRef.current) {
        realtimeSessionRef.current.publishTyping(chatId, sessionUserId, false);
        localTypingActiveRef.current = false;
      }

      if (localTypingStopTimeoutRef.current) {
        clearTimeout(localTypingStopTimeoutRef.current);
        localTypingStopTimeoutRef.current = null;
      }

      if (hasText) {
        localTypingStopTimeoutRef.current = setTimeout(() => {
          if (!localTypingActiveRef.current) {
            return;
          }
          const activeChatId = selectedChatIdRef.current;
          if (!activeChatId) {
            return;
          }
          realtimeSessionRef.current?.publishTyping(
            activeChatId,
            sessionUserId,
            false,
          );
          localTypingActiveRef.current = false;
        }, 1_500);
      }
    },
    [
      localTypingActiveRef,
      localTypingStopTimeoutRef,
      realtimeSessionRef,
      selectedChatIdRef,
      sessionUserId,
      setDraftChatMessage,
    ],
  );

  const sendChatMessage = useCallback(async () => {
    const messageBody = draftChatMessage.trim();
    if (!selectedChat || messageBody.length === 0 || sendingChatMessage) {
      return;
    }
    const chatId = selectedChat.id;
    const hadMessages = selectedChat.messages.length > 0;
    const hasCounterpartyMessage = selectedChat.messages.some(
      (message) => message.senderUserId !== sessionUserId,
    );
    const optimisticMessageId = `message_local_${Date.now().toString(36)}`;
    const optimisticMessage: LocalChatMessageRecord = {
      id: optimisticMessageId,
      chatId,
      senderUserId: sessionUserId,
      body: messageBody,
      createdAt: new Date().toISOString(),
      deliveryStatus: "sending",
    };

    setSendingChatMessage(true);
    setDraftChatMessage("");
    setChats((current) =>
      current.map((thread) =>
        thread.id === chatId
          ? {
              ...thread,
              messages: mergeChatMessages(thread.messages, [optimisticMessage]),
              highWatermark: optimisticMessage.createdAt,
              unreadCount: 0,
            }
          : thread,
      ),
    );
    if (localTypingStopTimeoutRef.current) {
      clearTimeout(localTypingStopTimeoutRef.current);
      localTypingStopTimeoutRef.current = null;
    }
    if (localTypingActiveRef.current) {
      realtimeSessionRef.current?.publishTyping(chatId, sessionUserId, false);
      localTypingActiveRef.current = false;
    }
    try {
      if (!netOnline) {
        throw new Error("offline");
      }

      const message = await api.createChatMessage(
        chatId,
        sessionUserId,
        messageBody,
        sessionAccessToken,
        {
          clientMessageId: createClientMessageId(),
        },
      );
      setChats((current) =>
        current.map((thread) =>
          thread.id === chatId
            ? {
                ...thread,
                messages: mergeChatMessages(
                  thread.messages.filter(
                    (item) => item.id !== optimisticMessageId,
                  ),
                  [message],
                ),
                highWatermark: message.createdAt,
                unreadCount: 0,
              }
            : thread,
        ),
      );
      realtimeSessionRef.current?.publishChatMessage(chatId, message);
      if (!hadMessages) {
        trackTelemetry("first_message_sent", {
          chatId,
          bodyLength: messageBody.length,
        });
      } else if (hasCounterpartyMessage) {
        trackTelemetry("message_replied", {
          chatId,
          bodyLength: messageBody.length,
        });
      }
      hapticImpact();
    } catch (error) {
      if (
        isOfflineApiError(error) ||
        isRetryableApiError(error) ||
        !netOnline
      ) {
        await queueOfflineComposerSend({
          userId: sessionUserId,
          mode: "chat",
          threadId: chatId,
          text: messageBody,
          idempotencyKey: createClientMessageId(),
        });
        await refreshPendingOutboxCount().catch(() => {});
        setChats((current) =>
          current.map((thread) =>
            thread.id === chatId
              ? {
                  ...thread,
                  messages: thread.messages.map((message) =>
                    message.id === optimisticMessageId
                      ? { ...message, deliveryStatus: "queued" }
                      : message,
                  ),
                }
              : thread,
          ),
        );
        setBanner({
          tone: "info",
          text: "Message queued. It will send automatically when network is back.",
        });
        return;
      }
      setChats((current) =>
        current.map((thread) =>
          thread.id === chatId
            ? {
                ...thread,
                messages: thread.messages.map((message) =>
                  message.id === optimisticMessageId
                    ? { ...message, deliveryStatus: "failed" }
                    : message,
                ),
              }
            : thread,
        ),
      );
      setBanner({
        tone: "error",
        text: `Failed to send message: ${String(error)}`,
      });
    } finally {
      setSendingChatMessage(false);
    }
  }, [
    draftChatMessage,
    localTypingActiveRef,
    localTypingStopTimeoutRef,
    netOnline,
    refreshPendingOutboxCount,
    realtimeSessionRef,
    selectedChat,
    sendingChatMessage,
    sessionAccessToken,
    sessionUserId,
    setBanner,
    setChats,
    setDraftChatMessage,
    setSendingChatMessage,
    trackTelemetry,
  ]);

  const retryFailedChatMessage = useCallback(
    async (chatId: string, messageId: string) => {
      const thread = chatsRef.current.find((item) => item.id === chatId);
      const failedMessage = thread?.messages.find(
        (item) =>
          item.id === messageId &&
          item.senderUserId === sessionUserId &&
          item.deliveryStatus === "failed",
      );
      if (!failedMessage) {
        return;
      }

      setChats((current) =>
        current.map((item) =>
          item.id === chatId
            ? {
                ...item,
                messages: item.messages.map((message) =>
                  message.id === messageId
                    ? { ...message, deliveryStatus: "sending" }
                    : message,
                ),
              }
            : item,
        ),
      );

      try {
        if (!netOnline) {
          throw new Error("offline");
        }
        const sent = await api.createChatMessage(
          chatId,
          sessionUserId,
          failedMessage.body,
          sessionAccessToken,
          {
            clientMessageId: createClientMessageId(),
          },
        );
        setChats((current) =>
          current.map((item) =>
            item.id === chatId
              ? {
                  ...item,
                  messages: mergeChatMessages(
                    item.messages.filter((message) => message.id !== messageId),
                    [sent],
                  ),
                  highWatermark: sent.createdAt,
                }
              : item,
          ),
        );
        realtimeSessionRef.current?.publishChatMessage(chatId, sent);
      } catch (error) {
        if (
          isOfflineApiError(error) ||
          isRetryableApiError(error) ||
          !netOnline
        ) {
          await queueOfflineComposerSend({
            userId: sessionUserId,
            mode: "chat",
            threadId: chatId,
            text: failedMessage.body,
            idempotencyKey: createClientMessageId(),
          });
          await refreshPendingOutboxCount().catch(() => {});
          setChats((current) =>
            current.map((item) =>
              item.id === chatId
                ? {
                    ...item,
                    messages: item.messages.map((message) =>
                      message.id === messageId
                        ? { ...message, deliveryStatus: "queued" }
                        : message,
                    ),
                  }
                : item,
            ),
          );
          setBanner({
            tone: "info",
            text: "Message queued. It will retry automatically when network is back.",
          });
          return;
        }
        setChats((current) =>
          current.map((item) =>
            item.id === chatId
              ? {
                  ...item,
                  messages: item.messages.map((message) =>
                    message.id === messageId
                      ? { ...message, deliveryStatus: "failed" }
                      : message,
                  ),
                }
              : item,
          ),
        );
        setBanner({
          tone: "error",
          text: `Retry failed: ${String(error)}`,
        });
      }
    },
    [
      chatsRef,
      netOnline,
      refreshPendingOutboxCount,
      realtimeSessionRef,
      sessionAccessToken,
      sessionUserId,
      setBanner,
      setChats,
    ],
  );

  return {
    handleDraftChatMessageChange,
    retryFailedChatMessage,
    sendChatMessage,
  };
}
