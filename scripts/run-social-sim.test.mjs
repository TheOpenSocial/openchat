import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_SOCIAL_SIM_TUNING,
  createBackendAdapter,
  createBrainProvider,
  createJudgeProvider,
  loadSocialSimWorldFixture,
  normalizeSocialSimTuning,
  parseSocialSimArgs,
  runSocialSimulation,
  selectSocialSimWorlds,
} from "./social-sim-core.mjs";

test("parseSocialSimArgs applies sane defaults", () => {
  const config = parseSocialSimArgs([], {
    SOCIAL_SIM_NAMESPACE: "test-namespace",
    SOCIAL_SIM_DRY_RUN: "1",
  });

  assert.equal(config.provider, "ollama");
  assert.equal(config.judgeProvider, "ollama");
  assert.equal(config.namespace, "test-namespace");
  assert.equal(config.dryRun, true);
  assert.equal(config.horizon, "all");
  assert.equal(config.turnBudget, 12);
  assert.equal(config.backendTurnDelayMs, 250);
  assert.equal(config.backendRetryCount, 3);
  assert.equal(config.backendRetryBaseDelayMs, 750);
  assert.equal(config.tuning.thresholds.lowStrength, DEFAULT_SOCIAL_SIM_TUNING.thresholds.lowStrength);
});

test("parseSocialSimArgs applies tuning overrides from JSON", () => {
  const config = parseSocialSimArgs(
    ["--tuning-json={\"probabilities\":{\"memoryConversation\":0.9},\"scoring\":{\"missingGroupPenalty\":0.2}}"],
    {},
  );

  assert.equal(config.tuning.probabilities.memoryConversation, 0.9);
  assert.equal(config.tuning.scoring.missingGroupPenalty, 0.2);
  assert.equal(
    config.tuning.thresholds.lowStrength,
    DEFAULT_SOCIAL_SIM_TUNING.thresholds.lowStrength,
  );
});

test("normalizeSocialSimTuning preserves defaults for missing fields", () => {
  const tuning = normalizeSocialSimTuning({
    deltas: {
      inviteGroupInGroupWorld: 0.2,
    },
  });

  assert.equal(tuning.deltas.inviteGroupInGroupWorld, 0.2);
  assert.equal(tuning.deltas.reply, DEFAULT_SOCIAL_SIM_TUNING.deltas.reply);
  assert.equal(
    tuning.scoring.matchedRatioWeight,
    DEFAULT_SOCIAL_SIM_TUNING.scoring.matchedRatioWeight,
  );
  assert.equal(
    tuning.policy.networkOrganizerPostRecoveryTargetStrategy,
    DEFAULT_SOCIAL_SIM_TUNING.policy.networkOrganizerPostRecoveryTargetStrategy,
  );
});

test("loadSocialSimWorldFixture normalizes canonical fixture worlds", () => {
  const worlds = loadSocialSimWorldFixture(
    path.resolve("scripts/social-sim-worlds.json"),
    path.resolve("apps/api/test/fixtures/agentic-scenarios.json"),
  );

  assert.ok(worlds.length >= 10);
  assert.ok(worlds.some((world) => world.horizon === "long"));
  assert.ok(worlds.some((world) => world.id === "medium-dense-social-mixer-v1"));
  assert.ok(worlds.some((world) => world.id === "long-network-rebalancing-v1"));
  assert.ok(worlds.some((world) => world.id === "medium-multi-cluster-bridging-v1"));
  assert.ok(worlds.some((world) => world.id === "long-recurring-circle-fragmentation-v1"));
  assert.ok(worlds.some((world) => world.id === "long-bad-actor-containment-v1"));
  assert.ok(worlds.every((world) => Array.isArray(world.actors)));
  assert.ok(worlds.every((world) => Array.isArray(world.relationships)));
});

