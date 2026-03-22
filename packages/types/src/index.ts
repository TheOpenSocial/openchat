import { z } from "zod";

export * from "./agent-transcript.js";

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
  modality: z.enum(["online", "offline", "either"]).optional(),
  topics: z.array(z.string()).default([]),
  activities: z.array(z.string()).default([]),
  groupSizeTarget: z.number().int().min(1).max(4).optional(),
  timingConstraints: z.array(z.string()).default([]),
  skillConstraints: z.array(z.string()).default([]),
  vibeConstraints: z.array(z.string()).default([]),
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
  idempotencyKey: z.string().min(1).max(255),
  timestamp: isoDateTimeSchema,
  payload: z.unknown(),
});

export const intentCreatedJobSchema = queueEnvelopeSchema.extend({
  type: z.literal("IntentCreated"),
  payload: z.object({
    intentId: uuidSchema,
    agentThreadId: uuidSchema.nullish(),
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

export const profilePhotoUploadedJobSchema = queueEnvelopeSchema.extend({
  type: z.literal("ProfilePhotoUploaded"),
  payload: z.object({
    imageId: uuidSchema,
    userId: uuidSchema,
    mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  }),
});

export const asyncAgentFollowupJobSchema = queueEnvelopeSchema.extend({
  type: z.literal("AsyncAgentFollowup"),
  payload: z.object({
    userId: uuidSchema,
    intentId: uuidSchema,
    agentThreadId: uuidSchema.optional(),
    template: z.enum(["pending_reminder", "no_match_yet", "progress_update"]),
    notificationType: z.nativeEnum(NotificationType).optional(),
    message: z.string().min(1).optional(),
  }),
});

export const authGoogleCallbackBodySchema = z.object({
  code: z.string().min(1),
  /** When true, email must match `ADMIN_CONSOLE_ALLOWED_EMAILS` on the API. */
  adminConsole: z.literal(true).optional(),
});

/** Query strings often send `param=`; coerce empty to undefined so `.url()` does not fail. */
const optionalOAuthRedirectQuery = z.preprocess(
  (val) => (val === "" || val == null ? undefined : val),
  z.string().url().max(2048).optional(),
);

export const authGoogleStartQuerySchema = z.object({
  mobileRedirectUri: optionalOAuthRedirectQuery,
  webRedirectUri: optionalOAuthRedirectQuery,
});

export const authGoogleBrowserCallbackQuerySchema = z.object({
  code: z.string().min(1).optional(),
  state: z.string().min(1).optional(),
  error: z.string().min(1).optional(),
  error_description: z.string().max(500).optional(),
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

export const authRevokeAllSessionsBodySchema = z.object({
  userId: uuidSchema,
  exceptSessionId: uuidSchema.optional(),
});

export const profileUpdateBodySchema = z.object({
  bio: z.string().max(500).optional(),
  city: z.string().max(120).optional(),
  country: z.string().max(120).optional(),
  visibility: z.enum(["public", "limited", "private"]).optional(),
});

const profileInterestInputSchema = z.object({
  kind: z.string().min(1).max(64),
  label: z.string().min(1).max(120),
  weight: z.number().min(0).max(10).optional(),
  source: z.string().min(1).max(64).optional(),
});

export const profileInterestsBodySchema = z.object({
  interests: z.array(profileInterestInputSchema).max(100),
});

const profileTopicInputSchema = z.object({
  label: z.string().min(1).max(120),
  weight: z.number().min(0).max(10).optional(),
  source: z.string().min(1).max(64).optional(),
});

export const profileTopicsBodySchema = z.object({
  topics: z.array(profileTopicInputSchema).max(100),
});

const profileAvailabilityWindowInputSchema = z
  .object({
    dayOfWeek: z.number().int().min(0).max(6),
    startMinute: z.number().int().min(0).max(1439),
    endMinute: z.number().int().min(1).max(1440),
    mode: z.string().min(1).max(64).optional(),
    timezone: z.string().min(1).max(128).optional(),
  })
  .refine((value) => value.startMinute < value.endMinute, {
    message: "startMinute must be less than endMinute",
    path: ["endMinute"],
  });

export const profileAvailabilityWindowsBodySchema = z.object({
  windows: z.array(profileAvailabilityWindowInputSchema).max(84),
});

export const profileSocialModeBodySchema = z.object({
  socialMode: z.enum(["chill", "balanced", "high_energy"]),
  preferOneToOne: z.boolean(),
  allowGroupInvites: z.boolean(),
});

export const profileIntentTypePreferenceBodySchema = z.object({
  intentType: z.nativeEnum(IntentType),
  payload: z.record(z.string(), z.unknown()),
});

export const globalRulesBodySchema = z.object({
  whoCanContact: z.enum(["anyone", "verified_only", "trusted_only"]),
  reachable: z.enum(["always", "available_only", "do_not_disturb"]),
  intentMode: z.enum(["one_to_one", "group", "balanced"]),
  modality: z.enum(["online", "offline", "either"]),
  languagePreferences: z.array(z.string().min(2).max(32)).max(10),
  requireVerifiedUsers: z.boolean(),
  notificationMode: z.enum(["immediate", "digest", "quiet"]),
  agentAutonomy: z.enum(["manual", "suggest_only", "auto_non_risky"]),
  memoryMode: z.enum(["minimal", "standard", "extended"]),
  timezone: z.string().min(1).max(128).default("UTC"),
});

export const lifeGraphNodeTypeSchema = z.enum([
  "activity",
  "topic",
  "game",
  "person",
  "schedule_preference",
  "location_cluster",
]);

export const lifeGraphEdgeTypeSchema = z.enum([
  "likes",
  "avoids",
  "prefers",
  "recently_engaged_with",
  "high_success_with",
]);

const lifeGraphNodeInputSchema = z.object({
  nodeType: lifeGraphNodeTypeSchema,
  label: z.string().min(1).max(160),
});

export const lifeGraphUpsertNodesBodySchema = z.object({
  nodes: z.array(lifeGraphNodeInputSchema).min(1).max(100),
});

export const lifeGraphExplicitEdgeBodySchema = z.object({
  edgeType: lifeGraphEdgeTypeSchema,
  targetNode: lifeGraphNodeInputSchema,
  sourceNode: lifeGraphNodeInputSchema.optional(),
  weight: z.number().min(-1).max(1).optional(),
});

export const lifeGraphBehaviorSignalBodySchema = z.object({
  edgeType: lifeGraphEdgeTypeSchema,
  targetNode: lifeGraphNodeInputSchema,
  sourceNode: lifeGraphNodeInputSchema.optional(),
  signalStrength: z.number().min(-1).max(1),
  feedbackType: z.string().min(1).max(80),
  context: z.record(z.string(), z.unknown()).optional(),
});

export const retrievalInteractionSummaryBodySchema = z.object({
  summary: z.string().min(1).max(4000),
  safe: z.boolean().optional(),
  context: z.record(z.string(), z.unknown()).optional(),
});

export const retrievalContextQueryBodySchema = z.object({
  query: z.string().min(1).max(400),
  maxChunks: z.number().int().min(1).max(10).optional(),
  maxAgeDays: z.number().int().min(1).max(365).optional(),
});

export const ruleDecisionExplainBodySchema = z.object({
  safetyAllowed: z.boolean(),
  hardRuleAllowed: z.boolean(),
  productPolicyAllowed: z.boolean(),
  overrideAllowed: z.boolean(),
  learnedPreferenceAllowed: z.boolean(),
  rankingAllowed: z.boolean(),
  context: z.record(z.string(), z.unknown()).optional(),
});

export const profilePhotoUploadIntentBodySchema = z.object({
  fileName: z.string().min(1).max(255),
  mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  byteSize: z
    .number()
    .int()
    .positive()
    .max(10 * 1024 * 1024),
});

export const profilePhotoUploadCompleteBodySchema = z.object({
  uploadToken: z.string().min(32).max(2048),
  byteSize: z
    .number()
    .int()
    .positive()
    .max(10 * 1024 * 1024),
  width: z.number().int().positive().max(10_000).optional(),
  height: z.number().int().positive().max(10_000).optional(),
  sha256: z
    .string()
    .regex(/^[a-f0-9]{64}$/i)
    .optional(),
});

export const postAgentThreadMessageBodySchema = z.object({
  userId: uuidSchema,
  content: z.string().min(1),
});

export const agentAttachmentInputSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("image_url"),
    url: z.string().url().max(2048),
    caption: z.string().max(500).optional(),
  }),
  z.object({
    kind: z.literal("file_ref"),
    fileId: z.string().min(1).max(255),
    caption: z.string().max(500).optional(),
  }),
]);

export const agentThreadRespondBodySchema = z.object({
  userId: uuidSchema,
  content: z.string().min(1),
  traceId: z.string().min(1).max(256).optional(),
  streamResponseTokens: z.boolean().optional(),
  voiceTranscript: z.string().min(1).max(8000).optional(),
  attachments: z.array(agentAttachmentInputSchema).max(8).optional(),
});

export const agentPlanCheckpointStatusSchema = z.enum([
  "pending",
  "approved",
  "rejected",
]);

export const agentPlanCheckpointListQuerySchema = z.object({
  status: agentPlanCheckpointStatusSchema.optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

export const agentPlanCheckpointDecisionBodySchema = z.object({
  userId: uuidSchema,
  reason: z.string().min(1).max(500).optional(),
});

export const createIntentBodySchema = z.object({
  userId: uuidSchema,
  rawText: z.string().min(1),
  agentThreadId: uuidSchema.optional(),
});

export const updateIntentBodySchema = z.object({
  rawText: z.string().min(1),
});

export const summarizePendingIntentsBodySchema = z.object({
  userId: uuidSchema,
  agentThreadId: uuidSchema.optional(),
  maxIntents: z.number().int().min(1).max(10).optional(),
});

export const cancelIntentBodySchema = z
  .object({
    userId: uuidSchema.optional(),
    agentThreadId: uuidSchema.optional(),
  })
  .default({});

export const convertIntentModeBodySchema = z.object({
  mode: z.enum(["one_to_one", "group"]),
  groupSizeTarget: z.number().int().min(2).max(4).optional(),
});

export const createIntentFromAgentMessageBodySchema = z.object({
  threadId: uuidSchema,
  userId: uuidSchema,
  content: z.string().min(1),
  allowDecomposition: z.boolean().optional(),
  maxIntents: z.number().int().min(1).max(5).optional(),
});

export const searchQuerySchema = z.object({
  q: z.string().min(1).max(120),
  limit: z.coerce.number().int().min(1).max(20).optional(),
});

export const intentFollowupActionBodySchema = z
  .object({ agentThreadId: uuidSchema.optional() })
  .default({});

export const cancelIntentRequestBodySchema = z.object({
  originatorUserId: uuidSchema,
});

export const bulkInboxRequestActionBodySchema = z
  .object({
    recipientUserId: uuidSchema,
    requestIds: z.array(uuidSchema).max(100).optional(),
    action: z.enum(["decline", "snooze"]),
    snoozeMinutes: z.number().int().min(5).max(1440).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.action === "snooze" && !value.snoozeMinutes) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["snoozeMinutes"],
        message: "snoozeMinutes is required when action is snooze",
      });
    }
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
  clientMessageId: uuidSchema.optional(),
});

