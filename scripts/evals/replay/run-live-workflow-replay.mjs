#!/usr/bin/env node

import path from "node:path";

import { fetchWorkflowReplayExport } from "./fetch-workflow-replay-export.mjs";
import { runReplayEvals } from "./run-replay-evals.mjs";

function parseArgs(argv = process.argv.slice(2), env = process.env) {
  const flags = new Map();
  for (const arg of argv) {
    if (!arg.startsWith("--")) continue;
    const withoutPrefix = arg.slice(2);
    const [key, rawValue] = withoutPrefix.split("=", 2);
    flags.set(key, rawValue ?? "true");
  }

  return {
    exportPath: path.resolve(
      process.cwd(),
      flags.get("export-output") ??
        env.EVAL_REPLAY_EXPORT_OUTPUT ??
        path.join(".artifacts", "eval-fetch", "workflow-replay-export.json"),
    ),
  };
}

export async function runLiveWorkflowReplay(
  argv = process.argv.slice(2),
  env = process.env,
  deps = {
    fetchWorkflowReplayExport,
    runReplayEvals,
  },
) {
  const config = parseArgs(argv, env);
  const fetchResult = await deps.fetchWorkflowReplayExport(
    [`--output=${config.exportPath}`, ...argv],
    env,
  );
  const replayResult = await deps.runReplayEvals(
    ["--source=historical-export", `--corpus=${config.exportPath}`],
    env,
  );

  return {
    fetch: fetchResult,
    replay: replayResult,
    exportPath: config.exportPath,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = await runLiveWorkflowReplay();
  console.log(
    JSON.stringify(
      {
        exportPath: result.exportPath,
        fetch: result.fetch,
        replaySummary: result.replay.summary,
      },
      null,
      2,
    ),
  );
}
