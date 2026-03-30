import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import test from "node:test";

import {
  createBrainProvider,
  createJudgeProvider,
  loadSocialSimWorldFixture,
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
});

test("loadSocialSimWorldFixture normalizes canonical fixture worlds", () => {
  const worlds = loadSocialSimWorldFixture(
    path.resolve("scripts/social-sim-worlds.json"),
    path.resolve("apps/api/test/fixtures/agentic-scenarios.json"),
  );

  assert.ok(worlds.length >= 4);
  assert.ok(worlds.some((world) => world.horizon === "long"));
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
