import { z } from "zod";

export const protocolNamespace = "opensocial" as const;
export const protocolVersion = "v1" as const;

export const protocolIds = {
  protocol: `${protocolNamespace}.protocol.${protocolVersion}` as const,
  manifest: `${protocolNamespace}.manifest.${protocolVersion}` as const,
  appRegistration:
    `${protocolNamespace}.app-registration.${protocolVersion}` as const,
  webhookSubscription:
    `${protocolNamespace}.webhook-subscription.${protocolVersion}` as const,
} as const;

export const protocolIdValues = [
  protocolIds.protocol,
  protocolIds.manifest,
  protocolIds.appRegistration,
  protocolIds.webhookSubscription,
] as const;

export const protocolIdSchema = z.enum(protocolIdValues);
export type ProtocolId = z.infer<typeof protocolIdSchema>;

export const protocolIdPrefixSchema = z.enum([protocolNamespace] as const);
export type ProtocolNamespace = z.infer<typeof protocolIdPrefixSchema>;

export const identifierSchema = z
  .string()
  .min(2)
  .max(120)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/);
export type Identifier = z.infer<typeof identifierSchema>;

export const isoDateTimeSchema = z.string().datetime();
export const urlSchema = z.string().url();
export const uuidSchema = z.string().uuid();

export const resourceNameValues = [
  "user",
  "profile",
  "intent",
  "intent_request",
  "connection",
  "chat",
  "chat_message",
  "circle",
  "notification",
  "agent_thread",
  "app_registration",
  "webhook_subscription",
  "manifest",
] as const;
export const resourceNameSchema = z.enum(resourceNameValues);
export type ResourceName = z.infer<typeof resourceNameSchema>;

export const actionNameValues = [
  "user.read",
  "profile.read",
  "profile.update",
  "intent.create",
  "intent.read",
  "intent.update",
  "intent.cancel",
  "request.send",
  "request.read",
  "request.accept",
  "request.reject",
  "connection.create",
  "connection.read",
  "chat.create",
  "chat.read",
  "chat.send_message",
  "circle.create",
  "circle.read",
  "circle.join",
  "circle.leave",
  "notification.read",
  "notification.ack",
  "agent_thread.read",
  "agent_thread.reply",
  "app.register",
  "app.read",
  "app.update",
  "webhook.subscribe",
  "webhook.unsubscribe",
  "event.replay",
] as const;
export const actionNameSchema = z.enum(actionNameValues);
export type ActionName = z.infer<typeof actionNameSchema>;

export const eventNameValues = [
  "user.created",
  "user.updated",
  "profile.updated",
  "intent.created",
  "intent.updated",
  "intent.cancelled",
  "request.sent",
  "request.accepted",
  "request.rejected",
  "request.expired",
  "connection.created",
  "chat.created",
  "chat.message.sent",
  "circle.created",
  "circle.joined",
  "circle.left",
  "notification.created",
  "notification.acknowledged",
  "agent.thread.created",
  "agent.thread.updated",
  "app.registered",
  "app.updated",
  "webhook.delivered",
  "webhook.failed",
] as const;
export const eventNameSchema = z.enum(eventNameValues);
export type EventName = z.infer<typeof eventNameSchema>;

export const capabilityNameValues = [
  "identity.read",
  "profile.read",
  "profile.write",
  "intent.read",
  "intent.write",
  "request.read",
  "request.write",
  "connection.read",
  "connection.write",
  "chat.read",
  "chat.write",
  "circle.read",
  "circle.write",
  "notification.read",
  "notification.write",
  "agent.read",
  "agent.write",
  "app.read",
  "app.write",
  "webhook.read",
  "webhook.write",
  "event.read",
  "event.write",
] as const;
export const capabilityNameSchema = z.enum(capabilityNameValues);
export type CapabilityName = z.infer<typeof capabilityNameSchema>;

