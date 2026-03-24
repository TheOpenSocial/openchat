import type { ChatMessageRecord } from "../../../lib/api";
import type { StoredChatThread } from "../../../lib/chat-storage";

export type HomeRuntimeState =
  | "idle"
  | "sending"
  | "loading"
  | "matching"
  | "waiting"
  | "ready"
  | "no_match"
  | "error";

export type HomeRuntimeViewModel = {
  state: HomeRuntimeState;
  contextLabel: string | null;
  hint: string | null;
  thinkingLabel: string | null;
  canSend: boolean;
  canRetry: boolean;
  pendingUpdatesCount: number;
};

export type IntentCommand = {
  text: string;
  mode: "chat" | "intent";
  threadId: string | null;
  idempotencyKey: string;
};

export type IntentResult = {
  outcome: "sent" | "queued" | "failed" | "aborted";
  intentId?: string | null;
  intentCount?: number;
};

export type CarryoverSnapshot = {
  seed: string;
  state: "processing" | "queued" | "ready";
  idempotencyKey: string;
  updatedAt: string;
};

export type ChatSyncResult = {
  chatId: string;
  ok: boolean;
  failureReason?: string;
};

export type RealtimeEvent =
  | { kind: "chat_message_created"; chatId: string; messageId: string }
  | { kind: "chat_replay"; chatId: string; count: number }
  | { kind: "typing"; roomId: string; userId: string; isTyping: boolean }
  | { kind: "connection_state"; state: string };

export type LocalDeliveryStatus = "sending" | "queued" | "failed";

export type LocalChatMessageRecord = ChatMessageRecord & {
  deliveryStatus?: LocalDeliveryStatus;
};

export type LocalChatThread = Omit<StoredChatThread, "messages"> & {
  messages: LocalChatMessageRecord[];
};
