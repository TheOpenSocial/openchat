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
import {
  aggregateCandidateMetrics,
  buildCandidateGrid,
  cartesianProduct,
  createCandidateTuning,
  getSearchSeeds,
  parseSearchArgs,
  scoreCandidate,
} from "./run-social-sim-search.mjs";

function parseOptimizeArgs(argv = process.argv.slice(2)) {
  const flags = new Map();
  for (const arg of argv) {
    if (!arg.startsWith("--")) continue;
    const withoutPrefix = arg.slice(2);
    const [key, rawValue] = withoutPrefix.split("=", 2);
    flags.set(key, rawValue ?? "true");
  }
  return {
    refineRounds: Math.max(0, Number(flags.get("refine-rounds") ?? 2)),
    refineBeam: Math.max(1, Number(flags.get("refine-beam") ?? 1)),
    neighborMode: flags.get("neighbor-mode") ?? "adjacent",
  };
}

function candidateSignature(tuning) {
  return JSON.stringify(tuning);
}

function neighborValues(values, currentValue, mode) {
  const index = values.findIndex((value) => value === currentValue);
  if (index < 0) return values.slice();
  if (mode === "all") {
    return values.filter((value) => value !== currentValue);
  }
  const neighborSet = new Set([currentValue]);
  if (index > 0) neighborSet.add(values[index - 1]);
  if (index < values.length - 1) neighborSet.add(values[index + 1]);
  return Array.from(neighborSet);
}

function buildNeighborDimensions(grid, tuning, mode) {
  return grid.dimensions.map((dimension) => {
    const currentValue = dimension.key.split(".").reduce((cursor, key) => cursor?.[key], tuning);
    return {
      ...dimension,
      values: neighborValues(dimension.values, currentValue, mode),
    };
  });
}

function* coordinateNeighborhood(baseTuning, grid, mode = "adjacent") {
  const neighborDimensions = buildNeighborDimensions(grid, baseTuning, mode);
  for (let index = 0; index < neighborDimensions.length; index += 1) {
    const dimension = neighborDimensions[index];
    const currentValue = dimension.key.split(".").reduce((cursor, key) => cursor?.[key], baseTuning);
    for (const value of dimension.values) {
      if (value === currentValue) continue;
      const tuning = normalizeSocialSimTuning(baseTuning);
      const pathParts = dimension.key.split(".");
      let cursor = tuning;
      for (let pathIndex = 0; pathIndex < pathParts.length - 1; pathIndex += 1) {
        cursor = cursor[pathParts[pathIndex]];
      }
      cursor[pathParts[pathParts.length - 1]] = value;
      yield {
        tuning,
        changedDimension: dimension.key,
        changedValue: value,
        signature: `${dimension.key}:${JSON.stringify(value)}`,
      };
    }
  }
}

function buildCandidateArtifact(candidate, focusWorlds, objective) {
  return {
    signature: candidate.signature,
    label: candidate.label,
    metrics: candidate.metrics,
    tuning: candidate.tuning,
    worstWorlds: candidate.worstWorlds,
    seedRuns: candidate.seedRuns,
    scoreContext: {
      focusWorlds,
      objective,
    },
  };
}

