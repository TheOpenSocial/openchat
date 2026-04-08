#!/usr/bin/env node

import { readFileSync } from "node:fs";
import path from "node:path";

import {
  createEvalRunEnvelope,
  finalizeEvalRun,
  summarizeCaseRows,
} from "../shared/artifacts.mjs";
import { resolveSharedAdminEnv } from "../shared/env.mjs";
import { runSocialSimBenchmarkMatrix } from "../golden/social-sim-benchmark.mjs";
import { runProductCriticalGoldens } from "../golden/product-critical-goldens.mjs";
import { runReplayEvals } from "../replay/run-replay-evals.mjs";
import { runLiveSanitizedWorkflowReplay } from "../replay/run-live-sanitized-workflow-replay.mjs";

const DEFAULT_BASELINE_PATH = "scripts/evals/system/system-baseline.json";
const DEFAULT_HISTORICAL_CORPUS_PATH =
  "scripts/evals/replay/sample-historical-replay-corpus.json";
const DEFAULT_HISTORICAL_EXPORT_PATH =
  "scripts/evals/replay/sample-historical-export.jsonl";
const DEFAULT_PRODUCT_ARTIFACT_PATH =
  "scripts/evals/golden/sample-product-critical-artifact.json";
const DEFAULT_SANITIZED_RUNTIME_EXPORT_PATH =
  "scripts/evals/replay/sample-sanitized-runtime-export.jsonl";
const DEFAULT_STAGE_HEARTBEAT_MS = 30000;

