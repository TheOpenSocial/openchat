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
      cases: [
        { id: "agentic-evals-snapshot", status: "passed" },
      ],
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
        { scenarioId: "eval_planning_bounds_v1", status: "passed" },
        { scenarioId: "eval_injection_fallback_v1", status: "passed" },
        { scenarioId: "eval_moderation_fallback_v1", status: "passed" },
        { scenarioId: "eval_human_approval_policy_v1", status: "passed" },
        { scenarioId: "eval_failure_capture_v1", status: "passed" },
        { scenarioId: "eval_social_outcome_telemetry_v1", status: "passed" },
        { scenarioId: "eval_tone_agentic_async_ack_v1", status: "passed" },
        { scenarioId: "eval_usefulness_no_match_recovery_v1", status: "passed" },
        { scenarioId: "eval_grounding_profile_memory_consistency_v1", status: "passed" },
        { scenarioId: "eval_negotiation_quality_v1", status: "passed" },
        { scenarioId: "eval_workflow_runtime_traceability_v1", status: "passed" }
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
      cases: [
        { id: "agentic-evals-snapshot", status: "passed" },
      ],
      summary: {
        caseCounts: { total: 1, passed: 1, failed: 0, skipped: 0 },
        recordCounts: { total: 19, passed: 19, failed: 0, skipped: 0 },
        failureClasses: {},
      },
      records: [{ scenarioId: "eval_planning_bounds_v1", status: "passed" }],
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
  assert.equal(result.summary.primaryFailureReason, "required_scenarios_not_passing");
  assert.ok(result.summary.missingPassedScenarioIds.length > 0);
});

test("product critical golden runner fails when required checks are missing", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "product-goldens-missing-check-"));
  const artifactPath = path.join(root, "eval.json");
  writeFileSync(
    artifactPath,
    JSON.stringify({
      cases: [
        { id: "wrong-check", status: "passed" },
      ],
      summary: {
        caseCounts: { total: 1, passed: 1, failed: 0, skipped: 0 },
        recordCounts: { total: 19, passed: 19, failed: 0, skipped: 0 },
        failureClasses: {},
      },
      records: [
        { scenarioId: "eval_planning_bounds_v1", status: "passed" },
        { scenarioId: "eval_injection_fallback_v1", status: "passed" },
        { scenarioId: "eval_moderation_fallback_v1", status: "passed" },
        { scenarioId: "eval_human_approval_policy_v1", status: "passed" },
        { scenarioId: "eval_failure_capture_v1", status: "passed" },
        { scenarioId: "eval_social_outcome_telemetry_v1", status: "passed" },
        { scenarioId: "eval_tone_agentic_async_ack_v1", status: "passed" },
        { scenarioId: "eval_usefulness_no_match_recovery_v1", status: "passed" },
        { scenarioId: "eval_grounding_profile_memory_consistency_v1", status: "passed" },
        { scenarioId: "eval_negotiation_quality_v1", status: "passed" },
        { scenarioId: "eval_workflow_runtime_traceability_v1", status: "passed" },
      ],
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
  assert.equal(result.summary.primaryFailureReason, "missing_required_checks");
  assert.deepEqual(result.summary.missingCheckIds, ["agentic-evals-snapshot"]);
});

test("product critical golden runner fails when forbidden failure classes are present", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "product-goldens-failure-class-"));
  const artifactPath = path.join(root, "eval.json");
  const manifestPath = path.join(root, "manifest.json");
  writeFileSync(
    manifestPath,
    JSON.stringify({
      version: 1,
      layers: {
        eval: {
          minCaseCount: 1,
          minRecordCount: 1,
          maxFailedCases: 0,
          maxFailedRecords: 0,
          requiredCheckIds: ["agentic-evals-snapshot"],
          forbiddenFailureClasses: ["queue_or_replay"],
          requiredScenarioIds: ["eval_planning_bounds_v1"],
        },
      },
    }),
  );
  writeFileSync(
    artifactPath,
    JSON.stringify({
      cases: [
        { id: "agentic-evals-snapshot", status: "failed" },
      ],
      summary: {
        caseCounts: { total: 1, passed: 0, failed: 1, skipped: 0 },
        recordCounts: { total: 1, passed: 0, failed: 1, skipped: 0 },
        failureClasses: { queue_or_replay: 1 },
      },
      records: [{ scenarioId: "eval_planning_bounds_v1", status: "failed" }],
    }),
  );

  const result = await runProductCriticalGoldens(
    [`--artifact-path=${artifactPath}`, "--layer=eval", `--manifest=${manifestPath}`],
    {
      ...process.env,
      EVAL_ARTIFACT_ROOT: root,
    },
  );

  assert.equal(result.summary.failedCases, 1);
  assert.equal(result.summary.primaryFailureReason, "too_many_failed_cases");
  assert.deepEqual(result.summary.forbiddenFailureClassMatches, ["queue_or_replay"]);
});

