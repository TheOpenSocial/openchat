import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";

import { runSystemEvals } from "./run-system-evals.mjs";

test("system eval runner composes simulated suites and baseline thresholds", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "system-evals-"));
  const baselinePath = path.join(root, "system-baseline.json");
  writeFileSync(
    baselinePath,
    JSON.stringify(
      {
        version: 1,
        suiteThresholds: {
          "social-sim-benchmark": {
            minAverageScore: 0.5,
            maxFailedCases: 1,
            familyThresholds: {
              recovery: { minMeanConvergenceScore: 0.7 }
            }
          },
          "product-critical-goldens": { minAverageScore: 1, maxFailedCases: 0 },
          "replay-corpus": { minAverageScore: 1, maxFailedCases: 0 },
          "replay-historical-corpus": { minAverageScore: 1, maxFailedCases: 0 },
          "replay-historical-export": { minAverageScore: 1, maxFailedCases: 0 },
          "replay-sanitized-runtime-export": { minAverageScore: 1, maxFailedCases: 0 }
        },
        overallThresholds: {
          minAverageScore: 0.9,
          maxFailedSuites: 0
        }
      },
      null,
      2,
    ),
  );

  const result = await runSystemEvals(
    [`--baseline=${baselinePath}`],
    {
      ...process.env,
      EVAL_ARTIFACT_ROOT: path.join(root, "artifacts"),
    },
    {
      async runSocialSimBenchmarkMatrix() {
        return {
          runId: "social-sim-run",
          summary: {
            totalCases: 2,
            failedCases: 1,
            averageScore: 0.7,
            meanScore: 0.7,
            primaryFailureReason: "group_closure_miss",
            worstSeedScore: 0.52,
            familyMetrics: {
              recovery: {
                meanConvergenceScore: 0.84
              }
            }
          },
        };
      },
      async runProductCriticalGoldens() {
        return {
          runId: "product-run",
          summary: {
            totalCases: 1,
            failedCases: 0,
            averageScore: 1,
            primaryFailureReason: "none",
            assertionsEvaluated: true,
            dryRunBypassedAssertions: false,
          },
        };
      },
      async runReplayEvals(argv) {
        const suiteId = argv.includes("--source=historical-export")
          ? argv.some((arg) => arg.includes("sample-sanitized-runtime-export"))
            ? "sanitized-runtime-export"
            : "historical-export"
          : argv.some((arg) => arg.includes("sample-historical-replay-corpus"))
            ? "historical-corpus"
            : "corpus";
        return {
          runId: `replay-${suiteId}`,
          summary: {
            totalCases: 2,
            failedCases: 0,
            averageScore: 1,
            primaryFailureReason: "none",
            source: suiteId === "historical-export" ? "historical-export" : "corpus",
            corpusSuite:
              suiteId === "historical-corpus"
                ? "sample-historical-replay-corpus"
                : suiteId === "historical-export"
                  ? "sample-historical-export"
                  : suiteId === "sanitized-runtime-export"
                    ? "sample-sanitized-runtime-export"
                  : "sample-replay-corpus",
          },
        };
      },
      async runLiveSanitizedWorkflowReplay() {
        throw new Error("live workflow replay should not run in default system gate mode");
      },
    },
  );

  const summary = JSON.parse(readFileSync(path.join(result.runDir, "summary.json"), "utf8"));
  assert.equal(summary.suiteCount, 6);
  assert.equal(summary.thresholdFailures.length, 0);
  assert.equal(summary.overallThresholdFailures.length, 1);
  assert.equal(summary.usedLiveWorkflowReplay, false);
  assert.equal(summary.passed, false);
  const socialSimRow = readFileSync(path.join(result.runDir, "cases.jsonl"), "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line))
    .find((row) => row.suiteId === "social-sim-benchmark");
  assert.equal(socialSimRow.thresholdPassed, true);
  assert.equal(socialSimRow.failedCases, 1);
  assert.deepEqual(socialSimRow.familyThresholdFailures, []);
});

