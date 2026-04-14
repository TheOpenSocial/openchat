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

test("fetch agent workflows snapshot reuses staging smoke env fallback keys", async () => {
  const root = mkdtempSync(
    path.join(os.tmpdir(), "agent-workflows-fetch-fallback-"),
  );
  const outputPath = path.join(root, "snapshot.json");

  await fetchAgentWorkflowsSnapshot(
    [`--output=${outputPath}`, "--limit=5"],
    {
      ...process.env,
      STAGING_API_BASE_URL: "https://staging.example.test",
      STAGING_SMOKE_ADMIN_USER_ID: "staging-admin-user",
      STAGING_SMOKE_ADMIN_API_KEY: "staging-admin-key",
    },
    async (url, options) => {
      assert.equal(
        url,
        "https://staging.example.test/api/admin/ops/agent-workflows?limit=5",
      );
      assert.equal(options.headers["x-admin-user-id"], "staging-admin-user");
      assert.equal(options.headers["x-admin-api-key"], "staging-admin-key");
      return {
        ok: true,
        async json() {
          return {
            ok: true,
            data: {
              summary: {
                totalRuns: 0,
                health: { healthy: 0, watch: 0, critical: 0 },
              },
              runs: [],
            },
          };
        },
      };
    },
  );
});
