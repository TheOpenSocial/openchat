#!/usr/bin/env node

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const stageEqualsProd = process.env.STAGING_EQUALS_PROD === "true";

function readEnv(...keys) {
  for (const key of keys) {
    const value = process.env[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return "";
}

function readWithStagingProdFallback(primary, ...fallbacks) {
  if (!stageEqualsProd) {
    return readEnv(primary, ...fallbacks);
  }

  const stageFallbacks = [];
  for (const key of [primary, ...fallbacks]) {
    if (key.startsWith("STAGING_")) {
      stageFallbacks.push(key.replace(/^STAGING_/, "PROD_"));
      stageFallbacks.push(key.replace(/^STAGING_/, "PRODUCTION_"));
    }
    stageFallbacks.push(key);
  }
  return readEnv(...stageFallbacks);
}

const resolvedEnv = {
  AGENTIC_BENCH_URL: readWithStagingProdFallback(
    "AGENTIC_BENCH_URL",
    "SMOKE_BASE_URL",
    "STAGING_API_BASE_URL",
    "PROD_API_BASE_URL",
    "PRODUCTION_API_BASE_URL",
    "API_BASE_URL",
  ),
  AGENTIC_BENCH_ACCESS_TOKEN: readWithStagingProdFallback(
    "SMOKE_ACCESS_TOKEN",
    "AGENTIC_BENCH_ACCESS_TOKEN",
    "STAGING_SMOKE_ACCESS_TOKEN",
    "PROD_SMOKE_ACCESS_TOKEN",
    "PRODUCTION_SMOKE_ACCESS_TOKEN",
  ),
  AGENTIC_BENCH_USER_ID: readWithStagingProdFallback(
    "AGENTIC_BENCH_USER_ID",
    "SMOKE_USER_ID",
    "STAGING_SMOKE_USER_ID",
    "PROD_SMOKE_USER_ID",
    "PRODUCTION_SMOKE_USER_ID",
  ),
  AGENTIC_BENCH_THREAD_ID: readWithStagingProdFallback(
    "AGENTIC_BENCH_THREAD_ID",
    "SMOKE_AGENT_THREAD_ID",
    "STAGING_SMOKE_AGENT_THREAD_ID",
    "PROD_SMOKE_AGENT_THREAD_ID",
    "PRODUCTION_SMOKE_AGENT_THREAD_ID",
  ),
  AGENTIC_VERIFICATION_LANE_ID: readWithStagingProdFallback(
    "AGENTIC_VERIFICATION_LANE_ID",
    "STAGING_AGENTIC_VERIFICATION_LANE_ID",
    "PROD_AGENTIC_VERIFICATION_LANE_ID",
    "PRODUCTION_AGENTIC_VERIFICATION_LANE_ID",
  ),
  SMOKE_BASE_URL: readWithStagingProdFallback(
    "SMOKE_BASE_URL",
    "STAGING_API_BASE_URL",
    "PROD_API_BASE_URL",
    "PRODUCTION_API_BASE_URL",
    "API_BASE_URL",
  ),
  SMOKE_ACCESS_TOKEN: readWithStagingProdFallback(
    "SMOKE_ACCESS_TOKEN",
    "STAGING_SMOKE_ACCESS_TOKEN",
    "PROD_SMOKE_ACCESS_TOKEN",
    "PRODUCTION_SMOKE_ACCESS_TOKEN",
  ),
  SMOKE_REFRESH_TOKEN: readWithStagingProdFallback(
    "SMOKE_REFRESH_TOKEN",
    "STAGING_SMOKE_REFRESH_TOKEN",
    "PROD_SMOKE_REFRESH_TOKEN",
    "PRODUCTION_SMOKE_REFRESH_TOKEN",
  ),
  SMOKE_ADMIN_USER_ID: readWithStagingProdFallback(
    "SMOKE_ADMIN_USER_ID",
    "STAGING_SMOKE_ADMIN_USER_ID",
    "PROD_SMOKE_ADMIN_USER_ID",
    "PRODUCTION_SMOKE_ADMIN_USER_ID",
  ),
  SMOKE_AGENT_THREAD_ID: readWithStagingProdFallback(
    "SMOKE_AGENT_THREAD_ID",
    "STAGING_SMOKE_AGENT_THREAD_ID",
    "PROD_SMOKE_AGENT_THREAD_ID",
    "PRODUCTION_SMOKE_AGENT_THREAD_ID",
  ),
  SMOKE_USER_ID: readWithStagingProdFallback(
    "SMOKE_USER_ID",
    "STAGING_SMOKE_USER_ID",
    "PROD_SMOKE_USER_ID",
    "PRODUCTION_SMOKE_USER_ID",
  ),
  ONBOARDING_PROBE_TOKEN: readWithStagingProdFallback(
    "ONBOARDING_PROBE_TOKEN",
    "STAGING_ONBOARDING_PROBE_TOKEN",
    "PROD_ONBOARDING_PROBE_TOKEN",
    "PRODUCTION_ONBOARDING_PROBE_TOKEN",
  ),
};

const OPTIONAL_ENV_KEYS = new Set(["SMOKE_REFRESH_TOKEN"]);

function collectMissing(envMap) {
  return Object.entries(envMap)
    .filter(([key, value]) => value.length === 0 && !OPTIONAL_ENV_KEYS.has(key))
    .map(([key]) => key);
}

async function tryBootstrapEnvFromPlayground(
  currentEnv,
  missingKeys,
  options = {},
) {
  const forceRefresh = options.forceRefresh === true;
  const required =
    options.required === true ||
    process.env.PLAYGROUND_BOOTSTRAP_REQUIRED === "1";
  const baseUrl = (
    process.env.PLAYGROUND_BASE_URL ||
    process.env.SMOKE_BASE_URL ||
    ""
  ).trim();
  const adminUserId = (process.env.PLAYGROUND_ADMIN_USER_ID || "").trim();
  const adminRole = (process.env.PLAYGROUND_ADMIN_ROLE || "admin").trim();
  const adminApiKey = (process.env.PLAYGROUND_ADMIN_API_KEY || "").trim();
  const playgroundHostHeader = (
    process.env.PLAYGROUND_HOST_HEADER ||
    process.env.SMOKE_HOST_HEADER ||
    ""
  ).trim();
  const rotateProbeToken =
    process.env.PLAYGROUND_BOOTSTRAP_ROTATE_PROBE_TOKEN === "1";

  if (!baseUrl || !adminUserId || (!forceRefresh && missingKeys.length === 0)) {
    if (required && (!baseUrl || !adminUserId)) {
      throw new Error(
        "playground bootstrap required but PLAYGROUND_BASE_URL or PLAYGROUND_ADMIN_USER_ID is missing",
      );
    }
    return currentEnv;
  }

  try {
    const response = await fetch(
      `${baseUrl.replace(/\/+$/, "")}/api/admin/playground/bootstrap`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(playgroundHostHeader ? { Host: playgroundHostHeader } : {}),
          "x-admin-user-id": adminUserId,
          "x-admin-role": adminRole,
          ...(adminApiKey ? { "x-admin-api-key": adminApiKey } : {}),
        },
        body: JSON.stringify({
          rotateProbeToken,
        }),
      },
    );
    const payload = await response.json();
    const envFromBootstrap = payload?.data?.env ?? {};
    if (
      !response.ok ||
      !payload?.success ||
      typeof envFromBootstrap !== "object"
    ) {
      const bootstrapEndpointUnavailable = response.status === 404;
      if (bootstrapEndpointUnavailable) {
        return currentEnv;
      }
      if (required) {
        throw new Error(
          `playground bootstrap failed (${response.status}): ${JSON.stringify(payload).slice(0, 300)}`,
        );
      }
      return currentEnv;
    }

    const merged = { ...currentEnv };
    for (const key of Object.keys(currentEnv)) {
      const shouldReplace =
        forceRefresh &&
        (key === "SMOKE_ACCESS_TOKEN" ||
          key === "SMOKE_REFRESH_TOKEN" ||
          key === "SMOKE_USER_ID" ||
          key === "SMOKE_AGENT_THREAD_ID" ||
          key === "AGENTIC_BENCH_ACCESS_TOKEN" ||
          key === "AGENTIC_BENCH_USER_ID" ||
          key === "AGENTIC_BENCH_THREAD_ID");
      if (merged[key] && !shouldReplace) {
        continue;
      }
      const value = envFromBootstrap[key];
      if (typeof value === "string" && value.trim().length > 0) {
        merged[key] = value.trim();
      }
    }
    if (
      required &&
      (!merged.AGENTIC_BENCH_ACCESS_TOKEN ||
        !merged.AGENTIC_BENCH_THREAD_ID ||
        !merged.SMOKE_ACCESS_TOKEN)
    ) {
      throw new Error(
        "playground bootstrap required but did not return complete smoke/benchmark credentials",
      );
    }
    return merged;
  } catch (error) {
    if (required) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(
        `playground bootstrap required but request failed: ${message}`,
      );
    }
    return currentEnv;
  }
}

