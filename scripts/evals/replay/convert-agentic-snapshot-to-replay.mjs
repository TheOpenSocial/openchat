#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

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

  const inputPath = normalizeString(
    flags.get("input") ?? env.EVAL_AGENTIC_SNAPSHOT_INPUT,
    "",
  );
  const outputPath = normalizeString(
    flags.get("output") ?? env.EVAL_AGENTIC_REPLAY_OUTPUT,
    inputPath ? inputPath.replace(/\.json$/i, ".replay.jsonl") : "",
  );

  return {
    inputPath: inputPath ? path.resolve(process.cwd(), inputPath) : "",
    outputPath: outputPath ? path.resolve(process.cwd(), outputPath) : "",
  };
}

function loadSnapshot(inputPath) {
  return JSON.parse(readFileSync(inputPath, "utf8"));
}

function scenarioToReplayRecord(scenario, snapshot) {
  const scenarioId = normalizeString(
    scenario?.scenarioId,
    scenario?.id ?? "unknown-scenario",
  );
  const title = normalizeString(scenario?.title, scenarioId);
  const dimension = normalizeString(scenario?.dimension, "agentic-quality");
  const details = normalizeString(scenario?.details, "");
  const passed = scenario?.passed === true;
  const summary = normalizeString(snapshot?.explainability?.summary, "");

  return {
    conversationId: scenarioId,
    channel: "agentic_eval",
    provider: "agentic-evals-snapshot",
    toolFamily: dimension,
    transcript: [
      {
        role: "system",
        content: `Scenario: ${title}`,
      },
      {
        role: "assistant",
        content:
          details || `Scenario ${scenarioId} ${passed ? "passed" : "failed"}.`,
      },
    ],
    expected: {
      requiredBehaviors: [],
      outputIncludes: details ? [details] : [],
      forbiddenTools: [],
      forbiddenToolCalls: [],
      allowSideEffects: false,
      maxLatencyMs: null,
    },
    observed: {
      selectedTool: "",
      toolCalls: [],
      behaviors: passed ? ["scenario_passed"] : ["scenario_failed"],
      outputText: [title, details, summary].filter(Boolean).join("\n"),
      latencyMs: 0,
      sideEffects: false,
    },
    metadata: {
      scenarioId,
      title,
      dimension,
      passed,
      score: Number.isFinite(scenario?.score) ? scenario.score : null,
      snapshotStatus: normalizeString(snapshot?.summary?.status, "unknown"),
      traceGradeStatus: normalizeString(
        snapshot?.traceGrade?.status,
        "unknown",
      ),
    },
  };
}

export function convertAgenticSnapshotToReplay(
  argv = process.argv.slice(2),
  env = process.env,
) {
  const config = parseArgs(argv, env);
  if (!config.inputPath) {
    throw new Error("Missing --input for agentic snapshot replay conversion.");
  }
  if (!config.outputPath) {
    throw new Error("Missing --output for agentic snapshot replay conversion.");
  }

  const snapshot = loadSnapshot(config.inputPath);
  const scenarios = Array.isArray(snapshot?.scenarios)
    ? snapshot.scenarios
    : [];
  const records = scenarios.map((scenario) =>
    scenarioToReplayRecord(scenario, snapshot),
  );
  writeFileSync(
    config.outputPath,
    `${records.map((record) => JSON.stringify(record)).join("\n")}\n`,
    "utf8",
  );

  return {
    inputPath: config.inputPath,
    outputPath: config.outputPath,
    caseCount: records.length,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = convertAgenticSnapshotToReplay();
  console.log(JSON.stringify(result, null, 2));
}
