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

export const agentTestSuiteLayerSchema = z.enum([
  "contract",
  "workflow",
  "queue",
  "scenario",
  "eval",
  "benchmark",
  "prod-smoke",
  "full",
]);

export const agentTestSuiteFailureClassSchema = z.enum([
  "llm_or_schema",
  "moderation_or_policy",
  "matching_or_negotiation",
  "queue_or_replay",
  "persistence_or_dedupe",
  "notification_or_followup",
  "latency_or_capacity",
  "observability_gap",
]);

export const agenticEvalDimensionSchema = z.enum([
  "correctness",
  "safety",
  "boundedness",
  "tone",
  "usefulness",
  "grounding",
  "policy",
  "observability",
  "outcomes",
  "negotiation",
]);

export const negotiationDomainSchema = z.enum(["social", "commerce"]);
export const negotiationModeSchema = z.enum(["sync", "async"]);
export const negotiationPolicyFlagSchema = z.enum([
  "blocked",
  "reported",
  "under_review",
  "trust_low",
  "suspected_spam",
  "unsafe_goods",
]);

export const negotiationPartySchema = z.object({
  userId: z.string().min(1).max(120).optional(),
  displayName: z.string().min(1).max(120).optional(),
  country: z.string().max(120).optional(),
  city: z.string().max(120).optional(),
  languages: z.array(z.string().min(1).max(32)).default([]),
  trustScore: z.number().min(0).max(100).optional(),
  availabilityMode: z.nativeEnum(UserAvailabilityMode).optional(),
  objectives: z.array(z.string().min(1).max(120)).default([]),
  constraints: z.array(z.string().min(1).max(120)).default([]),
  itemInterests: z.array(z.string().min(1).max(120)).default([]),
  priceRange: z
    .object({
      min: z.number().nonnegative(),
      max: z.number().nonnegative(),
      currency: z.string().min(1).max(16).optional(),
    })
    .optional(),
  askingPrice: z.number().nonnegative().optional(),
});

export const negotiationPacketSchema = z.object({
  id: z.string().min(1).max(120).optional(),
  domain: negotiationDomainSchema.default("social"),
  mode: negotiationModeSchema.default("async"),
  intentSummary: z.string().min(1).max(500),
  requester: negotiationPartySchema,
  counterpart: negotiationPartySchema,
  policyFlags: z.array(negotiationPolicyFlagSchema).default([]),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export const negotiationDecisionSchema = z.enum([
  "propose_intro",
  "defer_async",
  "needs_clarification",
  "decline",
]);

export const negotiationActionSchema = z.object({
  type: z.enum([
    "intro.send_request",
    "followup.schedule",
    "candidate.search",
    "workflow.write",
    "none",
  ]),
  reason: z.string().min(1).max(240),
});

export const negotiationOutcomeSchema = z.object({
  packetId: z.string().min(1).max(120).nullable().default(null),
  domain: negotiationDomainSchema,
  mode: negotiationModeSchema,
  decision: negotiationDecisionSchema,
  confidence: z.number().min(0).max(1),
  summary: z.string().min(1).max(400),
  reasons: z.array(z.string().min(1).max(240)).min(1).max(8),
  nextActions: z.array(negotiationActionSchema).max(4).default([]),
  scoreBreakdown: z.object({
    compatibility: z.number().min(0).max(1),
    trust: z.number().min(0).max(1),
    availability: z.number().min(0).max(1),
    language: z.number().min(0).max(1),
    location: z.number().min(0).max(1),
    constraints: z.number().min(0).max(1),
    offer: z.number().min(0).max(1),
  }),
  bounded: z.boolean().default(true),
  roundsUsed: z.number().int().min(1).max(6).default(1),
});

export const agenticScenarioUserStateSchema = z.object({
  userId: z.string().min(1).max(120),
  availabilityMode: z.nativeEnum(UserAvailabilityMode).optional(),
  country: z.string().max(120).optional(),
  city: z.string().max(120).optional(),
  languages: z.array(z.string().min(1).max(32)).default([]),
  trustScore: z.number().min(0).max(100).optional(),
  blockedUserIds: z.array(z.string().min(1).max(120)).default([]),
  tags: z.array(z.string().min(1).max(64)).default([]),
});

export const agenticScenarioCandidateSchema = z.object({
  userId: z.string().min(1).max(120),
  displayName: z.string().min(1).max(120),
  availabilityMode: z.nativeEnum(UserAvailabilityMode).optional(),
  country: z.string().max(120).optional(),
  city: z.string().max(120).optional(),
  languages: z.array(z.string().min(1).max(32)).default([]),
  trustScore: z.number().min(0).max(100).optional(),
  blocked: z.boolean().optional(),
  sharedTopics: z.array(z.string().min(1).max(120)).default([]),
  priorInteraction: z.boolean().optional(),
});

export const agenticScenarioExpectedSideEffectSchema = z.object({
  relation: z.string().min(1).max(120),
  entityType: z.string().min(1).max(120),
  mode: z
    .enum(["exactly_once", "deduped", "best_effort"])
    .default("best_effort"),
});

export const agenticDomainCoverageDomainSchema = z.enum([
  "social",
  "passive_discovery",
  "groups_and_circles",
  "events_and_reminders",
  "dating_ready",
  "commerce",
  "safety_moderation",
  "eval_runtime",
]);

export const agenticDomainCoverageStatusSchema = z.enum([
  "supported",
  "partial",
  "policy_gated",
]);

export const agenticDomainCoverageEntrySchema = z
  .object({
    domain: agenticDomainCoverageDomainSchema,
    status: agenticDomainCoverageStatusSchema,
    summary: z.string().min(1).max(500),
    scenarioIds: z.array(z.string().min(1).max(120)).default([]),
    releaseGateLayers: z.array(agentTestSuiteLayerSchema).min(1),
    explicitGaps: z.array(z.string().min(1).max(240)).default([]),
  })
  .superRefine((entry, ctx) => {
    if (entry.status === "supported" && entry.scenarioIds.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["scenarioIds"],
        message: "supported domains must reference at least one scenario id",
      });
    }
    if (entry.status !== "supported" && entry.explicitGaps.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["explicitGaps"],
        message:
          "partial/policy-gated domains must declare explicit uncovered gaps",
      });
    }
  });

