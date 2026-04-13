import { describe, expect, it, vi } from "vitest";
import { AsyncAgentFollowupConsumer } from "../src/jobs/processors/async-agent-followup.consumer.js";

function createConsumer() {
  const prisma: any = {
    intent: {
      findUnique: vi.fn().mockResolvedValue({
        id: "22222222-2222-4222-8222-222222222222",
        userId: "11111111-1111-4111-8111-111111111111",
        rawText: "Need tennis now",
        status: "matching",
      }),
    },
    intentRequest: {
      findMany: vi
        .fn()
        .mockResolvedValue([{ status: "pending" }, { status: "accepted" }]),
    },
    agentThread: {
      findFirst: vi.fn().mockResolvedValue({
        id: "thread-latest",
      }),
    },
    agentMessage: {
      findFirst: vi.fn().mockResolvedValue(null),
    },
    notification: {
      findUnique: vi.fn(),
    },
    auditLog: {
      create: vi.fn().mockResolvedValue({}),
      findMany: vi.fn().mockResolvedValue([]),
    },
  };
  const agentService: any = {
    createAgentMessage: vi.fn().mockResolvedValue({}),
  };
  const notificationsService: any = {
    createInAppNotification: vi.fn().mockResolvedValue({}),
  };
  const deadLetterService: any = {
    captureFailedJob: vi.fn().mockResolvedValue({}),
    captureStalledJob: vi.fn().mockResolvedValue({}),
  };
  const executionReconciliationService: any = {
    recordIntentTerminalState: vi.fn().mockResolvedValue(undefined),
  };
  const workflowRuntimeService: any = {
    buildWorkflowRunId: vi.fn(
      ({
        domain,
        entityType,
        entityId,
      }: {
        domain: string;
        entityType: string;
        entityId: string;
      }) => `${domain}:${entityType}:${entityId}`,
    ),
    linkSideEffect: vi.fn().mockResolvedValue(undefined),
    checkpoint: vi.fn().mockResolvedValue(undefined),
  };

  return {
    prisma,
    agentService,
    notificationsService,
    deadLetterService,
    executionReconciliationService,
    workflowRuntimeService,
    consumer: new AsyncAgentFollowupConsumer(
      prisma,
      agentService,
      notificationsService,
      executionReconciliationService,
      deadLetterService,
      workflowRuntimeService,
    ),
  };
}

