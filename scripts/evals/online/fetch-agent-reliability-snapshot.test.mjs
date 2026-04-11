import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtempSync, readFileSync } from "node:fs";

import { fetchAgentReliabilitySnapshot } from "./fetch-agent-reliability-snapshot.mjs";

test("fetch agent reliability snapshot writes normalized admin payload to disk", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "agent-reliability-"));
  const outputPath = path.join(root, "agent-reliability-snapshot.json");

  const result = await fetchAgentReliabilitySnapshot(
    [`--base-url=https://example.test`, `--output=${outputPath}`],
    {
      EVAL_ADMIN_USER_ID: "admin-user",
      EVAL_ADMIN_ROLE: "admin",
      EVAL_ADMIN_API_KEY: "admin-key",
    },
    async (url, init) => {
      assert.match(
        url.toString(),
        /https:\/\/example\.test\/api\/admin\/ops\/agent-reliability\?/,
      );
      assert.equal(init.headers["x-admin-user-id"], "admin-user");
      return {
        ok: true,
        json: async () => ({
          data: {
            workflow: { totalRuns: 12 },
            eval: { status: "watch" },
            canary: { verdict: "watch" },
          },
        }),
      };
    },
  );

  assert.equal(result.workflowTotalRuns, 12);
  assert.equal(result.evalStatus, "watch");
  assert.equal(result.canaryVerdict, "watch");
  assert.equal(
    JSON.parse(readFileSync(outputPath, "utf8")).workflow.totalRuns,
    12,
  );
});
