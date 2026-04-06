import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";

import { runLiveWorkflowReplay } from "./run-live-workflow-replay.mjs";

test("live workflow replay composes export fetch and replay execution", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "live-workflow-replay-"));
  const exportPath = path.join(root, "workflow-replay-export.json");

  const result = await runLiveWorkflowReplay(
    [`--export-output=${exportPath}`],
    {
      ...process.env,
      EVAL_ARTIFACT_ROOT: path.join(root, "artifacts"),
    },
    {
      async fetchWorkflowReplayExport() {
        writeFileSync(
          exportPath,
          JSON.stringify(
            {
              version: 1,
              suite: "workflow-replay-export",
              conversations: [
                {
                  conversationId: "workflow-1",
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
          outputPath: exportPath,
          runCount: 1,
          baseUrl: "https://example.test",
        };
      },
      async runReplayEvals(argv) {
        assert.deepEqual(argv, [
          "--source=historical-export",
          `--corpus=${exportPath}`,
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
  assert.equal(result.replay.summary.source, "historical-export");
  const written = JSON.parse(readFileSync(exportPath, "utf8"));
  assert.equal(written.conversations[0].conversationId, "workflow-1");
});
