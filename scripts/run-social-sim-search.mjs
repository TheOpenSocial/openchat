#!/usr/bin/env node

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  DEFAULT_SOCIAL_SIM_ARTIFACT_ROOT,
  DEFAULT_SOCIAL_SIM_TUNING,
  normalizeSocialSimTuning,
  parseSocialSimArgs,
  runSocialSimulation,
} from "./social-sim-core.mjs";

export function parseSearchArgs(argv = process.argv.slice(2)) {
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

export function getSearchSeeds(baseConfig, parsedArgs) {
  if (parsedArgs.seeds.length > 0) return parsedArgs.seeds;
  if (parsedArgs.hasExplicitSeed && Number.isFinite(baseConfig.seed)) return [baseConfig.seed];
  return [17031, 27031, 37031];
}

export function setNestedValue(target, pathParts, value) {
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

export function cartesianProduct(arrays) {
  return arrays.reduce(
    (acc, values) =>
      acc.flatMap((prefix) => values.map((value) => [...prefix, value])),
    [[]],
  );
}

export function buildCandidateGrid(profile) {
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
  if (profile === "dense-guard-v1") {
    return {
      objective: "guarded-balance",
      focusWorlds: [
        "medium-dense-social-mixer-v1",
        "medium-multi-cluster-bridging-v1",
      ],
      holdoutWorlds: [
        "short-no-match-recovery-v1",
        "long-recurring-circle-fragmentation-v1",
        "long-bad-actor-containment-v1",
      ],
      protectedWorlds: [
        "medium-dense-social-mixer-v1",
        "medium-multi-cluster-bridging-v1",
        "medium-pair-group-discovery-v1",
      ],
      dimensions: [
        {
          key: "probabilities.matchingGroupInvite",
          values: [0.52, 0.58, 0.66],
        },
        {
          key: "probabilities.denseConversationInvite",
          values: [0.52, 0.6, 0.7],
        },
        {
          key: "deltas.inviteGroupInGroupWorld",
          values: [0.12, 0.14, 0.16],
        },
        {
          key: "policy.denseGraphRecoveredConversationAction",
          values: ["current", "reply", "invite_group"],
        },
      ],
    };
  }
  if (profile === "closure-guard-v1") {
    return {
      objective: "guarded-balance",
      focusWorlds: [
        "short-no-match-recovery-v1",
        "long-bad-actor-containment-v1",
        "long-network-rebalancing-v1",
        "long-recurring-circle-fragmentation-v1",
      ],
      holdoutWorlds: [
        "medium-dense-social-mixer-v1",
        "medium-multi-cluster-bridging-v1",
        "medium-pair-group-discovery-v1",
        "medium-recurring-circle-v1",
      ],
      protectedWorlds: [
        "medium-dense-social-mixer-v1",
        "medium-multi-cluster-bridging-v1",
        "medium-pair-group-discovery-v1",
        "medium-recurring-circle-v1",
      ],
      dimensions: [
        {
          key: "thresholds.nearMatchMin",
          values: [0.62, 0.65, 0.68],
        },
        {
          key: "priority.circleNearMatchBonus",
          values: [0.06, 0.08, 0.12],
        },
        {
          key: "priority.networkNearMatchBonus",
          values: [0.08, 0.1, 0.14],
        },
        {
          key: "scoring.recoveryWorldRecoveryWeight",
          values: [0.12, 0.2, 0.26],
        },
        {
          key: "policy.networkOrganizerPostRecoveryTargetStrategy",
          values: ["drop", "best_alternative"],
        },
      ],
    };
  }
  if (profile === "holdout-balance-v1") {
    return {
      objective: "holdout-balance",
      focusWorlds: [
        "short-direct-match-v1",
        "medium-pair-group-discovery-v1",
        "medium-recurring-circle-v1",
        "long-memory-drift-event-v1",
        "medium-multi-cluster-bridging-v1",
        "long-network-rebalancing-v1",
      ],
      holdoutWorlds: [
        "short-no-match-recovery-v1",
        "medium-dense-social-mixer-v1",
        "long-recurring-circle-fragmentation-v1",
        "long-bad-actor-containment-v1",
      ],
      protectedWorlds: [
        "short-no-match-recovery-v1",
        "medium-dense-social-mixer-v1",
        "long-recurring-circle-fragmentation-v1",
        "long-bad-actor-containment-v1",
      ],
      dimensions: [
        {
          key: "thresholds.nearMatchMin",
          values: [0.6, 0.62, 0.65],
        },
        {
          key: "priority.circleNearMatchBonus",
          values: [0.04, 0.06, 0.08],
        },
        {
          key: "priority.networkNearMatchBonus",
          values: [0.06, 0.08, 0.1],
        },
        {
          key: "probabilities.matchingGroupInvite",
          values: [0.52, 0.58, 0.64],
        },
        {
          key: "probabilities.denseConversationInvite",
          values: [0.52, 0.6, 0.68],
        },
      ],
    };
  }

  throw new Error(`Unknown social-sim search profile: ${profile}`);
}

export function createCandidateTuning(baseTuning, dimensions, combination) {
  const tuning = normalizeSocialSimTuning(baseTuning);
  dimensions.forEach((dimension, index) => {
    setNestedValue(tuning, dimension.key.split("."), combination[index]);
  });
  return tuning;
}

export function scoreCandidate(
  summary,
  worlds,
  focusWorlds,
  objective = "weak-world-balance",
  options = {},
) {
  const protectedWorlds = options.protectedWorlds ?? [];
  const baselineWorldScores = options.baselineWorldScores ?? new Map();
  const overall = summary.totals.averageConvergenceScore ?? 0;
  const focusWorldRecords = worlds.filter((world) => focusWorlds.includes(world.worldId));
  const focusScores = focusWorldRecords.map((world) => world.summary.convergenceScore);
  const worldScores = new Map(
    worlds.map((world) => [world.worldId, world.summary.convergenceScore]),
  );
  const worldStrongCoverage = new Map(
    worlds.map((world) => [world.worldId, world.summary.strongRelationshipCoverage ?? 0]),
  );
  const weakMean =
    focusScores.length > 0
      ? focusScores.reduce((sum, value) => sum + value, 0) / focusScores.length
      : overall;
  const weakMin = focusScores.length > 0 ? Math.min(...focusScores) : overall;
  const networkFloor = worldScores.get("long-network-rebalancing-v1") ?? weakMin;
  const strongCoverageMean =
    focusWorldRecords.length > 0
      ? focusWorldRecords.reduce(
          (sum, world) => sum + (world.summary.strongRelationshipCoverage ?? 0),
          0,
        ) / focusWorldRecords.length
      : 0;
  const weakStartMatchMean =
    focusWorldRecords.length > 0
      ? focusWorldRecords.reduce(
          (sum, world) => sum + (world.summary.weakStartMatchCount ?? 0),
          0,
        ) / focusWorldRecords.length
      : 0;
  const meanStrengthLiftMean =
    focusWorldRecords.length > 0
      ? focusWorldRecords.reduce(
          (sum, world) => sum + (world.summary.meanStrengthLift ?? 0),
          0,
        ) / focusWorldRecords.length
      : 0;
  const regressionPenalty = protectedWorlds.reduce((penalty, worldId) => {
    const baseline = baselineWorldScores.get(worldId);
    const candidate = worldScores.get(worldId);
    const baselineCoverage = baselineWorldScores.get(`${worldId}:strongCoverage`);
    const candidateCoverage = worldStrongCoverage.get(worldId);
    let nextPenalty = penalty;
    if (Number.isFinite(baseline) && Number.isFinite(candidate)) {
      nextPenalty += Math.max(0, baseline - candidate);
    }
    if (Number.isFinite(baselineCoverage) && Number.isFinite(candidateCoverage)) {
      nextPenalty += Math.max(0, baselineCoverage - candidateCoverage) * 0.5;
    }
    return nextPenalty;
  }, 0);
  const objectiveScore =
    objective === "weak-world-push"
      ? overall * 0.25 +
        weakMean * 0.3 +
        weakMin * 0.2 +
        strongCoverageMean * 0.15 +
        meanStrengthLiftMean * 0.15 -
        weakStartMatchMean * 0.05
      : objective === "network-floor-push"
        ? overall * 0.2 +
          weakMean * 0.2 +
          weakMin * 0.15 +
          networkFloor * 0.25 +
          strongCoverageMean * 0.1 +
          meanStrengthLiftMean * 0.15 -
          weakStartMatchMean * 0.05
      : objective === "guarded-balance"
        ? overall * 0.2 +
          weakMean * 0.25 +
          weakMin * 0.15 +
          strongCoverageMean * 0.2 +
          meanStrengthLiftMean * 0.15 -
          weakStartMatchMean * 0.05 -
          regressionPenalty * 0.5
      : overall * 0.35 +
        weakMean * 0.2 +
        weakMin * 0.1 +
        strongCoverageMean * 0.2 +
        meanStrengthLiftMean * 0.2 -
        weakStartMatchMean * 0.05;
  return {
    objective: Number(objectiveScore.toFixed(4)),
    overall: Number(overall.toFixed(4)),
    weakMean: Number(weakMean.toFixed(4)),
    weakMin: Number(weakMin.toFixed(4)),
    networkFloor: Number(networkFloor.toFixed(4)),
    strongCoverageMean: Number(strongCoverageMean.toFixed(4)),
    weakStartMatchMean: Number(weakStartMatchMean.toFixed(4)),
    meanStrengthLiftMean: Number(meanStrengthLiftMean.toFixed(4)),
    regressionPenalty: Number(regressionPenalty.toFixed(4)),
  };
}

export function aggregateCandidateMetrics(seedRuns) {
  const divisor = Math.max(seedRuns.length, 1);
  const totals = seedRuns.reduce(
    (acc, seedRun) => {
      acc.objective += seedRun.metrics.objective;
      acc.overall += seedRun.metrics.overall;
      acc.weakMean += seedRun.metrics.weakMean;
      acc.weakMin += seedRun.metrics.weakMin;
      acc.networkFloor += seedRun.metrics.networkFloor ?? 0;
      acc.strongCoverageMean += seedRun.metrics.strongCoverageMean ?? 0;
      acc.weakStartMatchMean += seedRun.metrics.weakStartMatchMean ?? 0;
      acc.meanStrengthLiftMean += seedRun.metrics.meanStrengthLiftMean ?? 0;
      return acc;
    },
    {
      objective: 0,
      overall: 0,
      weakMean: 0,
      weakMin: 0,
      networkFloor: 0,
      strongCoverageMean: 0,
      weakStartMatchMean: 0,
      meanStrengthLiftMean: 0,
    },
  );
  const objectiveMean = totals.objective / divisor;
  const objectiveVariance =
    seedRuns.reduce(
      (sum, seedRun) => sum + (seedRun.metrics.objective - objectiveMean) ** 2,
      0,
    ) / divisor;
  return {
    objective: Number((totals.objective / divisor).toFixed(4)),
    overall: Number((totals.overall / divisor).toFixed(4)),
    weakMean: Number((totals.weakMean / divisor).toFixed(4)),
    weakMin: Number((totals.weakMin / divisor).toFixed(4)),
    networkFloor: Number((totals.networkFloor / divisor).toFixed(4)),
    strongCoverageMean: Number((totals.strongCoverageMean / divisor).toFixed(4)),
    weakStartMatchMean: Number((totals.weakStartMatchMean / divisor).toFixed(4)),
    meanStrengthLiftMean: Number((totals.meanStrengthLiftMean / divisor).toFixed(4)),
    objectiveStdDev: Number(Math.sqrt(objectiveVariance).toFixed(4)),
    worstSeedObjective: Number(
      Math.min(...seedRuns.map((seedRun) => seedRun.metrics.objective)).toFixed(4),
    ),
  };
}

function holdoutPenalty(candidateMetrics, baselineMetrics) {
  if (!baselineMetrics) return 0;
  return (
    Math.max(0, (baselineMetrics.overall ?? 0) - (candidateMetrics.overall ?? 0)) * 0.4 +
    Math.max(
      0,
      (baselineMetrics.strongCoverageMean ?? 0) - (candidateMetrics.strongCoverageMean ?? 0),
    ) * 0.2 +
    Math.max(0, (baselineMetrics.weakMin ?? 0) - (candidateMetrics.weakMin ?? 0)) * 0.2
  );
}

export async function main() {
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

  const baselineSeedRuns = [];
  for (const seed of seeds) {
    const baselineConfig = {
      ...baseConfig,
      provider: "stub",
      judgeProvider: "stub",
      dryRun: true,
      cleanupMode: "none",
      artifactRoot,
      namespace: `social-sim-baseline-seed-${seed}`,
      seed,
      tuning: normalizeSocialSimTuning(baseConfig.tuning ?? DEFAULT_SOCIAL_SIM_TUNING),
    };
    const result = await runSocialSimulation(baselineConfig);
    baselineSeedRuns.push({
      seed,
      runId: result.artifact.runId,
      runDir: result.runDir,
      summary: result.summary,
      worlds: result.artifact.worlds,
      metrics: scoreCandidate(
        result.summary,
        result.artifact.worlds,
        grid.focusWorlds,
        grid.objective,
      ),
    });
  }
  const baselineWorldScores = new Map();
  for (const seedRun of baselineSeedRuns) {
    for (const world of seedRun.worlds) {
      const previous = baselineWorldScores.get(world.worldId) ?? [];
      previous.push(world.summary.convergenceScore);
      baselineWorldScores.set(world.worldId, previous);
    }
  }
  for (const [worldId, scores] of baselineWorldScores.entries()) {
    baselineWorldScores.set(
      worldId,
      scores.reduce((sum, value) => sum + value, 0) / Math.max(scores.length, 1),
    );
  }
  for (const seedRun of baselineSeedRuns) {
    for (const world of seedRun.worlds) {
      const key = `${world.worldId}:strongCoverage`;
      const previous = baselineWorldScores.get(key) ?? [];
      previous.push(world.summary.strongRelationshipCoverage ?? 0);
      baselineWorldScores.set(key, previous);
    }
  }
  for (const [worldId, scores] of baselineWorldScores.entries()) {
    if (!String(worldId).endsWith(":strongCoverage")) continue;
    baselineWorldScores.set(
      worldId,
      scores.reduce((sum, value) => sum + value, 0) / Math.max(scores.length, 1),
    );
  }
  const baselineAggregate = aggregateCandidateMetrics(
    baselineSeedRuns.map((seedRun) => ({ metrics: seedRun.metrics })),
  );
  const baselineHoldoutAggregate =
    Array.isArray(grid.holdoutWorlds) && grid.holdoutWorlds.length > 0
      ? aggregateCandidateMetrics(
          baselineSeedRuns.map((seedRun) => ({
            metrics: scoreCandidate(
              seedRun.summary,
              seedRun.worlds,
              grid.holdoutWorlds,
              grid.objective,
            ),
          })),
        )
      : null;

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
          {
            protectedWorlds: grid.protectedWorlds,
            baselineWorldScores,
          },
        ),
        worstWorlds: result.artifact.worlds
          .map((world) => ({
            worldId: world.worldId,
            convergenceScore: world.summary.convergenceScore,
          }))
          .sort((left, right) => left.convergenceScore - right.convergenceScore)
          .slice(0, 5),
        holdoutMetrics:
          Array.isArray(grid.holdoutWorlds) && grid.holdoutWorlds.length > 0
            ? scoreCandidate(
                result.summary,
                result.artifact.worlds,
                grid.holdoutWorlds,
                grid.objective,
              )
            : null,
      });
    }
    const metrics = aggregateCandidateMetrics(seedRuns);
    const holdoutMetrics =
      Array.isArray(grid.holdoutWorlds) && grid.holdoutWorlds.length > 0
        ? aggregateCandidateMetrics(
            seedRuns
              .filter((seedRun) => seedRun.holdoutMetrics)
              .map((seedRun) => ({ metrics: seedRun.holdoutMetrics })),
          )
        : null;
    const selectionScore = Number(
      (
        metrics.objective -
        holdoutPenalty(holdoutMetrics, baselineHoldoutAggregate)
      ).toFixed(4),
    );
    results.push({
      rankHint: index + 1,
      tuning,
      metrics,
      holdoutMetrics,
      selectionScore,
      seedRuns,
      worstWorlds: seedRuns[0]?.worstWorlds ?? [],
    });
  }

  results.sort((left, right) => right.selectionScore - left.selectionScore);
  const output = {
    profile,
    objective: grid.objective,
    candidateCount: results.length,
    seeds,
    focusWorlds: grid.focusWorlds,
    holdoutWorlds: grid.holdoutWorlds ?? [],
    protectedWorlds: grid.protectedWorlds ?? [],
    baseline: {
      metrics: baselineAggregate,
      holdoutMetrics: baselineHoldoutAggregate,
      worldScores: Object.fromEntries(baselineWorldScores.entries()),
    },
    topCandidates: results.slice(0, Math.max(1, topK)),
  };

  writeFileSync(
    path.join(artifactRoot, "search-summary.json"),
    `${JSON.stringify(output, null, 2)}\n`,
    "utf8",
  );

  console.log(JSON.stringify(output, null, 2));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
