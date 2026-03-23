import { describe, expect, it, vi } from "vitest";
import {
  PersonalizationService,
  type GlobalRules,
} from "../src/personalization/personalization.service.js";

function createLifeGraphPrismaMock() {
  const nodes: any[] = [];
  const edges: any[] = [];
  const explicitPreferences: any[] = [];
  const inferredPreferences: any[] = [];
  const retrievalDocuments: any[] = [];
  const retrievalChunks: any[] = [];

  const findNode = (where: any) =>
    nodes.find(
      (node) =>
        node.userId === where.userId &&
        node.nodeType === where.nodeType &&
        node.label === where.label,
    ) ?? null;

  const findEdge = (where: any) =>
    edges.find(
      (edge) =>
        edge.userId === where.userId &&
        edge.sourceNodeId === where.sourceNodeId &&
        edge.targetNodeId === where.targetNodeId &&
        edge.edgeType === where.edgeType,
    ) ?? null;

  const prisma: any = {
    userPreference: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({}),
      update: vi.fn().mockResolvedValue({}),
      findMany: vi.fn().mockResolvedValue([]),
    },
    userProfile: {
      findUnique: vi.fn().mockResolvedValue({
        bio: "Loves finding new people to play games with.",
        city: "Buenos Aires",
        country: "AR",
        availabilityMode: "now",
      }),
    },
    userInterest: {
      findMany: vi
        .fn()
        .mockResolvedValue([{ label: "gaming" }, { label: "football" }]),
    },
    userTopic: {
      findMany: vi
        .fn()
        .mockResolvedValue([{ label: "apex" }, { label: "travel" }]),
    },
    lifeGraphNode: {
      findFirst: vi.fn(async ({ where }: any) => findNode(where)),
      findMany: vi.fn(async ({ where }: any) =>
        nodes.filter((node) => node.userId === where.userId),
      ),
      create: vi.fn(async ({ data }: any) => {
        const created = {
          id: `node-${nodes.length + 1}`,
          ...data,
          createdAt: new Date(),
        };
        nodes.push(created);
        return created;
      }),
    },
    explicitPreference: {
      findFirst: vi.fn(async ({ where }: any) => {
        return (
          explicitPreferences.find(
            (pref) =>
              pref.userId === where.userId &&
              pref.scope === where.scope &&
              pref.preferenceKey === where.preferenceKey,
          ) ?? null
        );
      }),
      findMany: vi.fn(async ({ where }: any) =>
        explicitPreferences.filter(
          (pref) =>
            pref.userId === where.userId &&
            (typeof where.scope === "string"
              ? pref.scope === where.scope
              : Array.isArray(where.scope?.in)
                ? where.scope.in.includes(pref.scope)
                : true),
        ),
      ),
      create: vi.fn(async ({ data }: any) => {
        const created = {
          id: `explicit-${explicitPreferences.length + 1}`,
          ...data,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        explicitPreferences.push(created);
        return created;
      }),
      update: vi.fn(async ({ where, data }: any) => {
        const existing = explicitPreferences.find(
          (pref) => pref.id === where.id,
        );
        if (!existing) {
          throw new Error("explicit pref not found");
        }
        existing.value = data.value;
        existing.updatedAt = new Date();
        return existing;
      }),
    },
    inferredPreference: {
      findFirst: vi.fn(async ({ where }: any) => {
        return (
          inferredPreferences.find(
            (pref) =>
              pref.userId === where.userId &&
              pref.preferenceKey === where.preferenceKey,
          ) ?? null
        );
      }),
      findMany: vi.fn(async ({ where }: any) =>
        inferredPreferences.filter(
          (pref) =>
            pref.userId === where.userId &&
            (where.preferenceKey?.startsWith
              ? pref.preferenceKey.startsWith(where.preferenceKey.startsWith)
              : true),
        ),
      ),
      create: vi.fn(async ({ data }: any) => {
        const created = {
          id: `inferred-${inferredPreferences.length + 1}`,
          ...data,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        inferredPreferences.push(created);
        return created;
      }),
      update: vi.fn(async ({ where, data }: any) => {
        const existing = inferredPreferences.find(
          (pref) => pref.id === where.id,
        );
        if (!existing) {
          throw new Error("inferred pref not found");
        }
        existing.value = data.value;
        existing.confidence = data.confidence;
        existing.sourceSignal = data.sourceSignal;
        existing.updatedAt = new Date();
        return existing;
      }),
    },
    lifeGraphEdge: {
      findFirst: vi.fn(async ({ where }: any) => {
        const edge = findEdge(where);
        if (!edge) return null;
        return { id: edge.id };
      }),
      findMany: vi.fn(async ({ where }: any) =>
        edges.filter((edge) => edge.userId === where.userId),
      ),
      create: vi.fn(async ({ data }: any) => {
        const created = {
          id: `edge-${edges.length + 1}`,
          ...data,
          updatedAt: new Date(),
        };
        edges.push(created);
        return created;
      }),
      update: vi.fn(async ({ where, data }: any) => {
        const existing = edges.find((edge) => edge.id === where.id);
        if (!existing) {
          throw new Error("edge not found");
        }
        existing.weight = data.weight;
        existing.updatedAt = new Date();
        return existing;
      }),
    },
    preferenceFeedbackEvent: {
      create: vi.fn().mockResolvedValue({}),
    },
    retrievalDocument: {
      findMany: vi.fn(async ({ where }: any) => {
        return retrievalDocuments.filter((document) => {
          if (where?.id?.in) {
            return where.id.in.includes(document.id);
          }
          if (where?.userId && document.userId !== where.userId) {
            return false;
          }
          if (
            where?.docType?.in &&
            !where.docType.in.includes(document.docType)
          ) {
            return false;
          }
          if (where?.docType && typeof where.docType === "string") {
            return document.docType === where.docType;
          }
          if (where?.createdAt?.gte) {
            return document.createdAt >= where.createdAt.gte;
          }
          return true;
        });
      }),
      create: vi.fn(async ({ data }: any) => {
        const created = {
          id: `doc-${retrievalDocuments.length + 1}`,
          ...data,
          createdAt: new Date(),
        };
        retrievalDocuments.push(created);
        return created;
      }),
      deleteMany: vi.fn(async ({ where }: any) => {
        const ids: string[] = where?.id?.in ?? [];
        for (const id of ids) {
          const index = retrievalDocuments.findIndex(
            (document) => document.id === id,
          );
          if (index >= 0) {
            retrievalDocuments.splice(index, 1);
          }
        }
        return { count: ids.length };
      }),
    },
    retrievalChunk: {
      findMany: vi.fn(async ({ where }: any) => {
        const ids: string[] = where?.documentId?.in ?? [];
        return retrievalChunks.filter((chunk) =>
          ids.includes(chunk.documentId),
        );
      }),
      createMany: vi.fn(async ({ data }: any) => {
        for (const row of data) {
          retrievalChunks.push(row);
        }
        return { count: data.length };
      }),
      deleteMany: vi.fn(async ({ where }: any) => {
        const ids: string[] = where?.documentId?.in ?? [];
        let count = 0;
        for (let i = retrievalChunks.length - 1; i >= 0; i -= 1) {
          if (ids.includes(retrievalChunks[i].documentId)) {
            retrievalChunks.splice(i, 1);
            count += 1;
          }
        }
        return { count };
      }),
    },
  };

  return prisma;
}

describe("PersonalizationService", () => {
  it("explains precedence and reports first blocking rule", async () => {
    const prisma: any = {
      userPreference: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    };

    const service = new PersonalizationService(prisma);
    const explanation = await service.explainDecision(
      "11111111-1111-4111-8111-111111111111",
      {
        safetyAllowed: true,
        hardRuleAllowed: false,
        productPolicyAllowed: true,
        overrideAllowed: true,
        learnedPreferenceAllowed: true,
        rankingAllowed: true,
      },
      {
        intentId: "intent-1",
      },
    );

    expect(explanation.decision).toBe(false);
    expect(explanation.blockedBy).toBe("hard_user_rules");
    expect(explanation.precedence[0]).toEqual(
      expect.objectContaining({
        rule: "safety_rules",
        allowed: true,
      }),
    );
  });

  it("returns default global rules when no user preferences are set", async () => {
    const prisma: any = {
      userPreference: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    };

    const service = new PersonalizationService(prisma);
    const result = await service.getGlobalRules(
      "11111111-1111-4111-8111-111111111111",
    );

    expect(result).toEqual({
      whoCanContact: "anyone",
      reachable: "always",
      intentMode: "balanced",
      modality: "either",
      languagePreferences: [],
      countryPreferences: [],
      timezone: "UTC",
      requireVerifiedUsers: false,
      notificationMode: "immediate",
      agentAutonomy: "suggest_only",
      memoryMode: "standard",
    });
  });

  it("persists and returns global rules", async () => {
    const expected: GlobalRules = {
      whoCanContact: "verified_only",
      reachable: "available_only",
      intentMode: "one_to_one",
      modality: "offline",
      languagePreferences: ["en", "es"],
      countryPreferences: ["ar", "uy"],
      timezone: "America/Argentina/Buenos_Aires",
      requireVerifiedUsers: true,
      notificationMode: "digest",
      agentAutonomy: "manual",
      memoryMode: "minimal",
    };

    const prisma: any = {
      userPreference: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({}),
        update: vi.fn().mockResolvedValue({}),
        findMany: vi.fn().mockResolvedValue([
          {
            key: "global_rules_who_can_contact",
            value: expected.whoCanContact,
          },
          { key: "global_rules_reachable", value: expected.reachable },
          { key: "global_rules_intent_mode", value: expected.intentMode },
          { key: "global_rules_modality", value: expected.modality },
          {
            key: "global_rules_language_preferences",
            value: expected.languagePreferences,
          },
          {
            key: "global_rules_country_preferences",
            value: expected.countryPreferences,
          },
          {
            key: "global_rules_timezone",
            value: expected.timezone,
          },
          {
            key: "global_rules_require_verified_users",
            value: expected.requireVerifiedUsers,
          },
          {
            key: "global_rules_notification_mode",
            value: expected.notificationMode,
          },
          { key: "global_rules_agent_autonomy", value: expected.agentAutonomy },
          { key: "global_rules_memory_mode", value: expected.memoryMode },
          { key: "global_rules_timezone", value: expected.timezone },
        ]),
      },
      lifeGraphNode: {
        findFirst: vi.fn().mockResolvedValue({ id: "node" }),
        create: vi.fn().mockResolvedValue({ id: "node" }),
      },
      explicitPreference: {
        findFirst: vi.fn().mockResolvedValue({
          id: "explicit-1",
          value: { weight: 0.5 },
        }),
        update: vi.fn().mockResolvedValue({
          id: "explicit-1",
          value: { weight: 0.5 },
        }),
      },
      inferredPreference: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
      lifeGraphEdge: {
        findFirst: vi.fn().mockResolvedValue({ id: "edge-1" }),
        update: vi.fn().mockResolvedValue({
          id: "edge-1",
          userId: "11111111-1111-4111-8111-111111111111",
          sourceNodeId: "node",
          targetNodeId: "node",
          edgeType: "prefers",
          weight: 0.5,
          updatedAt: new Date(),
        }),
      },
      preferenceFeedbackEvent: {
        create: vi.fn().mockResolvedValue({}),
      },
    };
    const analyticsService: any = {
      trackEvent: vi.fn().mockResolvedValue({}),
    };

    const service = new PersonalizationService(prisma, analyticsService);
    vi.spyOn(service, "refreshPreferenceMemoryDocument").mockResolvedValue({
      documentId: "doc-1",
      docType: "preference_memory",
      chunkCount: 1,
      createdAt: new Date(),
    });
    const result = await service.setGlobalRules(
      "11111111-1111-4111-8111-111111111111",
      expected,
    );

    expect(prisma.userPreference.create).toHaveBeenCalledTimes(11);
    expect(result).toEqual(expected);
    expect(analyticsService.trackEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "personalization_change",
        actorUserId: "11111111-1111-4111-8111-111111111111",
      }),
    );
  });

  it("keeps explicit and inferred weights separated while materializing edge weight", async () => {
    const prisma = createLifeGraphPrismaMock();
    const service = new PersonalizationService(prisma);
    const userId = "11111111-1111-4111-8111-111111111111";

    await service.setExplicitLifeGraphEdge(userId, {
      edgeType: "likes",
      targetNode: { nodeType: "topic", label: "Tennis" },
      weight: 0.4,
    });

    await service.recordBehaviorSignal(userId, {
      edgeType: "likes",
      targetNode: { nodeType: "topic", label: "Tennis" },
      signalStrength: 0.2,
      feedbackType: "accepted_after_match",
    });

    const graph = await service.getLifeGraph(userId);
    const edge = graph.edges.find(
      (item) =>
        item.targetNode?.label === "tennis" && item.edgeType === "likes",
    );

    expect(edge).toBeDefined();
    expect(edge?.sources.explicitWeight).toBeCloseTo(0.4, 5);
    expect(edge?.sources.inferredWeight).toBeCloseTo(0.2, 5);
    expect(edge?.weight).toBeCloseTo(0.6, 5);
  });

  it("creates activity/topic/game/schedule/location nodes from intent behavior signals", async () => {
    const prisma = createLifeGraphPrismaMock();
    const service = new PersonalizationService(prisma);
    const userId = "11111111-1111-4111-8111-111111111111";

    await service.recordIntentSignals(userId, {
      intentType: "activity",
      modality: "offline",
      topics: ["Board Games"],
      activities: ["Apex Legends"],
      timingConstraints: ["tonight after 8"],
    });

    const graph = await service.getLifeGraph(userId);
    const nodeTypes = new Set(graph.nodes.map((node) => node.nodeType));

    expect(nodeTypes.has("topic")).toBe(true);
    expect(nodeTypes.has("game")).toBe(true);
    expect(nodeTypes.has("schedule_preference")).toBe(true);
    expect(nodeTypes.has("location_cluster")).toBe(true);
  });

  it("stores profile summary retrieval document with chunks", async () => {
    const prisma = createLifeGraphPrismaMock();
    const service = new PersonalizationService(prisma);
    const userId = "11111111-1111-4111-8111-111111111111";

    const result = await service.refreshProfileSummaryDocument(userId);

    expect(result.docType).toBe("profile_summary");
    expect(result.chunkCount).toBeGreaterThan(0);
    expect(prisma.retrievalDocument.create).toHaveBeenCalledTimes(1);
    expect(prisma.retrievalChunk.createMany).toHaveBeenCalledTimes(1);
  });

  it("retrieval query excludes unsafe and stale interaction summaries", async () => {
    const prisma = createLifeGraphPrismaMock();
    const service = new PersonalizationService(prisma);
    const userId = "11111111-1111-4111-8111-111111111111";

    await service.storeInteractionSummary(userId, {
      summary: "Group match succeeded with new teammates tonight.",
      safe: true,
    });
    await service.storeInteractionSummary(userId, {
      summary: "Threat language detected in conversation.",
      safe: false,
    });

    const allSafeDocs = await prisma.retrievalDocument.findMany({
      where: {
        userId,
        docType: "interaction_summary",
      },
    });
    allSafeDocs[0].createdAt = new Date(Date.now() - 40 * 24 * 60 * 60_000);

    const result = await service.retrievePersonalizationContext(userId, {
      query: "group teammates",
      maxChunks: 10,
      maxAgeDays: 30,
    });

    expect(
      result.results.some(
        (item) => item.docType === "interaction_summary_flagged",
      ),
    ).toBe(false);
    expect(
      result.results.some((item) => item.docType === "interaction_summary"),
    ).toBe(false);
  });
});
