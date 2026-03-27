#!/usr/bin/env node

import { appendFileSync } from "node:fs";

const baseUrl = (process.env.SMOKE_BASE_URL || "").trim().replace(/\/+$/, "");
const refreshToken = (process.env.SMOKE_REFRESH_TOKEN || "").trim();
const required = process.env.SMOKE_REFRESH_REQUIRED === "1";

function persistEnv(key, value) {
  if (!value) return;
  process.env[key] = value;
  const githubEnv = process.env.GITHUB_ENV;
  if (githubEnv && githubEnv.trim().length > 0) {
    appendFileSync(githubEnv, `${key}=${value}\n`, { encoding: "utf8" });
  }
}

async function main() {
  console.log("Smoke session refresh");
  console.log(`- baseUrl: ${baseUrl || "(unset)"}`);
  console.log(`- refreshToken: ${refreshToken ? "set" : "unset"}`);
  console.log(`- required: ${required ? "yes" : "no"}`);

  if (!baseUrl || !refreshToken) {
    const message = "skipping refresh: SMOKE_BASE_URL or SMOKE_REFRESH_TOKEN is missing";
    if (required) {
      console.error(message);
      process.exit(1);
    }
    console.log(message);
    return;
  }

  try {
    const response = await fetch(`${baseUrl}/api/auth/refresh`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        refreshToken,
        deviceId: "staging-verification-lane",
        deviceName: "Staging Verification Lane",
      }),
    });
    const payload = await response.json();
    if (!response.ok || !payload?.success || !payload?.data?.accessToken) {
      const preview = JSON.stringify(payload).slice(0, 300);
      const message = `refresh failed (${response.status}): ${preview}`;
      if (required) {
        console.error(message);
        process.exit(1);
      }
      console.warn(message);
      return;
    }

    const nextAccessToken = String(payload.data.accessToken).trim();
    const nextRefreshToken =
      typeof payload.data.refreshToken === "string" &&
      payload.data.refreshToken.trim().length > 0
        ? payload.data.refreshToken.trim()
        : refreshToken;

    persistEnv("SMOKE_ACCESS_TOKEN", nextAccessToken);
    persistEnv("AGENTIC_BENCH_ACCESS_TOKEN", nextAccessToken);
    persistEnv("SMOKE_REFRESH_TOKEN", nextRefreshToken);

    console.log("smoke session refreshed successfully");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (required) {
      console.error(`refresh request failed: ${message}`);
      process.exit(1);
    }
    console.warn(`refresh request failed: ${message}`);
  }
}

await main();
