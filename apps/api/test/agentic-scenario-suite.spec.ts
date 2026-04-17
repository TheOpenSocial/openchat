import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  agenticScenarioDatasetSchema,
  agenticSyntheticWorldSchema,
  NotificationType,
} from "@opensocial/types";
import { describe, expect, it, vi } from "vitest";
import { ForbiddenException } from "@nestjs/common";
import { AgentOutcomeToolsService } from "../src/agent/agent-outcome-tools.service.js";
import { ChatsService } from "../src/chats/chats.service.js";
import { ConnectionSetupService } from "../src/connections/connection-setup.service.js";
import { DiscoveryService } from "../src/discovery/discovery.service.js";
import { IntentsService } from "../src/intents/intents.service.js";
import { MatchingService } from "../src/matching/matching.service.js";
import { ModerationService } from "../src/moderation/moderation.service.js";
import { RecurringCirclesService } from "../src/recurring-circles/recurring-circles.service.js";
import { ScheduledTasksService } from "../src/scheduled-tasks/scheduled-tasks.service.js";

const scenarioFixturePath = resolve(
  process.cwd(),
  "test/fixtures/agentic-scenarios.json",
);
const worldFixturePath = resolve(
  process.cwd(),
  "test/fixtures/agentic-synthetic-world.json",
);

function loadScenarioFixtures() {
  const scenarios = agenticScenarioDatasetSchema.parse(
    JSON.parse(readFileSync(scenarioFixturePath, "utf8")),
  );
  const world = agenticSyntheticWorldSchema.parse(
    JSON.parse(readFileSync(worldFixturePath, "utf8")),
  );
  return {
    scenarios,
    world,
    scenarioById: new Map(
      scenarios.scenarios.map((scenario) => [scenario.id, scenario]),
    ),
  };
}

function createWorkflowHarness(input: {
  candidateRows: Array<{
    userId: string;
    score: number;
    rationale: Record<string, unknown>;
  }>;
  intentRecord?: Record<string, unknown>;
  followupsEnabled?: boolean;
}) {
  const prisma: any = {
    intent: {
      findUnique: vi.fn().mockResolvedValue({
        id: "intent-1",
        userId: "11111111-1111-4111-8111-111111111111",
        status: "parsed",
        createdAt: new Date(Date.now() - 3 * 60_000),
        parsedIntent: {
          intentType: "chat",
          topics: ["tennis"],
        },
        ...(input.intentRecord ?? {}),
      }),
      update: vi.fn().mockResolvedValue({}),
    },
    intentCandidate: {
      create: vi.fn().mockResolvedValue({}),
    },
    intentRequest: {
      findMany: vi.fn().mockResolvedValue([]),
      createMany: vi
        .fn()
        .mockResolvedValue({ count: input.candidateRows.length }),
      count: vi.fn().mockResolvedValue(0),
    },
    agentThread: {
      findFirst: vi.fn().mockResolvedValue({ id: "thread-fallback" }),
    },
    auditLog: {
      create: vi.fn().mockResolvedValue({}),
    },
    $transaction: vi.fn().mockResolvedValue([]),
  };

  const matchingService: any = {
    retrieveCandidates: vi.fn().mockResolvedValue(input.candidateRows),
  };
  const notificationsService: any = {
    createInAppNotification: vi.fn().mockResolvedValue({ id: "notif-1" }),
  };
  const personalizationService: any = {
    recordIntentSignals: vi.fn().mockResolvedValue({}),
    recordBehaviorSignal: vi.fn().mockResolvedValue({}),
  };
  const agentService: any = {
    appendWorkflowUpdate: vi.fn().mockResolvedValue({}),
  };
  const intentQueue: any = {
    add: vi.fn().mockResolvedValue({}),
  };
  const notificationQueue: any = {
    add: vi.fn().mockResolvedValue({}),
  };
  const launchControlsService: any = {
    getSnapshot: vi.fn().mockResolvedValue({
      globalKillSwitch: false,
      inviteOnlyMode: false,
      alphaCohortUserIds: [],
      enableNewIntents: true,
      enableAgentFollowups: input.followupsEnabled ?? true,
      enableGroupFormation: true,
      enablePushNotifications: true,
      enablePersonalization: true,
      enableDiscovery: true,
      enableModerationStrictness: false,
      enableAiParsing: true,
      enableRealtimeChat: true,
      generatedAt: new Date().toISOString(),
    }),
  };
  const realtimeEventsService: any = {
    emitIntentUpdated: vi.fn(),
    emitRequestCreated: vi.fn(),
    emitRequestUpdated: vi.fn(),
  };
  const workflowRuntimeService: any = {
    buildWorkflowRunId: vi.fn(
      (payload: any) =>
        `${payload.domain}:${payload.entityType}:${payload.entityId}`,
    ),
    checkpoint: vi.fn().mockResolvedValue({}),
    linkSideEffect: vi.fn().mockResolvedValue({}),
  };

  return {
    prisma,
    notificationsService,
    agentService,
    intentQueue,
    notificationQueue,
    workflowRuntimeService,
    service: new IntentsService(
      prisma,
      matchingService,
      notificationsService,
      personalizationService,
      agentService,
      intentQueue,
      notificationQueue,
      undefined,
      launchControlsService,
      realtimeEventsService,
      workflowRuntimeService,
    ),
  };
}

function createDiscoveryHarness(
  overrides: Partial<Record<string, unknown>> = {},
) {
  const now = Date.now();

  const userFindMany =
    (overrides.userFindMany as any) ??
    vi.fn(async (args?: any) => {
      const requestedIds: string[] = Array.isArray(args?.where?.id?.in)
        ? args.where.id.in
        : [];
      if (requestedIds.includes("22222222-2222-4222-8222-222222222222")) {
        if (args.select?.profile) {
          return [
            {
              id: "22222222-2222-4222-8222-222222222222",
              displayName: "Hugo",
              profile: {
                lastActiveAt: new Date(now - 30 * 60_000),
                trustScore: 90,
                moderationState: "clean",
              },
            },
          ];
        }
        return [
          {
            id: "22222222-2222-4222-8222-222222222222",
            displayName: "Hugo",
          },
        ];
      }
      return [];
    });

  const prisma: any = {
    userInterest: {
      findMany:
        overrides.userInterestFindMany ??
        vi.fn().mockResolvedValue([
          {
            normalizedLabel: "tennis",
            userId: "22222222-2222-4222-8222-222222222222",
          },
        ]),
    },
    userTopic: {
      findMany:
        overrides.userTopicFindMany ??
        vi.fn().mockResolvedValue([
          {
            normalizedLabel: "reconnect",
            userId: "22222222-2222-4222-8222-222222222222",
          },
        ]),
    },
    intent: {
      findMany:
        overrides.intentFindMany ??
        vi.fn().mockResolvedValue([
          {
            id: "intent-passive-1",
            userId: "22222222-2222-4222-8222-222222222222",
            status: "matching",
            parsedIntent: { topics: ["tennis"], activities: ["chat"] },
            createdAt: new Date(now - 60 * 60_000),
          },
        ]),
    },
    user: {
      findMany: userFindMany,
    },
    lifeGraphEdge: {
      findMany:
        overrides.lifeGraphEdgeFindMany ??
        vi
          .fn()
          .mockResolvedValue([{ targetNodeId: "node-hugo", weight: 0.95 }]),
    },
    lifeGraphNode: {
      findMany:
        overrides.lifeGraphNodeFindMany ??
        vi
          .fn()
          .mockResolvedValue([
            { id: "node-hugo", nodeType: "person", label: "hugo" },
          ]),
    },
    connectionParticipant: {
      findMany:
        overrides.connectionParticipantFindMany ??
        vi
          .fn()
          .mockResolvedValueOnce([
            {
              connectionId: "conn-1",
              connection: {
                createdAt: new Date(now - 3 * 24 * 60 * 60_000),
              },
            },
          ])
          .mockResolvedValueOnce([
            {
              userId: "22222222-2222-4222-8222-222222222222",
              connectionId: "conn-1",
            },
          ]),
    },
    block: {
      findMany: overrides.blockFindMany ?? vi.fn().mockResolvedValue([]),
    },
    userPreference: {
      findMany:
        overrides.userPreferenceFindMany ?? vi.fn().mockResolvedValue([]),
    },
    userReport: {
      findMany: overrides.userReportFindMany ?? vi.fn().mockResolvedValue([]),
    },
    agentThread: {
      findFirst:
        overrides.agentThreadFindFirst ??
        vi.fn().mockResolvedValue({ id: "thread-1" }),
    },
  };

  const matchingService: any = {
    retrieveCandidates:
      overrides.retrieveCandidates ??
      vi.fn().mockResolvedValue([
        {
          userId: "22222222-2222-4222-8222-222222222222",
          score: 0.91,
          rationale: {
            semanticSimilarity: 0.95,
            personalizationBoost: 0.8,
            trustScoreNormalized: 0.92,
          },
        },
      ]),
  };

  const personalizationService: any = {
    getGlobalRules:
      overrides.getGlobalRules ??
      vi.fn().mockResolvedValue({
        whoCanContact: "anyone",
        reachable: "always",
        intentMode: "balanced",
        modality: "either",
        languagePreferences: [],
        countryPreferences: [],
        requireVerifiedUsers: false,
        notificationMode: "immediate",
        agentAutonomy: "suggest_only",
        memoryMode: "standard",
      }),
  };

  const agentService: any = {
    appendWorkflowUpdate:
      overrides.appendWorkflowUpdate ?? vi.fn().mockResolvedValue({}),
  };

  const inboxService: any = {
    listPendingRequests:
      overrides.listPendingRequests ?? vi.fn().mockResolvedValue([]),
  };

  return {
    agentService,
    service: new DiscoveryService(
      prisma,
      matchingService,
      personalizationService,
      agentService,
      inboxService,
    ),
  };
}

