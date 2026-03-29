import { Injectable, Logger, Optional } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { AnalyticsService } from "../analytics/analytics.service.js";
import { PrismaService } from "../database/prisma.service.js";

export interface RuleDecisionInput {
  safetyAllowed: boolean;
  hardRuleAllowed: boolean;
  productPolicyAllowed: boolean;
  overrideAllowed: boolean;
  learnedPreferenceAllowed: boolean;
  rankingAllowed: boolean;
}

export interface GlobalRules {
  whoCanContact: "anyone" | "verified_only" | "trusted_only";
  reachable: "always" | "available_only" | "do_not_disturb";
  intentMode: "one_to_one" | "group" | "balanced";
  modality: "online" | "offline" | "either";
  languagePreferences: string[];
  countryPreferences: string[];
  translationOptIn: boolean;
  timezone: string;
  requireVerifiedUsers: boolean;
  notificationMode: "immediate" | "digest" | "quiet";
  agentAutonomy: "manual" | "suggest_only" | "auto_non_risky";
  memoryMode: "minimal" | "standard" | "extended";
  dmGroupMemoryIngestionEnabled: boolean;
  agentChatMemoryIngestionEnabled: boolean;
  memoryInferenceStrictness: "conservative" | "standard" | "permissive";
}

export type LifeGraphNodeType =
  | "activity"
  | "topic"
  | "game"
  | "person"
  | "schedule_preference"
  | "location_cluster";

export type LifeGraphEdgeType =
  | "likes"
  | "avoids"
  | "prefers"
  | "recently_engaged_with"
  | "high_success_with";

interface LifeGraphNodeInput {
  nodeType: LifeGraphNodeType;
  label: string;
}

export interface SetExplicitLifeGraphEdgeInput {
  edgeType: LifeGraphEdgeType;
  targetNode: LifeGraphNodeInput;
  sourceNode?: LifeGraphNodeInput;
  weight?: number;
}

export interface RecordLifeGraphBehaviorSignalInput {
  edgeType: LifeGraphEdgeType;
  targetNode: LifeGraphNodeInput;
  sourceNode?: LifeGraphNodeInput;
  signalStrength: number;
  feedbackType: string;
  context?: Record<string, unknown>;
}

export type MemoryClass =
  | "profile_memory"
  | "stable_preference"
  | "inferred_preference"
  | "relationship_history"
  | "safety_memory"
  | "commerce_memory"
  | "interaction_summary"
  | "transient_working_memory";

export type MemoryGovernanceTier = "explicit_only" | "inferable" | "ephemeral";

export type MemoryDomain =
  | "profile"
  | "preference"
  | "relationship"
  | "safety"
  | "commerce"
  | "interaction";

export type MemorySourceSurface =
  | "agent_chat"
  | "dm_chat"
  | "group_chat"
  | "workflow_event"
  | "system_event"
  | "profile_edit";

export type MemorySourceType =
  | "explicit_user_input"
  | "user_profile_edit"
  | "interaction_observation"
  | "agent_tool"
  | "model_inference"
  | "system_event";

export type MemorySafeWritePolicy =
  | "strict"
  | "allow_with_trace"
  | "best_effort";

export type MemoryContradictionPolicy =
  | "keep_latest"
  | "suppress_conflict"
  | "append_conflict_note";

export interface MemoryWriteProvenance {
  sourceType: MemorySourceType;
  sourceSurface?: MemorySourceSurface;
  sourceId?: string;
  sourceEntityId?: string;
  messageId?: string;
  chatId?: string;
  threadId?: string;
  actorUserIds?: string[];
  traceId?: string;
  workflowRunId?: string;
  toolName?: string;
  model?: string;
  observedAt?: string;
}

export interface MemoryConsentContext {
  basis:
    | "default_allow"
    | "explicit_user_message"
    | "profile_edit"
    | "user_opt_in"
    | "user_opt_out";
  explicit: boolean;
  sourceText?: string;
}

export interface MemoryModerationContext {
  decision: "clean" | "flagged" | "review" | "blocked";
  reasonTokens?: string[];
}

export interface InteractionMemoryWriteInput {
  class?: MemoryClass;
  governanceTier?: MemoryGovernanceTier;
  key?: string;
  value?: string;
  confidence?: number;
  safeWritePolicy?: MemorySafeWritePolicy;
  contradictionPolicy?: MemoryContradictionPolicy;
  compressible?: boolean;
  consent?: MemoryConsentContext;
  moderation?: MemoryModerationContext;
  provenance?: MemoryWriteProvenance;
}

export interface StoreInteractionSummaryInput {
  summary: string;
  safe?: boolean;
  context?: Record<string, unknown>;
  memory?: InteractionMemoryWriteInput;
}

export interface RetrievePersonalizationContextInput {
  query: string;
  maxChunks?: number;
  maxAgeDays?: number;
}

const GLOBAL_RULE_DEFAULTS: GlobalRules = {
  whoCanContact: "anyone",
  reachable: "always",
  intentMode: "balanced",
  modality: "either",
  languagePreferences: [],
  countryPreferences: [],
  translationOptIn: false,
  timezone: "UTC",
  requireVerifiedUsers: false,
  notificationMode: "immediate",
  agentAutonomy: "suggest_only",
  memoryMode: "standard",
  dmGroupMemoryIngestionEnabled: true,
  agentChatMemoryIngestionEnabled: true,
  memoryInferenceStrictness: "standard",
};

const GLOBAL_RULE_PREF_KEYS: Record<keyof GlobalRules, string> = {
  whoCanContact: "global_rules_who_can_contact",
  reachable: "global_rules_reachable",
  intentMode: "global_rules_intent_mode",
  modality: "global_rules_modality",
  languagePreferences: "global_rules_language_preferences",
  countryPreferences: "global_rules_country_preferences",
  translationOptIn: "global_rules_translation_opt_in",
  timezone: "global_rules_timezone",
  requireVerifiedUsers: "global_rules_require_verified_users",
  notificationMode: "global_rules_notification_mode",
  agentAutonomy: "global_rules_agent_autonomy",
  memoryMode: "global_rules_memory_mode",
  dmGroupMemoryIngestionEnabled: "global_rules_dm_group_memory_ingestion",
  agentChatMemoryIngestionEnabled: "global_rules_agent_chat_memory_ingestion",
  memoryInferenceStrictness: "global_rules_memory_inference_strictness",
};

const LIFE_GRAPH_PREF_SCOPE = "life_graph_edge";
const LIFE_GRAPH_PREF_KEY_PREFIX = "life_graph_edge:";
const INFERRED_BLEND_FACTOR = 0.35;
const INFERRED_CONFIDENCE_FACTOR = 0.3;
const DEFAULT_EXPLICIT_EDGE_WEIGHTS: Record<LifeGraphEdgeType, number> = {
  likes: 0.8,
  avoids: -0.8,
  prefers: 0.7,
  recently_engaged_with: 0.5,
  high_success_with: 0.9,
};
const GAME_LABEL_KEYWORDS = [
  "apex",
  "valorant",
  "fortnite",
  "minecraft",
  "league of legends",
  "dota",
  "counter-strike",
  "cs2",
  "overwatch",
  "rocket league",
  "pubg",
  "warzone",
  "call of duty",
  "fifa",
  "ea fc",
];
const RETRIEVAL_DOC_TYPE_PROFILE_SUMMARY = "profile_summary";
const RETRIEVAL_DOC_TYPE_PREFERENCE_MEMORY = "preference_memory";
const RETRIEVAL_DOC_TYPE_INTERACTION_SUMMARY = "interaction_summary";
const RETRIEVAL_DOC_TYPE_INTERACTION_FLAGGED = "interaction_summary_flagged";
const RETRIEVAL_DOC_TYPE_RELATIONSHIP_MEMORY = "relationship_memory";
const RETRIEVAL_DOC_TYPE_SAFETY_MEMORY = "safety_memory";
const RETRIEVAL_DOC_TYPE_COMMERCE_MEMORY = "commerce_memory";
const RETRIEVAL_SAFE_DOC_TYPES = [
  RETRIEVAL_DOC_TYPE_PROFILE_SUMMARY,
  RETRIEVAL_DOC_TYPE_PREFERENCE_MEMORY,
  RETRIEVAL_DOC_TYPE_INTERACTION_SUMMARY,
  RETRIEVAL_DOC_TYPE_RELATIONSHIP_MEMORY,
  RETRIEVAL_DOC_TYPE_SAFETY_MEMORY,
  RETRIEVAL_DOC_TYPE_COMMERCE_MEMORY,
] as const;
const RETRIEVAL_DEFAULT_MAX_CHUNKS = 5;
const RETRIEVAL_DEFAULT_MAX_AGE_DAYS = 30;
const RETRIEVAL_MAX_DOC_SCAN = 50;
const RETRIEVAL_CHUNK_WORD_TARGET = 90;
const RETRIEVAL_BUNDLE_MAX_CHARS = 1_200;
const MEMORY_MIN_CONFIDENCE_BY_CLASS: Record<MemoryClass, number> = {
  profile_memory: 0.5,
  stable_preference: 0.7,
  inferred_preference: 0.35,
  relationship_history: 0.25,
  safety_memory: 0.65,
  commerce_memory: 0.6,
  interaction_summary: 0,
  transient_working_memory: 0,
};
const MEMORY_TRACE_REQUIRED_CLASSES = new Set<MemoryClass>([
  "stable_preference",
  "safety_memory",
  "commerce_memory",
]);
const DEFAULT_MEMORY_CLASS: MemoryClass = "interaction_summary";
const MEMORY_CLASS_GOVERNANCE_TIER: Record<MemoryClass, MemoryGovernanceTier> =
  {
    profile_memory: "explicit_only",
    stable_preference: "explicit_only",
    inferred_preference: "inferable",
    relationship_history: "inferable",
    safety_memory: "explicit_only",
    commerce_memory: "inferable",
    interaction_summary: "inferable",
    transient_working_memory: "ephemeral",
  };
const DEFAULT_MEMORY_SAFE_WRITE_POLICY: MemorySafeWritePolicy =
  "allow_with_trace";
const DEFAULT_MEMORY_CONTRADICTION_POLICY: MemoryContradictionPolicy =
  "append_conflict_note";
const RETRIEVAL_UNSAFE_PATTERN =
  /\b(hate|threat|abuse|violence|self-harm|suicide)\b/i;
const DEFAULT_MEMORY_SOURCE_SURFACE: MemorySourceSurface = "system_event";

@Injectable()
export class PersonalizationService {
  private readonly logger = new Logger(PersonalizationService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional()
    private readonly analyticsService?: AnalyticsService,
  ) {}

  decide(input: RuleDecisionInput): boolean {
    if (!input.safetyAllowed) return false;
    if (!input.hardRuleAllowed) return false;
    if (!input.productPolicyAllowed) return false;
    if (!input.overrideAllowed) return false;
    if (!input.learnedPreferenceAllowed) return false;
    return input.rankingAllowed;
  }

