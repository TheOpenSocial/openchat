#!/usr/bin/env node

import path from "node:path";
import {
  DEFAULT_SOCIAL_SIM_ARTIFACT_ROOT,
  DEFAULT_SOCIAL_SIM_TUNING,
  normalizeSocialSimTuning,
  parseSocialSimArgs,
  runSocialSimulation,
} from "./social-sim-core.mjs";

function parseSearchArgs(argv = process.argv.slice(2)) {
  const flags = new Map();
  for (const arg of argv) {
    if (!arg.startsWith("--")) continue;
    const withoutPrefix = arg.slice(2);
    const [key, rawValue] = withoutPrefix.split("=", 2);
    flags.set(key, rawValue ?? "true");
  }
  return {
    profile: flags.get("search-profile") ?? "weak-worlds-v1",
    topK: Number(flags.get("top-k") ?? 5),
    maxCandidates: Number(flags.get("max-candidates") ?? 0),
  };
}

function setNestedValue(target, pathParts, value) {
  let cursor = target;
  for (let index = 0; index < pathParts.length - 1; index += 1) {
    const key = pathParts[index];
    if (!cursor[key] || typeof cursor[key] !== "object") {
      cursor[key] = {};
    }
    cursor = cursor[key];
  }
  cursor[pathParts[pathParts.length - 1]] = value;
}

function cartesianProduct(arrays) {
  return arrays.reduce(
    (acc, values) =>
      acc.flatMap((prefix) => values.map((value) => [...prefix, value])),
    [[]],
  );
}

function buildCandidateGrid(profile) {
  if (profile !== "weak-worlds-v1") {
    throw new Error(`Unknown social-sim search profile: ${profile}`);
  }
  const dimensions = [
    {
      key: "probabilities.lowStrengthGroupRecovery",
      values: [0.45, 0.55, 0.65],
    },
    {
      key: "probabilities.matchingGroupInvite",
      values: [0.5, 0.58, 0.66],
    },
    {
      key: "probabilities.memoryConversation",
      values: [0.35, 0.45, 0.55],
    },
    {
      key: "deltas.inviteGroupInGroupWorld",
      values: [0.12, 0.14, 0.16],
    },
    {
      key: "scoring.expectationFulfillmentWeight",
      values: [0.2, 0.22, 0.26],
    },
    {
      key: "scoring.missingGroupPenalty",
      values: [0.08, 0.1, 0.12],
    },
  ];

  return {
    focusWorlds: [
      "short-no-match-recovery-v1",
      "long-bad-actor-containment-v1",
      "long-network-rebalancing-v1",
      "medium-multi-cluster-bridging-v1",
      "long-recurring-circle-fragmentation-v1",
    ],
    dimensions,
  };
}

function createCandidateTuning(baseTuning, dimensions, combination) {
  const tuning = normalizeSocialSimTuning(baseTuning);
  dimensions.forEach((dimension, index) => {
    setNestedValue(tuning, dimension.key.split("."), combination[index]);
  });
  return tuning;
}

function scoreCandidate(summary, worlds, focusWorlds) {
  const overall = summary.totals.averageConvergenceScore ?? 0;
  const focusScores = worlds
    .filter((world) => focusWorlds.includes(world.worldId))
    .map((world) => world.summary.convergenceScore);
  const weakMean =
    focusScores.length > 0
      ? focusScores.reduce((sum, value) => sum + value, 0) / focusScores.length
      : overall;
  const weakMin = focusScores.length > 0 ? Math.min(...focusScores) : overall;
  const objective = overall * 0.45 + weakMean * 0.35 + weakMin * 0.2;
  return {
    objective: Number(objective.toFixed(4)),
    overall: Number(overall.toFixed(4)),
    weakMean: Number(weakMean.toFixed(4)),
    weakMin: Number(weakMin.toFixed(4)),
  };
}

async function main() {
  const baseConfig = parseSocialSimArgs(process.argv.slice(2), process.env);
  const { profile, topK, maxCandidates } = parseSearchArgs(process.argv.slice(2));
  const grid = buildCandidateGrid(profile);
  const combinations = cartesianProduct(grid.dimensions.map((dimension) => dimension.values));
  const limitedCombinations =
    maxCandidates > 0 ? combinations.slice(0, maxCandidates) : combinations;
  const artifactRoot = path.resolve(
    process.cwd(),
    DEFAULT_SOCIAL_SIM_ARTIFACT_ROOT,
    "search",
    `search-${new Date().toISOString().replace(/[:.]/g, "-")}`,
  );

  const results = [];
  for (const [index, combination] of limitedCombinations.entries()) {
    const tuning = createCandidateTuning(
      normalizeSocialSimTuning(baseConfig.tuning ?? DEFAULT_SOCIAL_SIM_TUNING),
      grid.dimensions,
      combination,
    );
    const candidateConfig = {
      ...baseConfig,
      provider: "stub",
      judgeProvider: "stub",
      dryRun: true,
      cleanupMode: "none",
      artifactRoot,
      namespace: `social-sim-search-${index + 1}`,
      tuning,
    };
    const result = await runSocialSimulation(candidateConfig);
    const metrics = scoreCandidate(
      result.summary,
      result.artifact.worlds,
      grid.focusWorlds,
    );
    results.push({
      rankHint: index + 1,
      tuning,
      metrics,
      runId: result.artifact.runId,
      runDir: result.runDir,
      worstWorlds: result.artifact.worlds
        .map((world) => ({
          worldId: world.worldId,
          convergenceScore: world.summary.convergenceScore,
        }))
        .sort((left, right) => left.convergenceScore - right.convergenceScore)
        .slice(0, 5),
    });
  }

  results.sort((left, right) => right.metrics.objective - left.metrics.objective);
  const output = {
    profile,
    candidateCount: results.length,
    focusWorlds: grid.focusWorlds,
    topCandidates: results.slice(0, Math.max(1, topK)),
  };

  console.log(JSON.stringify(output, null, 2));
}

await main();
