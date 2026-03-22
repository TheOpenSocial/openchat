import { Injectable, Optional } from "@nestjs/common";
import {
  NotificationType,
  type scheduledTaskCreateBodySchema,
} from "@opensocial/types";
import { OpenAIClient } from "@opensocial/openai";
import type { z } from "zod";
import { AgentService } from "./agent.service.js";
import { IntentsService } from "../intents/intents.service.js";
import { MatchingService } from "../matching/matching.service.js";
import { PersonalizationService } from "../personalization/personalization.service.js";
import { ScheduledTasksService } from "../scheduled-tasks/scheduled-tasks.service.js";

type ScheduledTaskCreateBody = z.infer<typeof scheduledTaskCreateBodySchema>;

@Injectable()
export class AgentOutcomeToolsService {
  private readonly openai = new OpenAIClient({
    apiKey: process.env.OPENAI_API_KEY ?? "",
  });

  constructor(
    private readonly agentService: AgentService,
    @Optional()
    private readonly intentsService?: IntentsService,
    @Optional()
    private readonly matchingService?: MatchingService,
    @Optional()
    private readonly personalizationService?: PersonalizationService,
    @Optional()
    private readonly scheduledTasksService?: ScheduledTasksService,
  ) {}

  async searchCandidates(input: {
    userId: string;
    traceId: string;
    text: string;
    take?: number;
    parsedIntent?: {
      topics?: string[];
      activities?: string[];
      intentType?: string;
      modality?: string;
      timingConstraints?: string[];
      skillConstraints?: string[];
      vibeConstraints?: string[];
    };
  }) {
    if (!this.matchingService) {
      return { candidates: [], reason: "matching_service_unavailable" };
    }

    const parsedIntent =
      input.parsedIntent ??
      (await this.openai.parseIntent(input.text, input.traceId));
    const take = Math.min(Math.max(input.take ?? 5, 1), 10);
    const candidates = await this.matchingService.retrieveCandidates(
      input.userId,
      parsedIntent,
      take,
      {
        traceId: input.traceId,
      },
    );

    return {
      count: candidates.length,
      parsedIntent,
      candidates: candidates.map((candidate) => ({
        userId: candidate.userId,
        score: candidate.score,
        rationale: candidate.rationale,
      })),
    };
  }

  async persistIntent(input: {
    userId: string;
    threadId: string;
    traceId: string;
    text: string;
  }) {
    if (!this.intentsService) {
      return { persisted: false, reason: "intents_service_unavailable" };
    }

    const intent = await this.intentsService.createIntent(
      input.userId,
      input.text,
      input.traceId,
      input.threadId,
    );

    return {
      persisted: true,
      intentId: intent.id,
      status: intent.status,
      safetyState: intent.safetyState,
    };
  }

  async startConversation(input: {
    userId: string;
    title?: string;
    initialMessage?: string;
  }) {
    const title = this.normalizeTitle(input.title) ?? "New social plan";
    const thread = await this.agentService.createThread(input.userId, title);

    if (input.initialMessage?.trim()) {
      await this.agentService.appendWorkflowUpdate(
        thread.id,
        input.initialMessage.trim().slice(0, 500),
        {
          category: "agent_conversation_start",
        },
      );
    }

    return {
      threadId: thread.id,
      title: thread.title,
      createdAt: thread.createdAt.toISOString(),
    };
  }

