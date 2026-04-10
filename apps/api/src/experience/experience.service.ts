import { Injectable } from "@nestjs/common";
import { AgentService } from "../agent/agent.service.js";
import { PrismaService } from "../database/prisma.service.js";
import { DiscoveryService } from "../discovery/discovery.service.js";
import { InboxService } from "../inbox/inbox.service.js";
import { IntentsService } from "../intents/intents.service.js";

type HomeNextAction =
  | "review_requests"
  | "open_matches"
  | "resume_intent"
  | "start_intent";

type ActivitySectionId =
  | "actionRequired"
  | "updates"
  | "activeIntents"
  | "suggestions"
  | "discoveryHighlights";

@Injectable()
export class ExperienceService {
  constructor(
    private readonly agentService: AgentService,
    private readonly prisma: PrismaService,
    private readonly discoveryService: DiscoveryService,
    private readonly inboxService: InboxService,
    private readonly intentsService: IntentsService,
  ) {}

  async getHomeSummary(userId: string) {
    const [threadSummary, pendingRequests, pendingIntents, passiveDiscovery] =
      await Promise.all([
        this.agentService.findPrimaryThreadSummaryForUser(userId),
        this.inboxService.listPendingRequests(userId),
        this.intentsService.summarizePendingIntents(userId, undefined, 3),
        this.discoveryService.getPassiveDiscovery(userId, 3),
      ]);

    const unreadNotificationCount = await this.prisma.notification.count({
      where: {
        recipientUserId: userId,
        isRead: false,
      },
    });

    const leadIntent = pendingIntents.intents[0] ?? null;
    const topSuggestion = passiveDiscovery.tonight.suggestions[0] ?? null;
    const coordinationTarget = await this.resolveHomeCoordinationTarget(
      userId,
      leadIntent?.intentId ?? null,
    );
    const coordination = this.deriveHomeCoordination({
      leadIntent,
      coordinationTarget,
    });
    const recovery = this.deriveHomeRecovery({
      leadIntent,
      topSuggestion,
    });
    const status = this.deriveHomeStatus({
      leadIntent,
      pendingRequestCount: pendingRequests.length,
      topSuggestion,
    });

    return {
      generatedAt: new Date().toISOString(),
      thread: threadSummary,
      status,
      counts: {
        activeIntents: pendingIntents.activeIntentCount,
        pendingRequests: pendingRequests.length,
        unreadNotifications: unreadNotificationCount,
        tonightSuggestions: passiveDiscovery.tonight.suggestions.length,
        reconnectCandidates: passiveDiscovery.reconnects.reconnects.length,
      },
      spotlight: {
        coordination,
        recovery,
        leadIntent:
          leadIntent == null
            ? null
            : {
                intentId: leadIntent.intentId,
                rawText: leadIntent.rawText,
                status: leadIntent.status,
                requests: leadIntent.requests,
              },
        topSuggestion:
          topSuggestion == null
            ? null
            : {
                userId: topSuggestion.userId,
                displayName: topSuggestion.displayName,
                score: topSuggestion.score,
                reason: topSuggestion.reason,
              },
      },
    };
  }

  private deriveHomeCoordination(input: {
    leadIntent: {
      intentId: string;
      rawText: string;
      status: string;
      requests: {
        pending: number;
        accepted: number;
        rejected: number;
        expired: number;
        cancelled: number;
      };
    } | null;
    coordinationTarget: {
      chatId: string | null;
    } | null;
  }) {
    if (!input.leadIntent) {
      return null;
    }

    if (input.leadIntent.requests.accepted > 0) {
      return {
        title: "Move the match forward",
        body:
          input.leadIntent.requests.accepted === 1
            ? "You have 1 accepted connection ready for coordination."
            : `You have ${input.leadIntent.requests.accepted} accepted connections ready for coordination.`,
        actionLabel: input.coordinationTarget?.chatId
          ? "Open chat"
          : "Open search",
        targetChatId: input.coordinationTarget?.chatId ?? null,
      };
    }

    if (input.leadIntent.requests.pending > 0) {
      return {
        title: "Waiting on replies",
        body:
          input.leadIntent.requests.pending === 1
            ? "1 invite is still active on this search."
            : `${input.leadIntent.requests.pending} invites are still active on this search.`,
        actionLabel: "Review search",
        targetChatId: null,
      };
    }

    return null;
  }

