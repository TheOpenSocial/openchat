import { describe, expect, it, vi } from "vitest";
import { DiscoveryService } from "../src/discovery/discovery.service.js";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const USER_A = "22222222-2222-4222-8222-222222222222";
const USER_B = "33333333-3333-4333-8333-333333333333";

function createService(overrides: Partial<Record<string, unknown>> = {}) {
  const now = Date.now();

  const userFindMany =
    (overrides.userFindMany as any) ??
    vi.fn(async (args?: any) => {
      const requestedIds: string[] = Array.isArray(args?.where?.id?.in)
        ? args.where.id.in
        : [];
      if (requestedIds.includes(USER_A) || requestedIds.includes(USER_B)) {
        if (args.select?.profile) {
          return [
            {
              id: USER_A,
              displayName: "Alex",
              profile: {
                lastActiveAt: new Date(now - 30 * 60_000),
                trustScore: 92,
                moderationState: "clean",
              },
            },
            {
              id: USER_B,
              displayName: "Blake",
              profile: {
                lastActiveAt: new Date(now - 8 * 60 * 60_000),
                trustScore: 75,
                moderationState: "flagged",
              },
            },
          ].filter((row) => requestedIds.includes(row.id));
        }
        return [
          {
            id: USER_A,
            displayName: "Alex",
          },
          {
            id: USER_B,
            displayName: "Blake",
          },
        ].filter((row) => requestedIds.includes(row.id));
      }
      return [];
    });

  const intentFindMany =
    (overrides.intentFindMany as any) ??
    vi.fn(async (args?: any) => {
      if (args?.where?.status?.in) {
        return [
          {
            id: "intent-1",
            userId: USER_A,
            status: "matching",
            parsedIntent: { topics: ["chess"], activities: ["chat"] },
            createdAt: new Date(now - 60 * 60_000),
          },
        ];
      }
      return [];
    });

  const connectionParticipantFindMany =
    (overrides.connectionParticipantFindMany as any) ??
    vi
      .fn()
      .mockResolvedValueOnce([
        {
          connectionId: "conn-1",
          connection: {
            createdAt: new Date(now - 3 * 24 * 60 * 60_000),
          },
        },
      ])
      .mockResolvedValueOnce([
        {
          userId: USER_A,
          connectionId: "conn-1",
        },
      ]);

  const prisma: any = {
    userInterest: {
      findMany:
        overrides.userInterestFindMany ??
        vi
          .fn()
          .mockResolvedValue([{ normalizedLabel: "chess", userId: USER_A }]),
    },
    userTopic: {
      findMany:
        overrides.userTopicFindMany ??
        vi
          .fn()
          .mockResolvedValue([
            { normalizedLabel: "boardgames", userId: USER_A },
          ]),
    },
    intent: {
      findMany: intentFindMany,
    },
    user: {
      findMany: userFindMany,
    },
    lifeGraphEdge: {
      findMany:
        overrides.lifeGraphEdgeFindMany ??
        vi.fn().mockResolvedValue([
          {
            targetNodeId: "node-1",
            weight: 0.9,
          },
        ]),
    },
    lifeGraphNode: {
      findMany:
        overrides.lifeGraphNodeFindMany ??
        vi
          .fn()
          .mockResolvedValue([
            { id: "node-1", nodeType: "person", label: "alex" },
          ]),
    },
    connectionParticipant: {
      findMany: connectionParticipantFindMany,
    },
    block: {
      findMany: overrides.blockFindMany ?? vi.fn().mockResolvedValue([]),
    },
    userPreference: {
      findMany:
        overrides.userPreferenceFindMany ?? vi.fn().mockResolvedValue([]),
    },
    userReport: {
      findMany: overrides.userReportFindMany ?? vi.fn().mockResolvedValue([]),
    },
    agentThread: {
      findFirst:
        overrides.agentThreadFindFirst ??
        vi.fn().mockResolvedValue({ id: "thread-1" }),
    },
  };

  const matchingService: any = {
    retrieveCandidates:
      overrides.retrieveCandidates ??
      vi.fn().mockResolvedValue([
        {
          userId: USER_A,
          score: 0.91,
          rationale: {
            semanticSimilarity: 0.95,
            personalizationBoost: 0.8,
            trustScoreNormalized: 0.92,
          },
        },
        {
          userId: USER_B,
          score: 0.71,
          rationale: {
            semanticSimilarity: 0.74,
            personalizationBoost: 0.5,
            trustScoreNormalized: 0.7,
          },
        },
      ]),
  };

  const personalizationService: any = {
    getGlobalRules:
      overrides.getGlobalRules ??
      vi.fn().mockResolvedValue({
        whoCanContact: "anyone",
        reachable: "always",
        intentMode: "balanced",
        modality: "either",
        languagePreferences: [],
        countryPreferences: [],
        requireVerifiedUsers: false,
        notificationMode: "immediate",
        agentAutonomy: "suggest_only",
        memoryMode: "standard",
      }),
  };

  const agentService: any = {
    appendWorkflowUpdate:
      overrides.appendWorkflowUpdate ?? vi.fn().mockResolvedValue({}),
  };

  const inboxService: any = {
    listPendingRequests:
      overrides.listPendingRequests ?? vi.fn().mockResolvedValue([]),
  };

  return {
    prisma,
    matchingService,
    personalizationService,
    agentService,
    inboxService,
    service: new DiscoveryService(
      prisma,
      matchingService,
      personalizationService,
      agentService,
      inboxService,
    ),
  };
}

