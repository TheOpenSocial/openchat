#!/usr/bin/env node

import {
  createBoundProtocolAppClientFromBaseUrl,
  loadProtocolAppOperationalSnapshot,
} from "@opensocial/protocol-client";
import {
  logSection,
  resolveIntegerArg,
  resolveOptionalStringArg,
  resolveRequiredStringArg,
  resolveProtocolBaseUrl,
} from "./protocol-example-args.mjs";

function resolveAction() {
  return resolveOptionalStringArg({
    flag: "--action",
    envName: "PROTOCOL_ACTION",
    fallback: "inspect",
  });
}

function summarizeSnapshot(snapshot) {
  return {
    authFailures: snapshot.usage.authFailures,
    tokenAudit: snapshot.usage.tokenAudit,
    grantAudit: snapshot.usage.grantAudit,
    queueHealth: snapshot.usage.queueHealth,
    queue: {
      queuedCount: snapshot.queue.queuedCount,
      inFlightCount: snapshot.queue.inFlightCount,
      failedCount: snapshot.queue.failedCount,
      deadLetteredCount: snapshot.queue.deadLetteredCount,
      replayableCount: snapshot.queue.replayableCount,
      oldestQueuedAt: snapshot.queue.oldestQueuedAt,
      oldestRetryingAt: snapshot.queue.oldestRetryingAt,
      lastDeadLetteredAt: snapshot.queue.lastDeadLetteredAt,
      queueState: snapshot.queue.queueState,
    },
    grantCount: snapshot.grants.length,
    consentRequestCount: snapshot.consentRequests.length,
    webhookCount: snapshot.webhooks.length,
  };
}

async function main() {
  const action = resolveAction();
  const app = createBoundProtocolAppClientFromBaseUrl(resolveProtocolBaseUrl(), {
    appId: resolveRequiredStringArg({
      flag: "--app-id",
      envName: "PROTOCOL_APP_ID",
      errorMessage: "Missing app id. Set --app-id or PROTOCOL_APP_ID.",
    }),
    appToken: resolveRequiredStringArg({
      flag: "--app-token",
      envName: "PROTOCOL_APP_TOKEN",
      errorMessage: "Missing app token. Set --app-token or PROTOCOL_APP_TOKEN.",
    }),
  });

  if (action === "inspect") {
    const snapshot = await loadProtocolAppOperationalSnapshot(app);
    logSection("protocol-ops", "operational-summary", summarizeSnapshot(snapshot));
    logSection("protocol-ops", "webhooks", snapshot.webhooks);
    logSection("protocol-ops", "grants", snapshot.grants);
    logSection("protocol-ops", "consent-requests", snapshot.consentRequests);
    return;
  }

  if (action === "replay-delivery") {
    const deliveryId = resolveOptionalStringArg({
      flag: "--delivery-id",
      envName: "PROTOCOL_DELIVERY_ID",
    });
    if (!deliveryId) {
      throw new Error(
        "Missing delivery id. Set --delivery-id when action=replay-delivery.",
      );
    }
    const result = await app.replayWebhookDelivery(deliveryId);
    logSection("protocol-ops", "replay-delivery-result", result);
    return;
  }

  if (action === "replay-dead-letters") {
    const result = await app.replayDeadLetteredDeliveries({
      limit: resolveIntegerArg({
        flag: "--limit",
        envName: "PROTOCOL_LIMIT",
        fallback: "25",
        minimum: 1,
        errorMessage: "Invalid --limit value.",
      }),
    });
    logSection("protocol-ops", "replay-dead-letters-result", result);
    return;
  }

  if (action === "dispatch-queue") {
    const result = await app.dispatchWebhookDeliveryQueue({
      limit: resolveIntegerArg({
        flag: "--limit",
        envName: "PROTOCOL_LIMIT",
        fallback: "25",
        minimum: 1,
        errorMessage: "Invalid --limit value.",
      }),
    });
    logSection("protocol-ops", "dispatch-queue-result", result);
    return;
  }

  throw new Error(
    `Unsupported action: ${action}. Use inspect, replay-delivery, replay-dead-letters, or dispatch-queue.`,
  );
}

main().catch((error) => {
  console.error("[protocol-ops] failed");
  console.error(error);
  process.exitCode = 1;
});
