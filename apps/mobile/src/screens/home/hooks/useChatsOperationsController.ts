import { useCallback, type SetStateAction } from "react";

import { api } from "../../../lib/api";
import type { TelemetryEventName } from "../../../lib/telemetry";
import { formatChatTitle } from "../domain/chat-utils";
import type { LocalChatThread } from "../domain/types";

type BannerInput = {
  tone: "error" | "info" | "success";
  text: string;
};

type SetState<T> = (value: SetStateAction<T>) => void;

type UseChatsOperationsControllerInput = {
  sessionAccessToken: string;
  sessionUserId: string;
  setBanner: (input: BannerInput | null) => void;
  setChats: SetState<LocalChatThread[]>;
  setSelectedChatId: (value: string | null) => void;
  syncChatThread: (
    chatId: string,
    options?: { force?: boolean; quiet?: boolean },
  ) => Promise<boolean>;
  trackTelemetry: (
    name: TelemetryEventName,
    properties?: Record<string, unknown>,
  ) => void;
};

export function useChatsOperationsController({
  sessionAccessToken,
  sessionUserId,
  setBanner,
  setChats,
  setSelectedChatId,
  syncChatThread,
  trackTelemetry,
}: UseChatsOperationsControllerInput) {
  const reportUser = useCallback(
    async (targetUserId: string, context: { chatId: string }) => {
      try {
        await api.createReport(
          {
            reporterUserId: sessionUserId,
            targetUserId,
            reason: "chat_message_safety_concern",
            details: `Reported from chat ${context.chatId}.`,
          },
          sessionAccessToken,
        );
        setBanner({
          tone: "success",
          text: "Report submitted. Our moderation pipeline will review it.",
        });
        trackTelemetry("report_submitted", {
          source: "chat",
          targetUserId,
          chatId: context.chatId,
        });
      } catch (error) {
        setBanner({
          tone: "error",
          text: `Could not submit report: ${String(error)}`,
        });
      }
    },
    [sessionAccessToken, sessionUserId, setBanner, trackTelemetry],
  );

  const blockUser = useCallback(
    async (blockedUserId: string, context: { chatId: string }) => {
      try {
        await api.blockUser(
          {
            blockerUserId: sessionUserId,
            blockedUserId,
          },
          sessionAccessToken,
        );
        setBanner({
          tone: "success",
          text: "User blocked. You should no longer receive future contact from this account.",
        });
        trackTelemetry("user_blocked", {
          source: "chat",
          blockedUserId,
          chatId: context.chatId,
        });
      } catch (error) {
        setBanner({
          tone: "error",
          text: `Could not block user: ${String(error)}`,
        });
      }
    },
    [sessionAccessToken, sessionUserId, setBanner, trackTelemetry],
  );

  const createDemoChat = useCallback(
    async (type: "dm" | "group") => {
      try {
        const connection = await api.createConnection(
          sessionUserId,
          type,
          sessionAccessToken,
        );
        const connectionId = String(connection.id);
        const chat = await api.createChat(
          connectionId,
          type,
          sessionAccessToken,
        );
        const metadata = await api
          .getChatMetadata(chat.id, sessionAccessToken)
          .catch(() => null);
        const nextThread: LocalChatThread = {
          id: chat.id,
          connectionId,
          title: formatChatTitle(chat.id, type),
          type,
          messages: [],
          highWatermark: null,
          unreadCount: 0,
          participantCount:
            typeof metadata?.participantCount === "number"
              ? metadata.participantCount
              : null,
          connectionStatus:
            typeof metadata?.connectionStatus === "string"
              ? metadata.connectionStatus
              : null,
        };
        setChats((current) => [nextThread, ...current]);
        setSelectedChatId(nextThread.id);
        setBanner({
          tone: "success",
          text:
            type === "group"
              ? "Group chat sandbox created via live API endpoints."
              : "Chat sandbox created via live API endpoints.",
        });
        trackTelemetry("connection_created", {
          connectionId,
          chatId: chat.id,
          type,
        });
        trackTelemetry("chat_started", {
          chatId: chat.id,
          type,
          participantCount:
            typeof metadata?.participantCount === "number"
              ? metadata.participantCount
              : null,
        });
        await syncChatThread(nextThread.id, { quiet: true });
      } catch (error) {
        setBanner({
          tone: "error",
          text: `Failed to create chat sandbox: ${String(error)}`,
        });
      }
    },
    [
      sessionAccessToken,
      sessionUserId,
      setBanner,
      setChats,
      setSelectedChatId,
      syncChatThread,
      trackTelemetry,
    ],
  );

  const openChat = useCallback(
    async (chatId: string) => {
      setSelectedChatId(chatId);
      setChats((current) =>
        current.map((thread) =>
          thread.id === chatId ? { ...thread, unreadCount: 0 } : thread,
        ),
      );
      await syncChatThread(chatId);
    },
    [setChats, setSelectedChatId, syncChatThread],
  );

  return {
    blockUser,
    createDemoChat,
    openChat,
    reportUser,
  };
}
