#!/usr/bin/env node

import { appendFileSync } from "node:fs";

const baseUrl = (process.env.SMOKE_BASE_URL || "").trim().replace(/\/+$/, "");
const hostHeader = (process.env.SMOKE_HOST_HEADER || "").trim();
const adminUserId = (process.env.SMOKE_ADMIN_USER_ID || "").trim();
const adminRole = (process.env.SMOKE_ADMIN_ROLE || "admin").trim();
const adminApiKey = (process.env.SMOKE_ADMIN_API_KEY || "").trim();
const applicationKey = (process.env.SMOKE_APPLICATION_KEY || "").trim();
const applicationToken = (process.env.SMOKE_APPLICATION_TOKEN || "").trim();
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
  console.log(`- applicationKey: ${applicationKey ? "set" : "unset"}`);
  console.log(`- applicationToken: ${applicationToken ? "set" : "unset"}`);
  console.log(`- hostHeader: ${hostHeader || "(unset)"}`);

  if (!baseUrl) {
    const message = "missing SMOKE_BASE_URL";
    if (required) {
      console.error(message);
      process.exit(1);
    }
    console.warn(message);
    return;
  }

  const candidateRequests = [];
  if (applicationKey && applicationToken) {
    candidateRequests.push({
      url: `${baseUrl}/api/admin/ops/smoke-session/exchange`,
      headers: {
        "content-type": "application/json",
        ...(hostHeader ? { Host: hostHeader } : {}),
        "x-application-key": applicationKey,
        "x-application-token": applicationToken,
      },
      label: "application_exchange",
    });
  }
  if (adminUserId) {
    candidateRequests.push({
      url: `${baseUrl}/api/admin/ops/smoke-session`,
      headers: {
        "content-type": "application/json",
        ...(hostHeader ? { Host: hostHeader } : {}),
        "x-admin-user-id": adminUserId,
        "x-admin-role": adminRole,
        ...(adminApiKey ? { "x-admin-api-key": adminApiKey } : {}),
      },
      label: "admin_bootstrap",
    });
  }

  if (candidateRequests.length === 0) {
    const message =
      "missing bootstrap credentials: set SMOKE_APPLICATION_KEY/SMOKE_APPLICATION_TOKEN or SMOKE_ADMIN_USER_ID";
    if (required) {
      console.error(message);
      process.exit(1);
    }
    console.warn(message);
    return;
  }

  try {
    let lastFailure = null;
    for (const candidate of candidateRequests) {
      const response = await fetch(candidate.url, {
        method: "POST",
        headers: candidate.headers,
        body: JSON.stringify({}),
      });
      const payload = await response.json();

      if (
        response.ok &&
        payload?.success &&
        typeof payload?.data?.env === "object"
      ) {
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
        console.log(
          `smoke session bootstrapped and exported via ${candidate.label}`,
        );
        return;
      }

      const preview = JSON.stringify(payload).slice(0, 400);
      lastFailure = `smoke bootstrap failed via ${candidate.label} (${response.status}): ${preview}`;
      console.warn(lastFailure);
    }

    if (required) {
      console.error(lastFailure ?? "smoke bootstrap failed");
      process.exit(1);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const cause =
      error && typeof error === "object" && "cause" in error
        ? String(error.cause)
        : "";
    const combined = `${message}${cause ? ` (cause: ${cause})` : ""}`;
    if (required) {
      console.error(`smoke bootstrap request failed: ${combined}`);
      process.exit(1);
    }
    console.warn(`smoke bootstrap request failed: ${combined}`);
  }
}

await main();