export const protocolScopeNameValues = [
  "openid",
  "offline_access",
  "protocol.read",
  "protocol.write",
  "resources.read",
  "resources.write",
  "actions.invoke",
  "events.subscribe",
  "events.publish",
  "webhooks.manage",
  "agents.operate",
  "apps.register",
] as const;
export const protocolScopeNameSchema = z.enum(protocolScopeNameValues);
export type ProtocolScopeName = z.infer<typeof protocolScopeNameSchema>;

export const capabilityMatrixSchema = z
  .object({
    scopes: z.array(protocolScopeNameSchema).default([]),
    resources: z.array(resourceNameSchema).default([]),
    actions: z.array(actionNameSchema).default([]),
    events: z.array(eventNameSchema).default([]),
    capabilities: z.array(capabilityNameSchema).default([]),
    canActAsAgent: z.boolean().default(false),
    canManageWebhooks: z.boolean().default(false),
  })
  .strict();
export type CapabilityMatrix = z.infer<typeof capabilityMatrixSchema>;

export const webhookDeliveryModeValues = ["json", "ndjson"] as const;
export const webhookDeliveryModeSchema = z.enum(webhookDeliveryModeValues);
export type WebhookDeliveryMode = z.infer<typeof webhookDeliveryModeSchema>;

export const webhookSubscriptionStatusValues = [
  "active",
  "paused",
  "failed",
  "revoked",
] as const;
export const webhookSubscriptionStatusSchema = z.enum(
  webhookSubscriptionStatusValues,
);
export type WebhookSubscriptionStatus = z.infer<
  typeof webhookSubscriptionStatusSchema
>;

export const webhookRetryPolicySchema = z
  .object({
    maxAttempts: z.number().int().min(1).max(50).default(8),
    backoffMs: z.number().int().min(0).default(1000),
    maxBackoffMs: z.number().int().min(0).default(60000),
  })
  .strict()
  .default({
    maxAttempts: 8,
    backoffMs: 1000,
    maxBackoffMs: 60000,
  });
export type WebhookRetryPolicy = z.infer<typeof webhookRetryPolicySchema>;

export const webhookSubscriptionSchema = z
  .object({
    protocolId: z.literal(protocolIds.webhookSubscription),
    subscriptionId: identifierSchema,
    appId: identifierSchema,
    targetUrl: urlSchema,
    events: z.array(eventNameSchema).min(1),
    resources: z.array(resourceNameSchema).default([]),
    status: webhookSubscriptionStatusSchema.default("active"),
    deliveryMode: webhookDeliveryModeSchema.default("json"),
    secretRef: z.string().min(1).max(200).optional(),
    retryPolicy: webhookRetryPolicySchema,
    metadata: z.record(z.string(), z.unknown()).default({}),
    createdAt: isoDateTimeSchema.optional(),
    updatedAt: isoDateTimeSchema.optional(),
  })
  .strict();
export type WebhookSubscription = z.infer<typeof webhookSubscriptionSchema>;

export const appRegistrationStatusValues = [
  "draft",
  "active",
  "paused",
  "revoked",
] as const;
export const appRegistrationStatusSchema = z.enum(appRegistrationStatusValues);
export type AppRegistrationStatus = z.infer<typeof appRegistrationStatusSchema>;

export const appRegistrationKindValues = [
  "web",
  "server",
  "agent",
  "mobile",
] as const;
export const appRegistrationKindSchema = z.enum(appRegistrationKindValues);
export type AppRegistrationKind = z.infer<typeof appRegistrationKindSchema>;

export const appRegistrationSchema = z
  .object({
    protocolId: z.literal(protocolIds.appRegistration),
    appId: identifierSchema,
    name: z.string().min(1).max(120),
    summary: z.string().min(1).max(280).optional(),
    description: z.string().max(2000).optional(),
    kind: appRegistrationKindSchema.default("web"),
    status: appRegistrationStatusSchema.default("draft"),
    ownerUserId: uuidSchema.optional(),
    homepageUrl: urlSchema.optional(),
    iconUrl: urlSchema.optional(),
    logoUrl: urlSchema.optional(),
    publicKey: z.string().min(32).optional(),
    redirectUris: z.array(urlSchema).default([]),
    webhookUrl: urlSchema.optional(),
    webhookSecretRef: z.string().min(1).max(200).optional(),
    capabilities: capabilityMatrixSchema.default({
      scopes: [],
      resources: [],
      actions: [],
      events: [],
      capabilities: [],
      canActAsAgent: false,
      canManageWebhooks: false,
    }),
    metadata: z.record(z.string(), z.unknown()).default({}),
    createdAt: isoDateTimeSchema.optional(),
    updatedAt: isoDateTimeSchema.optional(),
  })
  .strict();