function normalizeString(value, fallback = "") {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : fallback;
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
        flags.get("historical-corpus") ??
          env.EVAL_SYSTEM_HISTORICAL_CORPUS_PATH,
        DEFAULT_HISTORICAL_CORPUS_PATH,
      ),
    ),
    replayHistoricalExportPath: path.resolve(
      process.cwd(),
      normalizeString(
        flags.get("historical-export") ??
          env.EVAL_SYSTEM_HISTORICAL_EXPORT_PATH,
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
    sanitizedRuntimeExportPath: path.resolve(
      process.cwd(),
      normalizeString(
        flags.get("sanitized-runtime-export") ??
          env.EVAL_SYSTEM_SANITIZED_RUNTIME_EXPORT_PATH,
        DEFAULT_SANITIZED_RUNTIME_EXPORT_PATH,
      ),
    ),
    useLiveWorkflowReplay:
      normalizeString(
        flags.get("live-workflow-replay") ??
          env.EVAL_SYSTEM_LIVE_WORKFLOW_REPLAY,
        "0",
      ) === "1",
    useLiveSocialSim:
      normalizeString(
        flags.get("live-social-sim") ?? env.EVAL_SYSTEM_LIVE_SOCIAL_SIM,
        "0",
      ) === "1",
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
    !baselineEntry.requiredPrimaryFailureReasons.includes(
      row.primaryFailureReason,
    )
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
        Number(metric?.meanConvergenceScore ?? 0) <
          threshold.minMeanConvergenceScore
      ) {
        familyThresholdFailures.push(
          `${family}:mean_convergence_below_threshold`,
        );
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

function buildSuiteRow({ suiteId, summary, runId, extra = {} }) {
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

function buildConfidenceRows({
  usedLiveWorkflowReplay,
  usedLiveSocialSim,
  socialSimDeterministic,
  socialSimLive,
  summary,
}) {
  return [
    {
      id: "deterministic_regression_confidence",
      level:
        summary.passed === true && (summary.failedCases ?? 0) === 0
          ? "high"
          : "medium",
      basis:
        "Deterministic system gate with thresholded synthetic suites and fixed social-sim seeds.",
    },
    {
      id: "live_replay_confidence",
      level: usedLiveWorkflowReplay ? "medium" : "low",
      basis: usedLiveWorkflowReplay
        ? "Live fetched + sanitized workflow replay passed against staging traces."
        : "No live workflow replay evidence included in this system run.",
    },
    {
      id: "social_realism_confidence",
      level: usedLiveSocialSim ? "medium" : "low",
      basis: usedLiveSocialSim
        ? `Live provider-backed social-sim lane included with mean score ${Number(
            socialSimLive?.meanScore ?? socialSimLive?.averageScore ?? 0,
          ).toFixed(3)}.`
        : `Only deterministic social-sim evidence is present with mean score ${Number(
            socialSimDeterministic?.meanScore ??
              socialSimDeterministic?.averageScore ??
              0,
          ).toFixed(3)}.`,
    },
    {
      id: "real_world_correlation_confidence",
      level: "low",
      basis:
        "No production outcome correlation model is wired into the matrix yet.",
    },
  ];
}

function formatDuration(ms) {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
}

function logStage(event, stageId, detail = "") {
  const timestamp = new Date().toISOString();
  const suffix = detail ? ` ${detail}` : "";
  console.log(`[system-evals][${timestamp}][${event}] ${stageId}${suffix}`);
}

async function runStage(stageId, fn, heartbeatMs = DEFAULT_STAGE_HEARTBEAT_MS) {
  const startedAt = Date.now();
  logStage("start", stageId);
  const interval = setInterval(() => {
    logStage(
      "heartbeat",
      stageId,
      `(elapsed ${formatDuration(Date.now() - startedAt)})`,
    );
  }, heartbeatMs);
  interval.unref?.();

  try {
    const result = await fn();
    logStage(
      "done",
      stageId,
      `(elapsed ${formatDuration(Date.now() - startedAt)})`,
    );
    return result;
  } catch (error) {
    logStage(
      "failed",
      stageId,
      `(elapsed ${formatDuration(Date.now() - startedAt)}): ${error instanceof Error ? error.message : String(error)}`,
    );
    throw error;
  } finally {
    clearInterval(interval);
  }
}

export async function runSystemEvals(
  argv = process.argv.slice(2),
  env = process.env,
  deps = {
    runSocialSimBenchmarkMatrix,
    runProductCriticalGoldens,
    runReplayEvals,
    runLiveSanitizedWorkflowReplay,
  },
) {
  const config = parseArgs(argv, env);
  const baseline = loadBaseline(config.baselinePath);
  const envelope = createEvalRunEnvelope({
    evalSuite: "system-evals",
    evalType: "system",
    artifactRoot: env.EVAL_ARTIFACT_ROOT,
  });
  logStage(
    "init",
    "system-evaluation-matrix",
    `artifactRoot=${envelope.runDir}`,
  );

  const suiteRows = [];
  const suiteSummaries = [];
  const sharedAdmin = resolveSharedAdminEnv(env);

  const socialSimResult = await runStage("social-sim-deterministic", () =>
    deps.runSocialSimBenchmarkMatrix(
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
    ),
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

  let liveSocialSimResult = null;
  if (config.useLiveSocialSim) {
    liveSocialSimResult = await runStage("social-sim-live-provider", () =>
      deps.runSocialSimBenchmarkMatrix(
        [
          "--benchmark-mode=1",
          "--horizon=all",
          "--world-set=core",
          `--provider=${normalizeString(env.EVAL_SYSTEM_LIVE_SOCIAL_SIM_PROVIDER, "ollama")}`,
          `--judge-provider=${normalizeString(
            env.EVAL_SYSTEM_LIVE_SOCIAL_SIM_JUDGE_PROVIDER,
            "stub",
          )}`,
          "--use-remote-provider=1",
          `--use-remote-judge=${normalizeString(
            env.EVAL_SYSTEM_LIVE_SOCIAL_SIM_USE_REMOTE_JUDGE,
            "0",
          )}`,
          "--fail-on-remote-fallback=1",
          "--base-url=" + sharedAdmin.baseUrl,
          "--admin-user-id=" + sharedAdmin.adminUserId,
          "--admin-role=" + sharedAdmin.adminRole,
          "--admin-api-key=" + sharedAdmin.adminApiKey,
          ...argv,
        ],
        {
          ...env,
          SOCIAL_SIM_BASE_URL: sharedAdmin.baseUrl,
          SOCIAL_SIM_ADMIN_USER_ID: sharedAdmin.adminUserId,
          SOCIAL_SIM_ADMIN_ROLE: sharedAdmin.adminRole,
          SOCIAL_SIM_ADMIN_API_KEY: sharedAdmin.adminApiKey,
          EVAL_ARTIFACT_ROOT: path.join(envelope.runDir, "suite-artifacts"),
        },
      ),
    );
    suiteSummaries.push({
      suiteId: "social-sim-live-benchmark",
      summary: liveSocialSimResult.summary,
    });
    suiteRows.push(
      buildSuiteRow({
        suiteId: "social-sim-live-benchmark",
        summary: liveSocialSimResult.summary,
        runId: liveSocialSimResult.runId,
        extra: {
          meanScore: liveSocialSimResult.summary.meanScore ?? 0,
          worstSeedScore: liveSocialSimResult.summary.worstSeedScore ?? 0,
          familyMetrics: liveSocialSimResult.summary.familyMetrics ?? {},
          effectiveBackendModes:
            liveSocialSimResult.summary.effectiveBackendModes ?? [],
          realismLane: "live-provider",
        },
      }),
    );
  }

  const productResult = await runStage("product-critical-goldens", () =>
    deps.runProductCriticalGoldens(
      [`--artifact-path=${config.productArtifactPath}`, ...argv],
      {
        ...env,
        EVAL_ARTIFACT_ROOT: path.join(envelope.runDir, "suite-artifacts"),
      },
    ),
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
        dryRunBypassedAssertions:
          productResult.summary.dryRunBypassedAssertions ?? false,
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
    {
      suiteId: "replay-sanitized-runtime-export",
      args: [
        "--source=historical-export",
        `--corpus=${config.sanitizedRuntimeExportPath}`,
      ],
    },
  ];

  for (const replayRun of replayRuns) {
    if (
      config.useLiveWorkflowReplay &&
      replayRun.suiteId === "replay-sanitized-runtime-export"
    ) {
      const liveWorkflowReplayResult = await runStage(replayRun.suiteId, () =>
        deps.runLiveSanitizedWorkflowReplay(
          [
            `--export-output=${path.join(
              envelope.runDir,
              "suite-artifacts",
              "live-workflow-replay-export.json",
            )}`,
            `--sanitized-output=${path.join(
              envelope.runDir,
              "suite-artifacts",
              "live-workflow-replay-export.sanitized.jsonl",
            )}`,
          ],
          env,
        ),
      );
      suiteSummaries.push({
        suiteId: replayRun.suiteId,
        summary: liveWorkflowReplayResult.replay.summary,
      });
      suiteRows.push(
        buildSuiteRow({
          suiteId: replayRun.suiteId,
          summary: liveWorkflowReplayResult.replay.summary,
          runId: liveWorkflowReplayResult.replay.runId,
          extra: {
            replaySource:
              liveWorkflowReplayResult.replay.summary.source ??
              "historical-export",
            corpusSuite:
              liveWorkflowReplayResult.replay.summary.corpusSuite ?? null,
            liveFetchBaseUrl: liveWorkflowReplayResult.fetch.baseUrl ?? null,
            sanitizedExportPath: liveWorkflowReplayResult.sanitizedExportPath,
          },
        }),
      );
      continue;
    }

    const replayResult = await runStage(replayRun.suiteId, () =>
      deps.runReplayEvals(replayRun.args, {
        ...env,
        EVAL_ARTIFACT_ROOT: path.join(envelope.runDir, "suite-artifacts"),
      }),
    );
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
    const threshold = thresholdResults.find(
      (result) => result.suiteId === row.suiteId,
    );
    return {
      ...row,
      thresholdPassed: threshold?.passed ?? true,
      thresholdFailureReasons: threshold?.reasons ?? [],
      familyThresholdFailures: threshold?.familyThresholdFailures ?? [],
      status:
        row.status === "failed" || threshold?.passed === false
          ? "failed"
          : "passed",
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
    usedLiveWorkflowReplay: config.useLiveWorkflowReplay,
    usedLiveSocialSim: config.useLiveSocialSim,
    confidenceRows: buildConfidenceRows({
      usedLiveWorkflowReplay: config.useLiveWorkflowReplay,
      usedLiveSocialSim: config.useLiveSocialSim,
      socialSimDeterministic: socialSimResult.summary,
      socialSimLive: liveSocialSimResult?.summary ?? null,
      summary: {
        passed:
          failedThresholds.length === 0 &&
          overallFailures.length === 0 &&
          rollup.failedCases === 0,
        failedCases: rollup.failedCases,
      },
    }),
    passed:
      failedThresholds.length === 0 &&
      overallFailures.length === 0 &&
      rollup.failedCases === 0,
  };

  logStage(
    "summary",
    "system-evaluation-matrix",
    `passed=${summary.passed} averageScore=${Number(summary.averageScore ?? 0).toFixed(3)} failedSuites=${summary.failedCases}`,
  );

  return finalizeEvalRun(envelope, summary, suiteRowsWithThresholds, {
    baseline,
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = await runSystemEvals();
  console.log(JSON.stringify(result.summary, null, 2));
  console.log(`artifact written to ${path.join(result.runDir, "run.json")}`);
}
