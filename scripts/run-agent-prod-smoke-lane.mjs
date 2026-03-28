#!/usr/bin/env node

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const laneId = process.env.AGENTIC_VERIFICATION_LANE_ID?.trim() || "";
const baseUrl = process.env.SMOKE_BASE_URL?.trim() || "";
const accessToken = process.env.SMOKE_ACCESS_TOKEN?.trim() || "";
const adminUserId = process.env.SMOKE_ADMIN_USER_ID?.trim() || "";
const adminRole = process.env.SMOKE_ADMIN_ROLE?.trim() || "admin";
const adminApiKey = process.env.SMOKE_ADMIN_API_KEY?.trim() || "";
const agentThreadId = process.env.SMOKE_AGENT_THREAD_ID?.trim() || "";
const userId = process.env.SMOKE_USER_ID?.trim() || "";
const probeToken = process.env.ONBOARDING_PROBE_TOKEN?.trim() || "";
const refreshToken = process.env.SMOKE_REFRESH_TOKEN?.trim() || "";
const smokeHostHeader = process.env.SMOKE_HOST_HEADER?.trim() || "";
const applicationKey = process.env.SMOKE_APPLICATION_KEY?.trim() || "";
const applicationToken = process.env.SMOKE_APPLICATION_TOKEN?.trim() || "";
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
  ["SMOKE_ADMIN_USER_ID", adminUserId],
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

async function refreshSmokeSession() {
  if (!baseUrl || !refreshToken) {
    return { refreshed: false, reason: "missing_base_or_refresh_token" };
  }

  const response = await fetch(`${baseUrl}/api/auth/refresh`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(smokeHostHeader ? { Host: smokeHostHeader } : {}),
    },
    body: JSON.stringify({
      refreshToken: process.env.SMOKE_REFRESH_TOKEN || refreshToken,
      deviceId: "staging-verification-lane",
      deviceName: "Staging Verification Lane",
    }),
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok || !payload?.success || !payload?.data?.accessToken) {
    const preview = payload ? JSON.stringify(payload).slice(0, 200) : "null";
    return {
      refreshed: false,
      reason: `refresh_failed_${response.status}`,
      detail: preview,
    };
  }

  process.env.SMOKE_ACCESS_TOKEN = String(payload.data.accessToken).trim();
  process.env.AGENTIC_BENCH_ACCESS_TOKEN = process.env.SMOKE_ACCESS_TOKEN;
  if (
    typeof payload.data.refreshToken === "string" &&
    payload.data.refreshToken.trim().length > 0
  ) {
    process.env.SMOKE_REFRESH_TOKEN = payload.data.refreshToken.trim();
  }

  return { refreshed: true, reason: "ok" };
}

