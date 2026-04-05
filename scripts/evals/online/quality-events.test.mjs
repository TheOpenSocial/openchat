import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";

import { reportQualityEvents } from "./report-quality-events.mjs";

test("quality event report summarizes channels, providers, and failures", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "quality-report-"));
  const result = await reportQualityEvents([], {
    ...process.env,
    EVAL_ARTIFACT_ROOT: root,
  });
  const summary = JSON.parse(readFileSync(path.join(result.runDir, "summary.json"), "utf8"));

  assert.equal(summary.totalCases, 3);
  assert.equal(summary.failedCases, 2);
  assert.equal(summary.byChannel.dm, 2);
  assert.equal(summary.byProvider.ollama, 3);
  assert.equal(summary.byFailureTaxonomy.none, 1);
});

test("quality event report can summarize agent suite artifacts", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "quality-report-suite-"));
  const artifactPath = path.join(root, "eval.json");
  writeFileSync(
    artifactPath,
    JSON.stringify({
      records: [
        {
          checkId: "agentic-eval-scorecards",
          status: "passed",
          failureClass: null,
          workflowRunId: "wf-1",
          traceId: "trace-1",
        },
        {
          checkId: "queue-replay-safety",
          status: "failed",
          failureClass: "queue_or_replay",
          workflowRunId: "wf-2",
          traceId: "trace-2",
        },
      ],
    }),
  );
  const result = await reportQualityEvents(
    ["--source=agent-suite", `--events=${artifactPath}`],
    {
      ...process.env,
      EVAL_ARTIFACT_ROOT: root,
    },
  );
  const summary = JSON.parse(readFileSync(path.join(result.runDir, "summary.json"), "utf8"));

  assert.equal(summary.source, "agent-suite");
  assert.equal(summary.totalCases, 2);
  assert.equal(summary.failedCases, 1);
  assert.equal(summary.byFailureTaxonomy.queue_or_replay, 1);
});

test("quality event report can summarize agentic eval snapshots", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "quality-report-snapshot-"));
  const snapshotPath = path.resolve(
    "scripts/evals/online/sample-agentic-evals-snapshot.json",
  );
  const result = await reportQualityEvents(
    ["--source=agentic-evals-snapshot", `--events=${snapshotPath}`],
    {
      ...process.env,
      EVAL_ARTIFACT_ROOT: root,
    },
  );
  const summary = JSON.parse(readFileSync(path.join(result.runDir, "summary.json"), "utf8"));

  assert.equal(summary.source, "agentic-evals-snapshot");
  assert.equal(summary.totalCases, 2);
  assert.equal(summary.failedCases, 1);
  assert.equal(summary.byTraceGradeStatus.watch, 2);
});
