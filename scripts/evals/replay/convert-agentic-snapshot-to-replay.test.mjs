import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";

import { convertAgenticSnapshotToReplay } from "./convert-agentic-snapshot-to-replay.mjs";

test("convertAgenticSnapshotToReplay writes replayable jsonl records from snapshot scenarios", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "agentic-snapshot-replay-"));
  const inputPath = path.join(root, "snapshot.json");
  const outputPath = path.join(root, "snapshot.replay.jsonl");

  writeFileSync(
    inputPath,
    JSON.stringify(
      {
        summary: { status: "watch" },
        traceGrade: { status: "watch" },
        explainability: { summary: "Correctness regressed." },
        scenarios: [
          {
            scenarioId: "eval_planning_bounds_v1",
            title: "Plan bounds",
            dimension: "correctness",
            passed: true,
            score: 1,
            details: "Planner respected limits.",
          },
          {
            scenarioId: "eval_moderation_fallback_v1",
            title: "Moderation fallback",
            dimension: "safety",
            passed: false,
            score: 0,
            details: "Fallback missing.",
          },
        ],
      },
      null,
      2,
    ),
  );

  const result = convertAgenticSnapshotToReplay([
    `--input=${inputPath}`,
    `--output=${outputPath}`,
  ]);

  const rows = readFileSync(outputPath, "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));

  assert.equal(result.caseCount, 2);
  assert.equal(rows[0].conversationId, "eval_planning_bounds_v1");
  assert.equal(rows[0].toolFamily, "correctness");
  assert.deepEqual(rows[0].observed.behaviors, ["scenario_passed"]);
  assert.equal(rows[1].conversationId, "eval_moderation_fallback_v1");
  assert.deepEqual(rows[1].observed.behaviors, ["scenario_failed"]);
  assert.ok(rows[1].observed.outputText.includes("Fallback missing."));
});
