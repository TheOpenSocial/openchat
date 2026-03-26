#!/usr/bin/env node

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const laneId = process.env.AGENTIC_VERIFICATION_LANE_ID?.trim() || "";
const baseUrl = process.env.SMOKE_BASE_URL?.trim() || "";
const accessToken = process.env.SMOKE_ACCESS_TOKEN?.trim() || "";
const adminUserId = process.env.SMOKE_ADMIN_USER_ID?.trim() || "";
const agentThreadId = process.env.SMOKE_AGENT_THREAD_ID?.trim() || "";
const userId = process.env.SMOKE_USER_ID?.trim() || "";
const probeToken = process.env.ONBOARDING_PROBE_TOKEN?.trim() || "";
const paceMs = Number(process.env.AGENTIC_VERIFICATION_LANE_PACE_MS ?? 1500);
const runId =
  process.env.AGENTIC_PROD_SMOKE_RUN_ID ??
  `prod-smoke-lane-${new Date().toISOString().replace(/[:.]/g, "-")}`;
const artifactPath = path.resolve(
  process.cwd(),
  process.env.AGENTIC_PROD_SMOKE_ARTIFACT_PATH ??
    `.artifacts/agent-test-suite/${runId}.json`,
);

const required = [
  ["AGENTIC_VERIFICATION_LANE_ID", laneId],
  ["SMOKE_BASE_URL", baseUrl],
  ["SMOKE_ACCESS_TOKEN", accessToken],
  ["SMOKE_ADMIN_USER_ID", adminUserId],
  ["SMOKE_AGENT_THREAD_ID", agentThreadId],
  ["SMOKE_USER_ID", userId],
  ["ONBOARDING_PROBE_TOKEN", probeToken],
];

const missing = required.filter(([, value]) => !value).map(([key]) => key);
if (missing.length > 0) {
  console.error(
    `prod smoke lane is missing required env: ${missing.join(", ")}`,
  );
  process.exit(1);
}

const commands = [
  {
    id: "smoke_api",
    summary: "staging smoke api",
    cmd: "node",
    args: ["scripts/staging-smoke-api.mjs"],
  },
  {
    id: "smoke_llm_runtime",
    summary: "staging smoke llm runtime",
    cmd: "node",
    args: ["scripts/staging-smoke-llm-runtime.mjs"],
  },
  {
    id: "incident_verify",
    summary: "staging incident verify",
    cmd: "node",
    args: ["scripts/staging-incident-verify.mjs"],
  },
];

const sleep = (ms) =>
  new Promise((resolve) => {
    if (ms <= 0) {
      resolve();
      return;
    }
    setTimeout(resolve, ms);
  });

function runCommand(step) {
  const startedAt = Date.now();
  const result = spawnSync(step.cmd, step.args, {
    cwd: process.cwd(),
    encoding: "utf8",
    env: process.env,
    shell: process.platform === "win32",
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  return {
    id: step.id,
    summary: step.summary,
    status: result.status === 0 ? "passed" : "failed",
    exitCode: result.status,
    latencyMs: Date.now() - startedAt,
  };
}

async function main() {
  const startedAt = Date.now();
  const steps = [];

  for (let index = 0; index < commands.length; index += 1) {
    const step = runCommand(commands[index]);
    steps.push(step);
    if (step.status === "failed") {
      break;
    }
    if (index < commands.length - 1) {
      await sleep(paceMs);
    }
  }

  const status = steps.some((step) => step.status === "failed")
    ? "failed"
    : "passed";
  const artifact = {
    runId,
    generatedAt: new Date().toISOString(),
    laneId,
    baseUrl,
    status,
    totalLatencyMs: Date.now() - startedAt,
    paceMs,
    steps,
  };

  mkdirSync(path.dirname(artifactPath), { recursive: true });
  writeFileSync(artifactPath, JSON.stringify(artifact, null, 2));
  console.log(`prod smoke lane artifact written to ${artifactPath}`);

  if (status === "failed") {
    process.exit(1);
  }
}

await main();
