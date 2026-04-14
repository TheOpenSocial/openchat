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

type ExperienceHomeLeadIntent = {
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
};

type ExperienceTopSuggestion = {
  displayName: string;
  reason: string;
  score: number;
  userId: string;
};

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
    leadIntent: ExperienceHomeLeadIntent | null;
    coordinationTarget: {
      chatId: string | null;
    } | null;
  }) {
    if (!input.leadIntent) {
      return null;
    }

    if (input.leadIntent.requests.accepted > 0) {
      return {
        variant: "accepted" as const,
        title: "Move the match forward",
        body:
          input.leadIntent.requests.accepted === 1
            ? "One accepted match is ready. The fastest next move is to coordinate directly."
            : `${input.leadIntent.requests.accepted} accepted matches are ready. The fastest next move is to coordinate directly.`,
        actionLabel: input.coordinationTarget?.chatId
          ? "Open chat"
          : "Open search",
        targetChatId: input.coordinationTarget?.chatId ?? null,
      };
    }

    if (input.leadIntent.requests.pending > 0) {
      return {
        variant: "waiting" as const,
        title: "Waiting on replies",
        body:
          input.leadIntent.requests.pending === 1
            ? "One invite is still live. Let it breathe before widening the search."
            : `${input.leadIntent.requests.pending} invites are still live. Let those responses settle before changing direction.`,
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
    leadIntent: ExperienceHomeLeadIntent | null;
    topSuggestion: ExperienceTopSuggestion | null;
  }) {
    if (!input.leadIntent) {
      return null;
    }

    if (input.leadIntent.requests.accepted > 0 || input.topSuggestion) {
      return null;
    }

    return {
      title: "Widen the timing first",
      body: "Nothing is strong enough yet. First widen timing or availability before changing the format.",
      actionLabel: "Adjust search",
      secondaryLabel: "If that still looks thin, try a small group next.",
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
        metadata: true,
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
          subtitle: "Requests and momentum that need a response now.",
          emphasis: "urgent" as const,
        },
        {
          id: "updates" as const satisfies ActivitySectionId,
          title: "Updates",
          subtitle: "Unread changes and fresh system signals.",
          emphasis: "active" as const,
        },
        {
          id: "activeIntents" as const satisfies ActivitySectionId,
          title: "Active searches",
          subtitle: "Searches already in motion.",
          emphasis: "active" as const,
        },
        {
          id: "suggestions" as const satisfies ActivitySectionId,
          title: "Suggestions",
          subtitle: "People and moves worth considering next.",
          emphasis: "passive" as const,
        },
        {
          id: "discoveryHighlights" as const satisfies ActivitySectionId,
          title: "Around you",
          subtitle: "Ambient context from nearby activity.",
          emphasis: "passive" as const,
        },
      ],
      sections: {
        actionRequired: pendingRequests.slice(0, 6).map((request) => ({
          id: request.id,
          kind: "request" as const,
          priority: request.status === "pending" ? 120 : 105,
          eyebrow: request.status === "pending" ? "Request" : "Request update",
          title:
            request.status === "pending"
              ? "Respond to this request"
              : request.status === "accepted"
                ? "A request just opened up"
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
          priority: notification.isRead
            ? 45
            : this.isProtocolNotification(notification)
              ? 78
              : notification.type === "chat_message"
                ? 85
                : notification.type === "request_accepted"
                  ? 82
                  : 70,
          eyebrow: this.describeNotificationEyebrow(notification),
          title: this.describeNotificationTitle(
            notification.type,
            notification.metadata,
          ),
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
              ? 95
              : intent.requests.pending > 0
                ? 68
                : 55,
          eyebrow: intent.requests.accepted > 0 ? "Coordination" : "Search",
          title: intent.rawText,
          body:
            intent.requests.accepted > 0
              ? `${intent.requests.accepted} accepted · move this into conversation next.`
              : intent.requests.pending > 0
                ? `${intent.requests.pending} pending · wait for replies before widening it.`
                : `${intent.requests.rejected + intent.requests.expired + intent.requests.cancelled} closed · this search may need adjustment.`,
          rawText: intent.rawText,
          status: intent.status,
          ageMinutes: intent.ageMinutes,
          requests: intent.requests,
        })),
        suggestions: inboxSuggestions.suggestions.map((suggestion, index) => ({
          id: `suggestion:${index}:${suggestion.title}`,
          priority: Math.max(25, Math.round(suggestion.score * 38)),
          eyebrow: `${Math.round(suggestion.score * 100)}% match`,
          title: suggestion.title,
          body: suggestion.reason,
          score: suggestion.score,
          scoreLabel: `${Math.round(suggestion.score * 100)}% match`,
        })),
        discoveryHighlights: [
          {
            id: "summary:tonight",
            priority: 28,
            eyebrow: "System",
            title: "Tonight is active",
            body: `${passiveDiscovery.tonight.suggestions.length} people and ${passiveDiscovery.groups.groups.length} group options are available.`,
          },
          {
            id: "summary:reconnects",
            priority: 22,
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

  private describeNotificationTitle(type: string, metadata?: unknown) {
    const provenance = this.readNotificationProvenance(metadata);
    if (provenance?.source === "protocol") {
      switch (provenance.action) {
        case "circle.create":
          return "Circle created";
        case "circle.join":
          return "Circle updated";
        case "circle.leave":
          return "Circle membership changed";
        case "request.send":
          return "Integration request";
        case "request.accept":
          return "Integration request accepted";
        case "request.reject":
          return "Integration request declined";
        default:
          return "Integration update";
      }
    }
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

  private describeNotificationEyebrow(notification: {
    type: string;
    metadata?: unknown;
  }) {
    const provenance = this.readNotificationProvenance(notification.metadata);
    if (provenance?.source === "protocol") {
      return "Integration";
    }
    return "System";
  }

  private isProtocolNotification(notification: { metadata?: unknown }) {
    return (
      this.readNotificationProvenance(notification.metadata)?.source ===
      "protocol"
    );
  }

  private readNotificationProvenance(metadata: unknown): {
    source?: string;
    action?: string;
  } | null {
    if (!metadata || typeof metadata !== "object") {
      return null;
    }
    const value = (metadata as { provenance?: unknown }).provenance;
    if (!value || typeof value !== "object") {
      return null;
    }
    const provenance = value as { source?: unknown; action?: unknown };
    return {
      source:
        typeof provenance.source === "string" ? provenance.source : undefined,
      action:
        typeof provenance.action === "string" ? provenance.action : undefined,
    };
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
    leadIntent: ExperienceHomeLeadIntent | null;
    pendingRequestCount: number;
    topSuggestion: ExperienceTopSuggestion | null;
  }): {
    eyebrow: string;
    title: string;
    body: string;
    tone: "active" | "waiting" | "recovery" | "idle";
    footnote: string | null;
    nextAction: {
      kind: HomeNextAction;
      label: string;
    };
  } {
    if (input.pendingRequestCount > 0) {
      return {
        eyebrow: "Needs attention",
        title: "People are waiting",
        body:
          input.pendingRequestCount === 1
            ? "One request needs a response before the search can move forward."
            : `${input.pendingRequestCount} requests need responses before the search can move forward.`,
        tone: "waiting",
        footnote: "Handle requests first, then return to matching.",
        nextAction: {
          kind: "review_requests",
          label: "Review requests",
        },
      };
    }

    if (input.leadIntent && input.leadIntent.requests.accepted > 0) {
      return {
        eyebrow: "Coordination is live",
        title: "A match is moving",
        body: `${input.leadIntent.requests.accepted} accepted connection${input.leadIntent.requests.accepted === 1 ? "" : "s"} for "${input.leadIntent.rawText}".`,
        tone: "active",
        footnote: "The next step is direct coordination, not more matching.",
        nextAction: {
          kind: "open_matches",
          label: "Open matches",
        },
      };
    }

    if (input.leadIntent) {
      return {
        eyebrow: input.topSuggestion
          ? "Search is active"
          : "Search needs adjustment",
        title: "Search is active",
        body: input.topSuggestion
          ? `Best direction so far: keep "${input.leadIntent.rawText}" active while reviewing the strongest lead.`
          : `Nothing strong enough yet for "${input.leadIntent.rawText}". Widen timing before switching formats.`,
        tone: input.topSuggestion ? "active" : "recovery",
        footnote: input.topSuggestion
          ? "Review the strongest lead before changing the search."
          : "First widen timing, then try a small group if needed.",
        nextAction: {
          kind: "resume_intent",
          label: input.topSuggestion ? "Review search" : "Adjust search",
        },
      };
    }

    if (input.topSuggestion) {
      return {
        eyebrow: "Best lead available",
        title: "People are available",
        body: `${input.topSuggestion.displayName} looks promising right now.`,
        tone: "active",
        footnote: "Review the strongest lead before starting a new search.",
        nextAction: {
          kind: "open_matches",
          label: "See suggestions",
        },
      };
    }

    return {
      eyebrow: "Start here",
      title: "Start something social",
      body: "Describe what you want to do and the system will route from there.",
      tone: "idle",
      footnote: null,
      nextAction: {
        kind: "start_intent",
        label: "Start a plan",
      },
    };
  }
}
