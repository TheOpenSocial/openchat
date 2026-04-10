#!/usr/bin/env node

const DEFAULT_WORLD_ID = "design-sandbox-v1";

function getArg(flag, fallback = undefined) {
  const exact = `${flag}=`;
  for (const value of process.argv.slice(2)) {
    if (value.startsWith(exact)) {
      return value.slice(exact.length);
    }
  }
  return fallback;
}

function requireArg(flag, fallback = undefined) {
  const value = getArg(flag, fallback);
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }
  throw new Error(`Missing required argument ${flag}=...`);
}

function resolveBaseUrl() {
  const value =
    getArg("--base-url") ||
    process.env.PLAYGROUND_BASE_URL ||
    process.env.SMOKE_BASE_URL ||
    process.env.STAGING_API_BASE_URL ||
    process.env.API_BASE_URL;
  if (!value) {
    throw new Error(
      "Missing base URL. Set --base-url or PLAYGROUND_BASE_URL / SMOKE_BASE_URL / STAGING_API_BASE_URL.",
    );
  }
  return value.replace(/\/+$/, "");
}

function resolveHeaders() {
  const adminUserId =
    getArg("--admin-user-id") ||
    process.env.PLAYGROUND_ADMIN_USER_ID ||
    process.env.SMOKE_ADMIN_USER_ID ||
    process.env.STAGING_SMOKE_ADMIN_USER_ID;
  const adminRole =
    getArg("--admin-role") ||
    process.env.PLAYGROUND_ADMIN_ROLE ||
    process.env.SMOKE_ADMIN_ROLE ||
    process.env.STAGING_SMOKE_ADMIN_ROLE ||
    "admin";
  const adminApiKey =
    getArg("--admin-api-key") ||
    process.env.PLAYGROUND_ADMIN_API_KEY ||
    process.env.SMOKE_ADMIN_API_KEY ||
    process.env.STAGING_SMOKE_ADMIN_API_KEY;
  if (!adminUserId || !adminApiKey) {
    throw new Error(
      "Missing admin credentials. Set --admin-user-id / --admin-api-key or PLAYGROUND_ADMIN_* / SMOKE_* vars.",
    );
  }
  return {
    "content-type": "application/json",
    "x-admin-user-id": adminUserId,
    "x-admin-role": adminRole,
    "x-admin-api-key": adminApiKey,
  };
}

async function callJson(baseUrl, pathname, init) {
  const response = await fetch(`${baseUrl}${pathname}`, init);
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(
      `${response.status} ${response.statusText}: ${JSON.stringify(payload)}`,
    );
  }
  return payload?.data ?? payload;
}

