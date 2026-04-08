#!/usr/bin/env node

import { readFileSync } from "node:fs";
import path from "node:path";

import {
  createEvalRunEnvelope,
  finalizeEvalRun,
  summarizeCaseRows,
} from "../shared/artifacts.mjs";
import { runSocialSimBenchmarkMatrix } from "../golden/social-sim-benchmark.mjs";
import { runProductCriticalGoldens } from "../golden/product-critical-goldens.mjs";
import { runReplayEvals } from "../replay/run-replay-evals.mjs";

const DEFAULT_BASELINE_PATH = "scripts/evals/system/system-baseline.json";
const DEFAULT_HISTORICAL_CORPUS_PATH =
  "scripts/evals/replay/sample-historical-replay-corpus.json";
const DEFAULT_HISTORICAL_EXPORT_PATH =
  "scripts/evals/replay/sample-historical-export.jsonl";
const DEFAULT_PRODUCT_ARTIFACT_PATH =
  "scripts/evals/golden/sample-product-critical-artifact.json";

function normalizeString(value, fallback = "") {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;
}

function parseArgs(argv = process.argv.slice(2), env = process.env) {
  const flags = new Map();
  for (const arg of argv) {
    if (!arg.startsWith("--")) continue;
    const withoutPrefix = arg.slice(2);
    const [key, rawValue] = withoutPrefix.split("=", 2);
    flags.set(key, rawValue ?? "true");
  }
  return {
    baselinePath: path.resolve(
      process.cwd(),
      normalizeString(
        flags.get("baseline") ?? env.EVAL_SYSTEM_BASELINE_PATH,
        DEFAULT_BASELINE_PATH,
      ),
    ),
    replayHistoricalCorpusPath: path.resolve(
      process.cwd(),
      normalizeString(
        flags.get("historical-corpus") ?? env.EVAL_SYSTEM_HISTORICAL_CORPUS_PATH,
        DEFAULT_HISTORICAL_CORPUS_PATH,
      ),
    ),
    replayHistoricalExportPath: path.resolve(
      process.cwd(),
      normalizeString(
        flags.get("historical-export") ?? env.EVAL_SYSTEM_HISTORICAL_EXPORT_PATH,
        DEFAULT_HISTORICAL_EXPORT_PATH,
      ),
    ),
    productArtifactPath: path.resolve(
      process.cwd(),
      normalizeString(
        flags.get("product-artifact") ?? env.EVAL_SYSTEM_PRODUCT_ARTIFACT_PATH,
        DEFAULT_PRODUCT_ARTIFACT_PATH,
      ),
    ),
  };
}

function loadBaseline(baselinePath) {
  return JSON.parse(readFileSync(baselinePath, "utf8"));
}

function compareSuiteAgainstBaseline(row, baselineEntry = {}) {
  const reasons = [];
  if (
    Number.isFinite(baselineEntry.minAverageScore) &&
    row.score < baselineEntry.minAverageScore
  ) {
    reasons.push("average_score_below_threshold");
  }
  if (
    Number.isFinite(baselineEntry.maxFailedCases) &&
    (row.failedCases ?? 0) > baselineEntry.maxFailedCases
  ) {
    reasons.push("failed_case_count_above_threshold");
  }
  if (
    Array.isArray(baselineEntry.requiredPrimaryFailureReasons) &&
    baselineEntry.requiredPrimaryFailureReasons.length > 0 &&
    !baselineEntry.requiredPrimaryFailureReasons.includes(row.primaryFailureReason)
  ) {
    reasons.push("unexpected_primary_failure_reason");
  }
  const familyThresholdFailures = [];
  if (row.suiteId === "social-sim-benchmark") {
    const thresholdMap = baselineEntry.familyThresholds ?? {};
    const familyMetrics = row.familyMetrics ?? {};
    for (const [family, threshold] of Object.entries(thresholdMap)) {
      const metric = familyMetrics?.[family];
      if (
        Number.isFinite(threshold?.minMeanConvergenceScore) &&
        Number(metric?.meanConvergenceScore ?? 0) < threshold.minMeanConvergenceScore
      ) {
        familyThresholdFailures.push(`${family}:mean_convergence_below_threshold`);
      }
    }
    if (familyThresholdFailures.length > 0) {
      reasons.push("social_sim_family_threshold_failed");
    }
  }
  return {
    passed: reasons.length === 0,
    reasons,
    familyThresholdFailures,
  };
}

function buildSuiteRow({
  suiteId,
  summary,
  runId,
  extra = {},
}) {
  return {
    caseId: suiteId,
    suiteId,
    status: summary.failedCases > 0 ? "failed" : "passed",
    score: Number.isFinite(summary.averageScore)
      ? summary.averageScore
      : Number.isFinite(summary.meanScore)
        ? summary.meanScore
        : 0,
    failedCases: summary.failedCases ?? 0,
    totalCases: summary.totalCases ?? 0,
    primaryFailureReason: summary.primaryFailureReason ?? "none",
    suiteArtifactRunId: runId,
    ...extra,
  };
}

