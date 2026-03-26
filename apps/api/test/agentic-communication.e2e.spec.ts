import { describe, expect, it, vi } from "vitest";
import { ConnectionsService } from "../src/connections/connections.service.js";
import { ConnectionSetupService } from "../src/connections/connection-setup.service.js";
import { InboxService } from "../src/inbox/inbox.service.js";
import { IntentsService } from "../src/intents/intents.service.js";
import { ConnectionSetupConsumer } from "../src/jobs/processors/connection-setup.consumer.js";
import { AsyncAgentFollowupConsumer } from "../src/jobs/processors/async-agent-followup.consumer.js";

const IDS = {
  userA: "11111111-1111-4111-8111-111111111111",
  userB: "22222222-2222-4222-8222-222222222222",
  threadA: "33333333-3333-4333-8333-333333333333",
  intentA: "44444444-4444-4444-8444-444444444444",
  requestA: "55555555-5555-4555-8555-555555555555",
  connectionA: "66666666-6666-4666-8666-666666666666",
  chatA: "77777777-7777-4777-8777-777777777777",
};

function createStatefulPrisma() {
  const state = {
    intents: [
      {
        id: IDS.intentA,
        userId: IDS.userA,
        rawText: "",
        status: "draft",
        safetyState: "clean",
        parsedIntent: {},
        confidence: 0.4,
        createdAt: new Date("2026-03-20T10:00:00.000Z"),
        updatedAt: new Date("2026-03-20T10:00:00.000Z"),
      },
    ] as Array<Record<string, any>>,
    intentCandidates: [] as Array<Record<string, any>>,
    intentRequests: [] as Array<Record<string, any>>,
    connections: [] as Array<Record<string, any>>,
    connectionParticipants: [] as Array<Record<string, any>>,
    chats: [] as Array<Record<string, any>>,
    chatMemberships: [] as Array<Record<string, any>>,
    auditLogs: [] as Array<Record<string, any>>,
    threads: [
      {
        id: IDS.threadA,
        userId: IDS.userA,
        createdAt: new Date("2026-03-20T09:59:00.000Z"),
      },
    ] as Array<Record<string, any>>,
    notifications: [] as Array<Record<string, any>>,
  };

  const prisma: any = {
    intent: {
      create: vi.fn().mockImplementation(async ({ data }: any) => {
        const created = {
          id: IDS.intentA,
          safetyState: "clean",
          createdAt: new Date("2026-03-20T10:00:00.000Z"),
          updatedAt: new Date("2026-03-20T10:00:00.000Z"),
          ...data,
        };
        state.intents = [created];
        return created;
      }),
      findUnique: vi.fn().mockImplementation(async ({ where }: any) => {
        return state.intents.find((intent) => intent.id === where.id) ?? null;
      }),
      update: vi.fn().mockImplementation(async ({ where, data }: any) => {
        const intent = state.intents.find((row) => row.id === where.id);
        if (!intent) {
          throw new Error("intent not found");
        }
        Object.assign(intent, data, { updatedAt: new Date() });
        return intent;
      }),
      findMany: vi.fn().mockResolvedValue([]),
    },
    intentCandidate: {
      create: vi.fn().mockImplementation(async ({ data }: any) => {
        const created = {
          id: `candidate-${state.intentCandidates.length + 1}`,
          createdAt: new Date(),
          ...data,
        };
        state.intentCandidates.push(created);
        return created;
      }),
    },
    intentRequest: {
      createMany: vi.fn().mockImplementation(async ({ data }: any) => {
        for (const row of data) {
          state.intentRequests.push({
            id: IDS.requestA,
            status: "pending",
            sentAt: new Date(),
            respondedAt: null,
            wave: 1,
            ...row,
          });
        }
        return { count: data.length };
      }),
      findMany: vi.fn().mockImplementation(async ({ where }: any) => {
        return state.intentRequests.filter((request) => {
          if (
            typeof where?.intentId === "string" &&
            request.intentId !== where.intentId
          ) {
            return false;
          }
          if (
            typeof where?.status === "string" &&
            request.status !== where.status
          ) {
            return false;
          }
          return true;
        });
      }),
      findUnique: vi.fn().mockImplementation(async ({ where }: any) => {
        return (
          state.intentRequests.find((request) => request.id === where.id) ??
          null
        );
      }),
      update: vi.fn().mockImplementation(async ({ where, data }: any) => {
        const request = state.intentRequests.find((row) => row.id === where.id);
        if (!request) {
          throw new Error("request not found");
        }
        Object.assign(request, data);
        return request;
      }),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      count: vi.fn().mockImplementation(async ({ where }: any) => {
        return state.intentRequests.filter((request) => {
          if (
            typeof where?.senderUserId === "string" &&
            request.senderUserId !== where.senderUserId
          ) {
            return false;
          }
          if (
            typeof where?.status === "string" &&
            request.status !== where.status
          ) {
            return false;
          }
          if (where?.sentAt?.gte && request.sentAt < where.sentAt.gte) {
            return false;
          }
          return true;
        }).length;
      }),
    },
    agentThread: {
      findFirst: vi.fn().mockImplementation(async ({ where }: any) => {
        return (
          state.threads.find((thread) => thread.userId === where.userId) ?? null
        );
      }),
    },
    auditLog: {
      count: vi.fn().mockImplementation(async ({ where }: any) => {
        return state.auditLogs.filter(
          (row) =>
            row.entityType === where.entityType &&
            row.entityId === where.entityId &&
            row.action === where.action,
        ).length;
      }),
      create: vi.fn().mockImplementation(async ({ data }: any) => {
        state.auditLogs.push({
          id: `audit-${state.auditLogs.length + 1}`,
          createdAt: new Date(),
          ...data,
        });
        return {};
      }),
    },
    connection: {
      findFirst: vi.fn().mockImplementation(async ({ where }: any) => {
        return (
          state.connections.find((connection) => {
            if (
              typeof where?.originIntentId === "string" &&
              connection.originIntentId !== where.originIntentId
            ) {
              return false;
            }
            if (
              typeof where?.type === "string" &&
              connection.type !== where.type
            ) {
              return false;
            }
            if (where?.participants?.some?.userId) {
              const userId = where.participants.some.userId;
              return state.connectionParticipants.some(
                (participant) =>
                  participant.connectionId === connection.id &&
                  participant.userId === userId,
              );
            }
            return true;
          }) ?? null
        );
      }),
      create: vi.fn().mockImplementation(async ({ data }: any) => {
        const created = {
          id: IDS.connectionA,
          status: "active",
          createdAt: new Date(),
          ...data,
        };
        state.connections.push(created);
        return created;
      }),
    },
    connectionParticipant: {
      findMany: vi.fn().mockImplementation(async ({ where }: any) => {
        return state.connectionParticipants.filter((participant) => {
          if (
            typeof where?.connectionId === "string" &&
            participant.connectionId !== where.connectionId
          ) {
            return false;
          }
          if (
            where?.leftAt === null &&
            participant.leftAt !== null &&
            participant.leftAt !== undefined
          ) {
            return false;
          }
          return true;
        });
      }),
      createMany: vi.fn().mockImplementation(async ({ data }: any) => {
        for (const row of data) {
          state.connectionParticipants.push({
            leftAt: null,
            ...row,
          });
        }
        return { count: data.length };
      }),
      count: vi.fn().mockResolvedValue(2),
    },
    chat: {
      findFirst: vi.fn().mockImplementation(async ({ where }: any) => {
        return (
          state.chats.find(
            (chat) =>
              chat.connectionId === where.connectionId &&
              chat.type === where.type,
          ) ?? null
        );
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
    notification: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
    $transaction: vi
      .fn()
      .mockImplementation(async (operations: Array<Promise<unknown>>) =>
        Promise.all(operations),
      ),
  };

  return { state, prisma };
}

describe("Agentic communication E2E flow", () => {
  it("runs agent-thread intent flow through fanout, followup, acceptance, and chat setup", async () => {
    const { state, prisma } = createStatefulPrisma();
    const agentMessages: Array<{
      role: "user" | "agent" | "workflow";
      threadId: string;
      content: string;
    }> = [];
    const queuedIntentJobs: Array<Record<string, unknown>> = [];
    const queuedNotificationJobs: Array<Record<string, unknown>> = [];
    const queuedConnectionJobs: Array<Record<string, unknown>> = [];

    const notificationsService: any = {
      createInAppNotification: vi
        .fn()
        .mockImplementation(
          async (recipientUserId: string, type: string, body: string) => {
            state.notifications.push({
              id: `notification-${state.notifications.length + 1}`,
              recipientUserId,
              type,
              body,
            });
            return {};
          },
        ),
    };

    const agentService: any = {
      createUserMessage: vi
        .fn()
        .mockImplementation(async (threadId: string, content: string) => {
          agentMessages.push({
            role: "user",
            threadId,
            content,
          });
          return { id: `agent-message-${agentMessages.length}` };
        }),
      createAgentMessage: vi
        .fn()
        .mockImplementation(async (threadId: string, content: string) => {
          agentMessages.push({
            role: "agent",
            threadId,
            content,
          });
          return { id: `agent-message-${agentMessages.length}` };
        }),
      appendWorkflowUpdate: vi
        .fn()
        .mockImplementation(async (threadId: string, content: string) => {
          agentMessages.push({
            role: "workflow",
            threadId,
            content,
          });
          return { id: `agent-message-${agentMessages.length}` };
        }),
    };

    const matchingService: any = {
      retrieveCandidates: vi.fn().mockResolvedValue([
        {
          userId: IDS.userB,
          score: 0.92,
          rationale: {
            semanticSimilarity: 0.88,
            lexicalOverlap: 0.61,
            availabilityScore: 0.77,
            trustScoreNormalized: 0.73,
            noveltyScore: 0.54,
            proximityScore: 0.12,
            styleScore: 0.67,
            personalizationScore: 0.59,
          },
        },
      ]),
      upsertIntentEmbedding: vi.fn().mockResolvedValue({}),
      upsertConversationSummaryEmbedding: vi.fn().mockResolvedValue({}),
    };

    const personalizationService: any = {
      recordIntentSignals: vi.fn().mockResolvedValue({ signalCount: 1 }),
      recordBehaviorSignal: vi.fn().mockResolvedValue({}),
      storeInteractionSummary: vi.fn().mockResolvedValue({}),
    };

    const launchControlsService: any = {
      getSnapshot: vi.fn().mockResolvedValue({
        globalKillSwitch: false,
        inviteOnlyMode: false,
        alphaCohortUserIds: [],
        enableNewIntents: true,
        enableAgentFollowups: true,
        enableGroupFormation: true,
        enablePushNotifications: true,
        enablePersonalization: true,
        enableDiscovery: true,
        enableModerationStrictness: false,
        enableAiParsing: true,
        enableRealtimeChat: true,
      }),
    };

    const intentQueue: any = {
      add: vi
        .fn()
        .mockImplementation(
          async (name: string, data: Record<string, unknown>) => {
            queuedIntentJobs.push({ name, data });
            return {};
          },
        ),
    };
    const notificationQueue: any = {
      add: vi
        .fn()
        .mockImplementation(
          async (name: string, data: Record<string, unknown>) => {
            queuedNotificationJobs.push({ name, data });
            return {};
          },
        ),
    };
    const connectionSetupQueue: any = {
      add: vi
        .fn()
        .mockImplementation(
          async (name: string, data: Record<string, unknown>) => {
            queuedConnectionJobs.push({ name, data });
            return {};
          },
        ),
    };

    const chatsService: any = {
      createChat: vi
        .fn()
        .mockImplementation(async (connectionId: string, type: string) => {
          const created = {
            id: IDS.chatA,
            connectionId,
            type,
          };
          state.chats.push(created);
          return created;
        }),
      createMessage: vi.fn().mockResolvedValue({ id: "chat-system-seed" }),
      createSystemMessage: vi.fn().mockResolvedValue({}),
    };

    const deadLetterService: any = {
      captureFailedJob: vi.fn().mockResolvedValue({}),
      captureStalledJob: vi.fn().mockResolvedValue({}),
    };

    const intentsService = new IntentsService(
      prisma,
      matchingService,
      notificationsService,
      personalizationService,
      agentService,
      intentQueue,
      notificationQueue,
      undefined,
      launchControlsService,
    );
    vi.spyOn((intentsService as any).openai, "parseIntent").mockResolvedValue({
      intentType: "chat",
      urgency: "now",
      modality: "either",
      topics: ["tennis", "board games"],
      activities: ["play"],
      timingConstraints: ["tonight"],
      skillConstraints: [],
      vibeConstraints: ["chill"],
      confidence: 0.89,
      requiresFollowUp: false,
      rawText: "Let us play tennis tonight",
      version: 1,
    });

    const connectionsService = new ConnectionsService(prisma);
    const inboxService = new InboxService(
      prisma,
      notificationsService,
      personalizationService,
      {
        recordRequestOutcome: vi.fn().mockResolvedValue(undefined),
      } as any,
      connectionSetupQueue,
    );
    const connectionSetupService = new ConnectionSetupService(
      prisma,
      connectionsService,
      chatsService,
      notificationsService,
      personalizationService,
      matchingService,
      agentService,
      {
        recordGroupFormationStalled: vi.fn().mockResolvedValue(undefined),
      } as any,
      launchControlsService,
    );
    const connectionSetupConsumer = new ConnectionSetupConsumer(
      connectionSetupService,
      deadLetterService,
    );
    const asyncFollowupConsumer = new AsyncAgentFollowupConsumer(
      prisma,
      agentService,
      notificationsService,
      {
        recordIntentTerminalState: vi.fn().mockResolvedValue(undefined),
      } as any,
      deadLetterService,
    );

    const createFromAgent = await intentsService.createIntentFromAgentMessage(
      IDS.threadA,
      IDS.userA,
      "Find me one tennis partner tonight",
    );
    expect(createFromAgent.intentId).toBe(IDS.intentA);
    expect(agentMessages[0]).toMatchObject({
      role: "user",
      threadId: IDS.threadA,
      content: "Find me one tennis partner tonight",
    });
    expect(agentMessages[1]?.content).toContain("I’ll notify you");

    const pipeline = await intentsService.processIntentPipeline(
      IDS.intentA,
      "88888888-8888-4888-8888-888888888888",
    );
    expect(pipeline.fanoutCount).toBe(1);
    expect(state.intentRequests).toHaveLength(1);
    const createdRequestId = state.intentRequests[0]?.id;
    expect(createdRequestId).toEqual(expect.any(String));
    expect(state.intentRequests[0]).toMatchObject({
      senderUserId: IDS.userA,
      recipientUserId: IDS.userB,
      status: "pending",
    });
    expect(agentMessages.some((message) => message.role === "workflow")).toBe(
      true,
    );

    const followupJob = queuedNotificationJobs.find(
      (job) => job.name === "AsyncAgentFollowup",
    );
    expect(followupJob).toBeDefined();
    await asyncFollowupConsumer.process({
      id: "job-followup",
      name: "AsyncAgentFollowup",
      data: followupJob?.data,
    } as any);
    expect(
      agentMessages.some((message) =>
        message.content.toLowerCase().includes("still in progress"),
      ),
    ).toBe(true);

    const updateResult = await inboxService.updateStatus(
      createdRequestId,
      "accepted",
      IDS.userB,
    );
    expect(updateResult.queued).toBe(true);
    const requestAcceptedJob = queuedConnectionJobs.find(
      (job) => job.name === "RequestAccepted",
    );
    expect(requestAcceptedJob).toBeDefined();

    await connectionSetupConsumer.process({
      id: "job-request-accepted",
      name: "RequestAccepted",
      data: requestAcceptedJob?.data,
    } as any);

    expect(state.intents[0]?.status).toBe("connected");
    expect(state.connections).toHaveLength(1);
    expect(state.chats).toHaveLength(1);
    expect(state.chatMemberships).toEqual(
      expect.arrayContaining([
        { chatId: IDS.chatA, userId: IDS.userA },
        { chatId: IDS.chatA, userId: IDS.userB },
      ]),
    );
    expect(
      agentMessages.some((message) =>
        message.content.includes("Great news: someone accepted"),
      ),
    ).toBe(true);
    expect(
      state.notifications.some(
        (notification) =>
          notification.recipientUserId === IDS.userA &&
          notification.type === "request_accepted",
      ),
    ).toBe(true);
  });
});
