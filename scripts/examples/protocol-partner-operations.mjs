#!/usr/bin/env node

import {
  createBoundProtocolAppClientFromBaseUrl,
  loadProtocolAppOperationalSnapshot,
} from "@opensocial/protocol-client";

function getArg(flag, fallback = undefined) {
  const exact = `${flag}=`;
  for (const value of process.argv.slice(2)) {
    if (value.startsWith(exact)) {
      return value.slice(exact.length);
    }
  }
  return fallback;
}

function resolveAction() {
  return getArg("--action", "inspect");
}

function resolveBaseUrl() {
  const value =
    getArg("--base-url") ||
    process.env.PROTOCOL_BASE_URL ||
    process.env.PLAYGROUND_BASE_URL ||
    process.env.SMOKE_BASE_URL ||
    process.env.STAGING_API_BASE_URL ||
    process.env.API_BASE_URL;
  if (!value) {
    throw new Error(
      "Missing base URL. Set --base-url or PROTOCOL_BASE_URL / PLAYGROUND_BASE_URL / SMOKE_BASE_URL / STAGING_API_BASE_URL / API_BASE_URL.",
    );
  }
  return value.replace(/\/+$/, "");
}

function resolveAppId() {
  const appId = getArg("--app-id") || process.env.PROTOCOL_APP_ID;
  if (!appId) {
    throw new Error("Missing app id. Set --app-id or PROTOCOL_APP_ID.");
  }
  return appId;
}

function resolveAppToken() {
  const appToken = getArg("--app-token") || process.env.PROTOCOL_APP_TOKEN;
  if (!appToken) {
    throw new Error(
      "Missing app token. Set --app-token or PROTOCOL_APP_TOKEN.",
    );
  }
  return appToken;
}

function resolveDeliveryId() {
  return getArg("--delivery-id");
}

function resolveLimit() {
  const raw = getArg("--limit", "25");
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`Invalid --limit value: ${raw}`);
  }
  return value;
}

function logSection(title, value) {
  console.log(`\n[protocol-ops] ${title}`);
  console.log(JSON.stringify(value, null, 2));
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
  const app = createBoundProtocolAppClientFromBaseUrl(resolveBaseUrl(), {
    appId: resolveAppId(),
    appToken: resolveAppToken(),
  });

  if (action === "inspect") {
    const snapshot = await loadProtocolAppOperationalSnapshot(app);
    logSection("operational-summary", summarizeSnapshot(snapshot));
    logSection("webhooks", snapshot.webhooks);
    logSection("grants", snapshot.grants);
    logSection("consent-requests", snapshot.consentRequests);
    return;
  }

  if (action === "replay-delivery") {
    const deliveryId = resolveDeliveryId();
    if (!deliveryId) {
      throw new Error(
        "Missing delivery id. Set --delivery-id when action=replay-delivery.",
      );
    }
    const result = await app.replayWebhookDelivery(deliveryId);
    logSection("replay-delivery-result", result);
    return;
  }

  if (action === "replay-dead-letters") {
    const result = await app.replayDeadLetteredDeliveries({
      limit: resolveLimit(),
    });
    logSection("replay-dead-letters-result", result);
    return;
  }

  if (action === "dispatch-queue") {
    const result = await app.dispatchWebhookDeliveryQueue({
      limit: resolveLimit(),
    });
    logSection("dispatch-queue-result", result);
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
