import { describe, expect, it, vi } from "vitest";
import { ChatsController } from "../src/chats/chats.controller.js";

describe("ChatsController", () => {
  it("routes first-party createMessage through the send helper and re-reads the persisted message", async () => {
    const persistedMessage = {
      id: "msg-1",
      chatId: "chat-1",
      senderUserId: "user-1",
      body: "hello there",
      moderationState: "clean",
      replyToMessageId: null,
      createdAt: new Date("2026-04-14T12:00:00.000Z"),
      editedAt: null,
    };
    const chatsService = {
      sendFirstPartyChatMessageAction: vi.fn().mockResolvedValue({
        messageId: "msg-1",
        chatId: "chat-1",
      }),
      getPersistedMessage: vi.fn().mockResolvedValue(persistedMessage),
    };
    const controller = new ChatsController(chatsService as any);

    const result = await controller.createMessage(
      "44444444-4444-4444-8444-444444444444",
      {
        senderUserId: "11111111-1111-4111-8111-111111111111",
        body: "hello there",
        clientMessageId: "22222222-2222-4222-8222-222222222222",
        replyToMessageId: "33333333-3333-4333-8333-333333333333",
      },
      "11111111-1111-4111-8111-111111111111",
    );

    expect(chatsService.sendFirstPartyChatMessageAction).toHaveBeenCalledWith(
      "44444444-4444-4444-8444-444444444444",
      "11111111-1111-4111-8111-111111111111",
      "hello there",
      {
        idempotencyKey: "22222222-2222-4222-8222-222222222222",
        replyToMessageId: "33333333-3333-4333-8333-333333333333",
      },
    );
    expect(chatsService.getPersistedMessage).toHaveBeenCalledWith(
      "44444444-4444-4444-8444-444444444444",
      "msg-1",
      "11111111-1111-4111-8111-111111111111",
    );
    expect(result).toEqual({
      success: true,
      data: persistedMessage,
    });
  });
});
