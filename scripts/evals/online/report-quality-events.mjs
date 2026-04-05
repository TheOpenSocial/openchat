#!/usr/bin/env node

import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import {
  createEvalRunEnvelope,
  finalizeEvalRun,
  summarizeCaseRows,
} from "../shared/artifacts.mjs";

const DEFAULT_EVENTS_PATH = "scripts/evals/online/sample-quality-events.jsonl";

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
    eventsPath: path.resolve(
      process.cwd(),
      normalizeString(flags.get("events") ?? env.EVAL_QUALITY_EVENTS_PATH, DEFAULT_EVENTS_PATH),
    ),
    source: normalizeString(flags.get("source") ?? env.EVAL_QUALITY_SOURCE, "jsonl"),
  };
}

function parseJsonLines(filePath) {
  const content = readFileSync(filePath, "utf8");
  return content
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function findLatestJsonArtifact(fileOrDirPath) {
  const stat = statSync(fileOrDirPath);
  if (!stat.isDirectory()) {
    return fileOrDirPath;
  }

  const candidates = [];
  const stack = [fileOrDirPath];
  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of readdirSync(current)) {
      const entryPath = path.join(current, entry);
      const entryStat = statSync(entryPath);
      if (entryStat.isDirectory()) {
        stack.push(entryPath);
        continue;
      }
      if (entryPath.endsWith(".json")) {
        candidates.push(entryPath);
      }
    }
  }

  return candidates.sort().at(-1) ?? fileOrDirPath;
}

function parseAgentSuiteArtifact(filePath) {
  const resolvedPath = findLatestJsonArtifact(filePath);
  const artifact = JSON.parse(readFileSync(resolvedPath, "utf8"));
  const records = Array.isArray(artifact?.records) ? artifact.records : [];
  return records.map((record) => ({
    conversation_id:
      record.workflowRunId ?? record.scenarioId ?? record.checkId ?? "unknown",
    message_id: record.traceId ?? record.scenarioId ?? record.checkId ?? "unknown",
    channel: record.checkId?.includes("prod-smoke") ? "staging" : "agentic",
    provider: "unknown",
    deploy_sha: normalizeString(process.env.GITHUB_SHA, "local"),
    tool_family: record.failureClass ?? "workflow",
    quality_score:
      record.status === "passed" ? 1 : record.status === "skipped" ? 0.5 : 0,
    retry_count: 0,
    escalated: record.status === "failed",
    failure_taxonomy: record.failureClass ?? "none",
    created_at: new Date().toISOString(),
  }));
}

function average(values) {
  return values.length > 0
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : 0;
}

function groupCount(rows, key) {
  const grouped = new Map();
  for (const row of rows) {
    const value = normalizeString(row[key], "unknown");
    grouped.set(value, (grouped.get(value) ?? 0) + 1);
  }
  return Object.fromEntries([...grouped.entries()].sort((left, right) => right[1] - left[1]));
}

export async function reportQualityEvents(argv = process.argv.slice(2), env = process.env) {
  const config = parseArgs(argv, env);
  const envelope = createEvalRunEnvelope({
    evalSuite: "online-quality-report",
    evalType: "online",
    artifactRoot: env.EVAL_ARTIFACT_ROOT,
  });
  const rows =
    config.source === "agent-suite"
      ? parseAgentSuiteArtifact(config.eventsPath)
      : parseJsonLines(config.eventsPath);
  const caseRows = rows.map((row) => ({
    caseId: `${row.conversation_id}:${row.message_id}`,
    status: row.quality_score >= 0.6 ? "passed" : "failed",
    score: row.quality_score,
    primaryFailureReason: row.failure_taxonomy ?? "none",
    channel: row.channel,
    provider: row.provider,
    deploySha: row.deploy_sha,
    toolFamily: row.tool_family,
    escalated: Boolean(row.escalated),
    retryCount: Number.isFinite(row.retry_count) ? row.retry_count : 0,
    createdAt: row.created_at,
  }));

  const summary = {
    ...summarizeCaseRows(caseRows),
    source: config.source,
    averageRetryCount: Number(
      average(caseRows.map((row) => row.retryCount ?? 0)).toFixed(3),
    ),
    escalationRate: Number(
      (
        caseRows.filter((row) => row.escalated).length /
        Math.max(caseRows.length, 1)
      ).toFixed(3),
    ),
    byChannel: groupCount(caseRows, "channel"),
    byProvider: groupCount(caseRows, "provider"),
    byToolFamily: groupCount(caseRows, "toolFamily"),
    byFailureTaxonomy: groupCount(caseRows, "primaryFailureReason"),
  };

  return finalizeEvalRun(envelope, summary, caseRows, {
    eventsPath: config.eventsPath,
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = await reportQualityEvents();
  console.log(JSON.stringify(result.summary, null, 2));
  console.log(`artifact written to ${path.join(result.runDir, "run.json")}`);
}