test("product critical golden runner fails when required checks are present but not passing", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "product-goldens-nonpassing-check-"));
  const artifactPath = path.join(root, "eval.json");
  const manifestPath = path.join(root, "manifest.json");
  writeFileSync(
    manifestPath,
    JSON.stringify({
      version: 1,
      layers: {
        eval: {
          minCaseCount: 1,
          minRecordCount: 19,
          maxFailedCases: 1,
          maxFailedRecords: 1,
          requiredCheckIds: ["agentic-evals-snapshot"],
          requiredPassedCheckIds: ["agentic-evals-snapshot"],
          forbiddenFailureClasses: [],
          requiredScenarioIds: ["eval_planning_bounds_v1"],
          requiredPassedScenarioIds: ["eval_moderation_fallback_v1"]
        },
      },
    }),
  );
  writeFileSync(
    artifactPath,
    JSON.stringify({
      cases: [
        { id: "agentic-evals-snapshot", status: "failed" },
      ],
      summary: {
        caseCounts: { total: 1, passed: 0, failed: 1, skipped: 0 },
        recordCounts: { total: 19, passed: 18, failed: 1, skipped: 0 },
        failureClasses: {},
      },
      records: [
        { scenarioId: "eval_planning_bounds_v1", status: "passed" },
        { scenarioId: "eval_injection_fallback_v1", status: "passed" },
        { scenarioId: "eval_moderation_fallback_v1", status: "passed" },
        { scenarioId: "eval_human_approval_policy_v1", status: "passed" },
        { scenarioId: "eval_failure_capture_v1", status: "passed" },
        { scenarioId: "eval_social_outcome_telemetry_v1", status: "passed" },
        { scenarioId: "eval_tone_agentic_async_ack_v1", status: "passed" },
        { scenarioId: "eval_usefulness_no_match_recovery_v1", status: "passed" },
        { scenarioId: "eval_grounding_profile_memory_consistency_v1", status: "passed" },
        { scenarioId: "eval_negotiation_quality_v1", status: "passed" },
        { scenarioId: "eval_workflow_runtime_traceability_v1", status: "passed" },
      ],
    }),
  );

  const result = await runProductCriticalGoldens(
    [`--artifact-path=${artifactPath}`, "--layer=eval", `--manifest=${manifestPath}`],
    {
      ...process.env,
      EVAL_ARTIFACT_ROOT: root,
    },
  );

  assert.equal(result.summary.failedCases, 1);
  assert.equal(result.summary.primaryFailureReason, "required_checks_not_passing");
  assert.deepEqual(result.summary.missingPassedCheckIds, ["agentic-evals-snapshot"]);
});

test("product critical golden runner fails when required scenarios are present but not passing", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "product-goldens-nonpassing-scenario-"));
  const artifactPath = path.join(root, "eval.json");
  const manifestPath = path.join(root, "manifest.json");
  writeFileSync(
    manifestPath,
    JSON.stringify({
      version: 1,
      layers: {
        eval: {
          minCaseCount: 1,
          minRecordCount: 19,
          maxFailedCases: 0,
          maxFailedRecords: 1,
          requiredCheckIds: ["agentic-evals-snapshot"],
          requiredPassedCheckIds: ["agentic-evals-snapshot"],
          forbiddenFailureClasses: [],
          requiredScenarioIds: ["eval_planning_bounds_v1", "eval_moderation_fallback_v1"],
          requiredPassedScenarioIds: ["eval_moderation_fallback_v1"]
        },
      },
    }),
  );
  writeFileSync(
    artifactPath,
    JSON.stringify({
      cases: [
        { id: "agentic-evals-snapshot", status: "passed" },
      ],
      summary: {
        caseCounts: { total: 1, passed: 1, failed: 0, skipped: 0 },
        recordCounts: { total: 19, passed: 18, failed: 1, skipped: 0 },
        failureClasses: {},
      },
      records: [
        { scenarioId: "eval_planning_bounds_v1", status: "passed" },
        { scenarioId: "eval_injection_fallback_v1", status: "passed" },
        { scenarioId: "eval_moderation_fallback_v1", status: "failed" },
        { scenarioId: "eval_human_approval_policy_v1", status: "passed" },
        { scenarioId: "eval_failure_capture_v1", status: "passed" },
        { scenarioId: "eval_social_outcome_telemetry_v1", status: "passed" },
        { scenarioId: "eval_tone_agentic_async_ack_v1", status: "passed" },
        { scenarioId: "eval_usefulness_no_match_recovery_v1", status: "passed" },
        { scenarioId: "eval_grounding_profile_memory_consistency_v1", status: "passed" },
        { scenarioId: "eval_negotiation_quality_v1", status: "passed" },
        { scenarioId: "eval_workflow_runtime_traceability_v1", status: "passed" },
      ],
    }),
  );

  const result = await runProductCriticalGoldens(
    [`--artifact-path=${artifactPath}`, "--layer=eval", `--manifest=${manifestPath}`],
    {
      ...process.env,
      EVAL_ARTIFACT_ROOT: root,
    },
  );

  assert.equal(result.summary.failedCases, 1);
  assert.equal(result.summary.primaryFailureReason, "required_scenarios_not_passing");
  assert.deepEqual(result.summary.missingPassedScenarioIds, ["eval_moderation_fallback_v1"]);
});
