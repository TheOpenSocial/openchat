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
  it("validates room join payloads", () => {
    const gateway = new RealtimeGateway();
    const client = { join: vi.fn(), id: "client-1" } as any;
    const roomId = "22222222-2222-4222-8222-222222222222";

    const ack = gateway.onJoinRoom({ roomId }, client);

    expect(ack).toEqual({ ok: true, roomId });
    expect(client.join).toHaveBeenCalledWith(roomId);
    expect(() => gateway.onJoinRoom({ roomId: "invalid" }, client)).toThrow(
      WsException,
    );
  });

  it("emits typed typing events to the requested room", () => {
    const gateway = new RealtimeGateway();
    const emit = vi.fn();
    const to = vi.fn().mockReturnValue({ emit });
    gateway.server = { to } as any;

    const payload = {
      roomId: "33333333-3333-4333-8333-333333333333",
      userId: "44444444-4444-4444-8444-444444444444",
      isTyping: true,
    };

    gateway.onTyping(payload);

    expect(to).toHaveBeenCalledWith(payload.roomId);
    expect(emit).toHaveBeenCalledWith("chat.typing", payload);
  });

  it("disconnects clients with invalid handshake identity", () => {
    const gateway = new RealtimeGateway();
    const client = {
      handshake: { auth: { userId: "bad-id" }, headers: {} },
      disconnect: vi.fn(),
      join: vi.fn(),
      emit: vi.fn(),
    } as any;

    gateway.handleConnection(client);

    expect(client.disconnect).toHaveBeenCalledWith(true);
    expect(client.join).not.toHaveBeenCalled();
  });

  it("accepts valid handshake identity and emits presence", () => {
    const gateway = new RealtimeGateway();
    const userId = "55555555-5555-4555-8555-555555555555";
    const client = {
      handshake: { auth: { userId }, headers: {} },
      disconnect: vi.fn(),
      join: vi.fn(),
      emit: vi.fn(),
    } as any;

    gateway.handleConnection(client);

    expect(client.join).toHaveBeenCalledWith(`user:${userId}`);
    expect(client.emit).toHaveBeenCalledWith("presence.updated", {
      userId,
      online: true,
      state: "online",
    });
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
