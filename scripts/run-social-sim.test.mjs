import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_SOCIAL_SIM_BENCHMARK_SEED,
  DEFAULT_SOCIAL_SIM_TUNING,
  computeDirectMatchClosureScore,
  computeNetworkCoordinationScore,
  createBackendAdapter,
  createBrainProvider,
  createJudgeProvider,
  loadSocialSimWorldFixture,
  normalizeSocialSimTuning,
  parseSocialSimArgs,
  runSocialSimulation,
  selectSocialSimWorlds,
} from "./social-sim-core.mjs";
import { getSearchSeeds, parseSearchArgs } from "./run-social-sim-search.mjs";

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
  assert.equal(
    config.tuning.thresholds.lowStrength,
    DEFAULT_SOCIAL_SIM_TUNING.thresholds.lowStrength,
  );
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
    [
      '--tuning-json={"probabilities":{"memoryConversation":0.9},"scoring":{"missingGroupPenalty":0.2}}',
    ],
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
  const seeds = getSearchSeeds(
    { seed: 12345 },
    {
      hasExplicitSeed: false,
      seeds: [],
    },
  );

  assert.deepEqual(seeds, [17031, 27031, 37031]);
});

test("getSearchSeeds respects explicit single-seed runs", () => {
  const seeds = getSearchSeeds(
    { seed: 12345 },
    {
      hasExplicitSeed: true,
      seeds: [],
    },
  );

  assert.deepEqual(seeds, [12345]);
});

