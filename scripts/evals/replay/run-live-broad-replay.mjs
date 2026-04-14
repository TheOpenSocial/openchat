#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { fetchAgentWorkflowsSnapshot } from "../online/fetch-agent-workflows-snapshot.mjs";
import { fetchAgenticEvalSnapshot } from "../online/fetch-agentic-evals-snapshot.mjs";
import { convertAgentWorkflowsSnapshotToReplay } from "./convert-agent-workflows-snapshot-to-replay.mjs";
import { convertAgenticSnapshotToReplay } from "./convert-agentic-snapshot-to-replay.mjs";
import { runLiveSanitizedWorkflowReplay } from "./run-live-sanitized-workflow-replay.mjs";
import { runReplayEvals } from "./run-replay-evals.mjs";

function parseArgs(argv = process.argv.slice(2), env = process.env) {
  const flags = new Map();
  for (const arg of argv) {
    if (!arg.startsWith("--")) continue;
    const withoutPrefix = arg.slice(2);
    const [key, rawValue] = withoutPrefix.split("=", 2);
    flags.set(key, rawValue ?? "true");
  }

  const rootDir = path.resolve(
    process.cwd(),
    flags.get("artifact-dir") ??
      env.EVAL_LIVE_BROAD_REPLAY_DIR ??
      path.join(".artifacts", "eval-fetch"),
  );

  return {
    workflowExportPath: path.join(rootDir, "live-workflow-replay-export.json"),
    workflowSanitizedPath: path.join(
      rootDir,
      "live-workflow-replay-export.sanitized.jsonl",
    ),
    workflowSnapshotPath: path.join(rootDir, "agent-workflows-snapshot.json"),
    workflowSnapshotReplayPath: path.join(
      rootDir,
      "agent-workflows-snapshot.replay.jsonl",
    ),
    snapshotPath: path.join(rootDir, "agentic-evals-snapshot.json"),
    snapshotReplayPath: path.join(
      rootDir,
      "agentic-evals-snapshot.replay.jsonl",
    ),
    combinedReplayPath: path.join(rootDir, "live-broad-replay.jsonl"),
  };
}

function stripManagedArgs(argv = []) {
  return argv.filter(
    (arg) =>
      !arg.startsWith("--artifact-dir=") &&
      !arg.startsWith("--export-output=") &&
      !arg.startsWith("--sanitized-output=") &&
      !arg.startsWith("--output="),
  );
}

function readJsonLines(filePath) {
  return readFileSync(filePath, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

export async function runLiveBroadReplay(
  argv = process.argv.slice(2),
  env = process.env,
  deps = {
    fetchAgentWorkflowsSnapshot,
    fetchAgenticEvalSnapshot,
    convertAgentWorkflowsSnapshotToReplay,
    convertAgenticSnapshotToReplay,
    runLiveSanitizedWorkflowReplay,
    runReplayEvals,
  },
) {
  const config = parseArgs(argv, env);
  const passthroughArgs = stripManagedArgs(argv);

  const workflowReplay = await deps.runLiveSanitizedWorkflowReplay(
    [
      `--export-output=${config.workflowExportPath}`,
      `--sanitized-output=${config.workflowSanitizedPath}`,
      ...passthroughArgs,
    ],
    env,
  );

  const workflowSnapshotFetch = await deps.fetchAgentWorkflowsSnapshot(
    [`--output=${config.workflowSnapshotPath}`, ...passthroughArgs],
    env,
  );
  const workflowSnapshotReplay =
    await deps.convertAgentWorkflowsSnapshotToReplay(
      [
        `--input=${config.workflowSnapshotPath}`,
        `--output=${config.workflowSnapshotReplayPath}`,
      ],
      env,
    );

  const snapshotFetch = await deps.fetchAgenticEvalSnapshot(
    [`--output=${config.snapshotPath}`, ...passthroughArgs],
    env,
  );
  const snapshotReplay = await deps.convertAgenticSnapshotToReplay(
    [`--input=${config.snapshotPath}`, `--output=${config.snapshotReplayPath}`],
    env,
  );

  const combinedRows = [
    ...readJsonLines(config.workflowSanitizedPath),
    ...readJsonLines(config.workflowSnapshotReplayPath),
    ...readJsonLines(config.snapshotReplayPath),
  ];
  writeFileSync(
    config.combinedReplayPath,
    `${combinedRows.join("\n")}\n`,
    "utf8",
  );

  const replay = await deps.runReplayEvals(
    ["--source=historical-export", `--corpus=${config.combinedReplayPath}`],
    env,
  );

  return {
    workflowReplay,
    workflowSnapshotFetch,
    workflowSnapshotReplay,
    snapshotFetch,
    snapshotReplay,
    replay,
    combinedReplayPath: config.combinedReplayPath,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = await runLiveBroadReplay();
  console.log(
    JSON.stringify(
      {
        combinedReplayPath: result.combinedReplayPath,
        workflowReplaySummary: result.workflowReplay.replay.summary,
        workflowSnapshotFetch: result.workflowSnapshotFetch,
        snapshotFetch: result.snapshotFetch,
        replaySummary: result.replay.summary,
      },
      null,
      2,
    ),
  );
}
