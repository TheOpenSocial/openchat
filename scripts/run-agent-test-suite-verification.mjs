#!/usr/bin/env node

import { spawnSync } from "node:child_process";

const requiredEnv = [
  "AGENTIC_BENCH_ACCESS_TOKEN",
  "AGENTIC_BENCH_USER_ID",
  "AGENTIC_BENCH_THREAD_ID",
  "AGENTIC_VERIFICATION_LANE_ID",
  "SMOKE_BASE_URL",
  "SMOKE_ACCESS_TOKEN",
  "SMOKE_ADMIN_USER_ID",
  "SMOKE_AGENT_THREAD_ID",
  "SMOKE_USER_ID",
  "ONBOARDING_PROBE_TOKEN",
];

const missing = requiredEnv.filter((key) => {
  const value = process.env[key];
  return typeof value !== "string" || value.trim().length === 0;
});

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
      AGENTIC_BENCH_ADMIN_USER_ID:
        process.env.AGENTIC_BENCH_ADMIN_USER_ID ?? process.env.SMOKE_ADMIN_USER_ID,
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
