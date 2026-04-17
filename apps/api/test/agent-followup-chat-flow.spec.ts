import { describe, expect, it, vi } from "vitest";
import { ConnectionSetupService } from "../src/connections/connection-setup.service.js";
import { InboxService } from "../src/inbox/inbox.service.js";
import { AsyncAgentFollowupConsumer } from "../src/jobs/processors/async-agent-followup.consumer.js";
import { ConnectionSetupConsumer } from "../src/jobs/processors/connection-setup.consumer.js";

describe("Agent thread async-followup to chat creation flow", () => {
  it("writes async follow-up and then creates chat after request acceptance", async () => {
    const state = {
      intent: {
        id: "33333333-3333-4333-8333-333333333333",
        userId: "11111111-1111-4111-8111-111111111111",
        rawText: "Need tennis now",
        status: "fanout",
        parsedIntent: { intentType: "chat", groupSizeTarget: 2 },
        createdAt: new Date("2026-03-20T00:00:00.000Z"),
      },
      request: {
        id: "44444444-4444-4444-8444-444444444444",
        intentId: "33333333-3333-4333-8333-333333333333",
        senderUserId: "11111111-1111-4111-8111-111111111111",
        recipientUserId: "22222222-2222-4222-8222-222222222222",
        status: "pending",
        wave: 1,
        sentAt: new Date("2026-03-20T00:00:00.000Z"),
        expiresAt: new Date("2026-03-20T00:20:00.000Z"),
      },
      thread: {
        id: "55555555-5555-4555-8555-555555555555",
        userId: "11111111-1111-4111-8111-111111111111",
      },
      connection: null as {
        id: string;
        type: "dm" | "group";
        originIntentId: string;
      } | null,
      participants: [] as Array<{
        connectionId: string;
        userId: string;
        role: "owner" | "member";
      }>,
      chat: null as {
        id: string;
        connectionId: string;
        type: "dm" | "group";
      } | null,
      chatMemberships: [] as Array<{ chatId: string; userId: string }>,
      agentMessages: [] as Array<{ threadId: string; content: string }>,
      notifications: [] as Array<{
        userId: string;
        type: string;
        content: string;
      }>,
      queuedRequestAcceptedEnvelope: null as Record<string, unknown> | null,
    };

    const prisma: any = {
      intent: {
        findUnique: vi.fn().mockImplementation(async ({ where }: any) => {
          return where.id === state.intent.id ? state.intent : null;
        }),
        update: vi.fn().mockImplementation(async ({ where, data }: any) => {
          if (where.id !== state.intent.id) {
            throw new Error("intent not found");
          }
          state.intent = {
            ...state.intent,
            ...data,
          };
          return state.intent;
        }),
      },
      intentRequest: {
        findUnique: vi.fn().mockImplementation(async ({ where }: any) => {
          return where.id === state.request.id ? state.request : null;
        }),
        findMany: vi.fn().mockImplementation(async ({ where }: any) => {
          if (where.intentId !== state.intent.id) {
            return [];
          }
          return [{ ...state.request }];
        }),
        update: vi.fn().mockImplementation(async ({ where, data }: any) => {
          if (where.id !== state.request.id) {
            throw new Error("request not found");
          }
          state.request = {
            ...state.request,
            ...data,
          };
          return state.request;
        }),
      },
      connection: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
      connectionParticipant: {
        findMany: vi.fn().mockImplementation(async ({ where }: any) => {
          return state.participants.filter(
            (participant) => participant.connectionId === where.connectionId,
          );
        }),
        createMany: vi.fn().mockImplementation(async ({ data }: any) => {
          state.participants.push(...data);
          return { count: data.length };
        }),
      },
      chat: {
        findFirst: vi.fn().mockImplementation(async ({ where }: any) => {
          if (
            state.chat &&
            state.chat.connectionId === where.connectionId &&
            state.chat.type === where.type
          ) {
            return state.chat;
          }
          return null;
        }),
      },
      chatMembership: {
        findMany: vi.fn().mockImplementation(async ({ where }: any) => {
          return state.chatMemberships.filter(
            (membership) => membership.chatId === where.chatId,
          );
        }),
        createMany: vi.fn().mockImplementation(async ({ data }: any) => {
          state.chatMemberships.push(...data);
          return { count: data.length };
        }),
      },
      agentThread: {
        findFirst: vi.fn().mockResolvedValue(state.thread),
      },
      notification: {
        findUnique: vi.fn(),
      },
      auditLog: {
        create: vi.fn().mockResolvedValue({}),
      },
    };

    const queue: any = {
      add: vi
        .fn()
        .mockImplementation(
          async (_name: string, envelope: Record<string, unknown>) => {
            state.queuedRequestAcceptedEnvelope = envelope;
            return {};
          },
        ),
    };

    const notificationsService: any = {
      createInAppNotification: vi
        .fn()
        .mockImplementation(
          async (userId: string, type: string, content: string) => {
            state.notifications.push({ userId, type, content });
            return {};
          },
        ),
    };

    const agentService: any = {
      createAgentMessage: vi
        .fn()
        .mockImplementation(async (threadId: string, content: string) => {
          state.agentMessages.push({ threadId, content });
          return {
            id: `agent-message-${state.agentMessages.length}`,
          };
        }),
    };

    const personalizationService: any = {
      recordBehaviorSignal: vi.fn().mockResolvedValue({}),
      storeInteractionSummary: vi.fn().mockResolvedValue({}),
    };

    const matchingService: any = {
      upsertConversationSummaryEmbedding: vi.fn().mockResolvedValue({}),
    };

    const connectionsService: any = {
      createConnection: vi
        .fn()
        .mockImplementation(
          async (
            type: "dm" | "group",
            _creatorUserId: string,
            intentId: string,
          ) => {
            state.connection = {
              id: "66666666-6666-4666-8666-666666666666",
              type,
              originIntentId: intentId,
            };
            return state.connection;
          },
        ),
    };

    const chatsService: any = {
      createChat: vi
        .fn()
        .mockImplementation(
          async (connectionId: string, type: "dm" | "group") => {
            state.chat = {
              id: "77777777-7777-4777-8777-777777777777",
              connectionId,
              type,
            };
            return state.chat;
          },
        ),
      createMessage: vi.fn().mockResolvedValue({}),
      createSystemMessage: vi.fn().mockResolvedValue({}),
    };

    const deadLetterService: any = {
      captureFailedJob: vi.fn().mockResolvedValue({}),
      captureStalledJob: vi.fn().mockResolvedValue({}),
    };
    const executionReconciliationService: any = {
      recordIntentTerminalState: vi.fn().mockResolvedValue(undefined),
      recordRequestOutcome: vi.fn().mockResolvedValue(undefined),
      recordGroupFormationStalled: vi.fn().mockResolvedValue(undefined),
    };

    const asyncFollowupConsumer = new AsyncAgentFollowupConsumer(
      prisma,
      agentService,
      notificationsService,
      executionReconciliationService,
      deadLetterService,
    );
    const inboxService = new InboxService(
      prisma,
      notificationsService,
      personalizationService,
      executionReconciliationService,
      queue,
    );
    const connectionSetupService = new ConnectionSetupService(
      prisma,
      connectionsService,
      chatsService,
      notificationsService,
      personalizationService,
      matchingService,
      executionReconciliationService,
      undefined,
      undefined,
      undefined,
      undefined,
      { get: vi.fn().mockReturnValue(agentService) } as any,
    );
    const connectionSetupConsumer = new ConnectionSetupConsumer(
      connectionSetupService,
      deadLetterService,
    );

    await asyncFollowupConsumer.process({
      id: "job-followup",
      name: "AsyncAgentFollowup",
      data: {
        version: 1,
        traceId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        idempotencyKey:
          "intent-followup:33333333-3333-4333-8333-333333333333:pending_reminder",
        timestamp: "2026-03-20T00:01:00.000Z",
        type: "AsyncAgentFollowup",
        payload: {
          userId: state.intent.userId,
          intentId: state.intent.id,
          template: "pending_reminder",
        },
      },
    } as any);

    expect(state.agentMessages).toHaveLength(1);
    expect(state.agentMessages[0]?.content).toMatch(
      /pending invite|still active|widen timing|widen one constraint/i,
    );

    const updateResult = await inboxService.updateStatus(
      state.request.id,
      "accepted",
    );
    expect(updateResult.queued).toBe(true);
    expect(state.queuedRequestAcceptedEnvelope).toEqual(
      expect.objectContaining({
        type: "RequestAccepted",
        payload: expect.objectContaining({
          requestId: state.request.id,
          intentId: state.intent.id,
        }),
      }),
    );

    await connectionSetupConsumer.process({
      id: "job-request-accepted",
      name: "RequestAccepted",
      data: state.queuedRequestAcceptedEnvelope,
    } as any);

    expect(state.intent.status).toBe("connected");
    expect(state.connection).toEqual(
      expect.objectContaining({
        id: "66666666-6666-4666-8666-666666666666",
        type: "dm",
        originIntentId: state.intent.id,
      }),
    );
    expect(state.chat).toEqual(
      expect.objectContaining({
        id: "77777777-7777-4777-8777-777777777777",
        connectionId: "66666666-6666-4666-8666-666666666666",
        type: "dm",
      }),
    );
    expect(state.chatMemberships).toEqual(
      expect.arrayContaining([
        {
          chatId: "77777777-7777-4777-8777-777777777777",
          userId: "11111111-1111-4111-8111-111111111111",
        },
        {
          chatId: "77777777-7777-4777-8777-777777777777",
          userId: "22222222-2222-4222-8222-222222222222",
        },
      ]),
    );
    expect(state.agentMessages).toHaveLength(2);
    expect(state.agentMessages[1]?.content).toContain(
      "Great news: someone accepted. I opened your chat.",
    );
    expect(
      state.notifications.some(
        (notification) =>
          notification.userId === "11111111-1111-4111-8111-111111111111" &&
          notification.type === "request_accepted",
      ),
    ).toBe(true);
  });
});
