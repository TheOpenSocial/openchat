import { beforeEach, describe, expect, it, vi } from "vitest";
import { ExperienceController } from "../src/experience/experience.controller.js";

const USER_ID = "11111111-1111-4111-8111-111111111111";

function createController() {
  const service = {
    getBootstrapSummary: vi
      .fn()
      .mockResolvedValue({ generatedAt: "2026-04-10T00:00:00.000Z" }),
    getHomeSummary: vi
      .fn()
      .mockResolvedValue({ generatedAt: "2026-04-10T00:00:00.000Z" }),
    getActivitySummary: vi
      .fn()
      .mockResolvedValue({ generatedAt: "2026-04-10T00:00:00.000Z" }),
  };

  return {
    service,
    controller: new ExperienceController(service as any),
  };
}

describe("ExperienceController", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns home summary for the authenticated user", async () => {
    const { controller, service } = createController();

    const response = (await controller.getHomeSummary(USER_ID, USER_ID)) as any;

    expect(service.getHomeSummary).toHaveBeenCalledWith(USER_ID);
    expect(response.data.generatedAt).toBe("2026-04-10T00:00:00.000Z");
  });

  it("returns bootstrap summary for the authenticated user", async () => {
    const { controller, service } = createController();

    const response = (await controller.getBootstrapSummary(
      USER_ID,
      USER_ID,
    )) as any;

    expect(service.getBootstrapSummary).toHaveBeenCalledWith(USER_ID);
    expect(response.data.generatedAt).toBe("2026-04-10T00:00:00.000Z");
  });

  it("returns activity summary for the authenticated user", async () => {
    const { controller, service } = createController();

    const response = (await controller.getActivitySummary(
      USER_ID,
      USER_ID,
    )) as any;

    expect(service.getActivitySummary).toHaveBeenCalledWith(USER_ID);
    expect(response.data.generatedAt).toBe("2026-04-10T00:00:00.000Z");
  });

  it("rejects cross-user access", async () => {
    const { controller } = createController();

    await expect(
      controller.getHomeSummary(
        USER_ID,
        "22222222-2222-4222-8222-222222222222",
      ),
    ).rejects.toThrow("experience target does not match authenticated user");
  });
});
