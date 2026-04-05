#!/usr/bin/env node

import { readFileSync } from "node:fs";
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

function evaluateReplayCase(entry, config) {
  const expected = entry.expected ?? {};
  const allowedTools = Array.isArray(expected.allowedTools) ? expected.allowedTools : [];
  const forbiddenTools = Array.isArray(expected.forbiddenTools) ? expected.forbiddenTools : [];
  const requiredBehaviors = Array.isArray(expected.requiredBehaviors)
    ? expected.requiredBehaviors
    : [];
  const scoreParts = [];

  scoreParts.push(allowedTools.length > 0 ? 0.35 : 0.2);
  scoreParts.push(forbiddenTools.length > 0 ? 0.35 : 0.2);
  scoreParts.push(requiredBehaviors.length > 0 ? 0.3 : 0.2);

  const score = Number(scoreParts.reduce((sum, value) => sum + value, 0).toFixed(3));
  return {
    caseId: entry.id,
    status: "passed",
    score,
    channel: normalizeString(entry.channel, "unknown"),
    provider: normalizeString(entry.provider, config.provider),
    judgeProvider: config.judgeProvider,
    toolFamily: normalizeString(entry.toolFamily, "unknown"),
    deploySha: config.deploySha,
    primaryFailureReason: "none",
    expected: {
      allowedTools,
      forbiddenTools,
      requiredBehaviors,
    },
    note: "Replay scaffold case validated structurally. Hook real transcript scoring here next.",
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