  async explainDecision(
    userId: string,
    input: RuleDecisionInput,
    context: Record<string, unknown> = {},
  ) {
    const orderedChecks = [
      {
        order: 1,
        rule: "safety_rules",
        allowed: input.safetyAllowed,
      },
      {
        order: 2,
        rule: "hard_user_rules",
        allowed: input.hardRuleAllowed,
      },
      {
        order: 3,
        rule: "product_policy",
        allowed: input.productPolicyAllowed,
      },
      {
        order: 4,
        rule: "intent_specific_overrides",
        allowed: input.overrideAllowed,
      },
      {
        order: 5,
        rule: "learned_preferences",
        allowed: input.learnedPreferenceAllowed,
      },
      {
        order: 6,
        rule: "ranking_heuristics",
        allowed: input.rankingAllowed,
      },
    ] as const;
    const blockedStep = orderedChecks.find((step) => !step.allowed) ?? null;

    return {
      userId,
      decision: blockedStep == null,
      blockedBy: blockedStep?.rule ?? null,
      precedence: orderedChecks,
      context,
      globalRules: await this.getGlobalRules(userId),
      evaluatedAt: new Date().toISOString(),
    };
  }

  async getGlobalRules(userId: string): Promise<GlobalRules> {
    const prefs = await this.prisma.userPreference.findMany({
      where: {
        userId,
        key: { in: Object.values(GLOBAL_RULE_PREF_KEYS) },
      },
      select: {
        key: true,
        value: true,
      },
    });

    const byKey = new Map(prefs.map((pref) => [pref.key, pref.value]));

    return {
      whoCanContact:
        this.readEnumValue(byKey.get(GLOBAL_RULE_PREF_KEYS.whoCanContact), [
          "anyone",
          "verified_only",
          "trusted_only",
        ]) ?? GLOBAL_RULE_DEFAULTS.whoCanContact,
      reachable:
        this.readEnumValue(byKey.get(GLOBAL_RULE_PREF_KEYS.reachable), [
          "always",
          "available_only",
          "do_not_disturb",
        ]) ?? GLOBAL_RULE_DEFAULTS.reachable,
      intentMode:
        this.readEnumValue(byKey.get(GLOBAL_RULE_PREF_KEYS.intentMode), [
          "one_to_one",
          "group",
          "balanced",
        ]) ?? GLOBAL_RULE_DEFAULTS.intentMode,
      modality:
        this.readEnumValue(byKey.get(GLOBAL_RULE_PREF_KEYS.modality), [
          "online",
          "offline",
          "either",
        ]) ?? GLOBAL_RULE_DEFAULTS.modality,
      languagePreferences:
        this.readStringArrayValue(
          byKey.get(GLOBAL_RULE_PREF_KEYS.languagePreferences),
        ) ?? GLOBAL_RULE_DEFAULTS.languagePreferences,
      countryPreferences:
        this.readStringArrayValue(
          byKey.get(GLOBAL_RULE_PREF_KEYS.countryPreferences),
        ) ?? GLOBAL_RULE_DEFAULTS.countryPreferences,
      translationOptIn:
        this.readBooleanValue(
          byKey.get(GLOBAL_RULE_PREF_KEYS.translationOptIn),
        ) ?? GLOBAL_RULE_DEFAULTS.translationOptIn,
      requireVerifiedUsers:
        this.readBooleanValue(
          byKey.get(GLOBAL_RULE_PREF_KEYS.requireVerifiedUsers),
        ) ?? GLOBAL_RULE_DEFAULTS.requireVerifiedUsers,
      notificationMode:
        this.readEnumValue(byKey.get(GLOBAL_RULE_PREF_KEYS.notificationMode), [
          "immediate",
          "digest",
          "quiet",
        ]) ?? GLOBAL_RULE_DEFAULTS.notificationMode,
      agentAutonomy:
        this.readEnumValue(byKey.get(GLOBAL_RULE_PREF_KEYS.agentAutonomy), [
          "manual",
          "suggest_only",
          "auto_non_risky",
        ]) ?? GLOBAL_RULE_DEFAULTS.agentAutonomy,
      memoryMode:
        this.readEnumValue(byKey.get(GLOBAL_RULE_PREF_KEYS.memoryMode), [
          "minimal",
          "standard",
          "extended",
        ]) ?? GLOBAL_RULE_DEFAULTS.memoryMode,
      dmGroupMemoryIngestionEnabled:
        this.readBooleanValue(
          byKey.get(GLOBAL_RULE_PREF_KEYS.dmGroupMemoryIngestionEnabled),
        ) ?? GLOBAL_RULE_DEFAULTS.dmGroupMemoryIngestionEnabled,
      agentChatMemoryIngestionEnabled:
        this.readBooleanValue(
          byKey.get(GLOBAL_RULE_PREF_KEYS.agentChatMemoryIngestionEnabled),
        ) ?? GLOBAL_RULE_DEFAULTS.agentChatMemoryIngestionEnabled,
      memoryInferenceStrictness:
        this.readEnumValue(
          byKey.get(GLOBAL_RULE_PREF_KEYS.memoryInferenceStrictness),
          ["conservative", "standard", "permissive"],
        ) ?? GLOBAL_RULE_DEFAULTS.memoryInferenceStrictness,
      timezone:
        this.readStringValue(byKey.get(GLOBAL_RULE_PREF_KEYS.timezone)) ??
        GLOBAL_RULE_DEFAULTS.timezone,
    };
  }

  async setGlobalRules(userId: string, rules: GlobalRules) {
    await Promise.all(
      (Object.keys(GLOBAL_RULE_PREF_KEYS) as Array<keyof GlobalRules>).map(
        (ruleKey) =>
          this.upsertUserPreference(
            userId,
            GLOBAL_RULE_PREF_KEYS[ruleKey],
            rules[ruleKey],
          ),
      ),
    );

    await Promise.all([
      this.setExplicitLifeGraphEdge(userId, {
        edgeType: "prefers",
        targetNode: {
          nodeType: "schedule_preference",
          label: `reachability:${rules.reachable}`,
        },
        weight: 0.6,
      }),
      this.setExplicitLifeGraphEdge(userId, {
        edgeType: "prefers",
        targetNode: {
          nodeType: "schedule_preference",
          label: `intent_mode:${rules.intentMode}`,
        },
        weight: 0.5,
      }),
      this.setExplicitLifeGraphEdge(userId, {
        edgeType: "prefers",
        targetNode: {
          nodeType: "location_cluster",
          label:
            rules.modality === "offline"
              ? "local:offline_preferred"
              : rules.modality === "online"
                ? "remote:online_preferred"
                : "hybrid:modality_flexible",
        },
        weight: 0.45,
      }),
    ]);

    await this.refreshPreferenceMemoryDocument(userId);
    await this.trackAnalyticsEventSafe({
      eventType: "personalization_change",
      actorUserId: userId,
      entityType: "global_rules",
      entityId: userId,
      properties: {
        changeType: "global_rules",
      },
    });

    return this.getGlobalRules(userId);
  }

  async patchGlobalRules(userId: string, patch: Partial<GlobalRules>) {
    const current = await this.getGlobalRules(userId);
    const merged: GlobalRules = {
      ...current,
      ...patch,
    };
    return this.setGlobalRules(userId, merged);
  }

  async upsertLifeGraphNodes(userId: string, nodes: LifeGraphNodeInput[]) {
    const deduped = this.deduplicateNodes(nodes);
    const materialized = [];

    for (const node of deduped) {
      materialized.push(
        await this.ensureLifeGraphNode(userId, node.nodeType, node.label),
      );
    }
    await this.trackAnalyticsEventSafe({
      eventType: "personalization_change",
      actorUserId: userId,
      entityType: "life_graph_node",
      properties: {
        changeType: "life_graph_nodes",
        nodeCount: materialized.length,
      },
    });

    return materialized;
  }

  async getLifeGraph(userId: string) {
    const [nodes, edges, explicitPreferences, inferredPreferences] =
      await Promise.all([
        this.prisma.lifeGraphNode.findMany({
          where: { userId },
          orderBy: [{ nodeType: "asc" }, { label: "asc" }],
        }),
        this.prisma.lifeGraphEdge.findMany({
          where: { userId },
          orderBy: [{ updatedAt: "desc" }],
        }),
        this.prisma.explicitPreference.findMany({
          where: {
            userId,
            scope: LIFE_GRAPH_PREF_SCOPE,
          },
          select: {
            preferenceKey: true,
            value: true,
            updatedAt: true,
          },
        }),
        this.prisma.inferredPreference.findMany({
          where: {
            userId,
            preferenceKey: { startsWith: LIFE_GRAPH_PREF_KEY_PREFIX },
          },
          select: {
            preferenceKey: true,
            value: true,
            confidence: true,
            sourceSignal: true,
            updatedAt: true,
          },
        }),
      ]);

    const nodesById = new Map(nodes.map((node) => [node.id, node]));
    const explicitByKey = new Map(
      explicitPreferences.map((pref) => [pref.preferenceKey, pref]),
    );
    const inferredByKey = new Map(
      inferredPreferences.map((pref) => [pref.preferenceKey, pref]),
    );

    return {
      userId,
      nodes,
      edges: edges.map((edge) => {
        const prefKey = this.buildEdgePreferenceKey(
          edge.sourceNodeId,
          edge.edgeType as LifeGraphEdgeType,
          edge.targetNodeId,
        );
        const explicit = explicitByKey.get(prefKey);
        const inferred = inferredByKey.get(prefKey);

        return {
          id: edge.id,
          edgeType: edge.edgeType,
          sourceNodeId: edge.sourceNodeId,
          targetNodeId: edge.targetNodeId,
          sourceNode: nodesById.get(edge.sourceNodeId) ?? null,
          targetNode: nodesById.get(edge.targetNodeId) ?? null,
          weight: Number(edge.weight),
          updatedAt: edge.updatedAt,
          sources: {
            explicitWeight: this.readWeightFromPreferenceValue(explicit?.value),
            explicitUpdatedAt: explicit?.updatedAt ?? null,
            inferredWeight: this.readWeightFromPreferenceValue(inferred?.value),
            inferredConfidence:
              inferred == null
                ? null
                : this.clampNumber(Number(inferred.confidence), 0, 1),
            inferredSourceSignal: inferred?.sourceSignal ?? null,
            inferredUpdatedAt: inferred?.updatedAt ?? null,
          },
        };
      }),
    };
  }

