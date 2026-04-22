import { io, type Socket } from "socket.io-client";

import {
  API_BASE_URL,
  type ChatMessageReactionRecord,
  type ChatMessageRecord,
  type ChatMessageStatusRecord,
} from "./api";

export type RealtimeConnectionState = "connecting" | "connected" | "offline";

interface RealtimeConnectionRecovered {
  userId: string;
  recoveredAt: string;
  roomsJoined: string[];
  replaySince?: string;
}

interface RealtimePresenceUpdated {
  userId: string;
  online: boolean;
  state?: string;
}

interface RealtimeTypingPayload {
  roomId: string;
  userId: string;
  isTyping: boolean;
}

interface RealtimeReceiptPayload {
  chatId: string;
  messageId: string;
  userId: string;
}

interface RealtimeRequestCreatedPayload {
  requestId: string;
  intentId: string;
}

interface RealtimeRequestUpdatedPayload {
  requestId: string;
  status: "pending" | "accepted" | "rejected" | "expired" | "cancelled";
}

interface RealtimeIntentUpdatedPayload {
  intentId: string;
  status: string;
}

interface RealtimeConnectionCreatedPayload {
  connectionId: string;
  type: "dm" | "group";
}

interface RealtimeModerationNoticePayload {
  userId: string;
  reason: string;
}

export interface RealtimeCallbacks {
  onConnectionStateChange?: (state: RealtimeConnectionState) => void;
  onConnectionRecovered?: (payload: RealtimeConnectionRecovered) => void;
  onChatMessageCreated?: (chatId: string, message: ChatMessageRecord) => void;
  onChatMessageUpdated?: (chatId: string, message: ChatMessageRecord) => void;
  onChatReplay?: (chatId: string, messages: ChatMessageRecord[]) => void;
  onChatReceipt?: (payload: RealtimeReceiptPayload) => void;
  onConnectionCreated?: (payload: RealtimeConnectionCreatedPayload) => void;
  onIntentUpdated?: (payload: RealtimeIntentUpdatedPayload) => void;
  onModerationNotice?: (payload: RealtimeModerationNoticePayload) => void;
  onTyping?: (payload: RealtimeTypingPayload) => void;
  onPresenceUpdated?: (payload: RealtimePresenceUpdated) => void;
  onRequestCreated?: (payload: RealtimeRequestCreatedPayload) => void;
  onRequestUpdated?: (payload: RealtimeRequestUpdatedPayload) => void;
}

interface CreateRealtimeSessionOptions {
  userId: string;
  accessToken?: string;
  roomIds: string[];
  replaySince?: string;
  callbacks?: RealtimeCallbacks;
}

export interface RealtimeSession {
  updateRooms: (roomIds: string[]) => void;
  publishChatMessage: (chatId: string, message: ChatMessageRecord) => void;
  publishReadReceipt: (
    chatId: string,
    messageId: string,
    userId: string,
  ) => void;
  publishTyping: (chatId: string, userId: string, isTyping: boolean) => void;
  disconnect: () => void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

const moderationStates = ["clean", "flagged", "blocked", "review"] as const;

function parseModerationState(
  value: unknown,
): ChatMessageRecord["moderationState"] | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  return moderationStates.includes(value as (typeof moderationStates)[number])
    ? (value as ChatMessageRecord["moderationState"])
    : undefined;
}

function parseChatMessageStatus(
  value: unknown,
): ChatMessageStatusRecord | null {
  if (!isRecord(value)) {
    return null;
  }

  const { state, deliveredCount, readCount, pendingCount } = value;
  if (
    (state === "sent" || state === "delivered" || state === "read") &&
    typeof deliveredCount === "number" &&
    typeof readCount === "number" &&
    typeof pendingCount === "number"
  ) {
    return {
      state,
      deliveredCount,
      readCount,
      pendingCount,
    };
  }

  return null;
}

function parseChatMessageReactions(
  value: unknown,
): ChatMessageReactionRecord[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  return value
    .map((item) => {
      if (!isRecord(item)) {
        return null;
      }
      const { id, messageId, userId, emoji, createdAt } = item;
      if (
        typeof id !== "string" ||
        typeof messageId !== "string" ||
        typeof userId !== "string" ||
        typeof emoji !== "string" ||
        typeof createdAt !== "string"
      ) {
        return null;
      }
      return {
        id,
        messageId,
        userId,
        emoji,
        createdAt,
      };
    })
    .filter(
      (reaction): reaction is ChatMessageReactionRecord => reaction != null,
    );
}