export const readReceiptBodySchema = z.object({
  userId: uuidSchema,
});

export const softDeleteChatMessageBodySchema = z.object({
  userId: uuidSchema,
});

export const chatLeaveBodySchema = z.object({
  userId: uuidSchema,
});

export const hideChatMessageBodySchema = z.object({
  moderatorUserId: uuidSchema,
  reason: z.string().min(1).max(500).optional(),
});

export const chatSyncQuerySchema = z.object({
  userId: uuidSchema,
  limit: z.coerce.number().int().min(1).max(200).optional(),
  after: isoDateTimeSchema.optional(),
});

export const moderationReportBodySchema = z
  .object({
    reporterUserId: uuidSchema,
    targetUserId: uuidSchema.nullable(),
    reason: z.string().min(1),
    details: z.string().optional(),
    entityType: z
      .enum(["chat_message", "intent", "profile", "user"])
      .optional(),
    entityId: uuidSchema.optional(),
  })
  .superRefine((value, ctx) => {
    if (value.entityType && !value.entityId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["entityId"],
        message: "entityId is required when entityType is provided",
      });
    }
  });

export const moderationBlockBodySchema = z.object({
  blockerUserId: uuidSchema,
  blockedUserId: uuidSchema,
});

export const moderationIssueStrikeBodySchema = z
  .object({
    moderatorUserId: uuidSchema,
    targetUserId: uuidSchema,
    reason: z.string().min(1).max(500),
    severity: z.number().int().min(1).max(3).optional(),
    entityType: z
      .enum(["chat_message", "intent", "profile", "user"])
      .optional(),
    entityId: uuidSchema.optional(),
  })
  .superRefine((value, ctx) => {
    if (value.entityType && !value.entityId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["entityId"],
        message: "entityId is required when entityType is provided",
      });
    }
  });

