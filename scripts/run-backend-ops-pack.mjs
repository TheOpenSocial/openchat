#!/usr/bin/env node

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const target = (process.env.BACKEND_OPS_TARGET || "production").trim();
const dryRun = process.env.BACKEND_OPS_DRY_RUN === "1";
const includeReleaseCheck =
  process.env.BACKEND_OPS_INCLUDE_RELEASE_CHECK !== "0";
const includeVerification =
  process.env.BACKEND_OPS_INCLUDE_VERIFICATION !== "0";
const includeProdSmoke = process.env.BACKEND_OPS_INCLUDE_PROD_SMOKE !== "0";
const includeModerationDrill =
  process.env.BACKEND_OPS_INCLUDE_MODERATION_DRILL !== "0";
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

function runCommand(step) {
  const startedAt = Date.now();
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
    };
  }

  const result = spawnSync(step.cmd, step.args, {
    cwd: process.cwd(),
    encoding: "utf8",
    env: effectiveEnv,
    shell: process.platform === "win32",
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  return {
    id: step.id,
    summary: step.summary,
    status: result.status === 0 ? "passed" : "failed",
    exitCode: result.status ?? 1,
    latencyMs: Date.now() - startedAt,
    command: `${step.cmd} ${step.args.join(" ")}`,
  };
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

async function main() {
  const startedAt = Date.now();
  const steps = [];
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
        .map((step) => `step_failed:${step.id}`),
    ],
    steps,
  };

  mkdirSync(path.dirname(artifactPath), { recursive: true });
  writeFileSync(artifactPath, JSON.stringify(artifact, null, 2));
  console.log(`backend ops pack artifact written to ${artifactPath}`);

  if (status === "failed") {
    process.exit(1);
  }
}

await main();
