import { ForbiddenException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { SearchController } from "../src/search/search.controller.js";

describe("SearchController", () => {
  it("returns search results for the authenticated user", async () => {
    const userId = "11111111-1111-4111-8111-111111111111";
    const searchService: any = {
      search: vi.fn().mockResolvedValue({
        userId,
        query: "tennis",
        generatedAt: "2026-03-20T20:00:00.000Z",
        users: [],
        topics: [],
        activities: [],
        groups: [],
      }),
    };
    const launchControlsService: any = {
      assertActionAllowed: vi.fn().mockResolvedValue(undefined),
    };

    const controller = new SearchController(
      searchService,
      launchControlsService,
    );

    const result = await controller.search(
      userId,
      { q: "tennis", limit: "5" },
      userId,
    );

    expect(result.success).toBe(true);
    expect(searchService.search).toHaveBeenCalledWith(userId, "tennis", 5);
  });

  it("rejects search when actor does not own target user", async () => {
    const searchService: any = { search: vi.fn() };
    const controller = new SearchController(searchService);

    await expect(
      controller.search(
        "11111111-1111-4111-8111-111111111111",
        { q: "tennis" },
        "22222222-2222-4222-8222-222222222222",
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
