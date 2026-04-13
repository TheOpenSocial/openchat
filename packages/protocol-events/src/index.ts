import type {
  EventName,
  ProtocolEventEnvelope,
  ResourceName,
} from "@opensocial/protocol-types";
import {
  eventNameSchema,
  eventNameValues,
  identifierSchema,
  isoDateTimeSchema,
  protocolIds,
  resourceNameSchema,
  webhookDeliveryModeSchema,
  webhookRetryPolicySchema,
  webhookSubscriptionStatusSchema,
} from "@opensocial/protocol-types";
import { z } from "zod";

export const protocolEventCatalog = [
  {
    name: "user.created",
    resource: "user",
    summary: "A user identity was created.",
  },
  {
    name: "user.updated",
    resource: "user",
    summary: "A user identity was updated.",
  },
  {
    name: "profile.updated",
    resource: "profile",
    summary: "A profile changed.",
  },
  {
    name: "intent.created",
    resource: "intent",
    summary: "An intent was created.",
  },
  {
    name: "intent.updated",
    resource: "intent",
    summary: "An intent changed state or shape.",
  },
  {
    name: "intent.cancelled",
    resource: "intent",
    summary: "An intent was cancelled.",
  },
  {
    name: "request.sent",
    resource: "intent_request",
    summary: "An intent request was sent.",
  },
  {
    name: "request.accepted",
    resource: "intent_request",
    summary: "An intent request was accepted.",
  },
  {
    name: "request.rejected",
    resource: "intent_request",
    summary: "An intent request was rejected.",
  },
  {
    name: "request.expired",
    resource: "intent_request",
    summary: "An intent request expired.",
  },
  {
    name: "connection.created",
    resource: "connection",
    summary: "A connection was created.",
  },
  {
    name: "chat.created",
    resource: "chat",
    summary: "A chat channel was created.",
  },
  {
    name: "chat.message.sent",
    resource: "chat_message",
    summary: "A chat message was sent.",
  },
  {
    name: "circle.created",
    resource: "circle",
    summary: "A circle was created.",
  },
  {
    name: "circle.joined",
    resource: "circle",
    summary: "A member joined a circle.",
  },
  {
    name: "circle.left",
    resource: "circle",
    summary: "A member left a circle.",
  },
  {
    name: "notification.created",
    resource: "notification",
    summary: "A notification was created.",
  },
  {
    name: "notification.acknowledged",
    resource: "notification",
    summary: "A notification was acknowledged.",
  },
  {
    name: "agent.thread.created",
    resource: "agent_thread",
    summary: "An agent thread was created.",
  },
  {
    name: "agent.thread.updated",
    resource: "agent_thread",
    summary: "An agent thread changed.",
  },
  {
    name: "app.registered",
    resource: "app_registration",
    summary: "A protocol app was registered.",
  },
  {
    name: "app.updated",
    resource: "app_registration",
    summary: "A protocol app was updated.",
  },
  {
    name: "webhook.delivered",
    resource: "webhook_subscription",
    summary: "A webhook delivery succeeded.",
  },
  {
    name: "webhook.failed",
    resource: "webhook_subscription",
    summary: "A webhook delivery failed.",
  },
] as const satisfies ReadonlyArray<{
  name: EventName;
  resource: ResourceName;
  summary: string;
}>;

export type ProtocolEventCatalogEntry = (typeof protocolEventCatalog)[number];

export const protocolEventNames = [...eventNameValues];

export const protocolAppRegistrationEventNames = [
  "app.registered",
  "app.updated",
] as const;

export const protocolWebhookEventNames = [
  "webhook.delivered",
  "webhook.failed",
] as const;

export function listProtocolEvents() {
  return protocolEventCatalog;
}

export function getProtocolEvent(name: EventName) {
  return protocolEventCatalog.find((entry) => entry.name === name) ?? null;
}

export function buildProtocolEventEnvelope(
  input: ProtocolEventEnvelope,
): ProtocolEventEnvelope {
  return input;
}

export const protocolWebhookDeliveryStatusValues = [
  "queued",
  "retrying",
  "delivered",
  "failed",
  "dead_lettered",
] as const;
export const protocolWebhookDeliveryStatusSchema = z.enum(
  protocolWebhookDeliveryStatusValues,
);
export type ProtocolWebhookDeliveryStatus = z.infer<
  typeof protocolWebhookDeliveryStatusSchema
>;

export const protocolWebhookSubscriptionSchema = z
  .object({
    protocolId: z.literal(protocolIds.webhookSubscription),
    subscriptionId: identifierSchema,
    appId: identifierSchema,
    targetUrl: z.string().url(),
    events: z.array(eventNameSchema).min(1),
    resources: z.array(resourceNameSchema).default([]),
    status: webhookSubscriptionStatusSchema.default("active"),
    deliveryMode: webhookDeliveryModeSchema.default("json"),
    retryPolicy: webhookRetryPolicySchema,
    metadata: z.record(z.string(), z.unknown()).default({}),
    createdAt: isoDateTimeSchema.optional(),
    updatedAt: isoDateTimeSchema.optional(),
  })
  .strict();
export type ProtocolWebhookSubscription = z.infer<
  typeof protocolWebhookSubscriptionSchema
>;

export const protocolWebhookDeliverySchema = z
  .object({
    protocolId: z.literal(protocolIds.protocol),
    deliveryId: identifierSchema,
    subscriptionId: identifierSchema,
    eventName: eventNameSchema,
    status: protocolWebhookDeliveryStatusSchema,
    attemptCount: z.number().int().min(0),
    nextAttemptAt: isoDateTimeSchema.nullish(),
    lastAttemptAt: isoDateTimeSchema.nullish(),
    deliveredAt: isoDateTimeSchema.nullish(),
    responseStatusCode: z.number().int().min(100).max(599).nullish(),
    errorMessage: z.string().max(2000).nullish(),
    signature: z.string().optional().nullable(),
    payload: z.unknown(),
    metadata: z.record(z.string(), z.unknown()).default({}),
    createdAt: isoDateTimeSchema.optional(),
    updatedAt: isoDateTimeSchema.optional(),
  })
  .strict();
export type ProtocolWebhookDelivery = z.infer<
  typeof protocolWebhookDeliverySchema
>;

export function buildProtocolWebhookSubscription(
  input: Partial<ProtocolWebhookSubscription>,
): ProtocolWebhookSubscription {
  return protocolWebhookSubscriptionSchema.parse({
    protocolId: protocolIds.webhookSubscription,
    status: "active",
    deliveryMode: "json",
    retryPolicy: {
      maxAttempts: 8,
      backoffMs: 1000,
      maxBackoffMs: 60000,
    },
    metadata: {},
    ...input,
  });
}

export function buildProtocolWebhookDelivery(
  input: Partial<ProtocolWebhookDelivery>,
): ProtocolWebhookDelivery {
  return protocolWebhookDeliverySchema.parse({
    protocolId: protocolIds.protocol,
    status: "queued",
    attemptCount: 0,
    metadata: {},
    ...input,
  });
}
