#!/usr/bin/env node

import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { DEFAULT_EVAL_ARTIFACT_ROOT } from "../shared/artifacts.mjs";

const DEFAULT_BASELINE_PATH = "scripts/evals/system/system-baseline.json";

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

  return {
    artifactRoot: path.resolve(
      process.cwd(),
      normalizeString(
        flags.get("artifact-root") ?? env.EVAL_ARTIFACT_ROOT,
        DEFAULT_EVAL_ARTIFACT_ROOT,
      ),
    ),
    baselinePath: path.resolve(
      process.cwd(),
      normalizeString(
        flags.get("baseline") ?? env.EVAL_SYSTEM_BASELINE_PATH,
        DEFAULT_BASELINE_PATH,
      ),
    ),
    systemRunId: normalizeString(
      flags.get("system-run-id") ?? env.EVAL_SYSTEM_RUN_ID,
      "",
    ),
  };
}

function findLatestRunDir(artifactRoot, prefix) {
  const entries = readdirSync(artifactRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith(prefix))
    .map((entry) => ({
      name: entry.name,
      fullPath: path.join(artifactRoot, entry.name),
      mtimeMs: statSync(path.join(artifactRoot, entry.name)).mtimeMs,
    }))
    .sort((left, right) => right.mtimeMs - left.mtimeMs);
  return entries[0]?.fullPath ?? null;
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function readJsonLines(filePath) {
  return readFileSync(filePath, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function getSystemRunDir(config) {
  if (config.systemRunId) {
    return path.join(config.artifactRoot, config.systemRunId);
  }
  return findLatestRunDir(config.artifactRoot, "system-evals-");
}

function buildThresholdMap(summary) {
  return new Map(
    Array.isArray(summary.thresholdResults)
      ? summary.thresholdResults.map((entry) => [entry.suiteId, entry])
      : [],
  );
}

function suiteStatus(summary, thresholdResult) {
  if (thresholdResult?.passed === false) return "failed";
  if ((summary?.failedCases ?? 0) > 0) return "watch";
  return "passed";
}

function buildArtifactPath(artifactRoot, runId) {
  if (!runId) return null;
  return path.join(artifactRoot, runId, "summary.json");
}

export function buildSystemMatrixStatus(
  argv = process.argv.slice(2),
  env = process.env,
) {
  const config = parseArgs(argv, env);
  const systemRunDir = getSystemRunDir(config);
  if (!systemRunDir) {
    throw new Error(
      `No system eval artifact found under ${config.artifactRoot}.`,
    );
  }

  const summaryPath = path.join(systemRunDir, "summary.json");
  const casesPath = path.join(systemRunDir, "cases.jsonl");
  const baseline = readJson(config.baselinePath);
  const summary = readJson(summaryPath);
  const caseRows = readJsonLines(casesPath);
  const thresholdMap = buildThresholdMap(summary);

  const suiteMatrix = caseRows.map((row) => {
    const thresholdResult = thresholdMap.get(row.suiteId) ?? {
      passed: true,
      reasons: [],
      familyThresholdFailures: [],
    };
    return {
      suiteId: row.suiteId,
      status: suiteStatus(row, thresholdResult),
      score: row.score ?? 0,
      failedCases: row.failedCases ?? 0,
      totalCases: row.totalCases ?? 0,
      primaryFailureReason: row.primaryFailureReason ?? "none",
      thresholdPassed: thresholdResult.passed !== false,
      thresholdReasons: thresholdResult.reasons ?? [],
      familyThresholdFailures: thresholdResult.familyThresholdFailures ?? [],
      artifactSummaryPath: buildArtifactPath(
        config.artifactRoot,
        row.suiteArtifactRunId,
      ),
    };
  });

  const socialSimSuite = Array.isArray(summary.suites)
    ? summary.suites.find((entry) => entry.suiteId === "social-sim-benchmark")
    : null;

  return {
    generatedAt: new Date().toISOString(),
    overallStatus: summary.passed ? "passed" : "failed",
    artifactRoot: config.artifactRoot,
    baselinePath: config.baselinePath,
    systemRunDir,
    systemSummaryPath: summaryPath,
    system: {
      passed: summary.passed === true,
      averageScore: summary.averageScore ?? 0,
      suiteCount: summary.suiteCount ?? suiteMatrix.length,
      failedCases: summary.failedCases ?? 0,
      thresholdFailures: summary.thresholdFailures ?? [],
      overallThresholdFailures: summary.overallThresholdFailures ?? [],
      usedLiveWorkflowReplay: summary.usedLiveWorkflowReplay === true,
    },
    socialSimulation: socialSimSuite?.summary
      ? {
          averageScore: socialSimSuite.summary.averageScore ?? 0,
          meanScore: socialSimSuite.summary.meanScore ?? 0,
          scoreStdDev: socialSimSuite.summary.scoreStdDev ?? 0,
          worstSeedScore: socialSimSuite.summary.worstSeedScore ?? 0,
          worstSeed: socialSimSuite.summary.worstSeed ?? null,
          meanOracleScore: socialSimSuite.summary.meanOracleScore ?? 0,
          meanOracleProgressScore:
            socialSimSuite.summary.meanOracleProgressScore ?? 0,
          familyMetrics: socialSimSuite.summary.familyMetrics ?? {},
          effectiveBackendModes:
            socialSimSuite.summary.effectiveBackendModes ?? [],
        }
      : null,
    suiteMatrix,
    scoreLocations: suiteMatrix.map((entry) => ({
      suiteId: entry.suiteId,
      summaryPath: entry.artifactSummaryPath,
    })),
    thresholds: baseline,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const status = buildSystemMatrixStatus();
  console.log(JSON.stringify(status, null, 2));
}