export const moderationAssessBodySchema = z.object({
  userId: uuidSchema.optional(),
  content: z.string().min(1).max(8000),
  context: z.string().max(1000).optional(),
  surface: z
    .enum(["agent_turn", "agent_response", "chat_message", "profile", "intent"])
    .optional(),
});

export const adminUserActionBodySchema = z
  .object({
    reason: z.string().min(1).max(500).optional(),
  })
  .default({});

export const adminResendNotificationBodySchema = z.object({
  type: z.nativeEnum(NotificationType),
  body: z.string().min(1).max(500),
});

export const adminRepairChatFlowBodySchema = z
  .object({
    actorUserId: uuidSchema.optional(),
    syncUserId: uuidSchema.optional(),
  })
  .default({});

export const adminModerationAgentRiskQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(250).optional(),
  status: z.enum(["open", "resolved", "dismissed"]).optional(),
  decision: z.enum(["review", "blocked"]).optional(),
});

export const adminModerationQueueQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(250).optional(),
  status: z.enum(["open", "resolved", "dismissed"]).optional(),
  entityType: z.string().min(1).max(80).optional(),
  reasonContains: z.string().min(1).max(160).optional(),
});

export const adminModerationFlagTriageBodySchema = z
  .object({
    action: z.enum(["resolve", "reopen", "escalate_strike", "restrict_user"]),
    reason: z.string().min(1).max(500).optional(),
    targetUserId: uuidSchema.optional(),
    strikeSeverity: z.number().int().min(1).max(3).optional(),
    strikeReason: z.string().min(1).max(500).optional(),
  })
  .superRefine((value, ctx) => {
    const requiresTargetUser =
      value.action === "escalate_strike" || value.action === "restrict_user";
    if (requiresTargetUser && !value.targetUserId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["targetUserId"],
        message: "targetUserId is required for this action",
      });
    }
  });

