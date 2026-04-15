import assert from "node:assert/strict";
import test from "node:test";

import {
  buildProtocolEventEnvelope,
  buildProtocolWebhookDelivery,
  buildProtocolWebhookSubscription,
  getProtocolEvent,
  listProtocolEvents,
  protocolAppRegistrationEventNames,
  protocolEventCatalog,
  protocolEventNames,
  protocolWebhookDeliverySchema,
  protocolWebhookEventNames,
  protocolWebhookSubscriptionSchema,
} from "../dist/index.js";
import {
  eventNameSchema,
  eventNameValues,
  protocolIds,
  resourceNameSchema,
  resourceNameValues,
} from "@opensocial/protocol-types";

test("protocol event catalog stays aligned with schema values", () => {
  assert.deepEqual(protocolEventNames, eventNameValues);
  assert.deepEqual(protocolAppRegistrationEventNames, [
    "app.registered",
    "app.updated",
  ]);
  assert.deepEqual(protocolWebhookEventNames, [
    "webhook.delivered",
    "webhook.failed",
  ]);

  for (const entry of protocolEventCatalog) {
    assert.equal(eventNameSchema.parse(entry.name), entry.name);
    assert.equal(resourceNameSchema.parse(entry.resource), entry.resource);
    assert.ok(entry.summary.length > 0);
  }
  for (const value of resourceNameValues) {
    assert.equal(resourceNameSchema.parse(value), value);
  }
});

test("protocol event helpers preserve catalog and envelope shapes", () => {
  const event = getProtocolEvent("chat.message.sent");
  assert.ok(event);
  assert.equal(event?.resource, "chat_message");

  const envelope = buildProtocolEventEnvelope({
    protocolId: protocolIds.protocol,
    issuedAt: "2026-04-15T00:00:00.000Z",
    event: "chat.message.sent",
    resource: "chat_message",
    payload: { chatId: "chat-1" },
    metadata: {},
  });

  assert.equal(envelope.event, "chat.message.sent");
  assert.equal(envelope.resource, "chat_message");
});

test("protocol webhook catalog schemas parse defaults", () => {
  const subscription = buildProtocolWebhookSubscription({
    protocolId: protocolIds.webhookSubscription,
    subscriptionId: "subscription-test",
    appId: "app-test",
    targetUrl: "https://example.com/hooks",
    events: ["app.registered"],
    resources: [],
  });

  assert.equal(subscription.status, "active");
  assert.equal(subscription.deliveryMode, "json");

  const parsedSubscription = protocolWebhookSubscriptionSchema.parse({
    protocolId: protocolIds.webhookSubscription,
    subscriptionId: "subscription-test",
    appId: "app-test",
    targetUrl: "https://example.com/hooks",
    events: ["app.registered"],
    resources: [],
    retryPolicy: {
      maxAttempts: 8,
      backoffMs: 1000,
      maxBackoffMs: 60000,
    },
    metadata: {},
  });
  assert.equal(parsedSubscription.subscriptionId, "subscription-test");

  const delivery = buildProtocolWebhookDelivery({
    protocolId: protocolIds.protocol,
    deliveryId: "delivery-test",
    subscriptionId: "subscription-test",
    eventName: "app.registered",
    payload: { appId: "app-test" },
  });

  assert.equal(delivery.status, "queued");
  assert.equal(delivery.attemptCount, 0);
  assert.equal(delivery.eventName, "app.registered");

  const parsedDelivery = protocolWebhookDeliverySchema.parse({
    protocolId: protocolIds.protocol,
    deliveryId: "delivery-test",
    subscriptionId: "subscription-test",
    eventName: "app.registered",
    status: "delivered",
    attemptCount: 1,
    payload: { appId: "app-test" },
    metadata: {},
  });

  assert.equal(parsedDelivery.status, "delivered");
});