export const agenticScenarioSchema = z.object({
  id: z.string().min(1).max(120),
  family: z.string().min(1).max(120),
  layerTargets: z.array(agentTestSuiteLayerSchema).min(1),
  utterance: z.string().min(1).max(1000),
  userState: agenticScenarioUserStateSchema,
  candidatePool: z.array(agenticScenarioCandidateSchema).default([]),
  expected: z.object({
    workflowStages: z.array(z.string().min(1).max(120)).default([]),
    sideEffects: z.array(agenticScenarioExpectedSideEffectSchema).default([]),
    followupTemplate: z
      .enum(["pending_reminder", "no_match_yet", "progress_update"])
      .optional(),
    primaryOutcome: z.string().min(1).max(120),
  }),
});

export const agenticScenarioDatasetSchema = z
  .object({
    version: z.literal(1),
    domainCoverage: z.array(agenticDomainCoverageEntrySchema).min(1),
    scenarios: z.array(agenticScenarioSchema).min(1),
  })
  .superRefine((dataset, ctx) => {
    const scenarioIds = new Set(
      dataset.scenarios.map((scenario) => scenario.id),
    );
    const domainValues = new Set(
      dataset.domainCoverage.map((entry) => entry.domain),
    );

    for (const domain of agenticDomainCoverageDomainSchema.options) {
      if (!domainValues.has(domain)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["domainCoverage"],
          message: `missing domainCoverage entry for domain '${domain}'`,
        });
      }
    }

    dataset.domainCoverage.forEach((entry, index) => {
      entry.scenarioIds.forEach((scenarioId, scenarioIndex) => {
        if (!scenarioIds.has(scenarioId)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["domainCoverage", index, "scenarioIds", scenarioIndex],
            message: `unknown scenario id '${scenarioId}'`,
          });
        }
      });
    });
  });

