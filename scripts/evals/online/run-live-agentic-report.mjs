#!/usr/bin/env node

import path from "node:path";

import { fetchAgenticEvalSnapshot } from "./fetch-agentic-evals-snapshot.mjs";
import { reportQualityEvents } from "./report-quality-events.mjs";

function parseArgs(argv = process.argv.slice(2), env = process.env) {
  const flags = new Map();
  for (const arg of argv) {
    if (!arg.startsWith("--")) continue;
    const withoutPrefix = arg.slice(2);
    const [key, rawValue] = withoutPrefix.split("=", 2);
    flags.set(key, rawValue ?? "true");
  }

  return {
    snapshotPath: path.resolve(
      process.cwd(),
      flags.get("snapshot-output") ??
        env.EVAL_AGENTIC_SNAPSHOT_OUTPUT ??
        path.join(".artifacts", "eval-fetch", "agentic-evals-snapshot.json"),
    ),
  };
}

export async function runLiveAgenticReport(
  argv = process.argv.slice(2),
  env = process.env,
  deps = {
    fetchAgenticEvalSnapshot,
    reportQualityEvents,
  },
) {
  const config = parseArgs(argv, env);
  const fetchResult = await deps.fetchAgenticEvalSnapshot(
    [`--output=${config.snapshotPath}`, ...argv],
    env,
  );
  const reportResult = await deps.reportQualityEvents(
    ["--source=agentic-evals-snapshot", `--events=${config.snapshotPath}`],
    env,
  );

  return {
    fetch: fetchResult,
    report: reportResult,
    snapshotPath: config.snapshotPath,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = await runLiveAgenticReport();
  console.log(
    JSON.stringify(
      {
        snapshotPath: result.snapshotPath,
        fetch: result.fetch,
        reportSummary: result.report.summary,
      },
      null,
      2,
    ),
  );
}
