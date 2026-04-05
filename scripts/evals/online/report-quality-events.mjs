#!/usr/bin/env node

import { readFileSync } from "node:fs";
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
  const rows = parseJsonLines(config.eventsPath);
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

