#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

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

  const inputPath = normalizeString(
    flags.get("input") ?? env.EVAL_AGENT_WORKFLOW_SNAPSHOT_INPUT,
    "",
  );
  const outputPath = normalizeString(
    flags.get("output") ?? env.EVAL_AGENT_WORKFLOW_REPLAY_OUTPUT,
    inputPath ? inputPath.replace(/\.json$/i, ".replay.jsonl") : "",
  );

  return {
    inputPath: inputPath ? path.resolve(process.cwd(), inputPath) : "",
    outputPath: outputPath ? path.resolve(process.cwd(), outputPath) : "",
  };
}

function loadSnapshot(inputPath) {
  return JSON.parse(readFileSync(inputPath, "utf8"));
}

function workflowRunToReplayRecord(run, snapshot) {
  const workflowRunId = normalizeString(
    run?.workflowRunId,
    run?.traceId ?? "unknown-workflow-run",
  );
  const traceId = normalizeString(run?.traceId, "");
  const domain = normalizeString(run?.domain, "workflow");
  const health = normalizeString(run?.health, "unknown");
  const failureClass = normalizeString(run?.failureClass, "none");
  const totalRuns = Number(snapshot?.summary?.totalRuns ?? 0);

  return {
    conversationId: workflowRunId,
    channel: "agent_workflow_snapshot",
    provider: "agent-workflows-snapshot",
    toolFamily: domain,
    transcript: [
      {
        role: "system",
        content: `Workflow domain: ${domain}`,
      },
      {
        role: "assistant",
        content: `Workflow run ${workflowRunId} is ${health} with failure class ${failureClass}.`,
      },
    ],
    expected: {
      requiredBehaviors: [`workflow_health_${health}`],
      outputIncludes: [health, failureClass],
      forbiddenTools: [],
      forbiddenToolCalls: [],
      allowSideEffects: false,
      maxLatencyMs: null,
    },
    observed: {
      selectedTool: "",
      toolCalls: [],
      behaviors: [
        `workflow_health_${health}`,
        failureClass !== "none"
          ? `workflow_failure_${failureClass}`
          : "workflow_failure_none",
      ],
      outputText: `Workflow run ${workflowRunId} (${traceId || "no-trace"}) in ${domain} is ${health} with failure class ${failureClass}.`,
      latencyMs: 0,
      sideEffects: false,
    },
    metadata: {
      workflowRunId,
      traceId,
      domain,
      health,
      failureClass,
      totalRuns,
      summaryHealth: snapshot?.summary?.health ?? {},
    },
  };
}

export function convertAgentWorkflowsSnapshotToReplay(
  argv = process.argv.slice(2),
  env = process.env,
) {
  const config = parseArgs(argv, env);
  if (!config.inputPath) {
    throw new Error(
      "Missing --input for agent workflows snapshot replay conversion.",
    );
  }
  if (!config.outputPath) {
    throw new Error(
      "Missing --output for agent workflows snapshot replay conversion.",
    );
  }

  const snapshot = loadSnapshot(config.inputPath);
  const runs = Array.isArray(snapshot?.runs) ? snapshot.runs : [];
  const records = runs.map((run) => workflowRunToReplayRecord(run, snapshot));
  writeFileSync(
    config.outputPath,
    `${records.map((record) => JSON.stringify(record)).join("\n")}\n`,
    "utf8",
  );

  return {
    inputPath: config.inputPath,
    outputPath: config.outputPath,
    caseCount: records.length,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = convertAgentWorkflowsSnapshotToReplay();
  console.log(JSON.stringify(result, null, 2));
}
