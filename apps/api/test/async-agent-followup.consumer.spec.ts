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
    notification: {
      findUnique: vi.fn(),
    },
    auditLog: {
      create: vi.fn().mockResolvedValue({}),
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

  return {
    prisma,
    agentService,
    notificationsService,
    deadLetterService,
    consumer: new AsyncAgentFollowupConsumer(
      prisma,
      agentService,
      notificationsService,
      deadLetterService,
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
      expect.stringContaining("Remember you asked earlier"),
    );
    expect(notificationsService.createInAppNotification).toHaveBeenCalledWith(
      "11111111-1111-4111-8111-111111111111",
      "agent_update",
      expect.stringContaining("Remember you asked earlier"),
    );
  });

  it("skips processing when intent is no longer processable", async () => {
    const { consumer, prisma, agentService, notificationsService } =
      createConsumer();
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
  });
});