  async writeMemory(input: {
    userId: string;
    summary: string;
    context?: Record<string, unknown>;
    topics?: string[];
    activities?: string[];
  }) {
    if (!this.personalizationService) {
      return { stored: false, reason: "personalization_service_unavailable" };
    }

    const summary = input.summary.trim().slice(0, 1_000);
    if (!summary) {
      return { stored: false, reason: "empty_summary" };
    }

    const stored = await this.personalizationService.storeInteractionSummary(
      input.userId,
      {
        summary,
        safe: true,
        context: input.context,
      },
    );

    const topicUpdates = (input.topics ?? [])
      .map((topic) => topic.trim())
      .filter((topic) => topic.length > 0)
      .slice(0, 5)
      .map((topic) =>
        this.personalizationService?.recordBehaviorSignal(input.userId, {
          edgeType: "recently_engaged_with",
          targetNode: { nodeType: "topic", label: topic },
          signalStrength: 0.3,
          feedbackType: "agent_memory_write_topic",
          context: input.context,
        }),
      );

    const activityUpdates = (input.activities ?? [])
      .map((activity) => activity.trim())
      .filter((activity) => activity.length > 0)
      .slice(0, 5)
      .map((activity) =>
        this.personalizationService?.recordBehaviorSignal(input.userId, {
          edgeType: "recently_engaged_with",
          targetNode: { nodeType: "activity", label: activity },
          signalStrength: 0.28,
          feedbackType: "agent_memory_write_activity",
          context: input.context,
        }),
      );

    await Promise.all([...topicUpdates, ...activityUpdates]);
    await this.personalizationService.refreshPreferenceMemoryDocument(
      input.userId,
    );

    return {
      stored: true,
      documentId: stored.documentId,
      docType: stored.docType,
      topicSignals: topicUpdates.length,
      activitySignals: activityUpdates.length,
    };
  }

  async scheduleFollowup(input: {
    userId: string;
    title?: string;
    summary?: string;
    timezone?: string;
    schedule?: Partial<
      ScheduledTaskCreateBody["schedule"] & {
        intervalHours?: number;
        days?: Array<"sun" | "mon" | "tue" | "wed" | "thu" | "fri" | "sat">;
      }
    >;
    deliveryMode?:
      | "notification"
      | "agent_thread"
      | "notification_and_agent_thread";
  }) {
    if (!this.scheduledTasksService) {
      return {
        scheduled: false,
        reason: "scheduled_tasks_service_unavailable",
      };
    }

    const timezone = this.normalizeTimezone(input.timezone);
    const title =
      this.normalizeTitle(input.title) ?? "Follow up on this social goal";
    const reminderSummary =
      input.summary?.trim().slice(0, 240) ?? "Check in on this social goal.";
    const schedule = this.resolveSchedule(input.schedule, timezone);
    const deliveryMode = input.deliveryMode ?? "agent_thread";

    const task = await this.scheduledTasksService.createTask(input.userId, {
      title,
      description: reminderSummary,
      schedule,
      task: {
        taskType: "social_reminder",
        config: {
          template: "revisit_unanswered_intents",
          deliveryMode,
          context: {
            summary: reminderSummary,
            requestedBy: "agent_tool",
          },
        },
      },
    });

    return {
      scheduled: true,
      taskId: task.id,
      nextRunAt: task.nextRunAt?.toISOString() ?? null,
      status: task.status,
      notificationType: NotificationType.REMINDER,
    };
  }

  private normalizeTitle(value?: string) {
    const title = value?.trim();
    if (!title) {
      return null;
    }
    return title.slice(0, 120);
  }

  private normalizeTimezone(value?: string) {
    const timezone = value?.trim();
    return timezone && timezone.length > 0 ? timezone.slice(0, 128) : "UTC";
  }

  private resolveSchedule(
    schedule:
      | {
          kind?: "hourly" | "weekly";
          intervalHours?: number;
          days?: Array<"sun" | "mon" | "tue" | "wed" | "thu" | "fri" | "sat">;
          hour?: number;
          minute?: number;
        }
      | undefined,
    timezone: string,
  ): ScheduledTaskCreateBody["schedule"] {
    if (schedule?.kind === "hourly") {
      return {
        kind: "hourly",
        intervalHours: Math.min(Math.max(schedule.intervalHours ?? 24, 1), 24),
        timezone,
      };
    }

    return {
      kind: "weekly",
      days:
        schedule?.kind === "weekly" && schedule.days && schedule.days.length > 0
          ? schedule.days.slice(0, 7)
          : [this.dayKeyForDate(new Date())],
      hour:
        schedule?.kind === "weekly"
          ? this.clampInt(schedule.hour, 0, 23, 18)
          : 18,
      minute:
        schedule?.kind === "weekly"
          ? this.clampInt(schedule.minute, 0, 59, 0)
          : 0,
      timezone,
    };
  }

  private clampInt(value: unknown, min: number, max: number, fallback: number) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return fallback;
    }
    return Math.min(Math.max(Math.trunc(value), min), max);
  }

  private dayKeyForDate(date: Date) {
    const dayKeys = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
    return dayKeys[date.getUTCDay()];
  }
}
