import { describe, expect, it, vi } from "vitest";
import { ChatsService } from "../src/chats/chats.service.js";

describe("ChatsService", () => {
  it("creates sender receipt when creating message", async () => {
    const prisma: any = {
      chat: {
        findUnique: vi.fn().mockResolvedValue({ connectionId: "conn-1" }),
      },
      connectionParticipant: {
        findMany: vi
          .fn()
          .mockResolvedValue([{ userId: "user-1" }, { userId: "user-2" }]),
      },
      block: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      chatMessage: {
        create: vi.fn().mockResolvedValue({ id: "msg-1", chatId: "chat-1" }),
      },
      messageReceipt: {
        create: vi.fn().mockResolvedValue({}),
      },
    };

    const service = new ChatsService(prisma);
    await service.createMessage("chat-1", "user-1", "hello");

    expect(prisma.chatMessage.create).toHaveBeenCalledTimes(1);
    expect(prisma.messageReceipt.create).toHaveBeenCalledTimes(1);
  });

  it("marks read receipt by updating existing record", async () => {
    const prisma: any = {
      chatMessage: {
        findFirst: vi.fn().mockResolvedValue({ id: "msg-1", chatId: "chat-1" }),
      },
      messageReceipt: {
        findFirst: vi
          .fn()
          .mockResolvedValue({ id: "receipt-1", deliveredAt: new Date() }),
        update: vi.fn().mockResolvedValue({ id: "receipt-1" }),
        create: vi.fn(),
      },
    };

    const service = new ChatsService(prisma);
    await service.markReadReceipt("chat-1", "msg-1", "user-1");

    expect(prisma.messageReceipt.update).toHaveBeenCalledTimes(1);
    expect(prisma.messageReceipt.create).not.toHaveBeenCalled();
  });

  it("blocks message sending when sender is blocked by another participant", async () => {
    const prisma: any = {
      chat: {
        findUnique: vi.fn().mockResolvedValue({ connectionId: "conn-1" }),
      },
      connectionParticipant: {
        findMany: vi
          .fn()
          .mockResolvedValue([{ userId: "user-1" }, { userId: "user-2" }]),
      },
      block: {
        findMany: vi.fn().mockResolvedValue([{ id: "block-1" }]),
      },
      chatMessage: {
        create: vi.fn(),
      },
      messageReceipt: {
        create: vi.fn(),
      },
    };

    const service = new ChatsService(prisma);
    await expect(
      service.createMessage("chat-1", "user-1", "hello"),
    ).rejects.toThrow("blocked");
    expect(prisma.chatMessage.create).not.toHaveBeenCalled();
  });

  it("soft-deletes own message by masking body", async () => {
    const prisma: any = {
      chatMessage: {
        findFirst: vi.fn().mockResolvedValue({
          id: "msg-1",
          senderUserId: "user-1",
        }),
        update: vi.fn().mockResolvedValue({
          id: "msg-1",
          body: "[deleted]",
        }),
      },
    };

    const service = new ChatsService(prisma);
    const result = await service.softDeleteMessage("chat-1", "msg-1", "user-1");

    expect(result.body).toBe("[deleted]");
    expect(prisma.chatMessage.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          body: "[deleted]",
        }),
      }),
    );
  });

  it("archives group chats when participant leave drops below threshold", async () => {
    const prisma: any = {
      chat: {
        findUnique: vi.fn().mockResolvedValue({
          id: "chat-1",
          connectionId: "conn-1",
          connection: {
            type: "group",
            status: "active",
          },
        }),
      },
      connectionParticipant: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        count: vi.fn().mockResolvedValue(1),
      },
      connection: {
        update: vi.fn().mockResolvedValue({}),
      },
      chatMessage: {
        create: vi.fn().mockResolvedValue({ id: "msg-system" }),
      },
      auditLog: {
        create: vi.fn().mockResolvedValue({}),
      },
    };

    const service = new ChatsService(prisma);
    const result = await service.leaveChat("chat-1", "user-1");

    expect(result.status).toBe("archived");
    expect(prisma.connection.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "conn-1" },
        data: { status: "archived" },
      }),
    );
    expect(prisma.chatMessage.create).toHaveBeenCalledTimes(2);
    expect(prisma.auditLog.create).toHaveBeenCalledTimes(2);
  });

  it("hides moderated messages and writes an audit record", async () => {
    const prisma: any = {
      chatMessage: {
        findFirst: vi.fn().mockResolvedValue({ id: "msg-1", body: "toxic" }),
        update: vi.fn().mockResolvedValue({
          id: "msg-1",
          body: "[hidden by moderation]",
          moderationState: "blocked",
        }),
        create: vi.fn().mockResolvedValue({ id: "msg-system" }),
      },
      auditLog: {
        create: vi.fn().mockResolvedValue({}),
      },
    };

    const service = new ChatsService(prisma);
    const result = await service.hideMessageForModeration(
      "chat-1",
      "msg-1",
      "mod-1",
      "abusive",
    );

    expect(result.body).toBe("[hidden by moderation]");
    expect(prisma.chatMessage.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          body: "[hidden by moderation]",
          moderationState: "blocked",
        }),
      }),
    );
    expect(prisma.auditLog.create).toHaveBeenCalledTimes(1);
  });

  it("returns deduplicated reconnect sync payloads with unread counts", async () => {
    const baseTime = new Date("2026-03-19T12:00:00.000Z");
    const prisma: any = {
      chat: {
        findUnique: vi.fn().mockResolvedValue({ connectionId: "conn-1" }),
      },
      connectionParticipant: {
        findFirst: vi.fn().mockResolvedValue({ id: "participant-1" }),
        count: vi.fn().mockResolvedValue(2),
      },
      chatMessage: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            senderUserId: "user-2",
            body: "first",
            createdAt: new Date(baseTime.getTime() + 1_000),
          },
          {
            id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            senderUserId: "user-2",
            body: "first-duplicate",
            createdAt: new Date(baseTime.getTime() + 1_000),
          },
          {
            id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
            senderUserId: "user-2",
            body: "second",
            createdAt: new Date(baseTime.getTime() + 2_000),
          },
        ]),
        count: vi.fn().mockResolvedValue(1),
      },
      messageReceipt: {
        findMany: vi.fn().mockResolvedValue([
          {
            messageId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            deliveredAt: new Date(baseTime.getTime() + 1_100),
            readAt: null,
          },
        ]),
      },
    };

    const service = new ChatsService(prisma);
    const sync = await service.listMessagesForSync(
      "chat-1",
      "11111111-1111-4111-8111-111111111111",
      50,
      "2026-03-19T11:59:00.000Z",
    );

    expect(sync.messages).toHaveLength(2);
    expect(sync.deduped).toBe(true);
    expect(sync.messages[0].id).toBe("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    expect(sync.messages[1].id).toBe("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");
    expect(sync.unreadCount).toBe(1);
    expect(sync.messages[0].status.state).toBe("delivered");
  });

  it("blocks harmful messages before persistence", async () => {
    const prisma: any = {
      moderationFlag: {
        create: vi.fn().mockResolvedValue({}),
      },
      auditLog: {
        create: vi.fn().mockResolvedValue({}),
      },
      chat: {
        findUnique: vi.fn().mockResolvedValue({ connectionId: "conn-1" }),
      },
      connectionParticipant: {
        findMany: vi
          .fn()
          .mockResolvedValue([{ userId: "user-1" }, { userId: "user-2" }]),
      },
      block: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      chatMessage: {
        create: vi.fn(),
      },
      messageReceipt: {
        create: vi.fn(),
      },
    };

    const service = new ChatsService(prisma);
    await expect(
      service.createMessage("chat-1", "user-1", "I will kill you tonight"),
    ).rejects.toThrow("moderation");

    expect(prisma.chatMessage.create).not.toHaveBeenCalled();
    expect(prisma.moderationFlag.create).toHaveBeenCalledTimes(1);
  });

  it("auto-hides review-grade messages and writes moderation artifacts", async () => {
    const prisma: any = {
      moderationFlag: {
        create: vi.fn().mockResolvedValue({}),
      },
      auditLog: {
        create: vi.fn().mockResolvedValue({}),
      },
      chat: {
        findUnique: vi.fn().mockResolvedValue({ connectionId: "conn-1" }),
      },
      connectionParticipant: {
        findMany: vi
          .fn()
          .mockResolvedValue([{ userId: "user-1" }, { userId: "user-2" }]),
      },
      block: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      chatMessage: {
        create: vi
          .fn()
          .mockResolvedValueOnce({
            id: "msg-1",
            body: "[hidden by moderation]",
          })
          .mockResolvedValueOnce({
            id: "msg-system",
            body: "System: A message was hidden by moderation.",
          }),
      },
      messageReceipt: {
        create: vi.fn().mockResolvedValue({}),
      },
    };

    const service = new ChatsService(prisma);
    const message = (await service.createMessage(
      "chat-1",
      "user-1",
      "Looking for underage meetup",
    )) as { body: string };

    expect(message.body).toBe("[hidden by moderation]");
    expect(prisma.chatMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          moderationState: "review",
        }),
      }),
    );
    expect(prisma.moderationFlag.create).toHaveBeenCalledTimes(1);
  });

  it("blocks review-grade messages when moderation strictness flag is enabled", async () => {
    const prisma: any = {
      moderationFlag: {
        create: vi.fn().mockResolvedValue({}),
      },
      auditLog: {
        create: vi.fn().mockResolvedValue({}),
      },
      chat: {
        findUnique: vi.fn().mockResolvedValue({ connectionId: "conn-1" }),
      },
      connectionParticipant: {
        findMany: vi
          .fn()
          .mockResolvedValue([{ userId: "user-1" }, { userId: "user-2" }]),
      },
      block: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      chatMessage: {
        create: vi.fn(),
      },
      messageReceipt: {
        create: vi.fn(),
      },
    };
    const launchControlsService: any = {
      getSnapshot: vi.fn().mockResolvedValue({
        globalKillSwitch: false,
        enableModerationStrictness: true,
      }),
    };

    const service = new ChatsService(prisma, undefined, launchControlsService);
    await expect(
      service.createMessage("chat-1", "user-1", "Looking for underage meetup"),
    ).rejects.toThrow("moderation");

    expect(prisma.chatMessage.create).not.toHaveBeenCalled();
    expect(prisma.moderationFlag.create).toHaveBeenCalledTimes(1);
  });
});