function getRealtimeUrl(apiBaseUrl: string) {
  const trimmed = apiBaseUrl.replace(/\/+$/, "");
  const base = trimmed.endsWith("/api") ? trimmed.slice(0, -4) : trimmed;
  return `${base}/realtime`;
}

function buildSocketAuth(
  userId: string,
  roomIds: string[],
  accessToken?: string,
  replaySince?: string,
) {
  return {
    userId,
    ...(accessToken ? { accessToken } : {}),
    rooms: roomIds,
    ...(replaySince ? { replaySince } : {}),
  };
}

function parseChatMessageRecord(
  value: unknown,
  fallbackChatId?: string,
): ChatMessageRecord | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = typeof value.id === "string" ? value.id : null;
  const senderUserId =
    typeof value.senderUserId === "string" ? value.senderUserId : null;
  const body = typeof value.body === "string" ? value.body : null;
  const createdAt =
    typeof value.createdAt === "string" ? value.createdAt : null;
  const moderationState = parseModerationState(value.moderationState);
  const replyToMessageId =
    typeof value.replyToMessageId === "string" ? value.replyToMessageId : null;
  const editedAt = typeof value.editedAt === "string" ? value.editedAt : null;
  const reactions = parseChatMessageReactions(value.reactions);
  const status = parseChatMessageStatus(value.status);
  const chatId =
    typeof value.chatId === "string" && value.chatId.length > 0
      ? value.chatId
      : (fallbackChatId ?? null);

  if (!id || !chatId || !senderUserId || !body || !createdAt) {
    return null;
  }

  return {
    id,
    chatId,
    senderUserId,
    body,
    createdAt,
    ...(moderationState ? { moderationState } : {}),
    ...(replyToMessageId ? { replyToMessageId } : {}),
    ...(editedAt ? { editedAt } : {}),
    ...(reactions ? { reactions } : {}),
    ...(status ? { status } : {}),
  };
}

function parseTypingPayload(payload: unknown): RealtimeTypingPayload | null {
  if (!isRecord(payload)) {
    return null;
  }

  const roomId = typeof payload.roomId === "string" ? payload.roomId : null;
  const userId = typeof payload.userId === "string" ? payload.userId : null;
  const isTyping =
    typeof payload.isTyping === "boolean" ? payload.isTyping : null;
  if (!roomId || !userId || isTyping == null) {
    return null;
  }

  return { roomId, userId, isTyping };
}

function parseReceiptPayload(payload: unknown): RealtimeReceiptPayload | null {
  if (!isRecord(payload)) {
    return null;
  }

  const chatId = typeof payload.chatId === "string" ? payload.chatId : null;
  const messageId =
    typeof payload.messageId === "string" ? payload.messageId : null;
  const userId = typeof payload.userId === "string" ? payload.userId : null;
  if (!chatId || !messageId || !userId) {
    return null;
  }

  return { chatId, messageId, userId };
}

function parseRequestCreatedPayload(
  payload: unknown,
): RealtimeRequestCreatedPayload | null {
  if (!isRecord(payload)) {
    return null;
  }

  const requestId =
    typeof payload.requestId === "string" ? payload.requestId : null;
  const intentId =
    typeof payload.intentId === "string" ? payload.intentId : null;
  if (!requestId || !intentId) {
    return null;
  }

  return { intentId, requestId };
}

function parseRequestUpdatedPayload(
  payload: unknown,
): RealtimeRequestUpdatedPayload | null {
  if (!isRecord(payload)) {
    return null;
  }

  const requestId =
    typeof payload.requestId === "string" ? payload.requestId : null;
  const status = typeof payload.status === "string" ? payload.status : null;
  if (
    !requestId ||
    !status ||
    !["pending", "accepted", "rejected", "expired", "cancelled"].includes(
      status,
    )
  ) {
    return null;
  }

  return {
    requestId,
    status: status as RealtimeRequestUpdatedPayload["status"],
  };
}

function parseIntentUpdatedPayload(
  payload: unknown,
): RealtimeIntentUpdatedPayload | null {
  if (!isRecord(payload)) {
    return null;
  }

  const intentId =
    typeof payload.intentId === "string" ? payload.intentId : null;
  const status = typeof payload.status === "string" ? payload.status : null;
  if (!intentId || !status) {
    return null;
  }

  return { intentId, status };
}

function parseConnectionCreatedPayload(
  payload: unknown,
): RealtimeConnectionCreatedPayload | null {
  if (!isRecord(payload)) {
    return null;
  }

  const connectionId =
    typeof payload.connectionId === "string" ? payload.connectionId : null;
  const type =
    payload.type === "group" ? "group" : payload.type === "dm" ? "dm" : null;
  if (!connectionId || !type) {
    return null;
  }

  return { connectionId, type };
}

