import { describe, expect, it, vi } from "vitest";
import { ChatsService } from "../src/chats/chats.service.js";
import { PresenceService } from "../src/realtime/presence.service.js";

describe("ChatsService", () => {
  it("ingests dm messages into governed memory with explicit preference detection", async () => {
    const personalizationService = {
      storeInteractionSummary: vi.fn().mockResolvedValue({
        stored: true,
        documentId: "doc-1",
      }),
    };
    const prisma: any = {
      chat: {
        findUnique: vi.fn().mockResolvedValue({
          id: "chat-1",
          type: "dm",
          connectionId: "conn-1",
        }),
      },
      connectionParticipant: {
        findMany: vi
          .fn()
          .mockResolvedValue([{ userId: "user-1" }, { userId: "user-2" }]),
      },
      block: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      userPreference: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      userReport: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      chatMessage: {
        create: vi.fn().mockResolvedValue({ id: "msg-1", chatId: "chat-1" }),
      },
      messageReceipt: {
        create: vi.fn().mockResolvedValue({}),
      },
    };

    const service = new ChatsService(
      prisma,
      undefined,
      undefined,
      undefined,
      undefined,
      personalizationService as any,
    );
    await service.createMessage("chat-1", "user-1", "I like apex a lot");

    expect(
      personalizationService.storeInteractionSummary,
    ).toHaveBeenCalledTimes(2);
    expect(
      personalizationService.storeInteractionSummary,
    ).toHaveBeenNthCalledWith(
      1,
      "user-1",
      expect.objectContaining({
        memory: expect.objectContaining({
          class: "interaction_summary",
          governanceTier: "inferable",
        }),
      }),
    );
    expect(
      personalizationService.storeInteractionSummary,
    ).toHaveBeenNthCalledWith(
      2,
      "user-1",
      expect.objectContaining({
        memory: expect.objectContaining({
          class: "stable_preference",
          governanceTier: "explicit_only",
          key: "conversation.preference.likes",
        }),
      }),
    );
  });

  it("extracts multiple explicit structured memories from one dm message", async () => {
    const personalizationService = {
      storeInteractionSummary: vi.fn().mockResolvedValue({
        stored: true,
        documentId: "doc-1",
      }),
    };
    const prisma: any = {
      chat: {
        findUnique: vi.fn().mockResolvedValue({
          id: "chat-1",
          type: "dm",
          connectionId: "conn-1",
        }),
      },
      connectionParticipant: {
        findMany: vi
          .fn()
          .mockResolvedValue([{ userId: "user-1" }, { userId: "user-2" }]),
      },
      block: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      userPreference: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      userReport: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      chatMessage: {
        create: vi.fn().mockResolvedValue({ id: "msg-1", chatId: "chat-1" }),
      },
      messageReceipt: {
        create: vi.fn().mockResolvedValue({}),
      },
    };

    const service = new ChatsService(
      prisma,
      undefined,
      undefined,
      undefined,
      undefined,
      personalizationService as any,
    );
    await service.createMessage(
      "chat-1",
      "user-1",
      "I like apex, I live in Buenos Aires, and I speak English and Spanish",
    );

    expect(
      personalizationService.storeInteractionSummary,
    ).toHaveBeenCalledTimes(4);
    const payloads =
      personalizationService.storeInteractionSummary.mock.calls.map(
        (call: any[]) => call[1],
      );
    expect(
      payloads.some(
        (payload: any) =>
          payload.memory?.key === "conversation.preference.likes" &&
          payload.memory?.class === "stable_preference",
      ),
    ).toBe(true);
    expect(
      payloads.some(
        (payload: any) =>
          payload.memory?.key === "profile.location" &&
          payload.memory?.class === "profile_memory",
      ),
    ).toBe(true);
    expect(
      payloads.some(
        (payload: any) =>
          payload.memory?.key === "profile.languages" &&
          payload.memory?.class === "profile_memory",
      ),
    ).toBe(true);
  });

  it("deduplicates repeated preference mentions and strips filler words", async () => {
    const personalizationService = {
      storeInteractionSummary: vi.fn().mockResolvedValue({
        stored: true,
        documentId: "doc-1",
      }),
    };
    const prisma: any = {
      chat: {
        findUnique: vi.fn().mockResolvedValue({
          id: "chat-1",
          type: "dm",
          connectionId: "conn-1",
        }),
      },
      connectionParticipant: {
        findMany: vi
          .fn()
          .mockResolvedValue([{ userId: "user-1" }, { userId: "user-2" }]),
      },
      block: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      userPreference: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      userReport: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      chatMessage: {
        create: vi.fn().mockResolvedValue({ id: "msg-1", chatId: "chat-1" }),
      },
      messageReceipt: {
        create: vi.fn().mockResolvedValue({}),
      },
    };

    const service = new ChatsService(
      prisma,
      undefined,
      undefined,
      undefined,
      undefined,
      personalizationService as any,
    );
    await service.createMessage(
      "chat-1",
      "user-1",
      "I like Apex a lot, I like apex, and I live in Buenos Aires",
    );

    const payloads =
      personalizationService.storeInteractionSummary.mock.calls.map(
        (call: any[]) => call[1],
      );

    expect(payloads).toHaveLength(3);
    const preferenceWrites = payloads.filter(
      (payload: any) => payload.memory?.key === "conversation.preference.likes",
    );
    expect(preferenceWrites).toHaveLength(1);
    expect(preferenceWrites[0].memory?.value.toLowerCase()).toBe("apex");
    expect(
      payloads.some(
        (payload: any) =>
          payload.memory?.key === "profile.location" &&
          payload.memory?.value === "Buenos Aires",
      ),
    ).toBe(true);
  });

  it("drops generic preference noise while keeping real structured memories", async () => {
    const personalizationService = {
      storeInteractionSummary: vi.fn().mockResolvedValue({
        stored: true,
        documentId: "doc-1",
      }),
    };
    const prisma: any = {
      chat: {
        findUnique: vi.fn().mockResolvedValue({
          id: "chat-1",
          type: "dm",
          connectionId: "conn-1",
        }),
      },
      connectionParticipant: {
        findMany: vi
          .fn()
          .mockResolvedValue([{ userId: "user-1" }, { userId: "user-2" }]),
      },
      block: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      userPreference: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      userReport: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      chatMessage: {
        create: vi.fn().mockResolvedValue({ id: "msg-1", chatId: "chat-1" }),
      },
      messageReceipt: {
        create: vi.fn().mockResolvedValue({}),
      },
    };

    const service = new ChatsService(
      prisma,
      undefined,
      undefined,
      undefined,
      undefined,
      personalizationService as any,
    );
    await service.createMessage(
      "chat-1",
      "user-1",
      "I like stuff, I live in Buenos Aires, and I speak English and Spanish",
    );

    const payloads =
      personalizationService.storeInteractionSummary.mock.calls.map(
        (call: any[]) => call[1],
      );

    expect(payloads).toHaveLength(3);
    expect(
      payloads.some(
        (payload: any) =>
          payload.memory?.key === "conversation.preference.likes",
      ),
    ).toBe(false);
    expect(
      payloads.some(
        (payload: any) =>
          payload.memory?.key === "profile.location" &&
          payload.memory?.value === "Buenos Aires",
      ),
    ).toBe(true);
    expect(
      payloads.some(
        (payload: any) =>
          payload.memory?.key === "profile.languages" &&
          payload.memory?.value === "English, Spanish",
      ),
    ).toBe(true);
  });

  it("extracts relationship, commerce, and safety memories with domain-sensitive governance", async () => {
    const personalizationService = {
      storeInteractionSummary: vi.fn().mockResolvedValue({
        stored: true,
        documentId: "doc-1",
      }),
    };
    const prisma: any = {
      chat: {
        findUnique: vi.fn().mockResolvedValue({
          id: "chat-1",
          type: "dm",
          connectionId: "conn-1",
        }),
      },
      connectionParticipant: {
        findMany: vi
          .fn()
          .mockResolvedValue([{ userId: "user-1" }, { userId: "user-2" }]),
      },
      block: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      userPreference: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      userReport: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      chatMessage: {
        create: vi.fn().mockResolvedValue({ id: "msg-1", chatId: "chat-1" }),
      },
      messageReceipt: {
        create: vi.fn().mockResolvedValue({}),
      },
    };

    const service = new ChatsService(
      prisma,
      undefined,
      undefined,
      undefined,
      undefined,
      personalizationService as any,
    );
    await service.createMessage(
      "chat-1",
      "user-1",
      "I know Bruno from work, my budget is 400 usd, and please avoid late-night one-on-one meetups",
    );

    const payloads =
      personalizationService.storeInteractionSummary.mock.calls.map(
        (call: any[]) => call[1],
      );

    expect(payloads).toHaveLength(4);
    expect(
      payloads.some(
        (payload: any) =>
          payload.memory?.class === "relationship_history" &&
          payload.memory?.governanceTier === "inferable" &&
          payload.memory?.key === "relationship.prior_context",
      ),
    ).toBe(true);
    expect(
      payloads.some(
        (payload: any) =>
          payload.memory?.class === "commerce_memory" &&
          payload.memory?.governanceTier === "inferable" &&
          payload.memory?.key === "commerce.budget",
      ),
    ).toBe(true);
    expect(
      payloads.some(
        (payload: any) =>
          payload.memory?.class === "safety_memory" &&
          payload.memory?.governanceTier === "explicit_only" &&
          payload.memory?.key === "safety.boundary" &&
          payload.memory?.contradictionPolicy === "suppress_conflict",
      ),
    ).toBe(true);
  });

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

  it("stores reply linkage when creating a reply message", async () => {
    const prisma: any = {
      chat: {
        findUnique: vi.fn().mockResolvedValue({ connectionId: "conn-1" }),
      },
      connectionParticipant: {
        findFirst: vi.fn().mockResolvedValue({ id: "participant-1" }),
        findMany: vi
          .fn()
          .mockResolvedValue([{ userId: "user-1" }, { userId: "user-2" }]),
      },
      block: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      userPreference: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      userReport: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      chatMessage: {
        findFirst: vi.fn().mockResolvedValue({ id: "msg-parent" }),
        create: vi.fn().mockResolvedValue({
          id: "msg-child",
          chatId: "chat-1",
          replyToMessageId: "msg-parent",
          createdAt: new Date(),
        }),
      },
      messageReceipt: {
        create: vi.fn().mockResolvedValue({}),
        createMany: vi.fn().mockResolvedValue({ count: 1 }),
        findMany: vi.fn().mockResolvedValue([]),
      },
    };

    const service = new ChatsService(prisma);
    const result = await service.createMessage(
      "chat-1",
      "user-1",
      "Thanks for the update",
      {
        replyToMessageId: "msg-parent",
      },
    );

    expect(prisma.chatMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          replyToMessageId: "msg-parent",
        }),
      }),
    );
    expect(result.replyToMessageId).toBe("msg-parent");
  });

  it("derives thread summaries from reply chains", async () => {
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
            id: "msg-root",
            chatId: "chat-1",
            senderUserId: "user-1",
            body: "root",
            moderationState: "clean",
            replyToMessageId: null,
            createdAt: new Date("2026-04-05T21:00:00.000Z"),
            editedAt: null,
          },
          {
            id: "msg-reply-1",
            chatId: "chat-1",
            senderUserId: "user-2",
            body: "reply 1",
            moderationState: "clean",
            replyToMessageId: "msg-root",
            createdAt: new Date("2026-04-05T21:01:00.000Z"),
            editedAt: null,
          },
          {
            id: "msg-reply-2",
            chatId: "chat-1",
            senderUserId: "user-1",
            body: "reply 2",
            moderationState: "clean",
            replyToMessageId: "msg-reply-1",
            createdAt: new Date("2026-04-05T21:02:00.000Z"),
            editedAt: null,
          },
        ]),
      },
      messageReceipt: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      chatMessageReaction: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    };

    const service = new ChatsService(prisma);
    const result = await service.listThreads("chat-1", "user-1");

    expect(result.chatId).toBe("chat-1");
    expect(result.threads).toHaveLength(1);
    expect(result.threads[0]).toEqual(
      expect.objectContaining({
        rootMessage: expect.objectContaining({
          id: "msg-root",
        }),
        replyCount: 2,
        messageCount: 3,
        participantCount: 2,
        lastReplyAt: "2026-04-05T21:02:00.000Z",
        lastActivityAt: "2026-04-05T21:02:00.000Z",
      }),
    );
  });

  it("returns thread detail for a reply by resolving the root message", async () => {
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
            id: "msg-root",
            chatId: "chat-1",
            senderUserId: "user-1",
            body: "root",
            moderationState: "clean",
            replyToMessageId: null,
            createdAt: new Date("2026-04-05T21:00:00.000Z"),
            editedAt: null,
          },
          {
            id: "msg-reply-1",
            chatId: "chat-1",
            senderUserId: "user-2",
            body: "reply 1",
            moderationState: "clean",
            replyToMessageId: "msg-root",
            createdAt: new Date("2026-04-05T21:01:00.000Z"),
            editedAt: null,
          },
          {
            id: "msg-reply-2",
            chatId: "chat-1",
            senderUserId: "user-1",
            body: "reply 2",
            moderationState: "clean",
            replyToMessageId: "msg-reply-1",
            createdAt: new Date("2026-04-05T21:02:00.000Z"),
            editedAt: null,
          },
        ]),
      },
      messageReceipt: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      chatMessageReaction: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    };

    const service = new ChatsService(prisma);
    const result = await service.getThread("chat-1", "msg-reply-2", "user-1");

    expect(result.thread.rootMessage.id).toBe("msg-root");
    expect(result.thread.replyCount).toBe(2);
    expect(result.entries.map((entry) => entry.message.id)).toEqual([
      "msg-root",
      "msg-reply-1",
      "msg-reply-2",
    ]);
  });

  it("includes lightweight participant presence metadata on chat metadata", async () => {
    const prisma: any = {
      chat: {
        findUnique: vi.fn().mockResolvedValue({
          id: "chat-1",
          type: "dm",
          connectionId: "conn-1",
          createdAt: new Date("2026-04-05T21:00:00.000Z"),
          connection: {
            id: "conn-1",
            type: "dm",
            status: "active",
            createdByUserId: "user-1",
            participants: [
              {
                userId: "user-1",
                role: "member",
                joinedAt: new Date("2026-04-05T20:00:00.000Z"),
              },
              {
                userId: "user-2",
                role: "member",
                joinedAt: new Date("2026-04-05T20:01:00.000Z"),
              },
            ],
          },
        }),
      },
      connectionParticipant: {
        findFirst: vi.fn().mockResolvedValue({ id: "participant-1" }),
      },
    };
    const presenceService = new PresenceService();
    presenceService.markOnline("user-2", "away");
    presenceService.markOffline("user-2");

    const service = new ChatsService(
      prisma,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      presenceService,
    );

    const metadata = await service.getChatMetadata("chat-1", "user-1");

    expect(metadata.participants).toHaveLength(2);
    expect(metadata.participants[1]).toEqual(
      expect.objectContaining({
        userId: "user-2",
        role: "member",
        presence: expect.objectContaining({
          online: false,
          state: "invisible",
          lastSeenAt: expect.any(String),
        }),
      }),
    );
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

  it("suppresses message sending when another participant muted the sender", async () => {
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
      userPreference: {
        findMany: vi.fn().mockResolvedValue([
          {
            userId: "user-2",
            value: ["user-1"],
          },
        ]),
      },
      userReport: {
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
      service.createMessage("chat-1", "user-1", "hello"),
    ).rejects.toThrow("suppressed");
    expect(prisma.chatMessage.create).not.toHaveBeenCalled();
  });

  it("suppresses message sending when there is an open report between participants", async () => {
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
      userPreference: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      userReport: {
        findMany: vi.fn().mockResolvedValue([{ id: "report-1" }]),
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
    ).rejects.toThrow("suppressed");
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

  it("edits an owned message, records edit metadata, and emits a realtime update", async () => {
    const realtimeEventsService = {
      emitChatMessageUpdated: vi.fn(),
    };
    const prisma: any = {
      chat: {
        findUnique: vi.fn().mockResolvedValue({
          id: "chat-1",
          connectionId: "conn-1",
        }),
      },
      connectionParticipant: {
        findFirst: vi.fn().mockResolvedValue({ id: "participant-1" }),
        count: vi.fn().mockResolvedValue(2),
      },
      chatMessage: {
        findFirst: vi.fn().mockResolvedValue({
          id: "msg-1",
          senderUserId: "user-1",
          body: "hello there",
        }),
        update: vi.fn().mockResolvedValue({
          id: "msg-1",
          chatId: "chat-1",
          senderUserId: "user-1",
          body: "hello edited",
          moderationState: "clean",
          replyToMessageId: null,
          createdAt: new Date("2026-04-05T21:00:00.000Z"),
          editedAt: new Date("2026-04-05T21:05:00.000Z"),
        }),
      },
      messageReceipt: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      chatMessageReaction: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    };

    const service = new ChatsService(
      prisma,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      realtimeEventsService as any,
    );

    const result = await service.editMessage(
      "chat-1",
      "msg-1",
      "user-1",
      "hello edited",
    );

    expect(prisma.chatMessage.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "msg-1" },
        data: expect.objectContaining({
          body: "hello edited",
          moderationState: "clean",
          editedAt: expect.any(Date),
        }),
      }),
    );
    expect(result.body).toBe("hello edited");
    expect(result.editedAt).toBeInstanceOf(Date);
    expect(realtimeEventsService.emitChatMessageUpdated).toHaveBeenCalledWith(
      "chat-1",
      expect.objectContaining({
        roomId: "chat-1",
        message: expect.objectContaining({
          id: "msg-1",
          body: "hello edited",
          editedAt: "2026-04-05T21:05:00.000Z",
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
      chatMessageReaction: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "reaction-1",
            messageId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            userId: "user-3",
            emoji: "👍",
            createdAt: new Date(baseTime.getTime() + 1_500),
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
    expect(sync.messages[0].reactions).toEqual([
      expect.objectContaining({
        id: "reaction-1",
        emoji: "👍",
      }),
    ]);
  });

  it("creates and lists message reactions", async () => {
    const prisma: any = {
      chat: {
        findUnique: vi.fn().mockResolvedValue({ connectionId: "conn-1" }),
      },
      connectionParticipant: {
        findFirst: vi.fn().mockResolvedValue({ id: "participant-1" }),
      },
      chatMessage: {
        findFirst: vi.fn().mockResolvedValue({ id: "msg-1" }),
      },
      chatMessageReaction: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({
          id: "reaction-1",
          messageId: "msg-1",
          userId: "user-1",
          emoji: "👍",
          createdAt: new Date(),
        }),
        findMany: vi.fn().mockResolvedValue([
          {
            id: "reaction-1",
            messageId: "msg-1",
            userId: "user-1",
            emoji: "👍",
            createdAt: new Date(),
          },
        ]),
      },
    };

    const service = new ChatsService(prisma);
    const created = await service.createMessageReaction(
      "chat-1",
      "msg-1",
      "user-1",
      " 👍 ",
    );
    const listed = await service.listMessageReactions(
      "chat-1",
      "msg-1",
      "user-1",
    );

    expect(prisma.chatMessageReaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          emoji: "👍",
        }),
      }),
    );
    expect(created.emoji).toBe("👍");
    expect(listed.reactions).toHaveLength(1);
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

  it("queues strict-mode messages for shadow moderation when strictness is enabled", async () => {
    const prisma: any = {
      chat: {
        findUnique: vi.fn().mockResolvedValue({ connectionId: "conn-1" }),
      },
      connectionParticipant: {
        findFirst: vi.fn().mockResolvedValue({ id: "participant-1" }),
        findMany: vi
          .fn()
          .mockResolvedValue([{ userId: "user-1" }, { userId: "user-2" }]),
      },
      block: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      userPreference: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      userReport: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      chatMessage: {
        create: vi.fn().mockResolvedValue({ id: "msg-1", body: "hello" }),
      },
      messageReceipt: {
        create: vi.fn().mockResolvedValue({}),
      },
    };
    const queue: any = {
      add: vi.fn().mockResolvedValue({ id: "job-1" }),
    };
    const launchControlsService: any = {
      getSnapshot: vi.fn().mockResolvedValue({
        globalKillSwitch: false,
        enableModerationStrictness: true,
        enableModerationMessages: true,
      }),
    };

    const service = new ChatsService(
      prisma,
      queue,
      undefined,
      launchControlsService,
    );
    await service.createMessage("chat-1", "user-1", "hello");
    expect(queue.add).toHaveBeenCalledWith(
      "ChatMessageModerationRequested",
      expect.objectContaining({
        type: "ChatMessageModerationRequested",
        payload: expect.objectContaining({
          messageId: "msg-1",
          chatId: "chat-1",
          senderUserId: "user-1",
        }),
      }),
      expect.any(Object),
    );
    expect(prisma.chatMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          moderationState: "review",
        }),
      }),
    );
  });

  it("delivers queued message to recipients after moderation allow", async () => {
    const prisma: any = {
      chatMessage: {
        update: vi.fn().mockResolvedValue({
          id: "msg-1",
          moderationState: "clean",
        }),
      },
      chat: {
        findUnique: vi.fn().mockResolvedValue({ connectionId: "conn-1" }),
      },
      connectionParticipant: {
        findMany: vi
          .fn()
          .mockResolvedValue([{ userId: "user-1" }, { userId: "user-2" }]),
      },
      messageReceipt: {
        createMany: vi.fn().mockResolvedValue({ count: 1 }),
        findMany: vi.fn().mockResolvedValue([]),
      },
    };
    const moderationService: any = {
      submitForModeration: vi.fn().mockResolvedValue({
        id: "decision-1",
        idempotencyKey: "chat_message:msg-1",
        contentRef: "msg-1",
        contentType: "chat_message",
        actorUserId: "user-1",
        surface: "chat_message",
        riskLevel: "allow",
      }),
    };

    const service = new ChatsService(
      prisma,
      undefined,
      undefined,
      undefined,
      moderationService,
    );
    await service.processQueuedMessageModeration(
      "msg-1",
      "chat-1",
      "user-1",
      "hello",
    );

    expect(prisma.chatMessage.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "msg-1" },
        data: expect.objectContaining({
          moderationState: "clean",
        }),
      }),
    );
    expect(prisma.messageReceipt.createMany).toHaveBeenCalledTimes(1);
  });

  it("blocks messages when OpenAI moderation assist returns blocked", async () => {
    vi.stubEnv("OPENAI_MODERATION_ENABLED", "true");
    vi.stubEnv("OPENAI_API_KEY", "test-openai-key");
    try {
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
      vi.spyOn(
        (service as any).openAIClient,
        "assistModeration",
      ).mockResolvedValue({
        decision: "blocked",
        reason: "threat content",
      });

      await expect(
        service.createMessage("chat-1", "user-1", "hello there"),
      ).rejects.toThrow("moderation");

      expect(prisma.chatMessage.create).not.toHaveBeenCalled();
      expect(prisma.moderationFlag.create).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("hides messages when OpenAI moderation assist returns review", async () => {
    vi.stubEnv("OPENAI_MODERATION_ENABLED", "true");
    vi.stubEnv("OPENAI_API_KEY", "test-openai-key");
    try {
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
      vi.spyOn(
        (service as any).openAIClient,
        "assistModeration",
      ).mockResolvedValue({
        decision: "review",
        reason: "possible grooming language",
      });

      const message = (await service.createMessage(
        "chat-1",
        "user-1",
        "let's play football",
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
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
