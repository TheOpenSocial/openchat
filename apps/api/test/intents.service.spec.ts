import { NotificationType } from "@opensocial/types";
import { describe, expect, it, vi } from "vitest";
import { IntentsService } from "../src/intents/intents.service.js";

function createIntentsService(
  overrides: {
    prisma?: any;
    matchingService?: any;
    notificationsService?: any;
    personalizationService?: any;
    agentService?: any;
    intentQueue?: any;
    notificationQueue?: any;
    launchControlsService?: any;
    realtimeEventsService?: any;
    workflowRuntimeService?: any;
  } = {},
) {
  const prisma: any =
    overrides.prisma ??
    ({
      intent: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      intentCandidate: { create: vi.fn(), findMany: vi.fn() },
      intentRequest: {
        createMany: vi.fn(),
        findMany: vi.fn(),
        updateMany: vi.fn(),
        count: vi.fn().mockResolvedValue(0),
      },
      agentThread: {
        findFirst: vi.fn(),
      },
      auditLog: {
        count: vi.fn().mockResolvedValue(0),
        create: vi.fn().mockResolvedValue({}),
      },
      $transaction: vi.fn().mockResolvedValue([]),
    } as any);

  const matchingService: any =
    overrides.matchingService ??
    ({
      retrieveCandidates: vi.fn().mockResolvedValue([]),
      upsertIntentEmbedding: vi.fn().mockResolvedValue({}),
    } as any);

  const notificationsService: any =
    overrides.notificationsService ??
    ({
      createInAppNotification: vi.fn().mockResolvedValue({}),
    } as any);

  const personalizationService: any =
    overrides.personalizationService ??
    ({
      recordIntentSignals: vi.fn().mockResolvedValue({ signalCount: 0 }),
      recordBehaviorSignal: vi.fn().mockResolvedValue({}),
    } as any);

  const agentService: any =
    overrides.agentService ??
    ({
      createUserMessage: vi.fn().mockResolvedValue({}),
      createAgentMessage: vi.fn().mockResolvedValue({}),
      appendWorkflowUpdate: vi.fn().mockResolvedValue({}),
    } as any);

  const intentQueue: any =
    overrides.intentQueue ?? ({ add: vi.fn().mockResolvedValue({}) } as any);

  const notificationQueue: any =
    overrides.notificationQueue ??
    ({ add: vi.fn().mockResolvedValue({}) } as any);

  const launchControlsService: any =
    overrides.launchControlsService ??
    ({
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
        generatedAt: new Date().toISOString(),
      }),
    } as any);

  const realtimeEventsService: any =
    overrides.realtimeEventsService ??
    ({
      emitIntentUpdated: vi.fn(),
      emitRequestCreated: vi.fn(),
      emitRequestUpdated: vi.fn(),
    } as any);

  const workflowRuntimeService: any =
    overrides.workflowRuntimeService ??
    ({
      buildWorkflowRunId: vi.fn(
        (input: any) => `${input.domain}:${input.entityType}:${input.entityId}`,
      ),
      startRun: vi.fn().mockResolvedValue({}),
      checkpoint: vi.fn().mockResolvedValue({}),
      linkSideEffect: vi.fn().mockResolvedValue({}),
    } as any);

  return {
    prisma,
    matchingService,
    notificationsService,
    personalizationService,
    agentService,
    intentQueue,
    notificationQueue,
    realtimeEventsService,
    workflowRuntimeService,
    service: new IntentsService(
      prisma,
      matchingService,
      notificationsService,
      personalizationService,
      agentService,
      intentQueue,
      notificationQueue,
      undefined,
      launchControlsService,
      realtimeEventsService,
      workflowRuntimeService,
    ),
  };
}

