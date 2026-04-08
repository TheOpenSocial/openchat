import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";

import { runLiveSanitizedWorkflowReplay } from "./run-live-sanitized-workflow-replay.mjs";

test("live sanitized workflow replay fetches, sanitizes, and evaluates replay traces", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "live-sanitized-workflow-replay-"));
  const rawExportPath = path.join(root, "workflow-replay-export.json");
  const sanitizedExportPath = path.join(root, "workflow-replay-export.sanitized.jsonl");

  const result = await runLiveSanitizedWorkflowReplay(
    [`--export-output=${rawExportPath}`, `--sanitized-output=${sanitizedExportPath}`],
    {
      ...process.env,
      EVAL_ARTIFACT_ROOT: path.join(root, "artifacts"),
    },
    {
      async fetchWorkflowReplayExport() {
        writeFileSync(
          rawExportPath,
          JSON.stringify(
            {
              version: 1,
              suite: "workflow-replay-export",
              conversations: [
                {
                  conversationId: "workflow-123e4567-e89b-12d3-a456-426614174000",
                  messages: [
                    {
                      role: "user",
                      content: "Email maria@example.com before doing anything else.",
                    },
                  ],
                  expected: {},
                  observed: {
                    selectedTool: "calendar.lookup",
                    toolCalls: ["calendar.lookup"],
                    behaviors: ["respected_side_effect_block"],
                    outputText: "Found the matching workflow trace.",
                    latencyMs: 120,
                    sideEffects: false,
                  },
                },
              ],
            },
            null,
            2,
          ),
        );
        return {
          outputPath: rawExportPath,
          runCount: 1,
          baseUrl: "https://example.test",
        };
      },
      async sanitizeRuntimeExport(argv) {
        assert.deepEqual(argv, [
          `--input=${rawExportPath}`,
          `--output=${sanitizedExportPath}`,
        ]);
        writeFileSync(
          sanitizedExportPath,
          `${JSON.stringify({
            conversationId: "workflow-[redacted-uuid]",
            channel: "agent_workflow",
            provider: "social",
            toolFamily: "workflow",
            observed: {
              selectedTool: "calendar.lookup",
              toolCalls: ["calendar.lookup"],
              behaviors: ["respected_side_effect_block"],
              outputText: "Found the matching workflow trace.",
              latencyMs: 120,
              sideEffects: false,
            },
            expected: {},
          })}\n`,
        );
        return {
          inputPath: rawExportPath,
          outputPath: sanitizedExportPath,
          recordCount: 1,
        };
      },
      async runReplayEvals(argv) {
        assert.deepEqual(argv, [
          "--source=historical-export",
          `--corpus=${sanitizedExportPath}`,
        ]);
        return {
          summary: {
            source: "historical-export",
            totalCases: 1,
            failedCases: 0,
          },
        };
      },
    },
  );

  assert.equal(result.fetch.runCount, 1);
  assert.equal(result.sanitize.recordCount, 1);
  assert.equal(result.replay.summary.failedCases, 0);
  const sanitized = readFileSync(sanitizedExportPath, "utf8");
  assert.match(sanitized, /\[redacted-uuid\]/);
});