  async setExplicitLifeGraphEdge(
    userId: string,
    input: SetExplicitLifeGraphEdgeInput,
  ) {
    const sourceNode = input.sourceNode
      ? await this.ensureLifeGraphNode(
          userId,
          input.sourceNode.nodeType,
          input.sourceNode.label,
        )
      : await this.ensureUserAnchorNode(userId);
    const targetNode = await this.ensureLifeGraphNode(
      userId,
      input.targetNode.nodeType,
      input.targetNode.label,
    );

    const explicitWeight = this.clampNumber(
      input.weight ?? DEFAULT_EXPLICIT_EDGE_WEIGHTS[input.edgeType],
      -1,
      1,
    );
    const edgePreferenceKey = this.buildEdgePreferenceKey(
      sourceNode.id,
      input.edgeType,
      targetNode.id,
    );

    const explicitPreference = await this.upsertExplicitLifeGraphPreference(
      userId,
      edgePreferenceKey,
      {
        edgeType: input.edgeType,
        sourceNodeId: sourceNode.id,
        targetNodeId: targetNode.id,
        source: "explicit",
        weight: explicitWeight,
        updatedAt: new Date().toISOString(),
      },
    );

    await this.prisma.preferenceFeedbackEvent.create({
      data: {
        userId,
        preferenceKey: edgePreferenceKey,
        feedbackType: "explicit_edge_updated",
        signalStrength: explicitWeight,
        context: this.toInputJsonValue({
          edgeType: input.edgeType,
          sourceNodeId: sourceNode.id,
          targetNodeId: targetNode.id,
        }),
      },
    });

    const edge = await this.recomputeLifeGraphEdge({
      userId,
      sourceNodeId: sourceNode.id,
      targetNodeId: targetNode.id,
      edgeType: input.edgeType,
      explicitPreference,
    });
    await this.trackAnalyticsEventSafe({
      eventType: "personalization_change",
      actorUserId: userId,
      entityType: "life_graph_edge",
      entityId: edge.id,
      properties: {
        changeType: "life_graph_edge",
        edgeType: input.edgeType,
        sourceNodeId: sourceNode.id,
        targetNodeId: targetNode.id,
      },
    });
    return edge;
  }

  async recordBehaviorSignal(
    userId: string,
    input: RecordLifeGraphBehaviorSignalInput,
  ) {
    const sourceNode = input.sourceNode
      ? await this.ensureLifeGraphNode(
          userId,
          input.sourceNode.nodeType,
          input.sourceNode.label,
        )
      : await this.ensureUserAnchorNode(userId);
    const targetNode = await this.ensureLifeGraphNode(
      userId,
      input.targetNode.nodeType,
      input.targetNode.label,
    );

    const normalizedSignal = this.clampNumber(input.signalStrength, -1, 1);
    const edgePreferenceKey = this.buildEdgePreferenceKey(
      sourceNode.id,
      input.edgeType,
      targetNode.id,
    );

    const existing = await this.prisma.inferredPreference.findFirst({
      where: {
        userId,
        preferenceKey: edgePreferenceKey,
      },
    });
    const previousWeight = this.readWeightFromPreferenceValue(existing?.value);
    const nextWeight = this.clampNumber(
      previousWeight == null
        ? normalizedSignal
        : previousWeight * (1 - INFERRED_BLEND_FACTOR) +
            normalizedSignal * INFERRED_BLEND_FACTOR,
      -1,
      1,
    );
    const previousConfidence =
      existing == null
        ? 0
        : this.clampNumber(Number(existing.confidence), 0, 1);
    const nextConfidence = this.clampNumber(
      previousConfidence * (1 - INFERRED_CONFIDENCE_FACTOR) +
        Math.abs(normalizedSignal) * INFERRED_CONFIDENCE_FACTOR,
      0,
      1,
    );

    const inferredPreference = existing
      ? await this.prisma.inferredPreference.update({
          where: { id: existing.id },
          data: {
            value: this.toInputJsonValue({
              edgeType: input.edgeType,
              sourceNodeId: sourceNode.id,
              targetNodeId: targetNode.id,
              source: "inferred",
              signal: normalizedSignal,
              weight: nextWeight,
              feedbackType: input.feedbackType,
              updatedAt: new Date().toISOString(),
            }),
            confidence: nextConfidence,
            sourceSignal: input.feedbackType,
          },
        })
      : await this.prisma.inferredPreference.create({
          data: {
            userId,
            preferenceKey: edgePreferenceKey,
            value: this.toInputJsonValue({
              edgeType: input.edgeType,
              sourceNodeId: sourceNode.id,
              targetNodeId: targetNode.id,
              source: "inferred",
              signal: normalizedSignal,
              weight: nextWeight,
              feedbackType: input.feedbackType,
              updatedAt: new Date().toISOString(),
            }),
            confidence: nextConfidence,
            sourceSignal: input.feedbackType,
          },
        });

    await this.prisma.preferenceFeedbackEvent.create({
      data: {
        userId,
        preferenceKey: edgePreferenceKey,
        feedbackType: input.feedbackType,
        signalStrength: normalizedSignal,
        context:
          input.context == null
            ? undefined
            : this.toInputJsonValue(input.context),
      },
    });

    return this.recomputeLifeGraphEdge({
      userId,
      sourceNodeId: sourceNode.id,
      targetNodeId: targetNode.id,
      edgeType: input.edgeType,
      inferredPreference,
    });
  }

  async recordIntentSignals(
    userId: string,
    parsedIntent: {
      intentType?: string;
      modality?: string;
      topics?: string[];
      activities?: string[];
      timingConstraints?: string[];
    },
  ) {
    const updates: Array<Promise<unknown>> = [];

    for (const topic of this.uniqueNormalizedLabels(
      parsedIntent.topics ?? [],
    )) {
      updates.push(
        this.recordBehaviorSignal(userId, {
          edgeType: "recently_engaged_with",
          targetNode: { nodeType: "topic", label: topic },
          signalStrength: 0.45,
          feedbackType: "intent_topic_mentioned",
          context: {
            intentType: parsedIntent.intentType ?? null,
          },
        }),
      );
    }

    for (const activity of this.uniqueNormalizedLabels(
      parsedIntent.activities ?? [],
    )) {
      updates.push(
        this.recordBehaviorSignal(userId, {
          edgeType: "recently_engaged_with",
          targetNode: {
            nodeType: this.isLikelyGameLabel(activity) ? "game" : "activity",
            label: activity,
          },
          signalStrength: 0.4,
          feedbackType: "intent_activity_mentioned",
          context: {
            intentType: parsedIntent.intentType ?? null,
          },
        }),
      );
    }

    for (const timing of this.uniqueNormalizedLabels(
      parsedIntent.timingConstraints ?? [],
    )) {
      updates.push(
        this.recordBehaviorSignal(userId, {
          edgeType: "prefers",
          targetNode: {
            nodeType: "schedule_preference",
            label: timing,
          },
          signalStrength: 0.35,
          feedbackType: "intent_timing_constraint",
        }),
      );
    }

    if (parsedIntent.modality === "offline") {
      updates.push(
        this.recordBehaviorSignal(userId, {
          edgeType: "prefers",
          targetNode: {
            nodeType: "location_cluster",
            label: "local:offline_intent",
          },
          signalStrength: 0.35,
          feedbackType: "intent_offline_modality",
        }),
      );
    }

    await Promise.all(updates);

    return {
      signalCount: updates.length,
    };
  }

  async refreshProfileSummaryDocument(userId: string) {
    const [profile, interests, topics] = await Promise.all([
      this.prisma.userProfile.findUnique({
        where: { userId },
        select: {
          bio: true,
          city: true,
          country: true,
          availabilityMode: true,
        },
      }),
      this.prisma.userInterest.findMany({
        where: { userId },
        select: {
          label: true,
        },
        orderBy: [{ createdAt: "desc" }],
        take: 20,
      }),
      this.prisma.userTopic.findMany({
        where: { userId },
        select: {
          label: true,
        },
        orderBy: [{ weight: "desc" }],
        take: 20,
      }),
    ]);

    const globalRules = await this.getGlobalRules(userId);
    const summary = this.buildProfileSummaryContent({
      profile,
      interests: interests.map((item) => item.label),
      topics: topics.map((item) => item.label),
      globalRules,
    });

    return this.saveRetrievalDocument(
      userId,
      RETRIEVAL_DOC_TYPE_PROFILE_SUMMARY,
      summary,
      true,
    );
  }

  async refreshPreferenceMemoryDocument(userId: string) {
    const [explicitPreferences, inferredPreferences, lifeGraphEdges] =
      await Promise.all([
        this.prisma.explicitPreference.findMany({
          where: {
            userId,
            scope: { in: [LIFE_GRAPH_PREF_SCOPE, "intent_type"] },
          },
          select: {
            scope: true,
            preferenceKey: true,
            value: true,
            updatedAt: true,
          },
          orderBy: [{ updatedAt: "desc" }],
          take: 30,
        }),
        this.prisma.inferredPreference.findMany({
          where: { userId },
          select: {
            preferenceKey: true,
            value: true,
            confidence: true,
            sourceSignal: true,
            updatedAt: true,
          },
          orderBy: [{ updatedAt: "desc" }],
          take: 30,
        }),
        this.prisma.lifeGraphEdge.findMany({
          where: { userId },
          select: {
            edgeType: true,
            weight: true,
            sourceNodeId: true,
            targetNodeId: true,
            updatedAt: true,
          },
          orderBy: [{ updatedAt: "desc" }],
          take: 25,
        }),
      ]);

    const nodeIds = new Set<string>();
    for (const edge of lifeGraphEdges) {
      nodeIds.add(edge.sourceNodeId);
      nodeIds.add(edge.targetNodeId);
    }
    const nodes =
      nodeIds.size === 0
        ? []
        : await this.prisma.lifeGraphNode.findMany({
            where: { id: { in: Array.from(nodeIds) } },
            select: {
              id: true,
              nodeType: true,
              label: true,
            },
          });
    const nodeById = new Map(nodes.map((node) => [node.id, node]));

    const memoryDoc = this.buildPreferenceMemoryContent({
      explicitPreferences,
      inferredPreferences,
      lifeGraphEdges: lifeGraphEdges.map((edge) => ({
        edgeType: edge.edgeType,
        weight: Number(edge.weight),
        sourceNode: nodeById.get(edge.sourceNodeId) ?? null,
        targetNode: nodeById.get(edge.targetNodeId) ?? null,
        updatedAt: edge.updatedAt,
      })),
    });

    return this.saveRetrievalDocument(
      userId,
      RETRIEVAL_DOC_TYPE_PREFERENCE_MEMORY,
      memoryDoc,
      true,
    );
  }