export const agenticSyntheticWorldSchema = z.object({
  version: z.literal(1),
  users: z.array(
    z.object({
      userId: z.string().min(1).max(120),
      displayName: z.string().min(1).max(120),
      country: z.string().max(120).optional(),
      city: z.string().max(120).optional(),
      languages: z.array(z.string().min(1).max(32)).default([]),
      trustScore: z.number().min(0).max(100).optional(),
      availabilityMode: z.nativeEnum(UserAvailabilityMode).optional(),
      tags: z.array(z.string().min(1).max(64)).default([]),
    }),
  ),
  relationships: z.array(
    z.object({
      sourceUserId: z.string().min(1).max(120),
      targetUserId: z.string().min(1).max(120),
      type: z.enum([
        "prior_connection",
        "blocked",
        "reported",
        "reconnect_candidate",
        "dating_candidate",
        "commerce_candidate",
      ]),
    }),
  ),
  opportunities: z.array(
    z.object({
      id: z.string().min(1).max(120),
      type: z.enum([
        "social",
        "reconnect",
        "passive_discovery",
        "dating",
        "commerce",
      ]),
      ownerUserId: z.string().min(1).max(120),
      tags: z.array(z.string().min(1).max(64)).default([]),
    }),
  ),
});

export const agentTestSuiteArtifactCaseSchema = z.object({
  id: z.string().min(1).max(160),
  scenarioId: z.string().min(1).max(120).nullable().default(null),
  scenarioIds: z.array(z.string().min(1).max(120)).default([]),
  workflowRunId: z.string().min(1).max(255).nullable().default(null),
  traceId: z.string().min(1).max(255).nullable().default(null),
  status: z.enum(["passed", "failed", "skipped"]),
  latencyMs: z.number().nonnegative().nullable().default(null),
  failureClass: agentTestSuiteFailureClassSchema.nullable().default(null),
  summary: z.string().max(500).nullable().default(null),
  sideEffects: z.array(z.string().min(1).max(120)).default([]),
});

export const agentTestSuiteArtifactRecordSchema = z.object({
  runId: z.string().min(1).max(120),
  layer: agentTestSuiteLayerSchema,
  checkId: z.string().min(1).max(160),
  summary: z.string().max(500).nullable().default(null),
  scenarioId: z.string().min(1).max(120).nullable().default(null),
  workflowRunId: z.string().min(1).max(255).nullable().default(null),
  traceId: z.string().min(1).max(255).nullable().default(null),
  status: z.enum(["passed", "failed", "skipped"]),
  latencyMs: z.number().nonnegative().nullable().default(null),
  failureClass: agentTestSuiteFailureClassSchema.nullable().default(null),
  sideEffects: z.array(z.string().min(1).max(120)).default([]),
  metrics: z
    .object({
      ackWithinSlo: z.boolean().optional(),
      backgroundFollowupDetected: z.boolean().optional(),
      ackDetectedMs: z.number().nonnegative().nullable().optional(),
      queueLagMs: z.number().nonnegative().nullable().optional(),
      duplicateVisibleSideEffects: z.number().int().nonnegative().optional(),
      duplicateVisibleSideEffectRate: z.number().min(0).max(1).optional(),
      workerIndex: z.number().int().min(1).optional(),
      burstIndex: z.number().int().min(1).optional(),
      concurrency: z.number().int().min(1).optional(),
      burstSize: z.number().int().min(1).optional(),
    })
    .catchall(z.unknown())
    .optional(),
});

const agentTestSuiteArtifactCounterSchema = z.object({
  total: z.number().int().nonnegative(),
  passed: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
});

export const agentTestSuiteArtifactSummarySchema = z.object({
  caseCounts: agentTestSuiteArtifactCounterSchema,
  recordCounts: agentTestSuiteArtifactCounterSchema,
  failureClasses: z
    .record(z.string().min(1).max(64), z.number().int().nonnegative())
    .default({}),
  benchmark: z
    .object({
      runCount: z.number().int().nonnegative(),
      concurrency: z.number().int().min(1).optional(),
      burstSize: z.number().int().min(1).optional(),
      duplicateVisibleSideEffectRate: z.number().min(0).max(1).optional(),
      queueLagP95Ms: z.number().nonnegative().optional(),
    })
    .optional(),
});

