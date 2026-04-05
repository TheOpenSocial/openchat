#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

import {
  createEvalRunEnvelope,
  finalizeEvalRun,
  summarizeCaseRows,
} from "../shared/artifacts.mjs";

const DEFAULT_REPLAY_CORPUS_PATH = "scripts/evals/replay/sample-replay-corpus.json";

function normalizeString(value, fallback = "") {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;
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
    corpusPath: path.resolve(
      process.cwd(),
      normalizeString(flags.get("corpus") ?? env.EVAL_REPLAY_CORPUS_PATH, DEFAULT_REPLAY_CORPUS_PATH),
    ),
    provider: normalizeString(flags.get("provider") ?? env.SOCIAL_SIM_PROVIDER, "ollama"),
    judgeProvider: normalizeString(flags.get("judge-provider") ?? env.SOCIAL_SIM_JUDGE_PROVIDER, "stub"),
    deploySha: normalizeString(flags.get("deploy-sha") ?? env.GITHUB_SHA, "local"),
    dryRun:
      normalizeString(flags.get("dry-run") ?? env.EVAL_REPLAY_DRY_RUN, "0") === "1",
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

function executeReplayCase(entry, config) {
  const execution = entry.execution ?? {};
  if (config.dryRun || execution.mode !== "command") {
    return {
      status: 0,
      stdout: "",
      stderr: "",
      parsed: null,
      note: config.dryRun
        ? "Replay execution skipped in dry-run mode."
        : "Replay execution mode not configured.",
    };
  }
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
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    parsed,
    note: null,
  };
}

function evaluateReplayCase(entry, config) {
  const expected = entry.expected ?? {};
  const allowedTools = Array.isArray(expected.allowedTools) ? expected.allowedTools : [];
  const forbiddenTools = Array.isArray(expected.forbiddenTools) ? expected.forbiddenTools : [];
  const requiredBehaviors = Array.isArray(expected.requiredBehaviors)
    ? expected.requiredBehaviors
    : [];
  const execution = executeReplayCase(entry, config);
  const selectedTool = normalizeString(execution.parsed?.tool, "");
  const behaviors = Array.isArray(execution.parsed?.behaviors)
    ? execution.parsed.behaviors.filter((value) => typeof value === "string")
    : [];
  const sideEffects = execution.parsed?.sideEffects === true;
  const allowedToolPass =
    allowedTools.length === 0 || allowedTools.includes(selectedTool);
  const forbiddenToolPass =
    forbiddenTools.length === 0 || !forbiddenTools.includes(selectedTool);
  const behaviorPass =
    requiredBehaviors.length === 0 ||
    requiredBehaviors.every((behavior) => behaviors.includes(behavior));
  const sideEffectPass = !sideEffects;
  const passed =
    execution.status === 0 && allowedToolPass && forbiddenToolPass && behaviorPass && sideEffectPass;
  const score = Number(
    (
      (allowedToolPass ? 0.35 : 0) +
      (forbiddenToolPass ? 0.25 : 0) +
      (behaviorPass ? 0.25 : 0) +
      (sideEffectPass ? 0.15 : 0)
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
            : execution.status !== 0
              ? "command_failed"
              : "none",
    expected: {
      allowedTools,
      forbiddenTools,
      requiredBehaviors,
    },
    execution: {
      selectedTool,
      behaviors,
      sideEffects,
      stdout: execution.stdout,
      stderr: execution.stderr,
      note: execution.note,
    },
  };
}

export async function runReplayEvals(argv = process.argv.slice(2), env = process.env) {
  const config = parseReplayArgs(argv, env);
  const corpus = loadReplayCorpus(config.corpusPath);
  const envelope = createEvalRunEnvelope({
    evalSuite: "replay-evals",
    evalType: "replay",
    artifactRoot: env.EVAL_ARTIFACT_ROOT,
  });

  const caseRows = corpus.cases.map((entry) => evaluateReplayCase(entry, config));
  const summary = {
    ...summarizeCaseRows(caseRows),
    corpusSuite: corpus.suite,
    corpusVersion: corpus.version,
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
