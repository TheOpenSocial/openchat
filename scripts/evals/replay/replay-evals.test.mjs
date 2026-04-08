import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";

import { runReplayEvals } from "./run-replay-evals.mjs";
import { sanitizeRuntimeExport } from "./sanitize-runtime-export.mjs";

test("replay eval runner writes standard replay artifacts", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "replay-evals-"));
  const result = await runReplayEvals([], {
    ...process.env,
    EVAL_ARTIFACT_ROOT: root,
  });

  const summary = JSON.parse(readFileSync(path.join(result.runDir, "summary.json"), "utf8"));
  const run = JSON.parse(readFileSync(path.join(result.runDir, "run.json"), "utf8"));

  assert.equal(summary.totalCases, 4);
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

  assert.equal(result.summary.totalCases, 4);
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

  assert.equal(result.summary.totalCases, 4);
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
  assert.equal(result.summary.totalCases, 4);
  assert.equal(result.summary.corpusSuite, "sample-historical-export");
});

test("runtime export sanitization produces replay-safe exports that still score", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "replay-sanitized-runtime-"));
  const rawPath = path.resolve("scripts/evals/replay/sample-raw-runtime-export.jsonl");
  const sanitizedPath = path.join(root, "sanitized-runtime-export.jsonl");
  sanitizeRuntimeExport([`--input=${rawPath}`, `--output=${sanitizedPath}`]);

  const sanitizedRaw = readFileSync(sanitizedPath, "utf8");
  assert.match(sanitizedRaw, /\[redacted-email\]/);
  assert.match(sanitizedRaw, /\[redacted-token\]/);

  const result = await runReplayEvals(
    [`--source=historical-export`, `--corpus=${sanitizedPath}`],
    {
      ...process.env,
      EVAL_ARTIFACT_ROOT: root,
    },
  );

  assert.equal(result.summary.failedCases, 0);
  assert.equal(result.summary.totalCases, 2);
});

test("historical export replay allows observed side effects when explicitly expected", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "replay-side-effects-"));
  const corpusPath = path.join(root, "workflow-export.jsonl");
  const record = {
    conversationId: "workflow-run-1",
    channel: "agent_workflow",
    provider: "social",
    toolFamily: "workflow",
    expected: {
      allowSideEffects: true,
      forbiddenTools: [],
      forbiddenToolCalls: [],
    },
    observed: {
      selectedTool: "send_message",
      toolCalls: ["send_message"],
      behaviors: [],
      outputText: "Message sent.",
      latencyMs: 120,
      sideEffects: true,
    },
  };

  writeFileSync(corpusPath, `${JSON.stringify(record)}\n`, "utf8");

  const result = await runReplayEvals(
    [`--source=historical-export`, `--corpus=${corpusPath}`],
    {
      ...process.env,
      EVAL_ARTIFACT_ROOT: root,
    },
  );

  assert.equal(result.summary.failedCases, 0);
  assert.equal(result.summary.primaryFailureReason, "none");
});