test("selectSocialSimWorlds narrows by horizon and scenario", () => {
  const worlds = loadSocialSimWorldFixture(
    path.resolve("scripts/social-sim-worlds.json"),
    path.resolve("apps/api/test/fixtures/agentic-scenarios.json"),
  );

  const shortOnly = selectSocialSimWorlds(worlds, {
    horizon: "short",
    worldFilter: [],
    scenarioFilter: [],
  });
  assert.ok(shortOnly.length >= 2);
  assert.ok(shortOnly.every((world) => world.horizon === "short"));

  const longOnly = selectSocialSimWorlds(worlds, {
    horizon: "long",
    worldFilter: [],
    scenarioFilter: [],
  });
  assert.ok(longOnly.length >= 2);
  assert.ok(longOnly.every((world) => world.horizon === "long"));

  const byScenario = selectSocialSimWorlds(worlds, {
    horizon: "all",
    worldFilter: [],
    scenarioFilter: ["social_recurring_circle_join_v1"],
  });
  assert.ok(byScenario.some((world) => world.id === "medium-recurring-circle-v1"));
});

test("provider and judge factories return deterministic stub adapters", async () => {
  const brain = createBrainProvider({ provider: "stub" });
  const judge = createJudgeProvider({ judgeProvider: "stub" });
  const worlds = loadSocialSimWorldFixture(
    path.resolve("scripts/social-sim-worlds.json"),
    path.resolve("apps/api/test/fixtures/agentic-scenarios.json"),
  );
  const world = worlds[0];
  const actor = world.actors[0];
  const state = {
    stage: "onboarding",
    turnIndex: 0,
    lastActionByActor: new Map(),
    knownTargets: new Map(),
  };

  const turn = await brain.generateActorTurn({
    world,
    actor,
    state,
    transcript: [],
    rng: () => 0.25,
    config: {},
  });
  const turnRecord = {
    turnIndex: 0,
    outcome: {
      matched: false,
      stalled: false,
    },
  };
  const judgedTurn = await judge.scoreTurn({
    world,
    actor,
    action: turn,
    turnRecord,
    transcript: [turn],
    state,
    config: {},
  });
  const judgedWorld = await judge.scoreWorld({
    world,
    transcript: [turn],
    state: { ...state, matchedMembers: new Set() },
    metrics: {
      introductions: 1,
      replies: 0,
      followups: 0,
      invites: 0,
      memorySignals: 0,
      recoverySignals: 0,
      moderationSignals: 0,
      matchedMembers: new Set(),
      stalledTurns: 0,
      totalTurns: 1,
    },
    turns: [judgedTurn],
    config: {},
  });

  assert.equal(turn.promptVersion, "social-sim-v1");
  assert.ok(turn.message.length > 0);
  assert.ok(judgedTurn.score >= 0);
  assert.ok(judgedWorld.score >= 0);
});

test("recovery worlds detach from weak-fit loops after initial recovery", async () => {
  const brain = createBrainProvider({ provider: "stub" });
  const worlds = loadSocialSimWorldFixture(
    path.resolve("scripts/social-sim-worlds.json"),
    path.resolve("apps/api/test/fixtures/agentic-scenarios.json"),
  );
  const world = worlds.find((entry) => entry.id === "short-no-match-recovery-v1");
  const actor = world.actors.find((entry) => entry.id === "drew");
  const state = {
    stage: "matching",
    turnIndex: 3,
    lastActionByActor: new Map([["drew", { intent: "recover_no_match" }]]),
    knownTargets: new Map([
      ["cora-drew", { action: "recover_no_match", turnIndex: 2, confidence: 0.52 }],
    ]),
  };

  const turn = await brain.generateActorTurn({
    world,
    actor,
    state,
    transcript: [],
    rng: () => 0.2,
    config: {},
  });

  assert.equal(turn.intent, "ask_preference");
  assert.equal(turn.targetActorId, null);
  assert.equal(turn.detachedFromWeakFit, true);
});

