import { Injectable } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service.js";
import { MatchingService } from "../matching/matching.service.js";
import { PersonalizationService } from "../personalization/personalization.service.js";
import { AgentService } from "../agent/agent.service.js";
import { InboxService } from "../inbox/inbox.service.js";

interface DiscoveryRankComponents {
  semantic: number;
  lifeGraph: number;
  policy: number;
  recency: number;
  final: number;
}

interface RankedDiscoveryUserSuggestion {
  userId: string;
  displayName: string;
  score: number;
  components: DiscoveryRankComponents;
  reason: string;
}

interface DiscoverySuggestionEnvelope {
  userId: string;
  generatedAt: string;
  rankingModel: {
    name: string;
    weights: Record<string, number>;
  };
}

const TONIGHT_HORIZON_HOURS = 24;

@Injectable()
export class DiscoveryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly matchingService: MatchingService,
    private readonly personalizationService: PersonalizationService,
    private readonly agentService: AgentService,
    private readonly inboxService: InboxService,
  ) {}

  async suggestTonight(userId: string, limit = 3) {
    const cappedLimit = this.normalizeLimit(limit, 3);
    const [seed, globalRules] = await Promise.all([
      this.loadUserDiscoverySeed(userId),
      this.personalizationService.getGlobalRules(userId),
    ]);

    const candidates = await this.matchingService.retrieveCandidates(
      userId,
      {
        topics: seed.topics.slice(0, 4),
        activities: seed.activities.slice(0, 3),
        intentType: "group",
        modality: globalRules.modality,
        timingConstraints: ["tonight"],
        vibeConstraints: ["chill"],
      },
      Math.max(cappedLimit * 4, 8),
    );
    if (candidates.length === 0) {
      return {
        ...this.baseEnvelope(userId),
        seedTopics: seed.topics.slice(0, 5),
        suggestions: [] as RankedDiscoveryUserSuggestion[],
      };
    }

    const candidateUsers = await this.loadUsersById(
      candidates.map((candidate) => candidate.userId),
    );
    const ranked = candidates
      .map((candidate) =>
        this.rankDiscoveryCandidate(
          candidate,
          candidateUsers.get(candidate.userId),
        ),
      )
      .filter(
        (candidate): candidate is RankedDiscoveryUserSuggestion =>
          candidate !== null,
      )
      .sort((a, b) => b.score - a.score)
      .slice(0, cappedLimit);

    return {
      ...this.baseEnvelope(userId),
      seedTopics: seed.topics.slice(0, 5),
      suggestions: ranked,
    };
  }

  async suggestActiveIntentsOrUsers(
    userId: string,
    limit = 5,
    fallbackUsers: RankedDiscoveryUserSuggestion[] = [],
  ) {
    const cappedLimit = this.normalizeLimit(limit, 5);
    const [seed, activeIntents] = await Promise.all([
      this.loadUserDiscoverySeed(userId),
      this.prisma.intent.findMany({
        where: {
          userId: { not: userId },
          status: {
            in: ["matching", "fanout", "partial"],
          },
          createdAt: {
            gte: new Date(Date.now() - TONIGHT_HORIZON_HOURS * 60 * 60_000),
          },
        },
        select: {
          id: true,
          userId: true,
          status: true,
          parsedIntent: true,
          createdAt: true,
        },
        orderBy: {
          createdAt: "desc",
        },
        take: 60,
      }),
    ]);

    const intentOwnerIds = Array.from(
      new Set(activeIntents.map((intent) => intent.userId)),
    );
    const intentOwners =
      intentOwnerIds.length === 0
        ? []
        : await this.prisma.user.findMany({
            where: {
              id: {
                in: intentOwnerIds,
              },
            },
            select: {
              id: true,
              displayName: true,
            },
          });
    const ownerNameById = new Map(
      intentOwners.map((owner) => [owner.id, owner.displayName]),
    );
    const discoveryLabels = new Set(seed.topics);

    const intentSuggestions = activeIntents
      .map((intent) => {
        const parsed =
          (intent.parsedIntent as {
            topics?: string[];
            activities?: string[];
            modality?: string;
          } | null) ?? {};
        const labels = [
          ...(parsed.topics ?? []),
          ...(parsed.activities ?? []),
        ].map((label) => label.toLowerCase());
        const overlapCount = labels.filter((label) =>
          discoveryLabels.has(label),
        ).length;
        const semantic = this.clampUnitInterval(overlapCount / 3);
        const lifeGraph = 0.45 + Math.min(0.4, overlapCount * 0.1);
        const policy = parsed.modality === "offline" ? 0.7 : 0.82;
        const recency = this.scoreRecencyByDate(intent.createdAt);
        const score = this.combineDiscoveryScore({
          semantic,
          lifeGraph,
          policy,
          recency,
        });

        return {
          type: "intent",
          intentId: intent.id,
          ownerUserId: intent.userId,
          ownerDisplayName: ownerNameById.get(intent.userId) ?? "Someone",
          status: intent.status,
          score,
          createdAt: intent.createdAt.toISOString(),
          overlapCount,
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, cappedLimit);

    if (intentSuggestions.length >= cappedLimit) {
      return {
        ...this.baseEnvelope(userId),
        items: intentSuggestions,
      };
    }

    const remaining = cappedLimit - intentSuggestions.length;
    const userFallback = fallbackUsers.slice(0, remaining).map((candidate) => ({
      type: "user",
      userId: candidate.userId,
      displayName: candidate.displayName,
      score: candidate.score,
      reason: candidate.reason,
    }));

    return {
      ...this.baseEnvelope(userId),
      items: [...intentSuggestions, ...userFallback],
    };
  }

  async suggestGroups(
    userId: string,
    limit = 3,
    tonightSuggestions: RankedDiscoveryUserSuggestion[] = [],
  ) {
    const cappedLimit = this.normalizeLimit(limit, 3);
    const baseSuggestions =
      tonightSuggestions.length > 0
        ? tonightSuggestions
        : (await this.suggestTonight(userId, Math.max(cappedLimit * 3, 8)))
            .suggestions;
    if (baseSuggestions.length === 0) {
      return {
        ...this.baseEnvelope(userId),
        groups: [] as Array<Record<string, unknown>>,
      };
    }

    const candidateIds = baseSuggestions.map((candidate) => candidate.userId);
    const [interests, topics] = await Promise.all([
      this.prisma.userInterest.findMany({
        where: {
          userId: {
            in: candidateIds,
          },
        },
        select: {
          userId: true,
          normalizedLabel: true,
        },
      }),
      this.prisma.userTopic.findMany({
        where: {
          userId: {
            in: candidateIds,
          },
        },
        select: {
          userId: true,
          normalizedLabel: true,
        },
      }),
    ]);

    const scoreByUser = new Map(
      baseSuggestions.map((candidate) => [candidate.userId, candidate.score]),
    );
    const labelsByGroup = new Map<string, Set<string>>();
    for (const row of [...interests, ...topics]) {
      const label = row.normalizedLabel.toLowerCase();
      const existing = labelsByGroup.get(label) ?? new Set<string>();
      existing.add(row.userId);
      labelsByGroup.set(label, existing);
    }

    const groups = Array.from(labelsByGroup.entries())
      .filter(([, participants]) => participants.size >= 2)
      .map(([label, participants]) => {
        const orderedParticipants = Array.from(participants)
          .sort((a, b) => (scoreByUser.get(b) ?? 0) - (scoreByUser.get(a) ?? 0))
          .slice(0, 4);
        const averageParticipantScore =
          orderedParticipants.reduce(
            (sum, participant) => sum + (scoreByUser.get(participant) ?? 0),
            0,
          ) / orderedParticipants.length;
        const participantDensity = this.clampUnitInterval(
          orderedParticipants.length / 4,
        );
        const groupScore = this.combineDiscoveryScore({
          semantic: averageParticipantScore,
          lifeGraph: averageParticipantScore,
          policy: 0.78,
          recency: participantDensity,
        });
        return {
          title: `${this.capitalizeLabel(label)} tonight`,
          topic: label,
          participantUserIds: orderedParticipants,
          score: groupScore,
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, cappedLimit);

    return {
      ...this.baseEnvelope(userId),
      groups,
    };
  }

  async suggestReconnects(userId: string, limit = 5) {
    const cappedLimit = this.normalizeLimit(limit, 5);
    if (!this.prisma.connectionParticipant?.findMany) {
      return {
        ...this.baseEnvelope(userId),
        reconnects: [] as Array<Record<string, unknown>>,
      };
    }

    const senderConnections = await this.prisma.connectionParticipant.findMany({
      where: {
        userId,
      },
      select: {
        connectionId: true,
        connection: {
          select: {
            createdAt: true,
          },
        },
      },
      take: 250,
      orderBy: {
        joinedAt: "desc",
      },
    });
    if (senderConnections.length === 0) {
      return {
        ...this.baseEnvelope(userId),
        reconnects: [] as Array<Record<string, unknown>>,
      };
    }

    const connectionDateById = new Map(
      senderConnections.map((row) => [
        row.connectionId,
        row.connection.createdAt,
      ]),
    );
    const peers = await this.prisma.connectionParticipant.findMany({
      where: {
        connectionId: {
          in: senderConnections.map((row) => row.connectionId),
        },
        userId: {
          not: userId,
        },
      },
      select: {
        userId: true,
        connectionId: true,
      },
      take: 1000,
    });
    if (peers.length === 0) {
      return {
        ...this.baseEnvelope(userId),
        reconnects: [] as Array<Record<string, unknown>>,
      };
    }

    const peerStats = new Map<
      string,
      { interactionCount: number; lastInteractionAt: Date | null }
    >();
    for (const peer of peers) {
      const existing = peerStats.get(peer.userId) ?? {
        interactionCount: 0,
        lastInteractionAt: null,
      };
      const connectionDate = connectionDateById.get(peer.connectionId) ?? null;
      existing.interactionCount += 1;
      if (
        connectionDate &&
        (!existing.lastInteractionAt ||
          connectionDate > existing.lastInteractionAt)
      ) {
        existing.lastInteractionAt = connectionDate;
      }
      peerStats.set(peer.userId, existing);
    }

    const peerIds = Array.from(peerStats.keys());
    const blocks = await this.prisma.block.findMany({
      where: {
        OR: [
          {
            blockerUserId: userId,
            blockedUserId: {
              in: peerIds,
            },
          },
          {
            blockerUserId: {
              in: peerIds,
            },
            blockedUserId: userId,
          },
        ],
      },
      select: {
        blockerUserId: true,
        blockedUserId: true,
      },
    });
    const blockedPeerIds = new Set<string>();
    for (const block of blocks) {
      if (block.blockerUserId === userId) {
        blockedPeerIds.add(block.blockedUserId);
      } else {
        blockedPeerIds.add(block.blockerUserId);
      }
    }

    const peerUsers = await this.prisma.user.findMany({
      where: {
        id: {
          in: peerIds.filter((peerId) => !blockedPeerIds.has(peerId)),
        },
      },
      select: {
        id: true,
        displayName: true,
        profile: {
          select: {
            lastActiveAt: true,
            trustScore: true,
            moderationState: true,
          },
        },
      },
    });

    const highSuccessByName = await this.loadHighSuccessWeightsByName(userId);
    const reconnects = peerUsers
      .map((peer) => {
        const stats = peerStats.get(peer.id);
        const interactionCount = stats?.interactionCount ?? 0;
        const interactionDate = stats?.lastInteractionAt ?? null;
        const profileDate = peer.profile?.lastActiveAt ?? null;
        const recency = this.scoreRecencyByDate(
          interactionDate && profileDate
            ? interactionDate > profileDate
              ? interactionDate
              : profileDate
            : (interactionDate ?? profileDate ?? null),
        );
        const semantic = this.clampUnitInterval(0.42 + interactionCount * 0.12);
        const lifeGraph = this.clampUnitInterval(
          highSuccessByName.get(peer.displayName.toLowerCase()) ?? 0.48,
        );
        const policy = this.computePolicyScore({
          trustScore: Number(peer.profile?.trustScore ?? 0),
          moderationState: peer.profile?.moderationState ?? "clean",
        });
        const score = this.combineDiscoveryScore({
          semantic,
          lifeGraph,
          policy,
          recency,
        });

        return {
          userId: peer.id,
          displayName: peer.displayName,
          interactionCount,
          lastInteractionAt: interactionDate?.toISOString() ?? null,
          score,
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, cappedLimit);

    return {
      ...this.baseEnvelope(userId),
      reconnects,
    };
  }

  async getPassiveDiscovery(userId: string, limit = 3) {
    const tonight = await this.suggestTonight(userId, limit);
    const [activeIntentsOrUsers, groups, reconnects] = await Promise.all([
      this.suggestActiveIntentsOrUsers(userId, limit + 2, tonight.suggestions),
      this.suggestGroups(userId, limit, tonight.suggestions),
      this.suggestReconnects(userId, limit + 2),
    ]);

    return {
      ...this.baseEnvelope(userId),
      tonight,
      activeIntentsOrUsers,
      groups,
      reconnects,
    };
  }

  async getInboxSuggestions(userId: string, limit = 3) {
    const cappedLimit = this.normalizeLimit(limit, 3);
    const [pendingRequests, reconnects, tonight] = await Promise.all([
      this.inboxService.listPendingRequests(userId),
      this.suggestReconnects(userId, cappedLimit),
      this.suggestTonight(userId, cappedLimit),
    ]);

    const suggestions: Array<{ title: string; reason: string; score: number }> =
      [];
    if (pendingRequests.length > 0) {
      const previewNames = pendingRequests
        .slice(0, 2)
        .map((request) =>
          typeof request === "object" &&
          request !== null &&
          "cardSummary" in request &&
          typeof request.cardSummary === "object" &&
          request.cardSummary !== null &&
          "who" in request.cardSummary &&
          typeof request.cardSummary.who === "string"
            ? request.cardSummary.who
            : "someone",
        )
        .join(", ");
      suggestions.push({
        title: "Pending invites",
        reason:
          pendingRequests.length === 1
            ? `You have 1 pending request from ${previewNames}.`
            : `You have ${pendingRequests.length} pending requests including ${previewNames}.`,
        score: 0.9,
      });
    }

    for (const reconnect of reconnects.reconnects.slice(0, cappedLimit)) {
      suggestions.push({
        title: `Reconnect with ${String(reconnect.displayName)}`,
        reason: "Strong prior interaction signal and recent activity.",
        score: Number(reconnect.score ?? 0.5),
      });
    }
    for (const tonightSuggestion of tonight.suggestions.slice(0, cappedLimit)) {
      suggestions.push({
        title: `${tonightSuggestion.displayName} is active tonight`,
        reason: tonightSuggestion.reason,
        score: tonightSuggestion.score,
      });
    }

    return {
      ...this.baseEnvelope(userId),
      pendingRequestCount: pendingRequests.length,
      suggestions: suggestions
        .sort((a, b) => b.score - a.score)
        .slice(0, cappedLimit + 1),
    };
  }

  async publishAgentRecommendations(
    userId: string,
    input: {
      threadId?: string;
      limit?: number;
    } = {},
  ) {
    const discovery = await this.getPassiveDiscovery(userId, input.limit ?? 3);
    const threadId =
      input.threadId ?? (await this.findLatestAgentThreadId(userId));
    const message = this.composeAgentRecommendationMessage(discovery);

    let delivered = false;
    if (threadId) {
      await this.agentService.appendWorkflowUpdate(threadId, message, {
        category: "discovery_recommendations",
        generatedAt: discovery.generatedAt,
        tonightCount: discovery.tonight.suggestions.length,
        reconnectCount: discovery.reconnects.reconnects.length,
      });
      delivered = true;
    }

    return {
      ...this.baseEnvelope(userId),
      threadId: threadId ?? null,
      delivered,
      message,
      discovery,
    };
  }

  private combineDiscoveryScore(input: {
    semantic: number;
    lifeGraph: number;
    policy: number;
    recency: number;
  }) {
    const score =
      input.semantic * 0.3 +
      input.lifeGraph * 0.25 +
      input.policy * 0.25 +
      input.recency * 0.2;
    return this.clampUnitInterval(score);
  }

  private rankDiscoveryCandidate(
    candidate: {
      userId: string;
      score: number;
      rationale: Record<string, unknown>;
    },
    user:
      | {
          id: string;
          displayName: string;
          profile: {
            lastActiveAt: Date | null;
            trustScore: unknown;
            moderationState: string;
          } | null;
        }
      | undefined,
  ): RankedDiscoveryUserSuggestion | null {
    if (!user) {
      return null;
    }
    const semantic = this.clampUnitInterval(
      this.readNumber(candidate.rationale["semanticSimilarity"]) ??
        this.readNumber(candidate.rationale["lexicalOverlap"]) ??
        0.35,
    );
    const lifeGraph = this.clampUnitInterval(
      this.readNumber(candidate.rationale["personalizationBoost"]) ?? 0.5,
    );
    const policy = this.computePolicyScore({
      trustScore:
        this.readNumber(candidate.rationale["trustScoreNormalized"]) ??
        Number(user.profile?.trustScore ?? 0) / 100,
      moderationState: user.profile?.moderationState ?? "clean",
    });
    const recency = this.scoreRecencyByDate(user.profile?.lastActiveAt ?? null);
    const score = this.combineDiscoveryScore({
      semantic,
      lifeGraph,
      policy,
      recency,
    });
    const components: DiscoveryRankComponents = {
      semantic,
      lifeGraph,
      policy,
      recency,
      final: score,
    };
    return {
      userId: user.id,
      displayName: user.displayName,
      score,
      components,
      reason: this.buildCandidateReason(components),
    };
  }

  private buildCandidateReason(components: DiscoveryRankComponents) {
    const ordered = [
      {
        key: "semantic",
        value: components.semantic,
        text: "strong topical overlap",
      },
      {
        key: "lifeGraph",
        value: components.lifeGraph,
        text: "matches your past preference graph",
      },
      {
        key: "policy",
        value: components.policy,
        text: "passes trust and policy constraints",
      },
      {
        key: "recency",
        value: components.recency,
        text: "recently active",
      },
    ]
      .sort((a, b) => b.value - a.value)
      .slice(0, 2);
    return ordered.map((item) => item.text).join("; ");
  }

  private async loadUsersById(userIds: string[]) {
    const uniqueIds = Array.from(new Set(userIds));
    if (uniqueIds.length === 0) {
      return new Map<
        string,
        {
          id: string;
          displayName: string;
          profile: {
            lastActiveAt: Date | null;
            trustScore: unknown;
            moderationState: string;
          } | null;
        }
      >();
    }

    const rows = await this.prisma.user.findMany({
      where: {
        id: {
          in: uniqueIds,
        },
      },
      select: {
        id: true,
        displayName: true,
        profile: {
          select: {
            lastActiveAt: true,
            trustScore: true,
            moderationState: true,
          },
        },
      },
    });
    return new Map(rows.map((row) => [row.id, row]));
  }

  private async loadHighSuccessWeightsByName(userId: string) {
    const byName = new Map<string, number>();
    if (
      !this.prisma.lifeGraphEdge?.findMany ||
      !this.prisma.lifeGraphNode?.findMany
    ) {
      return byName;
    }

    const edges = await this.prisma.lifeGraphEdge.findMany({
      where: {
        userId,
        edgeType: "high_success_with",
      },
      select: {
        targetNodeId: true,
        weight: true,
      },
      take: 100,
    });
    if (edges.length === 0) {
      return byName;
    }

    const nodes = await this.prisma.lifeGraphNode.findMany({
      where: {
        id: {
          in: edges.map((edge) => edge.targetNodeId),
        },
      },
      select: {
        id: true,
        nodeType: true,
        label: true,
      },
    });
    const labelByNodeId = new Map(
      nodes
        .filter((node) => node.nodeType === "person")
        .map((node) => [node.id, node.label.toLowerCase()]),
    );

    for (const edge of edges) {
      const label = labelByNodeId.get(edge.targetNodeId);
      if (!label) {
        continue;
      }
      const weight = this.clampUnitInterval(Number(edge.weight));
      byName.set(label, Math.max(byName.get(label) ?? 0, weight));
    }
    return byName;
  }

  private async loadUserDiscoverySeed(userId: string) {
    const [interests, topics, recentIntents] = await Promise.all([
      this.prisma.userInterest.findMany({
        where: { userId },
        select: {
          normalizedLabel: true,
        },
        take: 20,
      }),
      this.prisma.userTopic.findMany({
        where: { userId },
        select: {
          normalizedLabel: true,
        },
        take: 20,
      }),
      this.prisma.intent.findMany({
        where: { userId },
        select: {
          parsedIntent: true,
        },
        orderBy: {
          createdAt: "desc",
        },
        take: 12,
      }),
    ]);

    const topicsOut = new Set<string>();
    for (const interest of interests) {
      topicsOut.add(interest.normalizedLabel.toLowerCase());
    }
    for (const topic of topics) {
      topicsOut.add(topic.normalizedLabel.toLowerCase());
    }

    const activitiesOut = new Set<string>(["chat", "hangout"]);
    for (const row of recentIntents) {
      const parsed =
        (row.parsedIntent as {
          topics?: string[];
          activities?: string[];
        } | null) ?? {};
      for (const label of parsed.topics ?? []) {
        topicsOut.add(label.toLowerCase());
      }
      for (const label of parsed.activities ?? []) {
        activitiesOut.add(label.toLowerCase());
      }
    }

    return {
      topics: Array.from(topicsOut).slice(0, 20),
      activities: Array.from(activitiesOut).slice(0, 20),
    };
  }

  private composeAgentRecommendationMessage(discovery: {
    tonight: { suggestions: unknown[] };
    groups: { groups: unknown[] };
    reconnects: { reconnects: unknown[] };
  }) {
    const tonight = discovery.tonight.suggestions
      .slice(0, 2)
      .map((candidate) => this.pickStringField(candidate, "displayName"))
      .filter((candidate): candidate is string => Boolean(candidate))
      .join(", ");
    const groups = discovery.groups.groups
      .slice(0, 1)
      .map((group) => this.pickStringField(group, "title"))
      .filter((group): group is string => Boolean(group))
      .join(", ");
    const reconnect = discovery.reconnects.reconnects
      .slice(0, 1)
      .map((candidate) => this.pickStringField(candidate, "displayName"))
      .filter((candidate): candidate is string => Boolean(candidate))
      .join(", ");

    const sentences = [] as string[];
    if (tonight) {
      sentences.push(`Tonight matches: ${tonight}.`);
    }
    if (groups) {
      sentences.push(`Suggested group idea: ${groups}.`);
    }
    if (reconnect) {
      sentences.push(`Good reconnect candidate: ${reconnect}.`);
    }
    if (sentences.length === 0) {
      sentences.push("I do not have strong discovery suggestions right now.");
    }
    return sentences.join(" ");
  }

  private async findLatestAgentThreadId(userId: string) {
    const thread = await this.prisma.agentThread.findFirst({
      where: { userId },
      orderBy: {
        updatedAt: "desc",
      },
      select: {
        id: true,
      },
    });
    return thread?.id ?? null;
  }

  private baseEnvelope(userId: string): DiscoverySuggestionEnvelope {
    return {
      userId,
      generatedAt: new Date().toISOString(),
      rankingModel: {
        name: "discovery-v1",
        weights: {
          semantic: 0.3,
          lifeGraph: 0.25,
          policy: 0.25,
          recency: 0.2,
        },
      },
    };
  }

  private computePolicyScore(input: {
    trustScore: number;
    moderationState: string;
  }) {
    const normalizedTrust = this.clampUnitInterval(input.trustScore);
    const moderationPenaltyByState: Record<string, number> = {
      clean: 0,
      flagged: 0.12,
      review: 0.2,
      blocked: 0.35,
    };
    const moderationPenalty =
      moderationPenaltyByState[input.moderationState] ?? 0.1;
    return this.clampUnitInterval(normalizedTrust - moderationPenalty);
  }

  private scoreRecencyByDate(value: Date | null) {
    if (!value) {
      return 0.35;
    }
    const ageHours = Math.max(0, (Date.now() - value.getTime()) / 3_600_000);
    if (ageHours <= 24) return 1;
    if (ageHours <= 72) return 0.78;
    if (ageHours <= 168) return 0.58;
    return 0.35;
  }

  private normalizeLimit(input: number | undefined, fallback: number) {
    if (!Number.isFinite(input)) {
      return fallback;
    }
    return Math.min(Math.max(Math.floor(input ?? fallback), 1), 10);
  }

  private clampUnitInterval(value: number) {
    if (!Number.isFinite(value)) {
      return 0;
    }
    return Math.max(0, Math.min(1, value));
  }

  private readNumber(value: unknown): number | null {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    return null;
  }

  private readString(value: unknown): string | null {
    if (typeof value !== "string") {
      return null;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  private pickStringField(value: unknown, fieldName: string): string | null {
    if (typeof value !== "object" || value === null) {
      return null;
    }
    const record = value as Record<string, unknown>;
    return this.readString(record[fieldName]);
  }

  private capitalizeLabel(label: string) {
    if (label.length === 0) {
      return label;
    }
    return `${label.charAt(0).toUpperCase()}${label.slice(1)}`;
  }
}
