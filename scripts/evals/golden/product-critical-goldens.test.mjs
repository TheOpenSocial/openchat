import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtempSync, readFileSync } from "node:fs";

import { runProductCriticalGoldens } from "./product-critical-goldens.mjs";

test("product critical golden runner writes a standard artifact in dry-run mode", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "product-goldens-"));
  const result = await runProductCriticalGoldens(["--dry-run=1"], {
    ...process.env,
    EVAL_ARTIFACT_ROOT: root,
  });
  const summary = JSON.parse(readFileSync(path.join(result.runDir, "summary.json"), "utf8"));
  const run = JSON.parse(readFileSync(path.join(result.runDir, "run.json"), "utf8"));

  assert.equal(summary.totalCases, 1);
  assert.equal(summary.failedCases, 0);
  assert.equal(run.evalSuite, "product-critical-goldens");
});

