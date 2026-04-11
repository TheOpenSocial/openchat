import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";

import { convertAgentWorkflowsSnapshotToReplay } from "./convert-agent-workflows-snapshot-to-replay.mjs";

test("convertAgentWorkflowsSnapshotToReplay writes replayable jsonl records from workflow runs", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "agent-workflows-replay-"));
  const inputPath = path.join(root, "agent-workflows-snapshot.json");
  const outputPath = path.join(root, "agent-workflows-snapshot.replay.jsonl");

  writeFileSync(
    inputPath,
    JSON.stringify({
      summary: {
        totalRuns: 2,
        health: {
          healthy: 1,
          watch: 1,
          critical: 0,
        },
      },
      runs: [
        {
          workflowRunId: "social:intent:wf-1",
          traceId: "trace-1",
          domain: "social",
          health: "healthy",
          failureClass: "none",
        },
        {
          workflowRunId: "support:intent:wf-2",
          traceId: "trace-2",
          domain: "support",
          health: "watch",
          failureClass: "matching_or_negotiation",
        },
      ],
    }),
    "utf8",
  );

  const result = convertAgentWorkflowsSnapshotToReplay([
    `--input=${inputPath}`,
    `--output=${outputPath}`,
  ]);

  assert.equal(result.caseCount, 2);
  const rows = readFileSync(outputPath, "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  assert.equal(rows[0].channel, "agent_workflow_snapshot");
  assert.equal(rows[0].provider, "agent-workflows-snapshot");
  assert.deepEqual(rows[0].expected.requiredBehaviors, ["workflow_health_healthy"]);
  assert.deepEqual(rows[1].observed.behaviors, [
    "workflow_health_watch",
    "workflow_failure_matching_or_negotiation",
  ]);
});
