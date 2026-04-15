import assert from "node:assert/strict";
import test from "node:test";

import {
  buildProtocolWebhookSignature,
  compareProtocolWebhookSignatureDigests,
  parseProtocolWebhookSignature,
  verifyProtocolWebhookSignature,
} from "../src/index.ts";

test("buildProtocolWebhookSignature uses a stable canonical format", () => {
  const signature = buildProtocolWebhookSignature({
    secret: "test-secret",
    body: '{"event":"app.registered"}',
  });

  assert.match(signature, /^[a-f0-9]{64}$/);
  assert.deepEqual(parseProtocolWebhookSignature(signature), {
    version: null,
    digest: signature,
  });
});

test("verifyProtocolWebhookSignature accepts matching signatures", () => {
  const signature = buildProtocolWebhookSignature({
    secret: "test-secret",
    body: '{"event":"app.registered"}',
  });

  assert.equal(
    verifyProtocolWebhookSignature({
      secret: "test-secret",
      body: '{"event":"app.registered"}',
      signature,
    }),
    true,
  );
});

test("verifyProtocolWebhookSignature rejects mismatched payloads", () => {
  const signature = buildProtocolWebhookSignature({
    secret: "test-secret",
    body: '{"event":"app.registered"}',
  });

  assert.equal(
    verifyProtocolWebhookSignature({
      secret: "wrong-secret",
      body: '{"event":"app.registered"}',
      signature,
    }),
    false,
  );
  assert.equal(
    verifyProtocolWebhookSignature({
      secret: "test-secret",
      body: '{"event":"app.updated"}',
      signature,
    }),
    false,
  );
});

test("compareProtocolWebhookSignatureDigests performs version-aware timing-safe checks", () => {
  const signature = buildProtocolWebhookSignature({
    secret: "test-secret",
    body: '{"event":"app.registered"}',
  });

  assert.equal(
    compareProtocolWebhookSignatureDigests(signature, signature),
    true,
  );
  assert.equal(
    compareProtocolWebhookSignatureDigests(signature, `v1=${signature}`),
    true,
  );
  assert.equal(
    compareProtocolWebhookSignatureDigests(signature, "v2=abcdef"),
    false,
  );
});
