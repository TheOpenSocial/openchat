import { describe, expect, it, vi } from "vitest";
import { PersonalizationService } from "../src/personalization/personalization.service.js";

const USER_ID = "11111111-1111-4111-8111-111111111111";

function createRagPrismaMock() {
  const retrievalDocuments: Array<Record<string, any>> = [];
  const retrievalChunks: Array<Record<string, any>> = [];

  const nodes = [
    { id: "node-source", nodeType: "person", label: "user:self" },
    { id: "node-target", nodeType: "activity", label: "tennis" },
  ];
  const explicitPreferences = [
    {
      id: "explicit-1",
      userId: USER_ID,
      scope: "life_graph_edge",
      preferenceKey: "life_graph_edge:node-source:likes:node-target",
      value: {
        edgeType: "likes",
        weight: 0.8,
      },
      updatedAt: new Date("2026-03-20T08:00:00.000Z"),
    },
  ];
  const inferredPreferences = [
    {
      id: "inferred-1",
      userId: USER_ID,
      preferenceKey: "life_graph_edge:node-source:likes:node-target",
      value: {
        edgeType: "likes",
        weight: 0.55,
        source: "inferred",
      },
      confidence: 0.74,
      sourceSignal: "accepted_after_match",
      updatedAt: new Date("2026-03-20T08:30:00.000Z"),
    },
  ];
  const lifeGraphEdges = [
    {
      edgeType: "likes",
      weight: 0.67,
      sourceNodeId: "node-source",
      targetNodeId: "node-target",
      updatedAt: new Date("2026-03-20T08:45:00.000Z"),
    },
  ];

  const matchWhere = (row: Record<string, any>, where: Record<string, any>) => {
    if (where.id?.in && !where.id.in.includes(row.id)) {
      return false;
    }
    if (typeof where.userId === "string" && row.userId !== where.userId) {
      return false;
    }
    if (typeof where.docType === "string" && row.docType !== where.docType) {
      return false;
    }
    if (where.docType?.in && !where.docType.in.includes(row.docType)) {
      return false;
    }
    if (where.createdAt?.gte && row.createdAt < where.createdAt.gte) {
      return false;
    }
    return true;
  };

  const prisma: any = {
    userPreference: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    userProfile: {
      findUnique: vi.fn().mockResolvedValue({
        bio: "I enjoy tennis, board games, and meeting new people.",
        city: "Buenos Aires",
        country: "AR",
        availabilityMode: "now",
      }),
    },
    userInterest: {
      findMany: vi
        .fn()
        .mockResolvedValue([{ label: "tennis" }, { label: "board games" }]),
    },
    userTopic: {
      findMany: vi
        .fn()
        .mockResolvedValue([
          { label: "doubles strategy" },
          { label: "social games" },
        ]),
    },
    explicitPreference: {
      findMany: vi.fn().mockResolvedValue(explicitPreferences),
    },
    inferredPreference: {
      findMany: vi.fn().mockResolvedValue(inferredPreferences),
    },
    lifeGraphEdge: {
      findMany: vi.fn().mockResolvedValue(lifeGraphEdges),
    },
    lifeGraphNode: {
      findMany: vi.fn().mockResolvedValue(nodes),
    },
    retrievalDocument: {
      findMany: vi.fn().mockImplementation(async ({ where }: any) => {
        return retrievalDocuments.filter((row) => matchWhere(row, where ?? {}));
      }),
      create: vi.fn().mockImplementation(async ({ data }: any) => {
        const created = {
          id: `doc-${retrievalDocuments.length + 1}`,
          createdAt: new Date(),
          ...data,
        };
        retrievalDocuments.push(created);
        return created;
      }),
      deleteMany: vi.fn().mockImplementation(async ({ where }: any) => {
        const ids: string[] = where?.id?.in ?? [];
        let count = 0;
        for (let i = retrievalDocuments.length - 1; i >= 0; i -= 1) {
          if (ids.includes(retrievalDocuments[i].id)) {
            retrievalDocuments.splice(i, 1);
            count += 1;
          }
        }
        return { count };
      }),
    },
    retrievalChunk: {
      findMany: vi.fn().mockImplementation(async ({ where }: any) => {
        const ids: string[] = where?.documentId?.in ?? [];
        return retrievalChunks.filter((chunk) =>
          ids.includes(chunk.documentId),
        );
      }),
      createMany: vi.fn().mockImplementation(async ({ data }: any) => {
        retrievalChunks.push(...data);
        return { count: data.length };
      }),
      deleteMany: vi.fn().mockImplementation(async ({ where }: any) => {
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

  return {
    prisma,
    retrievalDocuments,
  };
}

describe("RAG retrieval E2E flow", () => {
  it("builds retrieval docs and returns safe ranked context for agent use", async () => {
    const { prisma, retrievalDocuments } = createRagPrismaMock();
    const service = new PersonalizationService(prisma);

    const profileDoc = await service.refreshProfileSummaryDocument(USER_ID);
    const memoryDoc = await service.refreshPreferenceMemoryDocument(USER_ID);
    const safeInteraction = await service.storeInteractionSummary(USER_ID, {
      summary:
        "Found a doubles tennis partner and had a great board game meetup.",
      safe: true,
    });
    await service.storeInteractionSummary(USER_ID, {
      summary: "Threat language appeared and moderation was required.",
      safe: false,
    });

    expect(profileDoc.docType).toBe("profile_summary");
    expect(memoryDoc.docType).toBe("preference_memory");
    expect(safeInteraction.safe).toBe(true);

    const context = await service.retrievePersonalizationContext(USER_ID, {
      query: "tennis doubles partner for social board games",
      maxChunks: 6,
      maxAgeDays: 30,
    });

    expect(context.results.length).toBeGreaterThan(0);
    expect(
      context.results.some(
        (result) => result.docType === "interaction_summary_flagged",
      ),
    ).toBe(false);
    expect(
      context.results.some(
        (result) =>
          result.docType === "profile_summary" ||
          result.docType === "preference_memory" ||
          result.docType === "interaction_summary",
      ),
    ).toBe(true);
    expect(
      context.results.some((result) =>
        result.excerpt.toLowerCase().includes("tennis"),
      ),
    ).toBe(true);
  });
});