test("circle organizers prioritize unfinished returning members", async () => {
  const brain = createBrainProvider({ provider: "stub" });
  const worlds = loadSocialSimWorldFixture(
    path.resolve("scripts/social-sim-worlds.json"),
    path.resolve("apps/api/test/fixtures/agentic-scenarios.json"),
  );
  const world = worlds.find((entry) => entry.id === "medium-recurring-circle-v1");
  const actor = world.actors.find((entry) => entry.id === "circle-organizer");
  const state = {
    stage: "matching",
    turnIndex: 1,
    lastActionByActor: new Map(),
    knownTargets: new Map([
      ["circle-return-1", { action: "introduce", turnIndex: 0, confidence: 0.76 }],
    ]),
  };

  const turn = await brain.generateActorTurn({
    world,
    actor,
    state,
    transcript: [],
    rng: () => 0.3,
    config: {},
  });

  assert.equal(turn.targetActorId, "circle-luca");
  assert.equal(turn.intent, "reference_memory");
});

test("network rebalancing organizers can reroute to a healthier target after recovery", async () => {
  const brain = createBrainProvider({ provider: "stub" });
  const worlds = loadSocialSimWorldFixture(
    path.resolve("scripts/social-sim-worlds.json"),
    path.resolve("apps/api/test/fixtures/agentic-scenarios.json"),
  );
  const world = worlds.find((entry) => entry.id === "long-network-rebalancing-v1");
  const actor = world.actors.find((entry) => entry.id === "rebalance-host-mila");
  const state = {
    stage: "conversation",
    turnIndex: 4,
    lastActionByActor: new Map([["rebalance-host-mila", { intent: "recover_no_match" }]]),
    knownTargets: new Map([
      ["rebalance-host-noah", { action: "recover_no_match", turnIndex: 3, confidence: 0.52 }],
      ["rebalance-host-ivy", { action: "reference_memory", turnIndex: 2, confidence: 0.76 }],
    ]),
  };

  const turn = await brain.generateActorTurn({
    world,
    actor,
    state,
    transcript: [],
    rng: () => 0.3,
    config: {
      tuning: normalizeSocialSimTuning({
        policy: {
          networkOrganizerPostRecoveryTargetStrategy: "best_alternative",
        },
      }),
    },
  });

  assert.equal(turn.intent, "invite_group");
  assert.equal(turn.targetActorId, "rebalance-ivy");
  assert.equal(turn.detachedFromWeakFit, true);
});

test("runSocialSimulation writes artifacts in dry-run mode", async () => {
  const artifactRoot = mkdtempSync(path.join(os.tmpdir(), "social-sim-test-"));
  try {
    const result = await runSocialSimulation({
      provider: "stub",
      judgeProvider: "stub",
      horizon: "short",
      worldFilter: ["short-direct-match-v1"],
      scenarioFilter: [],
      seed: 12345,
      namespace: "test-social-sim",
      turnBudget: 4,
      cleanupMode: "none",
      dryRun: true,
      nightly: false,
      artifactRoot,
      fixturePath: path.resolve("scripts/social-sim-worlds.json"),
      scenarioFixturePath: path.resolve(
        "apps/api/test/fixtures/agentic-scenarios.json",
      ),
      baseUrl: "",
      adminUserId: "",
      adminRole: "admin",
      adminApiKey: "",
      ollamaBaseUrl: "http://localhost:11434",
      ollamaModel: "llama3.1",
      openaiApiKey: "",
      openaiModel: "gpt-4.1-mini",
      useRemoteProvider: false,
      useRemoteJudge: false,
      backendTurnDelayMs: 0,
      backendRetryCount: 0,
      backendRetryBaseDelayMs: 0,
    });

    assert.equal(result.summary.verdict, "watch");
    assert.ok(result.artifact.worlds.length >= 1);
    const runJson = JSON.parse(
      readFileSync(path.join(result.runDir, "run.json"), "utf8"),
    );
    assert.equal(runJson.runId, result.artifact.runId);
    assert.equal(runJson.namespace, "test-social-sim");
  } finally {
    rmSync(artifactRoot, { recursive: true, force: true });
  }
});