async function benchAccessTokenIsValid(envMap) {
  const baseUrl = envMap.SMOKE_BASE_URL?.trim();
  const accessToken = envMap.AGENTIC_BENCH_ACCESS_TOKEN?.trim();
  const threadId = envMap.AGENTIC_BENCH_THREAD_ID?.trim();
  const benchHostHeader = (
    process.env.AGENTIC_BENCH_HOST_HEADER ||
    process.env.SMOKE_HOST_HEADER ||
    ""
  ).trim();
  if (!baseUrl || !accessToken || !threadId) {
    return false;
  }
  try {
    const response = await fetch(
      `${baseUrl.replace(/\/+$/, "")}/api/agent/threads/${threadId}/messages`,
      {
        method: "GET",
        headers: {
          authorization: `Bearer ${accessToken}`,
          ...(benchHostHeader ? { Host: benchHostHeader } : {}),
        },
      },
    );
    return response.ok;
  } catch {
    return false;
  }
}

async function tryRefreshSmokeSession(envMap) {
  const baseUrl = envMap.SMOKE_BASE_URL?.trim();
  const refreshToken = envMap.SMOKE_REFRESH_TOKEN?.trim();
  if (!baseUrl || !refreshToken) {
    return envMap;
  }
  const smokeHostHeader = (
    process.env.SMOKE_HOST_HEADER ||
    process.env.PLAYGROUND_HOST_HEADER ||
    ""
  ).trim();
  try {
    const response = await fetch(
      `${baseUrl.replace(/\/+$/, "")}/api/auth/refresh`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(smokeHostHeader ? { Host: smokeHostHeader } : {}),
        },
        body: JSON.stringify({
          refreshToken,
          deviceId: "admin-playground",
          deviceName: "Admin Playground",
        }),
      },
    );
    const payload = await response.json();
    if (!response.ok || !payload?.success || !payload?.data?.accessToken) {
      return envMap;
    }
    return {
      ...envMap,
      SMOKE_ACCESS_TOKEN: String(payload.data.accessToken).trim(),
      AGENTIC_BENCH_ACCESS_TOKEN: String(payload.data.accessToken).trim(),
      SMOKE_REFRESH_TOKEN:
        typeof payload.data.refreshToken === "string" &&
        payload.data.refreshToken.trim().length > 0
          ? payload.data.refreshToken.trim()
          : refreshToken,
    };
  } catch {
    return envMap;
  }
}

