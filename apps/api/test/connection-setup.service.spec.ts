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
    const executionReconciliationService: any = {
      recordGroupFormationStalled: vi.fn().mockResolvedValue(undefined),
    };

    const service = new ConnectionSetupService(
      prisma,
      connectionsService,
      chatsService,
      notificationsService,
      personalizationService,
      matchingService,
      agentService,
      executionReconciliationService,
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
      {
        recordGroupFormationStalled: vi.fn().mockResolvedValue(undefined),
      } as any,
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
    const executionReconciliationService: any = {
      recordGroupFormationStalled: vi.fn().mockResolvedValue(undefined),
    };

    const service = new ConnectionSetupService(
      prisma,
      connectionsService,
      chatsService,
      notificationsService,
      personalizationService,
      matchingService,
      agentService,
      executionReconciliationService,
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
    const executionReconciliationService: any = {
      recordGroupFormationStalled: vi.fn().mockResolvedValue(undefined),
    };

    const service = new ConnectionSetupService(
      prisma,
      connectionsService,
      chatsService,
      notificationsService,
      personalizationService,
      matchingService,
      agentService,
      executionReconciliationService,
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
    const executionReconciliationService: any = {
      recordGroupFormationStalled: vi.fn().mockResolvedValue(undefined),
    };

    const service = new ConnectionSetupService(
      prisma,
      connectionsService,
      chatsService,
      notificationsService,
      personalizationService,
      matchingService,
      agentService,
      executionReconciliationService,
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
    const executionReconciliationService: any = {
      recordGroupFormationStalled: vi.fn().mockResolvedValue(undefined),
    };

    const service = new ConnectionSetupService(
      prisma,
      connectionsService,
      chatsService,
      notificationsService,
      personalizationService,
      matchingService,
      agentService,
      executionReconciliationService,
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

  it("reuses workflow-linked group backfill notifications and sender thread updates on replay", async () => {
    const sideEffectRows: Array<{
      action: string;
      entityType: string;
      entityId: string;
      createdAt: Date;
      metadata: Record<string, unknown>;
    }> = [];
    const notificationsById = new Map<string, any>();
    const messagesById = new Map<string, any>();
    let notificationCounter = 0;
    let messageCounter = 0;

    const intentRequestFindMany = vi.fn(async (args?: any) => {
      if (args?.where?.status === "accepted") {
        return [{ recipientUserId: "user-2" }];
      }
      return [{ recipientUserId: "user-2", status: "accepted", wave: 1 }];
    });

    const prisma: any = {
      intentRequest: {
        findUnique: vi.fn().mockResolvedValue({
          id: "req-group-replay",
          status: "accepted",
          intentId: "intent-group-replay",
          senderUserId: "user-1",
          recipientUserId: "user-2",
        }),
        findMany: intentRequestFindMany,
        createMany: vi.fn().mockResolvedValue({ count: 2 }),
      },
      intent: {
        findUnique: vi.fn().mockResolvedValue({
          id: "intent-group-replay",
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
        findFirst: vi.fn().mockResolvedValue({
          id: "conn-group-replay",
          type: "group",
          originIntentId: "intent-group-replay",
        }),
      },
      connectionParticipant: {
        findMany: vi.fn().mockResolvedValue([
          { userId: "user-1", leftAt: null },
          { userId: "user-2", leftAt: null },
        ]),
        createMany: vi.fn().mockResolvedValue({}),
      },
      chat: {
        findFirst: vi.fn().mockResolvedValue({
          id: "chat-group-replay",
          connectionId: "conn-group-replay",
          type: "group",
        }),
      },
      chatMembership: {
        findMany: vi.fn().mockResolvedValue([
          { chatId: "chat-group-replay", userId: "user-1" },
          { chatId: "chat-group-replay", userId: "user-2" },
        ]),
        createMany: vi.fn().mockResolvedValue({}),
      },
      agentThread: {
        findFirst: vi.fn().mockResolvedValue({ id: "thread-group-replay" }),
      },
      notification: {
        findUnique: vi.fn().mockImplementation(({ where }: any) => {
          return Promise.resolve(notificationsById.get(where.id) ?? null);
        }),
      },
      agentMessage: {
        findUnique: vi.fn().mockImplementation(({ where }: any) => {
          return Promise.resolve(messagesById.get(where.id) ?? null);
        }),
      },
      auditLog: {
        findMany: vi.fn().mockImplementation(({ where }: any) => {
          const gte = where?.createdAt?.gte as Date | undefined;
          const rows = sideEffectRows.filter((row) => {
            if (where?.action && row.action !== where.action) {
              return false;
            }
            if (where?.entityType && row.entityType !== where.entityType) {
              return false;
            }
            if (gte && row.createdAt < gte) {
              return false;
            }
            return true;
          });
          return Promise.resolve(
            rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
          );
        }),
      },
    };

    const notificationsService: any = {
      createInAppNotification: vi
        .fn()
        .mockImplementation(
          (recipientUserId: string, type: NotificationType, body: string) => {
            const notification = {
              id: `notification-${++notificationCounter}`,
              recipientUserId,
              type,
              body,
            };
            notificationsById.set(notification.id, notification);
            return Promise.resolve(notification);
          },
        ),
    };
    const agentService: any = {
      createAgentMessage: vi
        .fn()
        .mockImplementation((threadId: string, content: string) => {
          const message = {
            id: `agent-message-${++messageCounter}`,
            threadId,
            content,
          };
          messagesById.set(message.id, message);
          return Promise.resolve(message);
        }),
    };
    const workflowRuntimeService: any = {
      buildWorkflowRunId: vi
        .fn()
        .mockReturnValue("social:intent_request:req-group-replay"),
      startRun: vi.fn().mockResolvedValue(undefined),
      checkpoint: vi.fn().mockResolvedValue(undefined),
      linkSideEffect: vi.fn().mockImplementation((input: any) => {
        sideEffectRows.push({
          action: "agent.workflow_side_effect_linked",
          entityType: input.entityType,
          entityId: input.entityId,
          createdAt: new Date(),
          metadata: {
            workflowRunId: input.workflowRunId,
            relation: input.relation,
            ...(input.metadata ?? {}),
          },
        });
        return Promise.resolve(undefined);
      }),
    };

    const service = new ConnectionSetupService(
      prisma,
      {
        createConnection: vi
          .fn()
          .mockResolvedValue({ id: "conn-group-replay" }),
      } as any,
      {
        createChat: vi.fn().mockResolvedValue({ id: "chat-group-replay" }),
        createMessage: vi.fn().mockResolvedValue({}),
        createSystemMessage: vi.fn().mockResolvedValue({}),
      } as any,
      notificationsService,
      {
        recordBehaviorSignal: vi.fn().mockResolvedValue({}),
        storeInteractionSummary: vi.fn().mockResolvedValue({}),
      } as any,
      {
        upsertConversationSummaryEmbedding: vi.fn().mockResolvedValue({}),
      } as any,
      agentService,
      {
        recordGroupFormationStalled: vi.fn().mockResolvedValue(undefined),
      } as any,
      undefined,
      undefined,
      undefined,
      workflowRuntimeService,
    );

    await service.setupFromAcceptedRequest("req-group-replay", "trace-1");
    await service.setupFromAcceptedRequest("req-group-replay", "trace-2");

    expect(notificationsService.createInAppNotification).toHaveBeenCalledTimes(
      3,
    );
    expect(agentService.createAgentMessage).toHaveBeenCalledTimes(2);

    const dedupedSideEffects = workflowRuntimeService.linkSideEffect.mock.calls
      .map(([input]: [any]) => input)
      .filter((input: any) => input?.metadata?.deduped === true);
    const dedupedRelations = new Set(
      dedupedSideEffects.map((input: any) => input.relation),
    );

    expect(dedupedRelations.has("group_sender_notification")).toBe(true);
    expect(dedupedRelations.has("group_backfill_notification")).toBe(true);
    expect(dedupedRelations.has("group_sender_thread_message")).toBe(true);
  });

  it("reuses workflow-linked group-ready notifications and sender thread update on replay", async () => {
    const sideEffectRows: Array<{
      action: string;
      entityType: string;
      entityId: string;
      createdAt: Date;
      metadata: Record<string, unknown>;
    }> = [];
    const notificationsById = new Map<string, any>();
    const messagesById = new Map<string, any>();
    let notificationCounter = 0;
    let messageCounter = 0;

    const intentRequestFindMany = vi.fn(async (args?: any) => {
      if (args?.where?.status === "accepted") {
        return [{ recipientUserId: "user-2" }, { recipientUserId: "user-3" }];
      }
      return [
        { recipientUserId: "user-2", status: "accepted", wave: 1 },
        { recipientUserId: "user-3", status: "accepted", wave: 1 },
      ];
    });

    const prisma: any = {
      intentRequest: {
        findUnique: vi.fn().mockResolvedValue({
          id: "req-group-ready-replay",
          status: "accepted",
          intentId: "intent-group-ready-replay",
          senderUserId: "user-1",
          recipientUserId: "user-2",
        }),
        findMany: intentRequestFindMany,
      },
      intent: {
        findUnique: vi.fn().mockResolvedValue({
          id: "intent-group-ready-replay",
          createdAt: new Date(),
          parsedIntent: { intentType: "group", groupSizeTarget: 3 },
        }),
        update: vi.fn().mockResolvedValue({}),
      },
      connection: {
        findFirst: vi.fn().mockResolvedValue({
          id: "conn-group-ready-replay",
          type: "group",
          originIntentId: "intent-group-ready-replay",
        }),
      },
      connectionParticipant: {
        findMany: vi.fn().mockResolvedValue([
          { userId: "user-1", leftAt: null },
          { userId: "user-2", leftAt: null },
          { userId: "user-3", leftAt: null },
        ]),
        createMany: vi.fn().mockResolvedValue({}),
      },
      chat: {
        findFirst: vi.fn().mockResolvedValue({
          id: "chat-group-ready-replay",
          connectionId: "conn-group-ready-replay",
          type: "group",
        }),
      },
      chatMembership: {
        findMany: vi.fn().mockResolvedValue([
          { chatId: "chat-group-ready-replay", userId: "user-1" },
          { chatId: "chat-group-ready-replay", userId: "user-2" },
          { chatId: "chat-group-ready-replay", userId: "user-3" },
        ]),
        createMany: vi.fn().mockResolvedValue({}),
      },
      agentThread: {
        findFirst: vi
          .fn()
          .mockResolvedValue({ id: "thread-group-ready-replay" }),
      },
      notification: {
        findUnique: vi.fn().mockImplementation(({ where }: any) => {
          return Promise.resolve(notificationsById.get(where.id) ?? null);
        }),
      },
      agentMessage: {
        findUnique: vi.fn().mockImplementation(({ where }: any) => {
          return Promise.resolve(messagesById.get(where.id) ?? null);
        }),
      },
      auditLog: {
        findMany: vi.fn().mockImplementation(({ where }: any) => {
          const gte = where?.createdAt?.gte as Date | undefined;
          const rows = sideEffectRows.filter((row) => {
            if (where?.action && row.action !== where.action) {
              return false;
            }
            if (where?.entityType && row.entityType !== where.entityType) {
              return false;
            }
            if (gte && row.createdAt < gte) {
              return false;
            }
            return true;
          });
          return Promise.resolve(
            rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
          );
        }),
      },
    };

    const notificationsService: any = {
      createInAppNotification: vi
        .fn()
        .mockImplementation(
          (recipientUserId: string, type: NotificationType, body: string) => {
            const notification = {
              id: `notification-${++notificationCounter}`,
              recipientUserId,
              type,
              body,
            };
            notificationsById.set(notification.id, notification);
            return Promise.resolve(notification);
          },
        ),
    };
    const agentService: any = {
      createAgentMessage: vi
        .fn()
        .mockImplementation((threadId: string, content: string) => {
          const message = {
            id: `agent-message-${++messageCounter}`,
            threadId,
            content,
          };
          messagesById.set(message.id, message);
          return Promise.resolve(message);
        }),
    };
    const workflowRuntimeService: any = {
      buildWorkflowRunId: vi
        .fn()
        .mockReturnValue("social:intent_request:req-group-ready-replay"),
      startRun: vi.fn().mockResolvedValue(undefined),
      checkpoint: vi.fn().mockResolvedValue(undefined),
      linkSideEffect: vi.fn().mockImplementation((input: any) => {
        sideEffectRows.push({
          action: "agent.workflow_side_effect_linked",
          entityType: input.entityType,
          entityId: input.entityId,
          createdAt: new Date(),
          metadata: {
            workflowRunId: input.workflowRunId,
            relation: input.relation,
            ...(input.metadata ?? {}),
          },
        });
        return Promise.resolve(undefined);
      }),
    };

    const service = new ConnectionSetupService(
      prisma,
      {
        createConnection: vi
          .fn()
          .mockResolvedValue({ id: "conn-group-ready-replay" }),
      } as any,
      {
        createChat: vi
          .fn()
          .mockResolvedValue({ id: "chat-group-ready-replay" }),
        createMessage: vi.fn().mockResolvedValue({}),
        createSystemMessage: vi.fn().mockResolvedValue({}),
      } as any,
      notificationsService,
      {
        recordBehaviorSignal: vi.fn().mockResolvedValue({}),
        storeInteractionSummary: vi.fn().mockResolvedValue({}),
      } as any,
      {
        upsertConversationSummaryEmbedding: vi.fn().mockResolvedValue({}),
      } as any,
      agentService,
      {
        recordGroupFormationStalled: vi.fn().mockResolvedValue(undefined),
      } as any,
      undefined,
      undefined,
      undefined,
      workflowRuntimeService,
    );

    await service.setupFromAcceptedRequest("req-group-ready-replay", "trace-1");
    await service.setupFromAcceptedRequest("req-group-ready-replay", "trace-2");

    expect(notificationsService.createInAppNotification).toHaveBeenCalledTimes(
      3,
    );
    expect(agentService.createAgentMessage).toHaveBeenCalledTimes(1);

    const dedupedSideEffects = workflowRuntimeService.linkSideEffect.mock.calls
      .map(([input]: [any]) => input)
      .filter((input: any) => input?.metadata?.deduped === true);
    const dedupedRelations = new Set(
      dedupedSideEffects.map((input: any) => input.relation),
    );

    expect(dedupedRelations.has("group_sender_notification")).toBe(true);
    expect(dedupedRelations.has("group_participant_notification")).toBe(true);
    expect(dedupedRelations.has("group_sender_thread_message")).toBe(true);
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
      {
        recordGroupFormationStalled: vi.fn().mockResolvedValue(undefined),
      } as any,
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

  it("reuses workflow-linked dm notifications and sender thread update on replay", async () => {
    const sideEffectRows: Array<{
      action: string;
      entityType: string;
      entityId: string;
      createdAt: Date;
      metadata: Record<string, unknown>;
    }> = [];
    const notificationsById = new Map<string, any>();
    const messagesById = new Map<string, any>();
    let notificationCounter = 0;
    let messageCounter = 0;

    const prisma: any = {
      intentRequest: {
        findUnique: vi.fn().mockResolvedValue({
          id: "req-replay",
          status: "accepted",
          intentId: "intent-replay",
          senderUserId: "user-1",
          recipientUserId: "user-2",
        }),
        findMany: vi.fn().mockResolvedValue([]),
      },
      intent: {
        findUnique: vi.fn().mockResolvedValue({
          id: "intent-replay",
          parsedIntent: { intentType: "chat" },
        }),
        update: vi.fn().mockResolvedValue({}),
      },
      connection: {
        findFirst: vi.fn().mockResolvedValue({
          id: "conn-replay",
          type: "dm",
          originIntentId: "intent-replay",
        }),
      },
      connectionParticipant: {
        findMany: vi.fn().mockResolvedValue([
          { userId: "user-1", leftAt: null },
          { userId: "user-2", leftAt: null },
        ]),
        createMany: vi.fn().mockResolvedValue({}),
      },
      chat: {
        findFirst: vi.fn().mockResolvedValue({
          id: "chat-replay",
          connectionId: "conn-replay",
          type: "dm",
        }),
      },
      chatMembership: {
        findMany: vi.fn().mockResolvedValue([
          { chatId: "chat-replay", userId: "user-1" },
          { chatId: "chat-replay", userId: "user-2" },
        ]),
        createMany: vi.fn().mockResolvedValue({}),
      },
      agentThread: {
        findFirst: vi.fn().mockResolvedValue({ id: "thread-replay" }),
      },
      notification: {
        findUnique: vi.fn().mockImplementation(({ where }: any) => {
          return Promise.resolve(notificationsById.get(where.id) ?? null);
        }),
      },
      agentMessage: {
        findUnique: vi.fn().mockImplementation(({ where }: any) => {
          return Promise.resolve(messagesById.get(where.id) ?? null);
        }),
      },
      auditLog: {
        findMany: vi.fn().mockImplementation(({ where }: any) => {
          const gte = where?.createdAt?.gte as Date | undefined;
          const rows = sideEffectRows.filter((row) => {
            if (where?.action && row.action !== where.action) {
              return false;
            }
            if (where?.entityType && row.entityType !== where.entityType) {
              return false;
            }
            if (gte && row.createdAt < gte) {
              return false;
            }
            return true;
          });
          return Promise.resolve(
            rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
          );
        }),
      },
    };

    const notificationsService: any = {
      createInAppNotification: vi
        .fn()
        .mockImplementation(
          (recipientUserId: string, type: NotificationType, body: string) => {
            const notification = {
              id: `notification-${++notificationCounter}`,
              recipientUserId,
              type,
              body,
            };
            notificationsById.set(notification.id, notification);
            return Promise.resolve(notification);
          },
        ),
    };
    const agentService: any = {
      createAgentMessage: vi
        .fn()
        .mockImplementation((threadId: string, content: string) => {
          const message = {
            id: `agent-message-${++messageCounter}`,
            threadId,
            content,
          };
          messagesById.set(message.id, message);
          return Promise.resolve(message);
        }),
    };
    const workflowRuntimeService: any = {
      buildWorkflowRunId: vi
        .fn()
        .mockReturnValue("social:intent_request:req-replay"),
      startRun: vi.fn().mockResolvedValue(undefined),
      checkpoint: vi.fn().mockResolvedValue(undefined),
      linkSideEffect: vi.fn().mockImplementation((input: any) => {
        sideEffectRows.push({
          action: "agent.workflow_side_effect_linked",
          entityType: input.entityType,
          entityId: input.entityId,
          createdAt: new Date(),
          metadata: {
            workflowRunId: input.workflowRunId,
            relation: input.relation,
            ...(input.metadata ?? {}),
          },
        });
        return Promise.resolve(undefined);
      }),
    };

    const service = new ConnectionSetupService(
      prisma,
      {} as any,
      {
        createChat: vi.fn(),
        createMessage: vi.fn(),
        createSystemMessage: vi.fn(),
      } as any,
      notificationsService,
      {
        recordBehaviorSignal: vi.fn().mockResolvedValue({}),
        storeInteractionSummary: vi.fn().mockResolvedValue({}),
      } as any,
      {
        upsertConversationSummaryEmbedding: vi.fn().mockResolvedValue({}),
      } as any,
      agentService,
      {
        recordGroupFormationStalled: vi.fn().mockResolvedValue(undefined),
      } as any,
      undefined,
      undefined,
      undefined,
      workflowRuntimeService,
    );

    await service.setupFromAcceptedRequest("req-replay", "trace-1");
    await service.setupFromAcceptedRequest("req-replay", "trace-2");

    expect(notificationsService.createInAppNotification).toHaveBeenCalledTimes(
      2,
    );
    expect(agentService.createAgentMessage).toHaveBeenCalledTimes(1);

    const dedupedSideEffects = workflowRuntimeService.linkSideEffect.mock.calls
      .map(([input]: [any]) => input)
      .filter((input: any) => input?.metadata?.deduped === true);

    expect(
      dedupedSideEffects.some(
        (input: any) => input.relation === "connection_sender_notification",
      ),
    ).toBe(true);
    expect(
      dedupedSideEffects.some(
        (input: any) => input.relation === "connection_recipient_notification",
      ),
    ).toBe(true);
    expect(
      dedupedSideEffects.some(
        (input: any) => input.relation === "connection_sender_thread_message",
      ),
    ).toBe(true);
  });

  it("records a blocked workflow checkpoint when group formation is disabled", async () => {
    const workflowRuntimeService: any = {
      buildWorkflowRunId: vi
        .fn()
        .mockReturnValue("social:intent_request:req-blocked"),
      startRun: vi.fn().mockResolvedValue(undefined),
      checkpoint: vi.fn().mockResolvedValue(undefined),
    };
    const launchControlsService: any = {
      assertActionAllowed: vi
        .fn()
        .mockRejectedValue(new Error("group_formation_disabled")),
    };
    const prisma: any = {
      intentRequest: {
        findUnique: vi.fn().mockResolvedValue({
          id: "req-blocked",
          status: "accepted",
          intentId: "intent-blocked",
          senderUserId: "user-1",
          recipientUserId: "user-2",
        }),
        findMany: vi.fn().mockResolvedValue([{ recipientUserId: "user-2" }]),
      },
      intent: {
        findUnique: vi.fn().mockResolvedValue({
          id: "intent-blocked",
          parsedIntent: { intentType: "group", groupSizeTarget: 3 },
          createdAt: new Date(),
        }),
      },
    };

    const service = new ConnectionSetupService(
      prisma,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      launchControlsService,
      undefined,
      undefined,
      workflowRuntimeService,
    );

    const result = await service.setupFromAcceptedRequest(
      "req-blocked",
      "trace-blocked",
    );

    expect(result).toEqual(
      expect.objectContaining({
        status: "skipped",
        reason: "group_formation_disabled",
      }),
    );
    expect(workflowRuntimeService.startRun).toHaveBeenCalledTimes(1);
    expect(workflowRuntimeService.checkpoint).toHaveBeenCalledWith(
      expect.objectContaining({
        workflowRunId: "social:intent_request:req-blocked",
        traceId: "trace-blocked",
        stage: "connection_setup",
        status: "blocked",
      }),
    );
  });

  it("records a failed workflow checkpoint when runtime setup errors", async () => {
    const workflowRuntimeService: any = {
      buildWorkflowRunId: vi
        .fn()
        .mockReturnValue("social:intent_request:req-failed"),
      startRun: vi.fn().mockResolvedValue(undefined),
      checkpoint: vi.fn().mockResolvedValue(undefined),
    };
    const prisma: any = {
      intentRequest: {
        findUnique: vi.fn().mockResolvedValue({
          id: "req-failed",
          status: "accepted",
          intentId: "intent-missing",
          senderUserId: "user-1",
          recipientUserId: "user-2",
        }),
      },
      intent: {
        findUnique: vi.fn().mockResolvedValue(null),
      },
    };

    const service = new ConnectionSetupService(
      prisma,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      undefined,
      undefined,
      undefined,
      workflowRuntimeService,
    );

    await expect(
      service.setupFromAcceptedRequest("req-failed", "trace-failed"),
    ).rejects.toThrow("intent not found");

    expect(workflowRuntimeService.startRun).toHaveBeenCalledTimes(1);
    expect(workflowRuntimeService.checkpoint).toHaveBeenCalledWith(
      expect.objectContaining({
        workflowRunId: "social:intent_request:req-failed",
        traceId: "trace-failed",
        stage: "connection_setup",
        status: "failed",
        metadata: expect.objectContaining({
          reason: "intent not found",
        }),
      }),
    );
  });
});
