import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtempSync, readFileSync } from "node:fs";

import { fetchAgentWorkflowsSnapshot } from "./fetch-agent-workflows-snapshot.mjs";

test("fetch agent workflows snapshot writes normalized admin payload to disk", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "agent-workflows-fetch-"));
  const outputPath = path.join(root, "snapshot.json");

  const result = await fetchAgentWorkflowsSnapshot(
    [`--base-url=https://example.test`, `--output=${outputPath}`, "--limit=5"],
    process.env,
    async (url) => {
      assert.equal(
        url,
        "https://example.test/api/admin/ops/agent-workflows?limit=5",
      );
      return {
        ok: true,
        async json() {
          return {
            ok: true,
            data: {
              summary: {
                totalRuns: 2,
                health: { healthy: 1, watch: 1, critical: 0 },
              },
              runs: [{ workflowRunId: "wf-1" }, { workflowRunId: "wf-2" }],
            },
          };
        },
      };
    },
  );

  const written = JSON.parse(readFileSync(outputPath, "utf8"));
  assert.equal(result.runCount, 2);
  assert.equal(result.totalRuns, 2);
  assert.equal(written.summary.totalRuns, 2);
});
