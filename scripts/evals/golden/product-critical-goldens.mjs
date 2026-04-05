#!/usr/bin/env node

import { mkdtempSync, readFileSync, readdirSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";

import {
  createEvalRunEnvelope,
  finalizeEvalRun,
  summarizeCaseRows,
} from "../shared/artifacts.mjs";

const DEFAULT_MANIFEST_PATH = "scripts/evals/golden/product-critical-manifest.json";

function normalizeString(value, fallback = "") {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;
}

function boolFromEnv(value, fallback = false) {
  if (typeof value !== "string") return fallback;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
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
    dryRun: boolFromEnv(flags.get("dry-run") ?? env.GOLDEN_PRODUCT_DRY_RUN, false),
    layer: normalizeString(flags.get("layer") ?? env.GOLDEN_PRODUCT_LAYER, "eval"),
    artifactPath: normalizeString(flags.get("artifact-path") ?? env.GOLDEN_PRODUCT_ARTIFACT_PATH, ""),
    manifestPath: path.resolve(
      process.cwd(),
      normalizeString(flags.get("manifest") ?? env.GOLDEN_PRODUCT_MANIFEST_PATH, DEFAULT_MANIFEST_PATH),
    ),
  };
}

function loadManifest(manifestPath) {
  try {
    return JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch {
    return { version: 1, layers: {} };
  }
}

function runProductGoldenCommand(layer, artifactDir) {
  const command = spawnSync(
    "node",
    ["scripts/run-agent-test-suite.mjs", `--layer=${layer}`],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {
        ...process.env,
        AGENT_TEST_SUITE_ARTIFACT_DIR: artifactDir,
      },
    },
  );
  return {
    status: command.status ?? 1,
    stdout: command.stdout ?? "",
    stderr: command.stderr ?? "",
  };
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

  return candidates.sort().at(-1) ?? null;
}

export async function runProductCriticalGoldens(
  argv = process.argv.slice(2),
  env = process.env,
) {
  const config = parseArgs(argv, env);
  const envelope = createEvalRunEnvelope({
    evalSuite: "product-critical-goldens",
    evalType: "golden",
    artifactRoot: env.EVAL_ARTIFACT_ROOT,
  });
  const manifest = loadManifest(config.manifestPath);
  const layerManifest = manifest?.layers?.[config.layer] ?? {};

  let commandResult;
  let suiteArtifact = null;
  if (config.artifactPath) {
    commandResult = {
      status: 0,
      stdout: "artifact-backed product critical golden suite",
      stderr: "",
    };
    try {
      suiteArtifact = JSON.parse(readFileSync(config.artifactPath, "utf8"));
    } catch {
      suiteArtifact = null;
    }
  } else if (config.dryRun) {
    commandResult = {
      status: 0,
      stdout: "dry-run product critical golden suite",
      stderr: "",
    };
  } else {
    const suiteArtifactDir = mkdtempSync(
      path.join(os.tmpdir(), `product-goldens-${config.layer}-`),
    );
    commandResult = runProductGoldenCommand(config.layer, suiteArtifactDir);
    try {
      const artifactPath = findLatestJsonArtifact(suiteArtifactDir);
      suiteArtifact = JSON.parse(
        readFileSync(artifactPath, "utf8"),
      );
    } catch {
      suiteArtifact = null;
    }
  }

  const caseCounts = suiteArtifact?.summary?.caseCounts ?? null;
  const failureClasses = suiteArtifact?.summary?.failureClasses ?? null;
  const scenarioIds = Array.from(
    new Set(
      Array.isArray(suiteArtifact?.records)
        ? suiteArtifact.records
            .map((record) => (typeof record?.scenarioId === "string" ? record.scenarioId : null))
            .filter(Boolean)
        : [],
    ),
  );
  const requiredScenarioIds = Array.isArray(layerManifest.requiredScenarioIds)
    ? layerManifest.requiredScenarioIds.filter((value) => typeof value === "string")
    : [];
  const missingScenarioIds = requiredScenarioIds.filter(
    (scenarioId) => !scenarioIds.includes(scenarioId),
  );
  const caseCountPass =
    !Number.isFinite(layerManifest.minCaseCount) ||
    (caseCounts?.total ?? 0) >= layerManifest.minCaseCount;
  const recordCountPass =
    !Number.isFinite(layerManifest.minRecordCount) ||
    (suiteArtifact?.summary?.recordCounts?.total ?? 0) >= layerManifest.minRecordCount;
  const scenarioCoveragePass = missingScenarioIds.length === 0;
  const passed =
    config.dryRun ||
    (
      commandResult.status === 0 &&
      caseCountPass &&
      recordCountPass &&
      scenarioCoveragePass
    );
  const caseRows = [
    {
      caseId: `product-critical-${config.layer}`,
      status: passed ? "passed" : "failed",
      score:
        typeof caseCounts?.total === "number" && caseCounts.total > 0
          ? Number((caseCounts.passed / caseCounts.total).toFixed(3))
          : passed
            ? 1
            : 0,
      primaryFailureReason:
        passed
          ? "none"
          : !caseCountPass
            ? "case_count_below_threshold"
            : !recordCountPass
              ? "record_count_below_threshold"
              : !scenarioCoveragePass
                ? "missing_required_scenarios"
          : Object.entries(failureClasses ?? {}).sort((left, right) => right[1] - left[1])[0]?.[0] ??
            `agent-test-suite-${config.layer}-failed`,
      layer: config.layer,
      command: `node scripts/run-agent-test-suite.mjs --layer=${config.layer}`,
      stdout: commandResult.stdout,
      stderr: commandResult.stderr,
      suiteSummary: suiteArtifact?.summary ?? null,
      missingScenarioIds,
    },
  ];

  const summary = {
    ...summarizeCaseRows(caseRows),
    layer: config.layer,
    suiteSummary: suiteArtifact?.summary ?? null,
    requiredScenarioIds,
    missingScenarioIds,
  };

  return finalizeEvalRun(envelope, summary, caseRows, {
    suiteArtifact,
    manifestPath: config.manifestPath,
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = await runProductCriticalGoldens();
  console.log(JSON.stringify(result.summary, null, 2));
  console.log(`artifact written to ${path.join(result.runDir, "run.json")}`);
}
