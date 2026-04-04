import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_SOCIAL_SIM_BENCHMARK_SEED,
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
import {
  getSearchSeeds,
  parseSearchArgs,
} from "./run-social-sim-search.mjs";

function parseTrailingJson(stdout) {
  const trimmed = stdout.trim();
  try {
    return JSON.parse(trimmed);
  } catch (error) {
    if (!(error instanceof SyntaxError)) {
      throw error;
    }
  }

  const start = trimmed.indexOf("{");
  if (start < 0) {
    throw new Error(`Could not find JSON in output:\n${stdout}`);
  }

  let depth = 0;
  let inString = false;
  let escaped = false;
  let end = -1;

  for (let index = start; index < trimmed.length; index += 1) {
    const char = trimmed[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === "{") {
      depth += 1;
      continue;
    }
    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        end = index;
        break;
      }
    }
  }

  if (end < 0) {
    throw new Error(`Could not find balanced JSON in output:\n${stdout}`);
  }

  return JSON.parse(trimmed.slice(start, end + 1));
}

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
  assert.equal(config.turnBudget, null);
  assert.equal(config.backendTurnDelayMs, 250);
  assert.equal(config.backendRetryCount, 3);
  assert.equal(config.backendRetryBaseDelayMs, 750);
  assert.equal(config.tuning.thresholds.lowStrength, DEFAULT_SOCIAL_SIM_TUNING.thresholds.lowStrength);
});

test("parseSocialSimArgs enables deterministic benchmark mode defaults", () => {
  const config = parseSocialSimArgs([], {
    SOCIAL_SIM_BENCHMARK_MODE: "1",
    SOCIAL_SIM_PROVIDER: "stub",
  });

  assert.equal(config.benchmarkMode, true);
  assert.equal(config.seed, DEFAULT_SOCIAL_SIM_BENCHMARK_SEED);
  assert.equal(config.failOnRemoteFallback, true);
});