  private async resolveHomeCoordinationTarget(
    userId: string,
    intentId: string | null,
  ) {
    if (!intentId) {
      return null;
    }

    const acceptedRequest = await this.prisma.intentRequest.findFirst({
      where: {
        intentId,
        senderUserId: userId,
        status: "accepted",
      },
      orderBy: {
        respondedAt: "desc",
      },
      select: {
        recipientUserId: true,
      },
    });

    if (!acceptedRequest?.recipientUserId) {
      return null;
    }

    const chat = await this.prisma.chat.findFirst({
      where: {
        type: "dm",
        connection: {
          participants: {
            some: {
              userId,
            },
          },
        },
        AND: [
          {
            connection: {
              participants: {
                some: {
                  userId: acceptedRequest.recipientUserId,
                },
              },
            },
          },
        ],
      },
      select: {
        id: true,
      },
    });

    return {
      chatId: chat?.id ?? null,
    };
  }

  private deriveHomeRecovery(input: {
    leadIntent: {
      intentId: string;
      rawText: string;
      status: string;
      requests: {
        pending: number;
        accepted: number;
        rejected: number;
        expired: number;
        cancelled: number;
      };
    } | null;
    topSuggestion: {
      displayName: string;
      reason: string;
      score: number;
      userId: string;
    } | null;
  }) {
    if (!input.leadIntent) {
      return null;
    }

    if (input.leadIntent.requests.accepted > 0 || input.topSuggestion) {
      return null;
    }

    return {
      title: "Shift the search slightly",
      body: "If this stays thin, widen timing or switch between 1:1 and a small group.",
      actionLabel: "Adjust search",
    };
  }

