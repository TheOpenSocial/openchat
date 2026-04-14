#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

import {
  createEvalRunEnvelope,
  finalizeEvalRun,
  summarizeCaseRows,
} from "../shared/artifacts.mjs";
import {
  loadHistoricalReplayRecords,
  normalizeHistoricalReplayRecord,
} from "./import-historical-replay.mjs";

const DEFAULT_REPLAY_CORPUS_PATH =
  "scripts/evals/replay/sample-replay-corpus.json";

function normalizeString(value, fallback = "") {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : fallback;
}

function parseReplayArgs(argv = process.argv.slice(2), env = process.env) {
  const flags = new Map();
  for (const arg of argv) {
    if (!arg.startsWith("--")) continue;
    const withoutPrefix = arg.slice(2);
    const [key, rawValue] = withoutPrefix.split("=", 2);
    flags.set(key, rawValue ?? "true");
  }
  return {
    source: normalizeString(
      flags.get("source") ?? env.EVAL_REPLAY_SOURCE,
      "corpus",
    ),
    corpusPath: path.resolve(
      process.cwd(),
      normalizeString(
        flags.get("corpus") ?? env.EVAL_REPLAY_CORPUS_PATH,
        DEFAULT_REPLAY_CORPUS_PATH,
      ),
    ),
    provider: normalizeString(
      flags.get("provider") ?? env.SOCIAL_SIM_PROVIDER,
      "ollama",
    ),
    judgeProvider: normalizeString(
      flags.get("judge-provider") ?? env.SOCIAL_SIM_JUDGE_PROVIDER,
      "stub",
    ),
    deploySha: normalizeString(
      flags.get("deploy-sha") ?? env.GITHUB_SHA,
      "local",
    ),
    dryRun:
      normalizeString(flags.get("dry-run") ?? env.EVAL_REPLAY_DRY_RUN, "0") ===
      "1",
  };
}

function loadReplayCorpus(corpusPath) {
  const raw = JSON.parse(readFileSync(corpusPath, "utf8"));
  const cases = Array.isArray(raw?.cases) ? raw.cases : [];
  return {
    version: raw?.version ?? 1,
    suite: normalizeString(raw?.suite, "replay-corpus"),
    cases,
  };
}

function loadReplayInput(config) {
  if (config.source === "historical-export") {
    const records = loadHistoricalReplayRecords(config.corpusPath);
    return {
      version: 1,
      suite: normalizeString(
        path.basename(config.corpusPath).replace(/\.(jsonl|json)$/i, ""),
        "historical-replay-export",
      ),
      importedFrom: config.corpusPath,
      cases: records.map((record, index) =>
        normalizeHistoricalReplayRecord(record, index),
      ),
    };
  }
  return loadReplayCorpus(config.corpusPath);
}

function executeReplayCase(entry, config) {
  const execution = entry.execution ?? {};
  if (execution.mode === "historical-export") {
    return {
      status: 0,
      latencyMs: Number.isFinite(entry?.observed?.latencyMs)
        ? entry.observed.latencyMs
        : 0,
      stdout: normalizeString(entry?.observed?.outputText, ""),
      stderr: "",
      parsed: {
        tool: normalizeString(entry?.observed?.selectedTool, ""),
        toolCalls: Array.isArray(entry?.observed?.toolCalls)
          ? entry.observed.toolCalls
          : [],
        behaviors: Array.isArray(entry?.observed?.behaviors)
          ? entry.observed.behaviors
          : [],
        sideEffects: entry?.observed?.sideEffects === true,
        outputText: normalizeString(entry?.observed?.outputText, ""),
      },
      note: "Replay evaluated from recorded historical export observation.",
    };
  }
  if (config.dryRun || execution.mode !== "command") {
    return {
      status: 0,
      latencyMs: 0,
      stdout: "",
      stderr: "",
      parsed: null,
      note: config.dryRun
        ? "Replay execution skipped in dry-run mode."
        : "Replay execution mode not configured.",
    };
  }
  const startedAt = Date.now();
  const result = spawnSync(
    normalizeString(execution.cmd, "node"),
    Array.isArray(execution.args) ? execution.args : [],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      shell: process.platform === "win32",
    },
  );
  let parsed = null;
  try {
    parsed = JSON.parse(normalizeString(result.stdout, ""));
  } catch {
    parsed = null;
  }
  return {
    status: result.status ?? 1,
    latencyMs: Date.now() - startedAt,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    parsed,
    note: null,
  };
}

