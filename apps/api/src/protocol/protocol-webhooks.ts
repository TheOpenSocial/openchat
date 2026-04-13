import { createHmac } from "node:crypto";

export function resolveProtocolWebhookSigningSecret() {
  const configured = process.env.PROTOCOL_WEBHOOK_SIGNING_SECRET?.trim();
  if (configured) {
    return configured;
  }

  return "opensocial-protocol-dev-secret";
}

export function signProtocolWebhookPayload(
  payload: unknown,
  secret = resolveProtocolWebhookSigningSecret(),
) {
  const serialized = JSON.stringify(payload);
  return createHmac("sha256", secret).update(serialized).digest("hex");
}
