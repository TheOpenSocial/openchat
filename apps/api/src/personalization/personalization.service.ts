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
  timezone: string;
  requireVerifiedUsers: boolean;
  notificationMode: "immediate" | "digest" | "quiet";
  agentAutonomy: "manual" | "suggest_only" | "auto_non_risky";
  memoryMode: "minimal" | "standard" | "extended";
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

export interface StoreInteractionSummaryInput {
  summary: string;
  safe?: boolean;
  context?: Record<string, unknown>;
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
  timezone: "UTC",
  requireVerifiedUsers: false,
  notificationMode: "immediate",
  agentAutonomy: "suggest_only",
  memoryMode: "standard",
};

const GLOBAL_RULE_PREF_KEYS: Record<keyof GlobalRules, string> = {
  whoCanContact: "global_rules_who_can_contact",
  reachable: "global_rules_reachable",
  intentMode: "global_rules_intent_mode",
  modality: "global_rules_modality",
  languagePreferences: "global_rules_language_preferences",
  countryPreferences: "global_rules_country_preferences",
  timezone: "global_rules_timezone",
  requireVerifiedUsers: "global_rules_require_verified_users",
  notificationMode: "global_rules_notification_mode",
  agentAutonomy: "global_rules_agent_autonomy",
  memoryMode: "global_rules_memory_mode",
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
const RETRIEVAL_SAFE_DOC_TYPES = [
  RETRIEVAL_DOC_TYPE_PROFILE_SUMMARY,
  RETRIEVAL_DOC_TYPE_PREFERENCE_MEMORY,
  RETRIEVAL_DOC_TYPE_INTERACTION_SUMMARY,
] as const;
const RETRIEVAL_DEFAULT_MAX_CHUNKS = 5;
const RETRIEVAL_DEFAULT_MAX_AGE_DAYS = 30;
const RETRIEVAL_MAX_DOC_SCAN = 50;
const RETRIEVAL_CHUNK_WORD_TARGET = 90;
const RETRIEVAL_UNSAFE_PATTERN =
  /\b(hate|threat|abuse|violence|self-harm|suicide)\b/i;

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
      timezone:
        this.readStringValue(byKey.get(GLOBAL_RULE_PREF_KEYS.timezone)) ??
        GLOBAL_RULE_DEFAULTS.timezone,
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
    const safe =
      input.safe ?? (summary.length > 0 && !this.isUnsafeContent(summary));
    const docType = safe
      ? RETRIEVAL_DOC_TYPE_INTERACTION_SUMMARY
      : RETRIEVAL_DOC_TYPE_INTERACTION_FLAGGED;
    const content = [
      `summary: ${summary}`,
      input.context
        ? `context: ${this.stableStringify(input.context)}`
        : "context: {}",
      `safe: ${String(safe)}`,
    ].join("\n");
    const stored = await this.saveRetrievalDocument(
      userId,
      docType,
      content,
      false,
    );

    return {
      ...stored,
      safe,
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

        const score = this.scoreChunkForQuery(
          queryTokens,
          chunk.content,
          document.createdAt,
          maxAgeDays,
        );

        return {
          documentId: chunk.documentId,
          docType: document.docType,
          chunkIndex: chunk.chunkIndex,
          tokenCount: chunk.tokenCount,
          score,
          createdAt: document.createdAt,
          excerpt: this.trimPreview(chunk.content, 280),
        };
      })
      .filter((item): item is NonNullable<typeof item> => item != null)
      .sort((a, b) => b.score - a.score)
      .slice(0, maxChunks);

    return {
      userId,
      query: input.query,
      maxChunks,
      maxAgeDays,
      staleCutoff,
      results: scoredChunks,
    };
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
        .map((token) => token.trim())
        .filter((token) => token.length >= 3),
    );
  }

  private scoreChunkForQuery(
    queryTokens: Set<string>,
    chunkContent: string,
    createdAt: Date,
    maxAgeDays: number,
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
    const freshnessBoost = Math.max(0, 1 - ageDays / maxAgeDays);
    return overlap * 2 + freshnessBoost;
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

  private stableStringify(value: unknown) {
    if (value == null || typeof value !== "object" || Array.isArray(value)) {
      return JSON.stringify(value);
    }

    const orderedEntries = Object.entries(
      value as Record<string, unknown>,
    ).sort(([a], [b]) => a.localeCompare(b));
    return JSON.stringify(Object.fromEntries(orderedEntries));
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