test("loadSocialSimWorldFixture normalizes canonical fixture worlds", () => {
  const worlds = loadSocialSimWorldFixture(
    path.resolve("scripts/social-sim-worlds.json"),
    path.resolve("apps/api/test/fixtures/agentic-scenarios.json"),
  );

  assert.ok(worlds.length >= 10);
  assert.ok(worlds.some((world) => world.horizon === "long"));
  assert.ok(
    worlds.some((world) => world.id === "medium-dense-social-mixer-v1"),
  );
  assert.ok(worlds.some((world) => world.id === "long-network-rebalancing-v1"));
  assert.ok(
    worlds.some((world) => world.id === "medium-multi-cluster-bridging-v1"),
  );
  assert.ok(
    worlds.some(
      (world) => world.id === "long-recurring-circle-fragmentation-v1",
    ),
  );
  assert.ok(
    worlds.some((world) => world.id === "long-bad-actor-containment-v1"),
  );
  assert.ok(
    worlds.some((world) => world.id === "medium-cross-cluster-holdout-v1"),
  );
  assert.ok(
    worlds.some((world) => world.id === "long-trust-boundary-holdout-v1"),
  );
  const recoveryWorld = worlds.find(
    (world) => world.id === "short-no-match-recovery-v1",
  );
  assert.equal(recoveryWorld?.actors.length, 3);
  assert.equal(recoveryWorld?.relationships.length, 3);
  assert.equal(recoveryWorld?.benchmark?.split, "train");
  assert.equal(
    recoveryWorld?.benchmark?.requiredTransitions?.[0]?.type,
    "recover_then_match",
  );
  assert.deepEqual(recoveryWorld?.oracle.preferredOutcomeEdges, ["cora-mina"]);
  assert.deepEqual(recoveryWorld?.oracle.forbiddenOutcomeEdges, [
    "cora-drew",
    "drew-mina",
  ]);
  const holdoutWorld = worlds.find(
    (world) => world.id === "medium-cross-cluster-holdout-v1",
  );
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
  assert.ok(
    byScenario.some((world) => world.id === "medium-recurring-circle-v1"),
  );

  const holdoutOnly = selectSocialSimWorlds(worlds, {
    horizon: "all",
    worldFilter: [],
    scenarioFilter: [],
    worldSet: "holdout",
  });
  assert.deepEqual(holdoutOnly.map((world) => world.id).sort(), [
    "long-trust-boundary-holdout-v1",
    "medium-cross-cluster-holdout-v1",
  ]);
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

test("remote Ollama intents can be upgraded to closure-oriented simulator intents", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({
      message: {
        content: JSON.stringify({
          intent: "greet_and_reconnect",
          targetActorId: "circle-organizer",
          message:
            "Hey there! It's good to be back in the circle. I'm looking forward to picking up where we left off.",
          confidence: 0.85,
          rationale:
            "As a returning participant, I want to reconnect with familiar people and continue earlier threads.",
        }),
      },
    }),
  });
  try {
    const brain = createBrainProvider({
      provider: "ollama",
      useRemoteProvider: true,
      ollamaBaseUrl: "https://ollama.example.test",
      ollamaModel: "deepseek-v3.1:671b",
      ollamaApiKey: "test-key",
    });
    const worlds = loadSocialSimWorldFixture(
      path.resolve("scripts/social-sim-worlds.json"),
      path.resolve("apps/api/test/fixtures/agentic-scenarios.json"),
    );
    const world = worlds.find(
      (entry) => entry.id === "medium-recurring-circle-v1",
    );
    const actor = world.actors.find((entry) => entry.id === "circle-iris");
    const state = {
      stage: "conversation",
      turnIndex: 2,
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

    assert.equal(turn.intent, "invite_group");
    assert.equal(turn.targetActorId, "circle-organizer");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("remote Ollama actor output tolerates fenced JSON content", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({
      message: {
        content:
          '```json\n{"intent":"affirm_and_refine_collaboration","targetActorId":"group-seed-soren","message":"That plan sounds good; we can coordinate the next step together.","tone":"warm","confidence":0.79,"rationale":"Coordinating a shared plan helps group progress.","memoryReferences":[]}\n```',
      },
    }),
  });
  try {
    const brain = createBrainProvider({
      provider: "ollama",
      useRemoteProvider: true,
      ollamaBaseUrl: "https://ollama.example.test",
      ollamaModel: "deepseek-v3.1:671b",
      ollamaApiKey: "test-key",
    });
    const worlds = loadSocialSimWorldFixture(
      path.resolve("scripts/social-sim-worlds.json"),
      path.resolve("apps/api/test/fixtures/agentic-scenarios.json"),
    );
    const world = worlds.find(
      (entry) => entry.id === "medium-pair-group-discovery-v1",
    );
    const actor = world.actors.find((entry) => entry.id === "pair-maya-lev");
    const state = {
      stage: "conversation",
      turnIndex: 4,
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

    assert.equal(turn.intent, "invite_group");
    assert.equal(turn.targetActorId, "group-seed-soren");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("remote event safety language does not collapse into moderation and preserves required memory continuity", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({
      message: {
        content: JSON.stringify({
          intent: "acknowledge-boundaries",
          targetActorId: "event-zoe",
          message:
            "I appreciate the focus on safety and clear timing. It helps me reconnect and continue the music-event thread comfortably.",
          confidence: 0.8,
          rationale:
            "As a returning participant, I want continuity and clear boundaries without escalating to moderation.",
          memoryReferences: [],
        }),
      },
    }),
  });
  try {
    const brain = createBrainProvider({
      provider: "ollama",
      useRemoteProvider: true,
      ollamaBaseUrl: "https://ollama.example.test",
      ollamaModel: "deepseek-v3.1:671b",
      ollamaApiKey: "test-key",
    });
    const worlds = loadSocialSimWorldFixture(
      path.resolve("scripts/social-sim-worlds.json"),
      path.resolve("apps/api/test/fixtures/agentic-scenarios.json"),
    );
    const world = worlds.find(
      (entry) => entry.id === "long-memory-drift-event-v1",
    );
    const actor = world.actors.find((entry) => entry.id === "event-jules");
    const state = {
      stage: "memory_drift",
      turnIndex: 6,
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

    assert.equal(turn.intent, "reference_memory");
    assert.equal(turn.targetActorId, "event-zoe");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("remote quiet alternative proposals do not collapse into recovery", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({
      message: {
        content: JSON.stringify({
          intent: "accept_proposal_and_plan_details",
          targetActorId: "mina",
          message:
            "That sounds perfect - I'd love to join you for a quiet reading or work session. Maybe we could meet at the library or a quiet cafe this week?",
          confidence: 0.88,
          rationale:
            "This is a positive fallback closure with a concrete quiet plan, not another recovery step.",
          memoryReferences: [],
        }),
      },
    }),
  });
  try {
    const brain = createBrainProvider({
      provider: "ollama",
      useRemoteProvider: true,
      ollamaBaseUrl: "https://ollama.example.test",
      ollamaModel: "deepseek-v3.1:671b",
      ollamaApiKey: "test-key",
    });
    const worlds = loadSocialSimWorldFixture(
      path.resolve("scripts/social-sim-worlds.json"),
      path.resolve("apps/api/test/fixtures/agentic-scenarios.json"),
    );
    const world = worlds.find(
      (entry) => entry.id === "short-no-match-recovery-v1",
    );
    const actor = world.actors.find((entry) => entry.id === "cora");
    const state = {
      stage: "convergence",
      turnIndex: 5,
      lastActionByActor: new Map([["cora", { intent: "recover_no_match" }]]),
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

    assert.equal(turn.intent, "propose_event");
    assert.equal(turn.targetActorId, "mina");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("remote outputs with invalid targets are reconciled to valid planner targets", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({
      message: {
        content: JSON.stringify({
          intent: "welcome_and_organize",
          targetActorId: "frag-trust-vik",
          message: "Vik, would you join our next planning check-in?",
          confidence: 0.82,
          rationale: "Trying to keep continuity healthy.",
          memoryReferences: [],
        }),
      },
    }),
  });
  try {
    const brain = createBrainProvider({
      provider: "ollama",
      useRemoteProvider: true,
      ollamaBaseUrl: "https://ollama.example.test",
      ollamaModel: "deepseek-v3.1:671b",
      ollamaApiKey: "test-key",
    });
    const worlds = loadSocialSimWorldFixture(
      path.resolve("scripts/social-sim-worlds.json"),
      path.resolve("apps/api/test/fixtures/agentic-scenarios.json"),
    );
    const world = worlds.find(
      (entry) => entry.id === "long-recurring-circle-fragmentation-v1",
    );
    const actor = world.actors.find(
      (entry) => entry.id === "frag-organizer-ines",
    );
    const state = {
      stage: "conversation",
      turnIndex: 8,
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

    assert.notEqual(turn.targetActorId, "frag-trust-vik");
    assert.equal(turn.targetActorId, "frag-regular-lio");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("remote outputs do not positively advance forbidden targets", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({
      message: {
        content: JSON.stringify({
          intent: "invite_group",
          targetActorId: "rebalance-noah",
          message: "Noah should join the active thread now.",
          confidence: 0.77,
          rationale: "Trying to activate the network quickly.",
          memoryReferences: [],
        }),
      },
    }),
  });
  try {
    const brain = createBrainProvider({
      provider: "ollama",
      useRemoteProvider: true,
      ollamaBaseUrl: "https://ollama.example.test",
      ollamaModel: "deepseek-v3.1:671b",
      ollamaApiKey: "test-key",
    });
    const worlds = loadSocialSimWorldFixture(
      path.resolve("scripts/social-sim-worlds.json"),
      path.resolve("apps/api/test/fixtures/agentic-scenarios.json"),
    );
    const world = worlds.find(
      (entry) => entry.id === "long-network-rebalancing-v1",
    );
    const actor = world.actors.find((entry) => entry.id === "rebalance-noah");
    const state = {
      stage: "conversation",
      turnIndex: 10,
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

    assert.equal(turn.targetActorId, "rebalance-host-mila");
    assert.equal(turn.intent, "recover_no_match");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("remote weak follow-up intents are upgraded to reply in direct-match conversations", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({
      message: {
        content: JSON.stringify({
          intent: "continue_warmly",
          targetActorId: "ben",
          message:
            "That sounds perfect! I've heard great things about the route and coffee after sounds ideal.",
          confidence: 0.86,
          rationale:
            "Continuing the thread warmly feels natural before locking anything down.",
          memoryReferences: [],
        }),
      },
    }),
  });
  try {
    const brain = createBrainProvider({
      provider: "ollama",
      useRemoteProvider: true,
      ollamaBaseUrl: "https://ollama.example.test",
      ollamaModel: "deepseek-v3.1:671b",
      ollamaApiKey: "test-key",
    });
    const worlds = loadSocialSimWorldFixture(
      path.resolve("scripts/social-sim-worlds.json"),
      path.resolve("apps/api/test/fixtures/agentic-scenarios.json"),
    );
    const world = worlds.find((entry) => entry.id === "short-direct-match-v1");
    const actor = world.actors.find((entry) => entry.id === "aya");
    const state = {
      stage: "conversation",
      turnIndex: 2,
      lastActionByActor: new Map([["aya", { intent: "propose_event" }]]),
      knownTargets: new Map([
        ["aya-ben", { action: "propose_event", turnIndex: 0 }],
      ]),
    };

    const turn = await brain.generateActorTurn({
      world,
      actor,
      state,
      transcript: [],
      rng: () => 0.25,
      config: {},
    });

    assert.equal(turn.targetActorId, "ben");
    assert.equal(turn.intent, "reply");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("remote memory-heavy organizer turns are upgraded to invite_group in network rebalancing", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({
      message: {
        content: JSON.stringify({
          intent: "remember_and_reconnect",
          targetActorId: "rebalance-safety-kai",
          message:
            "I remember your focus on clear boundaries and steady community sessions, and I think that perspective would still fit this group well.",
          confidence: 0.82,
          rationale:
            "Reinforcing continuity feels like the best way to keep the thread healthy.",
          memoryReferences: [],
        }),
      },
    }),
  });
  try {
    const brain = createBrainProvider({
      provider: "ollama",
      useRemoteProvider: true,
      ollamaBaseUrl: "https://ollama.example.test",
      ollamaModel: "deepseek-v3.1:671b",
      ollamaApiKey: "test-key",
    });
    const worlds = loadSocialSimWorldFixture(
      path.resolve("scripts/social-sim-worlds.json"),
      path.resolve("apps/api/test/fixtures/agentic-scenarios.json"),
    );
    const world = worlds.find(
      (entry) => entry.id === "long-network-rebalancing-v1",
    );
    const actor = world.actors.find(
      (entry) => entry.id === "rebalance-group-seed-omar",
    );
    const state = {
      stage: "conversation",
      turnIndex: 6,
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

    assert.equal(turn.targetActorId, "rebalance-safety-kai");
    assert.equal(turn.intent, "invite_group");
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
  const world = worlds.find(
    (entry) => entry.id === "short-no-match-recovery-v1",
  );
  const actor = world.actors.find((entry) => entry.id === "drew");
  const state = {
    stage: "matching",
    turnIndex: 3,
    lastActionByActor: new Map([["drew", { intent: "recover_no_match" }]]),
    knownTargets: new Map([
      [
        "cora-drew",
        { action: "recover_no_match", turnIndex: 2, confidence: 0.52 },
      ],
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

  assert.equal(turn.intent, "propose_event");
  assert.equal(turn.targetActorId, null);
  assert.equal(turn.detachedFromWeakFit, true);
});

test("recovery planners close toward the preferred fallback after detaching", async () => {
  const brain = createBrainProvider({ provider: "stub" });
  const worlds = loadSocialSimWorldFixture(
    path.resolve("scripts/social-sim-worlds.json"),
    path.resolve("apps/api/test/fixtures/agentic-scenarios.json"),
  );
  const world = structuredClone(
    worlds.find((entry) => entry.id === "short-no-match-recovery-v1"),
  );
  const actor = world.actors.find((entry) => entry.id === "cora");
  const fallbackRelationship = world.relationships.find(
    (entry) => entry.id === "cora-mina",
  );
  fallbackRelationship.strength = 0.62;
  const state = {
    stage: "conversation",
    turnIndex: 3,
    lastActionByActor: new Map([["cora", { intent: "recover_no_match" }]]),
    knownTargets: new Map([
      [
        "cora-drew",
        { action: "recover_no_match", turnIndex: 2, confidence: 0.52 },
      ],
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
  assert.equal(turn.intent, "propose_event");
});

test("circle organizers prioritize unfinished returning members", async () => {
  const brain = createBrainProvider({ provider: "stub" });
  const worlds = loadSocialSimWorldFixture(
    path.resolve("scripts/social-sim-worlds.json"),
    path.resolve("apps/api/test/fixtures/agentic-scenarios.json"),
  );
  const world = worlds.find(
    (entry) => entry.id === "medium-recurring-circle-v1",
  );
  const actor = world.actors.find((entry) => entry.id === "circle-organizer");
  const state = {
    stage: "matching",
    turnIndex: 1,
    lastActionByActor: new Map(),
    knownTargets: new Map([
      [
        "circle-return-1",
        { action: "introduce", turnIndex: 0, confidence: 0.76 },
      ],
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
    worlds.find(
      (entry) => entry.id === "long-recurring-circle-fragmentation-v1",
    ),
  );
  const actor = world.actors.find((entry) => entry.id === "frag-regular-lio");
  const targetRelationship = world.relationships.find(
    (entry) => entry.id === "frag-selim-lio",
  );
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

test("circle planners can force required group closure even when the edge is not preferred", async () => {
  const brain = createBrainProvider({ provider: "stub" });
  const worlds = loadSocialSimWorldFixture(
    path.resolve("scripts/social-sim-worlds.json"),
    path.resolve("apps/api/test/fixtures/agentic-scenarios.json"),
  );
  const world = structuredClone(
    worlds.find(
      (entry) => entry.id === "long-recurring-circle-fragmentation-v1",
    ),
  );
  const actor = world.actors.find(
    (entry) => entry.id === "frag-organizer-ines",
  );
  const groupClosureRelationship = world.relationships.find(
    (entry) => entry.id === "frag-ines-mara",
  );
  const preferredRelationship = world.relationships.find(
    (entry) => entry.id === "frag-ines-lio",
  );
  groupClosureRelationship.strength = 0.63;
  preferredRelationship.status = "matched";
  const state = {
    stage: "conversation",
    turnIndex: 9,
    lastActionByActor: new Map(),
    knownTargets: new Map([
      ["frag-ines-mara", { action: "reply", turnIndex: 8, confidence: 0.73 }],
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

  assert.equal(turn.targetActorId, "frag-regular-mara");
  assert.equal(turn.intent, "invite_group");
});

test("network rebalancing organizers can reroute to a healthier target after recovery", async () => {
  const brain = createBrainProvider({ provider: "stub" });
  const worlds = loadSocialSimWorldFixture(
    path.resolve("scripts/social-sim-worlds.json"),
    path.resolve("apps/api/test/fixtures/agentic-scenarios.json"),
  );
  const world = worlds.find(
    (entry) => entry.id === "long-network-rebalancing-v1",
  );
  const actor = world.actors.find(
    (entry) => entry.id === "rebalance-host-mila",
  );
  const state = {
    stage: "conversation",
    turnIndex: 4,
    lastActionByActor: new Map([
      ["rebalance-host-mila", { intent: "recover_no_match" }],
    ]),
    knownTargets: new Map([
      [
        "rebalance-host-noah",
        { action: "recover_no_match", turnIndex: 3, confidence: 0.52 },
      ],
      [
        "rebalance-host-ivy",
        { action: "reference_memory", turnIndex: 2, confidence: 0.76 },
      ],
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
  const world = worlds.find(
    (entry) => entry.id === "medium-cross-cluster-holdout-v1",
  );
  const actor = world.actors.find((entry) => entry.id === "holdout-group-ara");
  const state = {
    stage: "conversation",
    turnIndex: 4,
    lastActionByActor: new Map(),
    knownTargets: new Map([
      [
        "holdout-group-ara-len",
        { action: "reply", turnIndex: 3, confidence: 0.74 },
      ],
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

test("dense graph planners can force required bridge closure even when the edge is not preferred", async () => {
  const brain = createBrainProvider({ provider: "stub" });
  const worlds = loadSocialSimWorldFixture(
    path.resolve("scripts/social-sim-worlds.json"),
    path.resolve("apps/api/test/fixtures/agentic-scenarios.json"),
  );
  const world = structuredClone(
    worlds.find((entry) => entry.id === "medium-multi-cluster-bridging-v1"),
  );
  const actor = world.actors.find((entry) => entry.id === "bridge-circle-yara");
  const bridgeRelationship = world.relationships.find(
    (entry) => entry.id === "bridge-pair-yara",
  );
  const preferredRelationship = world.relationships.find(
    (entry) => entry.id === "bridge-olivia-yara",
  );
  bridgeRelationship.strength = 0.61;
  preferredRelationship.status = "matched";
  const state = {
    stage: "conversation",
    turnIndex: 6,
    lastActionByActor: new Map(),
    knownTargets: new Map([
      ["bridge-pair-yara", { action: "reply", turnIndex: 5, confidence: 0.76 }],
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

  assert.equal(turn.targetActorId, "bridge-pair-ivy-noel");
  assert.equal(turn.intent, "invite_group");
});

test("event-and-memory worlds prioritize preferred follow-up closure", async () => {
  const brain = createBrainProvider({ provider: "stub" });
  const worlds = loadSocialSimWorldFixture(
    path.resolve("scripts/social-sim-worlds.json"),
    path.resolve("apps/api/test/fixtures/agentic-scenarios.json"),
  );
  const world = structuredClone(
    worlds.find((entry) => entry.id === "long-memory-drift-event-v1"),
  );
  const actor = world.actors.find((entry) => entry.id === "event-zoe");
  const targetRelationship = world.relationships.find(
    (entry) => entry.id === "event-return-1",
  );
  targetRelationship.strength = 0.58;
  const state = {
    stage: "memory_drift",
    turnIndex: 9,
    lastActionByActor: new Map(),
    knownTargets: new Map([
      [
        "event-return-1",
        { action: "reference_memory", turnIndex: 8, confidence: 0.74 },
      ],
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

  assert.equal(turn.targetActorId, "event-jules");
  assert.equal(turn.intent, "propose_event");
});

test("event-and-memory worlds force one memory signal before event conversion", async () => {
  const brain = createBrainProvider({ provider: "stub" });
  const worlds = loadSocialSimWorldFixture(
    path.resolve("scripts/social-sim-worlds.json"),
    path.resolve("apps/api/test/fixtures/agentic-scenarios.json"),
  );
  const world = structuredClone(
    worlds.find((entry) => entry.id === "long-memory-drift-event-v1"),
  );
  const actor = world.actors.find((entry) => entry.id === "event-jules");
  const relationship = world.relationships.find(
    (entry) => entry.id === "event-return-2",
  );
  relationship.strength = 0.82;
  const state = {
    stage: "conversation",
    turnIndex: 2,
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

  assert.equal(turn.intent, "reference_memory");
  assert.equal(turn.targetActorId, "event-zoe");
});

test("network rebalancing prefers required healthy closure edges when available", async () => {
  const brain = createBrainProvider({ provider: "stub" });
  const worlds = loadSocialSimWorldFixture(
    path.resolve("scripts/social-sim-worlds.json"),
    path.resolve("apps/api/test/fixtures/agentic-scenarios.json"),
  );
  const world = worlds.find(
    (entry) => entry.id === "long-bad-actor-containment-v1",
  );
  const actor = world.actors.find((entry) => entry.id === "contain-group-suri");
  const state = {
    stage: "conversation",
    turnIndex: 8,
    lastActionByActor: new Map(),
    knownTargets: new Map(),
  };

  const turn = await brain.generateActorTurn({
    world,
    actor,
    state,
    transcript: [],
    rng: () => 0.2,
    config: {},
  });

  assert.equal(turn.targetActorId, "contain-regular-kira");
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
    assert.ok(
      result.summary.measurementWarnings.includes(
        "turn_budget_override_truncated_1_worlds",
      ),
    );
    assert.ok(result.summary.familyScores["individual-matchmaking"]);
    assert.ok(result.artifact.worlds.length >= 1);
    assert.ok(result.artifact.worlds[0].summary.scoreBreakdown);
    assert.equal(
      result.artifact.worlds[0].summary.measurement.turnBudgetGap,
      2,
    );
    assert.ok(
      Number.isFinite(
        result.artifact.worlds[0].summary.strongRelationshipCoverage,
      ),
    );
    assert.ok(
      Number.isFinite(result.artifact.worlds[0].summary.meanStrengthLift),
    );
    assert.ok(Number.isFinite(result.artifact.worlds[0].summary.oracleScore));
    assert.ok(
      Number.isFinite(result.artifact.worlds[0].summary.oracleProgressScore),
    );
    assert.ok(
      Number.isFinite(result.artifact.worlds[0].summary.closurePrecision),
    );
    assert.ok(
      Number.isFinite(result.artifact.worlds[0].summary.preferredRecall),
    );
    assert.ok(
      Number.isFinite(result.artifact.worlds[0].summary.forbiddenAvoidance),
    );
    assert.ok(
      Number.isFinite(
        result.summary.familyScores["individual-matchmaking"]
          .averageStrongRelationshipCoverage,
      ),
    );
    assert.ok(
      Number.isFinite(
        result.summary.familyScores["individual-matchmaking"]
          .averageOracleScore,
      ),
    );
    assert.ok(
      Number.isFinite(
        result.summary.familyScores["individual-matchmaking"]
          .averageOracleProgressScore,
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

test("individual matchmaking clean direct matches receive direct-closure scoring credit", async () => {
  const result = await runSocialSimulation({
    provider: "stub",
    judgeProvider: "stub",
    horizon: "short",
    worldFilter: ["short-direct-match-v1"],
    scenarioFilter: [],
    seed: 17031,
    namespace: "test-social-sim-direct-closure",
    turnBudget: null,
    cleanupMode: "none",
    dryRun: true,
    nightly: false,
    artifactRoot: mkdtempSync(
      path.join(os.tmpdir(), "social-sim-direct-closure-"),
    ),
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

  const world = result.artifact.worlds.find(
    (entry) => entry.worldId === "short-direct-match-v1",
  );
  assert.ok(world.summary.convergenceScore >= 0.62);
  assert.equal(world.summary.scoreBreakdown.directMatchClosureScore, 1);
});

test("network rebalancing clean coordinated closure receives network coordination credit", () => {
  const score = computeNetworkCoordinationScore(
    {
      family: "network-rebalancing",
      oracle: {
        preferredOutcomeEdges: ["a", "b", "c"],
        requiredGroupClosure: ["b", "c"],
        requiredIsolations: ["x"],
      },
    },
    {
      preferredMatchedCount: 3,
      requiredGroupMatchedCount: 2,
      isolatedActorCount: 1,
    },
    {
      issueCount: 0,
    },
  );

  assert.ok(score >= 0.99);
});

test("direct matchmaking clean closure receives direct match credit", () => {
  const score = computeDirectMatchClosureScore(
    {
      family: "individual-matchmaking",
    },
    {
      preferredMatchedCount: 1,
    },
    {
      issueCount: 0,
    },
    {
      introductions: 1,
      replies: 2,
      stalledTurns: 0,
    },
  );

  assert.equal(score, 1);
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
  const artifactRoot = mkdtempSync(
    path.join(os.tmpdir(), "social-sim-redact-"),
  );
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
    assert.equal(
      runArtifact.bootstrap.env.SOCIAL_SIM_ADMIN_API_KEY,
      "[redacted]",
    );
    assert.equal(
      runArtifact.bootstrap.env.ONBOARDING_PROBE_TOKEN,
      "[redacted]",
    );
    assert.equal(
      runArtifact.bootstrap.env.SMOKE_BASE_URL,
      "http://localhost:3000",
    );
    assert.equal(remoteRunBodies.length, 1);
    assert.equal("provider" in remoteRunBodies[0], false);
    assert.equal("judgeProvider" in remoteRunBodies[0], false);
  } finally {
    globalThis.fetch = originalFetch;
    rmSync(artifactRoot, { recursive: true, force: true });
  }
});

test("backend bootstrap persists remote run bootstrap failure details", async () => {
  const artifactRoot = mkdtempSync(
    path.join(os.tmpdir(), "social-sim-bootstrap-failure-"),
  );
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
        ok: false,
        status: 403,
        async json() {
          return {
            success: false,
            error: {
              code: "admin_access_denied",
              message: "admin api key is invalid",
            },
          };
        },
      };
    }
    throw new Error(`Unexpected fetch in test: ${url}`);
  };

  try {
    const result = await runSocialSimulation({
      provider: "ollama",
      judgeProvider: "stub",
      horizon: "short",
      worldFilter: ["short-direct-match-v1"],
      scenarioFilter: [],
      seed: 12345,
      namespace: "test-social-sim-bootstrap-failure",
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
      ollamaBaseUrl: "https://ollama.example.com",
      ollamaModel: "deepseek-v3.1:671b",
      ollamaApiKey: "ollama-api-key",
      openaiApiKey: "",
      openaiModel: "gpt-4.1-mini",
      useRemoteProvider: true,
      useRemoteJudge: false,
      backendTurnDelayMs: 0,
      backendRetryCount: 0,
      backendRetryBaseDelayMs: 0,
      failOnRemoteFallback: false,
    });

    const runArtifact = JSON.parse(
      readFileSync(path.join(result.runDir, "run.json"), "utf8"),
    );
    assert.equal(runArtifact.bootstrap.backendMode, "playground");
    assert.equal(runArtifact.bootstrap.remoteRunId, undefined);
    assert.equal(runArtifact.bootstrap.remoteRunError.status, 403);
    assert.equal(
      runArtifact.bootstrap.remoteRunError.payload.error.code,
      "admin_access_denied",
    );
    assert.match(
      runArtifact.bootstrap.notes.join(" "),
      /remote run bootstrap failed \(403\)/,
    );
  } finally {
    globalThis.fetch = originalFetch;
    rmSync(artifactRoot, { recursive: true, force: true });
  }
});

test("backend bootstrap omits null turnBudget in remote run payload", async () => {
  const artifactRoot = mkdtempSync(
    path.join(os.tmpdir(), "social-sim-bootstrap-null-budget-"),
  );
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
              },
              entities: {},
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
              runId: "remote-run-2",
            },
          };
        },
      };
    }
    throw new Error(`Unexpected fetch in test: ${url}`);
  };

  try {
    await runSocialSimulation({
      provider: "ollama",
      judgeProvider: "stub",
      horizon: "short",
      worldFilter: ["short-direct-match-v1"],
      scenarioFilter: [],
      seed: 12345,
      namespace: "test-social-sim-null-budget",
      turnBudget: null,
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
      ollamaBaseUrl: "https://ollama.example.com",
      ollamaModel: "deepseek-v3.1:671b",
      ollamaApiKey: "ollama-api-key",
      openaiApiKey: "",
      openaiModel: "gpt-4.1-mini",
      useRemoteProvider: true,
      useRemoteJudge: false,
      backendTurnDelayMs: 0,
      backendRetryCount: 0,
      backendRetryBaseDelayMs: 0,
      failOnRemoteFallback: false,
    });

    assert.equal(remoteRunBodies.length, 1);
    assert.equal("turnBudget" in remoteRunBodies[0], false);
    assert.equal(remoteRunBodies[0].actorCount, 1);
  } finally {
    globalThis.fetch = originalFetch;
    rmSync(artifactRoot, { recursive: true, force: true });
  }
});

test("run summary prefers effective backend mode over bootstrap playground mode", async () => {
  const artifactRoot = mkdtempSync(
    path.join(os.tmpdir(), "social-sim-effective-backend-"),
  );
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
              },
              entities: {},
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
              runId: "remote-run-3",
            },
          };
        },
      };
    }
    if (url.endsWith("/api/admin/social-sim/turn")) {
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            success: true,
            data: {
              accepted: true,
              mode: "persisted",
              runId: "remote-run-3",
            },
          };
        },
      };
    }
    if (url.includes("/api/admin/social-sim/runs/remote-run-3/cleanup")) {
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            success: true,
            data: {
              mode: "archive",
            },
          };
        },
      };
    }
    throw new Error(`Unexpected fetch in test: ${url}`);
  };

  try {
    const result = await runSocialSimulation({
      provider: "ollama",
      judgeProvider: "stub",
      horizon: "short",
      worldFilter: ["short-direct-match-v1"],
      scenarioFilter: [],
      seed: 12345,
      namespace: "test-social-sim-effective-backend",
      turnBudget: 2,
      cleanupMode: "archive",
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
      ollamaBaseUrl: "https://ollama.example.com",
      ollamaModel: "deepseek-v3.1:671b",
      ollamaApiKey: "ollama-api-key",
      openaiApiKey: "",
      openaiModel: "gpt-4.1-mini",
      useRemoteProvider: true,
      useRemoteJudge: false,
      backendTurnDelayMs: 0,
      backendRetryCount: 0,
      backendRetryBaseDelayMs: 0,
      failOnRemoteFallback: false,
    });

    assert.equal(result.summary.effectiveBackendMode, "backend");
    assert.equal(
      result.summary.measurementWarnings.includes("backend_mode_playground"),
      false,
    );
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
  assert.ok(
    Number.isFinite(summary.topCandidates[0].holdoutMetrics.oracleScoreMean),
  );
  assert.ok(
    Number.isFinite(summary.topCandidates[0].holdoutMetrics.oracleProgressMean),
  );
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
