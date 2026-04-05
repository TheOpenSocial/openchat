import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";

import { runProductCriticalGoldens } from "./product-critical-goldens.mjs";

test("product critical golden runner writes a standard artifact in dry-run mode", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "product-goldens-"));
  const result = await runProductCriticalGoldens(["--dry-run=1"], {
    ...process.env,
    EVAL_ARTIFACT_ROOT: root,
  });
  const summary = JSON.parse(readFileSync(path.join(result.runDir, "summary.json"), "utf8"));
  const run = JSON.parse(readFileSync(path.join(result.runDir, "run.json"), "utf8"));

  assert.equal(summary.totalCases, 1);
  assert.equal(summary.failedCases, 0);
  assert.equal(run.evalSuite, "product-critical-goldens");
});

test("product critical golden runner records suite summary from agent test artifacts", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "product-goldens-live-"));
  const artifactPath = path.join(root, "eval.json");
  writeFileSync(
    artifactPath,
    JSON.stringify({
      summary: {
        caseCounts: {
          total: 1,
          passed: 1,
          failed: 0,
          skipped: 0,
        },
        recordCounts: {
          total: 19,
          passed: 19,
          failed: 0,
          skipped: 0
        },
        failureClasses: {},
      },
      records: [
        { scenarioId: "eval_planning_bounds_v1" },
        { scenarioId: "eval_injection_fallback_v1" },
        { scenarioId: "eval_moderation_fallback_v1" },
        { scenarioId: "eval_human_approval_policy_v1" },
        { scenarioId: "eval_failure_capture_v1" },
        { scenarioId: "eval_social_outcome_telemetry_v1" },
        { scenarioId: "eval_tone_agentic_async_ack_v1" },
        { scenarioId: "eval_usefulness_no_match_recovery_v1" },
        { scenarioId: "eval_grounding_profile_memory_consistency_v1" },
        { scenarioId: "eval_negotiation_quality_v1" },
        { scenarioId: "eval_workflow_runtime_traceability_v1" }
      ]
    }),
  );
  const result = await runProductCriticalGoldens([`--artifact-path=${artifactPath}`, "--layer=eval"], {
    ...process.env,
    EVAL_ARTIFACT_ROOT: root,
  });

  assert.equal(result.summary.layer, "eval");
  assert.ok(result.summary.suiteSummary);
  assert.equal(typeof result.summary.suiteSummary.caseCounts.total, "number");
  assert.deepEqual(result.summary.missingScenarioIds, []);
});

test("product critical golden runner fails when required scenarios are missing", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "product-goldens-missing-"));
  const artifactPath = path.join(root, "eval.json");
  writeFileSync(
    artifactPath,
    JSON.stringify({
      summary: {
        caseCounts: { total: 1, passed: 1, failed: 0, skipped: 0 },
        recordCounts: { total: 19, passed: 19, failed: 0, skipped: 0 },
        failureClasses: {},
      },
      records: [{ scenarioId: "eval_planning_bounds_v1" }],
    }),
  );
  const result = await runProductCriticalGoldens(
    [`--artifact-path=${artifactPath}`, "--layer=eval"],
    {
      ...process.env,
      EVAL_ARTIFACT_ROOT: root,
    },
  );

  assert.equal(result.summary.failedCases, 1);
  assert.equal(result.summary.primaryFailureReason, "missing_required_scenarios");
  assert.ok(result.summary.missingScenarioIds.length > 0);
});
