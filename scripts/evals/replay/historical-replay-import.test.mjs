import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";

import { importHistoricalReplay } from "./import-historical-replay.mjs";

test("historical replay import converts jsonl exports into replay corpus cases", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "historical-replay-import-"));
  const inputPath = path.join(root, "historical.jsonl");
  const outputPath = path.join(root, "historical.corpus.json");

  writeFileSync(
    inputPath,
    [
      JSON.stringify({
        conversationId: "conv-123",
        channel: "telegram",
        provider: "openai",
        toolFamily: "messaging",
        messages: [
          { role: "user", content: "Draft a reply to Anna." },
          {
            role: "assistant",
            content: "I can draft that and keep it as a draft.",
          },
        ],
        expected: {
          allowedTools: ["gmail-draft"],
          outputIncludes: ["draft"],
          expectedToolCalls: ["gmail-draft"],
          maxLatencyMs: 2000,
        },
        observed: {
          selectedTool: "gmail-draft",
          toolCalls: ["gmail-draft"],
          outputText: "Draft saved.",
          latencyMs: 400,
          sideEffects: false,
        },
      }),
    ].join("\n"),
  );

  const result = importHistoricalReplay([
    `--input=${inputPath}`,
    `--output=${outputPath}`,
    "--suite-name=historical-telegram",
  ]);

  const corpus = JSON.parse(readFileSync(outputPath, "utf8"));
  assert.equal(result.caseCount, 1);
  assert.equal(corpus.suite, "historical-telegram");
  assert.equal(corpus.cases[0].id, "conv-123");
  assert.equal(corpus.cases[0].execution.mode, "historical-export");
  assert.deepEqual(corpus.cases[0].expected.allowedTools, ["gmail-draft"]);
  assert.deepEqual(corpus.cases[0].expected.expectedToolCalls, ["gmail-draft"]);
  assert.equal(corpus.cases[0].observed.selectedTool, "gmail-draft");
});
