import type {
  EventName,
  ProtocolEventEnvelope,
  ResourceName,
} from "@opensocial/protocol-types";
import { eventNameValues } from "@opensocial/protocol-types";
export {
  buildProtocolWebhookDelivery,
  buildProtocolWebhookSubscription,
  protocolWebhookDeliverySchema,
  protocolWebhookDeliveryStatusSchema,
  protocolWebhookSubscriptionSchema,
  type ProtocolWebhookDelivery,
  type ProtocolWebhookDeliveryStatus,
  type ProtocolWebhookSubscription,
} from "@opensocial/protocol-types";

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
    name: "request.cancelled",
    resource: "intent_request",
    summary: "An intent request was cancelled by its sender.",
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