  async storeInteractionSummary(
    userId: string,
    input: StoreInteractionSummaryInput,
  ) {
    const summary = input.summary.trim();
    const memoryWrite = this.normalizeInteractionMemoryWrite(input);
    const globalRules = await this.getGlobalRules(userId);
    const eligibility = this.evaluateMemoryEligibility({
      globalRules,
      summary,
      memoryWrite,
      safe: input.safe,
    });
    const safeWrite = this.evaluateMemorySafeWrite(memoryWrite);
    if (!eligibility.allowed) {
      await this.recordMemoryAuditEvent("memory.write_suppressed", userId, {
        summary,
        memoryWrite,
        reason: eligibility.reason,
        state: "suppressed",
      });
      return {
        stored: false,
        reason: eligibility.reason,
        safe: false,
        memory: {
          ...memoryWrite,
          compressedSummary: this.compressSummary(summary, 160),
          safeWriteDecision: "suppressed" as const,
          safeWriteReason: eligibility.reason,
          contradictionDetected: false,
          conflictingDocumentId: null,
          state: "suppressed" as const,
        },
      };
    }

    if (!safeWrite.allowed && memoryWrite.safeWritePolicy === "strict") {
      await this.recordMemoryAuditEvent("memory.write_suppressed", userId, {
        summary,
        memoryWrite,
        reason: safeWrite.reason,
        state: "suppressed",
      });
      return {
        stored: false,
        reason: safeWrite.reason,
        safe: false,
        memory: {
          ...memoryWrite,
          compressedSummary: this.compressSummary(summary, 160),
          safeWriteDecision: "suppressed" as const,
          safeWriteReason: safeWrite.reason,
          contradictionDetected: false,
          conflictingDocumentId: null,
          state: "suppressed" as const,
        },
      };
    }

    const contradiction = await this.detectMemoryContradiction(
      userId,
      memoryWrite,
    );
    if (
      contradiction.detected &&
      memoryWrite.contradictionPolicy === "suppress_conflict"
    ) {
      await this.recordMemoryAuditEvent("memory.write_suppressed", userId, {
        summary,
        memoryWrite,
        reason: "contradiction_suppressed",
        state: "suppressed",
        contradiction,
      });
      return {
        stored: false,
        reason: "contradiction_suppressed",
        safe: false,
        memory: {
          ...memoryWrite,
          compressedSummary: this.compressSummary(summary, 160),
          safeWriteDecision: "suppressed" as const,
          safeWriteReason: "contradiction_suppressed",
          contradictionDetected: true,
          conflictingDocumentId: contradiction.conflictingDocumentId,
          state: "suppressed" as const,
        },
      };
    }

    await this.recordMemoryAuditEvent("memory.write_attempted", userId, {
      summary,
      memoryWrite,
      reason: null,
      state: contradiction.detected ? "flagged_for_review" : "active",
      contradiction,
    });

    const compressedSummary = memoryWrite.compressible
      ? this.compressSummary(summary, 160)
      : summary;
    const enrichedContext = this.mergeMemoryContext(
      input.context,
      memoryWrite,
      compressedSummary,
      contradiction,
      safeWrite,
    );
    const safe =
      input.safe ?? (summary.length > 0 && !this.isUnsafeContent(summary));
    const state = !safe
      ? "flagged_for_review"
      : contradiction.detected &&
          memoryWrite.contradictionPolicy === "append_conflict_note"
        ? "superseded"
        : "active";
    const docType = this.resolveRetrievalDocType(memoryWrite.class, safe);

    const contradictionLine =
      contradiction.detected &&
      memoryWrite.contradictionPolicy === "append_conflict_note" &&
      contradiction.conflictingDocumentId
        ? `memory.contradiction_note: conflicting key "${memoryWrite.key ?? "unknown"}" supersedes document ${contradiction.conflictingDocumentId}`
        : null;
    const content = [
      `summary: ${summary}`,
      `context: ${this.stableStringify(enrichedContext)}`,
      `memory: ${this.stableStringify({
        class: memoryWrite.class,
        governanceTier: memoryWrite.governanceTier,
        key: memoryWrite.key,
        value: memoryWrite.value,
        confidence: memoryWrite.confidence,
        safeWritePolicy: memoryWrite.safeWritePolicy,
        contradictionPolicy: memoryWrite.contradictionPolicy,
        consent: memoryWrite.consent,
        moderation: memoryWrite.moderation,
        provenance: memoryWrite.provenance,
        compressedSummary,
        state,
        contradictionDetected: contradiction.detected,
        conflictingDocumentId: contradiction.conflictingDocumentId,
        safeWriteDecision: safeWrite.allowed ? "accepted" : "degraded",
        safeWriteReason: safeWrite.reason,
      })}`,
      ...(contradictionLine ? [contradictionLine] : []),
      `safe: ${String(safe)}`,
    ].join("\n");
    const stored = await this.saveRetrievalDocument(
      userId,
      docType,
      content,
      false,
    );
    await this.recordMemoryAuditEvent(
      state === "flagged_for_review"
        ? "memory.write_review_required"
        : "memory.write_accepted",
      userId,
      {
        summary,
        memoryWrite,
        reason: safeWrite.reason,
        state,
        contradiction,
      },
    );

    return {
      stored: true,
      ...stored,
      safe,
      memory: {
        ...memoryWrite,
        compressedSummary,
        state,
        safeWriteDecision: safeWrite.allowed
          ? ("accepted" as const)
          : ("degraded" as const),
        safeWriteReason: safeWrite.reason,
        contradictionDetected: contradiction.detected,
        conflictingDocumentId: contradiction.conflictingDocumentId,
      },
    };
  }

  async retrievePersonalizationContext(
    userId: string,
    input: RetrievePersonalizationContextInput,
  ) {
    const maxChunks = Math.min(
      Math.max(input.maxChunks ?? RETRIEVAL_DEFAULT_MAX_CHUNKS, 1),
      10,
    );
    const maxAgeDays = Math.min(
      Math.max(input.maxAgeDays ?? RETRIEVAL_DEFAULT_MAX_AGE_DAYS, 1),
      365,
    );
    const staleCutoff = new Date(Date.now() - maxAgeDays * 24 * 60 * 60_000);

    const documents = await this.prisma.retrievalDocument.findMany({
      where: {
        userId,
        docType: { in: [...RETRIEVAL_SAFE_DOC_TYPES] },
        createdAt: { gte: staleCutoff },
      },
      select: {
        id: true,
        docType: true,
        content: true,
        createdAt: true,
      },
      orderBy: [{ createdAt: "desc" }],
      take: RETRIEVAL_MAX_DOC_SCAN,
    });

    const chunks =
      documents.length === 0
        ? []
        : await this.prisma.retrievalChunk.findMany({
            where: {
              documentId: { in: documents.map((document) => document.id) },
            },
            select: {
              documentId: true,
              chunkIndex: true,
              content: true,
              tokenCount: true,
            },
          });
    const chunkRows =
      chunks.length > 0
        ? chunks
        : documents.map((document) => ({
            documentId: document.id,
            chunkIndex: 0,
            content: document.content,
            tokenCount: this.estimateTokenCount(document.content),
          }));

    const docById = new Map(
      documents.map((document) => [document.id, document]),
    );
    const queryTokens = this.tokenizeForMatching(input.query);
    const scoredChunks = chunkRows
      .map((chunk) => {
        const document = docById.get(chunk.documentId);
        if (!document) {
          return null;
        }
        if (this.isUnsafeContent(chunk.content)) {
          return null;
        }
        const memoryMetadata = this.readMemoryMetadata(chunk.content);
        if (
          memoryMetadata &&
          (memoryMetadata.state === "suppressed" ||
            memoryMetadata.state === "flagged_for_review" ||
            memoryMetadata.state === "expired" ||
            memoryMetadata.state === "superseded")
        ) {
          return null;
        }

        const score = this.scoreChunkForQuery(
          queryTokens,
          input.query,
          document.docType,
          chunk.content,
          document.createdAt,
          maxAgeDays,
          memoryMetadata,
        );

        return {
          documentId: chunk.documentId,
          docType: document.docType,
          chunkIndex: chunk.chunkIndex,
          tokenCount: chunk.tokenCount,
          score,
          createdAt: document.createdAt,
          excerpt: this.buildRetrievalExcerpt(
            chunk.content,
            memoryMetadata,
            document.docType,
          ),
        };
      })
      .filter((item): item is NonNullable<typeof item> => item != null)
      .sort((a, b) => b.score - a.score)
      .slice(0, maxChunks);
    const bundle = this.buildRetrievalBundleText(scoredChunks);
    const bundleTokenEstimate = this.estimateTokenCount(bundle);

    return {
      userId,
      query: input.query,
      maxChunks,
      maxAgeDays,
      staleCutoff,
      results: scoredChunks,
      bundle,
      bundleTokenEstimate,
    };
  }

  async listMemoryTimeline(
    userId: string,
    input: {
      limit?: number;
      memoryClass?: MemoryClass;
      key?: string;
      state?:
        | "active"
        | "superseded"
        | "suppressed"
        | "flagged_for_review"
        | "expired";
      governanceTier?: MemoryGovernanceTier;
      sourceSurface?: MemorySourceSurface;
      domain?: MemoryDomain;
    } = {},
  ) {
    const limit = Math.min(Math.max(input.limit ?? 50, 1), 100);
    const documents = await this.prisma.retrievalDocument.findMany({
      where: {
        userId,
        docType: {
          in: [
            ...RETRIEVAL_SAFE_DOC_TYPES,
            RETRIEVAL_DOC_TYPE_INTERACTION_FLAGGED,
          ],
        },
      },
      select: {
        id: true,
        docType: true,
        content: true,
        createdAt: true,
      },
      orderBy: [{ createdAt: "desc" }],
      take: Math.max(limit * 2, 50),
    });

    return documents
      .map((document) => this.parseMemoryTimelineItem(document))
      .filter((item): item is NonNullable<typeof item> => item != null)
      .filter(
        (item) =>
          (!input.memoryClass || item.memory.class === input.memoryClass) &&
          (!input.key || item.memory.key === input.key) &&
          (!input.state || item.memory.state === input.state) &&
          (!input.governanceTier ||
            item.memory.governanceTier === input.governanceTier) &&
          (!input.sourceSurface ||
            item.memory.provenance.sourceSurface === input.sourceSurface) &&
          (!input.domain || item.memory.domain === input.domain),
      )
      .slice(0, limit);
  }

  async listMemoryAuditTrail(userId: string, limit = 50) {
    if (!this.prisma.auditLog?.findMany) {
      return [];
    }
    const rows = await this.prisma.auditLog.findMany({
      where: {
        entityType: "memory",
        entityId: userId,
        action: {
          in: [
            "memory.write_attempted",
            "memory.write_accepted",
            "memory.write_suppressed",
            "memory.write_review_required",
            "privacy.memory_reset",
          ],
        },
      },
      orderBy: [{ createdAt: "desc" }],
      take: Math.min(Math.max(limit, 1), 100),
    });
    return rows.map((row) => ({
      id: row.id,
      action: row.action,
      createdAt: row.createdAt,
      metadata: row.metadata ?? null,
    }));
  }

  async listMemoryContradictions(userId: string, limit = 25) {
    const timeline = await this.listMemoryTimeline(userId, {
      limit: Math.max(limit * 3, 50),
    });
    return timeline
      .filter(
        (item) =>
          item.memory.contradictionDetected ||
          item.memory.state === "superseded" ||
          item.memory.state === "suppressed",
      )
      .slice(0, limit);
  }

