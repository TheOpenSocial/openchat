import {
  realtimeClientEventPayloadSchemas,
  realtimeServerEventPayloadSchemas,
  type RealtimeClientEventName,
  type RealtimeClientEventPayload,
  type RealtimeServerEventName,
  type RealtimeServerEventPayload,
  uuidSchema,
} from "@opensocial/types";
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

@WebSocketGateway({ namespace: "/realtime", cors: { origin: "*" } })
export class RealtimeGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  handleConnection(client: Socket) {
    const userId = this.extractUserId(client);
    if (!userId) {
      client.disconnect(true);
      return;
    }

    client.join(`user:${userId}`);
    this.emitToClient(client, "presence.updated", {
      userId,
      online: true,
      state: "online",
    });
  }

  handleDisconnect(client: Socket) {
    const userId = this.extractUserId(client);
    if (userId) {
      this.emitToRoom(`user:${userId}`, "presence.updated", {
        userId,
        online: false,
        state: "invisible",
      });
    }
  }

  @SubscribeMessage("room.join")
  onJoinRoom(@MessageBody() body: unknown, @ConnectedSocket() client: Socket) {
    const payload = this.parseClientPayload("room.join", body);
    client.join(payload.roomId);
    return { ok: true, roomId: payload.roomId };
  }

  @SubscribeMessage("chat.message.created")
  onMessage(@MessageBody() body: unknown, @ConnectedSocket() client: Socket) {
    const payload = this.parseClientPayload("chat.message.created", body);
    if (payload.roomId) {
      this.emitToRoom(payload.roomId, "chat.message.created", payload.payload);
    } else {
      this.emitGlobal("chat.message.created", payload.payload);
    }
    return { ok: true, clientId: client.id };
  }

  @SubscribeMessage("chat.typing")
  onTyping(@MessageBody() body: unknown) {
    const payload = this.parseClientPayload("chat.typing", body);
    this.emitToRoom(payload.roomId, "chat.typing", payload);
    return { ok: true };
  }

  private extractUserId(client: Socket): string | null {
    const authUserId = client.handshake.auth?.userId;
    const headerUserId = client.handshake.headers["x-user-id"];
    const value = (authUserId ?? headerUserId) as string | undefined;
    if (!value || typeof value !== "string") {
      return null;
    }
    const parsed = uuidSchema.safeParse(value);
    return parsed.success ? parsed.data : null;
  }

  private parseClientPayload<TEvent extends RealtimeClientEventName>(
    event: TEvent,
    payload: unknown,
  ): RealtimeClientEventPayload<TEvent> {
    const parsed = realtimeClientEventPayloadSchemas[event].safeParse(payload);
    if (!parsed.success) {
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
    return parsed.data;
  }

  private parseServerPayload<TEvent extends RealtimeServerEventName>(
    event: TEvent,
    payload: unknown,
  ): RealtimeServerEventPayload<TEvent> {
    const parsed = realtimeServerEventPayloadSchemas[event].safeParse(payload);
    if (!parsed.success) {
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
}
