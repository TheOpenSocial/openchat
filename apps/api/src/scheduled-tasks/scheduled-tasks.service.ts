import { InjectQueue } from "@nestjs/bullmq";
import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import {
  NotificationType,
  type savedSearchCreateBodySchema,
  type savedSearchUpdateBodySchema,
  type scheduledTaskCreateBodySchema,
  type scheduledTaskListQuerySchema,
  type scheduledTaskStatusSchema,
  type scheduledTaskUpdateBodySchema,
} from "@opensocial/types";
import type { Prisma } from "@prisma/client";
import { Queue } from "bullmq";
import { randomUUID } from "node:crypto";
import { AgentService } from "../agent/agent.service.js";
import { computeNextWeeklyOccurrence } from "../common/timezone-scheduling.js";
import { PrismaService } from "../database/prisma.service.js";
import { DiscoveryService } from "../discovery/discovery.service.js";
import { ExecutionReconciliationService } from "../execution-reconciliation/execution-reconciliation.service.js";
import { LaunchControlsService } from "../launch-controls/launch-controls.service.js";
import { NotificationsService } from "../notifications/notifications.service.js";

type SavedSearchCreateBody = zodInfer<typeof savedSearchCreateBodySchema>;
type SavedSearchUpdateBody = zodInfer<typeof savedSearchUpdateBodySchema>;
type ScheduledTaskCreateBody = zodInfer<typeof scheduledTaskCreateBodySchema>;
type ScheduledTaskUpdateBody = zodInfer<typeof scheduledTaskUpdateBodySchema>;
type ScheduledTaskListQuery = zodInfer<typeof scheduledTaskListQuerySchema>;
type ScheduledTaskStatus = zodInfer<typeof scheduledTaskStatusSchema>;

type zodInfer<T extends { _output: unknown }> = T["_output"];

type TaskDeliveryMode =
  | "notification"
  | "agent_thread"
  | "notification_and_agent_thread";

type TaskExecutionResult = {
  summary: string;
  payload: Prisma.InputJsonValue;
  deliveryMode: TaskDeliveryMode;
  notificationType: NotificationType;
};

const DEFAULT_LIST_LIMIT = 50;

