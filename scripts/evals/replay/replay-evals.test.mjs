import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtempSync, readFileSync } from "node:fs";

import { runReplayEvals } from "./run-replay-evals.mjs";

test("replay eval runner writes standard replay artifacts", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "replay-evals-"));
  const result = await runReplayEvals([], {
    ...process.env,
    EVAL_ARTIFACT_ROOT: root,
  });

  const summary = JSON.parse(readFileSync(path.join(result.runDir, "summary.json"), "utf8"));
  const run = JSON.parse(readFileSync(path.join(result.runDir, "run.json"), "utf8"));

  assert.equal(summary.totalCases, 2);
  assert.equal(summary.failedCases, 0);
  assert.equal(run.evalType, "replay");
  assert.equal(summary.corpusSuite, "sample-replay-corpus");
});

test("replay eval runner executes command-backed cases", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "replay-exec-"));
  const result = await runReplayEvals([], {
    ...process.env,
    EVAL_ARTIFACT_ROOT: root,
  });

  assert.equal(result.summary.totalCases, 2);
  assert.equal(result.summary.failedCases, 0);
  assert.equal(result.summary.primaryFailureReason, "none");
});

test("replay eval runner supports historical conversation corpus expectations", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "replay-historical-"));
  const corpusPath = path.resolve(
    "scripts/evals/replay/sample-historical-replay-corpus.json",
  );
  const result = await runReplayEvals([`--corpus=${corpusPath}`], {
    ...process.env,
    EVAL_ARTIFACT_ROOT: root,
  });

  assert.equal(result.summary.totalCases, 2);
  assert.equal(result.summary.failedCases, 0);
  assert.equal(result.summary.corpusSuite, "sample-historical-replay-corpus");
});

test("replay eval runner can consume raw historical export files directly", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "replay-historical-export-"));
  const corpusPath = path.resolve(
    "scripts/evals/replay/sample-historical-export.jsonl",
  );
  const result = await runReplayEvals(
    [`--source=historical-export`, `--corpus=${corpusPath}`],
    {
      ...process.env,
      EVAL_ARTIFACT_ROOT: root,
    },
  );

  assert.equal(result.summary.source, "historical-export");
  assert.equal(result.summary.totalCases, 2);
  assert.equal(result.summary.corpusSuite, "sample-historical-export");
});
