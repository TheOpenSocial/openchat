#!/usr/bin/env node

import path from "node:path";
import {
  DEFAULT_SOCIAL_SIM_BENCHMARK_SEED,
  parseSocialSimArgs,
  runSocialSimulation,
} from "../../social-sim-core.mjs";
import {
  createEvalRunEnvelope,
  finalizeEvalRun,
  summarizeCaseRows,
} from "../shared/artifacts.mjs";

const DEFAULT_BENCHMARK_SEEDS = [
  DEFAULT_SOCIAL_SIM_BENCHMARK_SEED,
  DEFAULT_SOCIAL_SIM_BENCHMARK_SEED + 10000,
  DEFAULT_SOCIAL_SIM_BENCHMARK_SEED + 20000,
];

function parseSeedList(value) {
  if (typeof value !== "string" || value.trim().length === 0) {
    return DEFAULT_BENCHMARK_SEEDS;
  }
  const seeds = value
    .split(",")
    .map((entry) => Number(entry.trim()))
    .filter((entry) => Number.isFinite(entry));
  return seeds.length > 0 ? seeds : DEFAULT_BENCHMARK_SEEDS;
}

function average(values) {
  return values.length > 0
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : 0;
}

function stddev(values) {
  if (values.length <= 1) return 0;
  const mean = average(values);
  const variance =
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

export async function runSocialSimBenchmarkMatrix(argv = process.argv.slice(2), env = process.env) {
  const matrixSeeds = parseSeedList(env.SOCIAL_SIM_BENCHMARK_SEEDS);
  const config = parseSocialSimArgs(argv, env);
  const envelope = createEvalRunEnvelope({
    evalSuite: "social-sim-benchmark",
    evalType: "golden",
    artifactRoot: env.EVAL_ARTIFACT_ROOT,
  });

  const caseRows = [];
  const seedResults = [];
  for (const seed of matrixSeeds) {
    const result = await runSocialSimulation({
      ...config,
      benchmarkMode: true,
      seed,
      runId: `${envelope.runId}-seed-${seed}`,
      artifactRoot: path.join(envelope.runDir, "social-sim"),
    });
    const score = result.summary?.totals?.averageConvergenceScore ?? 0;
    const oracleScore = result.summary?.totals?.averageOracleScore ?? 0;
    const oracleProgressScore = result.summary?.totals?.averageOracleProgressScore ?? 0;
    const row = {
      caseId: `social-sim-seed-${seed}`,
      seed,
      status: score >= 0.5 ? "passed" : "failed",
      score,
      oracleScore,
      oracleProgressScore,
      verdict: result.summary?.verdict ?? "unknown",
      primaryFailureReason:
        result.summary?.worldDiagnostics?.find(
          (world) => (world.diagnostics?.severity ?? 0) > 0,
        )?.diagnostics?.primaryReason ?? "none",
      measurementWarnings: result.summary?.measurementWarnings ?? [],
      effectiveBackendMode: result.summary?.effectiveBackendMode ?? "unknown",
      artifactRunId: result.artifact?.runId ?? null,
    };
    caseRows.push(row);
    seedResults.push(row);
  }

  const scores = seedResults.map((entry) => entry.score);
  const oracleScores = seedResults.map((entry) => entry.oracleScore);
  const oracleProgressScores = seedResults.map((entry) => entry.oracleProgressScore);
  const worstSeed = [...seedResults].sort((left, right) => left.score - right.score)[0] ?? null;
  const summary = {
    ...summarizeCaseRows(caseRows),
    evalSuite: envelope.evalSuite,
    seeds: matrixSeeds,
    meanScore: Number(average(scores).toFixed(3)),
    scoreStdDev: Number(stddev(scores).toFixed(3)),
    worstSeedScore: Number((worstSeed?.score ?? 0).toFixed(3)),
    worstSeed: worstSeed?.seed ?? null,
    meanOracleScore: Number(average(oracleScores).toFixed(3)),
    meanOracleProgressScore: Number(average(oracleProgressScores).toFixed(3)),
    effectiveBackendModes: Array.from(
      new Set(seedResults.map((entry) => entry.effectiveBackendMode).filter(Boolean)),
    ),
  };

  return finalizeEvalRun(envelope, summary, caseRows, {
    benchmarkConfig: {
      provider: config.provider,
      judgeProvider: config.judgeProvider,
      horizon: config.horizon,
      benchmarkMode: true,
      worldSet: config.worldSet,
    },
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = await runSocialSimBenchmarkMatrix();
  console.log(JSON.stringify(result.summary, null, 2));
  console.log(`artifact written to ${path.join(result.runDir, "run.json")}`);
}