async function bootstrapSmokeSession() {
  if (!baseUrl || !adminUserId) {
    return { bootstrapped: false, reason: "missing_base_or_admin_user" };
  }

  const headers = {
    "content-type": "application/json",
    "x-admin-user-id": adminUserId,
    "x-admin-role": adminRole,
    ...(smokeHostHeader ? { Host: smokeHostHeader } : {}),
    ...(adminApiKey ? { "x-admin-api-key": adminApiKey } : {}),
    ...(applicationKey ? { "x-application-key": applicationKey } : {}),
    ...(applicationToken ? { "x-application-token": applicationToken } : {}),
  };

  const response = await fetch(`${baseUrl}/api/admin/ops/smoke-session/exchange`, {
    method: "POST",
    headers,
    body: JSON.stringify({}),
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  const envPayload = payload?.data?.env;
  if (!response.ok || !payload?.success || typeof envPayload !== "object") {
    const preview = payload ? JSON.stringify(payload).slice(0, 240) : "null";
    return {
      bootstrapped: false,
      reason: `bootstrap_failed_${response.status}`,
      detail: preview,
    };
  }

  const keys = [
    "SMOKE_ACCESS_TOKEN",
    "SMOKE_REFRESH_TOKEN",
    "SMOKE_USER_ID",
    "SMOKE_AGENT_THREAD_ID",
    "AGENTIC_BENCH_ACCESS_TOKEN",
    "AGENTIC_BENCH_USER_ID",
    "AGENTIC_BENCH_THREAD_ID",
  ];
  for (const key of keys) {
    const value = envPayload[key];
    if (typeof value === "string" && value.trim().length > 0) {
      process.env[key] = value.trim();
    }
  }

  return { bootstrapped: true, reason: "ok" };
}

async function smokeAccessTokenIsValid() {
  const runtimeBaseUrl = process.env.SMOKE_BASE_URL?.trim() || baseUrl;
  const runtimeToken = process.env.SMOKE_ACCESS_TOKEN?.trim() || "";
  const runtimeThreadId = process.env.SMOKE_AGENT_THREAD_ID?.trim() || "";

  if (!runtimeBaseUrl || !runtimeToken || !runtimeThreadId) {
    return false;
  }

  try {
    const response = await fetch(
      `${runtimeBaseUrl}/api/agent/threads/${runtimeThreadId}/messages`,
      {
        method: "GET",
        headers: {
          authorization: `Bearer ${runtimeToken}`,
          ...(smokeHostHeader ? { Host: smokeHostHeader } : {}),
        },
      },
    );
    return response.ok;
  } catch {
    return false;
  }
}

async function ensureSmokeSessionReady() {
  if (await smokeAccessTokenIsValid()) {
    return { ok: true, reason: "existing_token_valid" };
  }

  const refreshResult = await refreshSmokeSession();
  if (refreshResult.refreshed && (await smokeAccessTokenIsValid())) {
    return { ok: true, reason: "refreshed_token_valid" };
  }

  const bootstrapResult = await bootstrapSmokeSession();
  if (bootstrapResult.bootstrapped && (await smokeAccessTokenIsValid())) {
    return { ok: true, reason: "bootstrapped_token_valid" };
  }

  const detail = [
    refreshResult.reason,
    refreshResult.detail,
    bootstrapResult.reason,
    bootstrapResult.detail,
  ]
    .filter((value) => typeof value === "string" && value.length > 0)
    .join(" | ");
  return { ok: false, reason: "unable_to_acquire_valid_token", detail };
}

async function main() {
  const startedAt = Date.now();
  const steps = [];

  const sessionReady = await ensureSmokeSessionReady();
  if (!sessionReady.ok) {
    console.error(
      `prod smoke lane could not initialize smoke session: ${sessionReady.reason}${sessionReady.detail ? ` detail=${sessionReady.detail}` : ""}`,
    );
    process.exit(1);
  }
  console.log(`smoke session initialized: ${sessionReady.reason}`);

  const postBootstrapRequired = [
    ["SMOKE_ACCESS_TOKEN", process.env.SMOKE_ACCESS_TOKEN?.trim() || accessToken],
    ["SMOKE_USER_ID", process.env.SMOKE_USER_ID?.trim() || userId],
    ["SMOKE_AGENT_THREAD_ID", process.env.SMOKE_AGENT_THREAD_ID?.trim() || agentThreadId],
  ];
  const postBootstrapMissing = postBootstrapRequired
    .filter(([, value]) => !value)
    .map(([key]) => key);
  if (postBootstrapMissing.length > 0) {
    console.error(
      `prod smoke lane missing required smoke session values after initialization: ${postBootstrapMissing.join(", ")}`,
    );
    process.exit(1);
  }

  for (let index = 0; index < commands.length; index += 1) {
    if (commands[index].id === "smoke_llm_runtime") {
      const runtimeSessionResult = await ensureSmokeSessionReady();
      if (!runtimeSessionResult.ok) {
        const detailSuffix =
          typeof runtimeSessionResult.detail === "string" &&
          runtimeSessionResult.detail.length > 0
            ? ` detail=${runtimeSessionResult.detail}`
            : "";
        console.error(
          `smoke session unavailable before smoke_llm_runtime reason=${runtimeSessionResult.reason}${detailSuffix}`,
        );
        process.exit(1);
      }
      console.log(
        `smoke session ready before smoke_llm_runtime (${runtimeSessionResult.reason})`,
      );
    }
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
    const failedStep = steps.find((step) => step.status === "failed");
    if (failedStep) {
      console.error(
        `prod smoke lane failed at step=${failedStep.id} summary="${failedStep.summary}" exitCode=${failedStep.exitCode}`,
      );
    }
    process.exit(1);
  }
}

await main();
