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
            system: { averageScore: 0.9, gateScore: 0.92 },
            socialSimulation: { meanScore: 0.65 },
            liveSocialSimulation: { meanScore: 0.7 },
            suiteScores: {
              "social-sim-benchmark": 0.65,
              "social-sim-live-benchmark": 0.7,
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
        usedLiveSocialSim: true,
        gateScore: 0.94,
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
          {
            suiteId: "social-sim-live-benchmark",
            summary: {
              meanScore: 0.731,
              averageScore: 0.731,
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
      suiteId: "social-sim-live-benchmark",
      score: 0.731,
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
  assert.equal(result.gateScoreDelta.delta, 0.02);
  assert.equal(result.gateScoreDelta.status, "improved");
  assert.equal(result.socialSimulationDelta.delta, 0.048);
  assert.equal(result.liveSocialSimulationDelta.delta, 0.031);
  const suiteDelta = result.suiteDeltas.find(
    (entry) => entry.suiteId === "social-sim-benchmark",
  );
  assert.equal(suiteDelta.status, "improved");
  const liveSuiteDelta = result.suiteDeltas.find(
    (entry) => entry.suiteId === "social-sim-live-benchmark",
  );
  assert.equal(liveSuiteDelta.status, "improved");
  assert.deepEqual(result.regressions, []);
  assert.equal(result.passed, true);
});

test("compare system baseline reports live regression explicitly", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "system-baseline-compare-regression-"));
  const artifactRoot = path.join(root, "artifacts");
  mkdirSync(artifactRoot, { recursive: true });

  const baselinePath = path.join(root, "system-baseline.json");
  writeFileSync(
    baselinePath,
    JSON.stringify({ version: 1, suiteThresholds: {}, overallThresholds: {} }, null, 2),
  );

  const historyPath = path.join(root, "system-baseline-history.json");
  writeFileSync(
    historyPath,
    JSON.stringify(
      {
        version: 1,
        acceptedRuns: [
          {
            id: "baseline-live",
            system: { averageScore: 0.924, gateScore: 0.956 },
            socialSimulation: { meanScore: 0.74 },
            liveSocialSimulation: { meanScore: 0.731 },
            suiteScores: {
              "social-sim-benchmark": 0.74,
              "social-sim-live-benchmark": 0.731,
            },
          },
        ],
      },
      null,
      2,
    ),
  );

  const systemRunDir = path.join(artifactRoot, "system-evals-2026-04-09T00-00-00-000Z");
  mkdirSync(systemRunDir, { recursive: true });
  writeFileSync(
    path.join(systemRunDir, "summary.json"),
    JSON.stringify(
      {
        passed: true,
        averageScore: 0.9,
        gateScore: 0.93,
        suiteCount: 2,
        failedCases: 0,
        thresholdFailures: [],
        overallThresholdFailures: [],
        usedLiveWorkflowReplay: true,
        usedLiveSocialSim: true,
        thresholdResults: [],
        suites: [
          {
            suiteId: "social-sim-benchmark",
            summary: { meanScore: 0.74, averageScore: 0.74, familyMetrics: {} },
          },
          {
            suiteId: "social-sim-live-benchmark",
            summary: { meanScore: 0.7, averageScore: 0.7, familyMetrics: {} },
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
      score: 0.74,
      failedCases: 0,
      totalCases: 3,
      primaryFailureReason: "none",
      suiteArtifactRunId: null,
    })}\n${JSON.stringify({
      suiteId: "social-sim-live-benchmark",
      score: 0.7,
      failedCases: 0,
      totalCases: 3,
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

  assert.equal(result.passed, false);
  assert.ok(
    result.regressions.some((entry) => entry.includes("social-sim live mean regressed")),
  );
  assert.ok(result.regressions.some((entry) => entry.includes("gateScore regressed")));
});
