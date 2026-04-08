import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";

import { sanitizeRuntimeExport } from "./sanitize-runtime-export.mjs";

test("runtime export sanitization redacts common secrets and identifiers", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "sanitize-runtime-export-"));
  const inputPath = path.join(root, "raw-runtime-export.jsonl");
  const outputPath = path.join(root, "sanitized-runtime-export.jsonl");

  writeFileSync(
    inputPath,
    `${JSON.stringify({
      conversationId: "123e4567-e89b-12d3-a456-426614174000",
      channel: "telegram",
      messages: [
        {
          role: "user",
          content:
            "Email maria@example.com or call +1 (555) 123-4567. Token ad25e3163e1942f98db448a6443e9772.63YZBnp6B18LmT7IRI6eBg4D",
        },
      ],
    })}\n`,
  );

  const result = sanitizeRuntimeExport([
    `--input=${inputPath}`,
    `--output=${outputPath}`,
  ]);

  const output = readFileSync(outputPath, "utf8");
  assert.equal(result.recordCount, 1);
  assert.match(output, /\[redacted-email\]/);
  assert.match(output, /\[redacted-phone\]/);
  assert.match(output, /\[redacted-token\]/);
  assert.match(output, /\[redacted-uuid\]/);
});