function parseModerationNoticePayload(
  payload: unknown,
): RealtimeModerationNoticePayload | null {
  if (!isRecord(payload)) {
    return null;
  }

  const userId = typeof payload.userId === "string" ? payload.userId : null;
  const reason = typeof payload.reason === "string" ? payload.reason : null;
  if (!userId || !reason) {
    return null;
  }

  return { reason, userId };
}

function parsePresenceUpdated(
  payload: unknown,
): RealtimePresenceUpdated | null {
  if (!isRecord(payload)) {
    return null;
  }
  const userId = typeof payload.userId === "string" ? payload.userId : null;
  const online = typeof payload.online === "boolean" ? payload.online : null;
  const state = typeof payload.state === "string" ? payload.state : undefined;
  if (!userId || online == null) {
    return null;
  }
  return {
    userId,
    online,
    ...(state ? { state } : {}),
  };
}

function parseConnectionRecovered(
  payload: unknown,
): RealtimeConnectionRecovered | null {
  if (!isRecord(payload)) {
    return null;
  }
  const userId = typeof payload.userId === "string" ? payload.userId : null;
  const recoveredAt =
    typeof payload.recoveredAt === "string" ? payload.recoveredAt : null;
  const roomsJoinedRaw = Array.isArray(payload.roomsJoined)
    ? payload.roomsJoined
    : null;
  const replaySince =
    typeof payload.replaySince === "string" ? payload.replaySince : undefined;
  if (!userId || !recoveredAt || !roomsJoinedRaw) {
    return null;
  }
  const roomsJoined = roomsJoinedRaw.filter(
    (room): room is string => typeof room === "string",
  );
  return {
    userId,
    recoveredAt,
    roomsJoined,
    ...(replaySince ? { replaySince } : {}),
  };
}

function parseChatReplayPayload(payload: unknown): {
  roomId: string;
  messages: ChatMessageRecord[];
} | null {
  if (!isRecord(payload)) {
    return null;
  }

  const roomId = typeof payload.roomId === "string" ? payload.roomId : null;
  const messagesRaw = Array.isArray(payload.messages) ? payload.messages : null;
  if (!roomId || !messagesRaw) {
    return null;
  }

  const messages = messagesRaw
    .map((item): ChatMessageRecord | null => {
      if (!isRecord(item)) {
        return null;
      }
      const senderUserId =
        typeof item.senderUserId === "string" ? item.senderUserId : null;
      const body = typeof item.body === "string" ? item.body : null;
      const createdAt = typeof item.sentAt === "string" ? item.sentAt : null;
      const id =
        typeof item.serverMessageId === "string"
          ? item.serverMessageId
          : typeof item.clientMessageId === "string"
            ? item.clientMessageId
            : null;
      if (!id || !senderUserId || !body || !createdAt) {
        return null;
      }
      const moderationState = parseModerationState(item.moderationState);
      const reactions = parseChatMessageReactions(item.reactions);
      const status = parseChatMessageStatus(item.status);
      const message: ChatMessageRecord = {
        id,
        chatId: roomId,
        senderUserId,
        body,
        createdAt,
        ...(moderationState ? { moderationState } : {}),
        ...(typeof item.replyToMessageId === "string"
          ? { replyToMessageId: item.replyToMessageId }
          : {}),
        ...(typeof item.editedAt === "string"
          ? { editedAt: item.editedAt }
          : {}),
        ...(reactions ? { reactions } : {}),
        ...(status ? { status } : {}),
      };
      return message;
    })
    .filter((message): message is ChatMessageRecord => message != null);

  return { roomId, messages };
}

