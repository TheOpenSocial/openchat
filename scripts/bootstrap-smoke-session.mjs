#!/usr/bin/env node

import { appendFileSync } from "node:fs";

const baseUrl = (process.env.SMOKE_BASE_URL || "").trim().replace(/\/+$/, "");
const hostHeader = (process.env.SMOKE_HOST_HEADER || "").trim();
const adminUserId = (process.env.SMOKE_ADMIN_USER_ID || "").trim();
const adminRole = (process.env.SMOKE_ADMIN_ROLE || "admin").trim();
const adminApiKey = (process.env.SMOKE_ADMIN_API_KEY || "").trim();
const required = process.env.SMOKE_BOOTSTRAP_REQUIRED !== "0";

function persistEnv(key, value) {
  if (!value) return;
  process.env[key] = value;
  const githubEnv = process.env.GITHUB_ENV;
  if (githubEnv && githubEnv.trim().length > 0) {
    appendFileSync(githubEnv, `${key}=${value}\n`, { encoding: "utf8" });
  }
}

async function main() {
  console.log("Smoke session bootstrap");
  console.log(`- baseUrl: ${baseUrl || "(unset)"}`);
  console.log(`- adminUserId: ${adminUserId ? "set" : "unset"}`);
  console.log(`- adminRole: ${adminRole}`);
  console.log(`- adminApiKey: ${adminApiKey ? "set" : "unset"}`);
  console.log(`- hostHeader: ${hostHeader || "(unset)"}`);

  if (!baseUrl || !adminUserId) {
    const message = "missing SMOKE_BASE_URL or SMOKE_ADMIN_USER_ID";
    if (required) {
      console.error(message);
      process.exit(1);
    }
    console.warn(message);
    return;
  }

  try {
    const response = await fetch(`${baseUrl}/api/admin/ops/smoke-session`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(hostHeader ? { Host: hostHeader } : {}),
        "x-admin-user-id": adminUserId,
        "x-admin-role": adminRole,
        ...(adminApiKey ? { "x-admin-api-key": adminApiKey } : {}),
      },
      body: JSON.stringify({}),
    });
    const payload = await response.json();
    if (!response.ok || !payload?.success || typeof payload?.data?.env !== "object") {
      const preview = JSON.stringify(payload).slice(0, 400);
      const message = `smoke bootstrap failed (${response.status}): ${preview}`;
      if (required) {
        console.error(message);
        process.exit(1);
      }
      console.warn(message);
      return;
    }

    const envPayload = payload.data.env;
    const keys = [
      "SMOKE_ACCESS_TOKEN",
      "SMOKE_REFRESH_TOKEN",
      "SMOKE_USER_ID",
      "SMOKE_AGENT_THREAD_ID",
      "SMOKE_ADMIN_USER_ID",
      "AGENTIC_BENCH_ACCESS_TOKEN",
      "AGENTIC_BENCH_USER_ID",
      "AGENTIC_BENCH_THREAD_ID",
      "AGENTIC_VERIFICATION_LANE_ID",
      "ONBOARDING_PROBE_TOKEN",
    ];
    for (const key of keys) {
      const value = envPayload[key];
      if (typeof value === "string" && value.trim().length > 0) {
        persistEnv(key, value.trim());
      }
    }
    console.log("smoke session bootstrapped and exported");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (required) {
      console.error(`smoke bootstrap request failed: ${message}`);
      process.exit(1);
    }
    console.warn(`smoke bootstrap request failed: ${message}`);
  }
}

await main();
