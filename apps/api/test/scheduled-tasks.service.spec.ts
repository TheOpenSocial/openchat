import { describe, expect, it, vi } from "vitest";
import { NotificationType } from "@opensocial/types";
import { ScheduledTasksService } from "../src/scheduled-tasks/scheduled-tasks.service.js";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const TASK_ID = "22222222-2222-4222-8222-222222222222";
const RUN_ID = "33333333-3333-4333-8333-333333333333";
const SEARCH_ID = "44444444-4444-4444-8444-444444444444";

describe("ScheduledTasksService", () => {
  it("creates scheduled task and computes next run", async () => {
    const prisma: any = {
      savedSearch: {
        findFirst: vi.fn().mockResolvedValue({
          id: SEARCH_ID,
          userId: USER_ID,
          title: "Tennis search",
          searchType: "discovery_people",
        }),
      },
      scheduledTask: {
        create: vi.fn().mockResolvedValue({
          id: TASK_ID,
          userId: USER_ID,
          status: "active",
        }),
      },
    };

    const launchControls: any = {
      assertActionAllowed: vi.fn().mockResolvedValue(undefined),
    };

    const service = new ScheduledTasksService(
      prisma,
      undefined,
      undefined,
      undefined,
      undefined,
      launchControls,
    );

    const created = await service.createTask(USER_ID, {
      title: "Tennis every weekday",
      schedule: {
        kind: "weekly",
        days: ["mon", "wed", "fri"],
        hour: 18,
        minute: 0,
        timezone: "UTC",
      },
      task: {
        taskType: "saved_search",
        config: {
          savedSearchId: SEARCH_ID,
          deliveryMode: "agent_thread",
          minResults: 1,
          maxResults: 5,
        },
      },
    });

    expect(created.id).toBe(TASK_ID);
    expect(prisma.scheduledTask.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: USER_ID,
          taskType: "saved_search",
          scheduleType: "weekly",
          nextRunAt: expect.any(Date),
        }),
      }),
    );
  });

  it("computes weekly next run in the scheduled timezone instead of UTC", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-21T00:00:00.000Z"));

    try {
      const prisma: any = {
        savedSearch: {
          findFirst: vi.fn().mockResolvedValue({
            id: SEARCH_ID,
            userId: USER_ID,
            title: "Morning plans",
            searchType: "discovery_people",
          }),
        },
        scheduledTask: {
          create: vi.fn().mockResolvedValue({
            id: TASK_ID,
            userId: USER_ID,
            status: "active",
          }),
        },
      };
      const launchControls: any = {
        assertActionAllowed: vi.fn().mockResolvedValue(undefined),
      };

      const service = new ScheduledTasksService(
        prisma,
        undefined,
        undefined,
        undefined,
        undefined,
        launchControls,
      );

      await service.createTask(USER_ID, {
        title: "Saturday morning search",
        schedule: {
          kind: "weekly",
          days: ["sat"],
          hour: 10,
          minute: 30,
          timezone: "America/Argentina/Buenos_Aires",
        },
        task: {
          taskType: "saved_search",
          config: {
            savedSearchId: SEARCH_ID,
            deliveryMode: "agent_thread",
            minResults: 1,
            maxResults: 5,
          },
        },
      });

      expect(
        prisma.scheduledTask.create.mock.calls[0][0].data.nextRunAt.toISOString(),
      ).toBe("2026-03-21T13:30:00.000Z");
    } finally {
      vi.useRealTimers();
    }
  });

  it("dispatches due tasks and queues runs", async () => {
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

    expect(result.dispatched).toBe(1);
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

  it("executes discovery briefing run and delivers notification + agent update", async () => {
    const prisma: any = {
      scheduledTaskRun: {
        findUnique: vi.fn().mockResolvedValue({
          id: RUN_ID,
          scheduledTaskId: TASK_ID,
        }),
        update: vi.fn().mockResolvedValue({}),
      },
      scheduledTask: {
        findUnique: vi.fn().mockResolvedValue({
          id: TASK_ID,
          userId: USER_ID,
          status: "active",
          taskType: "discovery_briefing",
          taskConfig: {
            briefingType: "tonight",
            deliveryMode: "notification_and_agent_thread",
            maxResults: 3,
          },
        }),
        update: vi.fn().mockResolvedValue({}),
      },
    };
    const discovery: any = {
      suggestTonight: vi.fn().mockResolvedValue({
        userId: USER_ID,
        suggestions: [{ userId: "u-1", score: 0.9 }],
      }),
    };
    const notifications: any = {
      createInAppNotification: vi.fn().mockResolvedValue({ id: "notif-1" }),
    };
    const agent: any = {
      findPrimaryThreadSummaryForUser: vi
        .fn()
        .mockResolvedValue({ id: "thread-1" }),
      appendWorkflowUpdate: vi.fn().mockResolvedValue({ id: "msg-1" }),
    };
    const launchControls: any = {
      assertActionAllowed: vi.fn().mockResolvedValue(undefined),
    };

    const service = new ScheduledTasksService(
      prisma,
      undefined,
      discovery,
      notifications,
      agent,
      launchControls,
    );
    const result = await service.runQueuedTask({
      scheduledTaskId: TASK_ID,
      scheduledTaskRunId: RUN_ID,
      trigger: "manual",
    });

    expect(result.status).toBe("succeeded");
    expect(notifications.createInAppNotification).toHaveBeenCalledWith(
      USER_ID,
      NotificationType.DIGEST,
      expect.stringContaining("briefing generated"),
    );
    expect(agent.appendWorkflowUpdate).toHaveBeenCalledWith(
      "thread-1",
      expect.stringContaining("briefing generated"),
      expect.objectContaining({
        category: "scheduled_task",
      }),
    );
  });
});
