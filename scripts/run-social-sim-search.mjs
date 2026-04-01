#!/usr/bin/env node

import { mkdirSync, writeFileSync } from "node:fs";
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
    hasExplicitSeed: flags.has("seed"),
    seeds: String(flags.get("seeds") ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
      .map((value) => Number(value.trim()))
      .filter((value) => Number.isFinite(value)),
  };
}

function getSearchSeeds(baseConfig, parsedArgs) {
  if (parsedArgs.seeds.length > 0) return parsedArgs.seeds;
  if (parsedArgs.hasExplicitSeed && Number.isFinite(baseConfig.seed)) return [baseConfig.seed];
  return [17031, 27031, 37031];
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
  if (profile === "weak-worlds-v1") {
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
      objective: "weak-world-balance",
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
  if (profile === "weak-worlds-v2") {
    return {
      objective: "weak-world-push",
      focusWorlds: [
        "short-no-match-recovery-v1",
        "long-bad-actor-containment-v1",
        "long-network-rebalancing-v1",
        "medium-multi-cluster-bridging-v1",
        "long-recurring-circle-fragmentation-v1",
      ],
      dimensions: [
        {
          key: "policy.recoveryPostRecoveryConversationAction",
          values: ["current", "invite_group", "propose_event"],
        },
        {
          key: "policy.recoveryPostRecoveryConvergenceAction",
          values: ["current", "propose_event", "invite_group"],
        },
        {
          key: "policy.networkOrganizerPostRecoveryConversationAction",
          values: ["current", "invite_group", "reply"],
        },
        {
          key: "policy.networkOrganizerPostRecoveryMemoryDriftAction",
          values: ["current", "propose_event", "reference_memory"],
        },
        {
          key: "policy.denseGraphRecoveredConversationAction",
          values: ["current", "reply", "invite_group"],
        },
        {
          key: "scoring.missingGroupPenalty",
          values: [0.08, 0.1, 0.14],
        },
        {
          key: "scoring.expectationFulfillmentWeight",
          values: [0.22, 0.26, 0.3],
        },
      ],
    };
  }
  if (profile === "weak-worlds-v3") {
    return {
      objective: "network-floor-push",
      focusWorlds: [
        "short-no-match-recovery-v1",
        "long-bad-actor-containment-v1",
        "long-network-rebalancing-v1",
        "medium-multi-cluster-bridging-v1",
        "long-recurring-circle-fragmentation-v1",
      ],
      dimensions: [
        {
          key: "policy.recoveryPostRecoveryConversationAction",
          values: ["current", "invite_group", "propose_event"],
        },
        {
          key: "policy.recoveryPostRecoveryTargetStrategy",
          values: ["drop", "best_alternative"],
        },
        {
          key: "policy.networkOrganizerPostRecoveryConversationAction",
          values: ["current", "invite_group", "reply"],
        },
        {
          key: "policy.networkOrganizerPostRecoveryMemoryDriftAction",
          values: ["current", "propose_event", "reference_memory"],
        },
        {
          key: "policy.networkOrganizerPostRecoveryTargetStrategy",
          values: ["drop", "best_alternative"],
        },
        {
          key: "scoring.expectationFulfillmentWeight",
          values: [0.22, 0.26, 0.3],
        },
        {
          key: "scoring.missingGroupPenalty",
          values: [0.08, 0.1, 0.14],
        },
      ],
    };
  }

  throw new Error(`Unknown social-sim search profile: ${profile}`);
}

function createCandidateTuning(baseTuning, dimensions, combination) {
  const tuning = normalizeSocialSimTuning(baseTuning);
  dimensions.forEach((dimension, index) => {
    setNestedValue(tuning, dimension.key.split("."), combination[index]);
  });
  return tuning;
}

function scoreCandidate(summary, worlds, focusWorlds, objective = "weak-world-balance") {
  const overall = summary.totals.averageConvergenceScore ?? 0;
  const focusScores = worlds
    .filter((world) => focusWorlds.includes(world.worldId))
    .map((world) => world.summary.convergenceScore);
  const worldScores = new Map(
    worlds.map((world) => [world.worldId, world.summary.convergenceScore]),
  );
  const weakMean =
    focusScores.length > 0
      ? focusScores.reduce((sum, value) => sum + value, 0) / focusScores.length
      : overall;
  const weakMin = focusScores.length > 0 ? Math.min(...focusScores) : overall;
  const networkFloor = worldScores.get("long-network-rebalancing-v1") ?? weakMin;
  const objectiveScore =
    objective === "weak-world-push"
      ? overall * 0.3 + weakMean * 0.4 + weakMin * 0.3
      : objective === "network-floor-push"
        ? overall * 0.25 + weakMean * 0.25 + weakMin * 0.15 + networkFloor * 0.35
      : overall * 0.45 + weakMean * 0.35 + weakMin * 0.2;
  return {
    objective: Number(objectiveScore.toFixed(4)),
    overall: Number(overall.toFixed(4)),
    weakMean: Number(weakMean.toFixed(4)),
    weakMin: Number(weakMin.toFixed(4)),
    networkFloor: Number(networkFloor.toFixed(4)),
  };
}

function aggregateCandidateMetrics(seedRuns) {
  const totals = seedRuns.reduce(
    (acc, seedRun) => {
      acc.objective += seedRun.metrics.objective;
      acc.overall += seedRun.metrics.overall;
      acc.weakMean += seedRun.metrics.weakMean;
      acc.weakMin += seedRun.metrics.weakMin;
      acc.networkFloor += seedRun.metrics.networkFloor ?? 0;
      return acc;
    },
    {
      objective: 0,
      overall: 0,
      weakMean: 0,
      weakMin: 0,
      networkFloor: 0,
    },
  );
  const divisor = Math.max(seedRuns.length, 1);
  return {
    objective: Number((totals.objective / divisor).toFixed(4)),
    overall: Number((totals.overall / divisor).toFixed(4)),
    weakMean: Number((totals.weakMean / divisor).toFixed(4)),
    weakMin: Number((totals.weakMin / divisor).toFixed(4)),
    networkFloor: Number((totals.networkFloor / divisor).toFixed(4)),
  };
}

async function main() {
  const baseConfig = parseSocialSimArgs(process.argv.slice(2), process.env);
  const parsedArgs = parseSearchArgs(process.argv.slice(2));
  const { profile, topK, maxCandidates } = parsedArgs;
  const seeds = getSearchSeeds(baseConfig, parsedArgs);
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
  mkdirSync(artifactRoot, { recursive: true });

  const results = [];
  for (const [index, combination] of limitedCombinations.entries()) {
    const tuning = createCandidateTuning(
      normalizeSocialSimTuning(baseConfig.tuning ?? DEFAULT_SOCIAL_SIM_TUNING),
      grid.dimensions,
      combination,
    );
    const seedRuns = [];
    for (const seed of seeds) {
      const candidateConfig = {
        ...baseConfig,
        provider: "stub",
        judgeProvider: "stub",
        dryRun: true,
        cleanupMode: "none",
        artifactRoot,
        namespace: `social-sim-search-${index + 1}-seed-${seed}`,
        seed,
        tuning,
      };
      const result = await runSocialSimulation(candidateConfig);
      seedRuns.push({
        seed,
        runId: result.artifact.runId,
        runDir: result.runDir,
        metrics: scoreCandidate(
          result.summary,
          result.artifact.worlds,
          grid.focusWorlds,
          grid.objective,
        ),
        worstWorlds: result.artifact.worlds
          .map((world) => ({
            worldId: world.worldId,
            convergenceScore: world.summary.convergenceScore,
          }))
          .sort((left, right) => left.convergenceScore - right.convergenceScore)
          .slice(0, 5),
      });
    }
    const metrics = aggregateCandidateMetrics(seedRuns);
    results.push({
      rankHint: index + 1,
      tuning,
      metrics,
      seedRuns,
      worstWorlds: seedRuns[0]?.worstWorlds ?? [],
    });
  }

  results.sort((left, right) => right.metrics.objective - left.metrics.objective);
  const output = {
    profile,
    objective: grid.objective,
    candidateCount: results.length,
    seeds,
    focusWorlds: grid.focusWorlds,
    topCandidates: results.slice(0, Math.max(1, topK)),
  };

  writeFileSync(
    path.join(artifactRoot, "search-summary.json"),
    `${JSON.stringify(output, null, 2)}\n`,
    "utf8",
  );

  console.log(JSON.stringify(output, null, 2));
}

await main();
