import { z } from "zod";

export const uuidSchema = z.string().uuid();
export const isoDateTimeSchema = z.string().datetime();

export enum IntentType {
  CHAT = "chat",
  ACTIVITY = "activity",
  GROUP = "group",
}

export enum IntentUrgency {
  NOW = "now",
  TODAY = "today",
  TONIGHT = "tonight",
  FLEXIBLE = "flexible",
}

export enum RequestStatus {
  PENDING = "pending",
  ACCEPTED = "accepted",
  REJECTED = "rejected",
  EXPIRED = "expired",
  CANCELLED = "cancelled",
}

export enum ConnectionType {
  DM = "dm",
  GROUP = "group",
}

export enum ChatType {
  DM = "dm",
  GROUP = "group",
}

export enum NotificationType {
  REQUEST_RECEIVED = "request_received",
  REQUEST_ACCEPTED = "request_accepted",
  GROUP_FORMED = "group_formed",
  AGENT_UPDATE = "agent_update",
  REMINDER = "reminder",
  DIGEST = "digest",
  MODERATION_NOTICE = "moderation_notice",
}

export enum ModerationStatus {
  CLEAN = "clean",
  FLAGGED = "flagged",
  BLOCKED = "blocked",
  REVIEW = "review",
}

export enum UserAvailabilityMode {
  NOW = "now",
  LATER_TODAY = "later_today",
  FLEXIBLE = "flexible",
  AWAY = "away",
  INVISIBLE = "invisible",
}

export const apiResponseEnvelopeSchema = z.object({
  success: z.boolean(),
  traceId: uuidSchema.optional(),
  data: z.unknown().optional(),
  error: z
    .object({
      code: z.string(),
      message: z.string(),
      details: z.unknown().optional(),
    })
    .optional(),
});

export const intentPayloadSchema = z.object({
  version: z.literal(1),
  rawText: z.string().min(1),
  intentType: z.nativeEnum(IntentType).optional(),
  urgency: z.nativeEnum(IntentUrgency).optional(),
  topics: z.array(z.string()).default([]),
  activities: z.array(z.string()).default([]),
  groupSizeTarget: z.number().int().min(1).max(4).optional(),
  confidence: z.number().min(0).max(1).optional(),
});

export const websocketEventSchema = z.object({
  event: z.string(),
  payload: z.unknown(),
  occurredAt: isoDateTimeSchema,
});

export const queueEnvelopeSchema = z.object({
  version: z.literal(1),
  traceId: uuidSchema,
  timestamp: isoDateTimeSchema,
  payload: z.unknown(),
});

export const intentCreatedJobSchema = queueEnvelopeSchema.extend({
  type: z.literal("IntentCreated"),
  payload: z.object({
    intentId: uuidSchema,
    userId: uuidSchema,
    rawText: z.string().min(1),
  }),
});

export const intentParsedJobSchema = queueEnvelopeSchema.extend({
  type: z.literal("IntentParsed"),
  payload: z.object({
    intentId: uuidSchema,
    confidence: z.number().min(0).max(1),
  }),
});

export const candidatesRetrievedJobSchema = queueEnvelopeSchema.extend({
  type: z.literal("CandidatesRetrieved"),
  payload: z.object({
    intentId: uuidSchema,
    candidateUserIds: z.array(uuidSchema),
  }),
});

export const fanoutCompletedJobSchema = queueEnvelopeSchema.extend({
  type: z.literal("FanoutCompleted"),
  payload: z.object({
    intentId: z.string().uuid(),
    requestCount: z.number().int().nonnegative(),
  }),
});

export const requestAcceptedJobSchema = queueEnvelopeSchema.extend({
  type: z.literal("RequestAccepted"),
  payload: z.object({
    requestId: uuidSchema,
    intentId: uuidSchema.optional(),
  }),
});

export const connectionCreatedJobSchema = queueEnvelopeSchema.extend({
  type: z.literal("ConnectionCreated"),
  payload: z.object({
    connectionId: uuidSchema,
    intentId: uuidSchema.optional(),
  }),
});

export const moderationFlaggedJobSchema = queueEnvelopeSchema.extend({
  type: z.literal("ModerationFlagged"),
  payload: z.object({
    entityType: z.string(),
    entityId: uuidSchema,
    reason: z.string(),
  }),
});

export const notificationDispatchJobSchema = queueEnvelopeSchema.extend({
  type: z.literal("NotificationDispatch"),
  payload: z.object({
    notificationId: uuidSchema,
    recipientUserId: uuidSchema,
    notificationType: z.nativeEnum(NotificationType),
  }),
});

export const authGoogleCallbackBodySchema = z.object({
  code: z.string().min(1),
});

export const authRefreshBodySchema = z.object({
  refreshToken: z.string().min(1),
  deviceId: z.string().max(255).optional(),
  deviceName: z.string().max(255).optional(),
  userAgent: z.string().max(1024).optional(),
  ipAddress: z.string().max(128).optional(),
});

export const authRevokeSessionBodySchema = z.object({
  userId: uuidSchema,
});

export const profileUpdateBodySchema = z.object({
  bio: z.string().max(500).optional(),
  city: z.string().max(120).optional(),
  country: z.string().max(120).optional(),
  visibility: z.enum(["public", "limited", "private"]).optional(),
});

export const postAgentThreadMessageBodySchema = z.object({
  userId: uuidSchema,
  content: z.string().min(1),
});

export const createIntentBodySchema = z.object({
  userId: uuidSchema,
  rawText: z.string().min(1),
  agentThreadId: uuidSchema.optional(),
});

