import test from "node:test";
import assert from "node:assert/strict";

import {
  buildStepExecutionRecord,
  buildOpsPackExplainability,
  buildVerificationHistoryRecord,
  buildVerificationRunIngestBody,
  ingestVerificationRunArtifact,
} from "./run-backend-ops-pack.mjs";

test("buildStepExecutionRecord classifies timed out steps", () => {
  const record = buildStepExecutionRecord(
    {
      id: "agentic_suite_verification",
      summary: "suite",
      cmd: "pnpm",
      args: ["test"],
    },
    1000,
    45000,
    { status: null, signal: "SIGTERM" },
  );

  assert.equal(record.status, "failed");
  assert.equal(record.failureClass, "timeout");
  assert.equal(record.timeoutMs, 45000);
  assert.equal(record.command, "pnpm test");
});

test("buildVerificationHistoryRecord and ingest body preserve per-step evidence", () => {
  const baseArtifact = {
    runId: "backend-ops-pack-test",
    target: "production",
    status: "passed",
    stageEqualsProd: false,
    dryRun: false,
    requireRunbooks: true,
    requireEnvReadiness: true,
    shipVerdict: "ship_ready",
    blockedReasons: [],
    steps: [
      {
        id: "release_check_api",
        summary: "release gate baseline",
        status: "passed",
        exitCode: 0,
        latencyMs: 12,
        command: "pnpm release:check:api",
        timeoutMs: 0,
      },
    ],
  };

  const historyRecord = buildVerificationHistoryRecord({
    artifact: baseArtifact,
    lane: "suite",
    layer: "contract",
    runId: "backend-ops-pack-test:release_check_api",
    status: "passed",
    generatedAt: "2026-03-29T03:30:00.000Z",
    stepId: "release_check_api",
    stepSummary: "release gate baseline",
  });

  const ingestBody = buildVerificationRunIngestBody(
    historyRecord,
    baseArtifact,
  );

  assert.equal(ingestBody.runId, "backend-ops-pack-test:release_check_api");
  assert.equal(ingestBody.lane, "suite");
  assert.equal(ingestBody.layer, "contract");
  assert.equal(ingestBody.status, "passed");
  assert.equal(ingestBody.summary.stepId, "release_check_api");
  assert.equal(ingestBody.summary.stepSummary, "release gate baseline");
  assert.equal(ingestBody.artifact.runId, "backend-ops-pack-test");
});

test("buildOpsPackExplainability summarizes blocking conditions", () => {
  const explainability = buildOpsPackExplainability({
    status: "failed",
    missingRunbooks: [{ file: "docs/admin-runbook.md", exists: false }],
    envReadinessFailures: [
      {
        stepId: "moderation_drill",
        missingEnv: ["MODERATION_DRILL_ACCESS_TOKEN"],
      },
    ],
    steps: [
      {
        id: "moderation_drill",
        status: "failed",
        failureClass: "command_failed",
      },
    ],
  });

  assert.equal(explainability.blockingStepId, "moderation_drill");
  assert.match(explainability.summary, /blocked by moderation_drill/);
  assert.equal(explainability.nextActions.length, 3);
});

test("ingestVerificationRunArtifact posts verification history when credentials are present", async (t) => {
  const originalEnv = {
    SMOKE_BASE_URL: process.env.SMOKE_BASE_URL,
    SMOKE_ADMIN_USER_ID: process.env.SMOKE_ADMIN_USER_ID,
    SMOKE_ADMIN_ROLE: process.env.SMOKE_ADMIN_ROLE,
    SMOKE_ADMIN_API_KEY: process.env.SMOKE_ADMIN_API_KEY,
    BACKEND_OPS_INGEST_VERIFICATION_RUN:
      process.env.BACKEND_OPS_INGEST_VERIFICATION_RUN,
  };
  const originalFetch = globalThis.fetch;
  const requests = [];

  process.env.BACKEND_OPS_INGEST_VERIFICATION_RUN = "1";
  process.env.SMOKE_BASE_URL = "https://api.example.com";
  process.env.SMOKE_ADMIN_USER_ID = "admin-1";
  process.env.SMOKE_ADMIN_ROLE = "support";
  process.env.SMOKE_ADMIN_API_KEY = "admin-key";

  globalThis.fetch = async (url, init) => {
    requests.push({
      url: String(url),
      init,
      body: JSON.parse(String(init?.body ?? "{}")),
    });
    return {
      ok: true,
      status: 200,
      json: async () => ({ success: true, data: { stored: true } }),
    };
  };

  t.after(() => {
    globalThis.fetch = originalFetch;
    Object.assign(process.env, originalEnv);
  });

  const artifact = {
    runId: "backend-ops-pack-test",
    target: "production",
    status: "passed",
    stageEqualsProd: true,
    dryRun: false,
    requireRunbooks: true,
    requireEnvReadiness: true,
    shipVerdict: "ship_ready",
    blockedReasons: [],
    steps: [
      {
        id: "release_check_api",
        summary: "release gate baseline",
        status: "passed",
        exitCode: 0,
        latencyMs: 12,
        command: "pnpm release:check:api",
        timeoutMs: 0,
      },
    ],
  };

  const result = await ingestVerificationRunArtifact(artifact, {
    dryRunMode: false,
    runLabel: "suite",
    stepId: "release_check_api",
  });

  assert.equal(result.status, "stored");
  assert.equal(requests.length, 1);
  assert.equal(
    requests[0].url,
    "https://api.example.com/api/admin/ops/verification-runs",
  );
  assert.equal(requests[0].init.headers["x-admin-user-id"], "admin-1");
  assert.equal(requests[0].init.headers["x-admin-role"], "support");
  assert.equal(requests[0].init.headers["x-admin-api-key"], "admin-key");
  assert.equal(requests[0].body.runId, "backend-ops-pack-test");
  assert.equal(requests[0].body.lane, "suite");
  assert.equal(requests[0].body.layer, "full");
});

test("ingestVerificationRunArtifact is deterministic in dry-run mode", async () => {
  const result = await ingestVerificationRunArtifact(
    {
      runId: "backend-ops-pack-dry-run",
      target: "production",
      status: "passed",
      stageEqualsProd: false,
      dryRun: true,
      requireRunbooks: true,
      requireEnvReadiness: true,
      shipVerdict: "ship_ready",
      blockedReasons: [],
      steps: [],
    },
    {
      dryRunMode: true,
      runLabel: "verification",
      stepId: "agentic_suite_verification",
    },
  );

  assert.deepEqual(result, {
    attempted: false,
    reason: "dry_run",
  });
});