let hydratedEnv = { ...resolvedEnv };
const initialMissing = collectMissing(hydratedEnv);
hydratedEnv = await tryBootstrapEnvFromPlayground(hydratedEnv, initialMissing, {
  required: process.env.PLAYGROUND_BOOTSTRAP_REQUIRED === "1",
});
if (!(await benchAccessTokenIsValid(hydratedEnv))) {
  hydratedEnv = await tryBootstrapEnvFromPlayground(hydratedEnv, [], {
    forceRefresh: true,
    required: process.env.PLAYGROUND_BOOTSTRAP_REQUIRED === "1",
  });
}
if (!(await benchAccessTokenIsValid(hydratedEnv))) {
  hydratedEnv = await tryRefreshSmokeSession(hydratedEnv);
}
const missing = collectMissing(hydratedEnv);

if (missing.length > 0) {
  console.error(
    `verification lane is missing required env: ${missing.join(", ")}`,
  );
  process.exit(1);
}

const stageSequence = [
  "contract",
  "workflow",
  "queue",
  "scenario",
  "eval",
  "benchmark",
  "prod-smoke",
];

const runIdPrefix =
  process.env.AGENT_TEST_SUITE_VERIFICATION_RUN_ID ??
  `verification-${new Date().toISOString().replace(/[:.]/g, "-")}`;
const summaryArtifactPath = path.resolve(
  process.cwd(),
  process.env.AGENT_TEST_SUITE_VERIFICATION_ARTIFACT_PATH ??
    ".artifacts/agent-test-suite/verification-latest.json",
);
const rerunFailedOnly = process.env.AGENT_TEST_SUITE_RERUN_FAILED_ONLY === "1";
const retryFailedStagesOnce =
  process.env.AGENT_TEST_SUITE_RETRY_FAILED_STAGES_ONCE !== "0";