describe("Agentic scenario suite", () => {
  it("keeps the shared scenario corpus and synthetic world valid with stable ids", () => {
    const { scenarios, world } = loadScenarioFixtures();
    const ids = scenarios.scenarios.map((scenario) => scenario.id);
    const coverage = scenarios.domainCoverage;

    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(
      expect.arrayContaining([
        "social_direct_match_v1",
        "social_no_match_recovery_v1",
        "social_followup_launch_controls_disabled_v1",
        "accepted_request_replay_dedupe_v1",
        "blocked_user_exclusion_v1",
        "country_language_mismatch_v1",
        "trust_gate_v1",
        "reconnect_signal_v1",
        "blocked_reconnect_filtered_v1",
        "muted_reconnect_filtered_v1",
        "reported_reconnect_filtered_v1",
        "passive_discovery_bundle_v1",
        "inbox_pending_request_context_v1",
        "agent_recommendations_publish_v1",
        "delayed_widening_retry_v1",
        "group_suggestions_topic_cluster_v1",
        "group_backfill_replay_dedupe_v1",
        "group_ready_replay_dedupe_v1",
        "blocked_group_chat_message_v1",
        "blocked_dm_chat_message_v1",
        "muted_group_chat_message_v1",
        "reported_dm_chat_message_v1",
        "group_archive_after_leave_v1",
        "blocked_circle_member_add_v1",
        "muted_circle_member_add_v1",
        "muted_circle_member_add_reverse_v1",
        "reported_circle_member_add_v1",
        "discovery_briefing_delivery_v1",
        "reconnect_briefing_delivery_v1",
        "saved_search_delivery_v1",
        "social_reminder_delivery_v1",
        "saved_search_below_threshold_v1",
        "social_reminder_agent_thread_only_v1",
        "saved_search_no_results_suppressed_v1",
        "social_reminder_quiet_hours_v1",
        "social_negotiation_async_defer_v1",
        "dating_verified_consent_granted_v1",
        "dating_consent_revoked_v1",
        "dating_no_match_recovery_v1",
        "dating_blocked_cross_over_v1",
        "commerce_listing_created_v1",
        "commerce_buyer_seller_negotiation_v1",
        "commerce_offer_counteroffer_v1",
        "commerce_offer_accept_escrow_v1",
        "commerce_offer_dispute_v1",
        "commerce_offer_fulfillment_v1",
        "scam_spam_review_v1",
        "underage_illegal_block_v1",
        "underage_coercive_review_v1",
        "workflow_failure_llm_schema_v1",
        "workflow_failure_queue_replay_v1",
        "workflow_failure_notification_followup_v1",
        "workflow_failure_persistence_dedupe_v1",
        "workflow_failure_latency_capacity_v1",
        "workflow_failure_observability_gap_v1",
        "eval_planning_bounds_v1",
        "eval_injection_fallback_v1",
        "eval_moderation_fallback_v1",
        "eval_human_approval_policy_v1",
        "eval_failure_capture_v1",
        "eval_social_outcome_telemetry_v1",
        "eval_tone_agentic_async_ack_v1",
        "eval_usefulness_no_match_recovery_v1",
        "eval_grounding_profile_memory_consistency_v1",
        "eval_memory_dm_inference_quality_v1",
        "eval_memory_group_inference_quality_v1",
        "eval_memory_unsafe_suppression_v1",
        "eval_memory_disputed_explainability_v1",
        "eval_memory_grounding_after_contradiction_v1",
        "eval_negotiation_quality_v1",
        "eval_workflow_runtime_traceability_v1",
      ]),
    );
    expect(coverage.map((entry) => entry.domain)).toEqual(
      expect.arrayContaining([
        "social",
        "passive_discovery",
        "groups_and_circles",
        "events_and_reminders",
        "dating_ready",
        "commerce",
        "safety_moderation",
        "eval_runtime",
      ]),
    );
    expect(coverage.every((entry) => entry.status === "supported")).toBe(true);
    expect(coverage.find((entry) => entry.domain === "social")?.status).toBe(
      "supported",
    );
    expect(coverage.find((entry) => entry.domain === "commerce")?.status).toBe(
      "supported",
    );
    expect(
      coverage.find((entry) => entry.domain === "dating_ready")?.status,
    ).toBe("supported");
    expect(world.users.length).toBeGreaterThanOrEqual(11);
    expect(world.relationships.some((edge) => edge.type === "blocked")).toBe(
      true,
    );
  });

  it("keeps domain release-gate layer mappings aligned with canonical scenario layer targets", () => {
    const { scenarios } = loadScenarioFixtures();
    const scenarioById = new Map(
      scenarios.scenarios.map((scenario) => [scenario.id, scenario]),
    );

    for (const coverageEntry of scenarios.domainCoverage) {
      for (const layer of coverageEntry.releaseGateLayers) {
        if (layer === "full") {
          continue;
        }
        const hasScenarioForLayer = coverageEntry.scenarioIds.some(
          (scenarioId) =>
            scenarioById.get(scenarioId)?.layerTargets.includes(layer),
        );
        expect(hasScenarioForLayer).toBe(true);
      }
    }
  });

  it("keeps workflow failure-family scenarios wired into the canonical corpus", () => {
    const { scenarioById } = loadScenarioFixtures();
    const entries = [
      {
        id: "workflow_failure_llm_schema_v1",
        outcome: "failure_class_llm_or_schema",
      },
      {
        id: "workflow_failure_queue_replay_v1",
        outcome: "failure_class_queue_or_replay",
      },
      {
        id: "workflow_failure_notification_followup_v1",
        outcome: "failure_class_notification_or_followup",
      },
      {
        id: "workflow_failure_persistence_dedupe_v1",
        outcome: "failure_class_persistence_or_dedupe",
      },
      {
        id: "workflow_failure_latency_capacity_v1",
        outcome: "failure_class_latency_or_capacity",
      },
      {
        id: "workflow_failure_observability_gap_v1",
        outcome: "failure_class_observability_gap",
      },
    ] as const;

    for (const entry of entries) {
      const scenario = scenarioById.get(entry.id);
      if (!scenario) {
        throw new Error(`missing scenario ${entry.id}`);
      }
      expect(scenario.layerTargets).toContain("scenario");
      expect(scenario.expected.primaryOutcome).toBe(entry.outcome);
      expect(scenario.expected.workflowStages.length).toBeGreaterThan(0);
    }
  });

  it("executes the direct-match workflow scenario with fanout and async follow-up", async () => {
    const { scenarioById } = loadScenarioFixtures();
    const scenario = scenarioById.get("social_direct_match_v1");
    if (!scenario) {
      throw new Error("missing scenario social_direct_match_v1");
    }

    const { service, prisma, notificationQueue, workflowRuntimeService } =
      createWorkflowHarness({
        candidateRows: [
          {
            userId: "22222222-2222-4222-8222-222222222222",
            score: 0.95,
            rationale: { semanticSimilarity: 0.95, trustScoreNormalized: 0.88 },
          },
        ],
      });

    const result = await service.processIntentPipeline(
      "intent-1",
      "trace-direct-match",
      "33333333-3333-4333-8333-333333333333",
    );

    expect(result.fanoutCount).toBe(1);
    expect(prisma.intentRequest.createMany).toHaveBeenCalledTimes(1);
    expect(notificationQueue.add).toHaveBeenCalledWith(
      "AsyncAgentFollowup",
      expect.objectContaining({
        type: "AsyncAgentFollowup",
        payload: expect.objectContaining({
          template: scenario.expected.followupTemplate,
        }),
      }),
      expect.any(Object),
    );
    expect(workflowRuntimeService.checkpoint).toHaveBeenCalledWith(
      expect.objectContaining({
        stage: "fanout",
        status: "completed",
      }),
    );
  });

  it("executes the no-match recovery workflow scenario with async recovery follow-up", async () => {
    const { scenarioById } = loadScenarioFixtures();
    const scenario = scenarioById.get("social_no_match_recovery_v1");
    if (!scenario) {
      throw new Error("missing scenario social_no_match_recovery_v1");
    }

    const { service, notificationQueue, intentQueue, workflowRuntimeService } =
      createWorkflowHarness({
        candidateRows: [],
      });

    const result = await service.processIntentPipeline(
      "intent-1",
      "trace-no-match",
      "33333333-3333-4333-8333-333333333333",
    );

    expect(result.fanoutCount).toBe(0);
    expect(notificationQueue.add).toHaveBeenCalledWith(
      "AsyncAgentFollowup",
      expect.objectContaining({
        type: "AsyncAgentFollowup",
        payload: expect.objectContaining({
          template: scenario.expected.followupTemplate,
          notificationType: NotificationType.AGENT_UPDATE,
        }),
      }),
      expect.any(Object),
    );
    expect(intentQueue.add).toHaveBeenCalledWith(
      "IntentCreated",
      expect.objectContaining({
        type: "IntentCreated",
        idempotencyKey: "intent-created:intent-1:no_candidates",
      }),
      expect.objectContaining({
        jobId: "intent-created:intent-1:no_candidates",
      }),
    );
    expect(workflowRuntimeService.checkpoint).toHaveBeenCalledWith(
      expect.objectContaining({
        stage: "routing_pipeline",
        status: "completed",
      }),
    );
  });

  it("executes launch-control followup skip scenario with skipped followup checkpoint", async () => {
    const { scenarioById } = loadScenarioFixtures();
    const scenario = scenarioById.get(
      "social_followup_launch_controls_disabled_v1",
    );
    if (!scenario) {
      throw new Error(
        "missing scenario social_followup_launch_controls_disabled_v1",
      );
    }

    const { service, notificationQueue, workflowRuntimeService } =
      createWorkflowHarness({
        candidateRows: [],
        followupsEnabled: false,
      });

    const result = await service.processIntentPipeline(
      "intent-1",
      "trace-followup-disabled",
      "33333333-3333-4333-8333-333333333333",
    );

    expect(result.fanoutCount).toBe(0);
    expect(notificationQueue.add).not.toHaveBeenCalledWith(
      "AsyncAgentFollowup",
      expect.anything(),
      expect.anything(),
    );
    expect(workflowRuntimeService.checkpoint).toHaveBeenCalledWith(
      expect.objectContaining({
        stage: "followup_enqueue",
        status: "skipped",
        metadata: expect.objectContaining({
          reason: "launch_controls_disabled",
        }),
      }),
    );
    expect(scenario.expected.primaryOutcome).toBe(
      "followup_skipped_launch_controls",
    );
  });

  it("executes accepted-request replay dedupe scenario with exactly-once visible outcomes", async () => {
    const { scenarioById } = loadScenarioFixtures();
    const scenario = scenarioById.get("accepted_request_replay_dedupe_v1");
    if (!scenario) {
      throw new Error("missing scenario accepted_request_replay_dedupe_v1");
    }

    const sideEffectRows: Array<{
      action: string;
      entityType: string;
      entityId: string;
      createdAt: Date;
      metadata: Record<string, unknown>;
    }> = [];
    const notificationsById = new Map<string, any>();
    const messagesById = new Map<string, any>();
    let notificationCounter = 0;
    let messageCounter = 0;

    const prisma: any = {
      intentRequest: {
        findUnique: vi.fn().mockResolvedValue({
          id: "req-replay-scenario",
          status: "accepted",
          intentId: "intent-replay-scenario",
          senderUserId: "user-1",
          recipientUserId: "user-2",
        }),
        findMany: vi.fn().mockResolvedValue([]),
      },
      intent: {
        findUnique: vi.fn().mockResolvedValue({
          id: "intent-replay-scenario",
          parsedIntent: { intentType: "chat" },
        }),
        update: vi.fn().mockResolvedValue({}),
      },
      connection: {
        findFirst: vi.fn().mockResolvedValue({
          id: "conn-replay-scenario",
          type: "dm",
          originIntentId: "intent-replay-scenario",
        }),
      },
      connectionParticipant: {
        findMany: vi.fn().mockResolvedValue([
          { userId: "user-1", leftAt: null },
          { userId: "user-2", leftAt: null },
        ]),
        createMany: vi.fn().mockResolvedValue({}),
      },
      chat: {
        findFirst: vi.fn().mockResolvedValue({
          id: "chat-replay-scenario",
          connectionId: "conn-replay-scenario",
          type: "dm",
        }),
      },
      chatMembership: {
        findMany: vi.fn().mockResolvedValue([
          { chatId: "chat-replay-scenario", userId: "user-1" },
          { chatId: "chat-replay-scenario", userId: "user-2" },
        ]),
        createMany: vi.fn().mockResolvedValue({}),
      },
      agentThread: {
        findFirst: vi.fn().mockResolvedValue({ id: "thread-replay-scenario" }),
      },
      notification: {
        findUnique: vi.fn().mockImplementation(({ where }: any) => {
          return Promise.resolve(notificationsById.get(where.id) ?? null);
        }),
      },
      agentMessage: {
        findUnique: vi.fn().mockImplementation(({ where }: any) => {
          return Promise.resolve(messagesById.get(where.id) ?? null);
        }),
      },
      auditLog: {
        findMany: vi.fn().mockImplementation(({ where }: any) => {
          const gte = where?.createdAt?.gte as Date | undefined;
          const rows = sideEffectRows.filter((row) => {
            if (where?.action && row.action !== where.action) {
              return false;
            }
            if (where?.entityType && row.entityType !== where.entityType) {
              return false;
            }
            if (gte && row.createdAt < gte) {
              return false;
            }
            return true;
          });
          return Promise.resolve(
            rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
          );
        }),
      },
    };

    const notificationsService: any = {
      createInAppNotification: vi
        .fn()
        .mockImplementation(
          (recipientUserId: string, type: NotificationType, body: string) => {
            const notification = {
              id: `notification-${++notificationCounter}`,
              recipientUserId,
              type,
              body,
            };
            notificationsById.set(notification.id, notification);
            return Promise.resolve(notification);
          },
        ),
    };
    const agentService: any = {
      createAgentMessage: vi
        .fn()
        .mockImplementation((threadId: string, content: string) => {
          const message = {
            id: `agent-message-${++messageCounter}`,
            threadId,
            content,
          };
          messagesById.set(message.id, message);
          return Promise.resolve(message);
        }),
    };
    const workflowRuntimeService: any = {
      buildWorkflowRunId: vi
        .fn()
        .mockReturnValue("social:intent_request:req-replay-scenario"),
      startRun: vi.fn().mockResolvedValue(undefined),
      checkpoint: vi.fn().mockResolvedValue(undefined),
      linkSideEffect: vi.fn().mockImplementation((input: any) => {
        sideEffectRows.push({
          action: "agent.workflow_side_effect_linked",
          entityType: input.entityType,
          entityId: input.entityId,
          createdAt: new Date(),
          metadata: {
            workflowRunId: input.workflowRunId,
            relation: input.relation,
            ...(input.metadata ?? {}),
          },
        });
        return Promise.resolve(undefined);
      }),
    };

    const service = new ConnectionSetupService(
      prisma,
      {} as any,
      {
        createChat: vi.fn(),
        createMessage: vi.fn(),
        createSystemMessage: vi.fn(),
      } as any,
      notificationsService,
      {
        recordBehaviorSignal: vi.fn().mockResolvedValue({}),
        storeInteractionSummary: vi.fn().mockResolvedValue({}),
      } as any,
      {
        upsertConversationSummaryEmbedding: vi.fn().mockResolvedValue({}),
      } as any,
      {
        recordGroupFormationStalled: vi.fn().mockResolvedValue(undefined),
      } as any,
      undefined,
      undefined,
      undefined,
      workflowRuntimeService,
      { get: vi.fn().mockReturnValue(agentService) } as any,
    );

    await service.setupFromAcceptedRequest("req-replay-scenario", "trace-1");
    await service.setupFromAcceptedRequest("req-replay-scenario", "trace-2");

    expect(notificationsService.createInAppNotification).toHaveBeenCalledTimes(
      2,
    );
    expect(agentService.createAgentMessage).toHaveBeenCalledTimes(1);
    expect(workflowRuntimeService.checkpoint).toHaveBeenCalledWith(
      expect.objectContaining({
        stage: scenario.expected.workflowStages[0],
        status: "completed",
      }),
    );

    const dedupedSideEffects = workflowRuntimeService.linkSideEffect.mock.calls
      .map(([input]: [any]) => input)
      .filter((input: any) => input?.metadata?.deduped === true);
    const dedupedRelations = new Set(
      dedupedSideEffects.map((input: any) => input.relation),
    );
    const expectedDedupedRelations = scenario.expected.sideEffects
      .filter((sideEffect) => sideEffect.mode === "deduped")
      .map((sideEffect) => sideEffect.relation);

    for (const relation of expectedDedupedRelations) {
      expect(dedupedRelations.has(relation)).toBe(true);
    }
  });

  it("executes group backfill replay dedupe scenario with exactly-once visible outcomes", async () => {
    const { scenarioById } = loadScenarioFixtures();
    const scenario = scenarioById.get("group_backfill_replay_dedupe_v1");
    if (!scenario) {
      throw new Error("missing scenario group_backfill_replay_dedupe_v1");
    }

    const sideEffectRows: Array<{
      action: string;
      entityType: string;
      entityId: string;
      createdAt: Date;
      metadata: Record<string, unknown>;
    }> = [];
    const notificationsById = new Map<string, any>();
    const messagesById = new Map<string, any>();
    let notificationCounter = 0;
    let messageCounter = 0;

    const intentRequestFindMany = vi.fn(async (args?: any) => {
      if (args?.where?.status === "accepted") {
        return [{ recipientUserId: "user-2" }];
      }
      return [{ recipientUserId: "user-2", status: "accepted", wave: 1 }];
    });

    const prisma: any = {
      intentRequest: {
        findUnique: vi.fn().mockResolvedValue({
          id: "req-group-replay-scenario",
          status: "accepted",
          intentId: "intent-group-replay-scenario",
          senderUserId: "user-1",
          recipientUserId: "user-2",
        }),
        findMany: intentRequestFindMany,
        createMany: vi.fn().mockResolvedValue({ count: 2 }),
      },
      intent: {
        findUnique: vi.fn().mockResolvedValue({
          id: "intent-group-replay-scenario",
          createdAt: new Date(),
          parsedIntent: { intentType: "group", groupSizeTarget: 4 },
        }),
        update: vi.fn().mockResolvedValue({}),
      },
      intentCandidate: {
        findMany: vi.fn().mockResolvedValue([
          { candidateUserId: "user-3", rationale: { semantic: 0.9 } },
          { candidateUserId: "user-4", rationale: { semantic: 0.8 } },
        ]),
      },
      connection: {
        findFirst: vi.fn().mockResolvedValue({
          id: "conn-group-replay-scenario",
          type: "group",
          originIntentId: "intent-group-replay-scenario",
        }),
      },
      connectionParticipant: {
        findMany: vi.fn().mockResolvedValue([
          { userId: "user-1", leftAt: null },
          { userId: "user-2", leftAt: null },
        ]),
        createMany: vi.fn().mockResolvedValue({}),
      },
      chat: {
        findFirst: vi.fn().mockResolvedValue({
          id: "chat-group-replay-scenario",
          connectionId: "conn-group-replay-scenario",
          type: "group",
        }),
      },
      chatMembership: {
        findMany: vi.fn().mockResolvedValue([
          { chatId: "chat-group-replay-scenario", userId: "user-1" },
          { chatId: "chat-group-replay-scenario", userId: "user-2" },
        ]),
        createMany: vi.fn().mockResolvedValue({}),
      },
      agentThread: {
        findFirst: vi
          .fn()
          .mockResolvedValue({ id: "thread-group-replay-scenario" }),
      },
      notification: {
        findUnique: vi.fn().mockImplementation(({ where }: any) => {
          return Promise.resolve(notificationsById.get(where.id) ?? null);
        }),
      },
      agentMessage: {
        findUnique: vi.fn().mockImplementation(({ where }: any) => {
          return Promise.resolve(messagesById.get(where.id) ?? null);
        }),
      },
      auditLog: {
        findMany: vi.fn().mockImplementation(({ where }: any) => {
          const gte = where?.createdAt?.gte as Date | undefined;
          const rows = sideEffectRows.filter((row) => {
            if (where?.action && row.action !== where.action) {
              return false;
            }
            if (where?.entityType && row.entityType !== where.entityType) {
              return false;
            }
            if (gte && row.createdAt < gte) {
              return false;
            }
            return true;
          });
          return Promise.resolve(
            rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
          );
        }),
      },
    };

    const notificationsService: any = {
      createInAppNotification: vi
        .fn()
        .mockImplementation(
          (recipientUserId: string, type: NotificationType, body: string) => {
            const notification = {
              id: `notification-${++notificationCounter}`,
              recipientUserId,
              type,
              body,
            };
            notificationsById.set(notification.id, notification);
            return Promise.resolve(notification);
          },
        ),
    };
    const agentService: any = {
      createAgentMessage: vi
        .fn()
        .mockImplementation((threadId: string, content: string) => {
          const message = {
            id: `agent-message-${++messageCounter}`,
            threadId,
            content,
          };
          messagesById.set(message.id, message);
          return Promise.resolve(message);
        }),
    };
    const workflowRuntimeService: any = {
      buildWorkflowRunId: vi
        .fn()
        .mockReturnValue("social:intent_request:req-group-replay-scenario"),
      startRun: vi.fn().mockResolvedValue(undefined),
      checkpoint: vi.fn().mockResolvedValue(undefined),
      linkSideEffect: vi.fn().mockImplementation((input: any) => {
        sideEffectRows.push({
          action: "agent.workflow_side_effect_linked",
          entityType: input.entityType,
          entityId: input.entityId,
          createdAt: new Date(),
          metadata: {
            workflowRunId: input.workflowRunId,
            relation: input.relation,
            ...(input.metadata ?? {}),
          },
        });
        return Promise.resolve(undefined);
      }),
    };

    const service = new ConnectionSetupService(
      prisma,
      {
        createConnection: vi
          .fn()
          .mockResolvedValue({ id: "conn-group-replay-scenario" }),
      } as any,
      {
        createChat: vi
          .fn()
          .mockResolvedValue({ id: "chat-group-replay-scenario" }),
        createMessage: vi.fn().mockResolvedValue({}),
        createSystemMessage: vi.fn().mockResolvedValue({}),
      } as any,
      notificationsService,
      {
        recordBehaviorSignal: vi.fn().mockResolvedValue({}),
        storeInteractionSummary: vi.fn().mockResolvedValue({}),
      } as any,
      {
        upsertConversationSummaryEmbedding: vi.fn().mockResolvedValue({}),
      } as any,
      {
        recordGroupFormationStalled: vi.fn().mockResolvedValue(undefined),
      } as any,
      undefined,
      undefined,
      undefined,
      workflowRuntimeService,
      { get: vi.fn().mockReturnValue(agentService) } as any,
    );

    await service.setupFromAcceptedRequest(
      "req-group-replay-scenario",
      "trace-1",
    );
    await service.setupFromAcceptedRequest(
      "req-group-replay-scenario",
      "trace-2",
    );

    expect(notificationsService.createInAppNotification).toHaveBeenCalledTimes(
      3,
    );
    expect(agentService.createAgentMessage).toHaveBeenCalledTimes(2);
    expect(workflowRuntimeService.checkpoint).toHaveBeenCalledWith(
      expect.objectContaining({
        stage: scenario.expected.workflowStages[0],
        status: "degraded",
      }),
    );

    const dedupedSideEffects = workflowRuntimeService.linkSideEffect.mock.calls
      .map(([input]: [any]) => input)
      .filter((input: any) => input?.metadata?.deduped === true);
    const dedupedRelations = new Set(
      dedupedSideEffects.map((input: any) => input.relation),
    );
    const expectedDedupedRelations = scenario.expected.sideEffects
      .filter((sideEffect) => sideEffect.mode === "deduped")
      .map((sideEffect) => sideEffect.relation);

    for (const relation of expectedDedupedRelations) {
      expect(dedupedRelations.has(relation)).toBe(true);
    }
  });

  it("executes group-ready replay dedupe scenario with exactly-once visible outcomes", async () => {
    const { scenarioById } = loadScenarioFixtures();
    const scenario = scenarioById.get("group_ready_replay_dedupe_v1");
    if (!scenario) {
      throw new Error("missing scenario group_ready_replay_dedupe_v1");
    }

    const sideEffectRows: Array<{
      action: string;
      entityType: string;
      entityId: string;
      createdAt: Date;
      metadata: Record<string, unknown>;
    }> = [];
    const notificationsById = new Map<string, any>();
    const messagesById = new Map<string, any>();
    let notificationCounter = 0;
    let messageCounter = 0;

    const intentRequestFindMany = vi.fn(async (args?: any) => {
      if (args?.where?.status === "accepted") {
        return [{ recipientUserId: "user-2" }, { recipientUserId: "user-3" }];
      }
      return [
        { recipientUserId: "user-2", status: "accepted", wave: 1 },
        { recipientUserId: "user-3", status: "accepted", wave: 1 },
      ];
    });

    const prisma: any = {
      intentRequest: {
        findUnique: vi.fn().mockResolvedValue({
          id: "req-group-ready-replay-scenario",
          status: "accepted",
          intentId: "intent-group-ready-replay-scenario",
          senderUserId: "user-1",
          recipientUserId: "user-2",
        }),
        findMany: intentRequestFindMany,
      },
      intent: {
        findUnique: vi.fn().mockResolvedValue({
          id: "intent-group-ready-replay-scenario",
          createdAt: new Date(),
          parsedIntent: { intentType: "group", groupSizeTarget: 3 },
        }),
        update: vi.fn().mockResolvedValue({}),
      },
      connection: {
        findFirst: vi.fn().mockResolvedValue({
          id: "conn-group-ready-replay-scenario",
          type: "group",
          originIntentId: "intent-group-ready-replay-scenario",
        }),
      },
      connectionParticipant: {
        findMany: vi.fn().mockResolvedValue([
          { userId: "user-1", leftAt: null },
          { userId: "user-2", leftAt: null },
          { userId: "user-3", leftAt: null },
        ]),
        createMany: vi.fn().mockResolvedValue({}),
      },
      chat: {
        findFirst: vi.fn().mockResolvedValue({
          id: "chat-group-ready-replay-scenario",
          connectionId: "conn-group-ready-replay-scenario",
          type: "group",
        }),
      },
      chatMembership: {
        findMany: vi.fn().mockResolvedValue([
          { chatId: "chat-group-ready-replay-scenario", userId: "user-1" },
          { chatId: "chat-group-ready-replay-scenario", userId: "user-2" },
          { chatId: "chat-group-ready-replay-scenario", userId: "user-3" },
        ]),
        createMany: vi.fn().mockResolvedValue({}),
      },
      agentThread: {
        findFirst: vi
          .fn()
          .mockResolvedValue({ id: "thread-group-ready-replay-scenario" }),
      },
      notification: {
        findUnique: vi.fn().mockImplementation(({ where }: any) => {
          return Promise.resolve(notificationsById.get(where.id) ?? null);
        }),
      },
      agentMessage: {
        findUnique: vi.fn().mockImplementation(({ where }: any) => {
          return Promise.resolve(messagesById.get(where.id) ?? null);
        }),
      },
      auditLog: {
        findMany: vi.fn().mockImplementation(({ where }: any) => {
          const gte = where?.createdAt?.gte as Date | undefined;
          const rows = sideEffectRows.filter((row) => {
            if (where?.action && row.action !== where.action) {
              return false;
            }
            if (where?.entityType && row.entityType !== where.entityType) {
              return false;
            }
            if (gte && row.createdAt < gte) {
              return false;
            }
            return true;
          });
          return Promise.resolve(
            rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
          );
        }),
      },
    };

    const notificationsService: any = {
      createInAppNotification: vi
        .fn()
        .mockImplementation(
          (recipientUserId: string, type: NotificationType, body: string) => {
            const notification = {
              id: `notification-${++notificationCounter}`,
              recipientUserId,
              type,
              body,
            };
            notificationsById.set(notification.id, notification);
            return Promise.resolve(notification);
          },
        ),
    };
    const agentService: any = {
      createAgentMessage: vi
        .fn()
        .mockImplementation((threadId: string, content: string) => {
          const message = {
            id: `agent-message-${++messageCounter}`,
            threadId,
            content,
          };
          messagesById.set(message.id, message);
          return Promise.resolve(message);
        }),
    };
    const workflowRuntimeService: any = {
      buildWorkflowRunId: vi
        .fn()
        .mockReturnValue(
          "social:intent_request:req-group-ready-replay-scenario",
        ),
      startRun: vi.fn().mockResolvedValue(undefined),
      checkpoint: vi.fn().mockResolvedValue(undefined),
      linkSideEffect: vi.fn().mockImplementation((input: any) => {
        sideEffectRows.push({
          action: "agent.workflow_side_effect_linked",
          entityType: input.entityType,
          entityId: input.entityId,
          createdAt: new Date(),
          metadata: {
            workflowRunId: input.workflowRunId,
            relation: input.relation,
            ...(input.metadata ?? {}),
          },
        });
        return Promise.resolve(undefined);
      }),
    };

    const service = new ConnectionSetupService(
      prisma,
      {
        createConnection: vi
          .fn()
          .mockResolvedValue({ id: "conn-group-ready-replay-scenario" }),
      } as any,
      {
        createChat: vi
          .fn()
          .mockResolvedValue({ id: "chat-group-ready-replay-scenario" }),
        createMessage: vi.fn().mockResolvedValue({}),
        createSystemMessage: vi.fn().mockResolvedValue({}),
      } as any,
      notificationsService,
      {
        recordBehaviorSignal: vi.fn().mockResolvedValue({}),
        storeInteractionSummary: vi.fn().mockResolvedValue({}),
      } as any,
      {
        upsertConversationSummaryEmbedding: vi.fn().mockResolvedValue({}),
      } as any,
      {
        recordGroupFormationStalled: vi.fn().mockResolvedValue(undefined),
      } as any,
      undefined,
      undefined,
      undefined,
      workflowRuntimeService,
      { get: vi.fn().mockReturnValue(agentService) } as any,
    );

    await service.setupFromAcceptedRequest(
      "req-group-ready-replay-scenario",
      "trace-1",
    );
    await service.setupFromAcceptedRequest(
      "req-group-ready-replay-scenario",
      "trace-2",
    );

    expect(notificationsService.createInAppNotification).toHaveBeenCalledTimes(
      3,
    );
    expect(agentService.createAgentMessage).toHaveBeenCalledTimes(1);
    expect(workflowRuntimeService.checkpoint).toHaveBeenCalledWith(
      expect.objectContaining({
        stage: scenario.expected.workflowStages[0],
        status: "completed",
      }),
    );

    const dedupedSideEffects = workflowRuntimeService.linkSideEffect.mock.calls
      .map(([input]: [any]) => input)
      .filter((input: any) => input?.metadata?.deduped === true);
    const dedupedRelations = new Set(
      dedupedSideEffects.map((input: any) => input.relation),
    );
    const expectedDedupedRelations = scenario.expected.sideEffects
      .filter((sideEffect) => sideEffect.mode === "deduped")
      .map((sideEffect) => sideEffect.relation);

    for (const relation of expectedDedupedRelations) {
      expect(dedupedRelations.has(relation)).toBe(true);
    }
  });

  it("filters blocked candidates in the blocked-user scenario", async () => {
    const { scenarioById } = loadScenarioFixtures();
    const scenario = scenarioById.get("blocked_user_exclusion_v1");
    if (!scenario) {
      throw new Error("missing scenario blocked_user_exclusion_v1");
    }

    const prisma: any = {
      user: {
        findUnique: async () => ({
          id: scenario.userState.userId,
          googleSubjectId: "sender-google",
          email: "sender@example.com",
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
          profile: { trustScore: 72, availabilityMode: "now" },
        }),
        findMany: async () =>
          scenario.candidatePool.map((candidate) => ({
            id: candidate.userId,
            displayName: candidate.displayName,
            status: "active",
            createdAt: new Date("2026-01-01T00:00:00.000Z"),
            email: `${candidate.userId}@example.com`,
            googleSubjectId: null,
            profile: {
              availabilityMode: candidate.availabilityMode ?? "now",
              trustScore: candidate.trustScore ?? 0,
              country: candidate.country,
              city: candidate.city,
            },
          })),
      },
      block: {
        findMany: async () => [
          {
            blockerUserId: scenario.userState.userId,
            blockedUserId: scenario.candidatePool[0]?.userId,
          },
        ],
      },
      userInterest: {
        findMany: async () =>
          scenario.candidatePool.flatMap((candidate) =>
            candidate.sharedTopics.map((topic) => ({
              userId: candidate.userId,
              normalizedLabel: topic.toLowerCase(),
            })),
          ),
      },
      userTopic: { findMany: async () => [] },
      intentRequest: { findMany: async () => [] },
      userPreference: { findMany: async () => [] },
    };

    const service = new MatchingService(prisma);
    const results = await service.retrieveCandidates(
      scenario.userState.userId,
      {
        topics: ["boardgames"],
        intentType: "chat",
      },
      5,
    );

    expect(results).toHaveLength(1);
  });

  it("filters country and language mismatches in the scenario corpus", async () => {
    const { scenarioById } = loadScenarioFixtures();
    const scenario = scenarioById.get("country_language_mismatch_v1");
    if (!scenario) {
      throw new Error("missing scenario country_language_mismatch_v1");
    }

    const prisma: any = {
      user: {
        findUnique: async () => ({
          id: "11111111-1111-4111-8111-111111111111",
          googleSubjectId: "sender-google",
          email: "sender@example.com",
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
          profile: {
            trustScore: 81,
            availabilityMode: "now",
            country: "Spain",
            city: "Madrid",
          },
        }),
        findMany: async () => [
          {
            id: "22222222-2222-4222-8222-222222222222",
            displayName: "Diego",
            status: "active",
            createdAt: new Date("2026-01-01T00:00:00.000Z"),
            email: "diego@example.com",
            googleSubjectId: null,
            profile: {
              availabilityMode: "now",
              trustScore: 83,
              country: "Spain",
              city: "Madrid",
            },
          },
          {
            id: "33333333-3333-4333-8333-333333333333",
            displayName: "Emma",
            status: "active",
            createdAt: new Date("2026-01-01T00:00:00.000Z"),
            email: "emma@example.com",
            googleSubjectId: null,
            profile: {
              availabilityMode: "now",
              trustScore: 90,
              country: "Germany",
              city: "Berlin",
            },
          },
        ],
      },
      block: { findMany: async () => [] },
      userInterest: {
        findMany: async () => [
          {
            userId: "22222222-2222-4222-8222-222222222222",
            normalizedLabel: "tennis",
          },
          {
            userId: "33333333-3333-4333-8333-333333333333",
            normalizedLabel: "tennis",
          },
        ],
      },
      userTopic: { findMany: async () => [] },
      intentRequest: { findMany: async () => [] },
      userPreference: {
        findMany: async () => [
          {
            userId: "11111111-1111-4111-8111-111111111111",
            key: "global_rules_language_preferences",
            value: ["es"],
          },
          {
            userId: "11111111-1111-4111-8111-111111111111",
            key: "global_rules_country_preferences",
            value: ["spain"],
          },
          {
            userId: "22222222-2222-4222-8222-222222222222",
            key: "global_rules_language_preferences",
            value: ["es"],
          },
          {
            userId: "33333333-3333-4333-8333-333333333333",
            key: "global_rules_language_preferences",
            value: ["de"],
          },
        ],
      },
    };

    const service = new MatchingService(prisma);
    const results = await service.retrieveCandidates(
      "11111111-1111-4111-8111-111111111111",
      {
        topics: ["tennis"],
        intentType: "chat",
      },
      5,
    );

    expect(results.map((candidate) => candidate.userId)).toEqual([
      "22222222-2222-4222-8222-222222222222",
    ]);
  });

  it("filters low-trust candidates when verified-only contact rules apply", async () => {
    const prisma: any = {
      user: {
        findUnique: async () => ({
          id: "11111111-1111-4111-8111-111111111111",
          googleSubjectId: "sender-google",
          email: "sender@example.com",
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
          profile: { trustScore: 92, availabilityMode: "now" },
        }),
        findMany: async () => [
          {
            id: "22222222-2222-4222-8222-222222222222",
            displayName: "Fran",
            status: "active",
            createdAt: new Date("2026-01-01T00:00:00.000Z"),
            email: null,
            googleSubjectId: null,
            profile: { availabilityMode: "now", trustScore: 30 },
          },
          {
            id: "33333333-3333-4333-8333-333333333333",
            displayName: "Gabi",
            status: "active",
            createdAt: new Date("2026-01-01T00:00:00.000Z"),
            email: "gabi@example.com",
            googleSubjectId: null,
            profile: { availabilityMode: "now", trustScore: 82 },
          },
        ],
      },
      block: { findMany: async () => [] },
      userInterest: {
        findMany: async () => [
          {
            userId: "22222222-2222-4222-8222-222222222222",
            normalizedLabel: "gaming",
          },
          {
            userId: "33333333-3333-4333-8333-333333333333",
            normalizedLabel: "gaming",
          },
        ],
      },
      userTopic: { findMany: async () => [] },
      intentRequest: { findMany: async () => [] },
      userPreference: {
        findMany: async () => [
          {
            userId: "11111111-1111-4111-8111-111111111111",
            key: "global_rules_require_verified_users",
            value: true,
          },
        ],
      },
    };

    const service = new MatchingService(prisma);
    const results = await service.retrieveCandidates(
      "11111111-1111-4111-8111-111111111111",
      {
        topics: ["gaming"],
        intentType: "chat",
      },
      5,
    );

    expect(results.map((candidate) => candidate.userId)).toEqual([
      "33333333-3333-4333-8333-333333333333",
    ]);
  });

  it("ranks reconnect candidates from the scenario corpus", async () => {
    const { scenarioById } = loadScenarioFixtures();
    const scenario = scenarioById.get("reconnect_signal_v1");
    if (!scenario) {
      throw new Error("missing scenario reconnect_signal_v1");
    }

    const now = Date.now();
    const prisma: any = {
      userInterest: {
        findMany: vi.fn().mockResolvedValue([
          {
            normalizedLabel: "reconnect",
            userId: "22222222-2222-4222-8222-222222222222",
          },
        ]),
      },
      userTopic: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      intent: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      user: {
        findMany: vi.fn(async (args?: any) => {
          const requestedIds: string[] = Array.isArray(args?.where?.id?.in)
            ? args.where.id.in
            : [];
          return requestedIds.includes("22222222-2222-4222-8222-222222222222")
            ? [
                {
                  id: "22222222-2222-4222-8222-222222222222",
                  displayName: "Hugo",
                  profile: {
                    lastActiveAt: new Date(now - 30 * 60_000),
                    trustScore: 90,
                    moderationState: "clean",
                  },
                },
              ]
            : [];
        }),
      },
      lifeGraphEdge: {
        findMany: vi
          .fn()
          .mockResolvedValue([{ targetNodeId: "node-hugo", weight: 0.95 }]),
      },
      lifeGraphNode: {
        findMany: vi
          .fn()
          .mockResolvedValue([
            { id: "node-hugo", nodeType: "person", label: "hugo" },
          ]),
      },
      connectionParticipant: {
        findMany: vi
          .fn()
          .mockResolvedValueOnce([
            {
              connectionId: "conn-1",
              connection: {
                createdAt: new Date(now - 3 * 24 * 60 * 60_000),
              },
            },
          ])
          .mockResolvedValueOnce([
            {
              userId: "22222222-2222-4222-8222-222222222222",
              connectionId: "conn-1",
            },
          ]),
      },
      block: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      agentThread: {
        findFirst: vi.fn().mockResolvedValue({ id: "thread-1" }),
      },
    };

    const matchingService: any = {
      retrieveCandidates: vi.fn().mockResolvedValue([]),
    };
    const personalizationService: any = {
      getGlobalRules: vi.fn().mockResolvedValue({
        whoCanContact: "anyone",
        reachable: "always",
        intentMode: "balanced",
        modality: "either",
        languagePreferences: [],
        countryPreferences: [],
        requireVerifiedUsers: false,
        notificationMode: "immediate",
        agentAutonomy: "suggest_only",
        memoryMode: "standard",
      }),
    };
    const agentService: any = {
      appendWorkflowUpdate: vi.fn().mockResolvedValue({}),
    };
    const inboxService: any = {
      listPendingRequests: vi.fn().mockResolvedValue([]),
    };

    const service = new DiscoveryService(
      prisma,
      matchingService,
      personalizationService,
      agentService,
      inboxService,
    );

    const result = await service.suggestReconnects(
      "11111111-1111-4111-8111-111111111111",
      5,
    );

    expect(result.reconnects).toHaveLength(1);
    expect(result.reconnects[0]?.userId).toBe(
      "22222222-2222-4222-8222-222222222222",
    );
    expect(scenario.expected.workflowStages).toContain("ranking");
    expect(scenario.expected.primaryOutcome).toBe("reconnect_ranked");
  });

  it("filters blocked peers from reconnect suggestions in the scenario corpus", async () => {
    const { scenarioById } = loadScenarioFixtures();
    const scenario = scenarioById.get("blocked_reconnect_filtered_v1");
    if (!scenario) {
      throw new Error("missing scenario blocked_reconnect_filtered_v1");
    }

    const { service } = createDiscoveryHarness({
      connectionParticipantFindMany: vi
        .fn()
        .mockResolvedValueOnce([
          {
            connectionId: "conn-1",
            connection: {
              createdAt: new Date(),
            },
          },
          {
            connectionId: "conn-2",
            connection: {
              createdAt: new Date(),
            },
          },
        ])
        .mockResolvedValueOnce([
          {
            userId: "22222222-2222-4222-8222-222222222222",
            connectionId: "conn-1",
          },
          {
            userId: "33333333-3333-4333-8333-333333333333",
            connectionId: "conn-2",
          },
        ]),
      userFindMany: vi.fn(async (args?: any) => {
        const requestedIds: string[] = Array.isArray(args?.where?.id?.in)
          ? args.where.id.in
          : [];
        return [
          {
            id: "22222222-2222-4222-8222-222222222222",
            displayName: "Hugo",
            profile: {
              lastActiveAt: new Date(),
              trustScore: 90,
              moderationState: "clean",
            },
          },
          {
            id: "33333333-3333-4333-8333-333333333333",
            displayName: "Blake",
            profile: {
              lastActiveAt: new Date(),
              trustScore: 84,
              moderationState: "clean",
            },
          },
        ].filter((row) => requestedIds.includes(row.id));
      }),
      blockFindMany: vi.fn().mockResolvedValue([
        {
          blockerUserId: "11111111-1111-4111-8111-111111111111",
          blockedUserId: "33333333-3333-4333-8333-333333333333",
        },
      ]),
    });

    const result = await service.suggestReconnects(
      "11111111-1111-4111-8111-111111111111",
      5,
    );

    expect(result.reconnects).toHaveLength(1);
    expect(result.reconnects[0]?.userId).toBe(
      "22222222-2222-4222-8222-222222222222",
    );
    expect(scenario.expected.primaryOutcome).toBe("blocked_reconnect_filtered");
  });

  it("filters muted peers from reconnect suggestions in the scenario corpus", async () => {
    const { scenarioById } = loadScenarioFixtures();
    const scenario = scenarioById.get("muted_reconnect_filtered_v1");
    if (!scenario) {
      throw new Error("missing scenario muted_reconnect_filtered_v1");
    }

    const { service } = createDiscoveryHarness({
      connectionParticipantFindMany: vi
        .fn()
        .mockResolvedValueOnce([
          {
            connectionId: "conn-1",
            connection: {
              createdAt: new Date(),
            },
          },
          {
            connectionId: "conn-2",
            connection: {
              createdAt: new Date(),
            },
          },
        ])
        .mockResolvedValueOnce([
          {
            userId: "22222222-2222-4222-8222-222222222222",
            connectionId: "conn-1",
          },
          {
            userId: "33333333-3333-4333-8333-333333333333",
            connectionId: "conn-2",
          },
        ]),
      userFindMany: vi.fn(async (args?: any) => {
        const requestedIds: string[] = Array.isArray(args?.where?.id?.in)
          ? args.where.id.in
          : [];
        return [
          {
            id: "22222222-2222-4222-8222-222222222222",
            displayName: "Hugo",
            profile: {
              lastActiveAt: new Date(),
              trustScore: 90,
              moderationState: "clean",
            },
          },
          {
            id: "33333333-3333-4333-8333-333333333333",
            displayName: "Bruno",
            profile: {
              lastActiveAt: new Date(),
              trustScore: 84,
              moderationState: "clean",
            },
          },
        ].filter((row) => requestedIds.includes(row.id));
      }),
      userPreferenceFindMany: vi.fn().mockResolvedValue([
        {
          userId: "11111111-1111-4111-8111-111111111111",
          value: ["33333333-3333-4333-8333-333333333333"],
        },
      ]),
    });

    const result = await service.suggestReconnects(
      "11111111-1111-4111-8111-111111111111",
      5,
    );

    expect(result.reconnects).toHaveLength(1);
    expect(result.reconnects[0]?.userId).toBe(
      "22222222-2222-4222-8222-222222222222",
    );
    expect(scenario.expected.primaryOutcome).toBe("muted_reconnect_filtered");
  });

  it("filters heavily reported peers from reconnect suggestions in the scenario corpus", async () => {
    const { scenarioById } = loadScenarioFixtures();
    const scenario = scenarioById.get("reported_reconnect_filtered_v1");
    if (!scenario) {
      throw new Error("missing scenario reported_reconnect_filtered_v1");
    }

    const { service } = createDiscoveryHarness({
      connectionParticipantFindMany: vi
        .fn()
        .mockResolvedValueOnce([
          {
            connectionId: "conn-1",
            connection: {
              createdAt: new Date(),
            },
          },
          {
            connectionId: "conn-2",
            connection: {
              createdAt: new Date(),
            },
          },
        ])
        .mockResolvedValueOnce([
          {
            userId: "22222222-2222-4222-8222-222222222222",
            connectionId: "conn-1",
          },
          {
            userId: "33333333-3333-4333-8333-333333333333",
            connectionId: "conn-2",
          },
        ]),
      userFindMany: vi.fn(async (args?: any) => {
        const requestedIds: string[] = Array.isArray(args?.where?.id?.in)
          ? args.where.id.in
          : [];
        return [
          {
            id: "22222222-2222-4222-8222-222222222222",
            displayName: "Hugo",
            profile: {
              lastActiveAt: new Date(),
              trustScore: 90,
              moderationState: "clean",
            },
          },
          {
            id: "33333333-3333-4333-8333-333333333333",
            displayName: "Blake",
            profile: {
              lastActiveAt: new Date(),
              trustScore: 84,
              moderationState: "clean",
            },
          },
        ].filter((row) => requestedIds.includes(row.id));
      }),
      userReportFindMany: vi
        .fn()
        .mockResolvedValue([
          { targetUserId: "33333333-3333-4333-8333-333333333333" },
          { targetUserId: "33333333-3333-4333-8333-333333333333" },
          { targetUserId: "33333333-3333-4333-8333-333333333333" },
        ]),
    });

    const result = await service.suggestReconnects(
      "11111111-1111-4111-8111-111111111111",
      5,
    );

    expect(result.reconnects).toHaveLength(1);
    expect(result.reconnects[0]?.userId).toBe(
      "22222222-2222-4222-8222-222222222222",
    );
    expect(scenario.expected.primaryOutcome).toBe(
      "reported_reconnect_filtered",
    );
  });

  it("builds passive discovery bundles for the passive scenario corpus", async () => {
    const { scenarioById } = loadScenarioFixtures();
    const scenario = scenarioById.get("passive_discovery_bundle_v1");
    if (!scenario) {
      throw new Error("missing scenario passive_discovery_bundle_v1");
    }

    const { service } = createDiscoveryHarness();
    const result = await service.getPassiveDiscovery(
      "11111111-1111-4111-8111-111111111111",
      3,
    );

    expect(result.tonight.suggestions.length).toBeGreaterThan(0);
    expect(result.activeIntentsOrUsers.items.length).toBeGreaterThan(0);
    expect(result.reconnects.reconnects.length).toBeGreaterThan(0);
    expect(scenario.expected.primaryOutcome).toBe("passive_bundle_generated");
  });

  it("prioritizes pending-request context in inbox suggestions", async () => {
    const { scenarioById } = loadScenarioFixtures();
    const scenario = scenarioById.get("inbox_pending_request_context_v1");
    if (!scenario) {
      throw new Error("missing scenario inbox_pending_request_context_v1");
    }

    const { service } = createDiscoveryHarness({
      listPendingRequests: vi.fn().mockResolvedValue([
        {
          id: "request-1",
          cardSummary: {
            who: "Bruno",
          },
        },
      ]),
      connectionParticipantFindMany: vi.fn().mockResolvedValue([]),
    });

    const result = await service.getInboxSuggestions(
      "11111111-1111-4111-8111-111111111111",
      3,
    );

    expect(result.pendingRequestCount).toBe(1);
    expect(
      result.suggestions.some(
        (suggestion) =>
          suggestion.title === "Pending invites" &&
          suggestion.reason.includes("Bruno"),
      ),
    ).toBe(true);
    expect(scenario.expected.primaryOutcome).toBe(
      "pending_request_prioritized",
    );
  });

  it("publishes agent recommendations into the latest thread for passive briefings", async () => {
    const { scenarioById } = loadScenarioFixtures();
    const scenario = scenarioById.get("agent_recommendations_publish_v1");
    if (!scenario) {
      throw new Error("missing scenario agent_recommendations_publish_v1");
    }

    const { service, agentService } = createDiscoveryHarness();
    const result = await service.publishAgentRecommendations(
      "11111111-1111-4111-8111-111111111111",
      {
        limit: 2,
      },
    );

    expect(result.delivered).toBe(true);
    expect(result.threadId).toBe("thread-1");
    expect(agentService.appendWorkflowUpdate).toHaveBeenCalledWith(
      "thread-1",
      expect.stringContaining("Tonight matches"),
      expect.objectContaining({
        category: "discovery_recommendations",
      }),
    );
    expect(
      scenario.expected.sideEffects.some(
        (effect) => effect.entityType === "agent_thread_message",
      ),
    ).toBe(true);
  });

  it("widens filters and enqueues a delayed retry for the delayed widening scenario", async () => {
    const { scenarioById } = loadScenarioFixtures();
    const scenario = scenarioById.get("delayed_widening_retry_v1");
    if (!scenario) {
      throw new Error("missing scenario delayed_widening_retry_v1");
    }

    const { service, prisma, notificationQueue, intentQueue } =
      createWorkflowHarness({
        candidateRows: [],
        intentRecord: {
          createdAt: new Date(Date.now() - 20 * 60_000),
          parsedIntent: {
            intentType: "activity",
            modality: "offline",
            urgency: "now",
            topics: ["tennis"],
            activities: ["doubles"],
            timingConstraints: ["today after 7"],
            skillConstraints: ["intermediate"],
            vibeConstraints: ["chill"],
          },
        },
      });

    const result = await service.processIntentPipeline(
      "intent-1",
      "trace-widening",
      "33333333-3333-4333-8333-333333333333",
    );

    expect(result.fanoutCount).toBe(0);
    expect(prisma.intent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          parsedIntent: expect.objectContaining({
            routingEscalationLevel: 2,
            topics: [],
          }),
        }),
      }),
    );
    expect(notificationQueue.add).toHaveBeenCalledWith(
      "AsyncAgentFollowup",
      expect.objectContaining({
        payload: expect.objectContaining({
          template: scenario.expected.followupTemplate,
        }),
      }),
      expect.objectContaining({
        delay: 45_000,
      }),
    );
    expect(intentQueue.add).toHaveBeenCalledWith(
      "IntentCreated",
      expect.objectContaining({
        idempotencyKey: "intent-created:intent-1:timeout_escalated",
      }),
      expect.objectContaining({
        jobId: "intent-created:intent-1:timeout_escalated",
        delay: 30_000,
      }),
    );
  });

  it("clusters topic-compatible candidates into group suggestions", async () => {
    const { scenarioById } = loadScenarioFixtures();
    const scenario = scenarioById.get("group_suggestions_topic_cluster_v1");
    if (!scenario) {
      throw new Error("missing scenario group_suggestions_topic_cluster_v1");
    }

    const { service } = createDiscoveryHarness({
      retrieveCandidates: vi.fn().mockResolvedValue([
        {
          userId: "22222222-2222-4222-8222-222222222222",
          score: 0.92,
          rationale: { semanticSimilarity: 0.95 },
        },
        {
          userId: "33333333-3333-4333-8333-333333333333",
          score: 0.87,
          rationale: { semanticSimilarity: 0.88 },
        },
      ]),
      userFindMany: vi.fn(async (args?: any) => {
        const requestedIds: string[] = Array.isArray(args?.where?.id?.in)
          ? args.where.id.in
          : [];
        return [
          {
            id: "22222222-2222-4222-8222-222222222222",
            displayName: "Bruno",
            profile: {
              lastActiveAt: new Date(),
              trustScore: 88,
              moderationState: "clean",
            },
          },
          {
            id: "33333333-3333-4333-8333-333333333333",
            displayName: "Diego",
            profile: {
              lastActiveAt: new Date(),
              trustScore: 83,
              moderationState: "clean",
            },
          },
        ].filter((row) => requestedIds.includes(row.id));
      }),
      userInterestFindMany: vi.fn().mockResolvedValue([
        {
          userId: "22222222-2222-4222-8222-222222222222",
          normalizedLabel: "tennis",
        },
        {
          userId: "33333333-3333-4333-8333-333333333333",
          normalizedLabel: "tennis",
        },
      ]),
      userTopicFindMany: vi.fn().mockResolvedValue([
        {
          userId: "33333333-3333-4333-8333-333333333333",
          normalizedLabel: "local",
        },
      ]),
    });

    const tonight = await service.suggestTonight(
      "11111111-1111-4111-8111-111111111111",
      3,
    );
    const result = await service.suggestGroups(
      "11111111-1111-4111-8111-111111111111",
      3,
      tonight.suggestions,
    );

    expect(result.groups.length).toBeGreaterThan(0);
    expect(result.groups[0]?.topic).toBe("tennis");
    expect(result.groups[0]?.participantUserIds).toEqual(
      expect.arrayContaining([
        "22222222-2222-4222-8222-222222222222",
        "33333333-3333-4333-8333-333333333333",
      ]),
    );
    expect(scenario.expected.primaryOutcome).toBe("group_cluster_ranked");
  });

  it("rejects sending a message when another group participant has blocked the sender", async () => {
    const { scenarioById } = loadScenarioFixtures();
    const scenario = scenarioById.get("blocked_group_chat_message_v1");
    if (!scenario) {
      throw new Error("missing scenario blocked_group_chat_message_v1");
    }

    const prisma: any = {
      chat: {
        findUnique: vi.fn().mockResolvedValue({ connectionId: "conn-group-1" }),
      },
      connectionParticipant: {
        findMany: vi
          .fn()
          .mockResolvedValue([
            { userId: "user-1" },
            { userId: "user-2" },
            { userId: "user-3" },
          ]),
      },
      block: {
        findMany: vi.fn().mockResolvedValue([{ id: "block-1" }]),
      },
      chatMessage: {
        create: vi.fn(),
      },
      messageReceipt: {
        create: vi.fn(),
      },
    };

    const service = new ChatsService(prisma);
    await expect(
      service.createMessage("chat-group-1", "user-1", "hello group"),
    ).rejects.toThrow(ForbiddenException);
    expect(prisma.chatMessage.create).not.toHaveBeenCalled();
    expect(scenario.expected.primaryOutcome).toBe("blocked_chat_send_rejected");
  });

  it("rejects direct-message sends when the other participant has blocked the sender", async () => {
    const { scenarioById } = loadScenarioFixtures();
    const scenario = scenarioById.get("blocked_dm_chat_message_v1");
    if (!scenario) {
      throw new Error("missing scenario blocked_dm_chat_message_v1");
    }

    const prisma: any = {
      chat: {
        findUnique: vi.fn().mockResolvedValue({ connectionId: "conn-dm-1" }),
      },
      connectionParticipant: {
        findMany: vi
          .fn()
          .mockResolvedValue([{ userId: "user-1" }, { userId: "user-2" }]),
      },
      block: {
        findMany: vi.fn().mockResolvedValue([{ id: "block-dm-1" }]),
      },
      chatMessage: {
        create: vi.fn(),
      },
      messageReceipt: {
        create: vi.fn(),
      },
    };

    const service = new ChatsService(prisma);
    await expect(
      service.createMessage("chat-dm-1", "user-1", "hello there"),
    ).rejects.toThrow(ForbiddenException);
    expect(prisma.chatMessage.create).not.toHaveBeenCalled();
    expect(scenario.expected.primaryOutcome).toBe("blocked_dm_send_rejected");
  });

  it("rejects sending a group message when another participant has muted the sender", async () => {
    const { scenarioById } = loadScenarioFixtures();
    const scenario = scenarioById.get("muted_group_chat_message_v1");
    if (!scenario) {
      throw new Error("missing scenario muted_group_chat_message_v1");
    }

    const prisma: any = {
      chat: {
        findUnique: vi.fn().mockResolvedValue({ connectionId: "conn-group-1" }),
      },
      connectionParticipant: {
        findMany: vi
          .fn()
          .mockResolvedValue([
            { userId: "user-1" },
            { userId: "user-2" },
            { userId: "user-3" },
          ]),
      },
      block: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      userPreference: {
        findMany: vi.fn().mockResolvedValue([
          {
            userId: "user-2",
            value: ["user-1"],
          },
        ]),
      },
      userReport: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      chatMessage: {
        create: vi.fn(),
      },
      messageReceipt: {
        create: vi.fn(),
      },
    };

    const service = new ChatsService(prisma);
    await expect(
      service.createMessage("chat-group-1", "user-1", "hello group"),
    ).rejects.toThrow(ForbiddenException);
    expect(prisma.chatMessage.create).not.toHaveBeenCalled();
    expect(scenario.expected.primaryOutcome).toBe("muted_chat_send_rejected");
  });

  it("rejects direct-message sends when there is an active report between participants", async () => {
    const { scenarioById } = loadScenarioFixtures();
    const scenario = scenarioById.get("reported_dm_chat_message_v1");
    if (!scenario) {
      throw new Error("missing scenario reported_dm_chat_message_v1");
    }

    const prisma: any = {
      chat: {
        findUnique: vi.fn().mockResolvedValue({ connectionId: "conn-dm-1" }),
      },
      connectionParticipant: {
        findMany: vi
          .fn()
          .mockResolvedValue([{ userId: "user-1" }, { userId: "user-2" }]),
      },
      block: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      userPreference: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      userReport: {
        findMany: vi.fn().mockResolvedValue([{ id: "report-1" }]),
      },
      chatMessage: {
        create: vi.fn(),
      },
      messageReceipt: {
        create: vi.fn(),
      },
    };

    const service = new ChatsService(prisma);
    await expect(
      service.createMessage("chat-dm-1", "user-1", "hello there"),
    ).rejects.toThrow(ForbiddenException);
    expect(prisma.chatMessage.create).not.toHaveBeenCalled();
    expect(scenario.expected.primaryOutcome).toBe("reported_dm_send_rejected");
  });

  it("archives a group chat cleanly when leaving drops it below quorum", async () => {
    const { scenarioById } = loadScenarioFixtures();
    const scenario = scenarioById.get("group_archive_after_leave_v1");
    if (!scenario) {
      throw new Error("missing scenario group_archive_after_leave_v1");
    }

    const prisma: any = {
      chat: {
        findUnique: vi.fn().mockResolvedValue({
          id: "chat-1",
          connectionId: "conn-1",
          connection: {
            type: "group",
            status: "active",
          },
        }),
      },
      connectionParticipant: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        count: vi.fn().mockResolvedValue(1),
      },
      connection: {
        update: vi.fn().mockResolvedValue({}),
      },
      chatMessage: {
        create: vi.fn().mockResolvedValue({ id: "msg-system" }),
      },
      auditLog: {
        create: vi.fn().mockResolvedValue({}),
      },
    };

    const service = new ChatsService(prisma);
    const result = await service.leaveChat("chat-1", "user-1");

    expect(result.status).toBe("archived");
    expect(prisma.connection.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "conn-1" },
        data: { status: "archived" },
      }),
    );
    expect(prisma.chatMessage.create).toHaveBeenCalledTimes(2);
    expect(prisma.auditLog.create).toHaveBeenCalledTimes(2);
    expect(
      scenario.expected.sideEffects.some(
        (effect) => effect.entityType === "connection",
      ),
    ).toBe(true);
    expect(scenario.expected.primaryOutcome).toBe("group_archived_after_leave");
  });

  it("rejects recurring-circle member adds when owner/member have a block relationship", async () => {
    const { scenarioById } = loadScenarioFixtures();
    const scenario = scenarioById.get("blocked_circle_member_add_v1");
    if (!scenario) {
      throw new Error("missing scenario blocked_circle_member_add_v1");
    }

    const prisma: any = {
      recurringCircle: {
        findUnique: vi.fn().mockResolvedValue({
          id: "circle-1",
          ownerUserId: "user-1",
        }),
      },
      block: {
        findFirst: vi.fn().mockResolvedValue({
          id: "block-1",
        }),
      },
      recurringCircleMember: {
        upsert: vi.fn(),
      },
    };

    const service = new RecurringCirclesService(prisma);
    await expect(
      service.addMember("circle-1", "user-1", {
        userId: "user-2",
        role: "member",
      }),
    ).rejects.toThrow(ForbiddenException);

    expect(prisma.recurringCircleMember.upsert).not.toHaveBeenCalled();
    expect(scenario.expected.primaryOutcome).toBe(
      "blocked_circle_member_rejected",
    );
  });

  it("rejects recurring-circle member adds when owner/member have a mute relationship", async () => {
    const { scenarioById } = loadScenarioFixtures();
    const scenario = scenarioById.get("muted_circle_member_add_v1");
    if (!scenario) {
      throw new Error("missing scenario muted_circle_member_add_v1");
    }

    const prisma: any = {
      recurringCircle: {
        findUnique: vi.fn().mockResolvedValue({
          id: "circle-1",
          ownerUserId: "user-1",
        }),
      },
      block: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
      userPreference: {
        findMany: vi.fn().mockResolvedValue([
          {
            userId: "user-1",
            value: ["user-2"],
          },
        ]),
      },
      userReport: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
      recurringCircleMember: {
        upsert: vi.fn(),
      },
    };

    const service = new RecurringCirclesService(prisma);
    await expect(
      service.addMember("circle-1", "user-1", {
        userId: "user-2",
        role: "member",
      }),
    ).rejects.toThrow(ForbiddenException);

    expect(prisma.recurringCircleMember.upsert).not.toHaveBeenCalled();
    expect(scenario.expected.primaryOutcome).toBe(
      "muted_circle_member_rejected",
    );
  });

  it("rejects recurring-circle member adds when member has muted owner", async () => {
    const { scenarioById } = loadScenarioFixtures();
    const scenario = scenarioById.get("muted_circle_member_add_reverse_v1");
    if (!scenario) {
      throw new Error("missing scenario muted_circle_member_add_reverse_v1");
    }

    const prisma: any = {
      recurringCircle: {
        findUnique: vi.fn().mockResolvedValue({
          id: "circle-1",
          ownerUserId: "user-1",
        }),
      },
      block: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
      userPreference: {
        findMany: vi.fn().mockResolvedValue([
          {
            userId: "user-2",
            value: ["user-1"],
          },
        ]),
      },
      userReport: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
      recurringCircleMember: {
        upsert: vi.fn(),
      },
    };

    const service = new RecurringCirclesService(prisma);
    await expect(
      service.addMember("circle-1", "user-1", {
        userId: "user-2",
        role: "member",
      }),
    ).rejects.toThrow(ForbiddenException);

    expect(prisma.recurringCircleMember.upsert).not.toHaveBeenCalled();
    expect(scenario.expected.primaryOutcome).toBe(
      "muted_circle_member_reverse_rejected",
    );
  });

  it("rejects recurring-circle member adds when there is an open report between owner/member", async () => {
    const { scenarioById } = loadScenarioFixtures();
    const scenario = scenarioById.get("reported_circle_member_add_v1");
    if (!scenario) {
      throw new Error("missing scenario reported_circle_member_add_v1");
    }

    const prisma: any = {
      recurringCircle: {
        findUnique: vi.fn().mockResolvedValue({
          id: "circle-1",
          ownerUserId: "user-1",
        }),
      },
      block: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
      userReport: {
        findFirst: vi.fn().mockResolvedValue({
          id: "report-1",
        }),
      },
      recurringCircleMember: {
        upsert: vi.fn(),
      },
    };

    const service = new RecurringCirclesService(prisma);
    await expect(
      service.addMember("circle-1", "user-1", {
        userId: "user-2",
        role: "member",
      }),
    ).rejects.toThrow(ForbiddenException);

    expect(prisma.recurringCircleMember.upsert).not.toHaveBeenCalled();
    expect(scenario.expected.primaryOutcome).toBe(
      "reported_circle_member_rejected",
    );
  });

  it("delivers a scheduled passive discovery briefing through notification and agent thread update", async () => {
    const { scenarioById } = loadScenarioFixtures();
    const scenario = scenarioById.get("discovery_briefing_delivery_v1");
    if (!scenario) {
      throw new Error("missing scenario discovery_briefing_delivery_v1");
    }

    const prisma: any = {
      scheduledTaskRun: {
        findUnique: vi.fn().mockResolvedValue({
          id: "run-1",
          scheduledTaskId: "task-1",
        }),
        update: vi.fn().mockResolvedValue({}),
      },
      scheduledTask: {
        findUnique: vi.fn().mockResolvedValue({
          id: "task-1",
          userId: "11111111-1111-4111-8111-111111111111",
          status: "active",
          taskType: "discovery_briefing",
          taskConfig: {
            briefingType: "passive",
            deliveryMode: "notification_and_agent_thread",
            maxResults: 3,
          },
        }),
        update: vi.fn().mockResolvedValue({}),
      },
    };
    const discovery: any = {
      getPassiveDiscovery: vi.fn().mockResolvedValue({
        userId: "11111111-1111-4111-8111-111111111111",
        tonight: { suggestions: [{ userId: "u-1", score: 0.9 }] },
        activeIntentsOrUsers: { items: [] },
        groups: { groups: [] },
        reconnects: { reconnects: [{ userId: "u-2", score: 0.8 }] },
      }),
    };
    const notifications: any = {
      createInAppNotification: vi.fn().mockResolvedValue({ id: "notif-1" }),
    };
    const agent: any = {
      findPrimaryThreadSummaryForUser: vi
        .fn()
        .mockResolvedValue({ id: "thread-1" }),
      appendWorkflowUpdate: vi.fn().mockResolvedValue({ id: "msg-1" }),
    };
    const launchControls: any = {
      assertActionAllowed: vi.fn().mockResolvedValue(undefined),
    };
    const reconciliation: any = {
      recordScheduledTaskSkipped: vi.fn().mockResolvedValue(undefined),
    };

    const service = new ScheduledTasksService(
      prisma,
      undefined,
      discovery,
      notifications,
      agent,
      reconciliation,
      launchControls,
    );
    const result = await service.runQueuedTask({
      scheduledTaskId: "task-1",
      scheduledTaskRunId: "run-1",
      trigger: "manual",
    });

    expect(result.status).toBe("succeeded");
    expect(discovery.getPassiveDiscovery).toHaveBeenCalledWith(
      "11111111-1111-4111-8111-111111111111",
      3,
    );
    expect(notifications.createInAppNotification).toHaveBeenCalledWith(
      "11111111-1111-4111-8111-111111111111",
      NotificationType.DIGEST,
      expect.stringContaining("Passive discovery briefing generated"),
    );
    expect(agent.appendWorkflowUpdate).toHaveBeenCalledWith(
      "thread-1",
      expect.stringContaining("Passive discovery briefing generated"),
      expect.objectContaining({
        category: "scheduled_task",
      }),
    );
    expect(
      scenario.expected.sideEffects.some(
        (effect) => effect.entityType === "notification",
      ),
    ).toBe(true);
    expect(scenario.expected.primaryOutcome).toBe(
      "discovery_briefing_delivered",
    );
  });

  it("delivers a reconnect briefing through notification and agent thread update", async () => {
    const { scenarioById } = loadScenarioFixtures();
    const scenario = scenarioById.get("reconnect_briefing_delivery_v1");
    if (!scenario) {
      throw new Error("missing scenario reconnect_briefing_delivery_v1");
    }

    const prisma: any = {
      scheduledTaskRun: {
        findUnique: vi.fn().mockResolvedValue({
          id: "run-2",
          scheduledTaskId: "task-2",
        }),
        update: vi.fn().mockResolvedValue({}),
      },
      scheduledTask: {
        findUnique: vi.fn().mockResolvedValue({
          id: "task-2",
          userId: "11111111-1111-4111-8111-111111111111",
          status: "active",
          taskType: "reconnect_briefing",
          taskConfig: {
            deliveryMode: "notification_and_agent_thread",
            maxResults: 2,
          },
        }),
        update: vi.fn().mockResolvedValue({}),
      },
    };
    const discovery: any = {
      suggestReconnects: vi.fn().mockResolvedValue({
        userId: "11111111-1111-4111-8111-111111111111",
        reconnects: [{ userId: "u-2", score: 0.8 }],
      }),
    };
    const notifications: any = {
      createInAppNotification: vi.fn().mockResolvedValue({ id: "notif-2" }),
    };
    const agent: any = {
      findPrimaryThreadSummaryForUser: vi
        .fn()
        .mockResolvedValue({ id: "thread-2" }),
      appendWorkflowUpdate: vi.fn().mockResolvedValue({ id: "msg-2" }),
    };
    const launchControls: any = {
      assertActionAllowed: vi.fn().mockResolvedValue(undefined),
    };
    const reconciliation: any = {
      recordScheduledTaskSkipped: vi.fn().mockResolvedValue(undefined),
    };

    const service = new ScheduledTasksService(
      prisma,
      undefined,
      discovery,
      notifications,
      agent,
      reconciliation,
      launchControls,
    );
    const result = await service.runQueuedTask({
      scheduledTaskId: "task-2",
      scheduledTaskRunId: "run-2",
      trigger: "manual",
    });

    expect(result.status).toBe("succeeded");
    expect(discovery.suggestReconnects).toHaveBeenCalledWith(
      "11111111-1111-4111-8111-111111111111",
      2,
    );
    expect(notifications.createInAppNotification).toHaveBeenCalledWith(
      "11111111-1111-4111-8111-111111111111",
      NotificationType.REMINDER,
      expect.stringContaining("Reconnect briefing generated"),
    );
    expect(agent.appendWorkflowUpdate).toHaveBeenCalledWith(
      "thread-2",
      expect.stringContaining("Reconnect briefing generated"),
      expect.objectContaining({
        category: "scheduled_task",
      }),
    );
    expect(scenario.expected.primaryOutcome).toBe(
      "reconnect_briefing_delivered",
    );
  });

  it("delivers a saved-search result through notification and agent thread update", async () => {
    const { scenarioById } = loadScenarioFixtures();
    const scenario = scenarioById.get("saved_search_delivery_v1");
    if (!scenario) {
      throw new Error("missing scenario saved_search_delivery_v1");
    }

    const prisma: any = {
      scheduledTaskRun: {
        findUnique: vi.fn().mockResolvedValue({
          id: "run-3",
          scheduledTaskId: "task-3",
        }),
        update: vi.fn().mockResolvedValue({}),
      },
      scheduledTask: {
        findUnique: vi.fn().mockResolvedValue({
          id: "task-3",
          userId: "11111111-1111-4111-8111-111111111111",
          status: "active",
          taskType: "saved_search",
          taskConfig: {
            savedSearchId: "search-1",
            deliveryMode: "notification_and_agent_thread",
            minResults: 1,
            maxResults: 3,
          },
        }),
        update: vi.fn().mockResolvedValue({}),
      },
      savedSearch: {
        findFirst: vi.fn().mockResolvedValue({
          id: "search-1",
          userId: "11111111-1111-4111-8111-111111111111",
          title: "Tennis matches",
          searchType: "discovery_people",
        }),
      },
    };
    const discovery: any = {
      suggestTonight: vi.fn().mockResolvedValue({
        userId: "11111111-1111-4111-8111-111111111111",
        suggestions: [{ userId: "u-1", score: 0.91 }],
      }),
    };
    const notifications: any = {
      createInAppNotification: vi.fn().mockResolvedValue({ id: "notif-3" }),
    };
    const agent: any = {
      findPrimaryThreadSummaryForUser: vi
        .fn()
        .mockResolvedValue({ id: "thread-3" }),
      appendWorkflowUpdate: vi.fn().mockResolvedValue({ id: "msg-3" }),
    };
    const launchControls: any = {
      assertActionAllowed: vi.fn().mockResolvedValue(undefined),
    };
    const reconciliation: any = {
      recordScheduledTaskSkipped: vi.fn().mockResolvedValue(undefined),
    };

    const service = new ScheduledTasksService(
      prisma,
      undefined,
      discovery,
      notifications,
      agent,
      reconciliation,
      launchControls,
    );
    const result = await service.runQueuedTask({
      scheduledTaskId: "task-3",
      scheduledTaskRunId: "run-3",
      trigger: "manual",
    });

    expect(result.status).toBe("succeeded");
    expect(discovery.suggestTonight).toHaveBeenCalledWith(
      "11111111-1111-4111-8111-111111111111",
      3,
    );
    expect(notifications.createInAppNotification).toHaveBeenCalledWith(
      "11111111-1111-4111-8111-111111111111",
      NotificationType.AGENT_UPDATE,
      expect.stringContaining("Saved search 'Tennis matches' found 1 result"),
    );
    expect(agent.appendWorkflowUpdate).toHaveBeenCalledWith(
      "thread-3",
      expect.stringContaining("Saved search 'Tennis matches' found 1 result"),
      expect.objectContaining({
        category: "scheduled_task",
      }),
    );
    expect(scenario.expected.primaryOutcome).toBe("saved_search_delivered");
  });

  it("delivers a social reminder through notification and agent thread update", async () => {
    const { scenarioById } = loadScenarioFixtures();
    const scenario = scenarioById.get("social_reminder_delivery_v1");
    if (!scenario) {
      throw new Error("missing scenario social_reminder_delivery_v1");
    }

    const prisma: any = {
      scheduledTaskRun: {
        findUnique: vi.fn().mockResolvedValue({
          id: "run-4",
          scheduledTaskId: "task-4",
        }),
        update: vi.fn().mockResolvedValue({}),
      },
      scheduledTask: {
        findUnique: vi.fn().mockResolvedValue({
          id: "task-4",
          userId: "11111111-1111-4111-8111-111111111111",
          status: "active",
          taskType: "social_reminder",
          taskConfig: {
            template: "revisit_unanswered_intents",
            deliveryMode: "notification_and_agent_thread",
            context: {
              summary: "Check back on unanswered intents.",
            },
          },
        }),
        update: vi.fn().mockResolvedValue({}),
      },
    };
    const notifications: any = {
      createInAppNotification: vi.fn().mockResolvedValue({ id: "notif-4" }),
    };
    const agent: any = {
      findPrimaryThreadSummaryForUser: vi
        .fn()
        .mockResolvedValue({ id: "thread-4" }),
      appendWorkflowUpdate: vi.fn().mockResolvedValue({ id: "msg-4" }),
    };
    const launchControls: any = {
      assertActionAllowed: vi.fn().mockResolvedValue(undefined),
    };
    const reconciliation: any = {
      recordScheduledTaskSkipped: vi.fn().mockResolvedValue(undefined),
    };

    const service = new ScheduledTasksService(
      prisma,
      undefined,
      undefined,
      notifications,
      agent,
      reconciliation,
      launchControls,
    );
    const result = await service.runQueuedTask({
      scheduledTaskId: "task-4",
      scheduledTaskRunId: "run-4",
      trigger: "manual",
    });

    expect(result.status).toBe("succeeded");
    expect(notifications.createInAppNotification).toHaveBeenCalledWith(
      "11111111-1111-4111-8111-111111111111",
      NotificationType.REMINDER,
      expect.stringContaining("Reminder: revisit your unanswered intents"),
    );
    expect(agent.appendWorkflowUpdate).toHaveBeenCalledWith(
      "thread-4",
      expect.stringContaining("Reminder: revisit your unanswered intents"),
      expect.objectContaining({
        category: "scheduled_task",
      }),
    );
    expect(scenario.expected.primaryOutcome).toBe("social_reminder_delivered");
  });

  it("keeps saved-search below-threshold results in the agent thread without creating a notification", async () => {
    const { scenarioById } = loadScenarioFixtures();
    const scenario = scenarioById.get("saved_search_below_threshold_v1");
    if (!scenario) {
      throw new Error("missing scenario saved_search_below_threshold_v1");
    }

    const prisma: any = {
      scheduledTaskRun: {
        findUnique: vi.fn().mockResolvedValue({
          id: "run-5",
          scheduledTaskId: "task-5",
        }),
        update: vi.fn().mockResolvedValue({}),
      },
      scheduledTask: {
        findUnique: vi.fn().mockResolvedValue({
          id: "task-5",
          userId: "11111111-1111-4111-8111-111111111111",
          status: "active",
          taskType: "saved_search",
          taskConfig: {
            savedSearchId: "search-2",
            deliveryMode: "notification_and_agent_thread",
            minResults: 2,
            maxResults: 3,
          },
        }),
        update: vi.fn().mockResolvedValue({}),
      },
      savedSearch: {
        findFirst: vi.fn().mockResolvedValue({
          id: "search-2",
          userId: "11111111-1111-4111-8111-111111111111",
          title: "Hiking buddies",
          searchType: "discovery_people",
        }),
      },
    };
    const discovery: any = {
      suggestTonight: vi.fn().mockResolvedValue({
        userId: "11111111-1111-4111-8111-111111111111",
        suggestions: [{ userId: "u-7", score: 0.74 }],
      }),
    };
    const notifications: any = {
      createInAppNotification: vi.fn().mockResolvedValue({ id: "notif-5" }),
    };
    const agent: any = {
      findPrimaryThreadSummaryForUser: vi
        .fn()
        .mockResolvedValue({ id: "thread-5" }),
      appendWorkflowUpdate: vi.fn().mockResolvedValue({ id: "msg-5" }),
    };
    const launchControls: any = {
      assertActionAllowed: vi.fn().mockResolvedValue(undefined),
    };
    const reconciliation: any = {
      recordScheduledTaskSkipped: vi.fn().mockResolvedValue(undefined),
    };

    const service = new ScheduledTasksService(
      prisma,
      undefined,
      discovery,
      notifications,
      agent,
      reconciliation,
      launchControls,
    );
    const result = await service.runQueuedTask({
      scheduledTaskId: "task-5",
      scheduledTaskRunId: "run-5",
      trigger: "manual",
    });

    expect(result.status).toBe("succeeded");
    expect(discovery.suggestTonight).toHaveBeenCalledWith(
      "11111111-1111-4111-8111-111111111111",
      3,
    );
    expect(notifications.createInAppNotification).not.toHaveBeenCalled();
    expect(agent.appendWorkflowUpdate).toHaveBeenCalledWith(
      "thread-5",
      expect.stringContaining("below min 2"),
      expect.objectContaining({
        category: "scheduled_task",
      }),
    );
    expect(scenario.expected.primaryOutcome).toBe(
      "saved_search_below_threshold",
    );
  });

  it("delivers social reminders in agent-thread-only mode without in-app notifications", async () => {
    const { scenarioById } = loadScenarioFixtures();
    const scenario = scenarioById.get("social_reminder_agent_thread_only_v1");
    if (!scenario) {
      throw new Error("missing scenario social_reminder_agent_thread_only_v1");
    }

    const prisma: any = {
      scheduledTaskRun: {
        findUnique: vi.fn().mockResolvedValue({
          id: "run-6",
          scheduledTaskId: "task-6",
        }),
        update: vi.fn().mockResolvedValue({}),
      },
      scheduledTask: {
        findUnique: vi.fn().mockResolvedValue({
          id: "task-6",
          userId: "11111111-1111-4111-8111-111111111111",
          status: "active",
          taskType: "social_reminder",
          taskConfig: {
            template: "resume_dormant_chats",
            deliveryMode: "agent_thread",
            context: {
              reason: "quiet_hours",
            },
          },
        }),
        update: vi.fn().mockResolvedValue({}),
      },
    };
    const notifications: any = {
      createInAppNotification: vi.fn().mockResolvedValue({ id: "notif-6" }),
    };
    const agent: any = {
      findPrimaryThreadSummaryForUser: vi
        .fn()
        .mockResolvedValue({ id: "thread-6" }),
      appendWorkflowUpdate: vi.fn().mockResolvedValue({ id: "msg-6" }),
    };
    const launchControls: any = {
      assertActionAllowed: vi.fn().mockResolvedValue(undefined),
    };
    const reconciliation: any = {
      recordScheduledTaskSkipped: vi.fn().mockResolvedValue(undefined),
    };

    const service = new ScheduledTasksService(
      prisma,
      undefined,
      undefined,
      notifications,
      agent,
      reconciliation,
      launchControls,
    );
    const result = await service.runQueuedTask({
      scheduledTaskId: "task-6",
      scheduledTaskRunId: "run-6",
      trigger: "manual",
    });

    expect(result.status).toBe("succeeded");
    expect(notifications.createInAppNotification).not.toHaveBeenCalled();
    expect(agent.appendWorkflowUpdate).toHaveBeenCalledWith(
      "thread-6",
      expect.stringContaining("dormant chats"),
      expect.objectContaining({
        category: "scheduled_task",
      }),
    );
    expect(scenario.expected.primaryOutcome).toBe(
      "social_reminder_agent_thread_only",
    );
  });

  it("suppresses saved-search delivery when no results exist and suppression is enabled", async () => {
    const { scenarioById } = loadScenarioFixtures();
    const scenario = scenarioById.get("saved_search_no_results_suppressed_v1");
    if (!scenario) {
      throw new Error("missing scenario saved_search_no_results_suppressed_v1");
    }

    const prisma: any = {
      scheduledTaskRun: {
        findUnique: vi.fn().mockResolvedValue({
          id: "run-7",
          scheduledTaskId: "task-7",
        }),
        update: vi.fn().mockResolvedValue({}),
      },
      scheduledTask: {
        findUnique: vi.fn().mockResolvedValue({
          id: "task-7",
          userId: "11111111-1111-4111-8111-111111111111",
          status: "active",
          taskType: "saved_search",
          taskConfig: {
            savedSearchId: "search-3",
            deliveryMode: "notification_and_agent_thread",
            minResults: 1,
            maxResults: 3,
            suppressWhenEmpty: true,
          },
        }),
        update: vi.fn().mockResolvedValue({}),
      },
      savedSearch: {
        findFirst: vi.fn().mockResolvedValue({
          id: "search-3",
          userId: "11111111-1111-4111-8111-111111111111",
          title: "Quiet soccer search",
          searchType: "discovery_people",
        }),
      },
    };
    const discovery: any = {
      suggestTonight: vi.fn().mockResolvedValue({
        userId: "11111111-1111-4111-8111-111111111111",
        suggestions: [],
      }),
    };
    const notifications: any = {
      createInAppNotification: vi.fn().mockResolvedValue({ id: "notif-7" }),
    };
    const agent: any = {
      findPrimaryThreadSummaryForUser: vi
        .fn()
        .mockResolvedValue({ id: "thread-7" }),
      appendWorkflowUpdate: vi.fn().mockResolvedValue({ id: "msg-7" }),
    };
    const launchControls: any = {
      assertActionAllowed: vi.fn().mockResolvedValue(undefined),
    };
    const reconciliation: any = {
      recordScheduledTaskSkipped: vi.fn().mockResolvedValue(undefined),
    };

    const service = new ScheduledTasksService(
      prisma,
      undefined,
      discovery,
      notifications,
      agent,
      reconciliation,
      launchControls,
    );
    const result = await service.runQueuedTask({
      scheduledTaskId: "task-7",
      scheduledTaskRunId: "run-7",
      trigger: "manual",
    });

    expect(result.status).toBe("succeeded");
    expect(discovery.suggestTonight).toHaveBeenCalledWith(
      "11111111-1111-4111-8111-111111111111",
      3,
    );
    expect(notifications.createInAppNotification).not.toHaveBeenCalled();
    expect(agent.appendWorkflowUpdate).not.toHaveBeenCalled();
    expect(scenario.expected.primaryOutcome).toBe(
      "saved_search_no_results_suppressed",
    );
  });

  it("routes social reminders to agent thread during quiet hours even when notifications are requested", async () => {
    const { scenarioById } = loadScenarioFixtures();
    const scenario = scenarioById.get("social_reminder_quiet_hours_v1");
    if (!scenario) {
      throw new Error("missing scenario social_reminder_quiet_hours_v1");
    }

    const prisma: any = {
      scheduledTaskRun: {
        findUnique: vi.fn().mockResolvedValue({
          id: "run-8",
          scheduledTaskId: "task-8",
        }),
        update: vi.fn().mockResolvedValue({}),
      },
      scheduledTask: {
        findUnique: vi.fn().mockResolvedValue({
          id: "task-8",
          userId: "11111111-1111-4111-8111-111111111111",
          status: "active",
          taskType: "social_reminder",
          taskConfig: {
            template: "open_passive_mode",
            deliveryMode: "notification_and_agent_thread",
            context: {
              quietHoursActive: true,
            },
          },
        }),
        update: vi.fn().mockResolvedValue({}),
      },
    };
    const notifications: any = {
      createInAppNotification: vi.fn().mockResolvedValue({ id: "notif-8" }),
    };
    const agent: any = {
      findPrimaryThreadSummaryForUser: vi
        .fn()
        .mockResolvedValue({ id: "thread-8" }),
      appendWorkflowUpdate: vi.fn().mockResolvedValue({ id: "msg-8" }),
    };
    const launchControls: any = {
      assertActionAllowed: vi.fn().mockResolvedValue(undefined),
    };
    const reconciliation: any = {
      recordScheduledTaskSkipped: vi.fn().mockResolvedValue(undefined),
    };

    const service = new ScheduledTasksService(
      prisma,
      undefined,
      undefined,
      notifications,
      agent,
      reconciliation,
      launchControls,
    );
    const result = await service.runQueuedTask({
      scheduledTaskId: "task-8",
      scheduledTaskRunId: "run-8",
      trigger: "manual",
    });

    expect(result.status).toBe("succeeded");
    expect(notifications.createInAppNotification).not.toHaveBeenCalled();
    expect(agent.appendWorkflowUpdate).toHaveBeenCalledWith(
      "thread-8",
      expect.stringContaining("enable passive mode"),
      expect.objectContaining({
        category: "scheduled_task",
      }),
    );
    expect(scenario.expected.primaryOutcome).toBe(
      "social_reminder_quiet_hours_routed_to_thread",
    );
  });

  it("evaluates social negotiation scenarios into bounded async defer outcomes", async () => {
    const { scenarioById } = loadScenarioFixtures();
    const scenario = scenarioById.get("social_negotiation_async_defer_v1");
    if (!scenario) {
      throw new Error("missing scenario social_negotiation_async_defer_v1");
    }

    const service = new AgentOutcomeToolsService({} as any);
    const outcome = await service.evaluateNegotiation({
      userId: "user-alice",
      traceId: "trace-negotiation-social",
      packet: {
        id: "neg-social-scenario",
        domain: "social",
        mode: "async",
        intentSummary: scenario.utterance,
        requester: {
          userId: "user-alice",
          country: "Argentina",
          city: "Buenos Aires",
          languages: ["en", "es"],
          trustScore: 84,
          availabilityMode: "now",
          objectives: ["play tennis evenings", "meet nearby players"],
          constraints: ["weeknight evenings"],
        },
        counterpart: {
          userId: "user-bruno",
          displayName: "Bruno",
          country: "Argentina",
          city: "Buenos Aires",
          languages: ["es"],
          trustScore: 81,
          availabilityMode: "later_today",
          objectives: ["tennis"],
          constraints: ["today only"],
        },
      },
    });

    expect(outcome).toEqual(
      expect.objectContaining({
        evaluated: true,
        domain: "social",
        decision: "defer_async",
        mode: "async",
        bounded: true,
        roundsUsed: 1,
      }),
    );
    if (!("nextActions" in outcome)) {
      throw new Error("social negotiation outcome was not evaluated");
    }
    expect(outcome.nextActions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "followup.schedule",
        }),
      ]),
    );
    expect(scenario.expected.primaryOutcome).toBe(
      "social_negotiation_defer_async",
    );
  });

  it("evaluates buyer-seller negotiation scenarios into intro-ready outcomes", async () => {
    const { scenarioById } = loadScenarioFixtures();
    const scenario = scenarioById.get("commerce_buyer_seller_negotiation_v1");
    if (!scenario) {
      throw new Error("missing scenario commerce_buyer_seller_negotiation_v1");
    }

    const service = new AgentOutcomeToolsService({} as any);
    const outcome = await service.evaluateNegotiation({
      userId: "user-alice",
      traceId: "trace-negotiation-commerce",
      packet: {
        id: "neg-commerce-scenario",
        domain: "commerce",
        mode: "async",
        intentSummary: scenario.utterance,
        requester: {
          userId: "user-alice",
          country: "Argentina",
          city: "Buenos Aires",
          languages: ["en"],
          trustScore: 86,
          objectives: ["buy road bike", "local pickup"],
          itemInterests: ["road bike", "cycling"],
          priceRange: {
            min: 350,
            max: 430,
            currency: "USD",
          },
        },
        counterpart: {
          userId: "user-seller",
          displayName: "Seller",
          country: "Argentina",
          city: "Buenos Aires",
          languages: ["en"],
          trustScore: 90,
          objectives: ["sell road bike"],
          itemInterests: ["road bike", "cycling"],
          askingPrice: 400,
        },
      },
    });

    expect(outcome).toEqual(
      expect.objectContaining({
        evaluated: true,
        domain: "commerce",
        decision: "propose_intro",
        bounded: true,
        roundsUsed: 1,
      }),
    );
    if (!("nextActions" in outcome)) {
      throw new Error("commerce negotiation outcome was not evaluated");
    }
    expect(outcome.nextActions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "intro.send_request",
        }),
      ]),
    );
    expect(scenario.expected.primaryOutcome).toBe(
      "commerce_negotiation_intro_ready",
    );
  });

  it("routes scam and spam heavy content into moderation review in the scenario corpus", () => {
    const { scenarioById } = loadScenarioFixtures();
    const scenario = scenarioById.get("scam_spam_review_v1");
    if (!scenario) {
      throw new Error("missing scenario scam_spam_review_v1");
    }

    const service = new ModerationService({} as any);
    const result = service.assessContentRisk({
      content: scenario.utterance,
      surface: "agent_turn",
    });

    expect(result.decision).toBe("review");
    expect(result.reasons).toEqual(
      expect.arrayContaining([expect.stringContaining("scam")]),
    );
    expect(scenario.expected.primaryOutcome).toBe("review_required");
  });

  it("blocks underage and illegal exploitation content in the scenario corpus", () => {
    const { scenarioById } = loadScenarioFixtures();
    const scenario = scenarioById.get("underage_illegal_block_v1");
    if (!scenario) {
      throw new Error("missing scenario underage_illegal_block_v1");
    }

    const service = new ModerationService({} as any);
    const result = service.assessContentRisk({
      content: scenario.utterance,
      surface: "agent_turn",
    });

    expect(result.decision).toBe("blocked");
    expect(result.reasons).toEqual(
      expect.arrayContaining([
        expect.stringContaining("blocked_term:exploit child"),
      ]),
    );
    expect(scenario.expected.primaryOutcome).toBe("blocked_required");
  });

  it("routes underage coercive meetup language into moderation review in the scenario corpus", () => {
    const { scenarioById } = loadScenarioFixtures();
    const scenario = scenarioById.get("underage_coercive_review_v1");
    if (!scenario) {
      throw new Error("missing scenario underage_coercive_review_v1");
    }

    const service = new ModerationService({} as any);
    const result = service.assessContentRisk({
      content: scenario.utterance,
      surface: "agent_turn",
    });

    expect(result.decision).toBe("review");
    expect(result.reasons).toEqual(
      expect.arrayContaining([
        expect.stringContaining("review_term:underage meetup"),
      ]),
    );
    expect(scenario.expected.primaryOutcome).toBe("review_required");
  });
});
