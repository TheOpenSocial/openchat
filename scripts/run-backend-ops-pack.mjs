#!/usr/bin/env node

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const target = (process.env.BACKEND_OPS_TARGET || "production").trim();
const dryRun = process.env.BACKEND_OPS_DRY_RUN === "1";
const includeReleaseCheck =
  process.env.BACKEND_OPS_INCLUDE_RELEASE_CHECK !== "0";
const includeVerification =
  process.env.BACKEND_OPS_INCLUDE_VERIFICATION !== "0";
const includeProdSmoke = process.env.BACKEND_OPS_INCLUDE_PROD_SMOKE !== "0";
const includeModerationDrill =
  process.env.BACKEND_OPS_INCLUDE_MODERATION_DRILL !== "0";
const includeProtocolRecoveryDrill =
  process.env.BACKEND_OPS_INCLUDE_PROTOCOL_RECOVERY_DRILL !== "0";
const stageEqualsProd = process.env.STAGING_EQUALS_PROD === "true";
const requireRunbooks = process.env.BACKEND_OPS_REQUIRE_RUNBOOKS !== "0";
const requireEnvReadiness = process.env.BACKEND_OPS_REQUIRE_ENV !== "0";

const runId =
  process.env.BACKEND_OPS_RUN_ID ??
  `backend-ops-pack-${new Date().toISOString().replace(/[:.]/g, "-")}`;
const artifactPath = path.resolve(
  process.cwd(),
  process.env.BACKEND_OPS_ARTIFACT_PATH ??
    `.artifacts/backend-ops-pack/${runId}.json`,
);

const commands = [];
const ingestVerificationRuns =
  process.env.BACKEND_OPS_INGEST_VERIFICATION_RUN !== "0";
const verificationRunIngestLaneByStepId = {
  release_check_api: "suite",
  agentic_suite_verification: "verification",
  agentic_prod_smoke_lane: "prod-smoke",
  moderation_drill: "verification",
};

function verificationLayerForStep(stepId) {
  if (stepId === "release_check_api") {
    return "contract";
  }
  if (stepId === "agentic_prod_smoke_lane") {
    return "prod-smoke";
  }
  return "full";
}

const requiredRunbookFiles = [
  "docs/backend-launch-ops-pack.md",
  "docs/backend-launch-smoke-matrix.md",
  "docs/release-readiness-backend.md",
  "docs/staging-smoke-checklist.md",
  "docs/incident-runbook.md",
  "docs/admin-runbook.md",
  "docs/queue-replay-runbook.md",
];

const stepEnvRequirements = {
  agentic_suite_verification: [
    "SMOKE_BASE_URL",
    "SMOKE_ACCESS_TOKEN",
    "SMOKE_ADMIN_USER_ID",
    "SMOKE_AGENT_THREAD_ID",
    "SMOKE_USER_ID",
    "AGENTIC_BENCH_ACCESS_TOKEN",
    "AGENTIC_BENCH_USER_ID",
    "AGENTIC_BENCH_THREAD_ID",
    "AGENTIC_VERIFICATION_LANE_ID",
    "ONBOARDING_PROBE_TOKEN",
  ],
  agentic_prod_smoke_lane: [
    "SMOKE_BASE_URL",
    "SMOKE_ACCESS_TOKEN",
    "SMOKE_USER_ID",
    "SMOKE_AGENT_THREAD_ID",
    "AGENTIC_VERIFICATION_LANE_ID",
  ],
  moderation_drill: [
    "SMOKE_BASE_URL",
    "SMOKE_ADMIN_USER_ID",
    "MODERATION_DRILL_REPORTER_USER_ID",
    "MODERATION_DRILL_ACCESS_TOKEN",
    "MODERATION_DRILL_TARGET_USER_ID",
    "SMOKE_APPLICATION_KEY",
    "SMOKE_APPLICATION_TOKEN",
  ],
  protocol_recovery_drill: [
    "SMOKE_BASE_URL",
    "SMOKE_ADMIN_USER_ID",
  ],
};

if (includeReleaseCheck) {
  commands.push({
    id: "release_check_api",
    summary: "release gate baseline",
    cmd: "pnpm",
    args: ["release:check:api"],
  });
}

if (includeVerification) {
  commands.push({
    id: "agentic_suite_verification",
    summary: "golden suite verification lane",
    cmd: "pnpm",
    args: ["test:agentic:suite:verification"],
  });
}

