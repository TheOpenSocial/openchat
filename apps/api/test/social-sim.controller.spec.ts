import { describe, expect, it, vi } from "vitest";
import { SocialSimController } from "../src/admin/social-sim.controller.js";

const ADMIN_USER_ID = "11111111-1111-4111-8111-111111111111";

function createController(overrides: Partial<Record<string, any>> = {}) {
  const service = overrides.service ?? {
    isEnabled: vi.fn().mockReturnValue(true),
    isMutationsEnabled: vi.fn().mockReturnValue(true),
    isActorMutationAllowed: vi.fn().mockReturnValue(true),
    createRun: vi.fn().mockResolvedValue({
      runId: "social-sim-full-social-world-1",
      scenarioFamily: "full-social-world",
      provider: "ollama",
      judgeProvider: "ollama",
      horizon: "medium",
      seed: "seed-1",
      namespace: "ns-1",
      turnBudget: 24,
      actorCount: 12,
      cleanupMode: "archive",
      status: "created",
      createdAt: "2026-03-30T00:00:00.000Z",
      updatedAt: "2026-03-30T00:00:00.000Z",
      startedAt: null,
      finishedAt: null,
      sourceRunId: null,
      replayOfRunId: null,
      artifactDir: "/tmp/social-sim",
      summary: {
        scenarioFamily: "full-social-world",
        provider: "ollama",
        judgeProvider: "ollama",
        horizon: "medium",
        seed: "seed-1",
        namespace: "ns-1",
        turnBudget: 24,
        actorCount: 12,
        artifactCount: 1,
        memoryConsistency: null,
        convergenceScore: null,
        matchRate: null,
        introToChatRate: null,
        chatToOutcomeRate: null,
        noMatchRecoveryQuality: null,
        safetyFlags: [],
        notes: [],
      },
    }),
    listRuns: vi.fn().mockResolvedValue({ generatedAt: "now", runs: [] }),
    recordTurn: vi.fn().mockResolvedValue({
      accepted: true,
      mode: "persisted",
      runId: "social-sim-full-social-world-1",
      artifact: { name: "turn-0001-sim-alice.json" },
    }),
    getSummary: vi.fn().mockResolvedValue({
      generatedAt: "now",
      run: { runId: "social-sim-full-social-world-1" },
      summary: { artifactCount: 1 },
    }),
    listArtifacts: vi.fn().mockResolvedValue({
      generatedAt: "now",
      artifacts: [{ name: "run.json" }],
    }),
    cleanupRun: vi.fn().mockResolvedValue({
      run: { runId: "social-sim-full-social-world-1" },
      cleanup: { mode: "archive" },
    }),
    replayRun: vi.fn().mockResolvedValue({
      sourceRunId: "social-sim-full-social-world-1",
      run: { runId: "social-sim-full-social-world-2" },
    }),
  };
  const playgroundService = overrides.playgroundService ?? {};
  return {
    service,
    controller: new SocialSimController(service, playgroundService),
  };
}

describe("SocialSimController", () => {
  it("allows support role to list runs", async () => {
    const { controller, service } = createController();
    const response = (await controller.listRuns(
      "10",
      ADMIN_USER_ID,
      "support",
    )) as any;
    expect(response.data.runs).toEqual([]);
    expect(service.listRuns).toHaveBeenCalledWith(
      { adminUserId: ADMIN_USER_ID, role: "support" },
      10,
    );
  });

  it("creates a simulation run for admin only", async () => {
    const { controller, service } = createController();
    const response = (await controller.createRun(
      {
        scenarioFamily: "full-social-world",
        horizon: "medium",
      },
      ADMIN_USER_ID,
      "admin",
    )) as any;
    expect(response.data.runId).toContain("social-sim-full-social-world");
    expect(service.createRun).toHaveBeenCalled();
  });

  it("accepts turn ingest for allowlisted admin mutations", async () => {
    const { controller, service } = createController();
    const response = (await controller.ingestTurn(
      {
        namespace: "ns-1",
        runId: "social-sim-full-social-world-1",
        worldId: "world-1",
        actorId: "sim-alice",
        actorKind: "individual",
        stage: "matching",
        promptVersion: "social-sim-v1",
        action: { intent: "introduce" },
        metrics: { turnIndex: 1 },
      },
      ADMIN_USER_ID,
      "admin",
    )) as any;
    expect(response.data.accepted).toBe(true);
    expect(service.recordTurn).toHaveBeenCalled();
  });

  it("rejects mutation routes when disabled", async () => {
    const { controller } = createController({
      service: {
        isEnabled: vi.fn().mockReturnValue(true),
        isMutationsEnabled: vi.fn().mockReturnValue(false),
      },
    });
    await expect(
      controller.replay("social-sim-1", {}, ADMIN_USER_ID, "admin"),
    ).rejects.toThrow("social simulation mutations are disabled");
  });
});
