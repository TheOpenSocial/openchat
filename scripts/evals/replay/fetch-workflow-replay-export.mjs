#!/usr/bin/env node

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { resolveSharedAdminEnv } from "../shared/env.mjs";

function normalizeString(value, fallback = "") {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : fallback;
}

function parseArgs(argv = process.argv.slice(2), env = process.env) {
  const flags = new Map();
  for (const arg of argv) {
    if (!arg.startsWith("--")) continue;
    const withoutPrefix = arg.slice(2);
    const [key, rawValue] = withoutPrefix.split("=", 2);
    flags.set(key, rawValue ?? "true");
  }

  const shared = resolveSharedAdminEnv(env);
  return {
    baseUrl: normalizeString(
      flags.get("base-url") ?? shared.baseUrl,
      shared.baseUrl,
    ).replace(/\/+$/, ""),
    outputPath: path.resolve(
      process.cwd(),
      normalizeString(
        flags.get("output") ?? env.EVAL_REPLAY_EXPORT_OUTPUT,
        path.join(".artifacts", "eval-fetch", "workflow-replay-export.json"),
      ),
    ),
    limit: normalizeString(
      flags.get("limit") ?? env.EVAL_REPLAY_EXPORT_LIMIT,
      "10",
    ),
    fetchLimit: normalizeString(
      flags.get("fetch-limit") ?? env.EVAL_REPLAY_EXPORT_FETCH_LIMIT,
      "50",
    ),
    adminUserId: normalizeString(
      flags.get("admin-user-id") ?? shared.adminUserId,
      shared.adminUserId,
    ),
    adminRole: normalizeString(
      flags.get("admin-role") ?? shared.adminRole,
      shared.adminRole,
    ),
    adminApiKey: normalizeString(
      flags.get("admin-api-key") ?? shared.adminApiKey,
      shared.adminApiKey,
    ),
    accessToken: normalizeString(
      flags.get("access-token") ?? shared.accessToken,
      shared.accessToken,
    ),
    hostHeader: normalizeString(
      flags.get("host-header") ?? shared.hostHeader,
      shared.hostHeader,
    ),
  };
}

function toPositiveInt(value, fallback) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function buildHeaders(config) {
  const headers = {
    Accept: "application/json",
    "x-admin-user-id": config.adminUserId,
    "x-admin-role": config.adminRole,
  };
  if (config.adminApiKey) headers["x-admin-api-key"] = config.adminApiKey;
  if (config.accessToken)
    headers.Authorization = `Bearer ${config.accessToken}`;
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
    throw new Error(
      `Request failed for ${url}: ${response.status} ${JSON.stringify(body)}`,
    );
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
  const failureTaxonomy = normalizeString(
    detail?.insights?.failureClass,
    "none",
  );

  return {
    conversationId: normalizeString(
      run.workflowRunId,
      `workflow-replay-${index + 1}`,
    ),
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
      allowSideEffects:
        Array.isArray(run?.sideEffects) && run.sideEffects.length > 0,
    },
    observed: {
      selectedTool,
      toolCalls,
      behaviors: [],
      outputText,
      latencyMs: 0,
      sideEffects: Array.isArray(run?.sideEffects)
        ? run.sideEffects.length > 0
        : false,
    },
    metadata: {
      workflowRunId: run.workflowRunId ?? null,
      traceId: run.traceId ?? null,
      failureClass: failureTaxonomy,
      domain: run.domain ?? null,
      replayability: run.replayability ?? null,
      health: run.health ?? null,
      stageStatusCounts: run.stageStatusCounts ?? null,
      traceEventCount: trace.eventCount ?? null,
    },
  };
}

function workflowSelectionScore(run) {
  const health = normalizeString(run?.health, "unknown");
  const domain = normalizeString(run?.domain, "unknown");
  const replayability = normalizeString(run?.replayability, "unknown");
  const sideEffects = Array.isArray(run?.sideEffects)
    ? run.sideEffects.length
    : 0;
  let score = 0;
  if (replayability === "replayable") score += 4;
  if (health !== "healthy") score += 3;
  if (domain !== "unknown") score += 2;
  if (sideEffects > 0) score += 1;
  return score;
}

export function selectDiverseWorkflowRuns(runs, limit) {
  const target = toPositiveInt(limit, 10);
  const pool = Array.isArray(runs) ? runs.slice() : [];
  const selected = [];
  const seenIds = new Set();
  const seenDomains = new Set();
  const seenHealth = new Set();

  const sorted = pool.sort((left, right) => {
    const delta = workflowSelectionScore(right) - workflowSelectionScore(left);
    if (delta !== 0) return delta;
    return normalizeString(left?.workflowRunId).localeCompare(
      normalizeString(right?.workflowRunId),
    );
  });

  function takeWhere(predicate) {
    for (const run of sorted) {
      const workflowRunId = normalizeString(run?.workflowRunId, "");
      if (!workflowRunId || seenIds.has(workflowRunId)) continue;
      if (!predicate(run)) continue;
      selected.push(run);
      seenIds.add(workflowRunId);
      seenDomains.add(normalizeString(run?.domain, "unknown"));
      seenHealth.add(normalizeString(run?.health, "unknown"));
      if (selected.length >= target) return true;
    }
    return selected.length >= target;
  }

  takeWhere((run) => !seenDomains.has(normalizeString(run?.domain, "unknown")));
  takeWhere((run) => !seenHealth.has(normalizeString(run?.health, "unknown")));
  takeWhere((run) => normalizeString(run?.health, "unknown") !== "healthy");
  takeWhere(() => true);

  return selected.slice(0, target);
}

export async function fetchWorkflowReplayExport(
  argv = process.argv.slice(2),
  env = process.env,
  fetchImpl = fetch,
) {
  const config = parseArgs(argv, env);
  const limit = toPositiveInt(config.limit, 10);
  const fetchLimit = Math.max(toPositiveInt(config.fetchLimit, 50), limit);
  const headers = buildHeaders(config);
  const listUrl = `${config.baseUrl}/api/admin/ops/agent-workflows?limit=${encodeURIComponent(fetchLimit)}&replayability=replayable`;
  const snapshot = await requestJson(fetchImpl, listUrl, headers);
  const runs = selectDiverseWorkflowRuns(
    Array.isArray(snapshot?.runs) ? snapshot.runs : [],
    limit,
  );

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
      requestedRunCount: limit,
      fetchedRunCount: Array.isArray(snapshot?.runs) ? snapshot.runs.length : 0,
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