if (includeProdSmoke) {
  commands.push({
    id: "agentic_prod_smoke_lane",
    summary: "prod/staging smoke lane",
    cmd: "pnpm",
    args: ["staging:smoke:verification-lane"],
  });
}

if (includeModerationDrill) {
  commands.push({
    id: "moderation_drill",
    summary: "moderation operator drill",
    cmd: "pnpm",
    args: ["moderation:drill"],
  });
}

if (includeProtocolRecoveryDrill) {
  commands.push({
    id: "protocol_recovery_drill",
    summary: "protocol delivery recovery drill",
    cmd: "pnpm",
    args: ["protocol:recovery:drill"],
  });
}

export function buildStepExecutionRecord(step, startedAt, timeoutMs, result) {
  const timedOut =
    typeof result.signal === "string" &&
    (result.signal === "SIGTERM" || result.signal === "SIGKILL") &&
    timeoutMs > 0;
  return {
    id: step.id,
    summary: step.summary,
    status: result.status === 0 ? "passed" : "failed",
    exitCode: result.status ?? 1,
    latencyMs: Date.now() - startedAt,
    command: `${step.cmd} ${step.args.join(" ")}`,
    timeoutMs,
    failureClass: timedOut ? "timeout" : "command_failed",
  };
}

export function buildVerificationHistoryRecord({
  artifact,
  lane,
  layer,
  runId,
  status,
  generatedAt,
  stepId,
  stepSummary,
}) {
  return {
    runId,
    lane,
    layer,
    status,
    generatedAt,
    ingestedAt: new Date().toISOString(),
    canaryVerdict: status === "passed" ? "healthy" : "critical",
    summary: {
      target: artifact.target,
      shipVerdict: artifact.shipVerdict,
      blockedReasons: artifact.blockedReasons,
      stepId,
      stepSummary,
    },
    artifact,
  };
}

export function buildVerificationRunIngestBody(record, artifact) {
  return {
    runId: record.runId,
    lane: record.lane,
    layer: record.layer,
    status: record.status,
    generatedAt: record.generatedAt,
    canaryVerdict: record.canaryVerdict,
    summary: record.summary,
    artifact,
  };
}

export function buildOpsPackExplainability({
  status,
  missingRunbooks,
  envReadinessFailures,
  steps,
}) {
  const failedStep = steps.find((step) => step.status === "failed") ?? null;
  const summary =
    status === "passed"
      ? "Backend ops pack is healthy. Required checks passed."
      : failedStep
        ? `Backend ops pack is blocked by ${failedStep.id}.`
        : missingRunbooks.length > 0
          ? "Backend ops pack is blocked by missing runbooks."
          : envReadinessFailures.length > 0
            ? "Backend ops pack is blocked by missing environment readiness."
            : "Backend ops pack is blocked.";

  const nextActions = [];
  if (missingRunbooks.length > 0) {
    nextActions.push({
      id: "restore_runbooks",
      label: "Restore required runbooks",
      reason: `Missing files: ${missingRunbooks.map((check) => check.file).join(", ")}`,
    });
  }
  if (envReadinessFailures.length > 0) {
    nextActions.push({
      id: "fill_env_gaps",
      label: "Fill missing environment readiness",
      reason: envReadinessFailures
        .map(
          (readiness) =>
            `${readiness.stepId}: ${readiness.missingEnv.join(", ")}`,
        )
        .join(" | "),
    });
  }
  if (failedStep) {
    nextActions.push({
      id: "inspect_failed_step",
      label: "Inspect failed step",
      reason:
        failedStep.failureClass === "timeout"
          ? `${failedStep.id} timed out; inspect step timeout, service readiness, and queue pressure.`
          : `${failedStep.id} failed; inspect the command output and linked admin verification evidence.`,
    });
  }

  return {
    summary,
    blockingStepId: failedStep?.id ?? null,
    nextActions,
  };
}

