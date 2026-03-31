import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SocialSimService } from "../src/admin/social-sim.service.js";

const ACTOR = {
  adminUserId: "11111111-1111-4111-8111-111111111111",
  role: "admin" as const,
};

function createService() {
  const cacheStore = new Map<string, unknown>();
  const artifactDir = mkdtempSync(path.join(tmpdir(), "social-sim-"));
  process.env.SOCIAL_SIM_ARTIFACT_DIR = artifactDir;
  process.env.SOCIAL_SIM_ENABLED = "true";
  process.env.SOCIAL_SIM_MUTATIONS_ENABLED = "true";

  const appCacheService = {
    getJson: vi
      .fn()
      .mockImplementation(async (key: string) => cacheStore.get(key) ?? null),
    setJson: vi.fn().mockImplementation(async (key: string, value: unknown) => {
      cacheStore.set(key, value);
    }),
  };
  const adminAuditService = {
    recordAction: vi.fn().mockResolvedValue({}),
  };
  const service = new SocialSimService(
    appCacheService as any,
    adminAuditService as any,
  );

  return {
    service,
    appCacheService,
    adminAuditService,
    cacheStore,
    artifactDir,
  };
}

describe("SocialSimService", () => {
  beforeEach(() => {
    process.env.SOCIAL_SIM_ENABLED = "true";
    process.env.SOCIAL_SIM_MUTATIONS_ENABLED = "true";
  });

  afterEach(() => {
    delete process.env.SOCIAL_SIM_ARTIFACT_DIR;
    delete process.env.SOCIAL_SIM_ENABLED;
    delete process.env.SOCIAL_SIM_MUTATIONS_ENABLED;
    delete process.env.SOCIAL_SIM_ALLOWED_ADMIN_USER_IDS;
  });

  it("creates, lists, summarizes, replays, and cleans up run records", async () => {
    const { service, cacheStore, artifactDir, adminAuditService } =
      createService();

    const created = await service.createRun(
      {
        scenarioFamily: "full-social-world",
        provider: "ollama",
        judgeProvider: "openai",
        horizon: "medium",
        seed: "seed-1",
        namespace: "ns-1",
        turnBudget: 24,
        actorCount: 12,
        cleanupMode: "archive",
        notes: ["first-run"],
      },
      ACTOR,
    );

    expect(created.runId).toContain("social-sim-full-social-world");
    expect(
      readFileSync(path.join(artifactDir, created.runId, "run.json"), "utf8"),
    ).toContain("full-social-world");

    const listed = await service.listRuns(ACTOR, 10);
    expect(listed.runs[0]?.runId).toBe(created.runId);

    const summary = await service.getSummary(created.runId, ACTOR);
    expect(summary.run.runId).toBe(created.runId);
    expect(summary.summary.artifactCount).toBeGreaterThan(0);

    const artifacts = await service.listArtifacts(created.runId, ACTOR, 10);
    expect(artifacts.artifacts[0]?.name).toBe("run.json");

    const replay = await service.replayRun(
      created.runId,
      { seed: "seed-2", namespace: "ns-2" },
      ACTOR,
    );
    expect(replay.sourceRunId).toBe(created.runId);
    expect(replay.run.replayOfRunId).toBe(created.runId);

    const turn = await service.recordTurn(
      {
        namespace: "ns-1",
        runId: created.runId,
        worldId: "world-1",
        actorId: "sim-alice",
        actorKind: "individual",
        stage: "matching",
        promptVersion: "social-sim-v1",
        action: {
          intent: "introduce",
        },
        metrics: {
          turnIndex: 1,
        },
      },
      ACTOR,
    );
    expect(turn.accepted).toBe(true);
    expect(turn.artifact?.name).toContain("turn-0001-sim-alice");

    const cleanup = await service.cleanupRun(created.runId, "archive", ACTOR);
    expect(cleanup.cleanup.mode).toBe("archive");
    expect(cleanup.run.status).toBe("archived");

    expect(cacheStore.size).toBeGreaterThan(0);
    expect(adminAuditService.recordAction).toHaveBeenCalled();
  });

  it("respects mutation allowlists", () => {
    const { service } = createService();
    process.env.SOCIAL_SIM_ALLOWED_ADMIN_USER_IDS =
      "22222222-2222-4222-8222-222222222222";
    expect(service.isActorMutationAllowed(ACTOR.adminUserId)).toBe(false);
  });
});
