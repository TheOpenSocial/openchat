#!/usr/bin/env node

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

function normalizeString(value, fallback = "") {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;
}

function parseArgs(argv = process.argv.slice(2), env = process.env) {
  const flags = new Map();
  for (const arg of argv) {
    if (!arg.startsWith("--")) continue;
    const withoutPrefix = arg.slice(2);
    const [key, rawValue] = withoutPrefix.split("=", 2);
    flags.set(key, rawValue ?? "true");
  }

  const baseUrl = normalizeString(
    flags.get("base-url") ?? env.EVAL_BASE_URL ?? env.SMOKE_BASE_URL,
    "http://localhost:3001",
  ).replace(/\/+$/, "");

  return {
    baseUrl,
    outputPath: path.resolve(
      process.cwd(),
      normalizeString(
        flags.get("output") ?? env.EVAL_WORKFLOW_SNAPSHOT_OUTPUT,
        path.join(".artifacts", "eval-fetch", "agent-workflows-snapshot.json"),
      ),
    ),
    limit: normalizeString(flags.get("limit") ?? env.EVAL_WORKFLOW_LIMIT, "25"),
    adminUserId: normalizeString(
      flags.get("admin-user-id") ?? env.EVAL_ADMIN_USER_ID ?? env.SMOKE_ADMIN_USER_ID,
      "11111111-1111-4111-8111-111111111111",
    ),
    adminRole: normalizeString(
      flags.get("admin-role") ?? env.EVAL_ADMIN_ROLE ?? env.SMOKE_ADMIN_ROLE,
      "support",
    ),
    adminApiKey: normalizeString(
      flags.get("admin-api-key") ?? env.EVAL_ADMIN_API_KEY ?? env.SMOKE_ADMIN_API_KEY,
      "",
    ),
    accessToken: normalizeString(
      flags.get("access-token") ?? env.EVAL_ACCESS_TOKEN ?? env.SMOKE_ACCESS_TOKEN,
      "",
    ),
    hostHeader: normalizeString(
      flags.get("host-header") ?? env.EVAL_HOST_HEADER ?? env.SMOKE_HOST_HEADER,
      "",
    ),
  };
}

function buildHeaders(config) {
  const headers = {
    Accept: "application/json",
    "x-admin-user-id": config.adminUserId,
    "x-admin-role": config.adminRole,
  };
  if (config.adminApiKey) headers["x-admin-api-key"] = config.adminApiKey;
  if (config.accessToken) headers.Authorization = `Bearer ${config.accessToken}`;
  if (config.hostHeader) headers.Host = config.hostHeader;
  return headers;
}

export async function fetchAgentWorkflowsSnapshot(
  argv = process.argv.slice(2),
  env = process.env,
  fetchImpl = fetch,
) {
  const config = parseArgs(argv, env);
  const query = new URLSearchParams({ limit: config.limit });
  const url = `${config.baseUrl}/api/admin/ops/agent-workflows?${query.toString()}`;

  let response;
  try {
    response = await fetchImpl(url, {
      method: "GET",
      headers: buildHeaders(config),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to fetch agent workflow snapshot from ${url}: ${message}`);
  }

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(
      `Failed to fetch agent workflow snapshot: ${response.status} ${JSON.stringify(body)}`,
    );
  }

  const payload =
    body && typeof body === "object" && body.data && typeof body.data === "object"
      ? body.data
      : body;

  mkdirSync(path.dirname(config.outputPath), { recursive: true });
  writeFileSync(config.outputPath, JSON.stringify(payload, null, 2));

  return {
    outputPath: config.outputPath,
    baseUrl: config.baseUrl,
    runCount: Array.isArray(payload?.runs) ? payload.runs.length : 0,
    totalRuns: Number(payload?.summary?.totalRuns ?? 0),
    criticalRuns: Number(payload?.summary?.health?.critical ?? 0),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = await fetchAgentWorkflowsSnapshot();
  console.log(JSON.stringify(result, null, 2));
}
