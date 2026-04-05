import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtempSync, readFileSync } from "node:fs";

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