function assertCondition(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function validateScenarioPayload(scenario, payload) {
  const home = payload?.experience?.home;
  const activity = payload?.experience?.activity;

  assertCondition(home && activity, "inspect payload is missing experience summaries");

  switch (scenario) {
    case "baseline":
      assertCondition(
        home.status?.tone === "active" || home.status?.tone === "waiting",
        `baseline expected active or waiting home tone, received ${home.status?.tone ?? "unknown"}`,
      );
      assertCondition(
        home.spotlight?.coordination != null || home.spotlight?.topSuggestion != null,
        "baseline expected coordination or top suggestion spotlight",
      );
      return;
    case "waiting_replies":
      assertCondition(
        home.spotlight?.coordination?.title === "Waiting on replies",
        `waiting_replies expected coordination title "Waiting on replies", received ${home.spotlight?.coordination?.title ?? "unknown"}`,
      );
      assertCondition(
        home.spotlight?.coordination?.targetChatId == null,
        "waiting_replies should not hand off directly to chat",
      );
      return;
    case "activity_burst":
      assertCondition(
        Number(activity.counts?.unreadNotifications ?? 0) > 0,
        "activity_burst expected unread notifications",
      );
      return;
    case "stalled_search":
      assertCondition(
        home.status?.tone === "recovery",
        `stalled_search expected recovery tone, received ${home.status?.tone ?? "unknown"}`,
      );
      assertCondition(
        home.spotlight?.recovery != null,
        "stalled_search expected recovery spotlight",
      );
      return;
    default:
      throw new Error(`Unsupported validation scenario: ${scenario}`);
  }
}

function printUsage() {
  console.log(`Usage:
  node scripts/playground-sandbox-world.mjs --action=create [--world-id=${DEFAULT_WORLD_ID}] [--focal-user-id=<uuid>] [--reset=1]
  node scripts/playground-sandbox-world.mjs --action=get [--world-id=${DEFAULT_WORLD_ID}]
  node scripts/playground-sandbox-world.mjs --action=inspect [--world-id=${DEFAULT_WORLD_ID}]
  node scripts/playground-sandbox-world.mjs --action=validate [--world-id=${DEFAULT_WORLD_ID}] --scenario=<baseline|waiting_replies|activity_burst|stalled_search>
  node scripts/playground-sandbox-world.mjs --action=join [--world-id=${DEFAULT_WORLD_ID}] --focal-user-id=<uuid>
  node scripts/playground-sandbox-world.mjs --action=tick [--world-id=${DEFAULT_WORLD_ID}] [--note="..."]
  node scripts/playground-sandbox-world.mjs --action=scenario [--world-id=${DEFAULT_WORLD_ID}] --scenario=<baseline|waiting_replies|activity_burst|stalled_search>
  node scripts/playground-sandbox-world.mjs --action=reset [--world-id=${DEFAULT_WORLD_ID}]

Environment:
  PLAYGROUND_BASE_URL / SMOKE_BASE_URL / STAGING_API_BASE_URL
  PLAYGROUND_ADMIN_USER_ID / SMOKE_ADMIN_USER_ID / STAGING_SMOKE_ADMIN_USER_ID
  PLAYGROUND_ADMIN_API_KEY / SMOKE_ADMIN_API_KEY / STAGING_SMOKE_ADMIN_API_KEY
  PLAYGROUND_ADMIN_ROLE / SMOKE_ADMIN_ROLE / STAGING_SMOKE_ADMIN_ROLE`);
}

async function main() {
  const action = getArg("--action");
  if (!action || action === "help") {
    printUsage();
    process.exit(action ? 0 : 1);
  }

  const baseUrl = resolveBaseUrl();
  const headers = resolveHeaders();
  const worldId = getArg("--world-id", DEFAULT_WORLD_ID);

  let data;
  switch (action) {
    case "create": {
      const payload = {
        worldId,
        ...(getArg("--focal-user-id")
          ? { focalUserId: getArg("--focal-user-id") }
          : {}),
        ...(getArg("--reset") === "1" ? { reset: true } : {}),
      };
      data = await callJson(baseUrl, "/api/admin/playground/worlds", {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      });
      break;
    }
    case "get": {
      data = await callJson(
        baseUrl,
        `/api/admin/playground/worlds/${worldId}`,
        {
          method: "GET",
          headers,
        },
      );
      break;
    }
    case "inspect": {
      data = await callJson(
        baseUrl,
        `/api/admin/playground/worlds/${worldId}/inspect`,
        {
          method: "GET",
          headers,
        },
      );
      break;
    }
    case "join": {
      const focalUserId = requireArg("--focal-user-id");
      data = await callJson(
        baseUrl,
        `/api/admin/playground/worlds/${worldId}/join`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({ focalUserId }),
        },
      );
      break;
    }
    case "tick": {
      const note = getArg("--note");
      data = await callJson(
        baseUrl,
        `/api/admin/playground/worlds/${worldId}/tick`,
        {
          method: "POST",
          headers,
          body: JSON.stringify(note ? { note } : {}),
        },
      );
      break;
    }
    case "reset": {
      data = await callJson(
        baseUrl,
        `/api/admin/playground/worlds/${worldId}/reset`,
        {
          method: "POST",
          headers,
        },
      );
      break;
    }
    case "scenario": {
      const scenario = requireArg("--scenario");
      data = await callJson(
        baseUrl,
        `/api/admin/playground/worlds/${worldId}/scenario`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({ scenario }),
        },
      );
      break;
    }
    case "validate": {
      const scenario = requireArg("--scenario");
      await callJson(
        baseUrl,
        `/api/admin/playground/worlds/${worldId}/scenario`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({ scenario }),
        },
      );
      data = await callJson(
        baseUrl,
        `/api/admin/playground/worlds/${worldId}/inspect`,
        {
          method: "GET",
          headers,
        },
      );
      validateScenarioPayload(scenario, data);
      data = {
        validated: true,
        scenario,
        worldId,
        home: data.experience.home.status,
        activityCounts: data.experience.activity.counts,
      };
      break;
    }
    default:
      throw new Error(`Unsupported action: ${action}`);
  }

  console.log(JSON.stringify(data, null, 2));
}

main().catch((error) => {
  console.error(
    `[playground-sandbox-world] ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
});
