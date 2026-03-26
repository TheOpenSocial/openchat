#!/usr/bin/env node

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
  AGENTIC_BENCH_ACCESS_TOKEN: readWithStagingProdFallback(
    "AGENTIC_BENCH_ACCESS_TOKEN",
    "SMOKE_ACCESS_TOKEN",
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

const missing = Object.entries(resolvedEnv)
  .filter(([, value]) => value.length === 0)
  .map(([key]) => key);

if (missing.length > 0) {
  console.error(
    `verification lane is missing required env: ${missing.join(", ")}`,
  );
  process.exit(1);
}

const result = spawnSync(
  "node",
  ["scripts/run-agent-test-suite.mjs", "--layer=full"],
  {
    cwd: process.cwd(),
    encoding: "utf8",
    env: {
      ...process.env,
      AGENT_TEST_SUITE_REQUIRE_BENCHMARK: "1",
      AGENT_TEST_SUITE_ENABLE_PROD_SMOKE: "1",
      AGENT_TEST_SUITE_REQUIRE_PROD_SMOKE: "1",
      AGENTIC_BENCH_ENABLE_WORKFLOW_HEALTH: "1",
      AGENTIC_BENCH_REQUIRE_WORKFLOW_HEALTH: "1",
      ...resolvedEnv,
      AGENTIC_BENCH_ADMIN_USER_ID:
        process.env.AGENTIC_BENCH_ADMIN_USER_ID ??
        process.env.SMOKE_ADMIN_USER_ID ??
        resolvedEnv.SMOKE_ADMIN_USER_ID,
      AGENTIC_BENCH_ADMIN_ROLE:
        process.env.AGENTIC_BENCH_ADMIN_ROLE ??
        process.env.SMOKE_ADMIN_ROLE ??
        "support",
      AGENTIC_BENCH_ADMIN_API_KEY:
        process.env.AGENTIC_BENCH_ADMIN_API_KEY ?? process.env.SMOKE_ADMIN_API_KEY,
      AGENTIC_BENCH_MAX_CRITICAL_WORKFLOW_RUNS:
        process.env.AGENTIC_BENCH_MAX_CRITICAL_WORKFLOW_RUNS ?? "0",
      AGENTIC_BENCH_MAX_FAILED_STAGE_COUNT:
        process.env.AGENTIC_BENCH_MAX_FAILED_STAGE_COUNT ?? "0",
      AGENTIC_BENCH_MAX_BLOCKED_STAGE_COUNT:
        process.env.AGENTIC_BENCH_MAX_BLOCKED_STAGE_COUNT ?? "0",
      AGENTIC_BENCH_MAX_OBSERVABILITY_GAP_RUNS:
        process.env.AGENTIC_BENCH_MAX_OBSERVABILITY_GAP_RUNS ?? "0",
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

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}
