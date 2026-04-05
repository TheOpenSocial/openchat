#!/usr/bin/env node

import { spawnSync } from "node:child_process";
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
  };
}

function runProductGoldenCommand(layer) {
  const command = spawnSync(
    "node",
    ["scripts/run-agent-test-suite.mjs", `--layer=${layer}`],
    {
      cwd: process.cwd(),
      encoding: "utf8",
    },
  );
  return {
    status: command.status ?? 1,
    stdout: command.stdout ?? "",
    stderr: command.stderr ?? "",
  };
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
  if (config.dryRun) {
    commandResult = {
      status: 0,
      stdout: "dry-run product critical golden suite",
      stderr: "",
    };
  } else {
    commandResult = runProductGoldenCommand(config.layer);
  }

  const caseRows = [
    {
      caseId: `product-critical-${config.layer}`,
      status: commandResult.status === 0 ? "passed" : "failed",
      score: commandResult.status === 0 ? 1 : 0,
      primaryFailureReason:
        commandResult.status === 0 ? "none" : `agent-test-suite-${config.layer}-failed`,
      layer: config.layer,
      command: `node scripts/run-agent-test-suite.mjs --layer=${config.layer}`,
      stdout: commandResult.stdout,
      stderr: commandResult.stderr,
    },
  ];

  const summary = {
    ...summarizeCaseRows(caseRows),
    layer: config.layer,
  };

  return finalizeEvalRun(envelope, summary, caseRows);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = await runProductCriticalGoldens();
  console.log(JSON.stringify(result.summary, null, 2));
  console.log(`artifact written to ${path.join(result.runDir, "run.json")}`);
}

