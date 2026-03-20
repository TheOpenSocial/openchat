import { io, type Socket } from "socket.io-client";

import { API_BASE_URL, type ChatMessageRecord } from "./api";

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

interface RealtimeCallbacks {
  onConnectionStateChange?: (state: RealtimeConnectionState) => void;
  onConnectionRecovered?: (payload: RealtimeConnectionRecovered) => void;
  onChatMessageCreated?: (chatId: string, message: ChatMessageRecord) => void;
  onChatReplay?: (chatId: string, messages: ChatMessageRecord[]) => void;
  onTyping?: (payload: RealtimeTypingPayload) => void;
  onPresenceUpdated?: (payload: RealtimePresenceUpdated) => void;
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
  publishTyping: (chatId: string, userId: string, isTyping: boolean) => void;
  disconnect: () => void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
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
    .map((item) => {
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
      return {
        id,
        chatId: roomId,
        senderUserId,
        body,
        createdAt,
      } satisfies ChatMessageRecord;
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