  async getActivitySummary(userId: string) {
    const [
      pendingRequests,
      pendingIntents,
      passiveDiscovery,
      inboxSuggestions,
    ] = await Promise.all([
      this.inboxService.listPendingRequests(userId),
      this.intentsService.summarizePendingIntents(userId, undefined, 4),
      this.discoveryService.getPassiveDiscovery(userId, 3),
      this.discoveryService.getInboxSuggestions(userId, 4),
    ]);

    const notifications = await this.prisma.notification.findMany({
      where: {
        recipientUserId: userId,
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 12,
      select: {
        id: true,
        body: true,
        type: true,
        channel: true,
        isRead: true,
        createdAt: true,
      },
    });

    return {
      generatedAt: new Date().toISOString(),
      counts: {
        unreadNotifications: notifications.filter((item) => !item.isRead)
          .length,
        pendingRequests: pendingRequests.length,
        activeIntents: pendingIntents.activeIntentCount,
        discoverySuggestions: inboxSuggestions.suggestions.length,
      },
      orderedSections: [
        {
          id: "actionRequired" as const satisfies ActivitySectionId,
          title: "Action required",
        },
        {
          id: "updates" as const satisfies ActivitySectionId,
          title: "Updates",
        },
        {
          id: "activeIntents" as const satisfies ActivitySectionId,
          title: "Active searches",
        },
        {
          id: "suggestions" as const satisfies ActivitySectionId,
          title: "Suggestions",
        },
        {
          id: "discoveryHighlights" as const satisfies ActivitySectionId,
          title: "Around you",
        },
      ],
      sections: {
        actionRequired: pendingRequests.slice(0, 6).map((request) => ({
          id: request.id,
          kind: "request" as const,
          priority: request.status === "pending" ? 100 : 80,
          eyebrow: request.status === "pending" ? "Request" : "Request update",
          title:
            request.status === "pending"
              ? "New request waiting"
              : request.status === "accepted"
                ? "Request accepted"
                : request.status === "rejected"
                  ? "Request declined"
                  : "Request updated",
          body: this.describeRequestBody(request),
          status: request.status,
          intentId: request.intentId,
          createdAt: request.sentAt.toISOString(),
          cardSummary:
            typeof request === "object" &&
            request !== null &&
            "cardSummary" in request
              ? request.cardSummary
              : null,
        })),
        updates: notifications.map((notification) => ({
          id: notification.id,
          kind: "notification" as const,
          priority: notification.isRead ? 35 : 60,
          eyebrow: "System",
          title: this.describeNotificationTitle(notification.type),
          body: notification.body,
          type: notification.type,
          channel: notification.channel,
          isRead: notification.isRead,
          createdAt: notification.createdAt.toISOString(),
        })),
        activeIntents: pendingIntents.intents.map((intent) => ({
          intentId: intent.intentId,
          priority:
            intent.requests.accepted > 0
              ? 75
              : intent.requests.pending > 0
                ? 65
                : 50,
          eyebrow: intent.status,
          title: intent.rawText,
          body: `${intent.requests.pending} pending · ${intent.requests.accepted} accepted · ${intent.requests.rejected + intent.requests.expired + intent.requests.cancelled} closed`,
          rawText: intent.rawText,
          status: intent.status,
          ageMinutes: intent.ageMinutes,
          requests: intent.requests,
        })),
        suggestions: inboxSuggestions.suggestions.map((suggestion, index) => ({
          id: `suggestion:${index}:${suggestion.title}`,
          priority: Math.max(20, Math.round(suggestion.score * 40)),
          eyebrow: `${Math.round(suggestion.score * 100)}% match`,
          title: suggestion.title,
          body: suggestion.reason,
          score: suggestion.score,
          scoreLabel: `${Math.round(suggestion.score * 100)}% match`,
        })),
        discoveryHighlights: [
          {
            id: "summary:tonight",
            priority: 30,
            eyebrow: "System",
            title: "Tonight is active",
            body: `${passiveDiscovery.tonight.suggestions.length} people and ${passiveDiscovery.groups.groups.length} group options are available.`,
          },
          {
            id: "summary:reconnects",
            priority: 25,
            eyebrow: "System",
            title: "Reconnects available",
            body: `${passiveDiscovery.reconnects.reconnects.length} people are worth revisiting.`,
          },
        ],
        discoverySnapshot: {
          tonightCount: passiveDiscovery.tonight.suggestions.length,
          groupCount: passiveDiscovery.groups.groups.length,
          reconnectCount: passiveDiscovery.reconnects.reconnects.length,
        },
      },
    };
  }

  private describeNotificationTitle(type: string) {
    switch (type) {
      case "request_created":
        return "New request";
      case "request_accepted":
        return "Request accepted";
      case "request_rejected":
        return "Request declined";
      case "chat_message":
        return "New message";
      default:
        return "Update";
    }
  }

  private describeRequestBody(request: {
    status: string;
    cardSummary?: {
      who?: string;
      what?: string;
      when?: string;
    } | null;
  }) {
    const parts = [
      request.cardSummary?.who,
      request.cardSummary?.what,
      request.cardSummary?.when,
    ].filter((value): value is string => Boolean(value && value.trim()));

    if (parts.length > 0) {
      return parts.join(" · ");
    }

    if (request.status === "pending") {
      return "Someone is waiting for your response.";
    }

    return `This request is now ${request.status}.`;
  }

  async getBootstrapSummary(userId: string) {
    const [home, activity] = await Promise.all([
      this.getHomeSummary(userId),
      this.getActivitySummary(userId),
    ]);

    return {
      generatedAt: new Date().toISOString(),
      home,
      activity: {
        counts: activity.counts,
      },
    };
  }

  private deriveHomeStatus(input: {
    leadIntent: {
      intentId: string;
      rawText: string;
      status: string;
      requests: {
        pending: number;
        accepted: number;
        rejected: number;
        expired: number;
        cancelled: number;
      };
    } | null;
    pendingRequestCount: number;
    topSuggestion: {
      displayName: string;
      reason: string;
      score: number;
      userId: string;
    } | null;
  }): {
    title: string;
    body: string;
    tone: "active" | "waiting" | "recovery" | "idle";
    nextAction: {
      kind: HomeNextAction;
      label: string;
    };
  } {
    if (input.pendingRequestCount > 0) {
      return {
        title: "People are waiting",
        body:
          input.pendingRequestCount === 1
            ? "You have 1 pending request that needs a response."
            : `You have ${input.pendingRequestCount} pending requests that need a response.`,
        tone: "waiting",
        nextAction: {
          kind: "review_requests",
          label: "Review requests",
        },
      };
    }

    if (input.leadIntent && input.leadIntent.requests.accepted > 0) {
      return {
        title: "A match is moving",
        body: `${input.leadIntent.requests.accepted} accepted connection${input.leadIntent.requests.accepted === 1 ? "" : "s"} for "${input.leadIntent.rawText}".`,
        tone: "active",
        nextAction: {
          kind: "open_matches",
          label: "Open matches",
        },
      };
    }

    if (input.leadIntent) {
      return {
        title: "Search is active",
        body: input.topSuggestion
          ? `Still working on "${input.leadIntent.rawText}".`
          : `Nothing strong enough yet for "${input.leadIntent.rawText}".`,
        tone: input.topSuggestion ? "active" : "recovery",
        nextAction: {
          kind: "resume_intent",
          label: input.topSuggestion ? "Review search" : "Adjust search",
        },
      };
    }

    if (input.topSuggestion) {
      return {
        title: "People are available",
        body: `${input.topSuggestion.displayName} looks promising right now.`,
        tone: "active",
        nextAction: {
          kind: "open_matches",
          label: "See suggestions",
        },
      };
    }

    return {
      title: "Start something social",
      body: "Describe what you want to do and the system will route from there.",
      tone: "idle",
      nextAction: {
        kind: "start_intent",
        label: "Start a plan",
      },
    };
  }
}