export const adminModerationFlagAssignBodySchema = z.object({
  assigneeUserId: uuidSchema,
  reason: z.string().min(1).max(500).optional(),
});

export const discoveryQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(10).optional(),
});

export const discoveryAgentRecommendationsBodySchema = z
  .object({
    threadId: uuidSchema.optional(),
    limit: z.number().int().min(1).max(10).optional(),
  })
  .default({});

export const analyticsTrackEventBodySchema = z.object({
  eventType: z.string().min(1).max(80),
  actorUserId: uuidSchema.optional(),
  entityType: z.string().min(1).max(80).optional(),
  entityId: uuidSchema.optional(),
  properties: z.record(z.string(), z.unknown()).optional(),
  occurredAt: isoDateTimeSchema.optional(),
});

export const analyticsListEventsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).optional(),
  eventType: z.string().min(1).max(80).optional(),
  actorUserId: uuidSchema.optional(),
});

export const analyticsCoreMetricsQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(365).optional(),
});

export const notificationMarkReadBodySchema = z.object({
  userId: uuidSchema,
});

export const privacyDeleteAccountBodySchema = z
  .object({
    actorUserId: uuidSchema.optional(),
    reason: z.string().min(1).max(500).optional(),
  })
  .default({});

export const privacyDeleteMessagesBodySchema = z
  .object({
    actorUserId: uuidSchema.optional(),
    reason: z.string().min(1).max(500).optional(),
  })
  .default({});

export const privacyMemoryResetModeSchema = z.enum([
  "learned_memory",
  "all_personalization",
]);

export const privacyResetMemoryBodySchema = z
  .object({
    actorUserId: uuidSchema.optional(),
    reason: z.string().min(1).max(500).optional(),
    mode: privacyMemoryResetModeSchema.optional(),
  })
  .default({});

export const complianceAcceptanceTypeSchema = z.enum(["terms", "privacy"]);

export const complianceRecordAcceptanceBodySchema = z.object({
  type: complianceAcceptanceTypeSchema,
  version: z.string().min(1).max(80),
  acceptedAt: isoDateTimeSchema.optional(),
});