function runCommand(step) {
  const startedAt = Date.now();
  const timeoutMs = resolveStepTimeoutMs(step.id);
  const effectiveEnv = {
    ...process.env,
    ...(target === "staging"
      ? { STAGING_EQUALS_PROD: stageEqualsProd ? "true" : "false" }
      : {}),
  };

  if (dryRun) {
    return {
      id: step.id,
      summary: step.summary,
      status: "skipped",
      exitCode: 0,
      latencyMs: Date.now() - startedAt,
      command: `${step.cmd} ${step.args.join(" ")}`,
      timeoutMs,
    };
  }

  const result = spawnSync(step.cmd, step.args, {
    cwd: process.cwd(),
    encoding: "utf8",
    env: effectiveEnv,
    shell: process.platform === "win32",
    ...(timeoutMs > 0 ? { timeout: timeoutMs } : {}),
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  return buildStepExecutionRecord(step, startedAt, timeoutMs, result);
}

function resolveStepTimeoutMs(stepId) {
  const specificKey = `BACKEND_OPS_${stepId.toUpperCase().replace(/[^A-Z0-9]/g, "_")}_TIMEOUT_MS`;
  const specific = Number(process.env[specificKey] ?? "");
  if (Number.isFinite(specific) && specific > 0) {
    return specific;
  }
  const globalTimeout = Number(process.env.BACKEND_OPS_STEP_TIMEOUT_MS ?? "");
  if (Number.isFinite(globalTimeout) && globalTimeout > 0) {
    return globalTimeout;
  }
  return 0;
}

function findMissingEnv(stepId) {
  const requiredKeys = stepEnvRequirements[stepId] ?? [];
  return requiredKeys.filter((key) => {
    const value = process.env[key];
    return typeof value !== "string" || value.trim().length === 0;
  });
}

function verifyRunbooks() {
  return requiredRunbookFiles.map((file) => ({
    file,
    exists: existsSync(path.resolve(process.cwd(), file)),
  }));
}

export async function ingestVerificationRunArtifact(artifact, options = {}) {
  const { dryRunMode = dryRun, runLabel = "verification", stepId } = options;
  if (!ingestVerificationRuns || dryRunMode) {
    return {
      attempted: false,
      reason: dryRunMode ? "dry_run" : "disabled",
    };
  }
  const baseUrl = process.env.SMOKE_BASE_URL?.trim();
  const adminUserId = process.env.SMOKE_ADMIN_USER_ID?.trim();
  const adminRole = process.env.SMOKE_ADMIN_ROLE?.trim() || "admin";
  if (!baseUrl || !adminUserId) {
    return {
      attempted: false,
      reason: "missing_ingest_admin_context",
    };
  }
  const endpoint = `${baseUrl.replace(/\/+$/, "")}/api/admin/ops/verification-runs`;
  const body = buildVerificationRunIngestBody(
    {
      runId: artifact.runId,
      lane: runLabel,
      layer: artifact.layer ?? "full",
      status: artifact.status,
      generatedAt: artifact.generatedAt,
      canaryVerdict: artifact.status === "passed" ? "healthy" : "critical",
      summary: {
        target: artifact.target,
        shipVerdict: artifact.shipVerdict,
        blockedReasons: artifact.blockedReasons,
        stepId: stepId ?? null,
        stepStatuses: artifact.steps?.map((step) => ({
          id: step.id,
          status: step.status,
          latencyMs: step.latencyMs,
          failureClass: step.failureClass ?? null,
        })),
      },
      artifact,
    },
    artifact,
  );
  const headers = {
    Accept: "application/json",
    "Content-Type": "application/json",
    "x-admin-user-id": adminUserId,
    "x-admin-role": adminRole,
  };
  const adminApiKey = process.env.SMOKE_ADMIN_API_KEY?.trim();
  if (adminApiKey) {
    headers["x-admin-api-key"] = adminApiKey;
  }
  let lastError = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(
          `ingest failed (${response.status}): ${JSON.stringify(payload).slice(0, 280)}`,
        );
      }
      return {
        attempted: true,
        status: "stored",
        attempt,
        lane: runLabel,
        stepId: stepId ?? null,
      };
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      await new Promise((resolve) => setTimeout(resolve, attempt * 500));
    }
  }
  return {
    attempted: true,
    status: "failed",
    reason: lastError,
    lane: runLabel,
    stepId: stepId ?? null,
  };
}

