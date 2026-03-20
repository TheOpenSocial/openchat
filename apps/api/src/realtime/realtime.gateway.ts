import {
  realtimeClientEventPayloadSchemas,
  realtimeConnectionAuthenticatePayloadSchema,
  realtimeServerEventPayloadSchemas,
  type RealtimeClientEventName,
  type RealtimeClientEventPayload,
  type RealtimeServerEventPayload,
  type RealtimeServerEventName,
  uuidSchema,
} from "@opensocial/types";
import { randomUUID } from "node:crypto";
import { Optional } from "@nestjs/common";
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  WsException,
} from "@nestjs/websockets";
import { Server, Socket } from "socket.io";
import { AuthService } from "../auth/auth.service.js";
import { ChatsService } from "../chats/chats.service.js";
import { extractBearerToken } from "../common/auth-context.js";
import {
  recordWebsocketConnectionClosed,
  recordWebsocketConnectionOpened,
  recordWebsocketError,
} from "../common/ops-metrics.js";
import { LaunchControlsService } from "../launch-controls/launch-controls.service.js";

const REALTIME_REPLAY_WINDOW_MS = 10 * 60 * 1000;
const SOCKET_USER_ID_DATA_KEY = "authUserId";

@WebSocketGateway({ namespace: "/realtime", cors: { origin: "*" } })
export class RealtimeGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  private readonly sentMessageCache = new Map<
    string,
    {
      payload: RealtimeServerEventPayload<"chat.message">;
      expiresAt: number;
    }
  >();
  private readonly roomSequences = new Map<string, number>();

  @WebSocketServer()
  server!: Server;

  constructor(
    @Optional() private readonly chatsService?: ChatsService,
    @Optional()
    private readonly launchControlsService?: LaunchControlsService,
    @Optional()
    private readonly authService?: AuthService,
  ) {}

  async handleConnection(client: Socket) {
    const handshakeAuthPayload = this.extractConnectionAuthPayload(client);
    const userId = await this.resolveSocketUserId(
      client,
      handshakeAuthPayload?.accessToken,
    );
    if (!userId) {
      recordWebsocketError("unauthorized_socket_user");
      client.disconnect(true);
      return;
    }
    if (handshakeAuthPayload && handshakeAuthPayload.userId !== userId) {
      recordWebsocketError("unauthorized_socket_user");
      client.disconnect(true);
      return;
    }
    try {
      await this.assertRealtimeChatEnabled();
    } catch {
      client.disconnect(true);
      return;
    }

    recordWebsocketConnectionOpened();
    client.join(`user:${userId}`);
    this.emitToClient(client, "presence.updated", {
      userId,
      online: true,
      state: "online",
    });

    if (handshakeAuthPayload && handshakeAuthPayload.userId === userId) {
      void this.performReconnect(client, handshakeAuthPayload, userId);
    }
  }

  handleDisconnect(client: Socket) {
    recordWebsocketConnectionClosed();
    const userId = this.readSocketUserId(client) ?? this.extractUserId(client);
    if (userId) {
      this.emitToRoom(`user:${userId}`, "presence.updated", {
        userId,
        online: false,
        state: "invisible",
      });
    }
  }

  @SubscribeMessage("room.join")
  async onJoinRoom(
    @MessageBody() body: unknown,
    @ConnectedSocket() client?: Socket,
  ) {
    await this.assertRealtimeChatEnabled();
    const payload = this.parseClientPayload("room.join", body);
    if (client?.handshake) {
      const userId = await this.requireSocketUserId(client);
      await this.assertRoomMembership(payload.roomId, userId);
    }
    if (client && typeof client.join === "function") {
      client.join(payload.roomId);
    }
    return { ok: true, roomId: payload.roomId };
  }

  @SubscribeMessage("connection.authenticate")
  async onAuthenticate(
    @MessageBody() body: unknown,
    @ConnectedSocket() client: Socket,
  ) {
    await this.assertRealtimeChatEnabled();
    const payload = this.parseClientPayload("connection.authenticate", body);
    const socketUserId = await this.resolveSocketUserId(
      client,
      payload.accessToken,
    );
    if (!socketUserId || socketUserId !== payload.userId) {
      recordWebsocketError("unauthorized_socket_user");
      throw new WsException({
        code: "unauthorized_socket_user",
      });
    }

    this.writeSocketUserId(client, socketUserId);
    const reconnect = await this.performReconnect(
      client,
      payload,
      socketUserId,
    );
    return {
      ok: true,
      roomsJoined: reconnect.roomsJoined,
      replaySince: reconnect.replaySince,
    };
  }

  @SubscribeMessage("chat.message.created")
  async onMessage(
    @MessageBody() body: unknown,
    @ConnectedSocket() client: Socket,
  ) {
    await this.assertRealtimeChatEnabled();
    const payload = this.parseClientPayload("chat.message.created", body);
    const roomId = payload.roomId;
    if (!roomId) {
      throw new WsException({
        code: "invalid_socket_payload",
        event: "chat.message.created",
      });
    }
    const userId = await this.requireSocketUserId(client);
    await this.assertRoomMembership(roomId, userId);
    const message = this.parsePersistedFanoutMessage(payload.payload, roomId);
    if (!message || message.senderUserId !== userId) {
      recordWebsocketError("unauthorized_socket_user");
      throw new WsException({
        code: "unauthorized_socket_user",
      });
    }
    await this.assertPersistedMessage(roomId, message.id, userId);
    this.emitToRoom(roomId, "chat.message.created", message);
    return { ok: true, clientId: client.id };
  }

  @SubscribeMessage("chat.send")
  async onChatSend(
    @MessageBody() body: unknown,
    @ConnectedSocket() client?: Socket,
  ) {
    await this.assertRealtimeChatEnabled();
    const payload = this.parseClientPayload("chat.send", body);
    if (client) {
      const socketUserId = await this.requireSocketUserId(client);
      if (socketUserId !== payload.senderUserId) {
        recordWebsocketError("unauthorized_socket_user");
        throw new WsException({
          code: "unauthorized_socket_user",
        });
      }
    }
    this.pruneSentMessageCache();

    const dedupeKey = [
      payload.roomId,
      payload.senderUserId,
      payload.clientMessageId,
    ].join(":");
    const cached = this.sentMessageCache.get(dedupeKey);
    if (cached && cached.expiresAt > Date.now()) {
      return {
        ok: true,
        duplicate: true,
        serverMessageId: cached.payload.serverMessageId,
        sequence: cached.payload.sequence,
      };
    }

    let serverPayload: RealtimeServerEventPayload<"chat.message">;
    if (this.chatsService) {
      try {
        const persisted = await this.chatsService.createMessage(
          payload.roomId,
          payload.senderUserId,
          payload.body,
          {
            idempotencyKey: payload.clientMessageId,
          },
        );
        serverPayload = {
          ...payload,
          serverMessageId: persisted.id,
          sequence: this.nextRoomSequence(payload.roomId),
          sentAt: persisted.createdAt.toISOString(),
        };
      } catch {
        recordWebsocketError("chat_send_rejected");
        throw new WsException({
          code: "chat_send_rejected",
        });
      }
    } else {
      serverPayload = {
        ...payload,
        serverMessageId: randomUUID(),
        sequence: this.nextRoomSequence(payload.roomId),
        sentAt: new Date().toISOString(),
      };
    }
    this.sentMessageCache.set(dedupeKey, {
      payload: serverPayload,
      expiresAt: Date.now() + REALTIME_REPLAY_WINDOW_MS,
    });

    this.emitToRoom(payload.roomId, "chat.message", serverPayload);
    return {
      ok: true,
      duplicate: false,
      serverMessageId: serverPayload.serverMessageId,
      sequence: serverPayload.sequence,
    };
  }

  @SubscribeMessage("chat.typing")
  async onTyping(
    @MessageBody() body: unknown,
    @ConnectedSocket() client?: Socket,
  ) {
    await this.assertRealtimeChatEnabled();
    const payload = this.parseClientPayload("chat.typing", body);
    if (client?.handshake) {
      const userId = await this.requireSocketUserId(client);
      if (payload.userId !== userId) {
        recordWebsocketError("unauthorized_socket_user");
        throw new WsException({
          code: "unauthorized_socket_user",
        });
      }
      await this.assertRoomMembership(payload.roomId, userId);
    }
    this.emitToRoom(payload.roomId, "chat.typing", payload);
    return { ok: true };
  }

  @SubscribeMessage("receipt.read")
  async onReadReceipt(
    @MessageBody() body: unknown,
    @ConnectedSocket() client?: Socket,
  ) {
    await this.assertRealtimeChatEnabled();
    const payload = this.parseClientPayload("receipt.read", body);
    if (client?.handshake) {
      const userId = await this.requireSocketUserId(client);
      if (payload.userId !== userId) {
        recordWebsocketError("unauthorized_socket_user");
        throw new WsException({
          code: "unauthorized_socket_user",
        });
      }
      await this.assertRoomMembership(payload.chatId, userId);
    }
    if (this.chatsService?.markReadReceipt) {
      await this.chatsService.markReadReceipt(
        payload.chatId,
        payload.messageId,
        payload.userId,
      );
    }
    this.emitToRoom(payload.chatId, "chat.receipt", payload);
    return { ok: true };
  }

  @SubscribeMessage("presence.update")
  async onPresenceUpdate(
    @MessageBody() body: unknown,
    @ConnectedSocket() client?: Socket,
  ) {
    await this.assertRealtimeChatEnabled();
    const payload = this.parseClientPayload("presence.update", body);
    if (client?.handshake) {
      const userId = await this.requireSocketUserId(client);
      if (payload.userId !== userId) {
        recordWebsocketError("unauthorized_socket_user");
        throw new WsException({
          code: "unauthorized_socket_user",
        });
      }
    }
    this.emitToRoom(`user:${payload.userId}`, "presence.updated", {
      userId: payload.userId,
      online: true,
      state: payload.state,
    });
    this.emitGlobal("presence.changed", {
      userId: payload.userId,
      online: true,
      state: payload.state,
    });
    return { ok: true };
  }

  private extractUserId(client: Socket): string | null {
    if (!client.handshake) {
      return null;
    }
    const authUserId = client.handshake.auth?.userId;
    const headerUserId = client.handshake.headers["x-user-id"];
    const value = (authUserId ?? headerUserId) as string | undefined;
    if (!value || typeof value !== "string") {
      return null;
    }
    const parsed = uuidSchema.safeParse(value);
    return parsed.success ? parsed.data : null;
  }

  private readSocketUserId(client: Socket) {
    const value =
      client.data && typeof client.data === "object"
        ? client.data[SOCKET_USER_ID_DATA_KEY]
        : null;
    return typeof value === "string" ? value : null;
  }

  private writeSocketUserId(client: Socket, userId: string) {
    if (!client.data || typeof client.data !== "object") {
      (client as unknown as { data: Record<string, unknown> }).data = {};
    }
    client.data[SOCKET_USER_ID_DATA_KEY] = userId;
  }

  private async resolveSocketUserId(client: Socket, accessToken?: string) {
    const cached = this.readSocketUserId(client);
    if (cached) {
      return cached;
    }
    const allowInsecureUserIdFallback = this.isInsecureUserIdFallbackEnabled();

    const handshakeHeaders = client.handshake?.headers;
    const token =
      accessToken ??
      extractBearerToken(
        (handshakeHeaders?.authorization ?? handshakeHeaders?.Authorization) as
          | string
          | string[]
          | undefined,
      );
    if (this.authService) {
      if (!token && !allowInsecureUserIdFallback) {
        return null;
      }
      if (token) {
        try {
          const principal = await this.authService.verifyAccessToken(token);
          this.writeSocketUserId(client, principal.userId);
          return principal.userId;
        } catch {
          return null;
        }
      }
      if (!allowInsecureUserIdFallback) {
        return null;
      }
    }

    if (
      !this.authService &&
      (process.env.NODE_ENV ?? "").trim().toLowerCase() === "production" &&
      !allowInsecureUserIdFallback
    ) {
      return null;
    }

    const fallback = this.extractUserId(client);
    if (fallback) {
      this.writeSocketUserId(client, fallback);
    }
    return fallback;
  }

  private async requireSocketUserId(client: Socket, accessToken?: string) {
    const userId = await this.resolveSocketUserId(client, accessToken);
    if (!userId) {
      recordWebsocketError("unauthorized_socket_user");
      throw new WsException({
        code: "unauthorized_socket_user",
      });
    }
    return userId;
  }

  private extractConnectionAuthPayload(
    client: Socket,
  ): RealtimeClientEventPayload<"connection.authenticate"> | null {
    if (!client.handshake) {
      return null;
    }
    const parsed = realtimeConnectionAuthenticatePayloadSchema.safeParse(
      client.handshake.auth ?? {},
    );
    if (!parsed.success) {
      return null;
    }
    return parsed.data;
  }

  private async assertRoomMembership(roomId: string, userId: string) {
    if (!this.chatsService?.assertChatParticipant) {
      return;
    }
    try {
      await this.chatsService.assertChatParticipant(roomId, userId);
    } catch {
      recordWebsocketError("unauthorized_socket_room");
      throw new WsException({
        code: "unauthorized_socket_room",
      });
    }
  }

  private parsePersistedFanoutMessage(
    payload: unknown,
    roomId: string,
  ): {
    id: string;
    chatId: string;
    senderUserId: string;
    body: string;
    createdAt: string;
  } | null {
    if (!payload || typeof payload !== "object") {
      return null;
    }
    const asRecord = payload as Record<string, unknown>;
    const id = typeof asRecord.id === "string" ? asRecord.id : null;
    const senderUserId =
      typeof asRecord.senderUserId === "string" ? asRecord.senderUserId : null;
    const body = typeof asRecord.body === "string" ? asRecord.body : null;
    const createdAt =
      typeof asRecord.createdAt === "string" ? asRecord.createdAt : null;
    if (!id || !senderUserId || !body || !createdAt) {
      return null;
    }
    return {
      id,
      chatId: roomId,
      senderUserId,
      body,
      createdAt,
    };
  }

  private async assertPersistedMessage(
    chatId: string,
    messageId: string,
    senderUserId: string,
  ) {
    if (!this.chatsService?.assertMessageExistsForSender) {
      return;
    }
    try {
      await this.chatsService.assertMessageExistsForSender(
        chatId,
        messageId,
        senderUserId,
      );
    } catch {
      recordWebsocketError("invalid_socket_payload");
      throw new WsException({
        code: "invalid_socket_payload",
        event: "chat.message.created",
      });
    }
  }

  private parseClientPayload<TEvent extends RealtimeClientEventName>(
    event: TEvent,
    payload: unknown,
  ): RealtimeClientEventPayload<TEvent> {
    const parsed = realtimeClientEventPayloadSchemas[event].safeParse(payload);
    if (!parsed.success) {
      recordWebsocketError("invalid_socket_payload");
      throw new WsException({
        code: "invalid_socket_payload",
        event,
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          code: issue.code,
          message: issue.message,
        })),
      });
    }
    return parsed.data as RealtimeClientEventPayload<TEvent>;
  }

  private parseServerPayload<TEvent extends RealtimeServerEventName>(
    event: TEvent,
    payload: unknown,
  ): RealtimeServerEventPayload<TEvent> {
    const parsed = realtimeServerEventPayloadSchemas[event].safeParse(payload);
    if (!parsed.success) {
      recordWebsocketError("invalid_socket_emit_payload");
      throw new WsException({
        code: "invalid_socket_emit_payload",
        event,
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          code: issue.code,
          message: issue.message,
        })),
      });
    }
    return parsed.data as RealtimeServerEventPayload<TEvent>;
  }

  private emitToClient<TEvent extends RealtimeServerEventName>(
    client: Socket,
    event: TEvent,
    payload: unknown,
  ) {
    const parsedPayload = this.parseServerPayload(event, payload);
    client.emit(event, parsedPayload);
  }

  private emitToRoom<TEvent extends RealtimeServerEventName>(
    room: string,
    event: TEvent,
    payload: unknown,
  ) {
    const parsedPayload = this.parseServerPayload(event, payload);
    this.server.to(room).emit(event, parsedPayload);
  }

  private emitGlobal<TEvent extends RealtimeServerEventName>(
    event: TEvent,
    payload: unknown,
  ) {
    const parsedPayload = this.parseServerPayload(event, payload);
    this.server.emit(event, parsedPayload);
  }

  publishRoomEvent<TEvent extends RealtimeServerEventName>(
    roomId: string,
    event: TEvent,
    payload: unknown,
  ) {
    this.emitToRoom(roomId, event, payload);
  }

  publishUserEvent<TEvent extends RealtimeServerEventName>(
    userId: string,
    event: TEvent,
    payload: unknown,
  ) {
    this.emitToRoom(`user:${userId}`, event, payload);
  }

  publishGlobalEvent<TEvent extends RealtimeServerEventName>(
    event: TEvent,
    payload: unknown,
  ) {
    this.emitGlobal(event, payload);
  }

  private async performReconnect(
    client: Socket,
    payload: RealtimeClientEventPayload<"connection.authenticate">,
    userId: string,
  ) {
    const roomsJoined: string[] = [];
    for (const roomId of payload.rooms ?? []) {
      try {
        await this.assertRoomMembership(roomId, userId);
        client.join(roomId);
        roomsJoined.push(roomId);
      } catch {
        // Keep reconnect resilient; unauthorized rooms are skipped.
      }
    }

    const replaySince = this.normalizeReplaySince(payload.replaySince);
    this.emitToClient(client, "connection.recovered", {
      userId,
      recoveredAt: new Date().toISOString(),
      roomsJoined,
      ...(replaySince ? { replaySince } : {}),
    });

    if (this.chatsService && replaySince && roomsJoined.length > 0) {
      for (const roomId of roomsJoined) {
        try {
          const sync = await this.chatsService.listMessagesForSync(
            roomId,
            userId,
            100,
            replaySince,
          );
          if (sync.messages.length === 0) {
            continue;
          }

          const replayPayload: RealtimeServerEventPayload<"chat.replay"> = {
            roomId,
            replaySince,
            messages: sync.messages.map((message) =>
              this.buildServerChatMessageFromPersisted(roomId, message),
            ),
          };
          this.emitToClient(client, "chat.replay", replayPayload);
        } catch {
          recordWebsocketError("chat_replay_failed");
          // Replay is best-effort; an invalid room or permission mismatch
          // should not disconnect a healthy socket session.
        }
      }
    }

    return { roomsJoined, replaySince };
  }

  private buildServerChatMessageFromPersisted(
    roomId: string,
    message: {
      id: string;
      senderUserId: string;
      body: string;
      createdAt: Date;
    },
  ): RealtimeServerEventPayload<"chat.message"> {
    return {
      roomId,
      senderUserId: message.senderUserId,
      clientMessageId: message.id,
      body: message.body,
      serverMessageId: message.id,
      sequence: this.nextRoomSequence(roomId),
      sentAt: message.createdAt.toISOString(),
    };
  }

  private nextRoomSequence(roomId: string) {
    const next = (this.roomSequences.get(roomId) ?? 0) + 1;
    this.roomSequences.set(roomId, next);
    return next;
  }

  private normalizeReplaySince(value?: string) {
    if (!value) {
      return undefined;
    }
    const parsedTime = new Date(value).getTime();
    if (!Number.isFinite(parsedTime)) {
      return undefined;
    }
    const floor = Date.now() - REALTIME_REPLAY_WINDOW_MS;
    return new Date(Math.max(parsedTime, floor)).toISOString();
  }

  private pruneSentMessageCache() {
    const now = Date.now();
    for (const [cacheKey, entry] of this.sentMessageCache.entries()) {
      if (entry.expiresAt <= now) {
        this.sentMessageCache.delete(cacheKey);
      }
    }
  }

  private async assertRealtimeChatEnabled() {
    const controls = this.launchControlsService
      ? await this.launchControlsService.getSnapshot()
      : null;
    const globalKillSwitch =
      controls?.globalKillSwitch ??
      this.readBooleanEnv("FEATURE_GLOBAL_KILL_SWITCH", false);
    const realtimeEnabled =
      controls?.enableRealtimeChat ??
      this.readBooleanEnv("FEATURE_ENABLE_REALTIME_CHAT", true);
    if (globalKillSwitch || !realtimeEnabled) {
      recordWebsocketError("realtime_chat_disabled");
      throw new WsException({
        code: "realtime_chat_disabled",
      });
    }
  }

  private readBooleanEnv(name: string, fallback: boolean) {
    const value = process.env[name];
    if (value === undefined) {
      return fallback;
    }
    const normalized = value.trim().toLowerCase();
    if (normalized === "true" || normalized === "1" || normalized === "yes") {
      return true;
    }
    if (normalized === "false" || normalized === "0" || normalized === "no") {
      return false;
    }
    return fallback;
  }

  private isInsecureUserIdFallbackEnabled() {
    const enabled = this.readBooleanEnv(
      "REALTIME_ALLOW_INSECURE_USER_ID",
      false,
    );
    if (!enabled) {
      return false;
    }
    const environment = (process.env.NODE_ENV ?? "").trim().toLowerCase();
    return environment !== "production";
  }
}