test("system eval runner fails thresholded suites explicitly", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "system-evals-fail-"));
  const baselinePath = path.join(root, "system-baseline.json");
  writeFileSync(
    baselinePath,
    JSON.stringify(
      {
        version: 1,
        suiteThresholds: {
          "social-sim-benchmark": {
            familyThresholds: {
              recovery: { minMeanConvergenceScore: 0.95 }
            }
          },
          "replay-corpus": { minAverageScore: 1, maxFailedCases: 0 },
          "replay-sanitized-runtime-export": { minAverageScore: 1, maxFailedCases: 0 }
        },
        overallThresholds: {
          minAverageScore: 0.95,
          maxFailedSuites: 0
        }
      },
      null,
      2,
    ),
  );

  const result = await runSystemEvals(
    [`--baseline=${baselinePath}`],
    {
      ...process.env,
      EVAL_ARTIFACT_ROOT: path.join(root, "artifacts"),
    },
    {
      async runSocialSimBenchmarkMatrix() {
        return {
          runId: "social-sim-run",
          summary: {
            totalCases: 1,
            failedCases: 0,
            averageScore: 1,
            meanScore: 1,
            primaryFailureReason: "none",
            familyMetrics: {
              recovery: {
                meanConvergenceScore: 0.8
              }
            }
          },
        };
      },
      async runProductCriticalGoldens() {
        return {
          runId: "product-run",
          summary: {
            totalCases: 1,
            failedCases: 0,
            averageScore: 1,
            primaryFailureReason: "none",
            assertionsEvaluated: true,
            dryRunBypassedAssertions: false,
          },
        };
      },
      async runReplayEvals(argv) {
        const isCorpus = argv.length === 0;
        return {
          runId: `replay-${argv.join("-") || "corpus"}`,
          summary: {
            totalCases: 1,
            failedCases: isCorpus ? 1 : 0,
            averageScore: isCorpus ? 0.5 : 1,
            primaryFailureReason: isCorpus ? "wrong_tool_choice" : "none",
            source: argv.includes("--source=historical-export") ? "historical-export" : "corpus",
            corpusSuite: "fixture",
          },
        };
      },
      async runLiveSanitizedWorkflowReplay() {
        throw new Error("live workflow replay should not run in threshold failure unit test");
      },
    },
  );

  assert.equal(result.summary.passed, false);
  assert.equal(result.summary.thresholdFailures.length, 2);
  const socialFailure = result.summary.thresholdFailures.find(
    (entry) => entry.suiteId === "social-sim-benchmark",
  );
  const replayFailure = result.summary.thresholdFailures.find(
    (entry) => entry.suiteId === "replay-corpus",
  );
  assert.ok(socialFailure.reasons.includes("social_sim_family_threshold_failed"));
  assert.ok(
    socialFailure.familyThresholdFailures.includes(
      "recovery:mean_convergence_below_threshold",
    ),
  );
  assert.ok(replayFailure.reasons.includes("average_score_below_threshold"));
});

test("system eval runner can use live sanitized workflow replay instead of static sanitized pack", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "system-evals-live-workflow-"));
  const baselinePath = path.join(root, "system-baseline.json");
  writeFileSync(
    baselinePath,
    JSON.stringify(
      {
        version: 1,
        suiteThresholds: {
          "social-sim-benchmark": { minAverageScore: 0.5, maxFailedCases: 1 },
          "product-critical-goldens": { minAverageScore: 1, maxFailedCases: 0 },
          "replay-corpus": { minAverageScore: 1, maxFailedCases: 0 },
          "replay-historical-corpus": { minAverageScore: 1, maxFailedCases: 0 },
          "replay-historical-export": { minAverageScore: 1, maxFailedCases: 0 },
          "replay-sanitized-runtime-export": { minAverageScore: 1, maxFailedCases: 0 }
        },
        overallThresholds: {
          minAverageScore: 0.9,
          maxFailedSuites: 0
        }
      },
      null,
      2,
    ),
  );

  let liveCalled = false;
  const result = await runSystemEvals(
    [`--baseline=${baselinePath}`, "--live-workflow-replay=1"],
    {
      ...process.env,
      EVAL_ARTIFACT_ROOT: path.join(root, "artifacts"),
    },
    {
      async runSocialSimBenchmarkMatrix() {
        return {
          runId: "social-sim-run",
          summary: {
            totalCases: 1,
            failedCases: 0,
            averageScore: 1,
            meanScore: 1,
            primaryFailureReason: "none",
            familyMetrics: {},
          },
        };
      },
      async runProductCriticalGoldens() {
        return {
          runId: "product-run",
          summary: {
            totalCases: 1,
            failedCases: 0,
            averageScore: 1,
            primaryFailureReason: "none",
            assertionsEvaluated: true,
            dryRunBypassedAssertions: false,
          },
        };
      },
      async runReplayEvals(argv) {
        return {
          runId: `replay-${argv.join("-") || "corpus"}`,
          summary: {
            totalCases: 1,
            failedCases: 0,
            averageScore: 1,
            primaryFailureReason: "none",
            source: argv.includes("--source=historical-export") ? "historical-export" : "corpus",
            corpusSuite: "fixture",
          },
        };
      },
      async runLiveSanitizedWorkflowReplay() {
        liveCalled = true;
        return {
          fetch: {
            baseUrl: "https://example.test",
          },
          sanitizedExportPath: path.join(root, "live.sanitized.jsonl"),
          replay: {
            runId: "live-replay-run",
            summary: {
              totalCases: 2,
              failedCases: 0,
              averageScore: 1,
              primaryFailureReason: "none",
              source: "historical-export",
              corpusSuite: "live-sanitized-workflow-replay",
            },
          },
        };
      },
    },
  );

  assert.equal(liveCalled, true);
  assert.equal(result.summary.usedLiveWorkflowReplay, true);
  const liveRow = readFileSync(path.join(result.runDir, "cases.jsonl"), "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line))
    .find((row) => row.suiteId === "replay-sanitized-runtime-export");
  assert.equal(liveRow.corpusSuite, "live-sanitized-workflow-replay");
  assert.equal(liveRow.liveFetchBaseUrl, "https://example.test");
});