test("backend adapter retries abuse throttling before falling back offline", async () => {
  const adapter = createBackendAdapter({
    baseUrl: "https://api.example.com",
    adminUserId: "11111111-1111-4111-8111-111111111111",
    adminRole: "admin",
    adminApiKey: "test-key",
    namespace: "social-sim-test",
    backendTurnDelayMs: 0,
    backendRetryCount: 2,
    backendRetryBaseDelayMs: 0,
  });
  adapter.remoteRunId = "remote-run-1";

  const originalFetch = globalThis.fetch;
  let callCount = 0;
  globalThis.fetch = async () => {
    callCount += 1;
    if (callCount < 3) {
      return {
        ok: false,
        status: 429,
        async json() {
          return {
            success: false,
            error: {
              code: "abuse_throttled",
            },
          };
        },
      };
    }
    return {
      ok: true,
      status: 200,
      async json() {
        return {
          success: true,
          data: {
            accepted: true,
            mode: "persisted",
          },
        };
      },
    };
  };

  try {
    const result = await adapter.submitTurn({
      world: {
        id: "world-1",
      },
      actor: {
        id: "actor-1",
        kind: "individual",
      },
      action: {
        intent: "follow_up",
      },
      state: {
        stage: "conversation",
        turnIndex: 3,
      },
      dryRun: false,
    });

    assert.equal(callCount, 3);
    assert.equal(result.mode, "backend");
    assert.equal(result.status, "recovered");
    assert.equal(result.detail.retryCount, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("backend bootstrap redacts secret env values in artifacts", async () => {
  const artifactRoot = mkdtempSync(path.join(os.tmpdir(), "social-sim-redact-"));
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.endsWith("/api/admin/playground/bootstrap")) {
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            success: true,
            data: {
              env: {
                SMOKE_BASE_URL: "http://localhost:3000",
                SMOKE_ACCESS_TOKEN: "secret-token",
                SOCIAL_SIM_ADMIN_API_KEY: "secret-key",
                ONBOARDING_PROBE_TOKEN: "probe-token",
              },
              entities: {
                smokeUserId: "77777777-7777-4777-8777-777777777777",
              },
              notes: ["bootstrapped"],
            },
          };
        },
      };
    }
    if (url.endsWith("/api/admin/social-sim/runs")) {
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            success: true,
            data: {
              runId: "remote-run-1",
            },
          };
        },
      };
    }
    throw new Error(`Unexpected fetch in test: ${url}`);
  };

  try {
    const result = await runSocialSimulation({
      provider: "stub",
      judgeProvider: "stub",
      horizon: "short",
      worldFilter: ["short-direct-match-v1"],
      scenarioFilter: [],
      seed: 12345,
      namespace: "test-social-sim-redact",
      turnBudget: 4,
      cleanupMode: "none",
      dryRun: false,
      nightly: false,
      artifactRoot,
      fixturePath: path.resolve("scripts/social-sim-worlds.json"),
      scenarioFixturePath: path.resolve(
        "apps/api/test/fixtures/agentic-scenarios.json",
      ),
      baseUrl: "https://api.example.com",
      adminUserId: "11111111-1111-4111-8111-111111111111",
      adminRole: "admin",
      adminApiKey: "real-admin-key",
      ollamaBaseUrl: "http://localhost:11434",
      ollamaModel: "llama3.1",
      openaiApiKey: "",
      openaiModel: "gpt-4.1-mini",
      useRemoteProvider: false,
      useRemoteJudge: false,
      backendTurnDelayMs: 0,
      backendRetryCount: 0,
      backendRetryBaseDelayMs: 0,
    });

    const summary = JSON.parse(
      readFileSync(path.join(result.runDir, "summary.json"), "utf8"),
    );
    assert.equal(summary.bootstrap.env.SMOKE_ACCESS_TOKEN, "[redacted]");
    assert.equal(summary.bootstrap.env.SOCIAL_SIM_ADMIN_API_KEY, "[redacted]");
    assert.equal(summary.bootstrap.env.ONBOARDING_PROBE_TOKEN, "[redacted]");
    assert.equal(summary.bootstrap.env.SMOKE_BASE_URL, "http://localhost:3000");
  } finally {
    globalThis.fetch = originalFetch;
    rmSync(artifactRoot, { recursive: true, force: true });
  }
});