export type AppRegistration = z.infer<typeof appRegistrationSchema>;

export const manifestAgentModeValues = ["observe", "suggest", "act"] as const;
export const manifestAgentModeSchema = z.enum(manifestAgentModeValues);
export type ManifestAgentMode = z.infer<typeof manifestAgentModeSchema>;

export const manifestWebhookSchema = z
  .object({
    name: identifierSchema,
    targetUrl: urlSchema,
    events: z.array(eventNameSchema).min(1),
    resources: z.array(resourceNameSchema).default([]),
    deliveryMode: webhookDeliveryModeSchema.default("json"),
    enabled: z.boolean().default(true),
  })
  .strict();
export type ManifestWebhook = z.infer<typeof manifestWebhookSchema>;

export const manifestAgentSchema = z
  .object({
    enabled: z.boolean().default(false),
    modes: z.array(manifestAgentModeSchema).default([]),
    requiresHumanApproval: z.boolean().default(true),
  })
  .strict()
  .default({
    enabled: false,
    modes: [],
    requiresHumanApproval: true,
  });
export type ManifestAgent = z.infer<typeof manifestAgentSchema>;

export const manifestSchema = z
  .object({
    protocolId: z.literal(protocolIds.manifest),
    manifestId: identifierSchema,
    appId: identifierSchema,
    name: z.string().min(1).max(120),
    version: z.string().min(1).max(64),
    summary: z.string().min(1).max(280).optional(),
    description: z.string().max(2000).optional(),
    homepageUrl: urlSchema.optional(),
    iconUrl: urlSchema.optional(),
    categories: z.array(z.string().min(1).max(64)).default([]),
    capabilities: capabilityMatrixSchema.default({
      scopes: [],
      resources: [],
      actions: [],
      events: [],
      capabilities: [],
      canActAsAgent: false,
      canManageWebhooks: false,
    }),
    resources: z.array(resourceNameSchema).default([]),
    actions: z.array(actionNameSchema).default([]),
    events: z.array(eventNameSchema).default([]),
    webhooks: z.array(manifestWebhookSchema).default([]),
    agent: manifestAgentSchema,
    metadata: z.record(z.string(), z.unknown()).default({}),
  })
  .strict();
export type Manifest = z.infer<typeof manifestSchema>;
export const protocolManifestSchema = manifestSchema;
export type ProtocolManifest = Manifest;

export const appRegistrationRequestSchema = z
  .object({
    registration: appRegistrationSchema,
    manifest: manifestSchema,
    requestedScopes: z.array(protocolScopeNameSchema).default([]),
    requestedCapabilities: z.array(capabilityNameSchema).default([]),
  })
  .strict();
export type AppRegistrationRequest = z.infer<
  typeof appRegistrationRequestSchema
>;
export type ProtocolAppRegistrationRequest = AppRegistrationRequest;

export const protocolEnvelopeSchema = z
  .object({
    protocolId: protocolIdSchema,
    traceId: uuidSchema.optional(),
    issuedAt: isoDateTimeSchema,
    actorAppId: identifierSchema.optional(),
    actorUserId: uuidSchema.optional(),
    metadata: z.record(z.string(), z.unknown()).default({}),
  })
  .strict();
export type ProtocolEnvelope = z.infer<typeof protocolEnvelopeSchema>;

export const protocolEventEnvelopeSchema = protocolEnvelopeSchema.extend({
  event: eventNameSchema,
  resource: resourceNameSchema.optional(),
  payload: z.unknown(),
});
export type ProtocolEventEnvelope = z.infer<typeof protocolEventEnvelopeSchema>;