describe("DiscoveryService", () => {
  it("ranks tonight suggestions using semantic/lifegraph/policy/recency blend", async () => {
    const { service, matchingService } = createService();

    const result = await service.suggestTonight(USER_ID, 2);

    expect(result.suggestions).toHaveLength(2);
    expect(result.suggestions[0]?.userId).toBe(USER_A);
    expect(result.suggestions[0]?.components.final).toBeGreaterThan(
      Number(result.suggestions[1]?.components.final ?? 0),
    );
    expect(matchingService.retrieveCandidates).toHaveBeenCalledWith(
      USER_ID,
      expect.objectContaining({
        timingConstraints: ["tonight"],
      }),
      expect.any(Number),
    );
  });

  it("filters blocked peers from reconnect suggestions", async () => {
    const { service } = createService({
      connectionParticipantFindMany: vi
        .fn()
        .mockResolvedValueOnce([
          {
            connectionId: "conn-1",
            connection: {
              createdAt: new Date(),
            },
          },
          {
            connectionId: "conn-2",
            connection: {
              createdAt: new Date(),
            },
          },
        ])
        .mockResolvedValueOnce([
          { userId: USER_A, connectionId: "conn-1" },
          { userId: USER_B, connectionId: "conn-2" },
        ]),
      blockFindMany: vi.fn().mockResolvedValue([
        {
          blockerUserId: USER_ID,
          blockedUserId: USER_B,
        },
      ]),
    });

    const result = await service.suggestReconnects(USER_ID, 5);

    expect(result.reconnects).toHaveLength(1);
    expect(result.reconnects[0]?.userId).toBe(USER_A);
  });

  it("filters muted peers from reconnect suggestions", async () => {
    const { service } = createService({
      connectionParticipantFindMany: vi
        .fn()
        .mockResolvedValueOnce([
          {
            connectionId: "conn-1",
            connection: {
              createdAt: new Date(),
            },
          },
          {
            connectionId: "conn-2",
            connection: {
              createdAt: new Date(),
            },
          },
        ])
        .mockResolvedValueOnce([
          { userId: USER_A, connectionId: "conn-1" },
          { userId: USER_B, connectionId: "conn-2" },
        ]),
      userPreferenceFindMany: vi.fn().mockResolvedValue([
        {
          userId: USER_ID,
          value: [USER_B],
        },
      ]),
    });

    const result = await service.suggestReconnects(USER_ID, 5);

    expect(result.reconnects).toHaveLength(1);
    expect(result.reconnects[0]?.userId).toBe(USER_A);
  });

  it("filters heavily reported peers from reconnect suggestions", async () => {
    const { service } = createService({
      connectionParticipantFindMany: vi
        .fn()
        .mockResolvedValueOnce([
          {
            connectionId: "conn-1",
            connection: {
              createdAt: new Date(),
            },
          },
          {
            connectionId: "conn-2",
            connection: {
              createdAt: new Date(),
            },
          },
        ])
        .mockResolvedValueOnce([
          { userId: USER_A, connectionId: "conn-1" },
          { userId: USER_B, connectionId: "conn-2" },
        ]),
      userReportFindMany: vi
        .fn()
        .mockResolvedValue([
          { targetUserId: USER_B },
          { targetUserId: USER_B },
          { targetUserId: USER_B },
        ]),
    });

    const result = await service.suggestReconnects(USER_ID, 5);

    expect(result.reconnects).toHaveLength(1);
    expect(result.reconnects[0]?.userId).toBe(USER_A);
  });

  it("publishes lightweight recommendations into the latest agent thread", async () => {
    const { service, agentService } = createService();

    const result = await service.publishAgentRecommendations(USER_ID, {
      limit: 2,
    });

    expect(result.delivered).toBe(true);
    expect(result.threadId).toBe("thread-1");
    expect(agentService.appendWorkflowUpdate).toHaveBeenCalledWith(
      "thread-1",
      expect.stringContaining("Tonight matches"),
      expect.objectContaining({
        category: "discovery_recommendations",
      }),
    );
  });

  it("returns inbox suggestions with pending-request context", async () => {
    const { service } = createService({
      listPendingRequests: vi.fn().mockResolvedValue([
        {
          id: "request-1",
          cardSummary: {
            who: "Alex",
          },
        },
      ]),
      connectionParticipantFindMany: vi.fn().mockResolvedValue([]),
    });

    const result = await service.getInboxSuggestions(USER_ID, 3);

    expect(result.pendingRequestCount).toBe(1);
    expect(
      result.suggestions.some(
        (suggestion) => suggestion.title === "Pending invites",
      ),
    ).toBe(true);
  });

  it("builds passive discovery bundles with tonight, active, groups, and reconnects", async () => {
    const { service } = createService();

    const result = await service.getPassiveDiscovery(USER_ID, 3);

    expect(result.tonight.suggestions.length).toBeGreaterThan(0);
    expect(result.activeIntentsOrUsers.items.length).toBeGreaterThan(0);
    expect(Array.isArray(result.groups.groups)).toBe(true);
    expect(Array.isArray(result.reconnects.reconnects)).toBe(true);
  });
});
