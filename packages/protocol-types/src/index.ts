import { z } from "zod";

export const protocolNamespace = "opensocial" as const;
export const protocolVersion = "v1" as const;

export const protocolIds = {
  protocol: `${protocolNamespace}.protocol.${protocolVersion}` as const,
  manifest: `${protocolNamespace}.manifest.${protocolVersion}` as const,
  appRegistration:
    `${protocolNamespace}.app-registration.${protocolVersion}` as const,
  appConsentRequest:
    `${protocolNamespace}.app-consent-request.${protocolVersion}` as const,
  webhookSubscription:
    `${protocolNamespace}.webhook-subscription.${protocolVersion}` as const,
} as const;

export const protocolIdValues = [
  protocolIds.protocol,
  protocolIds.manifest,
  protocolIds.appRegistration,
  protocolIds.appConsentRequest,
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
  "app_consent_request",
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

export const webhookSubscriptionCreateSchema = z
  .object({
    targetUrl: urlSchema,
    events: z.array(eventNameSchema).min(1),
    resources: z.array(resourceNameSchema).default([]),
    deliveryMode: webhookDeliveryModeSchema.default("json"),
    secretRef: z.string().min(1).max(200).optional(),
    retryPolicy: webhookRetryPolicySchema.default({
      maxAttempts: 8,
      backoffMs: 1000,
      maxBackoffMs: 60000,
    }),
    metadata: z.record(z.string(), z.unknown()).default({}),
  })
  .strict();
export type WebhookSubscriptionCreate = z.infer<
  typeof webhookSubscriptionCreateSchema
>;

export const webhookSubscriptionUpdateSchema = z
  .object({
    subscriptionId: identifierSchema,
    targetUrl: urlSchema.optional(),
    events: z.array(eventNameSchema).optional(),
    resources: z.array(resourceNameSchema).optional(),
    status: webhookSubscriptionStatusSchema.optional(),
    deliveryMode: webhookDeliveryModeSchema.optional(),
    secretRef: z.string().min(1).max(200).optional().nullable(),
    retryPolicy: webhookRetryPolicySchema.optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();
export type WebhookSubscriptionUpdate = z.infer<
  typeof webhookSubscriptionUpdateSchema
>;

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

export const appRegistrationCreateSchema = z
  .object({
    name: z.string().min(1).max(120),
    summary: z.string().min(1).max(280).optional(),
    description: z.string().max(2000).optional(),
    kind: appRegistrationKindSchema.default("web"),
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
  })
  .strict();
export type AppRegistrationCreate = z.infer<typeof appRegistrationCreateSchema>;

export const appRegistrationUpdateSchema = z
  .object({
    appId: identifierSchema,
    name: z.string().min(1).max(120).optional(),
    summary: z.string().min(1).max(280).optional().nullable(),
    description: z.string().max(2000).optional().nullable(),
    kind: appRegistrationKindSchema.optional(),
    status: appRegistrationStatusSchema.optional(),
    ownerUserId: uuidSchema.optional().nullable(),
    homepageUrl: urlSchema.optional().nullable(),
    iconUrl: urlSchema.optional().nullable(),
    logoUrl: urlSchema.optional().nullable(),
    publicKey: z.string().min(32).optional().nullable(),
    redirectUris: z.array(urlSchema).optional(),
    webhookUrl: urlSchema.optional().nullable(),
    webhookSecretRef: z.string().min(1).max(200).optional().nullable(),
    capabilities: capabilityMatrixSchema.optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();
export type AppRegistrationUpdate = z.infer<typeof appRegistrationUpdateSchema>;

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

export const protocolAppCredentialSchema = z
  .object({
    appToken: z.string().min(16).max(256),
  })
  .strict();
export type ProtocolAppCredential = z.infer<typeof protocolAppCredentialSchema>;

export const protocolAppRegistrationResultSchema = z
  .object({
    registration: appRegistrationSchema,
    manifest: manifestSchema,
    issuedScopes: z.array(protocolScopeNameSchema).default([]),
    issuedCapabilities: z.array(capabilityNameSchema).default([]),
    credentials: protocolAppCredentialSchema,
  })
  .strict();
export type ProtocolAppRegistrationResult = z.infer<
  typeof protocolAppRegistrationResultSchema
>;

export const protocolDiscoveryDocumentSchema = z
  .object({
    manifest: manifestSchema,
    events: z.array(
      z
        .object({
          name: eventNameSchema,
          resource: resourceNameSchema,
          summary: z.string().min(1),
        })
        .strict(),
    ),
  })
  .strict();
export type ProtocolDiscoveryDocument = z.infer<
  typeof protocolDiscoveryDocumentSchema
>;

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

export const protocolAppUsageSummarySchema = z
  .object({
    appId: identifierSchema,
    generatedAt: isoDateTimeSchema,
    appStatus: appRegistrationStatusSchema,
    issuedScopes: z.array(protocolScopeNameSchema).default([]),
    issuedCapabilities: z.array(capabilityNameSchema).default([]),
    grantCounts: z
      .object({
        active: z.number().int().min(0),
        revoked: z.number().int().min(0),
      })
      .strict(),
    consentRequestCounts: z
      .object({
        pending: z.number().int().min(0),
        approved: z.number().int().min(0),
        rejected: z.number().int().min(0),
        cancelled: z.number().int().min(0),
        expired: z.number().int().min(0),
      })
      .strict(),
    deliveryCounts: z
      .object({
        queued: z.number().int().min(0),
        retrying: z.number().int().min(0),
        delivered: z.number().int().min(0),
        failed: z.number().int().min(0),
        deadLettered: z.number().int().min(0),
      })
      .strict(),
    queueHealth: z
      .object({
        replayableCount: z.number().int().min(0),
        oldestQueuedAt: isoDateTimeSchema.nullable(),
        oldestRetryingAt: isoDateTimeSchema.nullable(),
        lastDeadLetteredAt: isoDateTimeSchema.nullable(),
      })
      .strict(),
    tokenAudit: z
      .object({
        appUpdatedAt: isoDateTimeSchema,
        lastRotatedAt: isoDateTimeSchema.nullable(),
        lastRevokedAt: isoDateTimeSchema.nullable(),
      })
      .strict(),
    grantAudit: z
      .object({
        lastGrantedAt: isoDateTimeSchema.nullable(),
        lastRevokedAt: isoDateTimeSchema.nullable(),
      })
      .strict(),
    latestCursor: z.string().min(1),
    recentEvents: z.array(protocolEventEnvelopeSchema).default([]),
  })
  .strict();
export type ProtocolAppUsageSummary = z.infer<
  typeof protocolAppUsageSummarySchema
>;

export const protocolWebhookDeliveryGlobalDispatchResultSchema = z
  .object({
    queueName: z.literal("protocol-webhooks"),
    jobName: z.literal("RunProtocolWebhookDeliveries"),
    limit: z.number().int().min(1).max(100),
    source: z.enum(["cron", "manual"]),
    enqueuedAt: isoDateTimeSchema,
  })
  .strict();
export type ProtocolWebhookDeliveryGlobalDispatchResult = z.infer<
  typeof protocolWebhookDeliveryGlobalDispatchResultSchema
>;

export const protocolReplayCursorSchema = z
  .object({
    appId: identifierSchema,
    cursor: z.string().min(1),
    updatedAt: isoDateTimeSchema,
  })
  .strict();
export type ProtocolReplayCursor = z.infer<typeof protocolReplayCursorSchema>;

export const protocolGrantSubjectTypeValues = [
  "app",
  "user",
  "service",
  "agent",
] as const;
export const protocolGrantSubjectTypeSchema = z.enum(
  protocolGrantSubjectTypeValues,
);
export type ProtocolGrantSubjectType = z.infer<
  typeof protocolGrantSubjectTypeSchema
>;

export const protocolGrantStatusValues = ["active", "revoked"] as const;
export const protocolGrantStatusSchema = z.enum(protocolGrantStatusValues);
export type ProtocolGrantStatus = z.infer<typeof protocolGrantStatusSchema>;

export const protocolConsentRequestStatusValues = [
  "pending",
  "approved",
  "rejected",
  "cancelled",
  "expired",
] as const;
export const protocolConsentRequestStatusSchema = z.enum(
  protocolConsentRequestStatusValues,
);
export type ProtocolConsentRequestStatus = z.infer<
  typeof protocolConsentRequestStatusSchema
>;

export const protocolAppScopeGrantSchema = z
  .object({
    grantId: uuidSchema,
    appId: identifierSchema,
    scope: protocolScopeNameSchema,
    capabilities: z.array(capabilityNameSchema).default([]),
    subjectType: protocolGrantSubjectTypeSchema.default("app"),
    subjectId: z.string().min(1).max(200),
    status: protocolGrantStatusSchema.default("active"),
    grantedByUserId: uuidSchema.optional().nullable(),
    grantedAt: isoDateTimeSchema,
    revokedAt: isoDateTimeSchema.optional().nullable(),
    metadata: z.record(z.string(), z.unknown()).default({}),
    createdAt: isoDateTimeSchema,
    updatedAt: isoDateTimeSchema,
  })
  .strict();
export type ProtocolAppScopeGrant = z.infer<typeof protocolAppScopeGrantSchema>;

export const protocolAppConsentRequestSchema = z
  .object({
    protocolId: z.literal(protocolIds.appConsentRequest),
    requestId: uuidSchema,
    appId: identifierSchema,
    scope: protocolScopeNameSchema,
    capabilities: z.array(capabilityNameSchema).default([]),
    subjectType: protocolGrantSubjectTypeSchema.default("app"),
    subjectId: z.string().min(1).max(200),
    status: protocolConsentRequestStatusSchema.default("pending"),
    requestedByUserId: uuidSchema.optional().nullable(),
    approvedByUserId: uuidSchema.optional().nullable(),
    rejectedByUserId: uuidSchema.optional().nullable(),
    approvedGrantId: uuidSchema.optional().nullable(),
    requestedAt: isoDateTimeSchema,
    approvedAt: isoDateTimeSchema.optional().nullable(),
    rejectedAt: isoDateTimeSchema.optional().nullable(),
    cancelledAt: isoDateTimeSchema.optional().nullable(),
    expiredAt: isoDateTimeSchema.optional().nullable(),
    metadata: z.record(z.string(), z.unknown()).default({}),
    createdAt: isoDateTimeSchema,
    updatedAt: isoDateTimeSchema,
  })
  .strict();
export type ProtocolAppConsentRequest = z.infer<
  typeof protocolAppConsentRequestSchema
>;

export const protocolAppConsentRequestCreateSchema = z
  .object({
    scope: protocolScopeNameSchema,
    capabilities: z.array(capabilityNameSchema).default([]),
    subjectType: protocolGrantSubjectTypeSchema.default("app"),
    subjectId: z.string().min(1).max(200).optional(),
    requestedByUserId: uuidSchema.optional(),
    metadata: z.record(z.string(), z.unknown()).default({}),
  })
  .strict();
export type ProtocolAppConsentRequestCreate = z.infer<
  typeof protocolAppConsentRequestCreateSchema
>;

export const protocolAppConsentRequestDecisionSchema = z
  .object({
    approvedByUserId: uuidSchema.optional(),
    rejectedByUserId: uuidSchema.optional(),
    metadata: z.record(z.string(), z.unknown()).default({}),
  })
  .strict();
export type ProtocolAppConsentRequestDecision = z.infer<
  typeof protocolAppConsentRequestDecisionSchema
>;

export const protocolAppScopeGrantCreateSchema = z
  .object({
    scope: protocolScopeNameSchema,
    capabilities: z.array(capabilityNameSchema).default([]),
    subjectType: protocolGrantSubjectTypeSchema.default("app"),
    subjectId: z.string().min(1).max(200).optional(),
    grantedByUserId: uuidSchema.optional(),
    metadata: z.record(z.string(), z.unknown()).default({}),
  })
  .strict();
export type ProtocolAppScopeGrantCreate = z.infer<
  typeof protocolAppScopeGrantCreateSchema
>;

export const protocolAppScopeGrantRevokeSchema = z
  .object({
    revokedByUserId: uuidSchema.optional(),
    metadata: z.record(z.string(), z.unknown()).default({}),
  })
  .strict();
export type ProtocolAppScopeGrantRevoke = z.infer<
  typeof protocolAppScopeGrantRevokeSchema
>;

export const protocolIntentCreateActionSchema = z
  .object({
    actorUserId: uuidSchema,
    rawText: z.string().min(1).max(4000),
    agentThreadId: uuidSchema.optional(),
    traceId: uuidSchema.optional(),
    metadata: z.record(z.string(), z.unknown()).default({}),
  })
  .strict();
export type ProtocolIntentCreateAction = z.infer<
  typeof protocolIntentCreateActionSchema
>;

export const protocolIntentRequestSendActionSchema = z
  .object({
    actorUserId: uuidSchema,
    intentId: uuidSchema,
    recipientUserId: uuidSchema,
    agentThreadId: uuidSchema.optional(),
    traceId: uuidSchema.optional(),
    metadata: z.record(z.string(), z.unknown()).default({}),
  })
  .strict();
export type ProtocolIntentRequestSendAction = z.infer<
  typeof protocolIntentRequestSendActionSchema
>;

export const protocolRequestDecisionActionSchema = z
  .object({
    actorUserId: uuidSchema,
    metadata: z.record(z.string(), z.unknown()).default({}),
  })
  .strict();
export type ProtocolRequestDecisionAction = z.infer<
  typeof protocolRequestDecisionActionSchema
>;

export const protocolChatSendMessageActionSchema = z
  .object({
    actorUserId: uuidSchema,
    body: z.string().min(1).max(4000),
    clientMessageId: identifierSchema.optional(),
    replyToMessageId: uuidSchema.optional(),
    metadata: z.record(z.string(), z.unknown()).default({}),
  })
  .strict();
export type ProtocolChatSendMessageAction = z.infer<
  typeof protocolChatSendMessageActionSchema
>;

export const protocolIntentActionResultSchema = z
  .object({
    action: z.literal("intent.create"),
    status: z.string().min(1),
    actorUserId: uuidSchema,
    intentId: uuidSchema,
    traceId: uuidSchema,
    safetyState: z.string().min(1).nullable().optional(),
    metadata: z.record(z.string(), z.unknown()).default({}),
  })
  .strict();
export type ProtocolIntentActionResult = z.infer<
  typeof protocolIntentActionResultSchema
>;

export const protocolRequestActionResultSchema = z
  .object({
    action: z.enum([
      "request.send",
      "request.accept",
      "request.reject",
    ] as const),
    status: z.string().min(1),
    actorUserId: uuidSchema,
    requestId: uuidSchema.nullable(),
    intentId: uuidSchema.optional(),
    senderUserId: uuidSchema.optional(),
    recipientUserId: uuidSchema.optional(),
    queued: z.boolean().optional(),
    unchanged: z.boolean().optional(),
    metadata: z.record(z.string(), z.unknown()).default({}),
  })
  .strict();
export type ProtocolRequestActionResult = z.infer<
  typeof protocolRequestActionResultSchema
>;

export const protocolChatMessageActionResultSchema = z
  .object({
    action: z.literal("chat.send_message"),
    actorUserId: uuidSchema,
    chatId: uuidSchema,
    messageId: uuidSchema,
    replyToMessageId: uuidSchema.nullable().optional(),
    createdAt: isoDateTimeSchema,
    metadata: z.record(z.string(), z.unknown()).default({}),
  })
  .strict();
export type ProtocolChatMessageActionResult = z.infer<
  typeof protocolChatMessageActionResultSchema
>;

export const protocolWebhookDeliveryRunRequestSchema = z
  .object({
    limit: z.number().int().min(1).max(100).optional(),
  })
  .strict();
export type ProtocolWebhookDeliveryRunRequest = z.infer<
  typeof protocolWebhookDeliveryRunRequestSchema
>;

export const protocolWebhookDeliveryRunResultSchema = z
  .object({
    claimedCount: z.number().int().min(0),
    attemptedCount: z.number().int().min(0),
    deliveredCount: z.number().int().min(0),
    retryScheduledCount: z.number().int().min(0),
    deadLetteredCount: z.number().int().min(0),
    skippedCount: z.number().int().min(0),
    ranAt: isoDateTimeSchema,
    results: z.array(
      z
        .object({
          deliveryId: uuidSchema,
          subscriptionId: identifierSchema,
          endpointUrl: urlSchema.or(z.literal("")),
          outcome: z.enum([
            "delivered",
            "retrying",
            "dead_lettered",
            "skipped",
          ] as const),
          statusCode: z.number().int().nullable(),
          errorCode: z.string().nullable(),
          errorMessage: z.string().nullable(),
          attemptCount: z.number().int().min(0),
        })
        .strict(),
    ),
  })
  .strict();
export type ProtocolWebhookDeliveryRunResult = z.infer<
  typeof protocolWebhookDeliveryRunResultSchema
>;

export const protocolWebhookDeliveryDispatchResultSchema = z
  .object({
    queueName: z.literal("protocol-webhooks"),
    jobName: z.literal("RunProtocolWebhookDeliveries"),
    appId: identifierSchema,
    limit: z.number().int().min(1).max(100),
    enqueuedAt: isoDateTimeSchema,
  })
  .strict();
export type ProtocolWebhookDeliveryDispatchResult = z.infer<
  typeof protocolWebhookDeliveryDispatchResultSchema
>;

export const protocolWebhookDeliveryAttemptSchema = z
  .object({
    deliveryId: uuidSchema,
    appId: identifierSchema,
    subscriptionId: identifierSchema,
    attemptNumber: z.number().int().min(1),
    outcome: z.enum([
      "delivered",
      "retrying",
      "dead_lettered",
      "failed",
      "skipped",
      "replayed",
    ] as const),
    attemptedAt: isoDateTimeSchema,
    responseStatusCode: z.number().int().nullable(),
    errorCode: z.string().nullable(),
    errorMessage: z.string().nullable(),
    durationMs: z.number().int().min(0).nullable(),
    metadata: z.record(z.string(), z.unknown()).default({}),
    createdAt: isoDateTimeSchema,
  })
  .strict();
export type ProtocolWebhookDeliveryAttempt = z.infer<
  typeof protocolWebhookDeliveryAttemptSchema
>;

export const protocolWebhookDeliveryReplayResultSchema = z
  .object({
    deliveryId: uuidSchema,
    appId: identifierSchema,
    subscriptionId: identifierSchema,
    previousStatus: z.literal("dead_lettered"),
    status: z.literal("queued"),
    attemptCount: z.number().int().min(0),
    replayedAt: isoDateTimeSchema,
    nextAttemptAt: isoDateTimeSchema,
  })
  .strict();
export type ProtocolWebhookDeliveryReplayResult = z.infer<
  typeof protocolWebhookDeliveryReplayResultSchema
>;

export const protocolWebhookDeliveryReplayBatchResultSchema = z
  .object({
    appId: identifierSchema,
    replayedCount: z.number().int().min(0),
    replayedAt: isoDateTimeSchema,
    deliveryIds: z.array(uuidSchema).default([]),
  })
  .strict();
export type ProtocolWebhookDeliveryReplayBatchResult = z.infer<
  typeof protocolWebhookDeliveryReplayBatchResultSchema
>;