export async function runSystemEvals(
  argv = process.argv.slice(2),
  env = process.env,
  deps = {
    runSocialSimBenchmarkMatrix,
    runProductCriticalGoldens,
    runReplayEvals,
  },
) {
  const config = parseArgs(argv, env);
  const baseline = loadBaseline(config.baselinePath);
  const envelope = createEvalRunEnvelope({
    evalSuite: "system-evals",
    evalType: "system",
    artifactRoot: env.EVAL_ARTIFACT_ROOT,
  });

  const suiteRows = [];
  const suiteSummaries = [];

  const socialSimResult = await deps.runSocialSimBenchmarkMatrix(
    [
      "--provider=stub",
      "--judge-provider=stub",
      "--benchmark-mode=1",
      "--dry-run=1",
      "--horizon=all",
      "--world-set=core",
      ...argv,
    ],
    {
      ...env,
      EVAL_ARTIFACT_ROOT: path.join(envelope.runDir, "suite-artifacts"),
    },
  );
  suiteSummaries.push({
    suiteId: "social-sim-benchmark",
    summary: socialSimResult.summary,
  });
  suiteRows.push(
    buildSuiteRow({
      suiteId: "social-sim-benchmark",
      summary: socialSimResult.summary,
      runId: socialSimResult.runId,
      extra: {
        meanScore: socialSimResult.summary.meanScore ?? 0,
        worstSeedScore: socialSimResult.summary.worstSeedScore ?? 0,
        familyMetrics: socialSimResult.summary.familyMetrics ?? {},
      },
    }),
  );

  const productResult = await deps.runProductCriticalGoldens(
    [`--artifact-path=${config.productArtifactPath}`, ...argv],
    {
      ...env,
      EVAL_ARTIFACT_ROOT: path.join(envelope.runDir, "suite-artifacts"),
    },
  );
  suiteSummaries.push({
    suiteId: "product-critical-goldens",
    summary: productResult.summary,
  });
  suiteRows.push(
    buildSuiteRow({
      suiteId: "product-critical-goldens",
      summary: productResult.summary,
      runId: productResult.runId,
      extra: {
        assertionsEvaluated: productResult.summary.assertionsEvaluated ?? false,
        dryRunBypassedAssertions: productResult.summary.dryRunBypassedAssertions ?? false,
      },
    }),
  );

  const replayRuns = [
    {
      suiteId: "replay-corpus",
      args: [],
    },
    {
      suiteId: "replay-historical-corpus",
      args: [`--corpus=${config.replayHistoricalCorpusPath}`],
    },
    {
      suiteId: "replay-historical-export",
      args: [
        "--source=historical-export",
        `--corpus=${config.replayHistoricalExportPath}`,
      ],
    },
  ];

  for (const replayRun of replayRuns) {
    const replayResult = await deps.runReplayEvals(replayRun.args, {
      ...env,
      EVAL_ARTIFACT_ROOT: path.join(envelope.runDir, "suite-artifacts"),
    });
    suiteSummaries.push({
      suiteId: replayRun.suiteId,
      summary: replayResult.summary,
    });
    suiteRows.push(
      buildSuiteRow({
        suiteId: replayRun.suiteId,
        summary: replayResult.summary,
        runId: replayResult.runId,
        extra: {
          replaySource: replayResult.summary.source ?? "corpus",
          corpusSuite: replayResult.summary.corpusSuite ?? null,
        },
      }),
    );
  }

  const thresholdResults = suiteRows.map((row) => {
    const comparison = compareSuiteAgainstBaseline(
      row,
      baseline?.suiteThresholds?.[row.suiteId] ?? {},
    );
    return {
      suiteId: row.suiteId,
      passed: comparison.passed,
      reasons: comparison.reasons,
      familyThresholdFailures: comparison.familyThresholdFailures ?? [],
    };
  });

  const failedThresholds = thresholdResults.filter((result) => !result.passed);
  const suiteRowsWithThresholds = suiteRows.map((row) => {
    const threshold = thresholdResults.find((result) => result.suiteId === row.suiteId);
    return {
      ...row,
      thresholdPassed: threshold?.passed ?? true,
      thresholdFailureReasons: threshold?.reasons ?? [],
      familyThresholdFailures: threshold?.familyThresholdFailures ?? [],
      status:
        row.status === "failed" || threshold?.passed === false ? "failed" : "passed",
    };
  });

  const rollup = summarizeCaseRows(suiteRowsWithThresholds);
  const overallThresholds = baseline?.overallThresholds ?? {};
  const overallFailures = [];
  if (
    Number.isFinite(overallThresholds.minAverageScore) &&
    rollup.averageScore < overallThresholds.minAverageScore
  ) {
    overallFailures.push("overall_average_score_below_threshold");
  }
  if (
    Number.isFinite(overallThresholds.maxFailedSuites) &&
    rollup.failedCases > overallThresholds.maxFailedSuites
  ) {
    overallFailures.push("failed_suite_count_above_threshold");
  }

  const summary = {
    ...rollup,
    suiteCount: suiteSummaries.length,
    suites: suiteSummaries,
    baselinePath: config.baselinePath,
    thresholdResults,
    thresholdFailures: failedThresholds,
    overallThresholds,
    overallThresholdFailures: overallFailures,
    passed:
      failedThresholds.length === 0 &&
      overallFailures.length === 0 &&
      rollup.failedCases === 0,
  };

  return finalizeEvalRun(envelope, summary, suiteRowsWithThresholds, {
    baseline,
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = await runSystemEvals();
  console.log(JSON.stringify(result.summary, null, 2));
  console.log(`artifact written to ${path.join(result.runDir, "run.json")}`);
}