export const complianceBirthDateBodySchema = z.object({
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const launchControlsUpdateBodySchema = z
  .object({
    actorUserId: uuidSchema.optional(),
    reason: z.string().min(1).max(500).optional(),
    globalKillSwitch: z.boolean().optional(),
    inviteOnlyMode: z.boolean().optional(),
    alphaCohortUserIds: z.array(uuidSchema).max(1000).optional(),
    enableNewIntents: z.boolean().optional(),
    enableAgentFollowups: z.boolean().optional(),
    enableGroupFormation: z.boolean().optional(),
    enablePushNotifications: z.boolean().optional(),
    enablePersonalization: z.boolean().optional(),
    enableDiscovery: z.boolean().optional(),
    enableModerationStrictness: z.boolean().optional(),
    enableAiParsing: z.boolean().optional(),
    enableRealtimeChat: z.boolean().optional(),
    enableScheduledTasks: z.boolean().optional(),
    enableSavedSearches: z.boolean().optional(),
    enableRecurringBriefings: z.boolean().optional(),
    enableRecurringCircles: z.boolean().optional(),
  })
  .default({});

export const scheduledTaskTypeSchema = z.enum([
  "saved_search",
  "discovery_briefing",
  "reconnect_briefing",
  "social_reminder",
]);

export const scheduledTaskStatusSchema = z.enum([
  "active",
  "paused",
  "disabled",
  "archived",
]);

export const scheduledTaskDeliveryModeSchema = z.enum([
  "notification",
  "agent_thread",
  "notification_and_agent_thread",
]);

export const scheduledTaskScheduleSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("hourly"),
    intervalHours: z.number().int().min(1).max(24),
    timezone: z.string().min(1).max(128),
  }),
  z.object({
    kind: z.literal("weekly"),
    days: z
      .array(z.enum(["sun", "mon", "tue", "wed", "thu", "fri", "sat"]))
      .min(1)
      .max(7),
    hour: z.number().int().min(0).max(23),
    minute: z.number().int().min(0).max(59),
    timezone: z.string().min(1).max(128),
  }),
]);

const scheduledTaskSavedSearchConfigSchema = z.object({
  savedSearchId: uuidSchema,
  deliveryMode: scheduledTaskDeliveryModeSchema,
  minResults: z.number().int().min(0).max(50).default(1),
  maxResults: z.number().int().min(1).max(50).default(5),
});

const scheduledTaskDiscoveryBriefingConfigSchema = z.object({
  briefingType: z.enum(["tonight", "passive", "inbox"]),
  deliveryMode: scheduledTaskDeliveryModeSchema,
  maxResults: z.number().int().min(1).max(10).default(5),
});

const scheduledTaskReconnectBriefingConfigSchema = z.object({
  deliveryMode: scheduledTaskDeliveryModeSchema,
  lookbackDays: z.number().int().min(1).max(180).default(30),
  minConfidence: z.number().min(0).max(1).default(0.6),
});

const scheduledTaskSocialReminderConfigSchema = z.object({
  template: z.enum([
    "open_passive_mode",
    "revisit_unanswered_intents",
    "resume_dormant_chats",
  ]),
  deliveryMode: scheduledTaskDeliveryModeSchema,
  context: z.record(z.string(), z.unknown()).optional(),
});

export const scheduledTaskConfigSchema = z.discriminatedUnion("taskType", [
  z.object({
    taskType: z.literal("saved_search"),
    config: scheduledTaskSavedSearchConfigSchema,
  }),
  z.object({
    taskType: z.literal("discovery_briefing"),
    config: scheduledTaskDiscoveryBriefingConfigSchema,
  }),
  z.object({
    taskType: z.literal("reconnect_briefing"),
    config: scheduledTaskReconnectBriefingConfigSchema,
  }),
  z.object({
    taskType: z.literal("social_reminder"),
    config: scheduledTaskSocialReminderConfigSchema,
  }),
]);

export const scheduledTaskCreateBodySchema = z.object({
  title: z.string().min(1).max(120),
  description: z.string().min(1).max(500).optional(),
  schedule: scheduledTaskScheduleSchema,
  task: scheduledTaskConfigSchema,
});

export const scheduledTaskUpdateBodySchema = z.object({
  title: z.string().min(1).max(120).optional(),
  description: z.string().min(1).max(500).nullable().optional(),
  status: scheduledTaskStatusSchema.optional(),
  schedule: scheduledTaskScheduleSchema.optional(),
  task: scheduledTaskConfigSchema.optional(),
});

