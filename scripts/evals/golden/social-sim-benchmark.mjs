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
const DEFAULT_BENCHMARK_CONCURRENCY = 1;

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

function parseConcurrency(value, max) {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_BENCHMARK_CONCURRENCY;
  }
  return Math.min(parsed, Math.max(max, 1));
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

function aggregateFamilyMetrics(seedSummaries) {
  const familyRollup = new Map();
  for (const summary of seedSummaries) {
    const familyScores = summary?.familyScores ?? {};
    for (const [family, metrics] of Object.entries(familyScores)) {
      const current = familyRollup.get(family) ?? {
        convergenceScores: [],
        oracleScores: [],
        oracleProgressScores: [],
        closurePrecisionScores: [],
        preferredRecallScores: [],
        forbiddenAvoidanceScores: [],
        diagnosticSeverityScores: [],
      };
      current.convergenceScores.push(metrics.averageConvergenceScore ?? 0);
      current.oracleScores.push(metrics.averageOracleScore ?? 0);
      current.oracleProgressScores.push(metrics.averageOracleProgressScore ?? 0);
      current.closurePrecisionScores.push(metrics.averageClosurePrecision ?? 0);
      current.preferredRecallScores.push(metrics.averagePreferredRecall ?? 0);
      current.forbiddenAvoidanceScores.push(metrics.averageForbiddenAvoidance ?? 0);
      current.diagnosticSeverityScores.push(metrics.averageDiagnosticSeverity ?? 0);
      familyRollup.set(family, current);
    }
  }

  return Object.fromEntries(
    Array.from(familyRollup.entries()).map(([family, metrics]) => [
      family,
      {
        meanConvergenceScore: Number(average(metrics.convergenceScores).toFixed(3)),
        convergenceScoreStdDev: Number(stddev(metrics.convergenceScores).toFixed(3)),
        meanOracleScore: Number(average(metrics.oracleScores).toFixed(3)),
        meanOracleProgressScore: Number(average(metrics.oracleProgressScores).toFixed(3)),
        meanClosurePrecision: Number(average(metrics.closurePrecisionScores).toFixed(3)),
        meanPreferredRecall: Number(average(metrics.preferredRecallScores).toFixed(3)),
        meanForbiddenAvoidance: Number(average(metrics.forbiddenAvoidanceScores).toFixed(3)),
        meanDiagnosticSeverity: Number(average(metrics.diagnosticSeverityScores).toFixed(3)),
        worstSeedConvergenceScore: Number(
          (metrics.convergenceScores.length > 0
            ? Math.min(...metrics.convergenceScores)
            : 0
          ).toFixed(3),
        ),
      },
    ]),
  );
}

async function mapWithConcurrency(items, concurrency, worker) {
  const results = new Array(items.length);
  let cursor = 0;

  async function runWorker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index], index);
    }
  }

  const workerCount = Math.min(Math.max(concurrency, 1), Math.max(items.length, 1));
  await Promise.all(Array.from({ length: workerCount }, () => runWorker()));
  return results;
}

export async function runSocialSimBenchmarkMatrix(argv = process.argv.slice(2), env = process.env) {
  const matrixSeeds = parseSeedList(env.SOCIAL_SIM_BENCHMARK_SEEDS);
  const benchmarkConcurrency = parseConcurrency(
    env.SOCIAL_SIM_BENCHMARK_CONCURRENCY,
    matrixSeeds.length,
  );
  const config = parseSocialSimArgs(argv, env);
  const envelope = createEvalRunEnvelope({
    evalSuite: "social-sim-benchmark",
    evalType: "golden",
    artifactRoot: env.EVAL_ARTIFACT_ROOT,
  });

  const caseRows = [];
  const seedResults = await mapWithConcurrency(matrixSeeds, benchmarkConcurrency, async (seed) => {
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
      familyScores: result.summary?.familyScores ?? {},
    };
    return row;
  });
  caseRows.push(...seedResults);

  const scores = seedResults.map((entry) => entry.score);
  const oracleScores = seedResults.map((entry) => entry.oracleScore);
  const oracleProgressScores = seedResults.map((entry) => entry.oracleProgressScore);
  const familyMetrics = aggregateFamilyMetrics(
    seedResults.map((entry) => ({ familyScores: entry.familyScores })),
  );
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
    familyMetrics,
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
      concurrency: benchmarkConcurrency,
    },
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = await runSocialSimBenchmarkMatrix();
  console.log(JSON.stringify(result.summary, null, 2));
  console.log(`artifact written to ${path.join(result.runDir, "run.json")}`);
}
