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

