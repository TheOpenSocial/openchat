import { BadRequestException } from "@nestjs/common";
import { WsException } from "@nestjs/websockets";
import {
  createIntentBodySchema,
  realtimeClientEventPayloadSchemas,
  uuidSchema,
} from "@opensocial/types";
import { describe, expect, it, vi } from "vitest";
import { parseRequestPayload } from "../src/common/validation.js";
import { RealtimeGateway } from "../src/realtime/realtime.gateway.js";

describe("Request validation", () => {
  it("throws BadRequestException for invalid HTTP payloads", () => {
    expect(() =>
      parseRequestPayload(createIntentBodySchema, {
        userId: "not-a-uuid",
        rawText: "",
      }),
    ).toThrow(BadRequestException);
  });

  it("parses valid UUID request params", () => {
    const id = "11111111-1111-4111-8111-111111111111";
    expect(parseRequestPayload(uuidSchema, id)).toBe(id);
  });
});

describe("RealtimeGateway", () => {
  it("validates room join payloads", async () => {
    const gateway = new RealtimeGateway();
    const client = { join: vi.fn(), id: "client-1" } as any;
    const roomId = "22222222-2222-4222-8222-222222222222";

    const ack = await gateway.onJoinRoom({ roomId }, client);

    expect(ack).toEqual({ ok: true, roomId });
    expect(client.join).toHaveBeenCalledWith(roomId);
    await expect(
      gateway.onJoinRoom({ roomId: "invalid" }, client),
    ).rejects.toThrow(WsException);
  });

  it("emits typed typing events to the requested room", async () => {
    const gateway = new RealtimeGateway();
    const emit = vi.fn();
    const to = vi.fn().mockReturnValue({ emit });
    gateway.server = { to } as any;

    const payload = {
      roomId: "33333333-3333-4333-8333-333333333333",
      userId: "44444444-4444-4444-8444-444444444444",
      isTyping: true,
    };

    await gateway.onTyping(payload);

    expect(to).toHaveBeenCalledWith(payload.roomId);
    expect(emit).toHaveBeenCalledWith("chat.typing", payload);
  });

  it("emits read receipts after persisting them for authenticated participants", async () => {
    const userId = "44444444-4444-4444-8444-444444444444";
    const roomId = "33333333-3333-4333-8333-333333333333";
    const messageId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const chatsService = {
      assertChatParticipant: vi.fn().mockResolvedValue(undefined),
      markReadReceipt: vi.fn().mockResolvedValue({}),
    };
    const gateway = new RealtimeGateway(chatsService as any);
    const emit = vi.fn();
    const to = vi.fn().mockReturnValue({ emit });
    gateway.server = { to } as any;
    const client = {
      handshake: { auth: { userId }, headers: {} },
      disconnect: vi.fn(),
      join: vi.fn(),
      emit: vi.fn(),
      data: {},
    } as any;

    await gateway.handleConnection(client);
    await gateway.onReadReceipt(
      {
        chatId: roomId,
        messageId,
        userId,
      },
      client,
    );

    expect(chatsService.assertChatParticipant).toHaveBeenCalledWith(
      roomId,
      userId,
    );
    expect(chatsService.markReadReceipt).toHaveBeenCalledWith(
      roomId,
      messageId,
      userId,
    );
    expect(to).toHaveBeenCalledWith(roomId);
    expect(emit).toHaveBeenCalledWith("chat.receipt", {
      chatId: roomId,
      messageId,
      userId,
    });
  });

  it("rejects read receipts for mismatched socket identity", async () => {
    const gateway = new RealtimeGateway();
    const client = {
      handshake: {
        auth: { userId: "44444444-4444-4444-8444-444444444444" },
        headers: {},
      },
      disconnect: vi.fn(),
      join: vi.fn(),
      emit: vi.fn(),
      data: {},
    } as any;

    await gateway.handleConnection(client);
    await expect(
      gateway.onReadReceipt(
        {
          chatId: "33333333-3333-4333-8333-333333333333",
          messageId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          userId: "55555555-5555-4555-8555-555555555555",
        },
        client,
      ),
    ).rejects.toThrow(WsException);
  });

  it("emits presence change events for authenticated users", async () => {
    const userId = "44444444-4444-4444-8444-444444444444";
    const gateway = new RealtimeGateway();
    const globalEmit = vi.fn();
    const roomEmit = vi.fn();
    const to = vi.fn().mockReturnValue({ emit: roomEmit });
    gateway.server = { emit: globalEmit, to } as any;
    const client = {
      handshake: { auth: { userId }, headers: {} },
      disconnect: vi.fn(),
      join: vi.fn(),
      emit: vi.fn(),
      data: {},
    } as any;

    await gateway.handleConnection(client);
    await gateway.onPresenceUpdate(
      {
        userId,
        state: "away",
      },
      client,
    );

    expect(to).toHaveBeenCalledWith(`user:${userId}`);
    expect(roomEmit).toHaveBeenCalledWith("presence.updated", {
      userId,
      online: true,
      state: "away",
    });
    expect(globalEmit).toHaveBeenCalledWith("presence.changed", {
      userId,
      online: true,
      state: "away",
    });
  });

  it("rejects presence updates for mismatched socket identity", async () => {
    const gateway = new RealtimeGateway();
    const client = {
      handshake: {
        auth: { userId: "44444444-4444-4444-8444-444444444444" },
        headers: {},
      },
      disconnect: vi.fn(),
      join: vi.fn(),
      emit: vi.fn(),
      data: {},
    } as any;

    await gateway.handleConnection(client);
    await expect(
      gateway.onPresenceUpdate(
        {
          userId: "55555555-5555-4555-8555-555555555555",
          state: "away",
        },
        client,
      ),
    ).rejects.toThrow(WsException);
  });

  it("deduplicates chat.send events by client message id", async () => {
    const gateway = new RealtimeGateway();
    const emit = vi.fn();
    const to = vi.fn().mockReturnValue({ emit });
    gateway.server = { to } as any;

    const payload = {
      roomId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      senderUserId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      clientMessageId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      body: "hello",
    };

    const firstAck = await gateway.onChatSend(payload);
    const duplicateAck = await gateway.onChatSend(payload);

    expect(firstAck).toEqual(
      expect.objectContaining({
        ok: true,
        duplicate: false,
      }),
    );
    expect(duplicateAck).toEqual(
      expect.objectContaining({
        ok: true,
        duplicate: true,
      }),
    );
    expect(to).toHaveBeenCalledWith(payload.roomId);
    expect(emit).toHaveBeenCalledTimes(1);
  });

  it("handles concurrent chat.send events with monotonic room sequence", async () => {
    const gateway = new RealtimeGateway();
    const emit = vi.fn();
    const to = vi.fn().mockReturnValue({ emit });
    gateway.server = { to } as any;

    const roomId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const senderUserId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    const payloads = Array.from({ length: 50 }, (_, index) => ({
      roomId,
      senderUserId,
      clientMessageId: `cccccccc-cccc-4ccc-8ccc-${String(index).padStart(12, "0")}`,
      body: `msg-${index}`,
    }));

    const acks = await Promise.all(
      payloads.map((payload) => gateway.onChatSend(payload)),
    );

    const sequences = acks
      .map((ack) => ack.sequence)
      .slice()
      .sort((left, right) => left - right);
    expect(sequences).toEqual(
      Array.from({ length: payloads.length }, (_, index) => index + 1),
    );
    expect(acks.every((ack) => ack.duplicate === false)).toBe(true);
    expect(to).toHaveBeenCalledTimes(payloads.length);
    expect(emit).toHaveBeenCalledTimes(payloads.length);
  });

  it("disconnects clients with invalid handshake identity", async () => {
    const gateway = new RealtimeGateway();
    const client = {
      handshake: { auth: { userId: "bad-id" }, headers: {} },
      disconnect: vi.fn(),
      join: vi.fn(),
      emit: vi.fn(),
    } as any;

    await gateway.handleConnection(client);

    expect(client.disconnect).toHaveBeenCalledWith(true);
    expect(client.join).not.toHaveBeenCalled();
  });

  it("accepts valid handshake identity and emits presence", async () => {
    const gateway = new RealtimeGateway();
    const userId = "55555555-5555-4555-8555-555555555555";
    const client = {
      handshake: { auth: { userId }, headers: {} },
      disconnect: vi.fn(),
      join: vi.fn(),
      emit: vi.fn(),
    } as any;

    await gateway.handleConnection(client);

    expect(client.join).toHaveBeenCalledWith(`user:${userId}`);
    expect(client.emit).toHaveBeenCalledWith("presence.updated", {
      userId,
      online: true,
      state: "online",
    });
  });

  it("disables insecure userId fallback in production even when env override is set", async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    const previousAllowInsecure = process.env.REALTIME_ALLOW_INSECURE_USER_ID;
    process.env.NODE_ENV = "production";
    process.env.REALTIME_ALLOW_INSECURE_USER_ID = "true";

    try {
      const authService = {
        verifyAccessToken: vi.fn(),
      };
      const gateway = new RealtimeGateway(
        undefined,
        undefined,
        authService as any,
      );
      const userId = "55555555-5555-4555-8555-555555555555";
      const client = {
        handshake: { auth: { userId }, headers: {} },
        disconnect: vi.fn(),
        join: vi.fn(),
        emit: vi.fn(),
      } as any;

      await gateway.handleConnection(client);

      expect(authService.verifyAccessToken).not.toHaveBeenCalled();
      expect(client.disconnect).toHaveBeenCalledWith(true);
      expect(client.join).not.toHaveBeenCalled();
    } finally {
      process.env.NODE_ENV = previousNodeEnv;
      process.env.REALTIME_ALLOW_INSECURE_USER_ID = previousAllowInsecure;
    }
  });

  it("joins rooms and emits replay payload on explicit authenticate", async () => {
    const roomId = "66666666-6666-4666-8666-666666666666";
    const userId = "55555555-5555-4555-8555-555555555555";
    const chatsService = {
      listMessagesForSync: vi.fn().mockResolvedValue({
        messages: [
          {
            id: "77777777-7777-4777-8777-777777777777",
            senderUserId: userId,
            body: "replayed",
            createdAt: new Date("2026-03-19T10:00:00.000Z"),
          },
        ],
        unreadCount: 0,
        highWatermark: "2026-03-19T10:00:00.000Z",
        hasMore: false,
        deduped: false,
      }),
    };
    const gateway = new RealtimeGateway(chatsService as any);
    const client = {
      handshake: { auth: { userId }, headers: {} },
      disconnect: vi.fn(),
      join: vi.fn(),
      emit: vi.fn(),
    } as any;

    const ack = await gateway.onAuthenticate(
      {
        userId,
        rooms: [roomId],
        replaySince: "2026-03-19T09:00:00.000Z",
      },
      client,
    );

    expect(ack).toEqual(
      expect.objectContaining({
        ok: true,
        roomsJoined: [roomId],
      }),
    );
    expect(client.join).toHaveBeenCalledWith(roomId);
    expect(chatsService.listMessagesForSync).toHaveBeenCalledWith(
      roomId,
      userId,
      100,
      expect.any(String),
    );
    expect(client.emit).toHaveBeenCalledWith(
      "connection.recovered",
      expect.objectContaining({
        userId,
        roomsJoined: [roomId],
      }),
    );
    expect(client.emit).toHaveBeenCalledWith(
      "chat.replay",
      expect.objectContaining({
        roomId,
      }),
    );
  });

  it("enforces realtime kill switch from launch controls snapshot", async () => {
    const launchControlsService = {
      getSnapshot: vi.fn().mockResolvedValue({
        globalKillSwitch: false,
        enableRealtimeChat: false,
      }),
    };
    const gateway = new RealtimeGateway(
      undefined,
      launchControlsService as any,
    );
    const client = { join: vi.fn(), id: "client-1" } as any;
    const roomId = "22222222-2222-4222-8222-222222222222";

    await expect(gateway.onJoinRoom({ roomId }, client)).rejects.toThrow(
      WsException,
    );
    expect(launchControlsService.getSnapshot).toHaveBeenCalledTimes(1);
  });

  it("keeps websocket schemas centrally discoverable", () => {
    expect(
      realtimeClientEventPayloadSchemas["chat.typing"].safeParse({
        roomId: "33333333-3333-4333-8333-333333333333",
        userId: "44444444-4444-4444-8444-444444444444",
        isTyping: false,
      }).success,
    ).toBe(true);
  });
});
