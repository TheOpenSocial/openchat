import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtempSync, readFileSync } from "node:fs";

import { fetchAgenticEvalSnapshot } from "./fetch-agentic-evals-snapshot.mjs";

test("fetch agentic eval snapshot writes normalized admin payload to disk", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "agentic-eval-fetch-"));
  const outputPath = path.join(root, "snapshot.json");

  const result = await fetchAgenticEvalSnapshot(
    [`--base-url=https://example.test`, `--output=${outputPath}`],
    process.env,
    async (url, options) => {
      assert.equal(url, "https://example.test/api/admin/ops/agentic-evals");
      assert.equal(options.method, "GET");
      assert.equal(options.headers["x-admin-role"], "support");
      return {
        ok: true,
        async json() {
          return {
            ok: true,
            data: {
              summary: { status: "healthy" },
              traceGrade: { status: "healthy" },
              scenarios: [{ id: "scenario-1" }, { id: "scenario-2" }],
            },
          };
        },
      };
    },
  );

  const written = JSON.parse(readFileSync(outputPath, "utf8"));
  assert.equal(result.scenarioCount, 2);
  assert.equal(result.status, "healthy");
  assert.equal(result.traceGradeStatus, "healthy");
  assert.equal(written.summary.status, "healthy");
});

test("fetch agentic eval snapshot surfaces request failures clearly", async () => {
  await assert.rejects(
    () =>
      fetchAgenticEvalSnapshot(
        ["--base-url=https://example.test"],
        process.env,
        async () => {
          throw new Error("network unreachable");
        },
      ),
    /Failed to fetch agentic eval snapshot from https:\/\/example\.test\/api\/admin\/ops\/agentic-evals: network unreachable/,
  );
});
