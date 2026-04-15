import assert from "node:assert/strict";
import test from "node:test";

import {
  buildProtocolWebhookSignature,
  buildProtocolWebhookHeaders,
  buildProtocolWebhookRequest,
  compareProtocolWebhookSignatureDigests,
  parseProtocolWebhookSignatureHeader,
  readProtocolWebhookSignatureHeader,
  parseProtocolWebhookSignature,
  PROTOCOL_WEBHOOK_SIGNATURE_HEADER,
  verifyProtocolWebhookSignature,
  verifyProtocolWebhookRequest,
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

test("buildProtocolWebhookHeaders emits the backend signature header shape", () => {
  assert.deepEqual(buildProtocolWebhookHeaders("  v1=abc123  "), {
    [PROTOCOL_WEBHOOK_SIGNATURE_HEADER]: "v1=abc123",
  });
});

test("readProtocolWebhookSignatureHeader accepts request-like header sources", () => {
  const signature = buildProtocolWebhookSignature({
    secret: "test-secret",
    body: '{"event":"app.registered"}',
  });

  assert.equal(
    readProtocolWebhookSignatureHeader({
      headers: {
        [PROTOCOL_WEBHOOK_SIGNATURE_HEADER.toUpperCase()]: signature,
      },
    }),
    signature,
  );
});

test("parseProtocolWebhookSignatureHeader accepts request-like header sources", () => {
  const signature = buildProtocolWebhookSignature({
    secret: "test-secret",
    body: '{"event":"app.registered"}',
  });

  assert.deepEqual(
    parseProtocolWebhookSignatureHeader({
      headers: new Map([
        [PROTOCOL_WEBHOOK_SIGNATURE_HEADER, `v1=${signature}`],
      ]),
    }),
    {
      version: "v1",
      digest: signature,
    },
  );
});

test("buildProtocolWebhookRequest pairs the body with the backend header", () => {
  const request = buildProtocolWebhookRequest({
    secret: "test-secret",
    body: '{"event":"app.registered"}',
  });

  assert.equal(
    request.signature,
    request.headers[PROTOCOL_WEBHOOK_SIGNATURE_HEADER],
  );
  assert.equal(request.body, '{"event":"app.registered"}');
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

test("verifyProtocolWebhookRequest accepts matching request-like payloads", () => {
  const request = buildProtocolWebhookRequest({
    secret: "test-secret",
    body: '{"event":"app.registered"}',
  });

  assert.equal(
    verifyProtocolWebhookRequest({
      secret: "test-secret",
      body: request.body,
      headers: request.headers,
    }),
    true,
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