  async getMemoryRecord(userId: string, documentId: string) {
    const document = await this.prisma.retrievalDocument.findFirst({
      where: {
        id: documentId,
        userId,
        docType: {
          in: [
            ...RETRIEVAL_SAFE_DOC_TYPES,
            RETRIEVAL_DOC_TYPE_INTERACTION_FLAGGED,
          ],
        },
      },
      select: {
        id: true,
        docType: true,
        content: true,
        createdAt: true,
      },
    });
    if (!document) {
      return null;
    }
    return this.parseMemoryTimelineItem(document);
  }

  private async saveRetrievalDocument(
    userId: string,
    docType: string,
    content: string,
    replaceExisting: boolean,
  ) {
    if (replaceExisting) {
      const existingDocs = await this.prisma.retrievalDocument.findMany({
        where: { userId, docType },
        select: { id: true },
      });
      if (existingDocs.length > 0) {
        await this.prisma.retrievalChunk.deleteMany({
          where: {
            documentId: { in: existingDocs.map((document) => document.id) },
          },
        });
        await this.prisma.retrievalDocument.deleteMany({
          where: {
            id: { in: existingDocs.map((document) => document.id) },
          },
        });
      }
    }

    const document = await this.prisma.retrievalDocument.create({
      data: {
        userId,
        docType,
        content,
      },
    });

    const chunks = this.splitIntoChunks(content, RETRIEVAL_CHUNK_WORD_TARGET);
    if (chunks.length > 0) {
      await this.prisma.retrievalChunk.createMany({
        data: chunks.map((chunk, index) => ({
          documentId: document.id,
          chunkIndex: index,
          content: chunk,
          tokenCount: this.estimateTokenCount(chunk),
        })),
      });
    }

    return {
      documentId: document.id,
      docType: document.docType,
      chunkCount: chunks.length,
      createdAt: document.createdAt,
    };
  }

  private normalizeInteractionMemoryWrite(input: StoreInteractionSummaryInput) {
    const context = input.context ?? {};
    const contextSource = this.readString(context["source"]);
    const sourceType = this.normalizeMemorySourceType(
      input.memory?.provenance?.sourceType,
      contextSource,
    );
    const confidence =
      typeof input.memory?.confidence === "number" &&
      Number.isFinite(input.memory.confidence)
        ? this.clampNumber(input.memory.confidence, 0, 1)
        : null;
    const provenance: MemoryWriteProvenance = {
      sourceType,
      sourceSurface:
        this.normalizeMemorySourceSurface(
          input.memory?.provenance?.sourceSurface,
          context["sourceSurface"],
          sourceType,
        ) ?? DEFAULT_MEMORY_SOURCE_SURFACE,
      sourceId: this.limitString(input.memory?.provenance?.sourceId, 255),
      sourceEntityId:
        this.limitString(input.memory?.provenance?.sourceEntityId, 255) ??
        this.limitString(context["sourceEntityId"], 255),
      messageId:
        this.limitString(input.memory?.provenance?.messageId, 255) ??
        this.limitString(context["messageId"], 255),
      chatId:
        this.limitString(input.memory?.provenance?.chatId, 255) ??
        this.limitString(context["chatId"], 255),
      threadId:
        this.limitString(input.memory?.provenance?.threadId, 255) ??
        this.limitString(context["threadId"], 255),
      actorUserIds:
        this.readStringArrayValue(
          input.memory?.provenance?.actorUserIds ?? context["actorUserIds"],
        ) ?? undefined,
      traceId:
        this.limitString(input.memory?.provenance?.traceId, 255) ??
        this.limitString(context["traceId"], 255) ??
        this.limitString(context["appTraceId"], 255),
      workflowRunId:
        this.limitString(input.memory?.provenance?.workflowRunId, 255) ??
        this.limitString(context["workflowRunId"], 255),
      toolName:
        this.limitString(input.memory?.provenance?.toolName, 120) ??
        this.limitString(context["tool"], 120),
      model:
        this.limitString(input.memory?.provenance?.model, 120) ??
        this.limitString(context["model"], 120),
      observedAt:
        this.limitIsoDate(input.memory?.provenance?.observedAt) ??
        new Date().toISOString(),
    };

    return {
      class: this.normalizeMemoryClass(input.memory?.class),
      governanceTier: this.normalizeMemoryGovernanceTier(
        input.memory?.governanceTier,
        input.memory?.class,
      ),
      key: this.limitString(input.memory?.key, 160) ?? null,
      value: this.limitString(input.memory?.value, 400) ?? null,
      confidence,
      safeWritePolicy:
        input.memory?.safeWritePolicy ?? DEFAULT_MEMORY_SAFE_WRITE_POLICY,
      contradictionPolicy:
        input.memory?.contradictionPolicy ??
        DEFAULT_MEMORY_CONTRADICTION_POLICY,
      compressible: input.memory?.compressible !== false,
      consent: this.normalizeMemoryConsentContext(
        input.memory?.consent,
        context,
        sourceType,
      ),
      moderation: this.normalizeMemoryModerationContext(
        input.memory?.moderation,
        context,
      ),
      provenance,
    };
  }

  private normalizeMemoryClass(value?: MemoryClass): MemoryClass {
    if (!value) {
      return DEFAULT_MEMORY_CLASS;
    }
    return value;
  }

  private normalizeMemoryGovernanceTier(
    value: MemoryGovernanceTier | undefined,
    memoryClass: MemoryClass | undefined,
  ): MemoryGovernanceTier {
    if (value) {
      return value;
    }
    return MEMORY_CLASS_GOVERNANCE_TIER[this.normalizeMemoryClass(memoryClass)];
  }

  private normalizeMemorySourceType(
    explicitSource: MemorySourceType | undefined,
    contextSource: string | null,
  ): MemorySourceType {
    if (explicitSource) {
      return explicitSource;
    }
    const source = (contextSource ?? "").toLowerCase();
    if (source.includes("profile")) {
      return "user_profile_edit";
    }
    if (source.includes("agent")) {
      return "agent_tool";
    }
    if (source.includes("intent")) {
      return "interaction_observation";
    }
    return "system_event";
  }

  private normalizeMemorySourceSurface(
    explicitSurface: MemorySourceSurface | undefined,
    contextSurface: unknown,
    sourceType: MemorySourceType,
  ): MemorySourceSurface {
    if (explicitSurface) {
      return explicitSurface;
    }
    const surface = this.readString(contextSurface)?.toLowerCase();
    if (
      surface === "agent_chat" ||
      surface === "dm_chat" ||
      surface === "group_chat" ||
      surface === "workflow_event" ||
      surface === "system_event" ||
      surface === "profile_edit"
    ) {
      return surface;
    }
    if (sourceType === "user_profile_edit") {
      return "profile_edit";
    }
    if (sourceType === "agent_tool") {
      return "agent_chat";
    }
    return DEFAULT_MEMORY_SOURCE_SURFACE;
  }

  private normalizeMemoryConsentContext(
    explicitConsent: MemoryConsentContext | undefined,
    context: Record<string, unknown>,
    sourceType: MemorySourceType,
  ): MemoryConsentContext {
    if (explicitConsent) {
      return {
        basis: explicitConsent.basis,
        explicit: explicitConsent.explicit,
        sourceText:
          this.limitString(explicitConsent.sourceText, 500) ?? undefined,
      };
    }
    if (sourceType === "user_profile_edit") {
      return { basis: "profile_edit", explicit: true };
    }
    if (sourceType === "explicit_user_input") {
      return {
        basis: "explicit_user_message",
        explicit: true,
        sourceText: this.limitString(context["sourceText"], 500) ?? undefined,
      };
    }
    return { basis: "default_allow", explicit: false };
  }

  private normalizeMemoryModerationContext(
    explicitModeration: MemoryModerationContext | undefined,
    context: Record<string, unknown>,
  ): MemoryModerationContext {
    if (explicitModeration) {
      return {
        decision: explicitModeration.decision,
        reasonTokens:
          this.readStringArrayValue(explicitModeration.reasonTokens) ??
          undefined,
      };
    }
    const decision = this.readString(context["moderationDecision"]);
    return {
      decision:
        decision === "flagged" ||
        decision === "review" ||
        decision === "blocked"
          ? decision
          : "clean",
      reasonTokens:
        this.readStringArrayValue(context["moderationReasonTokens"]) ??
        undefined,
    };
  }

  private evaluateMemoryEligibility(input: {
    globalRules: GlobalRules;
    summary: string;
    safe?: boolean;
    memoryWrite: {
      class: MemoryClass;
      governanceTier: MemoryGovernanceTier;
      consent: MemoryConsentContext;
      moderation: MemoryModerationContext;
      provenance: MemoryWriteProvenance;
    };
  }) {
    const { globalRules, summary, safe, memoryWrite } = input;
    if (memoryWrite.governanceTier === "ephemeral") {
      return { allowed: false, reason: "ephemeral_memory_not_durable" };
    }
    if (globalRules.memoryMode === "minimal") {
      return { allowed: false, reason: "memory_mode_minimal" };
    }
    if (
      (memoryWrite.provenance.sourceSurface === "dm_chat" ||
        memoryWrite.provenance.sourceSurface === "group_chat") &&
      !globalRules.dmGroupMemoryIngestionEnabled
    ) {
      return { allowed: false, reason: "surface_memory_disabled" };
    }
    if (
      memoryWrite.provenance.sourceSurface === "agent_chat" &&
      !globalRules.agentChatMemoryIngestionEnabled
    ) {
      return { allowed: false, reason: "surface_memory_disabled" };
    }
    if (
      memoryWrite.moderation.decision === "flagged" ||
      memoryWrite.moderation.decision === "review" ||
      memoryWrite.moderation.decision === "blocked"
    ) {
      return { allowed: false, reason: "moderation_blocked_memory" };
    }
    if ((safe ?? true) === false || this.isUnsafeContent(summary)) {
      return { allowed: false, reason: "unsafe_memory_content" };
    }
    if (
      memoryWrite.governanceTier === "explicit_only" &&
      !memoryWrite.consent.explicit
    ) {
      return { allowed: false, reason: "explicit_consent_required" };
    }
    return { allowed: true, reason: null as string | null };
  }