@Injectable()
export class ScheduledTasksService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional()
    @InjectQueue("scheduled-tasks")
    private readonly scheduledTasksQueue?: Queue,
    @Optional()
    private readonly discoveryService?: DiscoveryService,
    @Optional()
    private readonly notificationsService?: NotificationsService,
    @Optional()
    private readonly agentService?: AgentService,
    @Optional()
    private readonly executionReconciliationService?: ExecutionReconciliationService,
    @Optional()
    private readonly launchControlsService?: LaunchControlsService,
  ) {}

  async listTasks(userId: string, query: ScheduledTaskListQuery) {
    const limit = query.limit ?? DEFAULT_LIST_LIMIT;
    return this.prisma.scheduledTask.findMany({
      where: {
        userId,
        ...(query.status
          ? { status: query.status }
          : { status: { not: "archived" } }),
      },
      orderBy: [{ nextRunAt: "asc" }, { createdAt: "desc" }],
      take: limit,
    });
  }

  async createTask(userId: string, body: ScheduledTaskCreateBody) {
    await this.assertLaunchAction("scheduled_tasks", userId);
    if (body.task.taskType === "saved_search") {
      await this.assertLaunchAction("saved_searches", userId);
      await this.assertSavedSearchOwnership(
        userId,
        body.task.config.savedSearchId,
      );
    }
    if (body.task.taskType === "discovery_briefing") {
      await this.assertLaunchAction("recurring_briefings", userId);
    }

    const now = new Date();
    const nextRunAt = this.computeNextRunAt(body.schedule, now);
    return this.prisma.scheduledTask.create({
      data: {
        userId,
        title: body.title,
        description: body.description ?? null,
        taskType: body.task.taskType,
        status: "active",
        scheduleType: body.schedule.kind,
        scheduleConfig: body.schedule as Prisma.InputJsonValue,
        taskConfig: body.task.config as Prisma.InputJsonValue,
        nextRunAt,
      },
    });
  }

  async updateTask(
    taskId: string,
    userId: string,
    body: ScheduledTaskUpdateBody,
  ) {
    await this.requireOwnedTask(taskId, userId);
    if (body.task?.taskType === "saved_search") {
      await this.assertSavedSearchOwnership(
        userId,
        body.task.config.savedSearchId,
      );
    }
    return this.prisma.scheduledTask.update({
      where: { id: taskId },
      data: {
        ...(body.title !== undefined ? { title: body.title } : {}),
        ...(body.description !== undefined
          ? { description: body.description }
          : {}),
        ...(body.status !== undefined ? { status: body.status } : {}),
        ...(body.schedule
          ? {
              scheduleType: body.schedule.kind,
              scheduleConfig: body.schedule as Prisma.InputJsonValue,
              nextRunAt: this.computeNextRunAt(body.schedule, new Date()),
            }
          : {}),
        ...(body.task
          ? {
              taskType: body.task.taskType,
              taskConfig: body.task.config as Prisma.InputJsonValue,
            }
          : {}),
      },
    });
  }

  async archiveTask(taskId: string, userId: string) {
    await this.requireOwnedTask(taskId, userId);
    return this.prisma.scheduledTask.update({
      where: { id: taskId },
      data: {
        status: "archived",
        nextRunAt: null,
      },
    });
  }

  async pauseTask(taskId: string, userId: string) {
    await this.requireOwnedTask(taskId, userId);
    return this.prisma.scheduledTask.update({
      where: { id: taskId },
      data: { status: "paused" },
    });
  }

  async resumeTask(taskId: string, userId: string) {
    const task = await this.requireOwnedTask(taskId, userId);
    const schedule =
      task.scheduleConfig as unknown as ScheduledTaskCreateBody["schedule"];
    return this.prisma.scheduledTask.update({
      where: { id: taskId },
      data: {
        status: "active",
        nextRunAt: this.computeNextRunAt(schedule, new Date()),
      },
    });
  }

  async runTaskNow(taskId: string, userId: string) {
    const task = await this.requireOwnedTask(taskId, userId);
    const run = await this.prisma.scheduledTaskRun.create({
      data: {
        scheduledTaskId: task.id,
        userId,
        status: "queued",
        traceId: randomUUID(),
      },
    });
    await this.enqueueRun(task.id, run.id, "manual");
    return { taskId: task.id, runId: run.id, status: "queued" as const };
  }

  async listTaskRuns(taskId: string, userId: string, limit = 50) {
    await this.requireOwnedTask(taskId, userId);
    return this.prisma.scheduledTaskRun.findMany({
      where: { scheduledTaskId: taskId },
      orderBy: { triggeredAt: "desc" },
      take: limit,
    });
  }

  async listSavedSearches(userId: string) {
    return this.prisma.savedSearch.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });
  }

  async createSavedSearch(userId: string, body: SavedSearchCreateBody) {
    await this.assertLaunchAction("saved_searches", userId);
    return this.prisma.savedSearch.create({
      data: {
        userId,
        title: body.title,
        searchType: body.searchType,
        queryConfig: body.queryConfig as Prisma.InputJsonValue,
      },
    });
  }

  async updateSavedSearch(
    searchId: string,
    userId: string,
    body: SavedSearchUpdateBody,
  ) {
    await this.requireOwnedSavedSearch(searchId, userId);
    return this.prisma.savedSearch.update({
      where: { id: searchId },
      data: {
        ...(body.title !== undefined ? { title: body.title } : {}),
        ...(body.searchType !== undefined
          ? { searchType: body.searchType }
          : {}),
        ...(body.queryConfig !== undefined
          ? { queryConfig: body.queryConfig as Prisma.InputJsonValue }
          : {}),
      },
    });
  }

  async deleteSavedSearch(searchId: string, userId: string) {
    await this.requireOwnedSavedSearch(searchId, userId);
    await this.prisma.savedSearch.delete({ where: { id: searchId } });
    return { deleted: true as const, searchId };
  }

  async dispatchDueTasks(source: "cron" | "manual" = "cron") {
    const now = new Date();
    const tasks = await this.prisma.scheduledTask.findMany({
      where: {
        status: "active",
        nextRunAt: { lte: now },
      },
      orderBy: { nextRunAt: "asc" },
      take: 100,
    });

    for (const task of tasks) {
      const schedule =
        task.scheduleConfig as unknown as ScheduledTaskCreateBody["schedule"];
      const run = await this.prisma.scheduledTaskRun.create({
        data: {
          scheduledTaskId: task.id,
          userId: task.userId,
          status: "queued",
          traceId: randomUUID(),
        },
      });
      await this.enqueueRun(task.id, run.id, "scheduled");
      await this.prisma.scheduledTask.update({
        where: { id: task.id },
        data: {
          lastRunAt: now,
          nextRunAt: this.computeNextRunAt(schedule, now),
        },
      });
    }

    return { dispatched: tasks.length, source };
  }

  async runQueuedTask(input: {
    scheduledTaskId: string;
    scheduledTaskRunId: string;
    trigger: "scheduled" | "manual";
  }) {
    const run = await this.prisma.scheduledTaskRun.findUnique({
      where: { id: input.scheduledTaskRunId },
    });
    if (!run || run.scheduledTaskId !== input.scheduledTaskId) {
      throw new NotFoundException("scheduled task run not found");
    }

    const task = await this.prisma.scheduledTask.findUnique({
      where: { id: input.scheduledTaskId },
    });
    if (!task) {
      throw new NotFoundException("scheduled task not found");
    }

    await this.prisma.scheduledTaskRun.update({
      where: { id: run.id },
      data: {
        status: "running",
        startedAt: new Date(),
      },
    });

    if (input.trigger === "scheduled" && task.status !== "active") {
      return this.finishRunAsSkipped(run.id, "task_not_active");
    }

    const execution = await this.executeTask(task);
    const delivery = await this.deliverTaskResult(task, execution);

    await this.prisma.scheduledTaskRun.update({
      where: { id: run.id },
      data: {
        status: "succeeded",
        finishedAt: new Date(),
        resultSummary: execution.summary,
        resultPayload: execution.payload,
        createdNotificationId: delivery.notificationId,
        createdAgentMessageId: delivery.agentMessageId,
      },
    });
    await this.prisma.scheduledTask.update({
      where: { id: task.id },
      data: {
        lastSuccessAt: new Date(),
        lastFailureAt: null,
        lastFailureReason: null,
      },
    });

    return {
      taskId: task.id,
      runId: run.id,
      status: "succeeded" as const,
      summary: execution.summary,
    };
  }

  async listAdminTasks(query: {
    status?: ScheduledTaskStatus;
    limit?: number;
  }) {
    return this.prisma.scheduledTask.findMany({
      where: {
        ...(query.status ? { status: query.status } : {}),
      },
      orderBy: [{ nextRunAt: "asc" }, { createdAt: "desc" }],
      take: query.limit ?? DEFAULT_LIST_LIMIT,
    });
  }

  async listAdminTaskRuns(taskId: string, limit = 100) {
    return this.prisma.scheduledTaskRun.findMany({
      where: { scheduledTaskId: taskId },
      orderBy: { triggeredAt: "desc" },
      take: limit,
    });
  }

  private async executeTask(task: {
    id: string;
    userId: string;
    taskType: string;
    taskConfig: Prisma.JsonValue;
  }): Promise<TaskExecutionResult> {
    if (task.taskType === "saved_search") {
      await this.assertLaunchAction("saved_searches", task.userId);
      return this.executeSavedSearchTask(task.userId, task.taskConfig);
    }
    if (task.taskType === "discovery_briefing") {
      await this.assertLaunchAction("recurring_briefings", task.userId);
      return this.executeDiscoveryBriefingTask(task.userId, task.taskConfig);
    }
    if (task.taskType === "reconnect_briefing") {
      await this.assertLaunchAction("recurring_briefings", task.userId);
      return this.executeReconnectBriefingTask(task.userId, task.taskConfig);
    }
    if (task.taskType === "social_reminder") {
      await this.assertLaunchAction("recurring_briefings", task.userId);
      return this.executeSocialReminderTask(task.userId, task.taskConfig);
    }
    throw new ForbiddenException(`unsupported task type: ${task.taskType}`);
  }

  private async executeSavedSearchTask(
    userId: string,
    taskConfig: Prisma.JsonValue,
  ): Promise<TaskExecutionResult> {
    const config = this.toRecord(taskConfig);
    const savedSearchId = this.readString(config.savedSearchId);
    if (!savedSearchId) {
      throw new ForbiddenException(
        "saved search task is missing savedSearchId",
      );
    }
    const savedSearch = await this.assertSavedSearchOwnership(
      userId,
      savedSearchId,
    );
    const maxResults = this.readInt(config.maxResults, 5, 1, 10);
    const minResults = this.readInt(config.minResults, 1, 0, 10);
    const deliveryMode = this.readDeliveryMode(
      config.deliveryMode,
      "agent_thread",
    );
    const searchType = savedSearch.searchType;
    if (!this.discoveryService) {
      throw new ForbiddenException("discovery service unavailable");
    }

    let payload: Prisma.InputJsonValue;
    let total = 0;
    if (searchType === "discovery_people") {
      const data = await this.discoveryService.suggestTonight(
        userId,
        maxResults,
      );
      total = data.suggestions.length;
      payload = data as unknown as Prisma.InputJsonValue;
    } else if (searchType === "discovery_groups") {
      const data = await this.discoveryService.suggestGroups(
        userId,
        maxResults,
      );
      total = data.groups.length;
      payload = data as unknown as Prisma.InputJsonValue;
    } else if (searchType === "reconnects") {
      const data = await this.discoveryService.suggestReconnects(
        userId,
        maxResults,
      );
      total = data.reconnects.length;
      payload = data as unknown as Prisma.InputJsonValue;
    } else {
      const data = await this.discoveryService.getPassiveDiscovery(
        userId,
        maxResults,
      );
      total = data.tonight.suggestions.length;
      payload = data as unknown as Prisma.InputJsonValue;
    }

    if (total < minResults) {
      return {
        summary: `Saved search '${savedSearch.title}' had ${total} results, below min ${minResults}.`,
        payload,
        deliveryMode: "agent_thread",
        notificationType: NotificationType.AGENT_UPDATE,
      };
    }

    return {
      summary: `Saved search '${savedSearch.title}' found ${total} result${total === 1 ? "" : "s"}.`,
      payload,
      deliveryMode,
      notificationType: NotificationType.AGENT_UPDATE,
    };
  }

  private async executeDiscoveryBriefingTask(
    userId: string,
    taskConfig: Prisma.JsonValue,
  ): Promise<TaskExecutionResult> {
    if (!this.discoveryService) {
      throw new ForbiddenException("discovery service unavailable");
    }
    const config = this.toRecord(taskConfig);
    const briefingType = this.readString(config.briefingType) ?? "tonight";
    const maxResults = this.readInt(config.maxResults, 5, 1, 10);
    const deliveryMode = this.readDeliveryMode(
      config.deliveryMode,
      "notification_and_agent_thread",
    );
    let payload: Prisma.InputJsonValue;
    let summary: string;
    if (briefingType === "passive") {
      const data = await this.discoveryService.getPassiveDiscovery(
        userId,
        maxResults,
      );
      summary = `Passive discovery briefing generated with ${data.tonight.suggestions.length} tonight suggestions.`;
      payload = data as unknown as Prisma.InputJsonValue;
    } else if (briefingType === "inbox") {
      const data = await this.discoveryService.getInboxSuggestions(
        userId,
        maxResults,
      );
      summary = `Inbox suggestions briefing generated with ${data.suggestions.length} cards.`;
      payload = data as unknown as Prisma.InputJsonValue;
    } else {
      const data = await this.discoveryService.suggestTonight(
        userId,
        maxResults,
      );
      summary = `Tonight briefing generated with ${data.suggestions.length} suggestions.`;
      payload = data as unknown as Prisma.InputJsonValue;
    }
    return {
      summary,
      payload,
      deliveryMode,
      notificationType: NotificationType.DIGEST,
    };
  }

  private async executeReconnectBriefingTask(
    userId: string,
    taskConfig: Prisma.JsonValue,
  ): Promise<TaskExecutionResult> {
    if (!this.discoveryService) {
      throw new ForbiddenException("discovery service unavailable");
    }
    const config = this.toRecord(taskConfig);
    const maxResults = this.readInt(config.maxResults, 5, 1, 10);
    const deliveryMode = this.readDeliveryMode(
      config.deliveryMode,
      "notification_and_agent_thread",
    );
    const data = await this.discoveryService.suggestReconnects(
      userId,
      maxResults,
    );
    return {
      summary: `Reconnect briefing generated with ${data.reconnects.length} reconnect suggestion${data.reconnects.length === 1 ? "" : "s"}.`,
      payload: data as unknown as Prisma.InputJsonValue,
      deliveryMode,
      notificationType: NotificationType.REMINDER,
    };
  }

  private async executeSocialReminderTask(
    _userId: string,
    taskConfig: Prisma.JsonValue,
  ): Promise<TaskExecutionResult> {
    const config = this.toRecord(taskConfig);
    const template = this.readString(config.template) ?? "open_passive_mode";
    const deliveryMode = this.readDeliveryMode(
      config.deliveryMode,
      "notification",
    );
    const message =
      template === "resume_dormant_chats"
        ? "Reminder: you have dormant chats that may be worth reviving."
        : template === "revisit_unanswered_intents"
          ? "Reminder: revisit your unanswered intents and adjust scope if needed."
          : "Reminder: enable passive mode before your peak social window.";
    return {
      summary: message,
      payload: {
        template,
        context: this.toRecord(config.context),
      } as Prisma.InputJsonValue,
      deliveryMode,
      notificationType: NotificationType.REMINDER,
    };
  }

  private async deliverTaskResult(
    task: { userId: string },
    result: TaskExecutionResult,
  ) {
    let notificationId: string | null = null;
    let agentMessageId: string | null = null;

    if (
      (result.deliveryMode === "notification" ||
        result.deliveryMode === "notification_and_agent_thread") &&
      this.notificationsService
    ) {
      const notification =
        await this.notificationsService.createInAppNotification(
          task.userId,
          result.notificationType,
          result.summary,
        );
      notificationId = notification.id;
    }

    if (
      (result.deliveryMode === "agent_thread" ||
        result.deliveryMode === "notification_and_agent_thread") &&
      this.agentService
    ) {
      const thread = await this.agentService.findPrimaryThreadSummaryForUser(
        task.userId,
      );
      if (thread) {
        const message = await this.agentService.appendWorkflowUpdate(
          thread.id,
          result.summary,
          {
            category: "scheduled_task",
          },
        );
        agentMessageId = message.id;
      }
    }

    return { notificationId, agentMessageId };
  }

  private async finishRunAsSkipped(runId: string, reason: string) {
    const run = this.executionReconciliationService
      ? await this.prisma.scheduledTaskRun.findUnique({
          where: { id: runId },
          select: {
            id: true,
            userId: true,
            scheduledTaskId: true,
          },
        })
      : null;
    await this.prisma.scheduledTaskRun.update({
      where: { id: runId },
      data: {
        status: "skipped",
        skipReason: reason,
        finishedAt: new Date(),
      },
    });
    if (run && this.executionReconciliationService) {
      await this.executionReconciliationService.recordScheduledTaskSkipped({
        userId: run.userId,
        scheduledTaskId: run.scheduledTaskId,
        scheduledTaskRunId: run.id,
        reason,
        source: "scheduled_tasks.finish_run_skipped",
      });
    }
    return { runId, status: "skipped" as const, reason };
  }

  private async enqueueRun(
    scheduledTaskId: string,
    scheduledTaskRunId: string,
    trigger: "scheduled" | "manual",
  ) {
    if (!this.scheduledTasksQueue) {
      throw new ForbiddenException("scheduled-tasks queue unavailable");
    }
    const idempotencyKey = `scheduled-task-run:${scheduledTaskRunId}`;
    await this.scheduledTasksQueue.add(
      "ScheduledTaskRun",
      {
        version: 1,
        traceId: randomUUID(),
        idempotencyKey,
        timestamp: new Date().toISOString(),
        type: "ScheduledTaskRun",
        payload: {
          scheduledTaskId,
          scheduledTaskRunId,
          trigger,
        },
      },
      {
        jobId: idempotencyKey,
        attempts: 3,
        removeOnComplete: 500,
        backoff: { type: "exponential", delay: 1000 },
      },
    );
  }

  private async requireOwnedTask(taskId: string, userId: string) {
    const task = await this.prisma.scheduledTask.findFirst({
      where: {
        id: taskId,
        userId,
      },
    });
    if (!task) {
      throw new NotFoundException("scheduled task not found");
    }
    return task;
  }

  private async requireOwnedSavedSearch(searchId: string, userId: string) {
    const search = await this.prisma.savedSearch.findFirst({
      where: {
        id: searchId,
        userId,
      },
    });
    if (!search) {
      throw new NotFoundException("saved search not found");
    }
    return search;
  }

  private async assertSavedSearchOwnership(
    userId: string,
    savedSearchId: string,
  ) {
    return this.requireOwnedSavedSearch(savedSearchId, userId);
  }

  private async assertLaunchAction(
    action: "scheduled_tasks" | "saved_searches" | "recurring_briefings",
    userId: string,
  ) {
    if (!this.launchControlsService) {
      return;
    }
    await this.launchControlsService.assertActionAllowed(action, userId);
  }

  private computeNextRunAt(
    schedule: ScheduledTaskCreateBody["schedule"],
    fromDate: Date,
  ) {
    const fromMs = fromDate.getTime();
    if (schedule.kind === "hourly") {
      return new Date(fromMs + schedule.intervalHours * 60 * 60 * 1000);
    }

    return computeNextWeeklyOccurrence({
      days: schedule.days,
      hour: schedule.hour,
      minute: schedule.minute,
      timezone: schedule.timezone,
      from: fromDate,
    });
  }

  private toRecord(value: unknown) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return {} as Record<string, unknown>;
    }
    return value as Record<string, unknown>;
  }

  private readString(value: unknown) {
    return typeof value === "string" && value.trim().length > 0
      ? value.trim()
      : null;
  }

  private readInt(value: unknown, fallback: number, min: number, max: number) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return fallback;
    }
    const parsed = Math.trunc(value);
    return Math.max(min, Math.min(max, parsed));
  }

  private readDeliveryMode(
    value: unknown,
    fallback: TaskDeliveryMode,
  ): TaskDeliveryMode {
    if (value === "notification" || value === "agent_thread") {
      return value;
    }
    if (value === "notification_and_agent_thread") {
      return value;
    }
    return fallback;
  }
}
