import { describe, expect, it, vi } from "vitest";
import { DeadLetterService } from "../src/jobs/dead-letter.service.js";
import { ScheduledTasksService } from "../src/scheduled-tasks/scheduled-tasks.service.js";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const TASK_ID = "22222222-2222-4222-8222-222222222222";
const RUN_ID = "33333333-3333-4333-8333-333333333333";
const DEAD_LETTER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

describe("Protocol queue visibility", () => {
  it("queues due runs with stable job ids and scheduled triggers", async () => {
    const queue: any = {
      add: vi.fn().mockResolvedValue({}),
    };
    const prisma: any = {
      scheduledTask: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: TASK_ID,
            userId: USER_ID,
            status: "active",
            nextRunAt: new Date(Date.now() - 60_000),
            scheduleConfig: {
              kind: "hourly",
              intervalHours: 2,
              timezone: "UTC",
            },
          },
        ]),
        update: vi.fn().mockResolvedValue({}),
      },
      scheduledTaskRun: {
        create: vi.fn().mockResolvedValue({
          id: RUN_ID,
          scheduledTaskId: TASK_ID,
          userId: USER_ID,
        }),
      },
    };

    const service = new ScheduledTasksService(prisma, queue);
    const result = await service.dispatchDueTasks("cron");

    expect(result).toEqual({ dispatched: 1, source: "cron" });
    expect(queue.add).toHaveBeenCalledWith(
      "ScheduledTaskRun",
      expect.objectContaining({
        type: "ScheduledTaskRun",
        payload: expect.objectContaining({
          scheduledTaskId: TASK_ID,
          scheduledTaskRunId: RUN_ID,
          trigger: "scheduled",
        }),
      }),
      expect.objectContaining({
        jobId: `scheduled-task-run:${RUN_ID}`,
      }),
    );
  });

  it("records manual runs with queue-visible metadata", async () => {
    const queue: any = {
      add: vi.fn().mockResolvedValue({}),
    };
    const prisma: any = {
      scheduledTask: {
        findUnique: vi.fn().mockResolvedValue({
          id: TASK_ID,
          userId: USER_ID,
          status: "active",
        }),
      },
      scheduledTaskRun: {
        create: vi.fn().mockResolvedValue({
          id: RUN_ID,
          scheduledTaskId: TASK_ID,
          userId: USER_ID,
        }),
      },
    };

    const service = new ScheduledTasksService(prisma, queue);
    const result = await service.adminRunTaskNow(TASK_ID);

    expect(result).toEqual({
      taskId: TASK_ID,
      runId: RUN_ID,
      userId: USER_ID,
      status: "queued",
    });
    expect(queue.add).toHaveBeenCalledWith(
      "ScheduledTaskRun",
      expect.objectContaining({
        payload: expect.objectContaining({
          scheduledTaskId: TASK_ID,
          scheduledTaskRunId: RUN_ID,
          trigger: "manual",
        }),
      }),
      expect.objectContaining({
        jobId: `scheduled-task-run:${RUN_ID}`,
      }),
    );
  });

  it("exposes stalled jobs and replay metadata for usage inspection", async () => {
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
    const prisma: any = {
      auditLog: {
        create: vi.fn().mockResolvedValue({}),
        findMany: vi
          .fn()
          .mockResolvedValueOnce([
            {
              id: DEAD_LETTER_ID,
              createdAt: new Date("2026-04-13T12:00:00.000Z"),
              metadata: {
                queueName: "notification",
                jobName: "NotificationDispatch",
                payload: {
                  notificationId: "notif-1",
                  recipientUserId: USER_ID,
                  notificationType: "digest",
                  idempotencyKey: "notification-dispatch:notif-1:email_digest",
                },
                maxAttempts: 3,
                replayCount: 0,
                deadLetteredAt: "2026-04-13T11:59:00.000Z",
              },
            },
          ])
          .mockResolvedValueOnce([
            {
              id: DEAD_LETTER_ID,
              createdAt: new Date("2026-04-13T12:00:00.000Z"),
              metadata: {
                queueName: "notification",
                jobName: "NotificationDispatch",
                payload: {
                  notificationId: "notif-1",
                  recipientUserId: USER_ID,
                  notificationType: "digest",
                  idempotencyKey: "notification-dispatch:notif-1:email_digest",
                },
                maxAttempts: 3,
                replayCount: 1,
                deadLetteredAt: "2026-04-13T11:59:00.000Z",
                lastReplayJobId: `replay:${DEAD_LETTER_ID}:1`,
                lastReplayedAt: "2026-04-13T12:01:00.000Z",
              },
            },
          ]),
        findUnique: vi.fn().mockResolvedValue({
          id: DEAD_LETTER_ID,
          action: "queue.job_dead_lettered",
          metadata: {
            queueName: "notification",
            jobName: "NotificationDispatch",
            payload: {
              notificationId: "notif-1",
              recipientUserId: USER_ID,
              notificationType: "digest",
              idempotencyKey: "notification-dispatch:notif-1:email_digest",
            },
            maxAttempts: 3,
            replayCount: 0,
          },
        }),
        update: vi.fn().mockResolvedValue({}),
      },
    };

    const service = new DeadLetterService(
      prisma,
      intentProcessingQueue,
      notificationQueue,
      connectionSetupQueue,
      mediaProcessingQueue,
    );

    await service.captureStalledJob("notification", "job-123", "active");
    const listBeforeReplay = await service.listDeadLetters(20);
    const replay = await service.replayDeadLetter(DEAD_LETTER_ID);
    const listAfterReplay = await service.listDeadLetters(20);

    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "queue.job_stalled",
          metadata: expect.objectContaining({
            queueName: "notification",
            jobId: "job-123",
            previousState: "active",
          }),
        }),
      }),
    );
    expect(listBeforeReplay[0]).toEqual(
      expect.objectContaining({
        id: DEAD_LETTER_ID,
        queueName: "notification",
        jobName: "NotificationDispatch",
        replayCount: 0,
        deadLetteredAt: "2026-04-13T11:59:00.000Z",
      }),
    );
    expect(listAfterReplay[0]).toEqual(
      expect.objectContaining({
        id: DEAD_LETTER_ID,
        queueName: "notification",
        jobName: "NotificationDispatch",
        replayCount: 1,
        lastReplayJobId: `replay:${DEAD_LETTER_ID}:1`,
        lastReplayedAt: "2026-04-13T12:01:00.000Z",
      }),
    );
    expect(notificationQueue.add).toHaveBeenCalledWith(
      "NotificationDispatch",
      expect.objectContaining({
        notificationId: "notif-1",
        idempotencyKey: "notification-dispatch:notif-1:email_digest:replay:1",
      }),
      expect.objectContaining({
        jobId: `replay:${DEAD_LETTER_ID}:1`,
      }),
    );
    expect(replay).toEqual(
      expect.objectContaining({
        deadLetterId: DEAD_LETTER_ID,
        queueName: "notification",
        jobName: "NotificationDispatch",
        status: "queued",
        replayCount: 1,
      }),
    );
  });
});