export function createRealtimeSession(
  options: CreateRealtimeSessionOptions,
): RealtimeSession {
  const callbacks = options.callbacks ?? {};
  const roomSet = new Set(
    options.roomIds.filter((roomId) => roomId.trim().length > 0),
  );
  const socketUrl = getRealtimeUrl(API_BASE_URL);
  const socket: Socket = io(socketUrl, {
    transports: ["websocket"],
    auth: buildSocketAuth(
      options.userId,
      Array.from(roomSet),
      options.accessToken,
      options.replaySince,
    ),
  });

  callbacks.onConnectionStateChange?.("connecting");

  const emitAuthentication = () => {
    socket.emit(
      "connection.authenticate",
      buildSocketAuth(
        options.userId,
        Array.from(roomSet),
        options.accessToken,
        options.replaySince,
      ),
    );
  };

  socket.on("connect", () => {
    callbacks.onConnectionStateChange?.("connected");
    emitAuthentication();
  });

  socket.on("disconnect", () => {
    callbacks.onConnectionStateChange?.("offline");
  });

  socket.on("connect_error", () => {
    callbacks.onConnectionStateChange?.("offline");
  });

  socket.on("connection.recovered", (payload: unknown) => {
    const parsed = parseConnectionRecovered(payload);
    if (parsed) {
      callbacks.onConnectionRecovered?.(parsed);
    }
  });

  socket.on("presence.updated", (payload: unknown) => {
    const parsed = parsePresenceUpdated(payload);
    if (parsed) {
      callbacks.onPresenceUpdated?.(parsed);
    }
  });

  socket.on("chat.message.created", (payload: unknown) => {
    if (!isRecord(payload)) {
      return;
    }
    const roomId = typeof payload.roomId === "string" ? payload.roomId : null;
    if (!roomId) {
      return;
    }
    const parsedMessage = parseChatMessageRecord(payload.payload, roomId);
    if (parsedMessage) {
      callbacks.onChatMessageCreated?.(roomId, parsedMessage);
    }
  });

  socket.on("chat.message.updated", (payload: unknown) => {
    if (!isRecord(payload)) {
      return;
    }
    const roomId = typeof payload.roomId === "string" ? payload.roomId : null;
    const message = parseChatMessageRecord(
      isRecord(payload.message) ? payload.message : null,
      roomId ?? undefined,
    );
    if (roomId && message) {
      callbacks.onChatMessageUpdated?.(roomId, message);
    }
  });

  socket.on("chat.replay", (payload: unknown) => {
    const parsed = parseChatReplayPayload(payload);
    if (parsed) {
      callbacks.onChatReplay?.(parsed.roomId, parsed.messages);
    }
  });

  socket.on("chat.typing", (payload: unknown) => {
    const parsed = parseTypingPayload(payload);
    if (parsed) {
      callbacks.onTyping?.(parsed);
    }
  });

  socket.on("chat.receipt", (payload: unknown) => {
    const parsed = parseReceiptPayload(payload);
    if (parsed) {
      callbacks.onChatReceipt?.(parsed);
    }
  });

  socket.on("request.created", (payload: unknown) => {
    const parsed = parseRequestCreatedPayload(payload);
    if (parsed) {
      callbacks.onRequestCreated?.(parsed);
    }
  });

  socket.on("request.updated", (payload: unknown) => {
    const parsed = parseRequestUpdatedPayload(payload);
    if (parsed) {
      callbacks.onRequestUpdated?.(parsed);
    }
  });

  socket.on("intent.updated", (payload: unknown) => {
    const parsed = parseIntentUpdatedPayload(payload);
    if (parsed) {
      callbacks.onIntentUpdated?.(parsed);
    }
  });

  socket.on("connection.created", (payload: unknown) => {
    const parsed = parseConnectionCreatedPayload(payload);
    if (parsed) {
      callbacks.onConnectionCreated?.(parsed);
    }
  });

  socket.on("moderation.notice", (payload: unknown) => {
    const parsed = parseModerationNoticePayload(payload);
    if (parsed) {
      callbacks.onModerationNotice?.(parsed);
    }
  });

  return {
    updateRooms(roomIds: string[]) {
      const nextRoomSet = new Set(
        roomIds.filter((roomId) => roomId.trim().length > 0),
      );
      for (const roomId of nextRoomSet) {
        if (roomSet.has(roomId)) {
          continue;
        }
        roomSet.add(roomId);
        socket.emit("room.join", { roomId });
      }

      for (const roomId of Array.from(roomSet.values())) {
        if (nextRoomSet.has(roomId)) {
          continue;
        }
        roomSet.delete(roomId);
      }

      emitAuthentication();
    },
    publishChatMessage(chatId: string, message: ChatMessageRecord) {
      socket.emit("chat.message.created", {
        roomId: chatId,
        payload: message,
      });
    },
    publishReadReceipt(chatId: string, messageId: string, userId: string) {
      socket.emit("receipt.read", {
        chatId,
        messageId,
        userId,
      });
    },
    publishTyping(chatId: string, userId: string, isTyping: boolean) {
      socket.emit("chat.typing", {
        roomId: chatId,
        userId,
        isTyping,
      });
    },
    disconnect() {
      socket.removeAllListeners();
      socket.disconnect();
      callbacks.onConnectionStateChange?.("offline");
    },
  };
}