const tokenSensitiveStages = new Set(["benchmark", "prod-smoke"]);

function buildSuiteEnv() {
  return {
    ...process.env,
    AGENT_TEST_SUITE_REQUIRE_BENCHMARK: "1",
    AGENT_TEST_SUITE_ENABLE_PROD_SMOKE: "1",
    AGENT_TEST_SUITE_REQUIRE_PROD_SMOKE: "1",
    AGENTIC_BENCH_ENABLE_WORKFLOW_HEALTH:
      process.env.AGENTIC_BENCH_ENABLE_WORKFLOW_HEALTH ?? "0",
    AGENTIC_BENCH_REQUIRE_WORKFLOW_HEALTH:
      process.env.AGENTIC_BENCH_REQUIRE_WORKFLOW_HEALTH ?? "0",
    ...hydratedEnv,
    AGENTIC_BENCH_ADMIN_USER_ID:
      process.env.AGENTIC_BENCH_ADMIN_USER_ID ??
      process.env.SMOKE_ADMIN_USER_ID ??
      hydratedEnv.SMOKE_ADMIN_USER_ID,
    AGENTIC_BENCH_ADMIN_ROLE:
      process.env.AGENTIC_BENCH_ADMIN_ROLE ??
      process.env.SMOKE_ADMIN_ROLE ??
      "support",
    AGENTIC_BENCH_ADMIN_API_KEY:
      process.env.AGENTIC_BENCH_ADMIN_API_KEY ??
      process.env.SMOKE_ADMIN_API_KEY,
    AGENTIC_BENCH_MAX_CRITICAL_WORKFLOW_RUNS:
      process.env.AGENTIC_BENCH_MAX_CRITICAL_WORKFLOW_RUNS ?? "0",
    AGENTIC_BENCH_MAX_FAILED_STAGE_COUNT:
      process.env.AGENTIC_BENCH_MAX_FAILED_STAGE_COUNT ?? "0",
    AGENTIC_BENCH_MAX_BLOCKED_STAGE_COUNT:
      process.env.AGENTIC_BENCH_MAX_BLOCKED_STAGE_COUNT ?? "0",
    AGENTIC_BENCH_MAX_OBSERVABILITY_GAP_RUNS:
      process.env.AGENTIC_BENCH_MAX_OBSERVABILITY_GAP_RUNS ?? "0",
  };
}

function parseFailedOnlyStages(rawValue) {
  if (typeof rawValue !== "string" || rawValue.trim().length === 0) {
    return [];
  }
  return rawValue
    .split(",")
    .map((value) => value.trim())
    .filter((value) => stageSequence.includes(value));
}

function loadFailedStagesFromLatestSummary() {
  try {
    const raw = readFileSync(summaryArtifactPath, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return [];
    }
    const failed = Array.isArray(parsed.failedAfterRetry)
      ? parsed.failedAfterRetry
      : Array.isArray(parsed.failedFirstPass)
        ? parsed.failedFirstPass
        : [];
    return failed
      .map((value) => (typeof value === "string" ? value.trim() : ""))
      .filter((value) => stageSequence.includes(value));
  } catch {
    return [];
  }
}

function runLayer(layer, attempt, env) {
  const startedAt = Date.now();
  const layerRunId = `${runIdPrefix}-${layer}-a${attempt}`;
  const result = spawnSync(
    "node",
    ["scripts/run-agent-test-suite.mjs", `--layer=${layer}`],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {
        ...env,
        AGENT_TEST_SUITE_RUN_ID: layerRunId,
      },
      shell: process.platform === "win32",
    },
  );
  if (result.stdout) {
    process.stdout.write(result.stdout);
  }
  if (result.stderr) {
    process.stderr.write(result.stderr);
  }
  return {
    layer,
    attempt,
    status: result.status === 0 ? "passed" : "failed",
    exitCode: result.status ?? 1,
    latencyMs: Date.now() - startedAt,
    runId: layerRunId,
  };
}

function writeSummary(summary) {
  mkdirSync(path.dirname(summaryArtifactPath), { recursive: true });
  writeFileSync(summaryArtifactPath, JSON.stringify(summary, null, 2));
  console.log(`verification summary artifact: ${summaryArtifactPath}`);
}

const stagesFromEnv = parseFailedOnlyStages(
  process.env.AGENT_TEST_SUITE_ONLY_STAGES,
);
const stagesFromLatestSummary =
  rerunFailedOnly && stagesFromEnv.length === 0
    ? loadFailedStagesFromLatestSummary()
    : [];