async function evaluateCandidate({
  baseConfig,
  artifactRoot,
  grid,
  objective,
  focusWorlds,
  tuning,
  label,
  seeds,
}) {
  const seedRuns = [];
  for (const seed of seeds) {
    const candidateConfig = {
      ...baseConfig,
      provider: "stub",
      judgeProvider: "stub",
      dryRun: true,
      cleanupMode: "none",
      artifactRoot,
      namespace: label.replace(/[^a-zA-Z0-9-]+/g, "-").slice(0, 48),
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
        focusWorlds,
        objective,
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
  return {
    label,
    signature: candidateSignature(tuning),
    tuning,
    metrics,
    seedRuns,
    worstWorlds: seedRuns[0]?.worstWorlds ?? [],
    gridSize: grid.dimensions.length,
  };
}

async function main() {
  const baseConfig = parseSocialSimArgs(process.argv.slice(2), process.env);
  const searchArgs = parseSearchArgs(process.argv.slice(2));
  const optimizeArgs = parseOptimizeArgs(process.argv.slice(2));
  const grid = buildCandidateGrid(searchArgs.profile);
  const seeds = getSearchSeeds(baseConfig, searchArgs);
  const combinations = cartesianProduct(grid.dimensions.map((dimension) => dimension.values));
  const limitedCombinations =
    Number.isFinite(searchArgs.maxCandidates) && searchArgs.maxCandidates > 0
      ? combinations.slice(0, searchArgs.maxCandidates)
      : combinations;
  const artifactRoot = path.resolve(
    process.cwd(),
    DEFAULT_SOCIAL_SIM_ARTIFACT_ROOT,
    "optimize",
    `optimize-${new Date().toISOString().replace(/[:.]/g, "-")}`,
  );
  mkdirSync(artifactRoot, { recursive: true });

  const matrix = [];
  for (const [index, combination] of limitedCombinations.entries()) {
    const tuning = createCandidateTuning(
      normalizeSocialSimTuning(baseConfig.tuning ?? DEFAULT_SOCIAL_SIM_TUNING),
      grid.dimensions,
      combination,
    );
    const candidate = await evaluateCandidate({
      baseConfig,
      artifactRoot,
      grid,
      objective: grid.objective,
      focusWorlds: grid.focusWorlds,
      tuning,
      label: `matrix-${index + 1}`,
      seeds,
    });
    matrix.push(candidate);
  }

  matrix.sort((left, right) => right.metrics.objective - left.metrics.objective);
  const history = [
    {
      stage: "matrix",
      best: matrix[0] ?? null,
      topCandidates: matrix.slice(0, Math.max(1, searchArgs.topK ?? 5)),
    },
  ];

  let best = matrix[0] ?? null;
  const refinementRounds = [];
  const seen = new Set(matrix.map((candidate) => candidate.signature));
  let currentBest = best;
  for (let round = 0; round < optimizeArgs.refineRounds && currentBest; round += 1) {
    const neighborhood = [];
    for (const neighbor of coordinateNeighborhood(currentBest.tuning, grid, optimizeArgs.neighborMode)) {
      if (seen.has(neighbor.signature)) continue;
      seen.add(neighbor.signature);
      const candidate = await evaluateCandidate({
        baseConfig,
        artifactRoot,
        grid,
        objective: grid.objective,
        focusWorlds: grid.focusWorlds,
        tuning: neighbor.tuning,
        label: `refine-${round + 1}-${neighbor.changedDimension}`,
        seeds,
      });
      neighborhood.push({
        changedDimension: neighbor.changedDimension,
        changedValue: neighbor.changedValue,
        candidate,
      });
    }

    neighborhood.sort((left, right) => right.candidate.metrics.objective - left.candidate.metrics.objective);
    const roundBest = neighborhood[0]?.candidate ?? null;
    refinementRounds.push({
      round: round + 1,
      evaluatedCount: neighborhood.length,
      best: roundBest,
      accepted: Boolean(
        roundBest && roundBest.metrics.objective > currentBest.metrics.objective + 1e-4,
      ),
    });
    if (!roundBest || roundBest.metrics.objective <= currentBest.metrics.objective + 1e-4) {
      break;
    }
    currentBest = roundBest;
    best = roundBest;
  }

  const output = {
    profile: searchArgs.profile,
    objective: grid.objective,
    seeds,
    matrixCount: matrix.length,
    refineRounds: optimizeArgs.refineRounds,
    neighborMode: optimizeArgs.neighborMode,
    focusWorlds: grid.focusWorlds,
    matrixTop: matrix.slice(0, Math.max(1, searchArgs.topK ?? 5)),
    history,
    refinementRounds,
    bestCandidate: best ? buildCandidateArtifact(best, grid.focusWorlds, grid.objective) : null,
  };

  writeFileSync(
    path.join(artifactRoot, "optimize-summary.json"),
    `${JSON.stringify(output, null, 2)}\n`,
    "utf8",
  );
  writeFileSync(
    path.join(artifactRoot, "optimize-best.json"),
    `${JSON.stringify(output.bestCandidate, null, 2)}\n`,
    "utf8",
  );
  writeFileSync(
    path.join(artifactRoot, "optimize-history.json"),
    `${JSON.stringify({ history, refinementRounds }, null, 2)}\n`,
    "utf8",
  );

  console.log(JSON.stringify(output, null, 2));
}

await main();
