import { describe, expect, it, vi } from "vitest";
import { DeadLetterService } from "../src/jobs/dead-letter.service.js";

function createService(overrides: { prisma?: any } = {}) {
  const prisma: any =
    overrides.prisma ??
    ({
      auditLog: {
        create: vi.fn().mockResolvedValue({}),
        findMany: vi.fn().mockResolvedValue([]),
        findUnique: vi.fn().mockResolvedValue(null),
        update: vi.fn().mockResolvedValue({}),
      },
    } as any);

  const intentProcessingQueue: any = {
    add: vi.fn().mockResolvedValue({}),
  };
  const notificationQueue: any = {
    add: vi.fn().mockResolvedValue({}),
  };
  const connectionSetupQueue: any = {
    add: vi.fn().mockResolvedValue({}),
  };
  const mediaProcessingQueue: any = {
    add: vi.fn().mockResolvedValue({}),
  };

  return {
    prisma,
    intentProcessingQueue,
    notificationQueue,
    connectionSetupQueue,
    mediaProcessingQueue,
    service: new DeadLetterService(
      prisma,
      intentProcessingQueue,
      notificationQueue,
      connectionSetupQueue,
      mediaProcessingQueue,
    ),
  };
}

describe("DeadLetterService", () => {
  it("records terminal job failures into dead-letter audit logs", async () => {
    const { service, prisma } = createService();

    await service.captureFailedJob(
      "intent-processing",
      {
        name: "IntentCreated",
        id: "intent-created:intent-1:initial",
        attemptsMade: 3,
        opts: {
          attempts: 3,
        },
        data: {
          idempotencyKey: "intent-created:intent-1:initial",
          payload: { intentId: "intent-1" },
        },
        stacktrace: ["error-line"],
      } as any,
      new Error("intent processing failed"),
    );

    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "queue.job_dead_lettered",
          entityType: "queue_job",
          metadata: expect.objectContaining({
            queueName: "intent-processing",
            jobName: "IntentCreated",
            attemptsMade: 3,
            maxAttempts: 3,
            idempotencyKey: "intent-created:intent-1:initial",
          }),
        }),
      }),
    );
  });

  it("does not dead-letter intermediate retries", async () => {
    const { service, prisma } = createService();

    await service.captureFailedJob(
      "intent-processing",
      {
        name: "IntentCreated",
        id: "intent-created:intent-1:initial",
        attemptsMade: 1,
        opts: {
          attempts: 3,
        },
        data: {},
      } as any,
      new Error("first failure"),
    );

    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it("replays dead-letter jobs back into their queue with replay idempotency key", async () => {
    const { service, prisma, intentProcessingQueue } = createService({
      prisma: {
        auditLog: {
          create: vi.fn().mockResolvedValue({}),
          findMany: vi.fn().mockResolvedValue([]),
          findUnique: vi.fn().mockResolvedValue({
            id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            action: "queue.job_dead_lettered",
            metadata: {
              queueName: "intent-processing",
              jobName: "IntentCreated",
              payload: {
                intentId: "intent-1",
                traceId: "trace-1",
                idempotencyKey: "intent-created:intent-1:initial",
              },
              maxAttempts: 3,
              replayCount: 0,
            },
          }),
          update: vi.fn().mockResolvedValue({}),
        },
      },
    });

    const result = await service.replayDeadLetter(
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    );

    expect(intentProcessingQueue.add).toHaveBeenCalledWith(
      "IntentCreated",
      expect.objectContaining({
        intentId: "intent-1",
        idempotencyKey: "intent-created:intent-1:initial:replay:1",
      }),
      expect.objectContaining({
        jobId: "replay:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa:1",
        attempts: 3,
      }),
    );
    expect(prisma.auditLog.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        },
        data: expect.objectContaining({
          metadata: expect.objectContaining({
            replayCount: 1,
            lastReplayJobId: "replay:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa:1",
          }),
        }),
      }),
    );
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "queue.job_replayed",
        }),
      }),
    );
    expect(result.status).toBe("queued");
  });

  it("records stalled jobs for recovery visibility", async () => {
    const { service, prisma } = createService();

    await service.captureStalledJob("notification", "job-123", "active");

    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "queue.job_stalled",
          metadata: expect.objectContaining({
            queueName: "notification",
            jobId: "job-123",
            previousState: "active",
            recovery: "bullmq_auto_requeue",
          }),
        }),
      }),
    );
  });
});
