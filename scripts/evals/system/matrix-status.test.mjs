import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";

import { buildSystemMatrixStatus } from "./matrix-status.mjs";

test("matrix status resolves latest system run and suite artifact locations", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "matrix-status-"));
  const artifactRoot = path.join(root, "artifacts");
  mkdirSync(artifactRoot, { recursive: true });

  const baselinePath = path.join(root, "system-baseline.json");
  writeFileSync(
    baselinePath,
    JSON.stringify(
      {
        version: 1,
        suiteThresholds: {
          "social-sim-benchmark": { minAverageScore: 0.55, maxFailedCases: 1 },
        },
        overallThresholds: { minAverageScore: 0.9, maxFailedSuites: 0 },
      },
      null,
      2,
    ),
  );

  const socialRunDir = path.join(
    artifactRoot,
    "social-sim-benchmark-2026-04-08T00-00-00-000Z",
  );
  mkdirSync(socialRunDir, { recursive: true });
  writeFileSync(
    path.join(socialRunDir, "summary.json"),
    JSON.stringify({ averageScore: 0.7 }, null, 2),
  );

  const systemRunDir = path.join(
    artifactRoot,
    "system-evals-2026-04-08T00-01-00-000Z",
  );
  mkdirSync(systemRunDir, { recursive: true });
  writeFileSync(
    path.join(systemRunDir, "summary.json"),
    JSON.stringify(
      {
        passed: true,
        averageScore: 0.95,
        suiteCount: 1,
        failedCases: 0,
        thresholdFailures: [],
        overallThresholdFailures: [],
        usedLiveWorkflowReplay: true,
        thresholdResults: [
          {
            suiteId: "social-sim-benchmark",
            passed: true,
            reasons: [],
            familyThresholdFailures: [],
          },
        ],
        suites: [
          {
            suiteId: "social-sim-benchmark",
            summary: {
              averageScore: 0.698,
              meanScore: 0.698,
              scoreStdDev: 0.006,
              worstSeedScore: 0.69,
              worstSeed: 37031,
              meanOracleScore: 0.98,
              meanOracleProgressScore: 0.841,
              familyMetrics: {
                recovery: { meanConvergenceScore: 0.842 },
              },
              effectiveBackendModes: ["offline"],
            },
          },
        ],
      },
      null,
      2,
    ),
  );
  writeFileSync(
    path.join(systemRunDir, "cases.jsonl"),
    `${JSON.stringify({
      suiteId: "social-sim-benchmark",
      score: 0.698,
      failedCases: 0,
      totalCases: 3,
      primaryFailureReason: "none",
      suiteArtifactRunId: path.basename(socialRunDir),
    })}\n`,
  );

  const result = buildSystemMatrixStatus(
    [`--artifact-root=${artifactRoot}`, `--baseline=${baselinePath}`],
    process.env,
  );

  assert.equal(result.overallStatus, "passed");
  assert.equal(result.system.passed, true);
  assert.equal(result.system.usedLiveWorkflowReplay, true);
  assert.equal(result.socialSimulation.meanScore, 0.698);
  assert.equal(result.suiteMatrix.length, 1);
  assert.equal(result.suiteMatrix[0].status, "passed");
  assert.equal(
    result.suiteMatrix[0].artifactSummaryPath,
    path.join(socialRunDir, "summary.json"),
  );
});
