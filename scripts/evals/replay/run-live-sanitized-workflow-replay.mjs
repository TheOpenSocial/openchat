#!/usr/bin/env node

import path from "node:path";

import { fetchWorkflowReplayExport } from "./fetch-workflow-replay-export.mjs";
import { sanitizeRuntimeExport } from "./sanitize-runtime-export.mjs";
import { runReplayEvals } from "./run-replay-evals.mjs";

function parseArgs(argv = process.argv.slice(2), env = process.env) {
  const flags = new Map();
  for (const arg of argv) {
    if (!arg.startsWith("--")) continue;
    const withoutPrefix = arg.slice(2);
    const [key, rawValue] = withoutPrefix.split("=", 2);
    flags.set(key, rawValue ?? "true");
  }

  const rawExportPath = path.resolve(
    process.cwd(),
    flags.get("export-output") ??
      env.EVAL_REPLAY_EXPORT_OUTPUT ??
      path.join(".artifacts", "eval-fetch", "workflow-replay-export.json"),
  );

  return {
    rawExportPath,
    sanitizedExportPath: path.resolve(
      process.cwd(),
      flags.get("sanitized-output") ??
        env.EVAL_REPLAY_SANITIZED_OUTPUT ??
        rawExportPath.replace(/\.json$/i, ".sanitized.jsonl"),
    ),
  };
}

export async function runLiveSanitizedWorkflowReplay(
  argv = process.argv.slice(2),
  env = process.env,
  deps = {
    fetchWorkflowReplayExport,
    sanitizeRuntimeExport,
    runReplayEvals,
  },
) {
  const config = parseArgs(argv, env);
  const fetchResult = await deps.fetchWorkflowReplayExport(
    [`--output=${config.rawExportPath}`, ...argv],
    env,
  );
  const sanitizeResult = await deps.sanitizeRuntimeExport(
    [
      `--input=${config.rawExportPath}`,
      `--output=${config.sanitizedExportPath}`,
    ],
    env,
  );
  const replayResult = await deps.runReplayEvals(
    ["--source=historical-export", `--corpus=${config.sanitizedExportPath}`],
    env,
  );

  return {
    fetch: fetchResult,
    sanitize: sanitizeResult,
    replay: replayResult,
    rawExportPath: config.rawExportPath,
    sanitizedExportPath: config.sanitizedExportPath,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = await runLiveSanitizedWorkflowReplay();
  console.log(
    JSON.stringify(
      {
        rawExportPath: result.rawExportPath,
        sanitizedExportPath: result.sanitizedExportPath,
        fetch: result.fetch,
        sanitize: result.sanitize,
        replaySummary: result.replay.summary,
      },
      null,
      2,
    ),
  );
}