  private evaluateMemorySafeWrite(input: {
    class: MemoryClass;
    governanceTier: MemoryGovernanceTier;
    confidence: number | null;
    safeWritePolicy: MemorySafeWritePolicy;
    provenance: MemoryWriteProvenance;
  }) {
    if (input.safeWritePolicy === "best_effort") {
      return { allowed: true, reason: null as string | null };
    }

    const requiresTrace = MEMORY_TRACE_REQUIRED_CLASSES.has(input.class);
    const hasTrace =
      Boolean(input.provenance.traceId) ||
      Boolean(input.provenance.workflowRunId);
    if (requiresTrace && !hasTrace) {
      if (input.safeWritePolicy === "strict") {
        return { allowed: false, reason: "missing_trace_context" };
      }
      return { allowed: true, reason: "missing_trace_context" };
    }

    const minConfidence = MEMORY_MIN_CONFIDENCE_BY_CLASS[input.class];
    if (
      input.confidence != null &&
      minConfidence > 0 &&
      input.confidence < minConfidence
    ) {
      if (input.safeWritePolicy === "strict") {
        return { allowed: false, reason: "insufficient_confidence" };
      }
      return { allowed: true, reason: "insufficient_confidence" };
    }

    return { allowed: true, reason: null as string | null };
  }

  private async detectMemoryContradiction(
    userId: string,
    memoryWrite: {
      key: string | null;
      value: string | null;
      class: MemoryClass;
      contradictionPolicy: MemoryContradictionPolicy;
    },
  ) {
    const key = memoryWrite.key?.trim().toLowerCase();
    const value = memoryWrite.value?.trim().toLowerCase();
    if (!key || !value) {
      return {
        detected: false,
        conflictingDocumentId: null as string | null,
      };
    }

    const recentDocs = await this.prisma.retrievalDocument.findMany({
      where: {
        userId,
        docType: {
          in: [
            RETRIEVAL_DOC_TYPE_INTERACTION_SUMMARY,
            RETRIEVAL_DOC_TYPE_PREFERENCE_MEMORY,
            RETRIEVAL_DOC_TYPE_PROFILE_SUMMARY,
            RETRIEVAL_DOC_TYPE_RELATIONSHIP_MEMORY,
            RETRIEVAL_DOC_TYPE_SAFETY_MEMORY,
            RETRIEVAL_DOC_TYPE_COMMERCE_MEMORY,
          ],
        },
      },
      select: {
        id: true,
        content: true,
        createdAt: true,
      },
      orderBy: [{ createdAt: "desc" }],
      take: 25,
    });

    for (const document of recentDocs) {
      const parsedContext = this.parseInteractionContextLine(document.content);
      const memoryContext =
        parsedContext && typeof parsedContext["memory"] === "object"
          ? (parsedContext["memory"] as Record<string, unknown>)
          : null;
      if (!memoryContext) {
        continue;
      }
      const existingKey = this.readString(memoryContext["key"])?.toLowerCase();
      const existingValue = this.readString(
        memoryContext["value"],
      )?.toLowerCase();
      if (!existingKey || !existingValue) {
        continue;
      }
      if (existingKey === key && existingValue !== value) {
        return {
          detected: true,
          conflictingDocumentId: document.id,
        };
      }
    }

    return {
      detected: false,
      conflictingDocumentId: null as string | null,
    };
  }

  private mergeMemoryContext(
    context: Record<string, unknown> | undefined,
    memoryWrite: {
      class: MemoryClass;
      governanceTier: MemoryGovernanceTier;
      key: string | null;
      value: string | null;
      confidence: number | null;
      safeWritePolicy: MemorySafeWritePolicy;
      contradictionPolicy: MemoryContradictionPolicy;
      consent: MemoryConsentContext;
      moderation: MemoryModerationContext;
      provenance: MemoryWriteProvenance;
    },
    compressedSummary: string,
    contradiction: {
      detected: boolean;
      conflictingDocumentId: string | null;
    },
    safeWrite: {
      allowed: boolean;
      reason: string | null;
    },
  ) {
    return {
      ...(context ?? {}),
      memory: {
        class: memoryWrite.class,
        governanceTier: memoryWrite.governanceTier,
        key: memoryWrite.key,
        value: memoryWrite.value,
        confidence: memoryWrite.confidence,
        safeWritePolicy: memoryWrite.safeWritePolicy,
        contradictionPolicy: memoryWrite.contradictionPolicy,
        consent: memoryWrite.consent,
        moderation: memoryWrite.moderation,
        provenance: memoryWrite.provenance,
        compressedSummary,
        safeWriteDecision: safeWrite.allowed ? "accepted" : "degraded",
        safeWriteReason: safeWrite.reason,
        contradictionDetected: contradiction.detected,
        conflictingDocumentId: contradiction.conflictingDocumentId,
      },
    };
  }

