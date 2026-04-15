import { createHmac, timingSafeEqual } from "node:crypto";

export type ProtocolWebhookSignatureInput = {
  secret: string;
  body: string | Uint8Array | object;
};

export type ProtocolWebhookVerificationInput = ProtocolWebhookSignatureInput & {
  signature: string;
};

function normalizeBody(body: string | Uint8Array | object): string {
  if (typeof body === "string") {
    return body;
  }
  if (body instanceof Uint8Array) {
    return Buffer.from(body).toString("utf8");
  }
  return JSON.stringify(body);
}

/**
 * Build the canonical HMAC digest used by the current OpenSocial protocol
 * delivery runner. This intentionally mirrors the backend signer so partner
 * consumers can verify `x-opensocial-protocol-signature` directly.
 */
export function buildProtocolWebhookSignature(
  input: ProtocolWebhookSignatureInput,
): string {
  return createHmac("sha256", input.secret)
    .update(normalizeBody(input.body))
    .digest("hex");
}

/**
 * Verify a protocol webhook signature against the supplied body using the
 * same digest shape emitted by the protocol delivery runner today.
 */
export function verifyProtocolWebhookSignature(
  input: ProtocolWebhookVerificationInput,
): boolean {
  const expected = buildProtocolWebhookSignature(input);
  return compareProtocolWebhookSignatureDigests(expected, input.signature);
}

export function parseProtocolWebhookSignature(signature: string): {
  version: string | null;
  digest: string;
} | null {
  const trimmed = signature.trim();
  if (/^[a-f0-9]{64}$/i.test(trimmed)) {
    return {
      version: null,
      digest: trimmed.toLowerCase(),
    };
  }

  const match = trimmed.match(/^([a-z0-9]+)=([a-f0-9]{64})$/i);
  if (!match) {
    return null;
  }

  return {
    version: match[1],
    digest: match[2].toLowerCase(),
  };
}

/**
 * Compare two webhook signatures using a timing-safe digest comparison.
 */
export function compareProtocolWebhookSignatureDigests(
  expectedSignature: string,
  receivedSignature: string,
): boolean {
  const expected = parseProtocolWebhookSignature(expectedSignature);
  const received = parseProtocolWebhookSignature(receivedSignature);

  if (
    !expected ||
    !received ||
    (expected.version !== null &&
      received.version !== null &&
      expected.version !== received.version)
  ) {
    return false;
  }

  const expectedDigest = Buffer.from(expected.digest, "hex");
  const receivedDigest = Buffer.from(received.digest, "hex");

  if (expectedDigest.length !== receivedDigest.length) {
    return false;
  }

  return timingSafeEqual(expectedDigest, receivedDigest);
}
