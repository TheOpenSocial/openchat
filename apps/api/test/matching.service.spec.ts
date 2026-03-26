import { describe, expect, it, vi } from "vitest";
import { MatchingService } from "../src/matching/matching.service.js";

describe("MatchingService", () => {
  it("selects candidates by descending score", () => {
    const service = new MatchingService({} as any);
    const result = service.selectTopN(
      [
        { id: "1", score: 0.4 },
        { id: "2", score: 0.9 },
        { id: "3", score: 0.2 },
      ],
      2,
    );

    expect(result.map((x) => x.id)).toEqual(["2", "1"]);
  });

  it("filters candidates using global contact rules before ranking", async () => {
    const prisma: any = {
      user: {
        findUnique: async () => ({
          id: "11111111-1111-4111-8111-111111111111",
          googleSubjectId: null,
          email: null,
          profile: { trustScore: 10 },
        }),
        findMany: async () => [
          {
            id: "22222222-2222-4222-8222-222222222222",
            displayName: "Candidate Verified",
            status: "active",
            profile: { availabilityMode: "now", trustScore: 90 },
          },
          {
            id: "33333333-3333-4333-8333-333333333333",
            displayName: "Candidate Open",
            status: "active",
            profile: { availabilityMode: "now", trustScore: 70 },
          },
        ],
      },
      block: {
        findMany: async () => [],
      },
      userInterest: {
        findMany: async () => [
          {
            userId: "22222222-2222-4222-8222-222222222222",
            normalizedLabel: "tennis",
          },
          {
            userId: "33333333-3333-4333-8333-333333333333",
            normalizedLabel: "tennis",
          },
        ],
      },
      userTopic: {
        findMany: async () => [],
      },
      intentRequest: {
        findMany: async () => [],
      },
      userPreference: {
        findMany: async () => [
          {
            userId: "22222222-2222-4222-8222-222222222222",
            key: "global_rules_who_can_contact",
            value: "verified_only",
          },
        ],
      },
    };

    const service = new MatchingService(prisma);
    const results = await service.retrieveCandidates(
      "11111111-1111-4111-8111-111111111111",
      {
        topics: ["tennis"],
        intentType: "chat",
      },
      5,
    );

    expect(results.map((candidate) => candidate.userId)).toEqual([
      "33333333-3333-4333-8333-333333333333",
    ]);
  });

  it("respects sender verified-only mode when selecting candidates", async () => {
    const prisma: any = {
      user: {
        findUnique: async () => ({
          id: "11111111-1111-4111-8111-111111111111",
          googleSubjectId: "sender-google",
          email: "sender@example.com",
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
          profile: { trustScore: 75, availabilityMode: "now" },
        }),
        findMany: async () => [
          {
            id: "22222222-2222-4222-8222-222222222222",
            displayName: "Unverified Candidate",
            status: "active",
            createdAt: new Date("2026-01-01T00:00:00.000Z"),
            email: null,
            googleSubjectId: null,
            profile: { availabilityMode: "now", trustScore: 80 },
          },
          {
            id: "33333333-3333-4333-8333-333333333333",
            displayName: "Verified Candidate",
            status: "active",
            createdAt: new Date("2026-01-01T00:00:00.000Z"),
            email: "verified@example.com",
            googleSubjectId: null,
            profile: { availabilityMode: "now", trustScore: 80 },
          },
        ],
      },
      block: { findMany: async () => [] },
      userInterest: {
        findMany: async () => [
          {
            userId: "22222222-2222-4222-8222-222222222222",
            normalizedLabel: "chess",
          },
          {
            userId: "33333333-3333-4333-8333-333333333333",
            normalizedLabel: "chess",
          },
        ],
      },
      userTopic: { findMany: async () => [] },
      intentRequest: { findMany: async () => [] },
      userPreference: {
        findMany: async () => [
          {
            userId: "11111111-1111-4111-8111-111111111111",
            key: "global_rules_require_verified_users",
            value: true,
          },
        ],
      },
    };

    const service = new MatchingService(prisma);
    const results = await service.retrieveCandidates(
      "11111111-1111-4111-8111-111111111111",
      {
        topics: ["chess"],
        intentType: "chat",
      },
      5,
    );

    expect(results.map((candidate) => candidate.userId)).toEqual([
      "33333333-3333-4333-8333-333333333333",
    ]);
  });

  it("restricts offline-only candidates when sender mode is online", async () => {
    const prisma: any = {
      user: {
        findUnique: async () => ({
          id: "11111111-1111-4111-8111-111111111111",
          googleSubjectId: null,
          email: "sender@example.com",
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
          profile: { trustScore: 70, availabilityMode: "now" },
        }),
        findMany: async () => [
          {
            id: "22222222-2222-4222-8222-222222222222",
            displayName: "Offline Only",
            status: "active",
            createdAt: new Date("2026-01-01T00:00:00.000Z"),
            email: "offline@example.com",
            googleSubjectId: null,
            profile: { availabilityMode: "now", trustScore: 70 },
          },
          {
            id: "33333333-3333-4333-8333-333333333333",
            displayName: "Either Modality",
            status: "active",
            createdAt: new Date("2026-01-01T00:00:00.000Z"),
            email: "either@example.com",
            googleSubjectId: null,
            profile: { availabilityMode: "now", trustScore: 70 },
          },
        ],
      },
      block: { findMany: async () => [] },
      userInterest: {
        findMany: async () => [
          {
            userId: "22222222-2222-4222-8222-222222222222",
            normalizedLabel: "movies",
          },
          {
            userId: "33333333-3333-4333-8333-333333333333",
            normalizedLabel: "movies",
          },
        ],
      },
      userTopic: { findMany: async () => [] },
      intentRequest: { findMany: async () => [] },
      userPreference: {
        findMany: async () => [
          {
            userId: "11111111-1111-4111-8111-111111111111",
            key: "global_rules_modality",
            value: "online",
          },
          {
            userId: "22222222-2222-4222-8222-222222222222",
            key: "global_rules_modality",
            value: "offline",
          },
        ],
      },
    };

    const service = new MatchingService(prisma);
    const results = await service.retrieveCandidates(
      "11111111-1111-4111-8111-111111111111",
      {
        topics: ["movies"],
        modality: "online",
      },
      5,
    );

    expect(results.map((candidate) => candidate.userId)).toEqual([
      "33333333-3333-4333-8333-333333333333",
    ]);
  });

  it("filters candidates when language preferences do not overlap", async () => {
    const prisma: any = {
      user: {
        findUnique: async () => ({
          id: "11111111-1111-4111-8111-111111111111",
          googleSubjectId: "sender-google",
          email: "sender@example.com",
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
          profile: { trustScore: 70, availabilityMode: "now" },
        }),
        findMany: async () => [
          {
            id: "22222222-2222-4222-8222-222222222222",
            displayName: "English Speaker",
            status: "active",
            createdAt: new Date("2026-01-01T00:00:00.000Z"),
            email: "en@example.com",
            googleSubjectId: null,
            profile: { availabilityMode: "now", trustScore: 70 },
          },
          {
            id: "33333333-3333-4333-8333-333333333333",
            displayName: "Spanish Speaker",
            status: "active",
            createdAt: new Date("2026-01-01T00:00:00.000Z"),
            email: "es@example.com",
            googleSubjectId: null,
            profile: { availabilityMode: "now", trustScore: 70 },
          },
        ],
      },
      block: { findMany: async () => [] },
      userInterest: {
        findMany: async () => [
          {
            userId: "22222222-2222-4222-8222-222222222222",
            normalizedLabel: "design",
          },
          {
            userId: "33333333-3333-4333-8333-333333333333",
            normalizedLabel: "design",
          },
        ],
      },
      userTopic: { findMany: async () => [] },
      intentRequest: { findMany: async () => [] },
      userPreference: {
        findMany: async () => [
          {
            userId: "11111111-1111-4111-8111-111111111111",
            key: "global_rules_language_preferences",
            value: ["es"],
          },
          {
            userId: "22222222-2222-4222-8222-222222222222",
            key: "global_rules_language_preferences",
            value: ["en"],
          },
          {
            userId: "33333333-3333-4333-8333-333333333333",
            key: "global_rules_language_preferences",
            value: ["es"],
          },
        ],
      },
    };

    const service = new MatchingService(prisma);
    const results = await service.retrieveCandidates(
      "11111111-1111-4111-8111-111111111111",
      {
        topics: ["design"],
        intentType: "chat",
      },
      5,
    );

    expect(results.map((candidate) => candidate.userId)).toEqual([
      "33333333-3333-4333-8333-333333333333",
    ]);
  });

  it("allows language mismatch when both sides opt into translation", async () => {
    const prisma: any = {
      user: {
        findUnique: async () => ({
          id: "11111111-1111-4111-8111-111111111111",
          googleSubjectId: "sender-google",
          email: "sender@example.com",
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
          profile: { trustScore: 70, availabilityMode: "now" },
        }),
        findMany: async () => [
          {
            id: "22222222-2222-4222-8222-222222222222",
            displayName: "English Only",
            status: "active",
            createdAt: new Date("2026-01-01T00:00:00.000Z"),
            email: "en@example.com",
            googleSubjectId: null,
            profile: { availabilityMode: "now", trustScore: 70 },
          },
        ],
      },
      block: { findMany: async () => [] },
      userInterest: {
        findMany: async () => [
          {
            userId: "22222222-2222-4222-8222-222222222222",
            normalizedLabel: "design",
          },
        ],
      },
      userTopic: { findMany: async () => [] },
      intentRequest: { findMany: async () => [] },
      userPreference: {
        findMany: async () => [
          {
            userId: "11111111-1111-4111-8111-111111111111",
            key: "global_rules_language_preferences",
            value: ["es"],
          },
          {
            userId: "22222222-2222-4222-8222-222222222222",
            key: "global_rules_language_preferences",
            value: ["en"],
          },
          {
            userId: "11111111-1111-4111-8111-111111111111",
            key: "global_rules_translation_opt_in",
            value: true,
          },
          {
            userId: "22222222-2222-4222-8222-222222222222",
            key: "global_rules_translation_opt_in",
            value: true,
          },
        ],
      },
    };

    const service = new MatchingService(prisma);
    const results = await service.retrieveCandidates(
      "11111111-1111-4111-8111-111111111111",
      {
        topics: ["design"],
        intentType: "chat",
      },
      5,
    );

    expect(results.map((candidate) => candidate.userId)).toEqual([
      "22222222-2222-4222-8222-222222222222",
    ]);
    expect(results[0]?.rationale["translationBridge"]).toBe(true);
  });

  it("filters candidates when explicit country preferences do not match", async () => {
    const prisma: any = {
      user: {
        findUnique: async () => ({
          id: "11111111-1111-4111-8111-111111111111",
          googleSubjectId: "sender-google",
          email: "sender@example.com",
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
          profile: {
            trustScore: 70,
            availabilityMode: "now",
            country: "AR",
          },
        }),
        findMany: async () => [
          {
            id: "22222222-2222-4222-8222-222222222222",
            displayName: "Uruguay Match",
            status: "active",
            createdAt: new Date("2026-01-01T00:00:00.000Z"),
            email: "uy@example.com",
            googleSubjectId: null,
            profile: {
              availabilityMode: "now",
              trustScore: 70,
              country: "UY",
            },
          },
          {
            id: "33333333-3333-4333-8333-333333333333",
            displayName: "Spain Mismatch",
            status: "active",
            createdAt: new Date("2026-01-01T00:00:00.000Z"),
            email: "es@example.com",
            googleSubjectId: null,
            profile: {
              availabilityMode: "now",
              trustScore: 70,
              country: "ES",
            },
          },
        ],
      },
      block: { findMany: async () => [] },
      userInterest: {
        findMany: async () => [
          {
            userId: "22222222-2222-4222-8222-222222222222",
            normalizedLabel: "founders",
          },
          {
            userId: "33333333-3333-4333-8333-333333333333",
            normalizedLabel: "founders",
          },
        ],
      },
      userTopic: { findMany: async () => [] },
      intentRequest: { findMany: async () => [] },
      userPreference: {
        findMany: async () => [
          {
            userId: "11111111-1111-4111-8111-111111111111",
            key: "global_rules_country_preferences",
            value: ["uy"],
          },
        ],
      },
    };

    const service = new MatchingService(prisma);
    const results = await service.retrieveCandidates(
      "11111111-1111-4111-8111-111111111111",
      {
        topics: ["founders"],
        intentType: "chat",
      },
      5,
    );

    expect(results.map((candidate) => candidate.userId)).toEqual([
      "22222222-2222-4222-8222-222222222222",
    ]);
  });

  it("ranks candidates using reliability signals when semantic scores tie", async () => {
    const intentRequestFindMany = vi.fn().mockImplementation((args?: any) => {
      if (args?.where?.status?.in) {
        return Promise.resolve([
          {
            recipientUserId: "22222222-2222-4222-8222-222222222222",
            status: "accepted",
          },
          {
            recipientUserId: "22222222-2222-4222-8222-222222222222",
            status: "accepted",
          },
          {
            recipientUserId: "22222222-2222-4222-8222-222222222222",
            status: "rejected",
          },
          {
            recipientUserId: "33333333-3333-4333-8333-333333333333",
            status: "pending",
          },
          {
            recipientUserId: "33333333-3333-4333-8333-333333333333",
            status: "rejected",
          },
        ]);
      }
      return Promise.resolve([]);
    });

    const prisma: any = {
      user: {
        findUnique: async () => ({
          id: "11111111-1111-4111-8111-111111111111",
          googleSubjectId: "google-sub-1",
          email: "sender@example.com",
          profile: { trustScore: 85 },
        }),
        findMany: async () => [
          {
            id: "22222222-2222-4222-8222-222222222222",
            displayName: "Reliable User",
            status: "active",
            profile: { availabilityMode: "now", trustScore: 70 },
          },
          {
            id: "33333333-3333-4333-8333-333333333333",
            displayName: "Low Reliability User",
            status: "active",
            profile: { availabilityMode: "now", trustScore: 70 },
          },
        ],
      },
      block: { findMany: async () => [] },
      userInterest: { findMany: async () => [] },
      userTopic: { findMany: async () => [] },
      intentRequest: { findMany: intentRequestFindMany },
      userPreference: { findMany: async () => [] },
      $queryRawUnsafe: vi.fn().mockResolvedValue([
        {
          userId: "22222222-2222-4222-8222-222222222222",
          semanticScore: 0.9,
        },
        {
          userId: "33333333-3333-4333-8333-333333333333",
          semanticScore: 0.9,
        },
      ]),
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    };

    const service = new MatchingService(prisma);
    const results = await service.retrieveCandidates(
      "11111111-1111-4111-8111-111111111111",
      {
        topics: ["running"],
      },
      2,
      { intentId: "44444444-4444-4444-8444-444444444444" },
    );

    expect(results.map((candidate) => candidate.userId)).toEqual([
      "22222222-2222-4222-8222-222222222222",
      "33333333-3333-4333-8333-333333333333",
    ]);
    expect(results[0]?.rationale["reliabilityScore"]).toBeGreaterThan(
      Number(results[1]?.rationale["reliabilityScore"] ?? 0),
    );
  });

  it("uses empty-market widening strategy to avoid no-result stalls", async () => {
    const previous = process.env.MATCHING_MARKET_STAGE;
    process.env.MATCHING_MARKET_STAGE = "empty";
    try {
      const prisma: any = {
        user: {
          findUnique: async () => ({
            id: "11111111-1111-4111-8111-111111111111",
            googleSubjectId: "google-sub-1",
            email: "sender@example.com",
            profile: { trustScore: 70, availabilityMode: "now" },
          }),
          findMany: async () => [
            {
              id: "22222222-2222-4222-8222-222222222222",
              displayName: "Fallback Candidate",
              status: "active",
              profile: { availabilityMode: "now", trustScore: 70 },
            },
          ],
        },
        block: { findMany: async () => [] },
        userInterest: { findMany: async () => [] },
        userTopic: { findMany: async () => [] },
        intentRequest: { findMany: async () => [] },
        userPreference: { findMany: async () => [] },
      };

      const service = new MatchingService(prisma);
      const results = await service.retrieveCandidates(
        "11111111-1111-4111-8111-111111111111",
        {
          topics: ["ultra-niche-topic"],
          intentType: "chat",
        },
        1,
      );

      expect(results.map((candidate) => candidate.userId)).toEqual([
        "22222222-2222-4222-8222-222222222222",
      ]);
      expect(results[0]?.rationale["marketStage"]).toBe("empty");
      expect(results[0]?.rationale["sparseFallbackEnabled"]).toBe(true);
    } finally {
      if (previous === undefined) {
        delete process.env.MATCHING_MARKET_STAGE;
      } else {
        process.env.MATCHING_MARKET_STAGE = previous;
      }
    }
  });

  it("applies offline account-age and location privacy safeguards", async () => {
    const oldAccountDate = new Date(Date.now() - 40 * 24 * 60 * 60_000);
    const newAccountDate = new Date(Date.now() - 2 * 24 * 60 * 60_000);
    const prisma: any = {
      user: {
        findUnique: async () => ({
          id: "11111111-1111-4111-8111-111111111111",
          googleSubjectId: "sender-google",
          email: "sender@example.com",
          createdAt: oldAccountDate,
          profile: {
            trustScore: 80,
            availabilityMode: "now",
            visibility: "public",
            city: "Madrid",
            country: "Spain",
          },
        }),
        findMany: async () => [
          {
            id: "22222222-2222-4222-8222-222222222222",
            displayName: "Safe Local Candidate",
            status: "active",
            createdAt: oldAccountDate,
            email: "safe@example.com",
            googleSubjectId: null,
            profile: {
              availabilityMode: "now",
              trustScore: 75,
              visibility: "limited",
              city: "Barcelona",
              country: "Spain",
            },
          },
          {
            id: "33333333-3333-4333-8333-333333333333",
            displayName: "Private Candidate",
            status: "active",
            createdAt: oldAccountDate,
            email: "private@example.com",
            googleSubjectId: null,
            profile: {
              availabilityMode: "now",
              trustScore: 75,
              visibility: "private",
              city: "Madrid",
              country: "Spain",
            },
          },
          {
            id: "44444444-4444-4444-8444-444444444444",
            displayName: "Different Country Candidate",
            status: "active",
            createdAt: oldAccountDate,
            email: "other@example.com",
            googleSubjectId: null,
            profile: {
              availabilityMode: "now",
              trustScore: 75,
              visibility: "public",
              city: "Lisbon",
              country: "Portugal",
            },
          },
          {
            id: "55555555-5555-4555-8555-555555555555",
            displayName: "New Account Candidate",
            status: "active",
            createdAt: newAccountDate,
            email: "new@example.com",
            googleSubjectId: null,
            profile: {
              availabilityMode: "now",
              trustScore: 75,
              visibility: "public",
              city: "Madrid",
              country: "Spain",
            },
          },
        ],
      },
      block: { findMany: async () => [] },
      userInterest: {
        findMany: async () => [
          {
            userId: "22222222-2222-4222-8222-222222222222",
            normalizedLabel: "coffee",
          },
          {
            userId: "33333333-3333-4333-8333-333333333333",
            normalizedLabel: "coffee",
          },
          {
            userId: "44444444-4444-4444-8444-444444444444",
            normalizedLabel: "coffee",
          },
          {
            userId: "55555555-5555-4555-8555-555555555555",
            normalizedLabel: "coffee",
          },
        ],
      },
      userTopic: { findMany: async () => [] },
      intentRequest: { findMany: async () => [] },
      userPreference: { findMany: async () => [] },
    };

    const service = new MatchingService(prisma);
    const results = await service.retrieveCandidates(
      "11111111-1111-4111-8111-111111111111",
      {
        topics: ["coffee"],
        modality: "offline",
      },
      5,
    );

    expect(results.map((candidate) => candidate.userId)).toEqual([
      "22222222-2222-4222-8222-222222222222",
    ]);
  });

  it("retrieves candidates by semantic similarity when intent embedding exists", async () => {
    const auditLogCreate = vi.fn().mockResolvedValue({});
    const prisma: any = {
      user: {
        findUnique: async () => ({
          id: "11111111-1111-4111-8111-111111111111",
          googleSubjectId: "google-sub-1",
          email: "sender@example.com",
          profile: { trustScore: 80 },
        }),
        findMany: async () => [
          {
            id: "22222222-2222-4222-8222-222222222222",
            displayName: "Alice",
            status: "active",
            profile: { availabilityMode: "now", trustScore: 70 },
          },
          {
            id: "33333333-3333-4333-8333-333333333333",
            displayName: "Bob",
            status: "active",
            profile: { availabilityMode: "now", trustScore: 70 },
          },
        ],
      },
      block: {
        findMany: async () => [],
      },
      userInterest: {
        findMany: async () => [],
      },
      userTopic: {
        findMany: async () => [],
      },
      intentRequest: {
        findMany: async () => [],
      },
      userPreference: {
        findMany: async () => [],
      },
      $queryRawUnsafe: vi.fn().mockResolvedValue([
        {
          userId: "33333333-3333-4333-8333-333333333333",
          semanticScore: 0.98,
        },
        {
          userId: "22222222-2222-4222-8222-222222222222",
          semanticScore: 0.61,
        },
      ]),
      auditLog: {
        create: auditLogCreate,
      },
    };

    const service = new MatchingService(prisma);
    const results = await service.retrieveCandidates(
      "11111111-1111-4111-8111-111111111111",
      {
        topics: ["chess"],
        intentType: "chat",
      },
      2,
      {
        intentId: "44444444-4444-4444-8444-444444444444",
        traceId: "trace-1",
      },
    );

    expect(results.map((candidate) => candidate.userId)).toEqual([
      "33333333-3333-4333-8333-333333333333",
      "22222222-2222-4222-8222-222222222222",
    ]);
    expect(results[0]?.rationale["retrievalSource"]).toBe("semantic");
    expect(auditLogCreate).toHaveBeenCalledTimes(1);
  });

  it("falls back to lexical overlap when semantic embeddings are unavailable", async () => {
    const prisma: any = {
      user: {
        findUnique: async () => ({
          id: "11111111-1111-4111-8111-111111111111",
          googleSubjectId: null,
          email: null,
          profile: { trustScore: 10 },
        }),
        findMany: async () => [
          {
            id: "22222222-2222-4222-8222-222222222222",
            displayName: "Lexical One",
            status: "active",
            profile: { availabilityMode: "later_today", trustScore: 40 },
          },
          {
            id: "33333333-3333-4333-8333-333333333333",
            displayName: "Lexical Two",
            status: "active",
            profile: { availabilityMode: "later_today", trustScore: 40 },
          },
        ],
      },
      block: {
        findMany: async () => [],
      },
      userInterest: {
        findMany: async () => [
          {
            userId: "22222222-2222-4222-8222-222222222222",
            normalizedLabel: "tennis",
          },
        ],
      },
      userTopic: {
        findMany: async () => [],
      },
      intentRequest: {
        findMany: async () => [],
      },
      userPreference: {
        findMany: async () => [],
      },
    };

    const service = new MatchingService(prisma);
    const results = await service.retrieveCandidates(
      "11111111-1111-4111-8111-111111111111",
      {
        topics: ["tennis"],
        intentType: "chat",
      },
      2,
    );

    expect(results.map((candidate) => candidate.userId)).toEqual([
      "22222222-2222-4222-8222-222222222222",
    ]);
    expect(results[0]?.rationale["retrievalSource"]).toBe("lexical_fallback");
  });

  it("boosts local proximity for offline intents during reranking", async () => {
    const prisma: any = {
      user: {
        findUnique: async () => ({
          id: "11111111-1111-4111-8111-111111111111",
          googleSubjectId: "google-sub-1",
          email: "sender@example.com",
          profile: { trustScore: 85, city: "Madrid", country: "Spain" },
        }),
        findMany: async () => [
          {
            id: "22222222-2222-4222-8222-222222222222",
            displayName: "Nearby User",
            status: "active",
            profile: {
              availabilityMode: "now",
              trustScore: 70,
              city: "Madrid",
              country: "Spain",
            },
          },
          {
            id: "33333333-3333-4333-8333-333333333333",
            displayName: "Far User",
            status: "active",
            profile: {
              availabilityMode: "now",
              trustScore: 70,
              city: "Valencia",
              country: "Spain",
            },
          },
        ],
      },
      block: { findMany: async () => [] },
      userInterest: { findMany: async () => [] },
      userTopic: { findMany: async () => [] },
      intentRequest: { findMany: async () => [] },
      userPreference: { findMany: async () => [] },
      $queryRawUnsafe: vi.fn().mockResolvedValue([
        {
          userId: "22222222-2222-4222-8222-222222222222",
          semanticScore: 0.9,
        },
        {
          userId: "33333333-3333-4333-8333-333333333333",
          semanticScore: 0.9,
        },
      ]),
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    };

    const service = new MatchingService(prisma);
    const results = await service.retrieveCandidates(
      "11111111-1111-4111-8111-111111111111",
      {
        topics: ["running"],
        modality: "offline",
      },
      2,
      { intentId: "44444444-4444-4444-8444-444444444444" },
    );

    expect(results.map((candidate) => candidate.userId)).toEqual([
      "22222222-2222-4222-8222-222222222222",
      "33333333-3333-4333-8333-333333333333",
    ]);
    expect(results[0]?.rationale["proximityScore"]).toBe(1);
    expect(results[1]?.rationale["proximityScore"]).toBe(0.75);
  });

  it("applies recent-interaction suppression and personalization/style boosts", async () => {
    const connectionParticipantFindMany = vi
      .fn()
      .mockResolvedValueOnce([{ connectionId: "conn-1" }])
      .mockResolvedValueOnce([
        { userId: "22222222-2222-4222-8222-222222222222" },
      ]);

    const prisma: any = {
      user: {
        findUnique: async () => ({
          id: "11111111-1111-4111-8111-111111111111",
          googleSubjectId: "google-sub-1",
          email: "sender@example.com",
          profile: { trustScore: 80 },
        }),
        findMany: async () => [
          {
            id: "22222222-2222-4222-8222-222222222222",
            displayName: "Alice",
            status: "active",
            profile: { availabilityMode: "now", trustScore: 70 },
          },
          {
            id: "33333333-3333-4333-8333-333333333333",
            displayName: "Bob",
            status: "active",
            profile: { availabilityMode: "now", trustScore: 70 },
          },
        ],
      },
      block: { findMany: async () => [] },
      userInterest: {
        findMany: async () => [
          {
            userId: "33333333-3333-4333-8333-333333333333",
            normalizedLabel: "strategy",
          },
        ],
      },
      userTopic: { findMany: async () => [] },
      intentRequest: { findMany: async () => [] },
      userPreference: { findMany: async () => [] },
      connectionParticipant: {
        findMany: connectionParticipantFindMany,
      },
      lifeGraphEdge: {
        findMany: async () => [
          {
            edgeType: "high_success_with",
            weight: 1,
            targetNodeId: "node-1",
          },
          {
            edgeType: "likes",
            weight: 0.8,
            targetNodeId: "node-2",
          },
        ],
      },
      lifeGraphNode: {
        findMany: async () => [
          { id: "node-1", nodeType: "person", label: "bob" },
          { id: "node-2", nodeType: "topic", label: "tennis" },
        ],
      },
      $queryRawUnsafe: vi.fn().mockResolvedValue([
        {
          userId: "22222222-2222-4222-8222-222222222222",
          semanticScore: 0.95,
        },
        {
          userId: "33333333-3333-4333-8333-333333333333",
          semanticScore: 0.9,
        },
      ]),
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    };

    const service = new MatchingService(prisma);
    const results = await service.retrieveCandidates(
      "11111111-1111-4111-8111-111111111111",
      {
        topics: ["tennis"],
        vibeConstraints: ["strategy"],
      },
      2,
      { intentId: "44444444-4444-4444-8444-444444444444" },
    );

    expect(results.map((candidate) => candidate.userId)).toEqual([
      "33333333-3333-4333-8333-333333333333",
      "22222222-2222-4222-8222-222222222222",
    ]);
    expect(results[0]?.rationale["styleCompatibility"]).toBe(1);
    expect(results[0]?.rationale["personalizationBoost"]).toBeGreaterThan(
      Number(results[1]?.rationale["personalizationBoost"] ?? 0),
    );
    expect(results[1]?.rationale["noveltySuppressionScore"]).toBe(0.45);
  });
});
