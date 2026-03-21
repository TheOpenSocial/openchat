import { describe, expect, it, vi } from "vitest";
import { SearchService } from "../src/search/search.service.js";

describe("SearchService", () => {
  it("returns user/topic/activity/group search results", async () => {
    const prisma: any = {
      user: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "22222222-2222-4222-8222-222222222222",
            displayName: "Tennis Alex",
            profile: {
              city: "Madrid",
              country: "ES",
              trustScore: 0.8,
              moderationState: "clean",
            },
          },
        ]),
      },
      userTopic: {
        findMany: vi
          .fn()
          .mockResolvedValue([
            { normalizedLabel: "tennis" },
            { normalizedLabel: "tennis" },
          ]),
      },
      userInterest: {
        findMany: vi.fn().mockResolvedValue([{ normalizedLabel: "tennis" }]),
      },
      intent: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "33333333-3333-4333-8333-333333333333",
            userId: "22222222-2222-4222-8222-222222222222",
            rawText: "Looking for tennis partners tonight",
            status: "matching",
            createdAt: new Date("2026-03-20T18:00:00.000Z"),
          },
        ]),
      },
      recurringCircle: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "44444444-4444-4444-8444-444444444444",
            title: "Weekly Tennis Circle",
            description: "Open tennis sessions",
            visibility: "discoverable",
            nextSessionAt: new Date("2026-03-25T20:00:00.000Z"),
            ownerUserId: "22222222-2222-4222-8222-222222222222",
          },
        ]),
      },
    };

    const service = new SearchService(prisma);
    const result = await service.search(
      "11111111-1111-4111-8111-111111111111",
      "tennis",
      5,
    );

    expect(result.users).toHaveLength(1);
    expect(result.topics[0]).toEqual(
      expect.objectContaining({ label: "tennis" }),
    );
    expect(result.activities).toHaveLength(1);
    expect(result.groups).toHaveLength(1);
  });
});
