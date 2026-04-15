import { createHmac, timingSafeEqual } from "node:crypto";

export type ProtocolWebhookSignatureInput = {
  secret: string;
  body: string | Uint8Array | object;
};

export type ProtocolWebhookVerificationInput = ProtocolWebhookSignatureInput & {
  signature: string;
};

export const PROTOCOL_WEBHOOK_SIGNATURE_HEADER =
  "x-opensocial-protocol-signature" as const;

export type ProtocolWebhookHeaderValue = string | string[] | undefined;

export type ProtocolWebhookHeaderSource =
  | Record<string, ProtocolWebhookHeaderValue>
  | Map<string, string>
  | Iterable<[string, string]>
  | {
      get?(name: string): string | null | undefined;
      headers?: unknown;
    };

export type ProtocolWebhookRequestInput = ProtocolWebhookSignatureInput & {
  headers?: ProtocolWebhookHeaderSource;
};

export type ProtocolWebhookRequest = ProtocolWebhookRequestInput & {
  headers: Record<typeof PROTOCOL_WEBHOOK_SIGNATURE_HEADER, string>;
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

export function buildProtocolWebhookSignatureHeader(signature: string): string {
  return signature.trim();
}

export function buildProtocolWebhookHeaders(
  signature: string,
): Record<typeof PROTOCOL_WEBHOOK_SIGNATURE_HEADER, string> {
  return {
    [PROTOCOL_WEBHOOK_SIGNATURE_HEADER]:
      buildProtocolWebhookSignatureHeader(signature),
  };
}

export function buildProtocolWebhookRequest(
  input: ProtocolWebhookSignatureInput,
): ProtocolWebhookRequest {
  const signature = buildProtocolWebhookSignature(input);
  return {
    ...input,
    headers: buildProtocolWebhookHeaders(signature),
    signature,
  };
}

function isHeaderGetter(
  source: unknown,
): source is { get(name: string): string | null | undefined } {
  return (
    typeof source === "object" &&
    source !== null &&
    typeof (source as { get?: unknown }).get === "function"
  );
}

function isIterableHeaders(
  source: unknown,
): source is Iterable<[string, string]> {
  return (
    typeof source === "object" &&
    source !== null &&
    typeof (source as { [Symbol.iterator]?: unknown })[Symbol.iterator] ===
      "function"
  );
}

function readHeaderValue(
  source: ProtocolWebhookHeaderSource | null,
  headerName: string,
): string | null {
  if (!source || typeof source !== "object") {
    return null;
  }

  if (isHeaderGetter(source)) {
    return source.get(headerName)?.trim() ?? null;
  }

  if (source instanceof Map) {
    for (const [key, value] of source.entries()) {
      if (key.toLowerCase() === headerName.toLowerCase()) {
        return value.trim();
      }
    }
    return null;
  }

  if (isIterableHeaders(source)) {
    for (const [key, value] of source) {
      if (key.toLowerCase() === headerName.toLowerCase()) {
        return value.trim();
      }
    }
    return null;
  }

  const record = source as Record<string, ProtocolWebhookHeaderValue>;
  const direct = record[headerName] ?? record[headerName.toLowerCase()];
  if (Array.isArray(direct)) {
    return direct[0]?.trim() ?? null;
  }
  if (typeof direct === "string") {
    return direct.trim();
  }

  return null;
}

export function readProtocolWebhookSignatureHeader(
  source: ProtocolWebhookHeaderSource | ProtocolWebhookRequestInput | unknown,
): string | null {
  if (!source || typeof source !== "object") {
    return null;
  }

  const request = source as ProtocolWebhookRequestInput;
  const headers = "headers" in request ? request.headers : source;
  return readHeaderValue(
    headers as ProtocolWebhookHeaderSource | null,
    PROTOCOL_WEBHOOK_SIGNATURE_HEADER,
  );
}

export function parseProtocolWebhookSignatureHeader(
  source: ProtocolWebhookHeaderSource | ProtocolWebhookRequestInput | unknown,
): ReturnType<typeof parseProtocolWebhookSignature> {
  const header = readProtocolWebhookSignatureHeader(source);
  if (!header) {
    return null;
  }

  return parseProtocolWebhookSignature(header);
}

export function verifyProtocolWebhookRequest(
  input: ProtocolWebhookRequestInput,
): boolean {
  const signature = readProtocolWebhookSignatureHeader(input.headers);
  if (!signature) {
    return false;
  }

  return verifyProtocolWebhookSignature({
    secret: input.secret,
    body: input.body,
    signature,
  });
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
