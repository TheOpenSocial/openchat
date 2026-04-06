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

  return {
    baseUrl: normalizeString(
      flags.get("base-url") ?? env.EVAL_BASE_URL ?? env.SMOKE_BASE_URL,
      "http://localhost:3001",
    ).replace(/\/+$/, ""),
    outputPath: path.resolve(
      process.cwd(),
      normalizeString(
        flags.get("output") ?? env.EVAL_REPLAY_EXPORT_OUTPUT,
        path.join(".artifacts", "eval-fetch", "workflow-replay-export.json"),
      ),
    ),
    limit: normalizeString(flags.get("limit") ?? env.EVAL_REPLAY_EXPORT_LIMIT, "10"),
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

async function requestJson(fetchImpl, url, headers) {
  let response;
  try {
    response = await fetchImpl(url, { method: "GET", headers });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Request failed for ${url}: ${message}`);
  }
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`Request failed for ${url}: ${response.status} ${JSON.stringify(body)}`);
  }
  return body?.data ?? body;
}

function normalizeReplayCaseFromWorkflow(detail, index) {
  const run = detail?.run ?? {};
  const trace = detail?.trace ?? {};
  const traceEvents = Array.isArray(trace?.events) ? trace.events : [];
  const outputText = traceEvents
    .map((event) => normalizeString(event?.summary, ""))
    .filter(Boolean)
    .join("\n");
  const toolCalls = Array.from(
    new Set(
      traceEvents
        .map((event) => normalizeString(event?.metadata?.tool, ""))
        .filter(Boolean),
    ),
  );
  const selectedTool = toolCalls[0] ?? "";
  const failureTaxonomy = normalizeString(detail?.insights?.failureClass, "none");

  return {
    conversationId: normalizeString(run.workflowRunId, `workflow-replay-${index + 1}`),
    channel: "agent_workflow",
    provider: normalizeString(run.domain, "unknown"),
    toolFamily: failureTaxonomy === "none" ? "workflow" : failureTaxonomy,
    transcript: traceEvents.map((event) => ({
      role: event?.action?.includes("user") ? "user" : "assistant",
      content: normalizeString(event?.summary, event?.action ?? "trace_event"),
    })),
    expected: {
      forbiddenTools: [],
      forbiddenToolCalls: [],
      maxLatencyMs: null,
    },
    observed: {
      selectedTool,
      toolCalls,
      behaviors: [],
      outputText,
      latencyMs: 0,
      sideEffects: Array.isArray(run?.sideEffects) ? run.sideEffects.length > 0 : false,
    },
    metadata: {
      workflowRunId: run.workflowRunId ?? null,
      traceId: run.traceId ?? null,
      replayability: run.replayability ?? null,
      health: run.health ?? null,
      stageStatusCounts: run.stageStatusCounts ?? null,
      traceEventCount: trace.eventCount ?? null,
    },
  };
}

export async function fetchWorkflowReplayExport(
  argv = process.argv.slice(2),
  env = process.env,
  fetchImpl = fetch,
) {
  const config = parseArgs(argv, env);
  const headers = buildHeaders(config);
  const listUrl = `${config.baseUrl}/api/admin/ops/agent-workflows?limit=${encodeURIComponent(config.limit)}&replayability=replayable`;
  const snapshot = await requestJson(fetchImpl, listUrl, headers);
  const runs = Array.isArray(snapshot?.runs) ? snapshot.runs : [];

  const details = [];
  for (const run of runs) {
    const workflowRunId = normalizeString(run?.workflowRunId, "");
    if (!workflowRunId) continue;
    const detailUrl = `${config.baseUrl}/api/admin/ops/agent-workflows/details?workflowRunId=${encodeURIComponent(workflowRunId)}`;
    const detail = await requestJson(fetchImpl, detailUrl, headers);
    details.push(detail);
  }

  const exportPayload = {
    version: 1,
    suite: "workflow-replay-export",
    generatedAt: new Date().toISOString(),
    source: {
      baseUrl: config.baseUrl,
      type: "agent-workflows",
      runCount: details.length,
    },
    conversations: details.map((detail, index) =>
      normalizeReplayCaseFromWorkflow(detail, index),
    ),
  };

  mkdirSync(path.dirname(config.outputPath), { recursive: true });
  writeFileSync(config.outputPath, JSON.stringify(exportPayload, null, 2));

  return {
    outputPath: config.outputPath,
    runCount: details.length,
    baseUrl: config.baseUrl,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = await fetchWorkflowReplayExport();
  console.log(JSON.stringify(result, null, 2));
}
