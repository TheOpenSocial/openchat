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
import {
  aggregateCandidateMetrics,
  buildCandidateGrid,
  cartesianProduct,
  createCandidateTuning,
  getSearchSeeds,
  parseSearchArgs,
  scoreCandidate,
  setNestedValue,
} from "./run-social-sim-search.mjs";

function parseOptimizeArgs(argv = process.argv.slice(2)) {
  const searchArgs = parseSearchArgs(argv);
  const flags = new Map();
  for (const arg of argv) {
    if (!arg.startsWith("--")) continue;
    const withoutPrefix = arg.slice(2);
    const [key, rawValue] = withoutPrefix.split("=", 2);
    flags.set(key, rawValue ?? "true");
  }
  return {
    ...searchArgs,
    refineRounds: Number(flags.get("refine-rounds") ?? 2),
    refineBeam: Number(flags.get("refine-beam") ?? 2),
  };
}

function cloneTuning(tuning) {
  return normalizeSocialSimTuning(tuning);
}

function tuningKey(tuning) {
  return JSON.stringify(tuning);
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

async function buildBaseline(baseConfig, grid, seeds, artifactRoot) {
  const baselineSeedRuns = [];
  for (const seed of seeds) {
    const baselineConfig = {
      ...baseConfig,
      provider: "stub",
      judgeProvider: "stub",
      dryRun: true,
      cleanupMode: "none",
      artifactRoot,
      namespace: `social-sim-optimize-baseline-seed-${seed}`,
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

  return {
    seedRuns: baselineSeedRuns,
    metrics: aggregateCandidateMetrics(
      baselineSeedRuns.map((seedRun) => ({ metrics: seedRun.metrics })),
    ),
    holdoutMetrics:
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
        : null,
    worldScores: baselineWorldScores,
  };
}

async function evaluateCandidate({
  tuning,
  baseConfig,
  grid,
  seeds,
  artifactRoot,
  baselineWorldScores,
  label,
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
      namespace: `${label}-seed-${seed}`,
      seed,
      tuning,
    };
    const result = await runSocialSimulation(candidateConfig);
    const holdoutMetrics =
      Array.isArray(grid.holdoutWorlds) && grid.holdoutWorlds.length > 0
        ? scoreCandidate(
            result.summary,
            result.artifact.worlds,
            grid.holdoutWorlds,
            grid.objective,
          )
        : null;
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
      holdoutMetrics,
      worstWorlds: result.artifact.worlds
        .map((world) => ({
          worldId: world.worldId,
          convergenceScore: world.summary.convergenceScore,
        }))
        .sort((left, right) => left.convergenceScore - right.convergenceScore)
        .slice(0, 5),
    });
  }

  return {
    tuning,
    metrics: aggregateCandidateMetrics(seedRuns),
    holdoutMetrics:
      Array.isArray(grid.holdoutWorlds) && grid.holdoutWorlds.length > 0
        ? aggregateCandidateMetrics(
            seedRuns
              .filter((seedRun) => seedRun.holdoutMetrics)
              .map((seedRun) => ({ metrics: seedRun.holdoutMetrics })),
          )
        : null,
    seedRuns,
    worstWorlds: seedRuns[0]?.worstWorlds ?? [],
  };
}

async function main() {
  const baseConfig = parseSocialSimArgs(process.argv.slice(2), process.env);
  const parsedArgs = parseOptimizeArgs(process.argv.slice(2));
  const { profile, topK, maxCandidates, refineRounds, refineBeam } = parsedArgs;
  const seeds = getSearchSeeds(baseConfig, parsedArgs);
  const grid = buildCandidateGrid(profile);
  const artifactRoot = path.resolve(
    process.cwd(),
    DEFAULT_SOCIAL_SIM_ARTIFACT_ROOT,
    "optimize",
    `optimize-${new Date().toISOString().replace(/[:.]/g, "-")}`,
  );
  mkdirSync(artifactRoot, { recursive: true });

  const baseline = await buildBaseline(baseConfig, grid, seeds, artifactRoot);
  const combinations = cartesianProduct(grid.dimensions.map((dimension) => dimension.values));
  const limitedCombinations =
    maxCandidates > 0 ? combinations.slice(0, maxCandidates) : combinations;

  const seen = new Set();
  const history = [];
  let candidateCounter = 0;

  for (const combination of limitedCombinations) {
    const tuning = createCandidateTuning(
      cloneTuning(baseConfig.tuning ?? DEFAULT_SOCIAL_SIM_TUNING),
      grid.dimensions,
      combination,
    );
    const key = tuningKey(tuning);
    if (seen.has(key)) continue;
    seen.add(key);
    const result = await evaluateCandidate({
      tuning,
      baseConfig,
      grid,
      seeds,
      artifactRoot,
      baselineWorldScores: baseline.worldScores,
      label: `social-sim-optimize-${++candidateCounter}`,
    });
    history.push({
      phase: "matrix",
      selectionScore: Number(
        (
          result.metrics.objective -
          holdoutPenalty(result.holdoutMetrics, baseline.holdoutMetrics)
        ).toFixed(4),
      ),
      ...result,
    });
  }

  history.sort((left, right) => right.selectionScore - left.selectionScore);
  let beam = history.slice(0, Math.max(1, refineBeam));

  for (let round = 0; round < refineRounds; round += 1) {
    const nextBeam = [];
    for (const candidate of beam) {
      for (const dimension of grid.dimensions) {
        for (const value of dimension.values) {
          const tuning = cloneTuning(candidate.tuning);
          setNestedValue(tuning, dimension.key.split("."), value);
          const key = tuningKey(tuning);
          if (seen.has(key)) continue;
          seen.add(key);
          const result = await evaluateCandidate({
            tuning,
            baseConfig,
            grid,
            seeds,
            artifactRoot,
            baselineWorldScores: baseline.worldScores,
            label: `social-sim-optimize-${++candidateCounter}`,
          });
          nextBeam.push({
            phase: `refine-${round + 1}`,
            selectionScore: Number(
              (
                result.metrics.objective -
                holdoutPenalty(result.holdoutMetrics, baseline.holdoutMetrics)
              ).toFixed(4),
            ),
            ...result,
          });
        }
      }
    }
    history.push(...nextBeam);
    history.sort((left, right) => right.selectionScore - left.selectionScore);
    beam = history.slice(0, Math.max(1, refineBeam));
  }

  const topCandidates = history
    .slice()
    .sort((left, right) => right.selectionScore - left.selectionScore)
    .slice(0, Math.max(1, topK));

  const output = {
    profile,
    objective: grid.objective,
    seeds,
    focusWorlds: grid.focusWorlds,
    holdoutWorlds: grid.holdoutWorlds ?? [],
    protectedWorlds: grid.protectedWorlds ?? [],
    baseline: {
      metrics: baseline.metrics,
      holdoutMetrics: baseline.holdoutMetrics,
      worldScores: Object.fromEntries(baseline.worldScores.entries()),
    },
    topCandidates,
  };

  writeFileSync(
    path.join(artifactRoot, "optimize-summary.json"),
    `${JSON.stringify(output, null, 2)}\n`,
    "utf8",
  );
  writeFileSync(
    path.join(artifactRoot, "optimize-best.json"),
    `${JSON.stringify(topCandidates[0] ?? null, null, 2)}\n`,
    "utf8",
  );
  writeFileSync(
    path.join(artifactRoot, "optimize-history.json"),
    `${JSON.stringify(history, null, 2)}\n`,
    "utf8",
  );

  console.log(JSON.stringify(output, null, 2));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
