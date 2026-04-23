#!/usr/bin/env node

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { resolveSharedAdminEnv } from "./evals/shared/env.mjs";

function parseArgs(argv) {
  const flags = {};
  const positional = [];
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--") {
      continue;
    }
    if (!token.startsWith("--")) {
      positional.push(token);
      continue;
    }

    const [rawKey, rawValue] = token.slice(2).split("=", 2);
    const key = rawKey.trim();
    if (!key) continue;
    if (rawValue !== undefined) {
      flags[key] = rawValue;
      continue;
    }
    const next = argv[index + 1];
    if (next && !next.startsWith("--")) {
      flags[key] = next;
      index += 1;
      continue;
    }
    flags[key] = "true";
  }
  return { flags, positional };
}

function normalizeUrl(value) {
  return (value || "").trim().replace(/\/+$/, "");
}

function prettyJson(value) {
  return JSON.stringify(value, null, 2);
}

function getActionPlan(action) {
  switch (action) {
    case "create":
      return [{ kind: "create", method: "POST", suffix: "" }];
    case "get":
      return [{ kind: "get", method: "GET", suffix: `/${worldId}` }];
    case "join":
      return [{ kind: "join", method: "POST", suffix: `/${worldId}/join` }];
    case "tick":
      return [{ kind: "tick", method: "POST", suffix: `/${worldId}/tick` }];
    case "reset":
      return [{ kind: "reset", method: "POST", suffix: `/${worldId}/reset` }];
    case "all":
    default:
      return [
        { kind: "create", method: "POST", suffix: "" },
        { kind: "get", method: "GET", suffix: `/${worldId}` },
        { kind: "join", method: "POST", suffix: `/${worldId}/join` },
        { kind: "tick", method: "POST", suffix: `/${worldId}/tick` },
        { kind: "get", method: "GET", suffix: `/${worldId}` },
        { kind: "reset", method: "POST", suffix: `/${worldId}/reset` },
      ];
  }
}

const { flags, positional } = parseArgs(process.argv.slice(2));
const env = resolveSharedAdminEnv(process.env);
const action = (flags.action || positional[0] || "all").trim();
const worldId = (
  flags["world-id"] ||
  process.env.SANDBOX_WORLD_ID ||
  "design-sandbox-v1"
).trim();
const focalUserId = (
  flags["focal-user-id"] ||
  process.env.SANDBOX_WORLD_FOCAL_USER_ID ||
  env.adminUserId
).trim();
const baseUrl = normalizeUrl(
  flags["base-url"] || process.env.SANDBOX_WORLD_BASE_URL || env.baseUrl,
);
const adminUserId = (flags["admin-user-id"] || env.adminUserId).trim();
const adminRole = (flags["admin-role"] || env.adminRole || "admin").trim();
const adminApiKey = (flags["admin-api-key"] || env.adminApiKey || "").trim();
const hostHeader = (flags["host-header"] || env.hostHeader || "").trim();
const dryRun = flags["dry-run"] === "1" || flags["dry-run"] === "true";
const artifactPath =
  flags["artifact-path"] ||
  `.artifacts/staging-sandbox-world/${Date.now()}.json`;

if (
  flags.help === "true" ||
  positional.includes("--help") ||
  positional.includes("-h")
) {
  console.log(
    [
      "Usage: pnpm staging:sandbox-world -- --action=<create|get|join|tick|reset|all> [options]",
      "",
      "Options:",
      "  --world-id=<id>           Sandbox world id (default: design-sandbox-v1)",
      "  --focal-user-id=<uuid>    Focal user for join/create flows",
      "  --base-url=<url>          Override base URL",
      "  --admin-user-id=<uuid>    Override admin user id",
      "  --admin-role=<role>       Override admin role",
      "  --admin-api-key=<key>     Override admin API key",
      "  --artifact-path=<path>    Write a JSON artifact (default under .artifacts/)",
      "  --dry-run=1               Print planned requests without calling the API",
    ].join("\n"),
  );
  process.exit(0);
}

if (!baseUrl) {
  console.error("Missing base URL. Set SMOKE_BASE_URL or pass --base-url.");
  process.exit(1);
}
if (!adminUserId) {
  console.error(
    "Missing admin user id. Set SMOKE_ADMIN_USER_ID or pass --admin-user-id.",
  );
  process.exit(1);
}

const actionPlan = getActionPlan(action);
const headers = {
  Accept: "application/json",
  "content-type": "application/json",
  "x-admin-user-id": adminUserId,
  "x-admin-role": adminRole,
  ...(adminApiKey ? { "x-admin-api-key": adminApiKey } : {}),
  ...(hostHeader ? { Host: hostHeader } : {}),
};

async function callWorld(pathSuffix, method, body) {
  const response = await fetch(
    `${baseUrl}/api/admin/playground/worlds${pathSuffix}`,
    {
      method,
      headers,
      body: method === "GET" ? undefined : JSON.stringify(body ?? {}),
    },
  );
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (!response.ok || !payload?.success) {
    const preview = payload ? prettyJson(payload).slice(0, 400) : "null";
    throw new Error(
      `sandbox world request failed (${method} ${pathSuffix || "/"}) -> ${response.status}: ${preview}`,
    );
  }
  return payload.data;
}

function printStepResult(step, data) {
  console.log(`== ${step.kind} ==`);
  console.log(prettyJson(data));
  console.log("");
}

async function main() {
  console.log("Sandbox world operator config:");
  console.log(`- action: ${action}`);
  console.log(`- baseUrl: ${baseUrl}`);
  console.log(`- worldId: ${worldId}`);
  console.log(`- focalUserId: ${focalUserId}`);
  console.log(`- adminUserId: ${adminUserId}`);
  console.log(`- adminRole: ${adminRole}`);
  console.log(`- adminApiKey: ${adminApiKey ? "set" : "unset"}`);
  console.log(`- hostHeader: ${hostHeader || "(none)"}`);
  console.log(`- dryRun: ${dryRun}`);
  console.log("");

  if (dryRun) {
    console.log("Planned requests:");
    for (const step of actionPlan) {
      const suffix = step.kind === "create" ? "" : step.suffix;
      const body =
        step.kind === "create"
          ? { worldId }
          : step.kind === "join"
            ? { focalUserId }
            : {};
      console.log(
        `- ${step.kind}: ${step.method} ${baseUrl}/api/admin/playground/worlds${suffix} body=${prettyJson(body)}`,
      );
    }
    return;
  }

  const records = [];
  for (const step of actionPlan) {
    const body =
      step.kind === "create"
        ? { worldId }
        : step.kind === "join"
          ? { focalUserId }
          : {};
    const data = await callWorld(step.suffix, step.method, body);
    records.push({ step: step.kind, data });
    printStepResult(step, data);
  }

  if (artifactPath) {
    const resolvedPath = path.resolve(process.cwd(), artifactPath);
    mkdirSync(path.dirname(resolvedPath), { recursive: true });
    writeFileSync(
      resolvedPath,
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          config: {
            action,
            baseUrl,
            worldId,
            focalUserId,
          },
          records,
        },
        null,
        2,
      ),
    );
    console.log(`Artifact written to ${resolvedPath}`);
  }
}

await main();
