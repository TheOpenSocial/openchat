import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";

import { compareSystemBaseline } from "./compare-system-baseline.mjs";

test("compare system baseline reports deltas against latest accepted baseline", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "system-baseline-compare-"));
  const artifactRoot = path.join(root, "artifacts");
  mkdirSync(artifactRoot, { recursive: true });

  const baselinePath = path.join(root, "system-baseline.json");
  writeFileSync(
    baselinePath,
    JSON.stringify(
      {
        version: 1,
        suiteThresholds: {},
        overallThresholds: {},
      },
      null,
      2,
    ),
  );

  const historyPath = path.join(root, "system-baseline-history.json");
  writeFileSync(
    historyPath,
    JSON.stringify(
      {
        version: 1,
        acceptedRuns: [
          {
            id: "baseline-1",
            system: { averageScore: 0.9 },
            socialSimulation: { meanScore: 0.65 },
            suiteScores: {
              "social-sim-benchmark": 0.65,
              "replay-corpus": 1,
            },
          },
        ],
      },
      null,
      2,
    ),
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
        suiteCount: 2,
        failedCases: 0,
        thresholdFailures: [],
        overallThresholdFailures: [],
        usedLiveWorkflowReplay: false,
        thresholdResults: [],
        suites: [
          {
            suiteId: "social-sim-benchmark",
            summary: {
              meanScore: 0.698,
              averageScore: 0.698,
              familyMetrics: {},
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
      suiteArtifactRunId: null,
    })}\n${JSON.stringify({
      suiteId: "replay-corpus",
      score: 1,
      failedCases: 0,
      totalCases: 4,
      primaryFailureReason: "none",
      suiteArtifactRunId: null,
    })}\n`,
  );

  const result = compareSystemBaseline(
    [
      `--artifact-root=${artifactRoot}`,
      `--baseline=${baselinePath}`,
      `--history=${historyPath}`,
    ],
    process.env,
  );

  assert.equal(result.acceptedBaselineId, "baseline-1");
  assert.equal(result.systemDelta.delta, 0.05);
  assert.equal(result.systemDelta.status, "improved");
  assert.equal(result.socialSimulationDelta.delta, 0.048);
  const suiteDelta = result.suiteDeltas.find(
    (entry) => entry.suiteId === "social-sim-benchmark",
  );
  assert.equal(suiteDelta.status, "improved");
});