  private parseInteractionContextLine(content: string) {
    const contextLine = content
      .split("\n")
      .find((line) => line.startsWith("context: "));
    if (!contextLine) {
      return null;
    }
    const raw = contextLine.slice("context: ".length).trim();
    if (!raw) {
      return null;
    }
    try {
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return null;
      }
      return parsed as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  private buildRetrievalBundleText(
    results: Array<{
      docType: string;
      score: number;
      excerpt: string;
    }>,
  ) {
    if (results.length === 0) {
      return "";
    }

    const lines = results.map((item, index) => {
      const prefix = `[${index + 1}] ${item.docType} score=${item.score.toFixed(2)}`;
      return `${prefix} ${item.excerpt}`;
    });
    const raw = lines.join("\n");
    if (raw.length <= RETRIEVAL_BUNDLE_MAX_CHARS) {
      return raw;
    }
    return this.compressSummary(raw, RETRIEVAL_BUNDLE_MAX_CHARS);
  }

  private resolveRetrievalDocType(memoryClass: MemoryClass, safe: boolean) {
    if (!safe) {
      return RETRIEVAL_DOC_TYPE_INTERACTION_FLAGGED;
    }
    if (memoryClass === "profile_memory") {
      return RETRIEVAL_DOC_TYPE_PROFILE_SUMMARY;
    }
    if (
      memoryClass === "stable_preference" ||
      memoryClass === "inferred_preference"
    ) {
      return RETRIEVAL_DOC_TYPE_PREFERENCE_MEMORY;
    }
    if (memoryClass === "relationship_history") {
      return RETRIEVAL_DOC_TYPE_RELATIONSHIP_MEMORY;
    }
    if (memoryClass === "safety_memory") {
      return RETRIEVAL_DOC_TYPE_SAFETY_MEMORY;
    }
    if (memoryClass === "commerce_memory") {
      return RETRIEVAL_DOC_TYPE_COMMERCE_MEMORY;
    }
    return RETRIEVAL_DOC_TYPE_INTERACTION_SUMMARY;
  }

  private compressSummary(value: string, maxLength: number) {
    const normalized = value.replace(/\s+/g, " ").trim();
    if (normalized.length <= maxLength) {
      return normalized;
    }
    return `${normalized.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
  }

  private buildProfileSummaryContent(input: {
    profile: {
      bio: string | null;
      city: string | null;
      country: string | null;
      availabilityMode: string;
    } | null;
    interests: string[];
    topics: string[];
    globalRules: GlobalRules;
  }) {
    const lines = [
      `availability_mode: ${input.profile?.availabilityMode ?? "flexible"}`,
      `location: ${input.profile?.city ?? "unknown"}, ${input.profile?.country ?? "unknown"}`,
      `bio: ${input.profile?.bio ?? "n/a"}`,
      `interests: ${input.interests.slice(0, 12).join(", ") || "none"}`,
      `topics: ${input.topics.slice(0, 12).join(", ") || "none"}`,
      `rules.intent_mode: ${input.globalRules.intentMode}`,
      `rules.modality: ${input.globalRules.modality}`,
      `rules.reachability: ${input.globalRules.reachable}`,
      `rules.contact: ${input.globalRules.whoCanContact}`,
      `rules.languages: ${input.globalRules.languagePreferences.join(", ") || "unspecified"}`,
      `rules.countries: ${input.globalRules.countryPreferences.join(", ") || "unspecified"}`,
      `rules.translation_opt_in: ${input.globalRules.translationOptIn ? "yes" : "no"}`,
      `rules.dm_group_memory_ingestion: ${input.globalRules.dmGroupMemoryIngestionEnabled ? "yes" : "no"}`,
      `rules.agent_chat_memory_ingestion: ${input.globalRules.agentChatMemoryIngestionEnabled ? "yes" : "no"}`,
      `rules.memory_inference_strictness: ${input.globalRules.memoryInferenceStrictness}`,
    ];
    return lines.join("\n");
  }

  private buildPreferenceMemoryContent(input: {
    explicitPreferences: Array<{
      scope: string;
      preferenceKey: string;
      value: unknown;
      updatedAt: Date;
    }>;
    inferredPreferences: Array<{
      preferenceKey: string;
      value: unknown;
      confidence: number | Prisma.Decimal;
      sourceSignal: string;
      updatedAt: Date;
    }>;
    lifeGraphEdges: Array<{
      edgeType: string;
      weight: number;
      sourceNode: {
        nodeType: string;
        label: string;
      } | null;
      targetNode: {
        nodeType: string;
        label: string;
      } | null;
      updatedAt: Date;
    }>;
  }) {
    const explicitLines = input.explicitPreferences.map(
      (pref) =>
        `explicit|${pref.scope}|${pref.preferenceKey}|${this.stableStringify(pref.value)}|${pref.updatedAt.toISOString()}`,
    );
    const inferredLines = input.inferredPreferences.map(
      (pref) =>
        `inferred|${pref.preferenceKey}|confidence=${Number(pref.confidence).toFixed(3)}|signal=${pref.sourceSignal}|${this.stableStringify(pref.value)}|${pref.updatedAt.toISOString()}`,
    );
    const lifeGraphLines = input.lifeGraphEdges.map(
      (edge) =>
        `life_graph|${edge.edgeType}|${edge.weight.toFixed(4)}|${edge.sourceNode?.nodeType ?? "unknown"}:${edge.sourceNode?.label ?? "n/a"}->${edge.targetNode?.nodeType ?? "unknown"}:${edge.targetNode?.label ?? "n/a"}|${edge.updatedAt.toISOString()}`,
    );

    return [
      "explicit_preferences:",
      ...explicitLines,
      "inferred_preferences:",
      ...inferredLines,
      "life_graph_edges:",
      ...lifeGraphLines,
    ].join("\n");
  }

  private splitIntoChunks(content: string, targetWordCount: number) {
    const words = content.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      return [];
    }

    const chunks: string[] = [];
    for (let i = 0; i < words.length; i += targetWordCount) {
      chunks.push(words.slice(i, i + targetWordCount).join(" "));
    }
    return chunks;
  }

  private estimateTokenCount(text: string) {
    return Math.max(1, Math.ceil(text.split(/\s+/).length * 1.2));
  }

  private tokenizeForMatching(text: string) {
    return new Set(
      text
        .toLowerCase()
        .split(/[^a-z0-9]+/g)
        .map((token) => this.normalizeMatchToken(token.trim()))
        .filter((token) => token.length >= 3),
    );
  }

  private normalizeMatchToken(token: string) {
    if (!token) {
      return "";
    }
    if (token.endsWith("ies") && token.length > 4) {
      return `${token.slice(0, -3)}y`;
    }
    if ((token.endsWith("ses") || token.endsWith("xes")) && token.length > 4) {
      return token.slice(0, -2);
    }
    if (token.endsWith("s") && !token.endsWith("ss") && token.length > 3) {
      return token.slice(0, -1);
    }
    if (token.startsWith("prefer")) {
      return "prefer";
    }
    if (token.startsWith("lik")) {
      return "like";
    }
    return token;
  }

  private scoreChunkForQuery(
    queryTokens: Set<string>,
    query: string,
    docType: string,
    chunkContent: string,
    createdAt: Date,
    maxAgeDays: number,
    memoryMetadata?: {
      governanceTier: MemoryGovernanceTier | null;
      domain: MemoryDomain | null;
      key: string | null;
      value: string | null;
      sourceSurface: MemorySourceSurface | null;
      sourceType: MemorySourceType | null;
      confidence: number | null;
      state:
        | "active"
        | "superseded"
        | "suppressed"
        | "flagged_for_review"
        | "expired"
        | null;
    } | null,
  ) {
    const chunkTokens = this.tokenizeForMatching(chunkContent);
    let overlap = 0;
    for (const token of queryTokens) {
      if (chunkTokens.has(token)) {
        overlap += 1;
      }
    }
    const ageDays = Math.max(
      0,
      (Date.now() - createdAt.getTime()) / (24 * 60 * 60_000),
    );
    const freshnessWindowDays =
      memoryMetadata?.governanceTier === "explicit_only"
        ? maxAgeDays * 1.75
        : memoryMetadata?.governanceTier === "inferable"
          ? maxAgeDays * 0.85
          : maxAgeDays;
    const freshnessBoost = Math.max(0, 1 - ageDays / freshnessWindowDays);
    const docTypeBoost =
      docType === RETRIEVAL_DOC_TYPE_PROFILE_SUMMARY
        ? 1.15
        : docType === RETRIEVAL_DOC_TYPE_PREFERENCE_MEMORY
          ? 1
          : docType === RETRIEVAL_DOC_TYPE_RELATIONSHIP_MEMORY
            ? 0.7
            : docType === RETRIEVAL_DOC_TYPE_SAFETY_MEMORY
              ? 0.45
              : docType === RETRIEVAL_DOC_TYPE_COMMERCE_MEMORY
                ? 0.4
                : 0.2;
    const domainBoost =
      memoryMetadata?.domain === "profile"
        ? 0.5
        : memoryMetadata?.domain === "preference"
          ? 0.45
          : memoryMetadata?.domain === "relationship"
            ? 0.25
            : memoryMetadata?.domain === "safety"
              ? 0.15
              : memoryMetadata?.domain === "commerce"
                ? 0.1
                : 0;
    const governanceBoost =
      memoryMetadata?.governanceTier === "explicit_only"
        ? 1.25
        : memoryMetadata?.governanceTier === "inferable"
          ? 0.2
          : 0;
    const sourceBoost =
      memoryMetadata?.sourceType === "explicit_user_input" ||
      memoryMetadata?.sourceType === "user_profile_edit"
        ? 0.35
        : memoryMetadata?.sourceSurface === "dm_chat"
          ? 0.18
          : memoryMetadata?.sourceSurface === "agent_chat"
            ? 0.12
            : memoryMetadata?.sourceSurface === "group_chat"
              ? 0.08
              : 0;
    const confidenceBoost = memoryMetadata?.confidence
      ? memoryMetadata.confidence * 0.6
      : 0;
    const normalizedQuery = query.trim().toLowerCase();
    const exactKeyMatch =
      memoryMetadata?.key &&
      normalizedQuery.includes(memoryMetadata.key.toLowerCase())
        ? 0.85
        : 0;
    const semanticKeyMatch = memoryMetadata?.key
      ? Array.from(
          this.tokenizeForMatching(
            memoryMetadata.key.replaceAll(/[._-]/g, " "),
          ),
        ).filter((token) => queryTokens.has(token)).length * 0.3
      : 0;
    const exactValueMatch =
      memoryMetadata?.value &&
      normalizedQuery.includes(memoryMetadata.value.toLowerCase())
        ? 0.95
        : 0;
    const chunkContainsValue =
      memoryMetadata?.value &&
      chunkContent.toLowerCase().includes(memoryMetadata.value.toLowerCase())
        ? 0.35
        : 0;
    const supersededPenalty = memoryMetadata?.state === "superseded" ? 0.55 : 0;
    return (
      overlap * 2 +
      freshnessBoost +
      docTypeBoost +
      domainBoost +
      governanceBoost +
      sourceBoost +
      confidenceBoost +
      exactKeyMatch +
      semanticKeyMatch +
      exactValueMatch +
      chunkContainsValue -
      supersededPenalty
    );
  }

  private isUnsafeContent(content: string) {
    return RETRIEVAL_UNSAFE_PATTERN.test(content);
  }

  private trimPreview(content: string, maxLength: number) {
    if (content.length <= maxLength) {
      return content;
    }
    return `${content.slice(0, maxLength).trimEnd()}...`;
  }

  private buildRetrievalExcerpt(
    chunkContent: string,
    memoryMetadata:
      | {
          governanceTier: MemoryGovernanceTier | null;
          domain: MemoryDomain | null;
          key: string | null;
          value: string | null;
          sourceSurface: MemorySourceSurface | null;
          sourceType: MemorySourceType | null;
          confidence: number | null;
          state:
            | "active"
            | "superseded"
            | "suppressed"
            | "flagged_for_review"
            | "expired"
            | null;
        }
      | null
      | undefined,
    docType: string,
  ) {
    const summary = this.parseSummaryLine(chunkContent);
    if (!memoryMetadata?.key || !memoryMetadata?.value) {
      return this.trimPreview(chunkContent, 280);
    }

    const value = memoryMetadata.value.trim();
    const loweredKey = memoryMetadata.key.toLowerCase();
    const loweredValue = value.toLowerCase();
    let lead: string | null = null;

    if (
      docType === RETRIEVAL_DOC_TYPE_PREFERENCE_MEMORY ||
      loweredKey.includes("preference") ||
      loweredKey.includes("likes") ||
      loweredKey.includes("avoid")
    ) {
      lead = loweredKey.includes("avoid")
        ? `prefers to avoid ${loweredValue}`
        : `prefers ${loweredValue}`;
    } else if (loweredKey.includes("location")) {
      lead = `location: ${value}`;
    } else if (loweredKey.includes("language")) {
      lead = `languages: ${value}`;
    } else if (loweredKey.includes("relationship")) {
      lead = `relationship context: ${value}`;
    } else if (loweredKey.includes("budget")) {
      lead = `budget context: ${value}`;
    } else if (
      loweredKey.includes("boundary") ||
      loweredKey.includes("safety")
    ) {
      lead = `safety boundary: ${value}`;
    }

    if (!lead) {
      return this.trimPreview(chunkContent, 280);
    }

    if (!summary) {
      return this.trimPreview(lead, 280);
    }

    return this.trimPreview(`${lead}. ${summary}`, 280);
  }

  private stableStringify(value: unknown) {
    if (value == null || typeof value !== "object" || Array.isArray(value)) {
      return JSON.stringify(value);
    }

    const orderedEntries = Object.entries(
      value as Record<string, unknown>,
    ).sort(([a], [b]) => a.localeCompare(b));
    return JSON.stringify(Object.fromEntries(orderedEntries));
  }

  private parseMemoryTimelineItem(document: {
    id: string;
    docType: string;
    content: string;
    createdAt: Date;
  }) {
    const context = this.parseInteractionContextLine(document.content) ?? {};
    const memory =
      context["memory"] && typeof context["memory"] === "object"
        ? (context["memory"] as Record<string, unknown>)
        : null;
    if (!memory) {
      return null;
    }
    return {
      id: document.id,
      docType: document.docType,
      createdAt: document.createdAt,
      summary: this.parseSummaryLine(document.content),
      memory: {
        class: this.readString(memory["class"]) as MemoryClass | null,
        governanceTier: this.readString(
          memory["governanceTier"],
        ) as MemoryGovernanceTier | null,
        domain: this.inferMemoryDomain({
          docType: document.docType,
          memory,
        }),
        key: this.readString(memory["key"]),
        value: this.readString(memory["value"]),
        state:
          (this.readString(memory["state"]) as
            | "active"
            | "superseded"
            | "suppressed"
            | "flagged_for_review"
            | "expired"
            | null) ?? "active",
        confidence: this.readNumber(memory["confidence"]),
        contradictionDetected:
          this.readBooleanValue(memory["contradictionDetected"]) ?? false,
        conflictingDocumentId:
          this.readString(memory["conflictingDocumentId"]) ?? null,
        provenance:
          memory["provenance"] && typeof memory["provenance"] === "object"
            ? (memory["provenance"] as Record<string, unknown>)
            : {},
      },
    };
  }

  private readMemoryMetadata(content: string) {
    const context = this.parseInteractionContextLine(content) ?? {};
    const memory =
      context["memory"] && typeof context["memory"] === "object"
        ? (context["memory"] as Record<string, unknown>)
        : null;
    if (!memory) {
      return null;
    }
    const provenance = this.readJsonObject(
      memory["provenance"] as Prisma.JsonValue | null | undefined,
    );
    return {
      governanceTier: this.readString(
        memory["governanceTier"],
      ) as MemoryGovernanceTier | null,
      domain: this.inferMemoryDomain({
        docType:
          this.readString(context["docType"]) ??
          RETRIEVAL_DOC_TYPE_INTERACTION_SUMMARY,
        memory,
      }),
      key: this.readString(memory["key"]),
      value: this.readString(memory["value"]),
      sourceSurface:
        (this.readString(
          provenance.sourceSurface,
        ) as MemorySourceSurface | null) ?? null,
      sourceType:
        (this.readString(provenance.sourceType) as MemorySourceType | null) ??
        null,
      confidence: this.readNumber(memory["confidence"]),
      state:
        (this.readString(memory["state"]) as
          | "active"
          | "superseded"
          | "suppressed"
          | "flagged_for_review"
          | "expired"
          | null) ?? null,
    };
  }

  private inferMemoryDomain(input: {
    docType: string;
    memory: Record<string, unknown>;
  }): MemoryDomain {
    const key = this.readString(input.memory["key"])?.toLowerCase() ?? "";
    const memoryClass =
      (this.readString(input.memory["class"]) as MemoryClass | null) ?? null;
    const docType = input.docType.toLowerCase();

    if (
      docType === RETRIEVAL_DOC_TYPE_PROFILE_SUMMARY ||
      key.startsWith("profile.")
    ) {
      return "profile";
    }
    if (
      docType === RETRIEVAL_DOC_TYPE_PREFERENCE_MEMORY ||
      memoryClass === "stable_preference" ||
      memoryClass === "inferred_preference"
    ) {
      return "preference";
    }
    if (
      docType === RETRIEVAL_DOC_TYPE_RELATIONSHIP_MEMORY ||
      memoryClass === "relationship_history"
    ) {
      return "relationship";
    }
    if (
      docType === RETRIEVAL_DOC_TYPE_SAFETY_MEMORY ||
      memoryClass === "safety_memory"
    ) {
      return "safety";
    }
    if (
      docType === RETRIEVAL_DOC_TYPE_COMMERCE_MEMORY ||
      memoryClass === "commerce_memory"
    ) {
      return "commerce";
    }
    return "interaction";
  }

  private parseSummaryLine(content: string) {
    const summaryLine = content
      .split("\n")
      .find((line) => line.startsWith("summary: "));
    if (!summaryLine) {
      return null;
    }
    return summaryLine.slice("summary: ".length).trim() || null;
  }

  private async recordMemoryAuditEvent(
    action:
      | "memory.write_attempted"
      | "memory.write_accepted"
      | "memory.write_suppressed"
      | "memory.write_review_required",
    userId: string,
    input: {
      summary: string;
      memoryWrite: {
        class: MemoryClass;
        governanceTier: MemoryGovernanceTier;
        key: string | null;
        value: string | null;
        consent: MemoryConsentContext;
        moderation: MemoryModerationContext;
        provenance: MemoryWriteProvenance;
      };
      reason: string | null;
      state:
        | "active"
        | "superseded"
        | "suppressed"
        | "flagged_for_review"
        | "expired";
      contradiction?: {
        detected: boolean;
        conflictingDocumentId: string | null;
      };
    },
  ) {
    if (!this.prisma.auditLog?.create) {
      return;
    }
    await this.prisma.auditLog.create({
      data: {
        actorUserId: userId,
        actorType: "user",
        action,
        entityType: "memory",
        entityId: userId,
        metadata: this.toInputJsonValue({
          summaryPreview: this.compressSummary(input.summary, 180),
          class: input.memoryWrite.class,
          governanceTier: input.memoryWrite.governanceTier,
          key: input.memoryWrite.key,
          value: input.memoryWrite.value,
          consent: input.memoryWrite.consent,
          moderation: input.memoryWrite.moderation,
          provenance: input.memoryWrite.provenance,
          state: input.state,
          reason: input.reason,
          contradictionDetected: input.contradiction?.detected ?? false,
          conflictingDocumentId:
            input.contradiction?.conflictingDocumentId ?? null,
        }),
      },
    });
  }

  private async recomputeLifeGraphEdge(input: {
    userId: string;
    sourceNodeId: string;
    targetNodeId: string;
    edgeType: LifeGraphEdgeType;
    explicitPreference?: {
      value: unknown;
    } | null;
    inferredPreference?: {
      value: unknown;
      confidence: number | Prisma.Decimal;
      sourceSignal: string;
    } | null;
  }) {
    const prefKey = this.buildEdgePreferenceKey(
      input.sourceNodeId,
      input.edgeType,
      input.targetNodeId,
    );

    const explicitPreference =
      input.explicitPreference ??
      (await this.prisma.explicitPreference.findFirst({
        where: {
          userId: input.userId,
          scope: LIFE_GRAPH_PREF_SCOPE,
          preferenceKey: prefKey,
        },
        select: {
          value: true,
        },
      }));

    const inferredPreference =
      input.inferredPreference ??
      (await this.prisma.inferredPreference.findFirst({
        where: {
          userId: input.userId,
          preferenceKey: prefKey,
        },
        select: {
          value: true,
          confidence: true,
          sourceSignal: true,
        },
      }));

    const explicitWeight = this.readWeightFromPreferenceValue(
      explicitPreference?.value,
    );
    const inferredWeight = this.readWeightFromPreferenceValue(
      inferredPreference?.value,
    );
    const mergedWeight = this.clampNumber(
      (explicitWeight ?? 0) + (inferredWeight ?? 0),
      -1,
      1,
    );

    const existingEdge = await this.prisma.lifeGraphEdge.findFirst({
      where: {
        userId: input.userId,
        sourceNodeId: input.sourceNodeId,
        targetNodeId: input.targetNodeId,
        edgeType: input.edgeType,
      },
      select: { id: true },
    });

    const edge = existingEdge
      ? await this.prisma.lifeGraphEdge.update({
          where: { id: existingEdge.id },
          data: { weight: mergedWeight },
        })
      : await this.prisma.lifeGraphEdge.create({
          data: {
            userId: input.userId,
            sourceNodeId: input.sourceNodeId,
            targetNodeId: input.targetNodeId,
            edgeType: input.edgeType,
            weight: mergedWeight,
          },
        });

    return {
      id: edge.id,
      userId: edge.userId,
      sourceNodeId: edge.sourceNodeId,
      targetNodeId: edge.targetNodeId,
      edgeType: edge.edgeType,
      weight: Number(edge.weight),
      updatedAt: edge.updatedAt,
      sources: {
        explicitWeight,
        inferredWeight,
        inferredConfidence:
          inferredPreference == null
            ? null
            : this.clampNumber(Number(inferredPreference.confidence), 0, 1),
        inferredSourceSignal: inferredPreference?.sourceSignal ?? null,
      },
    };
  }

  private async ensureUserAnchorNode(userId: string) {
    return this.ensureLifeGraphNode(userId, "person", `user:${userId}`);
  }

  private async ensureLifeGraphNode(
    userId: string,
    nodeType: LifeGraphNodeType,
    label: string,
  ) {
    const normalizedLabel = this.normalizeNodeLabel(nodeType, label);
    const existing = await this.prisma.lifeGraphNode.findFirst({
      where: {
        userId,
        nodeType,
        label: normalizedLabel,
      },
    });

    if (existing) {
      return existing;
    }

    return this.prisma.lifeGraphNode.create({
      data: {
        userId,
        nodeType,
        label: normalizedLabel,
      },
    });
  }

  private async upsertUserPreference(
    userId: string,
    key: string,
    value: unknown,
  ) {
    const existing = await this.prisma.userPreference.findFirst({
      where: {
        userId,
        key,
      },
      select: { id: true },
    });

    if (existing) {
      await this.prisma.userPreference.update({
        where: { id: existing.id },
        data: { value: this.toInputJsonValue(value) },
      });
      return;
    }

    await this.prisma.userPreference.create({
      data: {
        userId,
        key,
        value: this.toInputJsonValue(value),
      },
    });
  }

  private async upsertExplicitLifeGraphPreference(
    userId: string,
    preferenceKey: string,
    value: unknown,
  ) {
    const existing = await this.prisma.explicitPreference.findFirst({
      where: {
        userId,
        scope: LIFE_GRAPH_PREF_SCOPE,
        preferenceKey,
      },
    });

    if (existing) {
      return this.prisma.explicitPreference.update({
        where: { id: existing.id },
        data: {
          value: this.toInputJsonValue(value),
        },
      });
    }

    return this.prisma.explicitPreference.create({
      data: {
        userId,
        scope: LIFE_GRAPH_PREF_SCOPE,
        preferenceKey,
        source: "user",
        value: this.toInputJsonValue(value),
      },
    });
  }

  private deduplicateNodes(nodes: LifeGraphNodeInput[]): LifeGraphNodeInput[] {
    const seen = new Set<string>();
    const deduped: LifeGraphNodeInput[] = [];

    for (const node of nodes) {
      const normalizedLabel = this.normalizeNodeLabel(
        node.nodeType,
        node.label,
      );
      const key = `${node.nodeType}:${normalizedLabel}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      deduped.push({
        nodeType: node.nodeType,
        label: normalizedLabel,
      });
    }

    return deduped;
  }

