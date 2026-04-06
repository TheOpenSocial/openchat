import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";

import { runLiveAgenticReport } from "./run-live-agentic-report.mjs";

test("live agentic report composes snapshot fetch and online report", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "live-agentic-report-"));
  const snapshotPath = path.join(root, "snapshot.json");

  const result = await runLiveAgenticReport(
    [`--snapshot-output=${snapshotPath}`],
    {
      ...process.env,
      EVAL_ARTIFACT_ROOT: path.join(root, "artifacts"),
    },
    {
      async fetchAgenticEvalSnapshot() {
        writeFileSync(
          snapshotPath,
          JSON.stringify({
            generatedAt: "2026-04-05T23:00:00.000Z",
            summary: { status: "watch", regressionCount: 1 },
            traceGrade: { status: "watch", score: 0.74 },
            regressions: [{ key: "trace_grade_degraded", severity: "warning" }],
            scenarios: [
              {
                scenarioId: "eval_usefulness_no_match_recovery_v1",
                dimension: "usefulness",
                score: 0.5,
                passed: false,
              },
            ],
          }, null, 2),
        );
        return {
          outputPath: snapshotPath,
          baseUrl: "https://example.test",
          scenarioCount: 1,
          status: "watch",
          traceGradeStatus: "watch",
        };
      },
      async reportQualityEvents() {
        return {
          summary: {
            source: "agentic-evals-snapshot",
            totalCases: 1,
            failedCases: 1,
            primaryFailureReason: "trace_grade_degraded",
          },
        };
      },
    },
  );

  assert.equal(result.fetch.status, "watch");
  assert.equal(result.report.summary.source, "agentic-evals-snapshot");
  const written = JSON.parse(readFileSync(snapshotPath, "utf8"));
  assert.equal(written.summary.status, "watch");
});