export const updateIntentBodySchema = z.object({
  rawText: z.string().min(1),
});

export const intentFollowupActionBodySchema = z
  .object({ agentThreadId: uuidSchema.optional() })
  .default({});

export const cancelIntentRequestBodySchema = z.object({
  originatorUserId: uuidSchema,
});

export const createConnectionBodySchema = z.object({
  type: z.enum(["dm", "group"]),
  createdByUserId: uuidSchema,
  originIntentId: uuidSchema.optional(),
});

export const createChatBodySchema = z.object({
  connectionId: uuidSchema,
  type: z.enum(["dm", "group"]),
});

export const listChatMessagesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  before: isoDateTimeSchema.optional(),
});

export const createChatMessageBodySchema = z.object({
  senderUserId: uuidSchema,
  body: z.string().min(1),
});

export const readReceiptBodySchema = z.object({
  userId: uuidSchema,
});

export const moderationReportBodySchema = z.object({
  reporterUserId: uuidSchema,
  targetUserId: uuidSchema.nullable(),
  reason: z.string().min(1),
  details: z.string().optional(),
});

export const moderationBlockBodySchema = z.object({
  blockerUserId: uuidSchema,
  blockedUserId: uuidSchema,
});

export const realtimePresenceStateSchema = z.enum([
  "online",
  "away",
  "invisible",
  "available_now",
  "available_today",
]);

export const realtimeConnectionAuthenticatePayloadSchema = z.object({
  userId: uuidSchema,
});

export const realtimeRoomJoinPayloadSchema = z.object({
  roomId: uuidSchema,
});

export const realtimeChatMessageCreatedInputPayloadSchema = z.object({
  roomId: uuidSchema.optional(),
  payload: z.unknown(),
});

export const realtimeChatSendPayloadSchema = z.object({
  roomId: uuidSchema,
  senderUserId: uuidSchema,
  clientMessageId: uuidSchema,
  body: z.string().min(1),
});

export const realtimeChatTypingPayloadSchema = z.object({
  roomId: uuidSchema,
  userId: uuidSchema,
  isTyping: z.boolean(),
});

export const realtimeReceiptReadPayloadSchema = z.object({
  chatId: uuidSchema,
  messageId: uuidSchema,
  userId: uuidSchema,
});

export const realtimePresenceUpdatePayloadSchema = z.object({
  userId: uuidSchema,
  state: realtimePresenceStateSchema,
});

export const realtimePresenceUpdatedPayloadSchema = z.object({
  userId: uuidSchema,
  online: z.boolean(),
  state: realtimePresenceStateSchema.optional(),
});

export const realtimeClientEventPayloadSchemas = {
  "connection.authenticate": realtimeConnectionAuthenticatePayloadSchema,
  "room.join": realtimeRoomJoinPayloadSchema,
  "chat.message.created": realtimeChatMessageCreatedInputPayloadSchema,
  "chat.send": realtimeChatSendPayloadSchema,
  "chat.typing": realtimeChatTypingPayloadSchema,
  "receipt.read": realtimeReceiptReadPayloadSchema,
  "presence.update": realtimePresenceUpdatePayloadSchema,
} as const;

export const realtimeServerEventPayloadSchemas = {
  "presence.updated": realtimePresenceUpdatedPayloadSchema,
  "presence.changed": realtimePresenceUpdatedPayloadSchema,
  "chat.message.created": z.unknown(),
  "chat.message": realtimeChatSendPayloadSchema,
  "chat.typing": realtimeChatTypingPayloadSchema,
  "chat.receipt": realtimeReceiptReadPayloadSchema,
  "request.created": z.object({
    requestId: uuidSchema,
    intentId: uuidSchema,
  }),
  "request.updated": z.object({
    requestId: uuidSchema,
    status: z.nativeEnum(RequestStatus),
  }),
  "intent.updated": z.object({
    intentId: uuidSchema,
    status: z.string(),
  }),
  "connection.created": z.object({
    connectionId: uuidSchema,
    type: z.nativeEnum(ConnectionType),
  }),
  "moderation.notice": z.object({
    userId: uuidSchema,
    reason: z.string(),
  }),
} as const;

export const supportedQueueSchemas = {
  IntentCreated: intentCreatedJobSchema,
  IntentParsed: intentParsedJobSchema,
  CandidatesRetrieved: candidatesRetrievedJobSchema,
  FanoutCompleted: fanoutCompletedJobSchema,
  RequestAccepted: requestAcceptedJobSchema,
  ConnectionCreated: connectionCreatedJobSchema,
  ModerationFlagged: moderationFlaggedJobSchema,
  NotificationDispatch: notificationDispatchJobSchema,
} as const;

export type RealtimeClientEventName =
  keyof typeof realtimeClientEventPayloadSchemas;
export type RealtimeServerEventName =
  keyof typeof realtimeServerEventPayloadSchemas;
export type RealtimeClientEventPayload<T extends RealtimeClientEventName> =
  z.infer<(typeof realtimeClientEventPayloadSchemas)[T]>;
export type RealtimeServerEventPayload<T extends RealtimeServerEventName> =
  z.infer<(typeof realtimeServerEventPayloadSchemas)[T]>;

export type ApiResponseEnvelope = z.infer<typeof apiResponseEnvelopeSchema>;
export type IntentPayload = z.infer<typeof intentPayloadSchema>;
export type QueueEnvelope = z.infer<typeof queueEnvelopeSchema>;