export const agentTestSuiteArtifactSchema = z.object({
  runId: z.string().min(1).max(120),
  generatedAt: isoDateTimeSchema,
  layer: agentTestSuiteLayerSchema,
  status: z.enum(["passed", "failed", "skipped"]),
  cases: z.array(agentTestSuiteArtifactCaseSchema),
  records: z.array(agentTestSuiteArtifactRecordSchema).default([]),
  summary: agentTestSuiteArtifactSummarySchema.optional(),
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
  displayName: z.string().min(1).max(120).optional(),
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
  countryPreferences: z.array(z.string().min(2).max(120)).max(10),
  translationOptIn: z.boolean().default(false),
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

export const memoryClassSchema = z.enum([
  "profile_memory",
  "stable_preference",
  "inferred_preference",
  "relationship_history",
  "safety_memory",
  "commerce_memory",
  "interaction_summary",
  "transient_working_memory",
]);

export const memorySourceTypeSchema = z.enum([
  "explicit_user_input",
  "user_profile_edit",
  "interaction_observation",
  "agent_tool",
  "model_inference",
  "system_event",
]);

export const memorySafeWritePolicySchema = z.enum([
  "strict",
  "allow_with_trace",
  "best_effort",
]);

export const memoryContradictionPolicySchema = z.enum([
  "keep_latest",
  "suppress_conflict",
  "append_conflict_note",
]);

export const memoryWriteProvenanceSchema = z.object({
  sourceType: memorySourceTypeSchema,
  sourceId: z.string().min(1).max(255).optional(),
  traceId: z.string().min(1).max(255).optional(),
  workflowRunId: z.string().min(1).max(255).optional(),
  toolName: z.string().min(1).max(120).optional(),
  model: z.string().min(1).max(120).optional(),
  observedAt: isoDateTimeSchema.optional(),
});

export const interactionMemoryWriteSchema = z.object({
  class: memoryClassSchema.optional(),
  key: z.string().min(1).max(160).optional(),
  value: z.string().min(1).max(400).optional(),
  confidence: z.number().min(0).max(1).optional(),
  safeWritePolicy: memorySafeWritePolicySchema.optional(),
  contradictionPolicy: memoryContradictionPolicySchema.optional(),
  compressible: z.boolean().optional(),
  provenance: memoryWriteProvenanceSchema.optional(),
});

export const retrievalInteractionSummaryBodySchema = z.object({
  summary: z.string().min(1).max(4000),
  safe: z.boolean().optional(),
  context: z.record(z.string(), z.unknown()).optional(),
  memory: interactionMemoryWriteSchema.optional(),
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

export const intentDomainSchema = z.enum([
  "social",
  "passive_discovery",
  "group",
  "event",
  "dating",
  "commerce",
]);

export const workflowReplayabilitySchema = z.enum([
  "replayable",
  "partial",
  "inspect_only",
]);

export const workflowStageStatusSchema = z.enum([
  "started",
  "completed",
  "skipped",
  "blocked",
  "degraded",
  "failed",
]);

export const workflowStageStateSchema = z.object({
  stage: z.string().min(1),
  status: workflowStageStatusSchema,
  reason: z.string().min(1).optional(),
});

export const workflowSideEffectIntegritySchema = z.object({
  sideEffectCount: z.number().int().nonnegative(),
  dedupedSideEffectCount: z.number().int().nonnegative(),
  reusedRelations: z.array(z.string().min(1)).default([]),
});

export const createRuntimeIntentBodySchema = z.object({
  userId: uuidSchema,
  rawText: z.string().min(1),
  domain: intentDomainSchema,
  agentThreadId: uuidSchema.optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const intentResponseSchema = z.object({
  intentId: uuidSchema,
  domain: intentDomainSchema,
  status: z.string().min(1),
  workflowRunId: z.string().min(1),
  traceId: z.string().min(1),
  replayability: workflowReplayabilitySchema,
  stage: workflowStageStateSchema,
  sideEffectIntegrity: workflowSideEffectIntegritySchema,
});

export const datingVerificationStateSchema = z.enum([
  "unverified",
  "verified",
  "rejected",
]);

export const datingConsentStateSchema = z.enum([
  "granted",
  "revoked",
  "pending",
]);

export const datingConsentScopeSchema = z.enum([
  "dm_intro",
  "group_intro",
  "event_intro",
]);

export const createDatingConsentBodySchema = z.object({
  userId: uuidSchema,
  targetUserId: uuidSchema,
  scope: datingConsentScopeSchema,
  consentState: datingConsentStateSchema,
  verificationState: datingVerificationStateSchema.default("verified"),
  reason: z.string().min(1).max(500).optional(),
  expiresAt: isoDateTimeSchema.optional(),
});

export const datingConsentResponseSchema = z.object({
  consentId: z.string().min(1),
  userId: uuidSchema,
  targetUserId: uuidSchema,
  scope: datingConsentScopeSchema,
  consentState: datingConsentStateSchema,
  verificationState: datingVerificationStateSchema,
  workflowRunId: z.string().min(1),
  traceId: z.string().min(1),
  replayability: workflowReplayabilitySchema,
});

export const commerceListingStateSchema = z.enum([
  "active",
  "paused",
  "removed",
  "fulfilled",
]);

export const createCommerceListingBodySchema = z.object({
  sellerUserId: uuidSchema,
  title: z.string().min(1).max(160),
  description: z.string().max(2_000).optional(),
  category: z.string().min(1).max(80),
  price: z.number().nonnegative(),
  currency: z.string().min(1).max(16),
  quantity: z.number().int().positive().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const commerceListingResponseSchema = z.object({
  listingId: z.string().min(1),
  sellerUserId: uuidSchema,
  state: commerceListingStateSchema,
  workflowRunId: z.string().min(1),
  traceId: z.string().min(1),
  replayability: workflowReplayabilitySchema,
});

export const commerceOfferStateSchema = z.enum([
  "proposed",
  "countered",
  "accepted",
  "rejected",
  "expired",
  "cancelled",
  "escrowed",
  "fulfilled",
  "disputed",
]);

export const commerceEscrowStateSchema = z.enum([
  "not_started",
  "pending_funding",
  "funded",
  "released",
  "refunded",
  "frozen",
]);

export const createCommerceOfferBodySchema = z.object({
  buyerUserId: uuidSchema,
  sellerUserId: uuidSchema,
  listingId: z.string().min(1),
  offerPrice: z.number().nonnegative(),
  currency: z.string().min(1).max(16),
  message: z.string().max(1_000).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const respondCommerceOfferBodySchema = z.object({
  actorUserId: uuidSchema,
  action: z.enum([
    "accept",
    "reject",
    "counter",
    "dispute",
    "fulfill",
    "cancel",
  ]),
  counterPrice: z.number().nonnegative().optional(),
  reason: z.string().max(500).optional(),
});

export const commerceOfferResponseSchema = z.object({
  offerId: z.string().min(1),
  listingId: z.string().min(1),
  buyerUserId: uuidSchema,
  sellerUserId: uuidSchema,
  state: commerceOfferStateSchema,
  escrowState: commerceEscrowStateSchema,
  workflowRunId: z.string().min(1),
  traceId: z.string().min(1),
  replayability: workflowReplayabilitySchema,
});

export const workflowRunResponseSchema = z.object({
  workflowRunId: z.string().min(1),
  traceId: z.string().nullable(),
  domain: z.string().nullable(),
  replayability: workflowReplayabilitySchema,
  health: z.enum(["healthy", "watch", "critical"]),
  stages: z.array(
    z.object({
      stage: z.string().min(1),
      status: workflowStageStatusSchema,
      at: isoDateTimeSchema,
      summary: z.string().nullable(),
    }),
  ),
  sideEffects: z.array(
    z.object({
      relation: z.string().min(1),
      entityType: z.string().min(1),
      entityId: z.string().min(1),
      at: isoDateTimeSchema,
      summary: z.string().nullable(),
    }),
  ),
  integrity: workflowSideEffectIntegritySchema,
});

export const searchQuerySchema = z.object({
  q: z.string().min(1).max(120),
  limit: z.coerce.number().int().min(1).max(20).optional(),
});

export const onboardingInferenceSourceSchema = z.enum([
  "voice",
  "manual",
  "inferred",
]);

export const onboardingInferenceFieldMetaSchema = z.object({
  source: onboardingInferenceSourceSchema,
  confidence: z.number().min(0).max(1),
  needsConfirmation: z.boolean(),
});

export const onboardingInferBodySchema = z.object({
  userId: uuidSchema,
  transcript: z.string().min(1).max(4_000),
});

export const onboardingActivationPlanBodySchema = z.object({
  userId: uuidSchema,
  firstIntentText: z.string().min(1).max(800).optional(),
  summary: z.string().min(1).max(1_200).optional(),
  persona: z.string().min(1).max(120).optional(),
  goals: z.array(z.string().min(1).max(120)).max(8).optional(),
  interests: z.array(z.string().min(1).max(120)).max(12).optional(),
  city: z.string().max(120).optional(),
  country: z.string().max(120).optional(),
  socialMode: z.enum(["one_to_one", "group", "either"]).optional(),
});

export const onboardingActivationPlanResponseSchema = z.object({
  state: z.enum(["idle", "pending", "ready", "failed"]),
  source: z.enum(["llm", "fallback"]),
  summary: z.string().min(1),
  recommendedAction: z.object({
    kind: z.enum(["agent_thread_seed", "intent_create"]),
    label: z.string().min(1),
    text: z.string().min(1),
  }),
});

export const onboardingInferenceLifecycleStateSchema = z.enum([
  "infer-started",
  "infer-processing",
  "infer-success",
  "infer-fallback",
]);

export const onboardingInferenceLifecycleSchema = z.object({
  current: onboardingInferenceLifecycleStateSchema,
  transitions: z.array(onboardingInferenceLifecycleStateSchema).min(1).max(4),
});

export const onboardingQuickInferResponseSchema = z.object({
  transcript: z.string().min(1),
  interests: z.array(z.string().min(1)).max(8).default([]),
  goals: z.array(z.string().min(1)).max(6).default([]),
  summary: z.string().min(1),
  firstIntent: z.string().min(1),
  followUpQuestion: z.string().optional(),
  lifecycle: onboardingInferenceLifecycleSchema.optional(),
});

export const onboardingInferResponseSchema = z.object({
  transcript: z.string().min(1),
  interests: z.array(z.string().min(1)).max(12),
  goals: z.array(z.string().min(1)).max(8),
  mode: z.enum(["social", "dating", "both"]),
  format: z.enum(["one_to_one", "small_groups", "both"]),
  style: z.enum(["Chill", "Spontaneous", "Planned", "Focused", "Outgoing"]),
  availability: z.enum(["Right now", "Evenings", "Weekends", "Flexible"]),
  area: z.string().default(""),
  country: z.string().default(""),
  summary: z.string().min(1),
  persona: z.string().min(1),
  firstIntent: z.string().min(1),
  followUpQuestion: z.string().optional(),
  inferenceMeta: z.object({
    goals: onboardingInferenceFieldMetaSchema,
    interests: onboardingInferenceFieldMetaSchema,
    format: onboardingInferenceFieldMetaSchema,
    mode: onboardingInferenceFieldMetaSchema,
    style: onboardingInferenceFieldMetaSchema,
    availability: onboardingInferenceFieldMetaSchema,
    location: onboardingInferenceFieldMetaSchema,
    firstIntent: onboardingInferenceFieldMetaSchema,
    persona: onboardingInferenceFieldMetaSchema,
  }),
  lifecycle: onboardingInferenceLifecycleSchema.optional(),
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

export const adminAgentActionDebugQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  status: z.enum(["executed", "denied", "failed"]).optional(),
  tool: z.string().min(1).max(80).optional(),
  actorUserId: uuidSchema.optional(),
  threadId: uuidSchema.optional(),
  traceId: z.string().min(1).max(120).optional(),
});

export const adminVerificationRunIngestBodySchema = z.object({
  runId: z.string().min(1).max(160),
  lane: z.enum(["suite", "verification", "prod-smoke"]).default("suite"),
  layer: agentTestSuiteLayerSchema,
  status: z.enum(["passed", "failed", "skipped"]),
  generatedAt: isoDateTimeSchema.optional(),
  canaryVerdict: z.enum(["healthy", "watch", "critical"]).optional(),
  summary: z.record(z.string(), z.unknown()).optional(),
  artifact: z.record(z.string(), z.unknown()).optional(),
});

export const adminVerificationRunListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  lane: z.enum(["suite", "verification", "prod-smoke"]).optional(),
  status: z.enum(["passed", "failed", "skipped"]).optional(),
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