function evaluateReplayCase(entry, config) {
  const expected = entry.expected ?? {};
  const allowedTools = Array.isArray(expected.allowedTools)
    ? expected.allowedTools
    : [];
  const forbiddenTools = Array.isArray(expected.forbiddenTools)
    ? expected.forbiddenTools
    : [];
  const requiredBehaviors = Array.isArray(expected.requiredBehaviors)
    ? expected.requiredBehaviors
    : [];
  const expectedOutputIncludes = Array.isArray(expected.outputIncludes)
    ? expected.outputIncludes.filter((value) => typeof value === "string")
    : [];
  const expectedToolCalls = Array.isArray(expected.expectedToolCalls)
    ? expected.expectedToolCalls.filter((value) => typeof value === "string")
    : [];
  const forbiddenToolCalls = Array.isArray(expected.forbiddenToolCalls)
    ? expected.forbiddenToolCalls.filter((value) => typeof value === "string")
    : [];
  const maxLatencyMs = Number.isFinite(expected.maxLatencyMs)
    ? expected.maxLatencyMs
    : null;
  const allowSideEffects = expected.allowSideEffects === true;
  const execution = executeReplayCase(entry, config);
  const selectedTool = normalizeString(execution.parsed?.tool, "");
  const outputText = normalizeString(
    execution.parsed?.outputText,
    normalizeString(execution.stdout, ""),
  );
  const outputTextLower = outputText.toLowerCase();
  const behaviors = Array.isArray(execution.parsed?.behaviors)
    ? execution.parsed.behaviors.filter((value) => typeof value === "string")
    : [];
  const toolCalls = Array.isArray(execution.parsed?.toolCalls)
    ? execution.parsed.toolCalls.filter((value) => typeof value === "string")
    : selectedTool
      ? [selectedTool]
      : [];
  const sideEffects = execution.parsed?.sideEffects === true;
  const allowedToolPass =
    allowedTools.length === 0 || allowedTools.includes(selectedTool);
  const forbiddenToolPass =
    forbiddenTools.length === 0 || !forbiddenTools.includes(selectedTool);
  const behaviorPass =
    requiredBehaviors.length === 0 ||
    requiredBehaviors.every((behavior) => behaviors.includes(behavior));
  const sideEffectPass = allowSideEffects || !sideEffects;
  const outputPass =
    expectedOutputIncludes.length === 0 ||
    expectedOutputIncludes.every((snippet) =>
      outputTextLower.includes(snippet.toLowerCase()),
    );
  const expectedToolCallPass =
    expectedToolCalls.length === 0 ||
    expectedToolCalls.every((tool) => toolCalls.includes(tool));
  const forbiddenToolCallPass =
    forbiddenToolCalls.length === 0 ||
    forbiddenToolCalls.every((tool) => !toolCalls.includes(tool));
  const latencyPass =
    maxLatencyMs === null ||
    (Number.isFinite(execution.latencyMs) &&
      execution.latencyMs <= maxLatencyMs);
  const passed =
    execution.status === 0 &&
    allowedToolPass &&
    forbiddenToolPass &&
    behaviorPass &&
    sideEffectPass &&
    outputPass &&
    expectedToolCallPass &&
    forbiddenToolCallPass &&
    latencyPass;
  const score = Number(
    (
      (allowedToolPass ? 0.2 : 0) +
      (forbiddenToolPass ? 0.15 : 0) +
      (behaviorPass ? 0.15 : 0) +
      (sideEffectPass ? 0.1 : 0) +
      (outputPass ? 0.15 : 0) +
      (expectedToolCallPass ? 0.1 : 0) +
      (forbiddenToolCallPass ? 0.1 : 0) +
      (latencyPass ? 0.05 : 0)
    ).toFixed(3),
  );
  return {
    caseId: entry.id,
    status: passed ? "passed" : "failed",
    score,
    channel: normalizeString(entry.channel, "unknown"),
    provider: normalizeString(entry.provider, config.provider),
    judgeProvider: config.judgeProvider,
    toolFamily: normalizeString(entry.toolFamily, "unknown"),
    deploySha: config.deploySha,
    primaryFailureReason: !allowedToolPass
      ? "wrong_tool_choice"
      : !forbiddenToolPass
        ? "forbidden_tool_used"
        : !behaviorPass
          ? "missing_required_behavior"
          : !sideEffectPass
            ? "unexpected_side_effect"
            : !outputPass
              ? "missing_expected_output"
              : !expectedToolCallPass
                ? "missing_expected_tool_call"
                : !forbiddenToolCallPass
                  ? "forbidden_tool_call_observed"
                  : !latencyPass
                    ? "latency_budget_exceeded"
                    : execution.status !== 0
                      ? "command_failed"
                      : "none",
    expected: {
      allowedTools,
      forbiddenTools,
      requiredBehaviors,
      outputIncludes: expectedOutputIncludes,
      expectedToolCalls,
      forbiddenToolCalls,
      maxLatencyMs,
      allowSideEffects,
    },
    execution: {
      selectedTool,
      toolCalls,
      behaviors,
      sideEffects,
      outputText,
      latencyMs: execution.latencyMs,
      stdout: execution.stdout,
      stderr: execution.stderr,
      note: execution.note,
    },
  };
}

export async function runReplayEvals(
  argv = process.argv.slice(2),
  env = process.env,
) {
  const config = parseReplayArgs(argv, env);
  const corpus = loadReplayInput(config);
  const envelope = createEvalRunEnvelope({
    evalSuite: "replay-evals",
    evalType: "replay",
    artifactRoot: env.EVAL_ARTIFACT_ROOT,
  });

  const caseRows = corpus.cases.map((entry) =>
    evaluateReplayCase(entry, config),
  );
  const summary = {
    ...summarizeCaseRows(caseRows),
    corpusSuite: corpus.suite,
    corpusVersion: corpus.version,
    source: config.source,
    channels: Array.from(new Set(caseRows.map((row) => row.channel))),
    toolFamilies: Array.from(new Set(caseRows.map((row) => row.toolFamily))),
    deploySha: config.deploySha,
  };

  return finalizeEvalRun(envelope, summary, caseRows, {
    corpusPath: config.corpusPath,
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = await runReplayEvals();
  console.log(JSON.stringify(result.summary, null, 2));
  console.log(`artifact written to ${path.join(result.runDir, "run.json")}`);
}