async function main() {
  const startedAt = Date.now();
  const steps = [];
  const verificationRunIngestions = [];
  const runbookChecks = verifyRunbooks();
  const missingRunbooks = runbookChecks.filter((check) => !check.exists);
  const envReadiness = commands.map((step) => ({
    stepId: step.id,
    requiredEnv: stepEnvRequirements[step.id] ?? [],
    missingEnv: findMissingEnv(step.id),
  }));
  const envReadinessFailures = envReadiness.filter(
    (readiness) => readiness.missingEnv.length > 0,
  );

  console.log("Backend ops pack");
  console.log(`- target: ${target}`);
  console.log(`- stageEqualsProd: ${stageEqualsProd}`);
  console.log(`- dryRun: ${dryRun}`);
  console.log(`- requireRunbooks: ${requireRunbooks}`);
  console.log(`- requireEnvReadiness: ${requireEnvReadiness}`);
  console.log(`- artifactPath: ${artifactPath}`);
  console.log("");
  console.log("Runbook checks:");
  for (const check of runbookChecks) {
    console.log(`- ${check.exists ? "ok" : "missing"} ${check.file}`);
  }
  if (missingRunbooks.length > 0 && requireRunbooks) {
    console.error("");
    console.error(
      `Missing required runbook files: ${missingRunbooks.map((check) => check.file).join(", ")}`,
    );
  }
  console.log("");
  console.log("Env readiness:");
  for (const readiness of envReadiness) {
    console.log(
      `- ${readiness.stepId}: ${
        readiness.missingEnv.length === 0
          ? "ready"
          : `missing ${readiness.missingEnv.join(", ")}`
      }`,
    );
  }
  console.log("");

  if (
    (missingRunbooks.length === 0 || !requireRunbooks) &&
    (envReadinessFailures.length === 0 || !requireEnvReadiness)
  ) {
    for (const step of commands) {
      console.log(`Running ${step.id}: ${step.summary}`);
      const result = runCommand(step);
      steps.push(result);
      verificationRunIngestions.push(
        await ingestVerificationRunArtifact(
          buildVerificationHistoryRecord({
            artifact: {
              runId: `${runId}:${step.id}`,
              target,
              status: result.status,
              layer: verificationLayerForStep(step.id),
              stageEqualsProd,
              dryRun,
              requireRunbooks,
              requireEnvReadiness,
              shipVerdict:
                result.status === "passed" ? "ship_ready" : "blocked",
              blockedReasons: [
                ...(result.status === "failed"
                  ? [
                      result.failureClass === "timeout"
                        ? `step_timeout:${step.id}`
                        : `step_failed:${step.id}`,
                    ]
                  : []),
              ],
              steps: [result],
            },
            lane: verificationRunIngestLaneByStepId[step.id] ?? "verification",
            layer: verificationLayerForStep(step.id),
            runId: `${runId}:${step.id}`,
            status: result.status,
            generatedAt: new Date().toISOString(),
            stepId: step.id,
            stepSummary: step.summary,
          }),
          {
            dryRunMode: dryRun,
            runLabel:
              verificationRunIngestLaneByStepId[step.id] ?? "verification",
            stepId: step.id,
          },
        ),
      );
      if (result.status === "failed") {
        break;
      }
    }
  } else if (envReadinessFailures.length > 0 && requireEnvReadiness) {
    console.error("");
    console.error(
      `Missing required environment for launch evidence: ${envReadinessFailures
        .map(
          (readiness) =>
            `${readiness.stepId} -> ${readiness.missingEnv.join(", ")}`,
        )
        .join(" | ")}`,
    );
  }

  const status =
    (requireRunbooks && missingRunbooks.length > 0) ||
    (requireEnvReadiness && envReadinessFailures.length > 0) ||
    steps.some((step) => step.status === "failed")
      ? "failed"
      : "passed";
  const artifact = {
    runId,
    generatedAt: new Date().toISOString(),
    target,
    status,
    stageEqualsProd,
    dryRun,
    requireRunbooks,
    requireEnvReadiness,
    layer: "full",
    totalLatencyMs: Date.now() - startedAt,
    runbookChecks,
    envReadiness,
    shipVerdict: status === "passed" ? "ship_ready" : "blocked",
    blockedReasons: [
      ...(missingRunbooks.length > 0 && requireRunbooks
        ? ["missing_runbook_files"]
        : []),
      ...(envReadinessFailures.length > 0 && requireEnvReadiness
        ? envReadinessFailures.map(
            (readiness) => `missing_env:${readiness.stepId}`,
          )
        : []),
      ...steps
        .filter((step) => step.status === "failed")
        .map((step) =>
          step.failureClass === "timeout"
            ? `step_timeout:${step.id}`
            : `step_failed:${step.id}`,
        ),
    ],
    steps,
    verificationRunIngestions,
    explainability: buildOpsPackExplainability({
      status,
      missingRunbooks,
      envReadinessFailures,
      steps,
    }),
  };

  artifact.verificationRunIngest =
    await ingestVerificationRunArtifact(artifact);

  mkdirSync(path.dirname(artifactPath), { recursive: true });
  writeFileSync(artifactPath, JSON.stringify(artifact, null, 2));
  console.log(`backend ops pack artifact written to ${artifactPath}`);

  if (status === "failed") {
    process.exit(1);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  await main();
}
