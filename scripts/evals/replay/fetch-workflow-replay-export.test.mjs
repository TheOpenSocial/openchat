import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtempSync, readFileSync } from "node:fs";

import { fetchWorkflowReplayExport } from "./fetch-workflow-replay-export.mjs";

test("fetch workflow replay export writes replayable conversation export", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "workflow-replay-export-"));
  const outputPath = path.join(root, "workflow-replay-export.json");

  const result = await fetchWorkflowReplayExport(
    [`--base-url=https://example.test`, `--output=${outputPath}`, "--limit=2"],
    process.env,
    async (url) => {
      if (String(url).includes("/api/admin/ops/agent-workflows?")) {
        return {
          ok: true,
          async json() {
            return {
              ok: true,
              data: {
                runs: [
                  { workflowRunId: "social:intent:wf-1", replayability: "replayable" },
                ],
              },
            };
          },
        };
      }

      return {
        ok: true,
        async json() {
          return {
            ok: true,
            data: {
              run: {
                workflowRunId: "social:intent:wf-1",
                traceId: "trace-1",
                domain: "social",
                replayability: "replayable",
                health: "healthy",
                sideEffects: [{ type: "message_send" }],
                stageStatusCounts: { completed: 2 },
              },
              trace: {
                eventCount: 2,
                events: [
                  {
                    action: "agent.plan_selected",
                    summary: "Selected planning path.",
                    metadata: { tool: "planner" },
                  },
                  {
                    action: "agent.response_generated",
                    summary: "Prepared response for the user.",
                    metadata: { tool: "compose-response" },
                  },
                ],
              },
              insights: {
                failureClass: "none",
              },
            },
          };
        },
      };
    },
  );

  const written = JSON.parse(readFileSync(outputPath, "utf8"));
  assert.equal(result.runCount, 1);
  assert.equal(written.conversations.length, 1);
  assert.equal(written.conversations[0].conversationId, "social:intent:wf-1");
  assert.equal(written.conversations[0].expected.allowSideEffects, true);
  assert.equal(written.conversations[0].observed.sideEffects, true);
  assert.deepEqual(written.conversations[0].observed.toolCalls, [
    "planner",
    "compose-response",
  ]);
});
