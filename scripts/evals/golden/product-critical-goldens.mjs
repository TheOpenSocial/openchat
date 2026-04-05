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
  };
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
  const passed = commandResult.status === 0;
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
          : Object.entries(failureClasses ?? {}).sort((left, right) => right[1] - left[1])[0]?.[0] ??
            `agent-test-suite-${config.layer}-failed`,
      layer: config.layer,
      command: `node scripts/run-agent-test-suite.mjs --layer=${config.layer}`,
      stdout: commandResult.stdout,
      stderr: commandResult.stderr,
      suiteSummary: suiteArtifact?.summary ?? null,
    },
  ];

  const summary = {
    ...summarizeCaseRows(caseRows),
    layer: config.layer,
    suiteSummary: suiteArtifact?.summary ?? null,
  };

  return finalizeEvalRun(envelope, summary, caseRows, {
    suiteArtifact,
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = await runProductCriticalGoldens();
  console.log(JSON.stringify(result.summary, null, 2));
  console.log(`artifact written to ${path.join(result.runDir, "run.json")}`);
}
