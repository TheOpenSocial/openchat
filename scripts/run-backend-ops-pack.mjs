#!/usr/bin/env node

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const target = (process.env.BACKEND_OPS_TARGET || "production").trim();
const dryRun = process.env.BACKEND_OPS_DRY_RUN === "1";
const includeReleaseCheck = process.env.BACKEND_OPS_INCLUDE_RELEASE_CHECK !== "0";
const includeVerification =
  process.env.BACKEND_OPS_INCLUDE_VERIFICATION !== "0";
const includeProdSmoke = process.env.BACKEND_OPS_INCLUDE_PROD_SMOKE !== "0";
const includeModerationDrill =
  process.env.BACKEND_OPS_INCLUDE_MODERATION_DRILL !== "0";
const stageEqualsProd = process.env.STAGING_EQUALS_PROD === "true";

const runId =
  process.env.BACKEND_OPS_RUN_ID ??
  `backend-ops-pack-${new Date().toISOString().replace(/[:.]/g, "-")}`;
const artifactPath = path.resolve(
  process.cwd(),
  process.env.BACKEND_OPS_ARTIFACT_PATH ??
    `.artifacts/backend-ops-pack/${runId}.json`,
);

const commands = [];

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
    ...(target === "staging" ? { STAGING_EQUALS_PROD: stageEqualsProd ? "true" : "false" } : {}),
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

async function main() {
  const startedAt = Date.now();
  const steps = [];

  console.log("Backend ops pack");
  console.log(`- target: ${target}`);
  console.log(`- stageEqualsProd: ${stageEqualsProd}`);
  console.log(`- dryRun: ${dryRun}`);
  console.log(`- artifactPath: ${artifactPath}`);
  console.log("");

  for (const step of commands) {
    console.log(`Running ${step.id}: ${step.summary}`);
    const result = runCommand(step);
    steps.push(result);
    if (result.status === "failed") {
      break;
    }
  }

  const status = steps.some((step) => step.status === "failed")
    ? "failed"
    : "passed";
  const artifact = {
    runId,
    generatedAt: new Date().toISOString(),
    target,
    status,
    stageEqualsProd,
    dryRun,
    totalLatencyMs: Date.now() - startedAt,
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