test("parseSocialSimArgs rejects benchmark mode without remote provider for non-stub actors", () => {
  assert.throws(
    () => parseSocialSimArgs(["--benchmark-mode=1", "--provider=ollama"], {}),
    /requires --use-remote-provider/,
  );
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

test("parseSearchArgs preserves explicit seed overrides", () => {
  const parsed = parseSearchArgs([
    "--search-profile=weak-worlds-v3",
    "--seeds=17031,27031,37031",
    "--top-k=2",
  ]);

  assert.equal(parsed.profile, "weak-worlds-v3");
  assert.deepEqual(parsed.seeds, [17031, 27031, 37031]);
  assert.equal(parsed.topK, 2);
});

test("getSearchSeeds falls back to stable matrix when no explicit seed is set", () => {
  const seeds = getSearchSeeds({ seed: 12345 }, {
    hasExplicitSeed: false,
    seeds: [],
  });

  assert.deepEqual(seeds, [17031, 27031, 37031]);
});

test("getSearchSeeds respects explicit single-seed runs", () => {
  const seeds = getSearchSeeds({ seed: 12345 }, {
    hasExplicitSeed: true,
    seeds: [],
  });

  assert.deepEqual(seeds, [12345]);
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
  assert.ok(worlds.some((world) => world.id === "medium-cross-cluster-holdout-v1"));
  assert.ok(worlds.some((world) => world.id === "long-trust-boundary-holdout-v1"));
  const recoveryWorld = worlds.find((world) => world.id === "short-no-match-recovery-v1");
  assert.equal(recoveryWorld?.actors.length, 3);
  assert.equal(recoveryWorld?.relationships.length, 3);
  assert.equal(recoveryWorld?.benchmark?.split, "train");
  assert.equal(recoveryWorld?.benchmark?.requiredTransitions?.[0]?.type, "recover_then_match");
  assert.deepEqual(recoveryWorld?.oracle.preferredOutcomeEdges, ["cora-mina"]);
  assert.deepEqual(recoveryWorld?.oracle.forbiddenOutcomeEdges, ["cora-drew", "drew-mina"]);
  const holdoutWorld = worlds.find((world) => world.id === "medium-cross-cluster-holdout-v1");
  assert.equal(holdoutWorld?.worldSet, "holdout");
  assert.equal(holdoutWorld?.family, "dense-social-graph");
  assert.equal(holdoutWorld?.benchmark?.split, "holdout");
  assert.equal(
    holdoutWorld?.benchmark?.requiredTransitions?.[0]?.targetEdgeId,
    "holdout-group-ara-len",
  );
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

  const holdoutOnly = selectSocialSimWorlds(worlds, {
    horizon: "all",
    worldFilter: [],
    scenarioFilter: [],
    worldSet: "holdout",
  });
  assert.deepEqual(
    holdoutOnly.map((world) => world.id).sort(),
    [
      "long-trust-boundary-holdout-v1",
      "medium-cross-cluster-holdout-v1",
    ],
  );
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

test("remote actor providers fail closed in benchmark mode when remote generation falls back", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error("synthetic remote failure");
  };
  try {
    const brain = createBrainProvider({
      provider: "ollama",
      useRemoteProvider: true,
      failOnRemoteFallback: true,
      ollamaBaseUrl: "http://127.0.0.1:9",
    });
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

    await assert.rejects(
      brain.generateActorTurn({
        world,
        actor,
        state,
        transcript: [],
        rng: () => 0.25,
        config: {
          failOnRemoteFallback: true,
        },
      }),
      /fell back to heuristic output in fail-closed mode/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
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

  assert.equal(turn.intent, "reply");
  assert.equal(turn.targetActorId, null);
  assert.equal(turn.detachedFromWeakFit, true);
});

test("recovery planners close toward the preferred fallback after detaching", async () => {
  const brain = createBrainProvider({ provider: "stub" });
  const worlds = loadSocialSimWorldFixture(
    path.resolve("scripts/social-sim-worlds.json"),
    path.resolve("apps/api/test/fixtures/agentic-scenarios.json"),
  );
  const world = worlds.find((entry) => entry.id === "short-no-match-recovery-v1");
  const actor = world.actors.find((entry) => entry.id === "cora");
  const state = {
    stage: "conversation",
    turnIndex: 3,
    lastActionByActor: new Map([["cora", { intent: "recover_no_match" }]]),
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

  assert.equal(turn.targetActorId, "mina");
  assert.equal(turn.detachedFromWeakFit, false);
  assert.ok(["reply", "propose_event"].includes(turn.intent));
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
  assert.equal(turn.intent, "invite_group");
});

test("circle participants force required recurring-edge closure during conversation", async () => {
  const brain = createBrainProvider({ provider: "stub" });
  const worlds = loadSocialSimWorldFixture(
    path.resolve("scripts/social-sim-worlds.json"),
    path.resolve("apps/api/test/fixtures/agentic-scenarios.json"),
  );
  const world = structuredClone(
    worlds.find((entry) => entry.id === "long-recurring-circle-fragmentation-v1"),
  );
  const actor = world.actors.find((entry) => entry.id === "frag-regular-lio");
  const targetRelationship = world.relationships.find((entry) => entry.id === "frag-selim-lio");
  targetRelationship.strength = 0.65;
  const state = {
    stage: "conversation",
    turnIndex: 9,
    lastActionByActor: new Map(),
    knownTargets: new Map([
      ["frag-selim-lio", { action: "reply", turnIndex: 8, confidence: 0.74 }],
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

  assert.equal(turn.targetActorId, "frag-group-selim");
  assert.equal(turn.intent, "invite_group");
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

test("dense graph planners prioritize required bridge closure over generic chatter", async () => {
  const brain = createBrainProvider({ provider: "stub" });
  const worlds = loadSocialSimWorldFixture(
    path.resolve("scripts/social-sim-worlds.json"),
    path.resolve("apps/api/test/fixtures/agentic-scenarios.json"),
  );
  const world = worlds.find((entry) => entry.id === "medium-cross-cluster-holdout-v1");
  const actor = world.actors.find((entry) => entry.id === "holdout-group-ara");
  const state = {
    stage: "conversation",
    turnIndex: 4,
    lastActionByActor: new Map(),
    knownTargets: new Map([
      ["holdout-group-ara-len", { action: "reply", turnIndex: 3, confidence: 0.74 }],
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

  assert.equal(turn.targetActorId, "holdout-kai");
  assert.equal(turn.intent, "invite_group");
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
    assert.ok(Array.isArray(result.summary.measurementWarnings));
    assert.ok(result.summary.measurementWarnings.includes("turn_budget_override_truncated_1_worlds"));
    assert.ok(result.summary.familyScores["individual-matchmaking"]);
    assert.ok(result.artifact.worlds.length >= 1);
    assert.ok(result.artifact.worlds[0].summary.scoreBreakdown);
    assert.equal(result.artifact.worlds[0].summary.measurement.turnBudgetGap, 2);
    assert.ok(
      Number.isFinite(result.artifact.worlds[0].summary.strongRelationshipCoverage),
    );
    assert.ok(Number.isFinite(result.artifact.worlds[0].summary.meanStrengthLift));
    assert.ok(Number.isFinite(result.artifact.worlds[0].summary.oracleScore));
    assert.ok(Number.isFinite(result.artifact.worlds[0].summary.oracleProgressScore));
    assert.ok(Number.isFinite(result.artifact.worlds[0].summary.closurePrecision));
    assert.ok(Number.isFinite(result.artifact.worlds[0].summary.preferredRecall));
    assert.ok(Number.isFinite(result.artifact.worlds[0].summary.forbiddenAvoidance));
    assert.ok(
      Number.isFinite(
        result.summary.familyScores["individual-matchmaking"].averageStrongRelationshipCoverage,
      ),
    );
    assert.ok(
      Number.isFinite(result.summary.familyScores["individual-matchmaking"].averageOracleScore),
    );
    assert.ok(
      Number.isFinite(
        result.summary.familyScores["individual-matchmaking"].averageOracleProgressScore,
      ),
    );
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
  const remoteRunBodies = [];
  globalThis.fetch = async (input, init) => {
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
      remoteRunBodies.push(JSON.parse(String(init?.body ?? "{}")));
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
    const runArtifact = JSON.parse(
      readFileSync(path.join(result.runDir, "run.json"), "utf8"),
    );
    assert.equal(summary.bootstrap.env.SMOKE_ACCESS_TOKEN, "[redacted]");
    assert.equal(summary.bootstrap.env.SOCIAL_SIM_ADMIN_API_KEY, "[redacted]");
    assert.equal(summary.bootstrap.env.ONBOARDING_PROBE_TOKEN, "[redacted]");
    assert.equal(summary.bootstrap.env.SMOKE_BASE_URL, "http://localhost:3000");
    assert.equal(runArtifact.bootstrap.env.SMOKE_ACCESS_TOKEN, "[redacted]");
    assert.equal(runArtifact.bootstrap.env.SOCIAL_SIM_ADMIN_API_KEY, "[redacted]");
    assert.equal(runArtifact.bootstrap.env.ONBOARDING_PROBE_TOKEN, "[redacted]");
    assert.equal(runArtifact.bootstrap.env.SMOKE_BASE_URL, "http://localhost:3000");
    assert.equal(remoteRunBodies.length, 1);
    assert.equal("provider" in remoteRunBodies[0], false);
    assert.equal("judgeProvider" in remoteRunBodies[0], false);
  } finally {
    globalThis.fetch = originalFetch;
    rmSync(artifactRoot, { recursive: true, force: true });
  }
});

test("search runner uses stable default seeds and writes summary artifacts", () => {
  const stdout = execFileSync(
    process.execPath,
    [
      path.resolve("scripts/run-social-sim-search.mjs"),
      "--search-profile=weak-worlds-v3",
      "--max-candidates=1",
      "--top-k=1",
      "--horizon=short",
      "--turn-budget=4",
      "--world=short-direct-match-v1",
    ],
    {
      encoding: "utf8",
      stdio: "pipe",
      maxBuffer: 20 * 1024 * 1024,
    },
  );

  const summary = parseTrailingJson(stdout);
  assert.equal(summary.profile, "weak-worlds-v3");
  assert.equal(summary.objective, "network-floor-push");
  assert.deepEqual(summary.seeds, [17031, 27031, 37031]);
  assert.equal(summary.candidateCount, 1);
  assert.equal(summary.topCandidates[0].seedRuns.length, 3);
  assert.ok(summary.topCandidates[0].metrics.networkFloor >= 0);
  assert.ok(summary.topCandidates[0].metrics.strongCoverageMean >= 0);
  assert.ok(summary.topCandidates[0].metrics.weakStartMatchMean >= 0);
  assert.ok(summary.topCandidates[0].metrics.meanStrengthLiftMean >= 0);
  assert.ok(summary.topCandidates[0].metrics.oracleScoreMean >= 0);
  assert.ok(summary.topCandidates[0].metrics.oracleProgressMean >= 0);
  assert.ok(summary.topCandidates[0].metrics.closurePrecisionMean >= 0);
  assert.ok(summary.topCandidates[0].metrics.preferredRecallMean >= 0);
  assert.ok(summary.topCandidates[0].metrics.forbiddenAvoidanceMean >= 0);
  assert.ok(summary.topCandidates[0].metrics.objectiveStdDev >= 0);
  assert.ok(summary.topCandidates[0].metrics.worstSeedObjective >= 0);
});

test("search runner honors explicit multi-seed overrides", () => {
  const stdout = execFileSync(
    process.execPath,
    [
      path.resolve("scripts/run-social-sim-search.mjs"),
      "--search-profile=weak-worlds-v3",
      "--max-candidates=1",
      "--top-k=1",
      "--horizon=short",
      "--turn-budget=4",
      "--world=short-direct-match-v1",
      "--seeds=11,22",
    ],
    {
      encoding: "utf8",
      stdio: "pipe",
      maxBuffer: 20 * 1024 * 1024,
    },
  );

  const summary = parseTrailingJson(stdout);
  assert.deepEqual(summary.seeds, [11, 22]);
  assert.equal(summary.topCandidates[0].seedRuns.length, 2);
});

test("search runner reports holdout metrics for holdout profile", () => {
  const stdout = execFileSync(
    process.execPath,
    [
      path.resolve("scripts/run-social-sim-search.mjs"),
      "--search-profile=holdout-balance-v1",
      "--max-candidates=1",
      "--top-k=1",
      "--horizon=all",
    ],
    {
      encoding: "utf8",
      stdio: "pipe",
      maxBuffer: 20 * 1024 * 1024,
    },
  );

  const summary = parseTrailingJson(stdout);
  assert.equal(summary.profile, "holdout-balance-v1");
  assert.equal(summary.objective, "holdout-balance");
  assert.ok(Array.isArray(summary.holdoutWorlds));
  assert.ok(summary.holdoutWorlds.length > 0);
  assert.ok(summary.baseline.holdoutMetrics);
  assert.ok(summary.topCandidates[0].holdoutMetrics);
  assert.ok(Number.isFinite(summary.topCandidates[0].selectionScore));
  assert.ok(Number.isFinite(summary.topCandidates[0].holdoutMetrics.oracleScoreMean));
  assert.ok(Number.isFinite(summary.topCandidates[0].holdoutMetrics.oracleProgressMean));
});

test("search runner reports holdout metrics for guarded profiles", () => {
  const stdout = execFileSync(
    process.execPath,
    [
      path.resolve("scripts/run-social-sim-search.mjs"),
      "--search-profile=closure-guard-v1",
      "--max-candidates=1",
      "--top-k=1",
      "--horizon=all",
      "--seeds=17031,27031",
    ],
    {
      encoding: "utf8",
      stdio: "pipe",
      maxBuffer: 20 * 1024 * 1024,
    },
  );

  const summary = parseTrailingJson(stdout);
  assert.ok(Array.isArray(summary.holdoutWorlds));
  assert.ok(summary.holdoutWorlds.length > 0);
  assert.ok(summary.baseline.holdoutMetrics);
  assert.ok(summary.topCandidates[0].holdoutMetrics);
  assert.ok(Number.isFinite(summary.topCandidates[0].selectionScore));
});