  private normalizeNodeLabel(nodeType: LifeGraphNodeType, label: string) {
    const trimmed = label.trim().replace(/\s+/g, " ");
    if (nodeType === "person" && trimmed.startsWith("user:")) {
      return `user:${trimmed.slice("user:".length).toLowerCase()}`;
    }
    return trimmed.toLowerCase();
  }

  private buildEdgePreferenceKey(
    sourceNodeId: string,
    edgeType: LifeGraphEdgeType,
    targetNodeId: string,
  ) {
    return `${LIFE_GRAPH_PREF_KEY_PREFIX}${sourceNodeId}:${edgeType}:${targetNodeId}`;
  }

  private limitString(value: unknown, maxLength: number) {
    if (typeof value !== "string") {
      return undefined;
    }
    const normalized = value.trim();
    if (normalized.length === 0) {
      return undefined;
    }
    return normalized.slice(0, maxLength);
  }

  private limitIsoDate(value: unknown) {
    if (typeof value !== "string") {
      return undefined;
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return undefined;
    }
    return parsed.toISOString();
  }

  private readString(value: unknown) {
    if (typeof value !== "string") {
      return null;
    }
    const normalized = value.trim();
    return normalized.length > 0 ? normalized : null;
  }

  private readEnumValue<T extends string>(
    value: unknown,
    allowed: readonly T[],
  ): T | null {
    if (typeof value !== "string") {
      return null;
    }
    return allowed.includes(value as T) ? (value as T) : null;
  }

  private readBooleanValue(value: unknown): boolean | null {
    return typeof value === "boolean" ? value : null;
  }

  private readNumber(value: unknown): number | null {
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  }

  private readStringValue(value: unknown): string | null {
    return typeof value === "string" && value.trim().length > 0
      ? value.trim()
      : null;
  }

  private readStringArrayValue(value: unknown): string[] | null {
    if (!Array.isArray(value)) {
      return null;
    }
    const strings = value.filter((item) => typeof item === "string");
    if (strings.length !== value.length) {
      return null;
    }
    return strings;
  }

  private readJsonObject(value: Prisma.JsonValue | null | undefined) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return {};
    }
    return value as Record<string, unknown>;
  }

  private readWeightFromPreferenceValue(value: unknown): number | null {
    if (typeof value === "number") {
      return this.clampNumber(value, -1, 1);
    }

    if (value == null || typeof value !== "object" || Array.isArray(value)) {
      return null;
    }

    const weight = (value as Record<string, unknown>).weight;
    if (typeof weight !== "number") {
      return null;
    }

    return this.clampNumber(weight, -1, 1);
  }

  private uniqueNormalizedLabels(values: string[]): string[] {
    return Array.from(
      new Set(
        values
          .map((value) => value.trim().toLowerCase())
          .filter((value) => value.length > 0),
      ),
    );
  }

  private isLikelyGameLabel(label: string): boolean {
    return GAME_LABEL_KEYWORDS.some((keyword) => label.includes(keyword));
  }

  private clampNumber(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
  }

  private toInputJsonValue(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  }

  private async trackAnalyticsEventSafe(input: {
    eventType: string;
    actorUserId?: string;
    entityType?: string;
    entityId?: string;
    properties?: Record<string, unknown>;
  }) {
    if (!this.analyticsService) {
      return;
    }
    try {
      await this.analyticsService.trackEvent(input);
    } catch (error) {
      this.logger.warn(
        `failed to record analytics event ${input.eventType}: ${String(error)}`,
      );
    }
  }
}