describe("IntentsService", () => {
  it("captures intent behavior signals when creating a new intent", async () => {
    const {
      service,
      prisma,
      personalizationService,
      intentQueue,
      matchingService,
      realtimeEventsService,
      workflowRuntimeService,
    } = createIntentsService({
      prisma: {
        intent: {
          create: vi.fn().mockResolvedValue({
            id: "intent-1",
            userId: "11111111-1111-4111-8111-111111111111",
            status: "parsed",
          }),
        },
      },
    });

    vi.spyOn((service as any).openai, "parseIntent").mockResolvedValue({
      intentType: "activity",
      topics: ["tennis"],
      activities: ["doubles"],
      confidence: 0.7,
    });

    const result = await service.createIntent(
      "11111111-1111-4111-8111-111111111111",
      "Find tennis doubles now",
      "trace-1",
    );

    expect(result.id).toBe("intent-1");
    expect(prisma.intent.create).toHaveBeenCalledTimes(1);
    expect(personalizationService.recordIntentSignals).toHaveBeenCalledWith(
      "11111111-1111-4111-8111-111111111111",
      expect.objectContaining({
        topics: ["tennis"],
      }),
    );
    expect(matchingService.upsertIntentEmbedding).toHaveBeenCalledWith(
      "intent-1",
    );
    expect(intentQueue.add).toHaveBeenCalledTimes(1);
    expect(realtimeEventsService.emitIntentUpdated).toHaveBeenCalledWith(
      "11111111-1111-4111-8111-111111111111",
      {
        intentId: "intent-1",
        status: "parsed",
      },
    );
    expect(workflowRuntimeService.startRun).toHaveBeenCalledWith(
      expect.objectContaining({
        workflowRunId: "social:intent:intent-1",
        entityType: "intent",
        entityId: "intent-1",
      }),
    );
    expect(workflowRuntimeService.checkpoint).toHaveBeenCalledWith(
      expect.objectContaining({
        workflowRunId: "social:intent:intent-1",
        stage: "parse",
        status: "completed",
      }),
    );
  });

  it("blocks harmful intents before fanout enqueue", async () => {
    const {
      service,
      prisma,
      notificationsService,
      intentQueue,
      personalizationService,
      matchingService,
    } = createIntentsService({
      prisma: {
        intent: {
          create: vi.fn().mockResolvedValue({
            id: "intent-blocked",
            userId: "11111111-1111-4111-8111-111111111111",
            rawText: "how to kill someone",
            status: "parsed",
            safetyState: "clean",
            parsedIntent: {},
            confidence: 0.6,
            createdAt: new Date(),
            updatedAt: new Date(),
          }),
          update: vi.fn().mockResolvedValue({
            id: "intent-blocked",
            status: "cancelled",
            safetyState: "blocked",
          }),
        },
        moderationFlag: {
          create: vi.fn().mockResolvedValue({}),
        },
        auditLog: {
          create: vi.fn().mockResolvedValue({}),
        },
      },
    });

    vi.spyOn((service as any).openai, "parseIntent").mockResolvedValue({
      intentType: "chat",
      confidence: 0.6,
    });

    const result = await service.createIntent(
      "11111111-1111-4111-8111-111111111111",
      "How to kill someone quickly",
      "trace-blocked",
      "22222222-2222-4222-8222-222222222222",
    );

    expect(result.status).toBe("cancelled");
    expect(intentQueue.add).not.toHaveBeenCalled();
    expect(personalizationService.recordIntentSignals).not.toHaveBeenCalled();
    expect(matchingService.upsertIntentEmbedding).not.toHaveBeenCalled();
    expect(notificationsService.createInAppNotification).toHaveBeenCalledWith(
      "11111111-1111-4111-8111-111111111111",
      "moderation_notice",
      expect.stringContaining("blocked"),
    );
    expect(prisma.moderationFlag.create).toHaveBeenCalledTimes(1);
  });

  it("writes moderation workflow update to latest thread when agentThreadId is omitted", async () => {
    const { service, agentService, intentQueue } = createIntentsService({
      prisma: {
        intent: {
          create: vi.fn().mockResolvedValue({
            id: "intent-blocked-fallback",
            userId: "11111111-1111-4111-8111-111111111111",
            rawText: "illegal deal tonight",
            status: "parsed",
            safetyState: "clean",
            parsedIntent: {},
            confidence: 0.6,
            createdAt: new Date(),
            updatedAt: new Date(),
          }),
          update: vi.fn().mockResolvedValue({
            id: "intent-blocked-fallback",
            status: "parsed",
            safetyState: "review",
          }),
        },
        moderationFlag: {
          create: vi.fn().mockResolvedValue({}),
        },
        auditLog: {
          create: vi.fn().mockResolvedValue({}),
        },
        agentThread: {
          findFirst: vi.fn().mockResolvedValue({ id: "thread-latest" }),
        },
      },
    });

    vi.spyOn((service as any).openai, "parseIntent").mockResolvedValue({
      intentType: "chat",
      confidence: 0.6,
    });

    await service.createIntent(
      "11111111-1111-4111-8111-111111111111",
      "Need an illegal deal tonight",
      "trace-review-thread-fallback",
    );

    expect(intentQueue.add).not.toHaveBeenCalled();
    expect(agentService.appendWorkflowUpdate).toHaveBeenCalledWith(
      "thread-latest",
      expect.stringContaining("manual safety review"),
      expect.objectContaining({
        intentId: "intent-blocked-fallback",
        moderationDecision: "review",
      }),
    );
  });

  it("routes uncertain intents to manual review path", async () => {
    const { service, prisma, notificationsService, intentQueue } =
      createIntentsService({
        prisma: {
          intent: {
            create: vi.fn().mockResolvedValue({
              id: "intent-review",
              userId: "11111111-1111-4111-8111-111111111111",
              rawText: "looking for underage meetup",
              status: "parsed",
              safetyState: "clean",
              parsedIntent: {},
              confidence: 0.6,
              createdAt: new Date(),
              updatedAt: new Date(),
            }),
            update: vi.fn().mockResolvedValue({
              id: "intent-review",
              status: "parsed",
              safetyState: "review",
            }),
          },
          moderationFlag: {
            create: vi.fn().mockResolvedValue({}),
          },
          auditLog: {
            create: vi.fn().mockResolvedValue({}),
          },
        },
      });

    vi.spyOn((service as any).openai, "parseIntent").mockResolvedValue({
      intentType: "chat",
      confidence: 0.6,
    });

    const result = await service.createIntent(
      "11111111-1111-4111-8111-111111111111",
      "Looking for underage meetup",
      "trace-review",
    );

    expect(result.safetyState).toBe("review");
    expect(intentQueue.add).not.toHaveBeenCalled();
    expect(notificationsService.createInAppNotification).toHaveBeenCalledWith(
      "11111111-1111-4111-8111-111111111111",
      "moderation_notice",
      expect.stringContaining("review"),
    );
    expect(prisma.moderationFlag.create).toHaveBeenCalledTimes(1);
  });

  it("processes fanout, sends notifications, and schedules async followup", async () => {
    const auditLogCreate = vi.fn().mockResolvedValue({});
    const {
      service,
      prisma,
      matchingService,
      notificationsService,
      agentService,
      notificationQueue,
      intentQueue,
      realtimeEventsService,
    } = createIntentsService({
      prisma: {
        intent: {
          findUnique: vi.fn().mockResolvedValue({
            id: "intent-1",
            userId: "11111111-1111-4111-8111-111111111111",
            status: "parsed",
            parsedIntent: { topics: ["ai"] },
          }),
          update: vi.fn().mockResolvedValue({}),
        },
        intentCandidate: { create: vi.fn().mockResolvedValue({}) },
        intentRequest: {
          createMany: vi.fn().mockResolvedValue({ count: 2 }),
          count: vi.fn().mockResolvedValue(0),
        },
        auditLog: {
          count: vi.fn().mockResolvedValue(1),
          create: auditLogCreate,
        },
        $transaction: vi.fn().mockResolvedValue([]),
      },
      matchingService: {
        retrieveCandidates: vi.fn().mockResolvedValue([
          {
            userId: "22222222-2222-4222-8222-222222222222",
            score: 0.9,
            rationale: { semanticOverlap: 1 },
          },
          {
            userId: "33333333-3333-4333-8333-333333333333",
            score: 0.8,
            rationale: { semanticOverlap: 1 },
          },
        ]),
      },
    });

    const result = await service.processIntentPipeline(
      "intent-1",
      "trace-1",
      "44444444-4444-4444-8444-444444444444",
    );

    expect(result.fanoutCount).toBe(2);
    expect(matchingService.retrieveCandidates).toHaveBeenCalledTimes(1);
    expect(prisma.intentCandidate.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          rationale: expect.objectContaining({
            finalScore: 0.9,
            selectedBecause: expect.any(Array),
            selectionRecordedAt: expect.any(String),
          }),
        }),
      }),
    );
    expect(prisma.intentRequest.createMany).toHaveBeenCalledTimes(1);
    expect(realtimeEventsService.emitIntentUpdated).toHaveBeenCalledWith(
      "11111111-1111-4111-8111-111111111111",
      {
        intentId: "intent-1",
        status: "fanout",
      },
    );
    expect(realtimeEventsService.emitRequestCreated).toHaveBeenCalledTimes(2);
    expect(notificationsService.createInAppNotification).toHaveBeenCalledTimes(
      2,
    );
    expect(agentService.appendWorkflowUpdate).toHaveBeenCalledTimes(1);
    expect(notificationQueue.add).toHaveBeenCalledWith(
      "AsyncAgentFollowup",
      expect.objectContaining({
        type: "AsyncAgentFollowup",
        idempotencyKey: "async-followup:intent-1:pending_reminder",
        payload: expect.objectContaining({
          notificationType: "reminder",
        }),
      }),
      expect.objectContaining({
        delay: 90_000,
      }),
    );
    expect(intentQueue.add).toHaveBeenCalledWith(
      "IntentCreated",
      expect.objectContaining({
        type: "IntentCreated",
        idempotencyKey: "intent-created:intent-1:fanout_followup",
        payload: expect.objectContaining({
          intentId: "intent-1",
        }),
      }),
      expect.objectContaining({
        jobId: "intent-created:intent-1:fanout_followup",
        delay: 180_000,
      }),
    );
    expect(auditLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "routing.attempt",
          entityType: "intent",
          entityId: "intent-1",
        }),
      }),
    );
  });

  it("uses latest agent thread for workflow updates when agentThreadId is missing", async () => {
    const {
      service,
      agentService,
      notificationQueue,
      intentQueue,
      matchingService,
    } = createIntentsService({
      prisma: {
        intent: {
          findUnique: vi.fn().mockResolvedValue({
            id: "intent-thread-fallback",
            userId: "11111111-1111-4111-8111-111111111111",
            status: "parsed",
            parsedIntent: { topics: ["ai"] },
            createdAt: new Date(),
          }),
          update: vi.fn().mockResolvedValue({}),
        },
        intentCandidate: { create: vi.fn().mockResolvedValue({}) },
        intentRequest: {
          createMany: vi.fn().mockResolvedValue({ count: 1 }),
          count: vi.fn().mockResolvedValue(0),
        },
        auditLog: {
          count: vi.fn().mockResolvedValue(0),
          create: vi.fn().mockResolvedValue({}),
        },
        agentThread: {
          findFirst: vi.fn().mockResolvedValue({ id: "thread-latest" }),
        },
        $transaction: vi.fn().mockResolvedValue([]),
      },
      matchingService: {
        retrieveCandidates: vi.fn().mockResolvedValue([
          {
            userId: "22222222-2222-4222-8222-222222222222",
            score: 0.88,
            rationale: { semanticSimilarity: 0.88 },
          },
        ]),
      },
    });

    await service.processIntentPipeline(
      "intent-thread-fallback",
      "trace-thread-fallback",
    );

    expect(matchingService.retrieveCandidates).toHaveBeenCalledTimes(1);
    expect(agentService.appendWorkflowUpdate).toHaveBeenCalledWith(
      "thread-latest",
      expect.stringContaining("sent requests"),
      expect.objectContaining({
        intentId: "intent-thread-fallback",
      }),
    );
    expect(notificationQueue.add).toHaveBeenCalledWith(
      "AsyncAgentFollowup",
      expect.objectContaining({
        payload: expect.objectContaining({
          intentId: "intent-thread-fallback",
          agentThreadId: "thread-latest",
        }),
      }),
      expect.any(Object),
    );
    expect(intentQueue.add).toHaveBeenCalledWith(
      "IntentCreated",
      expect.objectContaining({
        type: "IntentCreated",
        payload: expect.objectContaining({
          intentId: "intent-thread-fallback",
          agentThreadId: "thread-latest",
        }),
      }),
      expect.any(Object),
    );
  });

  it("skips fanout pipeline when intent is in moderation review state", async () => {
    const { service, matchingService, workflowRuntimeService } =
      createIntentsService({
        prisma: {
          intent: {
            findUnique: vi.fn().mockResolvedValue({
              id: "intent-review",
              userId: "11111111-1111-4111-8111-111111111111",
              status: "parsed",
              safetyState: "review",
              parsedIntent: { topics: ["chat"] },
              createdAt: new Date(),
            }),
          },
        },
      });

    const result = await service.processIntentPipeline(
      "intent-review",
      "trace-review",
    );

    expect(result).toEqual(
      expect.objectContaining({
        intentId: "intent-review",
        skipped: true,
        reason: "moderation_review",
      }),
    );
    expect(matchingService.retrieveCandidates).not.toHaveBeenCalled();
    expect(workflowRuntimeService.checkpoint).toHaveBeenCalledWith(
      expect.objectContaining({
        workflowRunId: "social:intent:intent-review",
        stage: "moderation",
        status: "degraded",
      }),
    );
    expect(workflowRuntimeService.checkpoint).toHaveBeenCalledWith(
      expect.objectContaining({
        workflowRunId: "social:intent:intent-review",
        stage: "routing_pipeline",
        status: "skipped",
      }),
    );
  });

  it("records skipped routing checkpoint when intent is cancelled before pipeline processing", async () => {
    const { service, matchingService, workflowRuntimeService } =
      createIntentsService({
        prisma: {
          intent: {
            findUnique: vi.fn().mockResolvedValue({
              id: "intent-cancelled",
              userId: "11111111-1111-4111-8111-111111111111",
              status: "cancelled",
              safetyState: "clean",
              parsedIntent: { topics: ["chat"] },
              createdAt: new Date(),
            }),
          },
        },
      });

    const result = await service.processIntentPipeline(
      "intent-cancelled",
      "trace-cancelled",
    );

    expect(result).toEqual(
      expect.objectContaining({
        intentId: "intent-cancelled",
        fanoutCount: 0,
        skipped: true,
      }),
    );
    expect(matchingService.retrieveCandidates).not.toHaveBeenCalled();
    expect(workflowRuntimeService.checkpoint).toHaveBeenCalledWith(
      expect.objectContaining({
        workflowRunId: "social:intent:intent-cancelled",
        stage: "routing_pipeline",
        status: "skipped",
        metadata: expect.objectContaining({
          reason: "intent_not_processable",
          status: "cancelled",
        }),
      }),
    );
  });

  it("defers fanout when sender outreach cap is exhausted", async () => {
    const intentRequestCount = vi
      .fn()
      .mockResolvedValueOnce(12)
      .mockResolvedValueOnce(30);
    const {
      service,
      prisma,
      notificationsService,
      notificationQueue,
      agentService,
      intentQueue,
    } = createIntentsService({
      prisma: {
        intent: {
          findUnique: vi.fn().mockResolvedValue({
            id: "intent-1",
            userId: "11111111-1111-4111-8111-111111111111",
            status: "parsed",
            parsedIntent: { intentType: "chat", topics: ["ai"] },
          }),
          update: vi.fn().mockResolvedValue({}),
        },
        intentCandidate: { create: vi.fn().mockResolvedValue({}) },
        intentRequest: {
          createMany: vi.fn().mockResolvedValue({ count: 0 }),
          count: intentRequestCount,
        },
        $transaction: vi.fn().mockResolvedValue([]),
      },
      matchingService: {
        retrieveCandidates: vi.fn().mockResolvedValue([
          {
            userId: "22222222-2222-4222-8222-222222222222",
            score: 0.9,
            rationale: { semanticSimilarity: 0.9 },
          },
        ]),
      },
    });

    const result = await service.processIntentPipeline(
      "intent-1",
      "trace-1",
      "44444444-4444-4444-8444-444444444444",
    );

    expect(result.fanoutCount).toBe(0);
    expect(prisma.intentRequest.createMany).not.toHaveBeenCalled();
    expect(prisma.intent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "matching" }),
      }),
    );
    expect(notificationsService.createInAppNotification).toHaveBeenCalledWith(
      "11111111-1111-4111-8111-111111111111",
      "agent_update",
      expect.stringContaining("temporarily capped"),
    );
    expect(agentService.appendWorkflowUpdate).toHaveBeenCalledWith(
      "44444444-4444-4444-8444-444444444444",
      expect.stringContaining("outreach cap"),
      expect.objectContaining({
        fanoutCap: 0,
      }),
    );
    expect(notificationQueue.add).toHaveBeenCalledWith(
      "AsyncAgentFollowup",
      expect.objectContaining({
        payload: expect.objectContaining({
          template: "progress_update",
        }),
      }),
      expect.objectContaining({
        delay: 120_000,
      }),
    );
    expect(intentQueue.add).toHaveBeenCalledWith(
      "IntentCreated",
      expect.objectContaining({
        type: "IntentCreated",
        idempotencyKey: "intent-created:intent-1:cap_reached",
        payload: expect.objectContaining({
          intentId: "intent-1",
        }),
      }),
      expect.objectContaining({
        jobId: "intent-created:intent-1:cap_reached",
        delay: 120_000,
      }),
    );
  });

  it("escalates and widens filters after timeout when no candidates are found", async () => {
    const auditLogCreate = vi.fn().mockResolvedValue({});
    const {
      service,
      prisma,
      notificationsService,
      notificationQueue,
      intentQueue,
    } = createIntentsService({
      prisma: {
        intent: {
          findUnique: vi.fn().mockResolvedValue({
            id: "intent-1",
            userId: "11111111-1111-4111-8111-111111111111",
            status: "parsed",
            createdAt: new Date(Date.now() - 20 * 60_000),
            parsedIntent: {
              intentType: "activity",
              modality: "offline",
              urgency: "now",
              topics: ["tennis"],
              activities: ["doubles"],
              timingConstraints: ["today after 7"],
              skillConstraints: ["intermediate"],
              vibeConstraints: ["chill"],
            },
          }),
          update: vi.fn().mockResolvedValue({}),
        },
        intentCandidate: { create: vi.fn().mockResolvedValue({}) },
        intentRequest: {
          createMany: vi.fn().mockResolvedValue({ count: 0 }),
          count: vi.fn().mockResolvedValue(0),
        },
        auditLog: {
          count: vi.fn().mockResolvedValue(0),
          create: auditLogCreate,
        },
        $transaction: vi.fn().mockResolvedValue([]),
      },
      matchingService: {
        retrieveCandidates: vi.fn().mockResolvedValue([]),
      },
    });

    const result = await service.processIntentPipeline(
      "intent-1",
      "trace-1",
      "44444444-4444-4444-8444-444444444444",
    );

    expect(result.fanoutCount).toBe(0);
    expect(prisma.intent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "matching",
          parsedIntent: expect.objectContaining({
            modality: "either",
            urgency: "flexible",
            topics: [],
            activities: [],
            timingConstraints: [],
            skillConstraints: [],
            vibeConstraints: [],
            routingEscalationLevel: 2,
          }),
        }),
      }),
    );
    expect(auditLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "routing.filters_widened",
          entityId: "intent-1",
        }),
      }),
    );
    expect(notificationsService.createInAppNotification).toHaveBeenCalledWith(
      "11111111-1111-4111-8111-111111111111",
      "agent_update",
      expect.stringContaining("widened"),
    );
    expect(notificationQueue.add).toHaveBeenCalledWith(
      "AsyncAgentFollowup",
      expect.objectContaining({
        payload: expect.objectContaining({
          template: "progress_update",
          message: expect.stringContaining("widened the search"),
        }),
      }),
      expect.objectContaining({
        delay: 45_000,
      }),
    );
    expect(intentQueue.add).toHaveBeenCalledWith(
      "IntentCreated",
      expect.objectContaining({
        type: "IntentCreated",
        idempotencyKey: "intent-created:intent-1:timeout_escalated",
        payload: expect.objectContaining({
          intentId: "intent-1",
        }),
      }),
      expect.objectContaining({
        jobId: "intent-created:intent-1:timeout_escalated",
        delay: 30_000,
      }),
    );
  });

  it("keeps no-candidate retry path before escalation timeout", async () => {
    const {
      service,
      prisma,
      notificationsService,
      notificationQueue,
      intentQueue,
    } = createIntentsService({
      prisma: {
        intent: {
          findUnique: vi.fn().mockResolvedValue({
            id: "intent-1",
            userId: "11111111-1111-4111-8111-111111111111",
            status: "parsed",
            createdAt: new Date(Date.now() - 2 * 60_000),
            parsedIntent: {
              intentType: "chat",
              topics: ["ai"],
            },
          }),
          update: vi.fn().mockResolvedValue({}),
        },
        intentCandidate: { create: vi.fn().mockResolvedValue({}) },
        intentRequest: {
          createMany: vi.fn().mockResolvedValue({ count: 0 }),
          count: vi.fn().mockResolvedValue(0),
        },
        $transaction: vi.fn().mockResolvedValue([]),
      },
      matchingService: {
        retrieveCandidates: vi.fn().mockResolvedValue([]),
      },
    });

    await service.processIntentPipeline(
      "intent-1",
      "trace-1",
      "44444444-4444-4444-8444-444444444444",
    );

    expect(prisma.intent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "matching",
        }),
      }),
    );
    expect(notificationsService.createInAppNotification).toHaveBeenCalledWith(
      "11111111-1111-4111-8111-111111111111",
      "agent_update",
      expect.stringContaining("Best next move"),
    );
    expect(notificationQueue.add).toHaveBeenCalledWith(
      "AsyncAgentFollowup",
      expect.objectContaining({
        payload: expect.objectContaining({
          template: "no_match_yet",
          message: expect.stringContaining("1:1 or a small group"),
        }),
      }),
      expect.objectContaining({
        delay: 60_000,
      }),
    );
    expect(intentQueue.add).toHaveBeenCalledWith(
      "IntentCreated",
      expect.objectContaining({
        type: "IntentCreated",
        idempotencyKey: "intent-created:intent-1:no_candidates",
        payload: expect.objectContaining({
          intentId: "intent-1",
        }),
      }),
      expect.objectContaining({
        jobId: "intent-created:intent-1:no_candidates",
        delay: 300_000,
      }),
    );
  });

  it("grounds no-match recovery in the ask and a concrete next action", async () => {
    const { service } = createIntentsService();

    const message = (service as any).buildNoMatchRecoveryMessage(
      {
        intentType: "social",
        topics: ["tennis"],
        timingConstraints: ["tonight"],
        modality: "offline",
        groupSizeTarget: 2,
        skillConstraints: ["intermediate"],
      },
      { includeBackground: true },
    );

    expect(message).toContain("tennis");
    expect(message).toContain("widen timing");
    expect(message).toContain("1:1 or a small group");
    expect(message).toContain("Search is still active");
  });

  it("reuses delayed retry idempotency keys across repeated no-candidate passes", async () => {
    const { service, intentQueue } = createIntentsService({
      prisma: {
        intent: {
          findUnique: vi.fn().mockResolvedValue({
            id: "intent-1",
            userId: "11111111-1111-4111-8111-111111111111",
            status: "parsed",
            createdAt: new Date(Date.now() - 3 * 60_000),
            parsedIntent: {
              intentType: "chat",
              topics: ["ai"],
            },
          }),
          update: vi.fn().mockResolvedValue({}),
        },
        intentCandidate: { create: vi.fn().mockResolvedValue({}) },
        intentRequest: {
          createMany: vi.fn().mockResolvedValue({ count: 0 }),
          count: vi.fn().mockResolvedValue(0),
        },
        $transaction: vi.fn().mockResolvedValue([]),
      },
      matchingService: {
        retrieveCandidates: vi.fn().mockResolvedValue([]),
      },
    });

    await service.processIntentPipeline(
      "intent-1",
      "trace-1",
      "44444444-4444-4444-8444-444444444444",
    );
    await service.processIntentPipeline(
      "intent-1",
      "trace-2",
      "44444444-4444-4444-8444-444444444444",
    );

    const noCandidateRetryCalls = intentQueue.add.mock.calls.filter(
      ([name, payload, options]: [string, { idempotencyKey?: string }, any]) =>
        name === "IntentCreated" &&
        payload?.idempotencyKey === "intent-created:intent-1:no_candidates" &&
        options?.jobId === "intent-created:intent-1:no_candidates",
    );

    expect(noCandidateRetryCalls).toHaveLength(2);
  });

  it("reuses existing fanout requests during replay instead of duplicating them", async () => {
    const { service, prisma, notificationsService, agentService } =
      createIntentsService({
        prisma: {
          intent: {
            findUnique: vi.fn().mockResolvedValue({
              id: "intent-1",
              userId: "11111111-1111-4111-8111-111111111111",
              status: "parsed",
              createdAt: new Date(Date.now() - 3 * 60_000),
              parsedIntent: {
                intentType: "chat",
                topics: ["ai"],
              },
            }),
            update: vi.fn().mockResolvedValue({}),
          },
          intentCandidate: { create: vi.fn().mockResolvedValue({}) },
          intentRequest: {
            createMany: vi.fn().mockResolvedValue({ count: 0 }),
            findMany: vi.fn().mockResolvedValue([
              {
                id: "request-existing",
                recipientUserId: "22222222-2222-4222-8222-222222222222",
                status: "pending",
              },
            ]),
            count: vi.fn().mockResolvedValue(0),
          },
          $transaction: vi.fn().mockResolvedValue([]),
        },
        matchingService: {
          retrieveCandidates: vi.fn().mockResolvedValue([
            {
              userId: "22222222-2222-4222-8222-222222222222",
              score: 0.92,
              rationale: {
                topicsOverlap: ["ai"],
              },
            },
          ]),
        },
      });

    await service.processIntentPipeline(
      "intent-1",
      "trace-1",
      "44444444-4444-4444-8444-444444444444",
    );

    expect(prisma.intentRequest.createMany).not.toHaveBeenCalled();
    expect(
      notificationsService.createInAppNotification,
    ).not.toHaveBeenCalledWith(
      "22222222-2222-4222-8222-222222222222",
      "request_received",
      expect.any(String),
    );
    expect(agentService.appendWorkflowUpdate).not.toHaveBeenCalled();
  });

  it("skips async followup enqueue when agent followups flag is disabled", async () => {
    const {
      service,
      notificationsService,
      notificationQueue,
      intentQueue,
      workflowRuntimeService,
    } = createIntentsService({
      prisma: {
        intent: {
          findUnique: vi.fn().mockResolvedValue({
            id: "intent-1",
            userId: "11111111-1111-4111-8111-111111111111",
            status: "parsed",
            createdAt: new Date(Date.now() - 2 * 60_000),
            parsedIntent: {
              intentType: "chat",
              topics: ["ai"],
            },
          }),
          update: vi.fn().mockResolvedValue({}),
        },
        intentCandidate: { create: vi.fn().mockResolvedValue({}) },
        intentRequest: {
          createMany: vi.fn().mockResolvedValue({ count: 0 }),
          count: vi.fn().mockResolvedValue(0),
        },
        $transaction: vi.fn().mockResolvedValue([]),
      },
      matchingService: {
        retrieveCandidates: vi.fn().mockResolvedValue([]),
      },
      launchControlsService: {
        getSnapshot: vi.fn().mockResolvedValue({
          globalKillSwitch: false,
          inviteOnlyMode: false,
          alphaCohortUserIds: [],
          enableNewIntents: true,
          enableAgentFollowups: false,
          enableGroupFormation: true,
          enablePushNotifications: true,
          enablePersonalization: true,
          enableDiscovery: true,
          enableModerationStrictness: false,
          enableAiParsing: true,
          enableRealtimeChat: true,
          generatedAt: new Date().toISOString(),
        }),
      },
    });

    await service.processIntentPipeline(
      "intent-1",
      "trace-1",
      "44444444-4444-4444-8444-444444444444",
    );

    expect(notificationsService.createInAppNotification).toHaveBeenCalledWith(
      "11111111-1111-4111-8111-111111111111",
      "agent_update",
      expect.stringContaining("Best next move"),
    );
    expect(notificationQueue.add).not.toHaveBeenCalledWith(
      "AsyncAgentFollowup",
      expect.anything(),
      expect.anything(),
    );
    expect(intentQueue.add).toHaveBeenCalledWith(
      "IntentCreated",
      expect.objectContaining({
        type: "IntentCreated",
      }),
      expect.any(Object),
    );
    expect(workflowRuntimeService.checkpoint).toHaveBeenCalledWith(
      expect.objectContaining({
        workflowRunId: "social:intent:intent-1",
        stage: "followup_enqueue",
        status: "skipped",
        metadata: expect.objectContaining({
          reason: "launch_controls_disabled",
          template: "no_match_yet",
        }),
      }),
    );
  });

  it("creates intent from agent message and appends acknowledgement", async () => {
    const { service, agentService } = createIntentsService();

    vi.spyOn(service, "createIntent").mockResolvedValue({
      id: "intent-1",
      status: "parsed",
    } as any);

    const result = await service.createIntentFromAgentMessage(
      "thread-1",
      "11111111-1111-4111-8111-111111111111",
      "Find me tennis partners tonight",
    );

    expect(result.intentId).toBe("intent-1");
    expect(agentService.createUserMessage).toHaveBeenCalledTimes(1);
    expect(agentService.createAgentMessage).toHaveBeenCalledTimes(1);
  });

  it("decomposes explicit multi-intent agent message into multiple intents", async () => {
    const { service, agentService } = createIntentsService();

    vi.spyOn(service, "createIntent")
      .mockResolvedValueOnce({
        id: "intent-1",
        status: "parsed",
      } as any)
      .mockResolvedValueOnce({
        id: "intent-2",
        status: "parsed",
      } as any);

    const result = await service.createIntentFromAgentMessage(
      "thread-1",
      "11111111-1111-4111-8111-111111111111",
      "Find tennis partners tonight; Also find a study buddy tomorrow.",
      { maxIntents: 3 },
    );

    expect(service.createIntent).toHaveBeenNthCalledWith(
      1,
      "11111111-1111-4111-8111-111111111111",
      "Find tennis partners tonight",
      expect.any(String),
      "thread-1",
      { deterministicParse: true },
    );
    expect(service.createIntent).toHaveBeenNthCalledWith(
      2,
      "11111111-1111-4111-8111-111111111111",
      "Also find a study buddy tomorrow.",
      expect.any(String),
      "thread-1",
      { deterministicParse: true },
    );
    expect(result.intentCount).toBe(2);
    expect(result.intentIds).toEqual(["intent-1", "intent-2"]);
    expect(agentService.createAgentMessage).toHaveBeenCalledWith(
      "thread-1",
      expect.stringContaining("split this into 2 focused asks"),
    );
  });

  it("can disable decomposition for agent message intent creation", async () => {
    const { service } = createIntentsService();

    vi.spyOn(service, "createIntent").mockResolvedValue({
      id: "intent-1",
      status: "parsed",
    } as any);

    const result = await service.createIntentFromAgentMessage(
      "thread-1",
      "11111111-1111-4111-8111-111111111111",
      "Find tennis partners tonight; Also find a study buddy tomorrow.",
      { allowDecomposition: false },
    );

    expect(service.createIntent).toHaveBeenCalledTimes(1);
    expect(service.createIntent).toHaveBeenCalledWith(
      "11111111-1111-4111-8111-111111111111",
      "Find tennis partners tonight; Also find a study buddy tomorrow.",
      expect.any(String),
      "thread-1",
      { deterministicParse: true },
    );
    expect(result.intentCount).toBe(1);
  });

  it("applies quota-based cap when decomposing multiple intents", async () => {
    const { service, prisma, agentService } = createIntentsService({
      prisma: {
        intentRequest: {
          count: vi.fn().mockResolvedValueOnce(11).mockResolvedValueOnce(29),
        },
      },
    });

    vi.spyOn(service, "createIntent").mockResolvedValue({
      id: "intent-1",
      status: "parsed",
    } as any);

    const result = await service.createIntentFromAgentMessage(
      "thread-1",
      "11111111-1111-4111-8111-111111111111",
      "Find tennis partners tonight; Also find startup founders to chat with; Also find a study buddy.",
      { maxIntents: 5 },
    );

    expect(prisma.intentRequest.count).toHaveBeenCalledTimes(2);
    expect(service.createIntent).toHaveBeenCalledTimes(1);
    expect(result.intentCount).toBe(1);
    expect(agentService.createAgentMessage).toHaveBeenCalledWith(
      "thread-1",
      expect.stringContaining("started working on them in the background"),
    );
  });

  it("summarizes pending intents and writes summary to thread", async () => {
    const { service, prisma, agentService } = createIntentsService({
      prisma: {
        intent: {
          findMany: vi.fn().mockResolvedValue([
            {
              id: "intent-1",
              rawText: "Find tennis players",
              status: "fanout",
              createdAt: new Date(Date.now() - 30 * 60_000),
            },
          ]),
        },
        intentRequest: {
          findMany: vi.fn().mockResolvedValue([
            { intentId: "intent-1", status: "pending" },
            { intentId: "intent-1", status: "accepted" },
          ]),
        },
      },
    });

    const result = await service.summarizePendingIntents(
      "11111111-1111-4111-8111-111111111111",
      "thread-1",
    );

    expect(result.activeIntentCount).toBe(1);
    expect(result.summaryText).toContain("1 active intent");
    expect(agentService.createAgentMessage).toHaveBeenCalledWith(
      "thread-1",
      expect.stringContaining("active intent"),
    );
    expect(prisma.intent.findMany).toHaveBeenCalledTimes(1);
  });

  it("cancels outstanding flow and notifies recipients", async () => {
    const { service, prisma, notificationsService, agentService } =
      createIntentsService({
        prisma: {
          intent: {
            findUnique: vi.fn().mockResolvedValue({
              id: "intent-1",
              userId: "11111111-1111-4111-8111-111111111111",
              status: "fanout",
            }),
            update: vi.fn().mockResolvedValue({
              id: "intent-1",
              status: "cancelled",
            }),
          },
          intentRequest: {
            findMany: vi.fn().mockResolvedValue([
              {
                id: "req-1",
                recipientUserId: "22222222-2222-4222-8222-222222222222",
              },
              {
                id: "req-2",
                recipientUserId: "33333333-3333-4333-8333-333333333333",
              },
            ]),
            updateMany: vi.fn().mockResolvedValue({ count: 2 }),
          },
          agentThread: {
            findFirst: vi.fn().mockResolvedValue({ id: "thread-latest" }),
          },
        },
      });

    const result = await service.cancelIntent("intent-1", {
      userId: "11111111-1111-4111-8111-111111111111",
    });

    expect(result.cancelledRequestCount).toBe(2);
    expect(prisma.intent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "cancelled" }),
      }),
    );
    expect(prisma.intentRequest.updateMany).toHaveBeenCalledTimes(1);
    expect(notificationsService.createInAppNotification).toHaveBeenCalledTimes(
      2,
    );
    expect(agentService.createAgentMessage).toHaveBeenCalledWith(
      "thread-latest",
      expect.stringContaining("withdrew 2 pending requests"),
    );
  });

  it("converts intent mode from one-to-one to group", async () => {
    const { service, prisma } = createIntentsService({
      prisma: {
        intent: {
          findUnique: vi.fn().mockResolvedValue({
            id: "intent-1",
            parsedIntent: { intentType: "chat", groupSizeTarget: 2 },
          }),
          update: vi.fn().mockResolvedValue({
            id: "intent-1",
            parsedIntent: { intentType: "group", groupSizeTarget: 4 },
          }),
        },
      },
    });

    const result = await service.convertIntentMode("intent-1", "group", {
      groupSizeTarget: 4,
    });

    expect((result.parsedIntent as Record<string, unknown>).intentType).toBe(
      "group",
    );
    expect(prisma.intent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          parsedIntent: expect.objectContaining({
            intentType: "group",
            groupSizeTarget: 4,
          }),
        }),
      }),
    );
  });

  it("returns safe candidate explanations for admin/debug tools", async () => {
    const { service } = createIntentsService({
      prisma: {
        intent: {
          findUnique: vi.fn().mockResolvedValue({
            id: "intent-1",
            status: "matching",
          }),
        },
        intentCandidate: {
          findMany: vi.fn().mockResolvedValue([
            {
              candidateUserId: "22222222-2222-4222-8222-222222222222",
              score: 0.91,
              createdAt: new Date("2026-03-19T15:00:00.000Z"),
              rationale: {
                retrievalSource: "semantic",
                semanticSimilarity: 0.95,
                lexicalOverlap: 0.5,
                lexicalOverlapCount: 2,
                availability: "now",
                trustScore: 93,
                trustScoreNormalized: 0.88,
                noveltySuppressionScore: 0.7,
                proximityScore: 1,
                styleCompatibility: 0.9,
                personalizationBoost: 0.6,
                selectedBecause: ["semantic_similarity", "trust_reputation"],
                finalScore: 0.91,
                selectionRecordedAt: "2026-03-19T15:00:00.000Z",
              },
            },
          ]),
        },
      },
    });

    const result = await service.listIntentExplanations("intent-1");

    expect(result.candidateCount).toBe(1);
    expect(result.candidates[0]).toEqual(
      expect.objectContaining({
        rank: 1,
        candidateUserId: "22222222-2222-4222-8222-222222222222",
        score: 0.91,
        explanation: expect.objectContaining({
          retrievalSource: "semantic",
          semanticSimilarity: 0.95,
          trustBand: "high",
          trustScoreNormalized: 0.88,
          selectedBecause: ["semantic_similarity", "trust_reputation"],
        }),
      }),
    );
    expect(result.candidates[0]?.explanation).not.toHaveProperty("trustScore");
  });

  it("returns user-facing explanation summary from top candidate factors", async () => {
    const { service } = createIntentsService({
      prisma: {
        intent: {
          findUnique: vi.fn().mockResolvedValue({
            id: "intent-1",
            status: "matching",
          }),
        },
        intentCandidate: {
          findMany: vi.fn().mockResolvedValue([
            {
              candidateUserId: "22222222-2222-4222-8222-222222222222",
              score: 0.91,
              createdAt: new Date("2026-03-19T15:00:00.000Z"),
              rationale: {
                selectedBecause: [
                  "availability_fit",
                  "semantic_similarity",
                  "style_compatibility",
                ],
              },
            },
          ]),
        },
      },
    });

    const result = await service.getUserFacingIntentExplanation("intent-1");

    expect(result.summary).toContain("timing and availability fit");
    expect(result.factors).toEqual([
      "timing and availability fit",
      "shared topics",
      "style and vibe compatibility",
    ]);
  });

  it("forwards request notification metadata when sending an intent request", async () => {
    const { service, notificationsService } = createIntentsService({
      prisma: {
        intent: {
          findUnique: vi.fn().mockResolvedValue({
            id: "intent-1",
            userId: "sender-1",
          }),
          update: vi.fn().mockResolvedValue({}),
        },
        intentRequest: {
          findFirst: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue({
            id: "request-1",
            status: "pending",
          }),
          count: vi.fn().mockResolvedValue(0),
        },
        auditLog: {
          count: vi.fn().mockResolvedValue(0),
        },
      },
    });

    await service.sendIntentRequest({
      intentId: "intent-1",
      recipientUserId: "recipient-1",
      traceId: "trace-1",
      notificationMetadata: {
        provenance: {
          source: "protocol",
          action: "request.send",
        },
      },
    });

    expect(notificationsService.createInAppNotification).toHaveBeenCalledWith(
      "recipient-1",
      NotificationType.REQUEST_RECEIVED,
      "Someone wants to connect with you right now.",
      {
        provenance: {
          source: "protocol",
          action: "request.send",
        },
      },
    );
  });
});