describe("AsyncAgentFollowupConsumer", () => {
  it("writes follow-up message to latest thread and sends in-app notification", async () => {
    const { consumer, agentService, notificationsService } = createConsumer();

    const result = await consumer.process({
      name: "AsyncAgentFollowup",
      id: "job-1",
      data: {
        version: 1,
        traceId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        idempotencyKey:
          "intent-followup:22222222-2222-4222-8222-222222222222:pending_reminder",
        timestamp: "2026-03-20T00:00:00.000Z",
        type: "AsyncAgentFollowup",
        payload: {
          userId: "11111111-1111-4111-8111-111111111111",
          intentId: "22222222-2222-4222-8222-222222222222",
          template: "pending_reminder",
        },
      },
    } as any);

    expect(result).toEqual(
      expect.objectContaining({
        acknowledged: true,
      }),
    );
    expect(agentService.createAgentMessage).toHaveBeenCalledWith(
      "thread-latest",
      expect.stringContaining("1 accepted and 1 still active"),
    );
    expect(notificationsService.createInAppNotification).toHaveBeenCalledWith(
      "11111111-1111-4111-8111-111111111111",
      "agent_update",
      expect.stringContaining("1 accepted and 1 still active"),
    );
  });

  it("grounds no-match follow-ups in the original ask and a concrete next step", async () => {
    const { consumer, agentService, notificationsService } = createConsumer();

    await consumer.process({
      name: "AsyncAgentFollowup",
      id: "job-no-match",
      data: {
        version: 1,
        traceId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
        idempotencyKey:
          "intent-followup:22222222-2222-4222-8222-222222222222:no_match_yet",
        timestamp: "2026-03-20T00:00:00.000Z",
        type: "AsyncAgentFollowup",
        payload: {
          userId: "11111111-1111-4111-8111-111111111111",
          intentId: "22222222-2222-4222-8222-222222222222",
          template: "no_match_yet",
        },
      },
    } as any);

    expect(agentService.createAgentMessage).toHaveBeenCalledWith(
      "thread-latest",
      expect.stringContaining("Need tennis now"),
    );
    expect(agentService.createAgentMessage).toHaveBeenCalledWith(
      "thread-latest",
      expect.stringContaining("widen timing"),
    );
    expect(notificationsService.createInAppNotification).toHaveBeenCalledWith(
      "11111111-1111-4111-8111-111111111111",
      "agent_update",
      expect.stringContaining("Need tennis now"),
    );
  });

  it("keeps progress updates tied to the original ask and a next action hint", async () => {
    const { consumer, agentService, notificationsService } = createConsumer();

    await consumer.process({
      name: "AsyncAgentFollowup",
      id: "job-progress",
      data: {
        version: 1,
        traceId: "ffffffff-ffff-4fff-8fff-ffffffffffff",
        idempotencyKey:
          "intent-followup:22222222-2222-4222-8222-222222222222:progress_update",
        timestamp: "2026-03-20T00:00:00.000Z",
        type: "AsyncAgentFollowup",
        payload: {
          userId: "11111111-1111-4111-8111-111111111111",
          intentId: "22222222-2222-4222-8222-222222222222",
          template: "progress_update",
        },
      },
    } as any);

    expect(agentService.createAgentMessage).toHaveBeenCalledWith(
      "thread-latest",
      expect.stringContaining("Need tennis now"),
    );
    expect(agentService.createAgentMessage).toHaveBeenCalledWith(
      "thread-latest",
      expect.stringContaining("widen timing"),
    );
    expect(notificationsService.createInAppNotification).toHaveBeenCalledWith(
      "11111111-1111-4111-8111-111111111111",
      "agent_update",
      expect.stringContaining("Need tennis now"),
    );
  });

  it("skips processing when intent is no longer processable", async () => {
    const {
      consumer,
      prisma,
      agentService,
      notificationsService,
      executionReconciliationService,
    } = createConsumer();
    prisma.intent.findUnique.mockResolvedValueOnce({
      id: "22222222-2222-4222-8222-222222222222",
      userId: "11111111-1111-4111-8111-111111111111",
      rawText: "Need tennis now",
      status: "connected",
    });

    const result = await consumer.process({
      name: "AsyncAgentFollowup",
      id: "job-2",
      data: {
        version: 1,
        traceId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        idempotencyKey:
          "intent-followup:22222222-2222-4222-8222-222222222222:progress_update",
        timestamp: "2026-03-20T00:00:00.000Z",
        type: "AsyncAgentFollowup",
        payload: {
          userId: "11111111-1111-4111-8111-111111111111",
          intentId: "22222222-2222-4222-8222-222222222222",
          template: "progress_update",
        },
      },
    } as any);

    expect(result).toEqual(
      expect.objectContaining({
        acknowledged: true,
        skipped: true,
      }),
    );
    expect(agentService.createAgentMessage).not.toHaveBeenCalled();
    expect(notificationsService.createInAppNotification).not.toHaveBeenCalled();
    expect(
      executionReconciliationService.recordIntentTerminalState,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "11111111-1111-4111-8111-111111111111",
        intentId: "22222222-2222-4222-8222-222222222222",
        status: "connected",
        source: "jobs.async_agent_followup",
      }),
    );
  });

  it("reuses a recent duplicate thread follow-up during replay", async () => {
    const { consumer, prisma, agentService, notificationsService } =
      createConsumer();
    prisma.agentMessage.findFirst.mockResolvedValueOnce({
      id: "existing-thread-message",
    });

    const result = await consumer.process({
      name: "AsyncAgentFollowup",
      id: "job-3",
      data: {
        version: 1,
        traceId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        idempotencyKey:
          "intent-followup:22222222-2222-4222-8222-222222222222:pending_reminder:replay:1",
        timestamp: "2026-03-20T00:00:00.000Z",
        type: "AsyncAgentFollowup",
        payload: {
          userId: "11111111-1111-4111-8111-111111111111",
          intentId: "22222222-2222-4222-8222-222222222222",
          template: "pending_reminder",
        },
      },
    } as any);

    expect(result).toEqual(
      expect.objectContaining({
        acknowledged: true,
      }),
    );
    expect(agentService.createAgentMessage).not.toHaveBeenCalled();
    expect(notificationsService.createInAppNotification).toHaveBeenCalledTimes(
      1,
    );
  });

  it("reuses a recent deduped follow-up notification during replay", async () => {
    const { consumer, prisma, notificationsService, workflowRuntimeService } =
      createConsumer();
    prisma.auditLog.findMany.mockResolvedValueOnce([
      {
        entityId: "notification-existing",
        metadata: {
          workflowRunId: "social:intent:22222222-2222-4222-8222-222222222222",
          relation: "followup_notification",
          template: "pending_reminder",
          notificationType: "agent_update",
        },
      },
    ]);
    prisma.notification.findUnique.mockResolvedValueOnce({
      id: "notification-existing",
      recipientUserId: "11111111-1111-4111-8111-111111111111",
      type: "agent_update",
    });

    const result = await consumer.process({
      name: "AsyncAgentFollowup",
      id: "job-4",
      data: {
        version: 1,
        traceId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        idempotencyKey:
          "intent-followup:22222222-2222-4222-8222-222222222222:pending_reminder:replay:2",
        timestamp: "2026-03-20T00:00:00.000Z",
        type: "AsyncAgentFollowup",
        payload: {
          userId: "11111111-1111-4111-8111-111111111111",
          intentId: "22222222-2222-4222-8222-222222222222",
          template: "pending_reminder",
        },
      },
    } as any);

    expect(result).toEqual(
      expect.objectContaining({
        acknowledged: true,
      }),
    );
    expect(notificationsService.createInAppNotification).not.toHaveBeenCalled();
    expect(workflowRuntimeService.linkSideEffect).toHaveBeenCalledWith(
      expect.objectContaining({
        relation: "followup_notification",
        entityId: "notification-existing",
        metadata: expect.objectContaining({
          deduped: true,
          notificationType: "agent_update",
        }),
      }),
    );
  });
});
