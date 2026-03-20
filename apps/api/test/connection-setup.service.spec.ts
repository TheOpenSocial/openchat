import { describe, expect, it, vi } from "vitest";
import { NotificationType } from "@opensocial/types";
import { ConnectionSetupService } from "../src/connections/connection-setup.service.js";

describe("ConnectionSetupService", () => {
  it("creates connection/chat for accepted dm request", async () => {
    const prisma: any = {
      intentRequest: {
        findUnique: vi.fn().mockResolvedValue({
          id: "req-1",
          status: "accepted",
          intentId: "intent-1",
          senderUserId: "user-1",
          recipientUserId: "user-2",
        }),
        findMany: vi.fn().mockResolvedValue([]),
      },
      intent: {
        findUnique: vi.fn().mockResolvedValue({
          id: "intent-1",
          parsedIntent: { intentType: "chat" },
        }),
        update: vi.fn().mockResolvedValue({}),
      },
      connection: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
      connectionParticipant: {
        findMany: vi.fn().mockResolvedValue([]),
        createMany: vi.fn().mockResolvedValue({}),
      },
      chat: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
      chatMembership: {
        findMany: vi.fn().mockResolvedValue([]),
        createMany: vi.fn().mockResolvedValue({}),
      },
      agentThread: {
        findFirst: vi.fn().mockResolvedValue({ id: "thread-1" }),
      },
    };

    const connectionsService: any = {
      createConnection: vi.fn().mockResolvedValue({ id: "conn-1" }),
    };

    const chatsService: any = {
      createChat: vi.fn().mockResolvedValue({ id: "chat-1" }),
      createMessage: vi.fn().mockResolvedValue({}),
      createSystemMessage: vi.fn().mockResolvedValue({}),
    };

    const notificationsService: any = {
      createInAppNotification: vi.fn().mockResolvedValue({}),
    };

    const personalizationService: any = {
      recordBehaviorSignal: vi.fn().mockResolvedValue({}),
      storeInteractionSummary: vi.fn().mockResolvedValue({}),
    };
    const matchingService: any = {
      upsertConversationSummaryEmbedding: vi.fn().mockResolvedValue({}),
    };

    const agentService: any = {
      createAgentMessage: vi.fn().mockResolvedValue({}),
    };
    const realtimeEventsService: any = {
      emitIntentUpdated: vi.fn(),
      emitConnectionCreated: vi.fn(),
      emitRequestCreated: vi.fn(),
    };

    const service = new ConnectionSetupService(
      prisma,
      connectionsService,
      chatsService,
      notificationsService,
      personalizationService,
      matchingService,
      agentService,
      undefined,
      undefined,
      realtimeEventsService,
    );

    const result = await service.setupFromAcceptedRequest("req-1");

    expect(result.status).toBe("connected");
    expect(connectionsService.createConnection).toHaveBeenCalledWith(
      "dm",
      "user-1",
      "intent-1",
    );
    expect(personalizationService.recordBehaviorSignal).toHaveBeenCalledTimes(
      2,
    );
    expect(
      personalizationService.storeInteractionSummary,
    ).toHaveBeenCalledTimes(2);
    expect(
      matchingService.upsertConversationSummaryEmbedding,
    ).toHaveBeenCalledTimes(2);
    expect(realtimeEventsService.emitIntentUpdated).toHaveBeenCalledWith(
      "user-1",
      {
        intentId: "intent-1",
        status: "connected",
      },
    );
    expect(realtimeEventsService.emitConnectionCreated).toHaveBeenCalledWith(
      ["user-1", "user-2"],
      {
        connectionId: "conn-1",
        type: "dm",
      },
    );
  });

  it("converts active 1:1 intent into group flow when multiple recipients accept", async () => {
    const connectionFindFirst = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: "conn-dm",
        type: "dm",
        originIntentId: "intent-convert",
      });
    const connectionUpdate = vi.fn().mockResolvedValue({
      id: "conn-dm",
      type: "group",
      originIntentId: "intent-convert",
    });
    const intentRequestFindMany = vi
      .fn()
      .mockResolvedValueOnce([
        { recipientUserId: "user-2" },
        { recipientUserId: "user-3" },
      ])
      .mockResolvedValueOnce([
        { recipientUserId: "user-2", status: "accepted", wave: 1 },
        { recipientUserId: "user-3", status: "accepted", wave: 1 },
      ]);

    const prisma: any = {
      intentRequest: {
        findUnique: vi.fn().mockResolvedValue({
          id: "req-convert",
          status: "accepted",
          intentId: "intent-convert",
          senderUserId: "user-1",
          recipientUserId: "user-3",
        }),
        findMany: intentRequestFindMany,
      },
      intent: {
        findUnique: vi.fn().mockResolvedValue({
          id: "intent-convert",
          createdAt: new Date(),
          parsedIntent: { intentType: "chat" },
        }),
        update: vi.fn().mockResolvedValue({}),
      },
      connection: {
        findFirst: connectionFindFirst,
        update: connectionUpdate,
      },
      connectionParticipant: {
        findMany: vi.fn().mockResolvedValue([]),
        createMany: vi.fn().mockResolvedValue({}),
      },
      chat: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
      chatMembership: {
        findMany: vi.fn().mockResolvedValue([]),
        createMany: vi.fn().mockResolvedValue({}),
      },
      agentThread: {
        findFirst: vi.fn().mockResolvedValue({ id: "thread-1" }),
      },
    };

    const service = new ConnectionSetupService(
      prisma,
      {
        createConnection: vi.fn().mockResolvedValue({ id: "conn-new" }),
      } as any,
      {
        createChat: vi.fn().mockResolvedValue({ id: "chat-convert" }),
        createMessage: vi.fn().mockResolvedValue({}),
        createSystemMessage: vi.fn().mockResolvedValue({}),
      } as any,
      { createInAppNotification: vi.fn().mockResolvedValue({}) } as any,
      {
        recordBehaviorSignal: vi.fn().mockResolvedValue({}),
        storeInteractionSummary: vi.fn().mockResolvedValue({}),
      } as any,
      {
        upsertConversationSummaryEmbedding: vi.fn().mockResolvedValue({}),
      } as any,
      { createAgentMessage: vi.fn().mockResolvedValue({}) } as any,
    );

    const result = await service.setupFromAcceptedRequest("req-convert");

    expect(result.status).toBe("connected");
    expect(connectionUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "conn-dm" },
        data: { type: "group" },
      }),
    );
  });

  it("keeps group in partial state until target size is reached", async () => {
    const prisma: any = {
      intentRequest: {
        findUnique: vi.fn().mockResolvedValue({
          id: "req-2",
          status: "accepted",
          intentId: "intent-2",
          senderUserId: "user-1",
          recipientUserId: "user-2",
        }),
        findMany: vi
          .fn()
          .mockResolvedValue([
            { recipientUserId: "user-2", status: "accepted", wave: 1 },
          ]),
      },
      intent: {
        findUnique: vi.fn().mockResolvedValue({
          id: "intent-2",
          parsedIntent: { intentType: "group", groupSizeTarget: 4 },
        }),
        update: vi.fn().mockResolvedValue({}),
      },
      connection: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
      connectionParticipant: {
        findMany: vi.fn().mockResolvedValue([]),
        createMany: vi.fn().mockResolvedValue({}),
      },
      chat: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
      chatMembership: {
        findMany: vi.fn().mockResolvedValue([]),
        createMany: vi.fn().mockResolvedValue({}),
      },
      agentThread: {
        findFirst: vi.fn().mockResolvedValue({ id: "thread-1" }),
      },
    };

    const connectionsService: any = {
      createConnection: vi.fn().mockResolvedValue({ id: "conn-2" }),
    };

    const chatsService: any = {
      createChat: vi.fn().mockResolvedValue({ id: "chat-2" }),
      createMessage: vi.fn().mockResolvedValue({}),
      createSystemMessage: vi.fn().mockResolvedValue({}),
    };

    const notificationsService: any = {
      createInAppNotification: vi.fn().mockResolvedValue({}),
    };

    const personalizationService: any = {
      recordBehaviorSignal: vi.fn().mockResolvedValue({}),
      storeInteractionSummary: vi.fn().mockResolvedValue({}),
    };
    const matchingService: any = {
      upsertConversationSummaryEmbedding: vi.fn().mockResolvedValue({}),
    };

    const agentService: any = {
      createAgentMessage: vi.fn().mockResolvedValue({}),
    };

    const service = new ConnectionSetupService(
      prisma,
      connectionsService,
      chatsService,
      notificationsService,
      personalizationService,
      matchingService,
      agentService,
    );

    const result = await service.setupFromAcceptedRequest("req-2");

    expect(result.status).toBe("partial");
    expect(connectionsService.createConnection).toHaveBeenCalledWith(
      "group",
      "user-1",
      "intent-2",
    );
    expect(personalizationService.recordBehaviorSignal).not.toHaveBeenCalled();
    expect(
      personalizationService.storeInteractionSummary,
    ).not.toHaveBeenCalled();
    expect(
      matchingService.upsertConversationSummaryEmbedding,
    ).not.toHaveBeenCalled();
  });

  it("sends group formed notifications to all participants when target is reached", async () => {
    const prisma: any = {
      intentRequest: {
        findUnique: vi.fn().mockResolvedValue({
          id: "req-3",
          status: "accepted",
          intentId: "intent-3",
          senderUserId: "user-1",
          recipientUserId: "user-2",
        }),
        findMany: vi.fn().mockResolvedValue([
          { recipientUserId: "user-2", status: "accepted", wave: 1 },
          { recipientUserId: "user-3", status: "accepted", wave: 1 },
        ]),
      },
      intent: {
        findUnique: vi.fn().mockResolvedValue({
          id: "intent-3",
          parsedIntent: { intentType: "group", groupSizeTarget: 3 },
        }),
        update: vi.fn().mockResolvedValue({}),
      },
      connection: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
      connectionParticipant: {
        findMany: vi.fn().mockResolvedValue([]),
        createMany: vi.fn().mockResolvedValue({}),
      },
      chat: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
      chatMembership: {
        findMany: vi.fn().mockResolvedValue([]),
        createMany: vi.fn().mockResolvedValue({}),
      },
      agentThread: {
        findFirst: vi.fn().mockResolvedValue({ id: "thread-1" }),
      },
    };

    const connectionsService: any = {
      createConnection: vi.fn().mockResolvedValue({ id: "conn-3" }),
    };

    const chatsService: any = {
      createChat: vi.fn().mockResolvedValue({ id: "chat-3" }),
      createMessage: vi.fn().mockResolvedValue({}),
      createSystemMessage: vi.fn().mockResolvedValue({}),
    };

    const notificationsService: any = {
      createInAppNotification: vi.fn().mockResolvedValue({}),
    };

    const personalizationService: any = {
      recordBehaviorSignal: vi.fn().mockResolvedValue({}),
      storeInteractionSummary: vi.fn().mockResolvedValue({}),
    };
    const matchingService: any = {
      upsertConversationSummaryEmbedding: vi.fn().mockResolvedValue({}),
    };

    const agentService: any = {
      createAgentMessage: vi.fn().mockResolvedValue({}),
    };

    const service = new ConnectionSetupService(
      prisma,
      connectionsService,
      chatsService,
      notificationsService,
      personalizationService,
      matchingService,
      agentService,
    );

    const result = await service.setupFromAcceptedRequest("req-3");

    expect(result.status).toBe("connected");
    expect(prisma.intent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "connected" }),
      }),
    );
    expect(notificationsService.createInAppNotification).toHaveBeenCalledTimes(
      3,
    );
    expect(notificationsService.createInAppNotification).toHaveBeenCalledWith(
      "user-1",
      NotificationType.GROUP_FORMED,
      expect.stringContaining("3/3"),
    );
    expect(notificationsService.createInAppNotification).toHaveBeenCalledWith(
      "user-2",
      NotificationType.GROUP_FORMED,
      expect.stringContaining("participants confirmed"),
    );
    expect(notificationsService.createInAppNotification).toHaveBeenCalledWith(
      "user-3",
      NotificationType.GROUP_FORMED,
      expect.stringContaining("participants confirmed"),
    );
    expect(personalizationService.recordBehaviorSignal).toHaveBeenCalledTimes(
      9,
    );
    expect(
      personalizationService.storeInteractionSummary,
    ).toHaveBeenCalledTimes(3);
    expect(
      matchingService.upsertConversationSummaryEmbedding,
    ).toHaveBeenCalledTimes(3);
  });

  it("creates group at fallback threshold after wait window elapses", async () => {
    const prisma: any = {
      intentRequest: {
        findUnique: vi.fn().mockResolvedValue({
          id: "req-4",
          status: "accepted",
          intentId: "intent-4",
          senderUserId: "user-1",
          recipientUserId: "user-2",
        }),
        findMany: vi.fn().mockResolvedValue([
          { recipientUserId: "user-2", status: "accepted", wave: 1 },
          { recipientUserId: "user-3", status: "accepted", wave: 1 },
        ]),
      },
      intent: {
        findUnique: vi.fn().mockResolvedValue({
          id: "intent-4",
          createdAt: new Date(Date.now() - 30 * 60_000),
          parsedIntent: { intentType: "group", groupSizeTarget: 4 },
        }),
        update: vi.fn().mockResolvedValue({}),
      },
      connection: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
      connectionParticipant: {
        findMany: vi.fn().mockResolvedValue([]),
        createMany: vi.fn().mockResolvedValue({}),
      },
      chat: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
      chatMembership: {
        findMany: vi.fn().mockResolvedValue([]),
        createMany: vi.fn().mockResolvedValue({}),
      },
      agentThread: {
        findFirst: vi.fn().mockResolvedValue({ id: "thread-1" }),
      },
    };

    const connectionsService: any = {
      createConnection: vi.fn().mockResolvedValue({ id: "conn-4" }),
    };

    const chatsService: any = {
      createChat: vi.fn().mockResolvedValue({ id: "chat-4" }),
      createMessage: vi.fn().mockResolvedValue({}),
      createSystemMessage: vi.fn().mockResolvedValue({}),
    };

    const notificationsService: any = {
      createInAppNotification: vi.fn().mockResolvedValue({}),
    };

    const personalizationService: any = {
      recordBehaviorSignal: vi.fn().mockResolvedValue({}),
      storeInteractionSummary: vi.fn().mockResolvedValue({}),
    };
    const matchingService: any = {
      upsertConversationSummaryEmbedding: vi.fn().mockResolvedValue({}),
    };

    const agentService: any = {
      createAgentMessage: vi.fn().mockResolvedValue({}),
    };

    const service = new ConnectionSetupService(
      prisma,
      connectionsService,
      chatsService,
      notificationsService,
      personalizationService,
      matchingService,
      agentService,
    );

    const result = await service.setupFromAcceptedRequest("req-4");

    expect(result.status).toBe("connected");
    if (!("participantCount" in result)) {
      throw new Error("expected group connection result");
    }
    expect(result.participantCount).toBe(3);
    expect(result.targetSize).toBe(4);
    expect(result.requiredParticipants).toBe(3);
    expect(notificationsService.createInAppNotification).toHaveBeenCalledWith(
      "user-1",
      NotificationType.GROUP_FORMED,
      expect.stringContaining("fallback threshold"),
    );
    expect(agentService.createAgentMessage).toHaveBeenCalledWith(
      "thread-1",
      expect.stringContaining("fallback threshold"),
    );
  });

  it("backfills additional requests when group is below readiness threshold", async () => {
    const createManyIntentRequests = vi.fn().mockResolvedValue({ count: 2 });
    const prisma: any = {
      intentRequest: {
        findUnique: vi.fn().mockResolvedValue({
          id: "req-5",
          status: "accepted",
          intentId: "intent-5",
          senderUserId: "user-1",
          recipientUserId: "user-2",
        }),
        findMany: vi
          .fn()
          .mockResolvedValue([
            { recipientUserId: "user-2", status: "accepted", wave: 1 },
          ]),
        createMany: createManyIntentRequests,
      },
      intent: {
        findUnique: vi.fn().mockResolvedValue({
          id: "intent-5",
          createdAt: new Date(),
          parsedIntent: { intentType: "group", groupSizeTarget: 4 },
        }),
        update: vi.fn().mockResolvedValue({}),
      },
      intentCandidate: {
        findMany: vi.fn().mockResolvedValue([
          { candidateUserId: "user-3", rationale: { semantic: 0.9 } },
          { candidateUserId: "user-4", rationale: { semantic: 0.8 } },
        ]),
      },
      connection: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
      connectionParticipant: {
        findMany: vi.fn().mockResolvedValue([]),
        createMany: vi.fn().mockResolvedValue({}),
      },
      chat: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
      chatMembership: {
        findMany: vi.fn().mockResolvedValue([]),
        createMany: vi.fn().mockResolvedValue({}),
      },
      agentThread: {
        findFirst: vi.fn().mockResolvedValue({ id: "thread-1" }),
      },
    };

    const connectionsService: any = {
      createConnection: vi.fn().mockResolvedValue({ id: "conn-5" }),
    };
    const chatsService: any = {
      createChat: vi.fn().mockResolvedValue({ id: "chat-5" }),
      createMessage: vi.fn().mockResolvedValue({}),
      createSystemMessage: vi.fn().mockResolvedValue({}),
    };
    const notificationsService: any = {
      createInAppNotification: vi.fn().mockResolvedValue({}),
    };
    const personalizationService: any = {
      recordBehaviorSignal: vi.fn().mockResolvedValue({}),
      storeInteractionSummary: vi.fn().mockResolvedValue({}),
    };
    const matchingService: any = {
      upsertConversationSummaryEmbedding: vi.fn().mockResolvedValue({}),
    };
    const agentService: any = {
      createAgentMessage: vi.fn().mockResolvedValue({}),
    };

    const service = new ConnectionSetupService(
      prisma,
      connectionsService,
      chatsService,
      notificationsService,
      personalizationService,
      matchingService,
      agentService,
    );

    const result = await service.setupFromAcceptedRequest("req-5");

    expect(result.status).toBe("partial");
    expect(createManyIntentRequests).toHaveBeenCalledTimes(1);
    expect(createManyIntentRequests).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({ recipientUserId: "user-3", wave: 2 }),
          expect.objectContaining({ recipientUserId: "user-4", wave: 2 }),
        ]),
      }),
    );
    expect(notificationsService.createInAppNotification).toHaveBeenCalledWith(
      "user-3",
      NotificationType.REQUEST_RECEIVED,
      expect.stringContaining("group request"),
    );
    expect(notificationsService.createInAppNotification).toHaveBeenCalledWith(
      "user-4",
      NotificationType.REQUEST_RECEIVED,
      expect.stringContaining("group request"),
    );
    expect(agentService.createAgentMessage).toHaveBeenCalledWith(
      "thread-1",
      expect.stringContaining("backfill invite"),
    );
  });

  it("does not backfill when pending invites already fill capacity", async () => {
    const createManyIntentRequests = vi.fn().mockResolvedValue({ count: 0 });
    const candidateFindMany = vi
      .fn()
      .mockResolvedValue([
        { candidateUserId: "user-5", rationale: { semantic: 0.7 } },
      ]);
    const prisma: any = {
      intentRequest: {
        findUnique: vi.fn().mockResolvedValue({
          id: "req-6",
          status: "accepted",
          intentId: "intent-6",
          senderUserId: "user-1",
          recipientUserId: "user-2",
        }),
        findMany: vi.fn().mockResolvedValue([
          { recipientUserId: "user-2", status: "accepted", wave: 1 },
          { recipientUserId: "user-3", status: "pending", wave: 1 },
          { recipientUserId: "user-4", status: "pending", wave: 1 },
        ]),
        createMany: createManyIntentRequests,
      },
      intent: {
        findUnique: vi.fn().mockResolvedValue({
          id: "intent-6",
          createdAt: new Date(),
          parsedIntent: { intentType: "group", groupSizeTarget: 4 },
        }),
        update: vi.fn().mockResolvedValue({}),
      },
      intentCandidate: {
        findMany: candidateFindMany,
      },
      connection: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
      connectionParticipant: {
        findMany: vi.fn().mockResolvedValue([]),
        createMany: vi.fn().mockResolvedValue({}),
      },
      chat: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
      chatMembership: {
        findMany: vi.fn().mockResolvedValue([]),
        createMany: vi.fn().mockResolvedValue({}),
      },
      agentThread: {
        findFirst: vi.fn().mockResolvedValue({ id: "thread-1" }),
      },
    };

    const service = new ConnectionSetupService(
      prisma,
      { createConnection: vi.fn().mockResolvedValue({ id: "conn-6" }) } as any,
      {
        createChat: vi.fn().mockResolvedValue({ id: "chat-6" }),
        createMessage: vi.fn().mockResolvedValue({}),
        createSystemMessage: vi.fn().mockResolvedValue({}),
      } as any,
      { createInAppNotification: vi.fn().mockResolvedValue({}) } as any,
      {
        recordBehaviorSignal: vi.fn().mockResolvedValue({}),
        storeInteractionSummary: vi.fn().mockResolvedValue({}),
      } as any,
      {
        upsertConversationSummaryEmbedding: vi.fn().mockResolvedValue({}),
      } as any,
      { createAgentMessage: vi.fn().mockResolvedValue({}) } as any,
    );

    const result = await service.setupFromAcceptedRequest("req-6");

    expect(result.status).toBe("partial");
    expect(createManyIntentRequests).not.toHaveBeenCalled();
    expect(candidateFindMany).not.toHaveBeenCalled();
  });

  it("reactivates previously-left participants before creating new participants", async () => {
    const findMany = vi.fn().mockResolvedValue([
      {
        connectionId: "conn-1",
        userId: "user-2",
        leftAt: new Date("2026-03-20T00:00:00.000Z"),
      },
    ]);
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const createMany = vi.fn().mockResolvedValue({ count: 1 });
    const service = new ConnectionSetupService(
      {
        connectionParticipant: {
          findMany,
          updateMany,
          createMany,
        },
      } as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    await (service as any).ensureParticipants("conn-1", ["user-1", "user-2"]);

    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          connectionId: "conn-1",
          userId: { in: ["user-2"] },
        }),
        data: { leftAt: null },
      }),
    );
    expect(createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [
          {
            connectionId: "conn-1",
            userId: "user-1",
            role: "owner",
          },
        ],
      }),
    );
  });

  it("syncs chat memberships from active participants only", async () => {
    const findConnectionParticipants = vi.fn().mockResolvedValue([
      {
        userId: "user-active",
      },
    ]);
    const createMemberships = vi.fn().mockResolvedValue({ count: 1 });
    const createSystemMessage = vi.fn().mockResolvedValue({});
    const service = new ConnectionSetupService(
      {
        chat: {
          findFirst: vi.fn().mockResolvedValue({
            id: "chat-1",
          }),
        },
        connectionParticipant: {
          findMany: findConnectionParticipants,
        },
        chatMembership: {
          findMany: vi.fn().mockResolvedValue([]),
          createMany: createMemberships,
        },
      } as any,
      {} as any,
      {
        createSystemMessage,
      } as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    await (service as any).ensureChat("conn-1", "group", "system-user");

    expect(findConnectionParticipants).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          connectionId: "conn-1",
          leftAt: null,
        },
      }),
    );
    expect(createMemberships).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [{ chatId: "chat-1", userId: "user-active" }],
      }),
    );
    expect(createSystemMessage).toHaveBeenCalledWith(
      "chat-1",
      "user-active",
      "join",
      undefined,
      expect.objectContaining({
        idempotencyKey: "chat-membership-join:chat-1:user-active",
      }),
    );
  });
});
