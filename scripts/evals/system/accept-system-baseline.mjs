#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const DEFAULT_BASELINE_HISTORY_PATH =
  "scripts/evals/system/system-baseline-history.json";

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

  const summaryPath = normalizeString(
    flags.get("summary") ?? env.EVAL_SYSTEM_SUMMARY_PATH,
    "",
  );
  if (!summaryPath) {
    throw new Error("--summary is required.");
  }

  return {
    baselineHistoryPath: path.resolve(
      process.cwd(),
      normalizeString(
        flags.get("history") ?? env.EVAL_SYSTEM_BASELINE_HISTORY_PATH,
        DEFAULT_BASELINE_HISTORY_PATH,
      ),
    ),
    summaryPath: path.resolve(process.cwd(), summaryPath),
    runJsonPath: normalizeString(flags.get("run-json") ?? env.EVAL_SYSTEM_RUN_JSON_PATH, "")
      ? path.resolve(
          process.cwd(),
          normalizeString(
            flags.get("run-json") ?? env.EVAL_SYSTEM_RUN_JSON_PATH,
            "",
          ),
        )
      : "",
    baselineId: normalizeString(
      flags.get("id") ?? env.EVAL_SYSTEM_ACCEPTED_BASELINE_ID,
      "",
    ),
    acceptedAt: normalizeString(
      flags.get("accepted-at") ?? env.EVAL_SYSTEM_ACCEPTED_AT,
      "",
    ),
    notes: normalizeString(flags.get("notes") ?? env.EVAL_SYSTEM_ACCEPTED_NOTES, ""),
    runUrl: normalizeString(flags.get("run-url") ?? env.EVAL_SYSTEM_RUN_URL, ""),
    headSha: normalizeString(flags.get("head-sha") ?? env.EVAL_SYSTEM_HEAD_SHA, ""),
  };
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function writeJson(filePath, payload) {
  writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function suiteScore(summary) {
  return (
    summary?.meanScore ??
    summary?.averageScore ??
    summary?.score ??
    0
  );
}

function buildAcceptedRun(config, summary, runPayload) {
  const suites = Array.isArray(summary.suites) ? summary.suites : [];
  const deterministicSocialSim = suites.find(
    (entry) => entry.suiteId === "social-sim-benchmark",
  )?.summary;
  const liveSocialSim = suites.find(
    (entry) => entry.suiteId === "social-sim-live-benchmark",
  )?.summary;

  return {
    id:
      config.baselineId ||
      `${summary.usedLiveSocialSim === true ? "live" : "deterministic"}-system-baseline-${
        summary.completedAt ?? runPayload?.completedAt ?? new Date().toISOString()
      }`.replace(/[:.]/g, "-"),
    acceptedAt:
      config.acceptedAt ||
      runPayload?.completedAt ||
      new Date().toISOString(),
    notes:
      config.notes ||
      (summary.usedLiveSocialSim === true
        ? "Accepted live staging system baseline from workflow artifact."
        : "Accepted deterministic system baseline from local artifact."),
    source: {
      runUrl: config.runUrl || null,
      headSha: config.headSha || null,
      evalRunId: runPayload?.runId ?? null,
      completedAt: runPayload?.completedAt ?? null,
      usedLiveWorkflowReplay: summary.usedLiveWorkflowReplay === true,
      usedLiveSocialSim: summary.usedLiveSocialSim === true,
    },
    system: {
      averageScore: summary.averageScore ?? 0,
      gateScore: summary.gateScore ?? summary.averageScore ?? 0,
      passed: summary.passed === true,
      usedLiveWorkflowReplay: summary.usedLiveWorkflowReplay === true,
      usedLiveSocialSim: summary.usedLiveSocialSim === true,
    },
    socialSimulation: deterministicSocialSim
      ? {
          meanScore: deterministicSocialSim.meanScore ?? 0,
          scoreStdDev: deterministicSocialSim.scoreStdDev ?? 0,
          worstSeedScore: deterministicSocialSim.worstSeedScore ?? 0,
        }
      : null,
    liveSocialSimulation: liveSocialSim
      ? {
          meanScore: liveSocialSim.meanScore ?? 0,
          scoreStdDev: liveSocialSim.scoreStdDev ?? 0,
          worstSeedScore: liveSocialSim.worstSeedScore ?? 0,
        }
      : null,
    suiteScores: Object.fromEntries(
      suites.map((entry) => [entry.suiteId, suiteScore(entry.summary)]),
    ),
  };
}

export function acceptSystemBaseline(
  argv = process.argv.slice(2),
  env = process.env,
) {
  const config = parseArgs(argv, env);
  const history = readJson(config.baselineHistoryPath);
  const summary = readJson(config.summaryPath);
  const runPayload = config.runJsonPath ? readJson(config.runJsonPath) : null;
  const acceptedRun = buildAcceptedRun(config, summary, runPayload);

  const updated = {
    ...history,
    acceptedRuns: [...(history.acceptedRuns ?? []), acceptedRun],
  };
  writeJson(config.baselineHistoryPath, updated);
  return {
    baselineHistoryPath: config.baselineHistoryPath,
    acceptedRun,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = acceptSystemBaseline();
  console.log(JSON.stringify(result, null, 2));
}