export const scheduledTaskListQuerySchema = z.object({
  status: scheduledTaskStatusSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export const scheduledTaskListRunsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

export const recurringCircleStatusSchema = z.enum([
  "active",
  "paused",
  "archived",
]);

export const recurringCircleVisibilitySchema = z.enum([
  "private",
  "invite_only",
  "discoverable",
]);

export const recurringCircleCadenceSchema = z.object({
  kind: z.literal("weekly"),
  days: z
    .array(z.enum(["sun", "mon", "tue", "wed", "thu", "fri", "sat"]))
    .min(1)
    .max(7),
  hour: z.number().int().min(0).max(23),
  minute: z.number().int().min(0).max(59),
  timezone: z.string().min(1).max(128),
  intervalWeeks: z.number().int().min(1).max(8).default(1),
});

export const recurringCircleCreateBodySchema = z.object({
  title: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
  visibility: recurringCircleVisibilitySchema.default("invite_only"),
  topicTags: z.array(z.string().min(1).max(60)).max(12).default([]),
  targetSize: z.number().int().min(2).max(12).optional(),
  kickoffPrompt: z.string().max(500).optional(),
  cadence: recurringCircleCadenceSchema,
});

export const recurringCircleUpdateBodySchema = z.object({
  title: z.string().min(1).max(120).optional(),
  description: z.string().max(500).optional(),
  visibility: recurringCircleVisibilitySchema.optional(),
  topicTags: z.array(z.string().min(1).max(60)).max(12).optional(),
  targetSize: z.number().int().min(2).max(12).optional(),
  kickoffPrompt: z.string().max(500).optional(),
  cadence: recurringCircleCadenceSchema.optional(),
  status: recurringCircleStatusSchema.optional(),
});

export const recurringCircleListQuerySchema = z.object({
  status: recurringCircleStatusSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export const recurringCircleAddMemberBodySchema = z.object({
  userId: uuidSchema,
  role: z.enum(["owner", "admin", "member"]).default("member"),
});

export const recurringCircleSessionListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

export const savedSearchTypeSchema = z.enum([
  "discovery_people",
  "discovery_groups",
  "reconnects",
  "topic_search",
  "activity_search",
]);

export const savedSearchCreateBodySchema = z.object({
  title: z.string().min(1).max(120),
  searchType: savedSearchTypeSchema,
  queryConfig: z.record(z.string(), z.unknown()),
});

export const savedSearchUpdateBodySchema = z.object({
  title: z.string().min(1).max(120).optional(),
  searchType: savedSearchTypeSchema.optional(),
  queryConfig: z.record(z.string(), z.unknown()).optional(),
});

export const scheduledTaskDispatchJobSchema = queueEnvelopeSchema.extend({
  type: z.literal("ScheduledTaskDispatch"),
  payload: z.object({
    requestedAt: isoDateTimeSchema,
    source: z.enum(["cron", "manual"]).default("cron"),
  }),
});

export const scheduledTaskRunJobSchema = queueEnvelopeSchema.extend({
  type: z.literal("ScheduledTaskRun"),
  payload: z.object({
    scheduledTaskId: uuidSchema,
    scheduledTaskRunId: uuidSchema,
    trigger: z.enum(["scheduled", "manual"]).default("scheduled"),
  }),
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
  accessToken: z.string().min(1).max(4096).optional(),
  rooms: z.array(uuidSchema).max(200).optional(),
  replaySince: isoDateTimeSchema.optional(),
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

export const realtimeChatMessageServerPayloadSchema =
  realtimeChatSendPayloadSchema.extend({
    serverMessageId: uuidSchema,
    sequence: z.number().int().min(1),
    sentAt: isoDateTimeSchema,
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

export const realtimeConnectionRecoveredPayloadSchema = z.object({
  userId: uuidSchema,
  recoveredAt: isoDateTimeSchema,
  roomsJoined: z.array(uuidSchema),
  replaySince: isoDateTimeSchema.optional(),
});

export const realtimeChatReplayPayloadSchema = z.object({
  roomId: uuidSchema,
  replaySince: isoDateTimeSchema.optional(),
  messages: z.array(realtimeChatMessageServerPayloadSchema).max(200),
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
  "connection.recovered": realtimeConnectionRecoveredPayloadSchema,
  "chat.message.created": z.unknown(),
  "chat.message": realtimeChatMessageServerPayloadSchema,
  "chat.replay": realtimeChatReplayPayloadSchema,
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
  ProfilePhotoUploaded: profilePhotoUploadedJobSchema,
  AsyncAgentFollowup: asyncAgentFollowupJobSchema,
  ScheduledTaskDispatch: scheduledTaskDispatchJobSchema,
  ScheduledTaskRun: scheduledTaskRunJobSchema,
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
