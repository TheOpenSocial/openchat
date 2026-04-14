import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtempSync, readFileSync } from "node:fs";

import {
  createEvalRunEnvelope,
  finalizeEvalRun,
} from "../shared/artifacts.mjs";
import { runGoldenEvals } from "./run-golden-evals.mjs";

test("shared eval artifacts write standard files", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "eval-artifacts-"));
  const envelope = createEvalRunEnvelope({
    evalSuite: "artifact-test",
    evalType: "golden",
    artifactRoot: root,
    runId: "artifact-test-run",
  });
  const result = finalizeEvalRun(
    envelope,
    { totalCases: 1, passedCases: 1, failedCases: 0, averageScore: 0.7 },
    [{ caseId: "case-1", status: "passed", score: 0.7 }],
  );

  const summary = JSON.parse(
    readFileSync(path.join(result.runDir, "summary.json"), "utf8"),
  );
  const run = JSON.parse(
    readFileSync(path.join(result.runDir, "run.json"), "utf8"),
  );
  const cases = readFileSync(path.join(result.runDir, "cases.jsonl"), "utf8")
    .trim()
    .split("\n");

  assert.equal(summary.averageScore, 0.7);
  assert.equal(run.evalSuite, "artifact-test");
  assert.equal(cases.length, 1);
});

test("golden eval runner executes social sim benchmark suite", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "golden-evals-"));
  const result = await runGoldenEvals(
    [
      "--suite=social-sim-benchmark",
      "--provider=stub",
      "--judge-provider=stub",
      "--benchmark-mode=1",
      "--dry-run=1",
      "--horizon=all",
      "--world-set=core",
    ],
    {
      ...process.env,
      EVAL_ARTIFACT_ROOT: root,
      SOCIAL_SIM_BENCHMARK_SEEDS: "17031,27031",
    },
  );

  assert.equal(result.summary.suiteCount, 1);
  assert.equal(result.summary.totalCases, 1);
  assert.equal(result.summary.suites[0].suite, "social-sim-benchmark");
  assert.deepEqual(result.summary.suites[0].summary.seeds, [17031, 27031]);
  assert.ok(result.summary.suites[0].summary.familyMetrics);
  const firstFamily = Object.values(
    result.summary.suites[0].summary.familyMetrics,
  )[0];
  assert.equal(typeof firstFamily?.meanConvergenceScore, "number");
  assert.equal(result.summary.suites[0].run.benchmarkConfig.concurrency, 1);
});

test("golden eval runner can execute social sim seeds concurrently", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "golden-evals-concurrent-"));
  const result = await runGoldenEvals(
    [
      "--suite=social-sim-benchmark",
      "--provider=stub",
      "--judge-provider=stub",
      "--benchmark-mode=1",
      "--dry-run=1",
      "--horizon=all",
      "--world-set=core",
    ],
    {
      ...process.env,
      EVAL_ARTIFACT_ROOT: root,
      SOCIAL_SIM_BENCHMARK_SEEDS: "17031,27031",
      SOCIAL_SIM_BENCHMARK_CONCURRENCY: "2",
    },
  );

  assert.equal(result.summary.suiteCount, 1);
  assert.deepEqual(result.summary.suites[0].summary.seeds, [17031, 27031]);
  assert.equal(result.summary.suites[0].run.benchmarkConfig.concurrency, 2);
});

test("golden eval runner can include product critical suite", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "golden-product-suite-"));
  const result = await runGoldenEvals(
    ["--suite=product-critical-goldens", "--dry-run=1"],
    {
      ...process.env,
      EVAL_ARTIFACT_ROOT: root,
    },
  );

  assert.equal(result.summary.suiteCount, 1);
  assert.equal(result.summary.suites[0].suite, "product-critical-goldens");
  assert.equal(result.summary.suites[0].summary.failedCases, 0);
});
