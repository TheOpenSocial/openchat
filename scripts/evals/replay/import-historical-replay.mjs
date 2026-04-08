#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";
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

  const inputPath = normalizeString(
    flags.get("input") ?? env.EVAL_REPLAY_IMPORT_INPUT,
    "",
  );
  const outputPath = normalizeString(
    flags.get("output") ?? env.EVAL_REPLAY_IMPORT_OUTPUT,
    inputPath
      ? inputPath.replace(/\.(jsonl|json)$/i, ".corpus.json")
      : "",
  );

  return {
    inputPath: inputPath ? path.resolve(process.cwd(), inputPath) : "",
    outputPath: outputPath ? path.resolve(process.cwd(), outputPath) : "",
    suiteName: normalizeString(
      flags.get("suite-name") ?? env.EVAL_REPLAY_IMPORT_SUITE_NAME,
      "historical-replay-import",
    ),
  };
}

export function loadHistoricalReplayRecords(inputPath) {
  const raw = readFileSync(inputPath, "utf8");
  if (inputPath.endsWith(".jsonl")) {
    return raw
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  }

  const parsed = JSON.parse(raw);
  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed?.conversations)) return parsed.conversations;
  if (Array.isArray(parsed?.cases)) return parsed.cases;
  return [];
}

function normalizeMessages(record) {
  const source = Array.isArray(record?.messages)
    ? record.messages
    : Array.isArray(record?.history)
      ? record.history
      : Array.isArray(record?.transcript)
        ? record.transcript
        : [];
  return source
    .map((message, index) => ({
      role: normalizeString(message?.role, "user"),
      content: normalizeString(
        message?.content ?? message?.text ?? message?.message,
        `message-${index + 1}`,
      ),
    }))
    .filter((message) => message.content.length > 0);
}

function normalizeExpected(record) {
  const expected = record?.expected ?? {};
  const pickArray = (...values) => {
    for (const value of values) {
      if (Array.isArray(value)) {
        return value.filter((entry) => typeof entry === "string");
      }
    }
    return [];
  };

  const maxLatencyCandidate =
    expected.maxLatencyMs ?? record.maxLatencyMs ?? record.latencyBudgetMs ?? null;

  return {
    allowedTools: pickArray(expected.allowedTools, record.allowedTools),
    forbiddenTools: pickArray(expected.forbiddenTools, record.forbiddenTools),
    requiredBehaviors: pickArray(expected.requiredBehaviors, record.requiredBehaviors),
    outputIncludes: pickArray(
      expected.outputIncludes,
      expected.outputSnippets,
      record.outputIncludes,
      record.outputSnippets,
    ),
    expectedToolCalls: pickArray(
      expected.expectedToolCalls,
      record.expectedToolCalls,
    ),
    forbiddenToolCalls: pickArray(
      expected.forbiddenToolCalls,
      record.forbiddenToolCalls,
    ),
    maxLatencyMs: Number.isFinite(maxLatencyCandidate) ? maxLatencyCandidate : null,
    allowSideEffects:
      expected.allowSideEffects === true || record.allowSideEffects === true,
  };
}

function normalizeObserved(record) {
  const observed = record?.observed ?? {};
  const pickArray = (...values) => {
    for (const value of values) {
      if (Array.isArray(value)) {
        return value.filter((entry) => typeof entry === "string");
      }
    }
    return [];
  };

  const selectedTool = normalizeString(
    observed.selectedTool ?? observed.tool ?? record.selectedTool ?? record.tool,
    "",
  );
  const outputText = normalizeString(
    observed.outputText ?? observed.output ?? record.outputText ?? record.output,
    "",
  );
  return {
    selectedTool,
    toolCalls: pickArray(observed.toolCalls, record.toolCalls, selectedTool ? [selectedTool] : []),
    behaviors: pickArray(observed.behaviors, record.behaviors),
    sideEffects: observed.sideEffects === true || record.sideEffects === true,
    outputText,
    latencyMs: Number.isFinite(observed.latencyMs ?? record.latencyMs)
      ? observed.latencyMs ?? record.latencyMs
      : 0,
  };
}

export function normalizeHistoricalReplayRecord(record, index) {
  const conversationId = normalizeString(
    record?.conversationId ?? record?.id ?? record?.traceId,
    `historical-replay-${index + 1}`,
  );
  return {
    id: conversationId,
    channel: normalizeString(record?.channel, "unknown"),
    provider: normalizeString(record?.provider, "unknown"),
    toolFamily: normalizeString(record?.toolFamily, "unknown"),
    conversation: {
      conversationId,
      messages: normalizeMessages(record),
    },
    execution: {
      mode: "historical-export",
    },
    expected: normalizeExpected(record),
    observed: normalizeObserved(record),
    metadata: record?.metadata ?? null,
  };
}

export function importHistoricalReplay(argv = process.argv.slice(2), env = process.env) {
  const config = parseArgs(argv, env);
  if (!config.inputPath) {
    throw new Error("Missing --input for historical replay import.");
  }
  if (!config.outputPath) {
    throw new Error("Missing --output for historical replay import.");
  }

  const records = loadHistoricalReplayRecords(config.inputPath);
  const corpus = {
    version: 1,
    suite: config.suiteName,
    importedFrom: config.inputPath,
    cases: records.map((record, index) => normalizeHistoricalReplayRecord(record, index)),
  };

  writeFileSync(config.outputPath, JSON.stringify(corpus, null, 2));
  return {
    inputPath: config.inputPath,
    outputPath: config.outputPath,
    suite: config.suiteName,
    caseCount: corpus.cases.length,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = importHistoricalReplay();
  console.log(JSON.stringify(result, null, 2));
}
