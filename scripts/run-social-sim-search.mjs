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

const CURRENT_TUNING_WORLDS = new Set([
  "short-no-match-recovery-v1",
  "medium-multi-cluster-bridging-v1",
  "long-network-rebalancing-v1",
  "long-recurring-circle-fragmentation-v1",
  "long-bad-actor-containment-v1",
]);

const HOLDOUT_ONLY_V2_WORLDS = [
  "medium-cross-cluster-holdout-v1",
  "long-trust-boundary-holdout-v1",
];

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
  if (profile === "holdout-balance-v2") {
    return {
      objective: "holdout-only",
      focusWorlds: HOLDOUT_ONLY_V2_WORLDS,
      holdoutWorlds: HOLDOUT_ONLY_V2_WORLDS,
      protectedWorlds: HOLDOUT_ONLY_V2_WORLDS,
      excludedWorlds: Array.from(CURRENT_TUNING_WORLDS),
      dimensions: [
        {
          key: "scoring.expectationFulfillmentWeight",
          values: [0.22, 0.26, 0.3],
        },
        {
          key: "probabilities.matchingGroupInvite",
          values: [0.52, 0.58, 0.64],
        },
        {
          key: "probabilities.denseConversationInvite",
          values: [0.52, 0.6, 0.68],
        },
        {
          key: "thresholds.nearMatchMin",
          values: [0.62, 0.65, 0.68],
        },
        {
          key: "priority.circleNearMatchBonus",
          values: [0.06, 0.08, 0.12],
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
  const oracleScoreMean =
    focusWorldRecords.length > 0
      ? focusWorldRecords.reduce(
          (sum, world) => sum + (world.summary.oracleScore ?? 0),
          0,
        ) / focusWorldRecords.length
      : 0;
  const oracleProgressMean =
    focusWorldRecords.length > 0
      ? focusWorldRecords.reduce(
          (sum, world) => sum + (world.summary.oracleProgressScore ?? 0),
          0,
        ) / focusWorldRecords.length
      : 0;
  const closurePrecisionMean =
    focusWorldRecords.length > 0
      ? focusWorldRecords.reduce(
          (sum, world) => sum + (world.summary.closurePrecision ?? 0),
          0,
        ) / focusWorldRecords.length
      : 0;
  const preferredRecallMean =
    focusWorldRecords.length > 0
      ? focusWorldRecords.reduce(
          (sum, world) => sum + (world.summary.preferredRecall ?? 0),
          0,
        ) / focusWorldRecords.length
      : 0;
  const forbiddenAvoidanceMean =
    focusWorldRecords.length > 0
      ? focusWorldRecords.reduce(
          (sum, world) => sum + (world.summary.forbiddenAvoidance ?? 0),
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
        oracleScoreMean * 0.15 +
        oracleProgressMean * 0.15 +
        preferredRecallMean * 0.1 +
        strongCoverageMean * 0.15 +
        meanStrengthLiftMean * 0.15 -
        weakStartMatchMean * 0.05
      : objective === "network-floor-push"
        ? overall * 0.2 +
          weakMean * 0.2 +
          weakMin * 0.15 +
          networkFloor * 0.25 +
          oracleScoreMean * 0.12 +
          oracleProgressMean * 0.12 +
          preferredRecallMean * 0.1 +
          strongCoverageMean * 0.1 +
          meanStrengthLiftMean * 0.15 -
          weakStartMatchMean * 0.05
      : objective === "guarded-balance"
        ? overall * 0.2 +
          weakMean * 0.25 +
          weakMin * 0.15 +
          oracleScoreMean * 0.2 +
          oracleProgressMean * 0.18 +
          closurePrecisionMean * 0.1 +
          forbiddenAvoidanceMean * 0.08 +
          strongCoverageMean * 0.2 +
          meanStrengthLiftMean * 0.15 -
          weakStartMatchMean * 0.05 -
          regressionPenalty * 0.5
      : objective === "holdout-balance"
        ? overall * 0.14 +
          weakMean * 0.16 +
          weakMin * 0.1 +
          oracleScoreMean * 0.22 +
          oracleProgressMean * 0.16 +
          closurePrecisionMean * 0.12 +
          preferredRecallMean * 0.12 +
          forbiddenAvoidanceMean * 0.08 +
          strongCoverageMean * 0.12 +
          meanStrengthLiftMean * 0.08 -
          weakStartMatchMean * 0.04 -
          regressionPenalty * 0.45
      : objective === "holdout-only"
        ? overall * 0.2 +
          weakMean * 0.14 +
          weakMin * 0.12 +
          oracleScoreMean * 0.2 +
          oracleProgressMean * 0.16 +
          closurePrecisionMean * 0.12 +
          preferredRecallMean * 0.1 +
          forbiddenAvoidanceMean * 0.06 +
          strongCoverageMean * 0.12 +
          meanStrengthLiftMean * 0.1 -
          weakStartMatchMean * 0.04 -
          regressionPenalty * 0.5
      : overall * 0.35 +
        weakMean * 0.2 +
        weakMin * 0.1 +
        oracleScoreMean * 0.2 +
        oracleProgressMean * 0.14 +
        closurePrecisionMean * 0.08 +
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
    oracleScoreMean: Number(oracleScoreMean.toFixed(4)),
    oracleProgressMean: Number(oracleProgressMean.toFixed(4)),
    closurePrecisionMean: Number(closurePrecisionMean.toFixed(4)),
    preferredRecallMean: Number(preferredRecallMean.toFixed(4)),
    forbiddenAvoidanceMean: Number(forbiddenAvoidanceMean.toFixed(4)),
    regressionPenalty: Number(regressionPenalty.toFixed(4)),
  };
}

function average(values) {
  return values.length > 0
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : 0;
}

export function findWorstWorldByDiagnostics(worldDiagnostics) {
  return (
    worldDiagnostics
      .slice()
      .sort((left, right) => {
        const severityGap =
          (right.topReason?.severity ?? 0) - (left.topReason?.severity ?? 0);
        if (Math.abs(severityGap) > 0.0001) return severityGap;
        return (left.convergenceScore ?? 0) - (right.convergenceScore ?? 0);
      })[0] ?? null
  );
}

function buildWorldReasonCandidates(diagnostic) {
  const reasons = [];
  if ((diagnostic.deltaConvergence ?? 0) <= -0.12) {
    reasons.push({
      code: "regressed_convergence",
      severity: Math.abs(diagnostic.deltaConvergence),
      message: `${diagnostic.worldId} regressed against baseline by ${diagnostic.deltaConvergence.toFixed(3)}`,
    });
  }
  if ((diagnostic.convergenceScore ?? 0) < 0.2) {
    reasons.push({
      code: "critical_low_convergence",
      severity: 0.35 - (diagnostic.convergenceScore ?? 0),
      message: `${diagnostic.worldId} is critically low on convergence`,
    });
  }
  if (
    diagnostic.family !== "recovery" &&
    (diagnostic.matchedRelationships ?? 0) === 0 &&
    (diagnostic.convergenceScore ?? 0) < 0.55
  ) {
    reasons.push({
      code: "no_durable_match",
      severity: 0.24,
      message: `${diagnostic.worldId} is not converting healthy edges into durable matches`,
    });
  }
  if (
    diagnostic.family === "recovery" &&
    (diagnostic.noMatchRecoveryQuality ?? 0) < 0.62
  ) {
    reasons.push({
      code: "weak_recovery_path",
      severity: 0.2,
      message: `${diagnostic.worldId} recovery quality is too low for a recovery-first world`,
    });
  }
  if (
    diagnostic.family === "circle" &&
    (diagnostic.memoryConsistency ?? 0) < 0.62
  ) {
    reasons.push({
      code: "weak_circle_continuity",
      severity: 0.18,
      message: `${diagnostic.worldId} is not preserving circle continuity strongly enough`,
    });
  }
  if (
    diagnostic.family === "dense-social-graph" &&
    ((diagnostic.strongRelationshipCoverage ?? 0) < 0.45 ||
      (diagnostic.oracleProgressScore ?? 0) < 0.45)
  ) {
    reasons.push({
      code: "weak_group_progress",
      severity: 0.18 + Math.max(0, 0.45 - (diagnostic.oracleProgressScore ?? 0)),
      message: `${diagnostic.worldId} is underperforming on group progress and bridge formation`,
    });
  }
  if ((diagnostic.closurePrecision ?? 1) < 0.45) {
    reasons.push({
      code: "low_closure_precision",
      severity: 0.45 - (diagnostic.closurePrecision ?? 0),
      message: `${diagnostic.worldId} is closing the wrong edges too often`,
    });
  }
  if ((diagnostic.weakStartMatchMean ?? 0) > 0.5) {
    reasons.push({
      code: "weak_start_overpromotion",
      severity: (diagnostic.weakStartMatchMean ?? 0) - 0.5,
      message: `${diagnostic.worldId} is over-promoting weak starting relationships`,
    });
  }
  if (reasons.length === 0) {
    reasons.push({
      code: "no_major_regression",
      severity: 0,
      message: `${diagnostic.worldId} has no dominant regression signature`,
    });
  }
  return reasons.sort((left, right) => right.severity - left.severity);
}

export function aggregateWorldDiagnostics(
  seedRuns,
  options = {},
) {
  const selectedWorlds =
    Array.isArray(options.selectedWorlds) && options.selectedWorlds.length > 0
      ? new Set(options.selectedWorlds)
      : null;
  const baselineWorldScores = options.baselineWorldScores ?? new Map();
  const aggregate = new Map();

  for (const seedRun of seedRuns) {
    for (const world of seedRun.worlds ?? []) {
      if (selectedWorlds && !selectedWorlds.has(world.worldId)) continue;
      const key = world.worldId;
      const current = aggregate.get(key) ?? {
        worldId: world.worldId,
        family: world.family,
        horizon: world.horizon,
        convergenceScore: [],
        matchedRelationships: [],
        noMatchRecoveryQuality: [],
        memoryConsistency: [],
        strongRelationshipCoverage: [],
        weakStartMatchMean: [],
        meanStrengthLift: [],
        oracleScore: [],
        oracleProgressScore: [],
        closurePrecision: [],
        preferredRecall: [],
        forbiddenAvoidance: [],
      };
      const summary = world.summary ?? {};
      current.convergenceScore.push(summary.convergenceScore ?? 0);
      current.matchedRelationships.push(summary.matchedRelationships ?? 0);
      current.noMatchRecoveryQuality.push(summary.noMatchRecoveryQuality ?? 0);
      current.memoryConsistency.push(summary.memoryConsistency ?? 0);
      current.strongRelationshipCoverage.push(summary.strongRelationshipCoverage ?? 0);
      current.weakStartMatchMean.push(summary.weakStartMatchCount ?? 0);
      current.meanStrengthLift.push(summary.meanStrengthLift ?? 0);
      current.oracleScore.push(summary.oracleScore ?? 0);
      current.oracleProgressScore.push(summary.oracleProgressScore ?? 0);
      current.closurePrecision.push(summary.closurePrecision ?? 0);
      current.preferredRecall.push(summary.preferredRecall ?? 0);
      current.forbiddenAvoidance.push(summary.forbiddenAvoidance ?? 0);
      aggregate.set(key, current);
    }
  }

  return Array.from(aggregate.values())
    .map((entry) => {
      const diagnostic = {
        worldId: entry.worldId,
        family: entry.family,
        horizon: entry.horizon,
        convergenceScore: Number(average(entry.convergenceScore).toFixed(4)),
        matchedRelationships: Number(average(entry.matchedRelationships).toFixed(4)),
        noMatchRecoveryQuality: Number(average(entry.noMatchRecoveryQuality).toFixed(4)),
        memoryConsistency: Number(average(entry.memoryConsistency).toFixed(4)),
        strongRelationshipCoverage: Number(average(entry.strongRelationshipCoverage).toFixed(4)),
        weakStartMatchMean: Number(average(entry.weakStartMatchMean).toFixed(4)),
        meanStrengthLift: Number(average(entry.meanStrengthLift).toFixed(4)),
        oracleScore: Number(average(entry.oracleScore).toFixed(4)),
        oracleProgressScore: Number(average(entry.oracleProgressScore).toFixed(4)),
        closurePrecision: Number(average(entry.closurePrecision).toFixed(4)),
        preferredRecall: Number(average(entry.preferredRecall).toFixed(4)),
        forbiddenAvoidance: Number(average(entry.forbiddenAvoidance).toFixed(4)),
      };
      const baselineConvergence = baselineWorldScores.get(entry.worldId);
      const baselineCoverage = baselineWorldScores.get(`${entry.worldId}:strongCoverage`);
      diagnostic.deltaConvergence = Number(
        (
          diagnostic.convergenceScore -
          (Number.isFinite(baselineConvergence) ? baselineConvergence : diagnostic.convergenceScore)
        ).toFixed(4),
      );
      diagnostic.deltaStrongCoverage = Number(
        (
          diagnostic.strongRelationshipCoverage -
          (Number.isFinite(baselineCoverage)
            ? baselineCoverage
            : diagnostic.strongRelationshipCoverage)
        ).toFixed(4),
      );
      diagnostic.reasonCandidates = buildWorldReasonCandidates(diagnostic);
      diagnostic.topReason = diagnostic.reasonCandidates[0];
      return diagnostic;
    })
    .sort((left, right) => left.convergenceScore - right.convergenceScore);
}

export function findTopRegressionReason(worldDiagnostics) {
  const candidates = worldDiagnostics
    .map((world) => ({
      worldId: world.worldId,
      family: world.family,
      ...world.topReason,
      convergenceScore: world.convergenceScore,
      deltaConvergence: world.deltaConvergence,
    }))
    .sort((left, right) => right.severity - left.severity);
  return candidates[0] ?? null;
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
      acc.oracleScoreMean += seedRun.metrics.oracleScoreMean ?? 0;
      acc.oracleProgressMean += seedRun.metrics.oracleProgressMean ?? 0;
      acc.closurePrecisionMean += seedRun.metrics.closurePrecisionMean ?? 0;
      acc.preferredRecallMean += seedRun.metrics.preferredRecallMean ?? 0;
      acc.forbiddenAvoidanceMean += seedRun.metrics.forbiddenAvoidanceMean ?? 0;
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
      oracleScoreMean: 0,
      oracleProgressMean: 0,
      closurePrecisionMean: 0,
      preferredRecallMean: 0,
      forbiddenAvoidanceMean: 0,
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
    oracleScoreMean: Number((totals.oracleScoreMean / divisor).toFixed(4)),
    oracleProgressMean: Number((totals.oracleProgressMean / divisor).toFixed(4)),
    closurePrecisionMean: Number((totals.closurePrecisionMean / divisor).toFixed(4)),
    preferredRecallMean: Number((totals.preferredRecallMean / divisor).toFixed(4)),
    forbiddenAvoidanceMean: Number(
      (totals.forbiddenAvoidanceMean / divisor).toFixed(4),
    ),
    objectiveStdDev: Number(Math.sqrt(objectiveVariance).toFixed(4)),
    worstSeedObjective: Number(
      Math.min(...seedRuns.map((seedRun) => seedRun.metrics.objective)).toFixed(4),
    ),
  };
}

export function holdoutPenalty(candidateMetrics, baselineMetrics) {
  if (!baselineMetrics) return 0;
  return (
    Math.max(0, (baselineMetrics.overall ?? 0) - (candidateMetrics.overall ?? 0)) * 0.4 +
    Math.max(
      0,
      (baselineMetrics.strongCoverageMean ?? 0) - (candidateMetrics.strongCoverageMean ?? 0),
    ) * 0.2 +
    Math.max(0, (baselineMetrics.weakMin ?? 0) - (candidateMetrics.weakMin ?? 0)) * 0.2 +
    Math.max(
      0,
      (baselineMetrics.oracleScoreMean ?? 0) - (candidateMetrics.oracleScoreMean ?? 0),
    ) * 0.25 +
    Math.max(
      0,
      (baselineMetrics.oracleProgressMean ?? 0) - (candidateMetrics.oracleProgressMean ?? 0),
    ) * 0.2 +
    Math.max(
      0,
      (baselineMetrics.closurePrecisionMean ?? 0) - (candidateMetrics.closurePrecisionMean ?? 0),
    ) * 0.15
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
      worldSet: "all",
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
  const baselineWorldDiagnostics = aggregateWorldDiagnostics(baselineSeedRuns, {
    selectedWorlds: grid.focusWorlds,
    baselineWorldScores,
  });
  const baselineHoldoutDiagnostics =
    Array.isArray(grid.holdoutWorlds) && grid.holdoutWorlds.length > 0
      ? aggregateWorldDiagnostics(baselineSeedRuns, {
          selectedWorlds: grid.holdoutWorlds,
          baselineWorldScores,
        })
      : [];

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
        worldSet: "all",
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
        summary: result.summary,
        worlds: result.artifact.worlds,
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
    const worldDiagnostics = aggregateWorldDiagnostics(seedRuns, {
      selectedWorlds: grid.focusWorlds,
      baselineWorldScores,
    });
    const holdoutDiagnostics =
      Array.isArray(grid.holdoutWorlds) && grid.holdoutWorlds.length > 0
        ? aggregateWorldDiagnostics(seedRuns, {
            selectedWorlds: grid.holdoutWorlds,
            baselineWorldScores,
          })
        : [];
    results.push({
      rankHint: index + 1,
      tuning,
      metrics,
      holdoutMetrics,
      selectionScore,
      topRegressionReason: findTopRegressionReason(worldDiagnostics),
      holdoutTopRegressionReason: findTopRegressionReason(holdoutDiagnostics),
      worstHoldoutWorld: findWorstWorldByDiagnostics(holdoutDiagnostics),
      worstSeedWorld:
        seedRuns
          .flatMap((seedRun) =>
            (seedRun.worstWorlds ?? []).map((world) => ({
              seed: seedRun.seed,
              ...world,
            })),
          )
          .sort((left, right) => left.convergenceScore - right.convergenceScore)[0] ?? null,
      worldDiagnostics,
      holdoutDiagnostics,
      seedRuns,
      worstWorlds: seedRuns[0]?.worstWorlds ?? [],
    });
  }

  results.sort((left, right) => right.selectionScore - left.selectionScore);
  const topCandidates = results.slice(0, Math.max(1, topK));
  const topHoldoutCandidates = results
    .slice()
    .filter((result) => result.holdoutMetrics)
    .sort(
      (left, right) =>
        (right.holdoutMetrics?.objective ?? Number.NEGATIVE_INFINITY) -
        (left.holdoutMetrics?.objective ?? Number.NEGATIVE_INFINITY),
    )
    .slice(0, Math.max(1, topK));
  const output = {
    profile,
    objective: grid.objective,
    candidateCount: results.length,
    seeds,
    focusWorlds: grid.focusWorlds,
    holdoutWorlds: grid.holdoutWorlds ?? [],
    protectedWorlds: grid.protectedWorlds ?? [],
    excludedWorlds: grid.excludedWorlds ?? [],
    baseline: {
      metrics: baselineAggregate,
      holdoutMetrics: baselineHoldoutAggregate,
      topRegressionReason: findTopRegressionReason(baselineWorldDiagnostics),
      holdoutTopRegressionReason: findTopRegressionReason(baselineHoldoutDiagnostics),
      worstHoldoutWorld: findWorstWorldByDiagnostics(baselineHoldoutDiagnostics),
      worstSeedWorld:
        baselineSeedRuns
          .flatMap((seedRun) =>
            (seedRun.worlds ?? []).map((world) => ({
              seed: seedRun.seed,
              worldId: world.worldId,
              convergenceScore: world.summary?.convergenceScore ?? 0,
            })),
          )
          .sort((left, right) => left.convergenceScore - right.convergenceScore)[0] ?? null,
      worldDiagnostics: baselineWorldDiagnostics,
      holdoutDiagnostics: baselineHoldoutDiagnostics,
      worldScores: Object.fromEntries(baselineWorldScores.entries()),
    },
    topCandidates,
    topHoldoutCandidates,
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
