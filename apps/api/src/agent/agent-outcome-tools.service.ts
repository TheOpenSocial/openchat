import { Injectable, Optional } from "@nestjs/common";
import {
  NotificationType,
  type scheduledTaskCreateBodySchema,
} from "@opensocial/types";
import { OpenAIClient } from "@opensocial/openai";
import type { z } from "zod";
import { AgentService } from "./agent.service.js";
import { DiscoveryService } from "../discovery/discovery.service.js";
import { InboxService } from "../inbox/inbox.service.js";
import { IntentsService } from "../intents/intents.service.js";
import { MatchingService } from "../matching/matching.service.js";
import { PersonalizationService } from "../personalization/personalization.service.js";
import { ProfilesService } from "../profiles/profiles.service.js";
import { RecurringCirclesService } from "../recurring-circles/recurring-circles.service.js";
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
    private readonly discoveryService?: DiscoveryService,
    @Optional()
    private readonly inboxService?: InboxService,
    @Optional()
    private readonly matchingService?: MatchingService,
    @Optional()
    private readonly personalizationService?: PersonalizationService,
    @Optional()
    private readonly profilesService?: ProfilesService,
    @Optional()
    private readonly recurringCirclesService?: RecurringCirclesService,
    @Optional()
    private readonly scheduledTasksService?: ScheduledTasksService,
  ) {}

  async searchCandidates(input: {
    userId: string;
    traceId: string;
    text: string;
    take?: number;
    widenOnScarcity?: boolean;
    scarcityThreshold?: number;
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
    const scarcityThreshold = Math.min(
      Math.max(input.scarcityThreshold ?? 2, 1),
      take,
    );
    const candidates = await this.matchingService.retrieveCandidates(
      input.userId,
      parsedIntent,
      take,
      {
        traceId: input.traceId,
      },
    );
    const shouldWiden =
      input.widenOnScarcity === true && candidates.length < scarcityThreshold;
    const widenedIntent = shouldWiden
      ? this.widenParsedIntentForScarcity(parsedIntent, 1)
      : null;
    const widenedCandidates =
      shouldWiden && widenedIntent
        ? await this.matchingService.retrieveCandidates(
            input.userId,
            widenedIntent,
            take,
            {
              traceId: `${input.traceId}:widened`,
            },
          )
        : null;
    const selectedCandidates =
      widenedCandidates && widenedCandidates.length > candidates.length
        ? widenedCandidates
        : candidates;

    return {
      count: selectedCandidates.length,
      parsedIntent: widenedCandidates
        ? (widenedIntent ?? parsedIntent)
        : parsedIntent,
      candidates: selectedCandidates.map((candidate) => ({
        userId: candidate.userId,
        score: candidate.score,
        rationale: candidate.rationale,
      })),
      scarcity:
        candidates.length < scarcityThreshold
          ? {
              detected: true,
              originalCount: candidates.length,
              threshold: scarcityThreshold,
              widened: Boolean(widenedCandidates),
              widenedLevel: widenedCandidates ? 1 : 0,
              widenedCandidateCount: widenedCandidates?.length ?? null,
            }
          : {
              detected: false,
              originalCount: candidates.length,
              threshold: scarcityThreshold,
              widened: false,
              widenedLevel: 0,
              widenedCandidateCount: null,
            },
    };
  }

  async lookupAvailability(input: {
    userId: string;
    candidateUserIds?: string[];
  }) {
    if (!this.matchingService) {
      return {
        requester: null,
        candidates: [],
        reason: "matching_service_unavailable",
      };
    }

    return this.matchingService.lookupAvailabilityContext(
      input.userId,
      input.candidateUserIds ?? [],
    );
  }

  async searchCircles(input: { userId: string; limit?: number }) {
    if (!this.discoveryService) {
      return { groups: [], reason: "discovery_service_unavailable" };
    }

    const result = await this.discoveryService.suggestGroups(
      input.userId,
      Math.min(Math.max(input.limit ?? 3, 1), 5),
    );
    return {
      count: result.groups.length,
      groups: result.groups,
    };
  }

  async planGroup(input: {
    userId: string;
    threadId: string;
    traceId: string;
    text: string;
    groupSizeTarget?: number;
  }) {
    if (!this.intentsService) {
      return { planned: false, reason: "intents_service_unavailable" };
    }

    const groupSizeTarget = Math.min(
      Math.max(input.groupSizeTarget ?? 3, 2),
      4,
    );
    const intent = await this.intentsService.createIntentWithOverrides({
      userId: input.userId,
      rawText: input.text,
      traceId: input.traceId,
      agentThreadId: input.threadId,
      parsedIntentOverrides: {
        intentType: "group",
        groupSizeTarget,
      },
    });

    return {
      planned: true,
      intentId: intent.id,
      status: intent.status,
      groupSizeTarget,
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

  async sendIntroRequest(input: {
    intentId: string;
    recipientUserId: string;
    traceId: string;
    threadId?: string;
  }) {
    if (!this.intentsService) {
      return { sent: false, reason: "intents_service_unavailable" };
    }

    const result = await this.intentsService.sendIntentRequest({
      intentId: input.intentId,
      recipientUserId: input.recipientUserId,
      traceId: input.traceId,
      agentThreadId: input.threadId,
    });

    return {
      sent: result.status === "pending" || result.status === "accepted",
      ...result,
    };
  }

  async acceptIntro(input: { requestId: string; actorUserId: string }) {
    if (!this.inboxService) {
      return { accepted: false, reason: "inbox_service_unavailable" };
    }
    const result = await this.inboxService.updateStatus(
      input.requestId,
      "accepted",
      input.actorUserId,
    );
    await this.recordExecutionMemory(input.actorUserId, {
      summary:
        "Accepted a social intro request and opened the path to a real connection.",
      activities: ["accepted intro"],
      people:
        typeof result.request.senderUserId === "string"
          ? [result.request.senderUserId]
          : [],
      highSuccessPeople:
        typeof result.request.senderUserId === "string"
          ? [result.request.senderUserId]
          : [],
      context: {
        source: "agent_outcome_tool",
        outcome: "intro_accepted",
        requestId: result.request.id,
        status: result.request.status,
        intentId:
          "intentId" in result.request
            ? (result.request.intentId ?? null)
            : null,
      },
    });
    return {
      accepted: true,
      requestId: result.request.id,
      status: result.request.status,
      queued: Boolean("queued" in result && result.queued),
    };
  }

  async rejectIntro(input: { requestId: string; actorUserId: string }) {
    if (!this.inboxService) {
      return { rejected: false, reason: "inbox_service_unavailable" };
    }
    const result = await this.inboxService.updateStatus(
      input.requestId,
      "rejected",
      input.actorUserId,
    );
    await this.recordExecutionMemory(input.actorUserId, {
      summary:
        "Declined a social intro request because it was not the right fit right now.",
      activities: ["declined intro"],
      people:
        typeof result.request.senderUserId === "string"
          ? [result.request.senderUserId]
          : [],
      context: {
        source: "agent_outcome_tool",
        outcome: "intro_rejected",
        requestId: result.request.id,
        status: result.request.status,
        intentId:
          "intentId" in result.request
            ? (result.request.intentId ?? null)
            : null,
      },
    });
    return {
      rejected: true,
      requestId: result.request.id,
      status: result.request.status,
    };
  }

  async retractIntro(input: { requestId: string; actorUserId: string }) {
    if (!this.inboxService) {
      return { retracted: false, reason: "inbox_service_unavailable" };
    }
    const result = await this.inboxService.cancelByOriginator(
      input.requestId,
      input.actorUserId,
    );
    await this.recordExecutionMemory(input.actorUserId, {
      summary:
        "Retracted a pending social intro request to keep outreach aligned with the latest intent.",
      activities: ["retracted intro"],
      people:
        typeof result.request.recipientUserId === "string"
          ? [result.request.recipientUserId]
          : [],
      context: {
        source: "agent_outcome_tool",
        outcome: "intro_retracted",
        requestId: result.request.id,
        status: result.request.status,
        intentId:
          "intentId" in result.request
            ? (result.request.intentId ?? null)
            : null,
      },
    });
    return {
      retracted: true,
      requestId: result.request.id,
      status: result.request.status,
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

  async createCircle(input: {
    userId: string;
    title: string;
    description?: string;
    topicTags?: string[];
    targetSize?: number;
    kickoffPrompt?: string;
    timezone?: string;
  }) {
    if (!this.recurringCirclesService) {
      return {
        created: false,
        reason: "recurring_circles_service_unavailable",
      };
    }

    const title = this.normalizeTitle(input.title);
    if (!title) {
      return { created: false, reason: "missing_circle_title" };
    }
    const timezone = this.normalizeTimezone(input.timezone);
    const circle = await this.recurringCirclesService.createCircle(
      input.userId,
      {
        title,
        description: input.description?.trim() || undefined,
        visibility: "private",
        topicTags: (input.topicTags ?? [])
          .map((tag) => tag.trim())
          .filter((tag) => tag.length > 0)
          .slice(0, 8),
        targetSize: Math.min(Math.max(input.targetSize ?? 4, 2), 8),
        cadence: {
          kind: "weekly",
          days: [this.dayKeyForDate(new Date())],
          hour: 18,
          minute: 0,
          timezone,
          intervalWeeks: 1,
        },
        kickoffPrompt: input.kickoffPrompt?.trim() || undefined,
      },
    );
    await this.recordExecutionMemory(input.userId, {
      summary: `Created a recurring circle "${circle.title}" to turn social intent into a repeatable group outcome.`,
      topics: input.topicTags,
      activities: ["created circle"],
      context: {
        source: "agent_outcome_tool",
        outcome: "circle_created",
        circleId: circle.id,
        title: circle.title,
        targetSize: Math.min(Math.max(input.targetSize ?? 4, 2), 8),
      },
    });

    return {
      created: true,
      circleId: circle.id,
      title: circle.title,
      nextSessionAt: circle.nextSessionAt?.toISOString() ?? null,
    };
  }

  async joinCircle(input: {
    circleId: string;
    ownerUserId: string;
    userId: string;
    role?: "member" | "admin";
  }) {
    if (!this.recurringCirclesService) {
      return { joined: false, reason: "recurring_circles_service_unavailable" };
    }

    const member = await this.recurringCirclesService.addMember(
      input.circleId,
      input.ownerUserId,
      {
        userId: input.userId,
        role: input.role ?? "member",
      },
    );
    await this.recordExecutionMemory(input.userId, {
      summary:
        "Joined a recurring circle to turn the current social goal into an ongoing group connection.",
      activities: ["joined circle"],
      people: [input.ownerUserId],
      context: {
        source: "agent_outcome_tool",
        outcome: "circle_joined",
        circleId: member.circleId,
        role: member.role,
      },
    });

    return {
      joined: true,
      circleId: member.circleId,
      userId: member.userId,
      status: member.status,
      role: member.role,
    };
  }

  async patchProfile(input: {
    userId: string;
    consentGranted: boolean;
    consentSource?: string;
    profile?: {
      displayName?: string;
      bio?: string;
      city?: string;
      country?: string;
      visibility?: "public" | "limited" | "private";
      availabilityMode?:
        | "now"
        | "later_today"
        | "flexible"
        | "away"
        | "invisible";
    };
    globalRules?: Partial<{
      whoCanContact: "anyone" | "verified_only" | "trusted_only";
      reachable: "always" | "available_only" | "do_not_disturb";
      intentMode: "one_to_one" | "group" | "balanced";
      modality: "online" | "offline" | "either";
      languagePreferences: string[];
      requireVerifiedUsers: boolean;
      notificationMode: "immediate" | "digest" | "quiet";
      agentAutonomy: "manual" | "suggest_only" | "auto_non_risky";
      memoryMode: "minimal" | "standard" | "extended";
    }>;
  }) {
    if (!input.consentGranted) {
      return {
        patched: false,
        reason: "consent_required",
      };
    }

    const profilePatch =
      input.profile && Object.keys(input.profile).length > 0
        ? input.profile
        : null;
    const globalRulesPatch =
      input.globalRules && Object.keys(input.globalRules).length > 0
        ? input.globalRules
        : null;

    if (!profilePatch && !globalRulesPatch) {
      return {
        patched: false,
        reason: "empty_profile_patch",
      };
    }

    const profileResult =
      profilePatch && this.profilesService
        ? await this.profilesService.applyAgentProfilePatch(
            input.userId,
            profilePatch,
          )
        : null;
    const globalRulesResult =
      globalRulesPatch && this.personalizationService
        ? await this.personalizationService.patchGlobalRules(
            input.userId,
            globalRulesPatch,
          )
        : null;

    if (
      (profilePatch && !profileResult && !this.profilesService) ||
      (globalRulesPatch && !globalRulesResult && !this.personalizationService)
    ) {
      return {
        patched: false,
        reason: "profile_patch_services_unavailable",
      };
    }

    if (profilePatch && this.personalizationService) {
      await this.personalizationService.refreshProfileSummaryDocument?.(
        input.userId,
      );
    }

    if (this.personalizationService) {
      await this.recordExecutionMemory(input.userId, {
        summary:
          "Confirmed and saved updated profile defaults for future social planning.",
        activities: ["updated defaults"],
        context: {
          source: "agent_outcome_tool",
          outcome: "profile_patch_applied",
          consentSource: input.consentSource ?? null,
          profileFields: profilePatch ? Object.keys(profilePatch) : [],
          globalRuleFields: globalRulesPatch
            ? Object.keys(globalRulesPatch)
            : [],
        },
      });
    }

    return {
      patched: true,
      consentSource: input.consentSource ?? null,
      profile: profileResult,
      globalRules: globalRulesResult,
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

  private async recordExecutionMemory(
    userId: string,
    input: {
      summary: string;
      topics?: string[];
      activities?: string[];
      people?: string[];
      highSuccessPeople?: string[];
      context?: Record<string, unknown>;
    },
  ) {
    if (!this.personalizationService) {
      return;
    }

    const summary = input.summary.trim().slice(0, 1_000);
    if (!summary) {
      return;
    }

    await this.personalizationService.storeInteractionSummary(userId, {
      summary,
      safe: true,
      context: input.context,
    });

    const updates: Array<Promise<unknown>> = [];

    for (const topic of this.uniqueNormalized(input.topics, 6)) {
      updates.push(
        this.personalizationService.recordBehaviorSignal(userId, {
          edgeType: "recently_engaged_with",
          targetNode: { nodeType: "topic", label: topic },
          signalStrength: 0.3,
          feedbackType: "agent_outcome_topic",
          context: input.context,
        }),
      );
    }

    for (const activity of this.uniqueNormalized(input.activities, 6)) {
      updates.push(
        this.personalizationService.recordBehaviorSignal(userId, {
          edgeType: "recently_engaged_with",
          targetNode: { nodeType: "activity", label: activity },
          signalStrength: 0.28,
          feedbackType: "agent_outcome_activity",
          context: input.context,
        }),
      );
    }

    for (const personUserId of this.uniqueNormalized(input.people, 4)) {
      updates.push(
        this.personalizationService.recordBehaviorSignal(userId, {
          edgeType: "recently_engaged_with",
          targetNode: { nodeType: "person", label: `user:${personUserId}` },
          signalStrength: 0.22,
          feedbackType: "agent_outcome_person",
          context: input.context,
        }),
      );
    }

    for (const personUserId of this.uniqueNormalized(
      input.highSuccessPeople,
      4,
    )) {
      updates.push(
        this.personalizationService.recordBehaviorSignal(userId, {
          edgeType: "high_success_with",
          targetNode: { nodeType: "person", label: `user:${personUserId}` },
          signalStrength: 0.5,
          feedbackType: "agent_outcome_high_success_person",
          context: input.context,
        }),
      );
    }

    await Promise.all(updates);
    await this.personalizationService.refreshPreferenceMemoryDocument(userId);
  }

  private uniqueNormalized(values: string[] | undefined, limit: number) {
    return Array.from(
      new Set(
        (values ?? [])
          .map((value) => value.trim())
          .filter((value) => value.length > 0),
      ),
    ).slice(0, limit);
  }

  private widenParsedIntentForScarcity(
    input: {
      topics?: string[];
      activities?: string[];
      intentType?: string;
      modality?: string;
      timingConstraints?: string[];
      skillConstraints?: string[];
      vibeConstraints?: string[];
    },
    level: 1 | 2,
  ) {
    const widened = {
      ...input,
    };

    if (level >= 1) {
      if (widened.modality === "offline" || widened.modality === "online") {
        widened.modality = "either";
      }
      widened.timingConstraints = [];
      widened.skillConstraints = [];
      widened.vibeConstraints = [];
    }

    if (level >= 2) {
      widened.topics = [];
      widened.activities = [];
    }

    return widened;
  }
}