const firstPassStages =
  stagesFromEnv.length > 0
    ? stagesFromEnv
    : rerunFailedOnly
      ? stagesFromLatestSummary.length > 0
        ? stagesFromLatestSummary
        : stageSequence
      : stageSequence;
let suiteEnv = buildSuiteEnv();

async function hydrateStageCredentials(layer) {
  if (!tokenSensitiveStages.has(layer)) {
    return;
  }
  const mustRotateBeforeStage =
    layer === "prod-smoke" &&
    process.env.AGENT_TEST_SUITE_FORCE_TOKEN_REFRESH_BEFORE_PROD_SMOKE !== "0";
  if (mustRotateBeforeStage) {
    hydratedEnv = await tryBootstrapEnvFromPlayground(hydratedEnv, [], {
      forceRefresh: true,
      required: process.env.PLAYGROUND_BOOTSTRAP_REQUIRED === "1",
    });
    hydratedEnv = await tryRefreshSmokeSession(hydratedEnv);
    if (!(await benchAccessTokenIsValid(hydratedEnv))) {
      throw new Error(
        `stage ${layer} requires a fresh smoke token, but forced refresh failed`,
      );
    }
    suiteEnv = buildSuiteEnv();
    return;
  }
  if (await benchAccessTokenIsValid(hydratedEnv)) {
    suiteEnv = buildSuiteEnv();
    return;
  }
  hydratedEnv = await tryBootstrapEnvFromPlayground(hydratedEnv, [], {
    forceRefresh: true,
    required: process.env.PLAYGROUND_BOOTSTRAP_REQUIRED === "1",
  });
  if (await benchAccessTokenIsValid(hydratedEnv)) {
    suiteEnv = buildSuiteEnv();
    return;
  }
  hydratedEnv = await tryRefreshSmokeSession(hydratedEnv);
  if (!(await benchAccessTokenIsValid(hydratedEnv))) {
    throw new Error(
      `stage ${layer} requires a valid AGENTIC_BENCH_ACCESS_TOKEN, but token validation failed before execution`,
    );
  }
  suiteEnv = buildSuiteEnv();
}

const records = [];
const failedFirstPass = [];

console.log("verification lane stages:");
console.log(`- rerunFailedOnly: ${rerunFailedOnly}`);
console.log(`- retryFailedStagesOnce: ${retryFailedStagesOnce}`);
console.log(`- stages: ${firstPassStages.join(", ")}`);
console.log("");

for (const layer of firstPassStages) {
  console.log(`==> verification stage ${layer} (attempt 1)`);
  try {
    await hydrateStageCredentials(layer);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    records.push({
      layer,
      attempt: 1,
      status: "failed",
      exitCode: 1,
      latencyMs: 0,
      runId: `${runIdPrefix}-${layer}-a1`,
      failureReason: message,
    });
    failedFirstPass.push(layer);
    continue;
  }
  const record = runLayer(layer, 1, suiteEnv);
  records.push(record);
  if (record.status === "failed") {
    failedFirstPass.push(layer);
  }
}

const failedAfterRetry = [...failedFirstPass];
if (retryFailedStagesOnce && failedFirstPass.length > 0) {
  for (const layer of failedFirstPass) {
    console.log(`==> verification stage ${layer} (attempt 2)`);
    try {
      await hydrateStageCredentials(layer);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(message);
      records.push({
        layer,
        attempt: 2,
        status: "failed",
        exitCode: 1,
        latencyMs: 0,
        runId: `${runIdPrefix}-${layer}-a2`,
        failureReason: message,
      });
      continue;
    }
    const retryRecord = runLayer(layer, 2, suiteEnv);
    records.push(retryRecord);
    if (retryRecord.status === "passed") {
      const index = failedAfterRetry.indexOf(layer);
      if (index >= 0) {
        failedAfterRetry.splice(index, 1);
      }
    }
  }
}

const summary = {
  runId: runIdPrefix,
  generatedAt: new Date().toISOString(),
  status: failedAfterRetry.length === 0 ? "passed" : "failed",
  rerunFailedOnly,
  retryFailedStagesOnce,
  stagesAttempted: firstPassStages,
  failedFirstPass,
  failedAfterRetry,
  records,
};

writeSummary(summary);

if (failedAfterRetry.length > 0) {
  process.exit(1);
}
