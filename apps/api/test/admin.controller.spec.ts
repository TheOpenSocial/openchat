import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { agenticScenarioDatasetSchema } from "@opensocial/types";
import { describe, expect, it, vi } from "vitest";
import { AdminController } from "../src/admin/admin.controller.js";
import {
  recordHttpRequestMetric,
  recordOnboardingInferenceMetric,
  recordOpenAIMetric,
  recordQueueJobFailure,
  recordQueueJobProcessing,
  recordWebsocketConnectionOpened,
  recordWebsocketError,
  resetOpsRuntimeMetrics,
} from "../src/common/ops-metrics.js";
import { DatabaseLatencyService } from "../src/database/database-latency.service.js";
import { JOB_QUEUE_NAMES } from "../src/jobs/jobs.module.js";

const ADMIN_USER_ID = "11111111-1111-4111-8111-111111111111";
const DEAD_LETTER_ID = "22222222-2222-4222-8222-222222222222";
const INTENT_ID = "33333333-3333-4333-8333-333333333333";
const CHAT_ID = "44444444-4444-4444-8444-444444444444";
const AGENT_THREAD_ID = "55555555-5555-4555-8555-555555555555";
const SCENARIO_FIXTURE_PATH = resolve(
  process.cwd(),
  "test/fixtures/agentic-scenarios.json",
);

function loadScenarioDataset() {
  return agenticScenarioDatasetSchema.parse(
    JSON.parse(readFileSync(SCENARIO_FIXTURE_PATH, "utf8")),
  );
}

function createController(overrides: Partial<Record<string, any>> = {}) {
  const deadLetterService = overrides.deadLetterService ?? {
    listDeadLetters: vi.fn().mockResolvedValue([]),
    replayDeadLetter: vi.fn().mockResolvedValue({ replayed: true }),
  };
  const outboxRelayService = overrides.outboxRelayService ?? {
    relayPendingEvents: vi
      .fn()
      .mockResolvedValue({ relayedCount: 0, relayedEventIds: [] }),
  };
  const adminAuditService = overrides.adminAuditService ?? {
    recordAction: vi.fn().mockResolvedValue({}),
    listModerationQueue: vi.fn().mockResolvedValue([]),
    listAuditLogs: vi.fn().mockResolvedValue([]),
  };
  const appCacheService = overrides.appCacheService ?? {
    getJson: vi.fn().mockResolvedValue(null),
    setJson: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
  };
  const databaseLatencyService = overrides.databaseLatencyService ?? {
    measureLatencyMs: vi.fn().mockResolvedValue(42),
  };
  const analyticsService = overrides.analyticsService ?? {
    getAgentOutcomeMetrics: vi.fn().mockResolvedValue({
      window: {
        days: 30,
        start: "2026-03-01T00:00:00.000Z",
        end: "2026-03-31T00:00:00.000Z",
        followupEngagementHours: 24,
      },
      summary: {
        totalActions: 0,
        executedActions: 0,
        deniedActions: 0,
        failedActions: 0,
      },
      toolAttempts: [],
      introRequestAcceptance: {
        attempted: 0,
        accepted: 0,
        pending: 0,
        rejected: 0,
        cancelled: 0,
        expired: 0,
        settled: 0,
        acceptanceRate: null,
        settledRate: null,
      },
      circleJoinConversion: {
        attempted: 0,
        executed: 0,
        converted: 0,
        failed: 0,
        conversionRate: null,
      },
      followupUsefulness: {
        scheduled: 0,
        completedRuns: 0,
        skippedRuns: 0,
        failedRuns: 0,
        engagedRuns: 0,
        completionRate: null,
        usefulnessRate: null,
        engagementWindowHours: 24,
      },
    }),
  };
  const prisma = overrides.prisma ?? {
    user: {
      update: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    },
    intent: { findMany: vi.fn().mockResolvedValue([]) },
    intentRequest: { findMany: vi.fn().mockResolvedValue([]) },
    connection: { findMany: vi.fn().mockResolvedValue([]) },
    chat: { findMany: vi.fn().mockResolvedValue([]) },
    userReport: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    },
    moderationFlag: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      findUnique: vi.fn().mockResolvedValue(null),
      update: vi.fn(),
    },
    auditLog: {
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({ id: "audit-1" }),
    },
    agentPlanCheckpoint: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    agentMessage: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    agentThread: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    userSession: { updateMany: vi.fn() },
    userProfile: {
      upsert: vi.fn(),
      count: vi.fn().mockResolvedValue(0),
    },
    notification: {
      count: vi.fn().mockResolvedValue(0),
    },
    clientMutation: {
      findMany: vi.fn().mockResolvedValue([]),
    },
  };
  const intentsService = overrides.intentsService ?? {
    retryIntent: vi.fn().mockResolvedValue({ status: "queued" }),
    listIntentExplanations: vi.fn().mockResolvedValue([]),
  };
  const moderationService = overrides.moderationService ?? {
    issueStrike: vi.fn().mockResolvedValue({
      targetUserId: DEAD_LETTER_ID,
      strikeCount: 1,
      moderationState: "review",
      userStatus: "active",
      action: "warn",
    }),
    submitHumanReview: vi.fn().mockResolvedValue({
      id: "decision-1",
      riskLevel: "allow",
      decisionSource: "human",
    }),
  };
  const personalizationService = overrides.personalizationService ?? {
    getGlobalRules: vi.fn().mockResolvedValue({}),
  };
  const notificationsService = overrides.notificationsService ?? {
    createInAppNotification: vi.fn().mockResolvedValue({ id: "notif-1" }),
  };
  const chatsService = overrides.chatsService ?? {
    getChatMetadata: vi.fn().mockResolvedValue({ chatId: CHAT_ID }),
    createSystemMessage: vi.fn().mockResolvedValue({ id: "msg-1" }),
    listMessagesForSync: vi.fn().mockResolvedValue({ messages: [] }),
  };
  const moduleRef = overrides.moduleRef ?? {
    get: vi.fn().mockReturnValue(null),
  };
  const agenticEvalsService = overrides.agenticEvalsService ?? {
    runSnapshot: vi.fn().mockResolvedValue({
      generatedAt: new Date().toISOString(),
      summary: { total: 0, passed: 0, failed: 0, passRate: 0, score: 0 },
      scenarios: [],
    }),
  };
  const workflowRuntimeService = overrides.workflowRuntimeService ?? {
    listRecentRuns: vi.fn().mockResolvedValue([]),
    getRunDetails: vi.fn().mockResolvedValue(null),
  };

  return {
    deadLetterService,
    outboxRelayService,
    adminAuditService,
    appCacheService,
    databaseLatencyService,
    analyticsService,
    prisma,
    intentsService,
    moderationService,
    personalizationService,
    notificationsService,
    chatsService,
    agenticEvalsService,
    workflowRuntimeService,
    moduleRef,
    controller: new AdminController(
      deadLetterService,
      outboxRelayService,
      adminAuditService,
      appCacheService,
      databaseLatencyService as DatabaseLatencyService,
      prisma,
      analyticsService,
      intentsService,
      moderationService,
      personalizationService,
      notificationsService,
      chatsService,
      moduleRef,
      agenticEvalsService,
      workflowRuntimeService,
    ),
  };
}

describe("AdminController", () => {
  it("allows support role to list dead letters and records audit action", async () => {
    const { controller, deadLetterService, adminAuditService } =
      createController();
    await controller.listDeadLetters(ADMIN_USER_ID, "support");

    expect(deadLetterService.listDeadLetters).toHaveBeenCalledWith(100);
    expect(adminAuditService.recordAction).toHaveBeenCalledWith(
      expect.objectContaining({
        adminUserId: ADMIN_USER_ID,
        role: "support",
        action: "admin.dead_letter_list",
      }),
    );
  });

  it("returns recent workflow runtime summaries for support role", async () => {
    const { controller, workflowRuntimeService, adminAuditService } =
      createController({
        workflowRuntimeService: {
          listRecentRuns: vi.fn().mockResolvedValue([
            {
              workflowRunId: "social:intent:intent-1",
              traceId: "trace-1",
              domain: "social",
              entityType: "intent",
              entityId: "intent-1",
              userId: ADMIN_USER_ID,
              threadId: null,
              startedAt: "2026-03-24T00:00:00.000Z",
              lastActivityAt: "2026-03-24T00:00:05.000Z",
              summary: "Intent accepted into the agentic workflow runtime.",
              stages: [
                {
                  stage: "parse",
                  status: "completed",
                  at: "2026-03-24T00:00:01.000Z",
                  summary: "Intent parsing completed and persisted.",
                },
              ],
              replayability: "replayable",
              integrity: {
                sideEffectCount: 0,
                dedupedSideEffectCount: 0,
                reusedRelations: [],
              },
              sideEffects: [],
            },
          ]),
          getRunDetails: vi.fn().mockResolvedValue(null),
        },
      });

    const response = (await controller.opsAgentWorkflows(
      ADMIN_USER_ID,
      "support",
      "10",
    )) as any;

    expect(workflowRuntimeService.listRecentRuns).toHaveBeenCalledWith(10);
    expect(response.data.summary.totalRuns).toBe(1);
    expect(response.data.summary.replayability.replayable).toBe(1);
    expect(response.data.summary.health).toEqual({
      healthy: 1,
      watch: 0,
      critical: 0,
    });
    expect(response.data.runs[0]?.workflowRunId).toBe("social:intent:intent-1");
    expect(adminAuditService.recordAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "admin.ops_agent_workflows_view",
      }),
    );
  });

  it("filters workflow runtime summaries by replayability/domain/dedupe", async () => {
    const { controller, adminAuditService } = createController({
      workflowRuntimeService: {
        listRecentRuns: vi.fn().mockResolvedValue([
          {
            workflowRunId: "social:intent:intent-1",
            traceId: "trace-1",
            domain: "social",
            entityType: "intent",
            entityId: "intent-1",
            userId: ADMIN_USER_ID,
            threadId: null,
            startedAt: "2026-03-24T00:00:00.000Z",
            lastActivityAt: "2026-03-24T00:00:05.000Z",
            summary: "Social replayable run with dedupe.",
            stages: [],
            replayability: "replayable",
            integrity: {
              sideEffectCount: 2,
              dedupedSideEffectCount: 1,
              reusedRelations: ["intent_request_reused"],
            },
            sideEffects: [],
          },
          {
            workflowRunId: "social:intent:intent-2",
            traceId: "trace-2",
            domain: "social",
            entityType: "intent",
            entityId: "intent-2",
            userId: ADMIN_USER_ID,
            threadId: null,
            startedAt: "2026-03-24T00:01:00.000Z",
            lastActivityAt: "2026-03-24T00:01:05.000Z",
            summary: "Social partial run without dedupe.",
            stages: [],
            replayability: "partial",
            integrity: {
              sideEffectCount: 1,
              dedupedSideEffectCount: 0,
              reusedRelations: [],
            },
            sideEffects: [],
          },
          {
            workflowRunId: "dating:intent:intent-3",
            traceId: "trace-3",
            domain: "dating",
            entityType: "intent",
            entityId: "intent-3",
            userId: ADMIN_USER_ID,
            threadId: null,
            startedAt: "2026-03-24T00:02:00.000Z",
            lastActivityAt: "2026-03-24T00:02:05.000Z",
            summary: "Dating replayable run.",
            stages: [],
            replayability: "replayable",
            integrity: {
              sideEffectCount: 1,
              dedupedSideEffectCount: 0,
              reusedRelations: [],
            },
            sideEffects: [],
          },
        ]),
        getRunDetails: vi.fn().mockResolvedValue(null),
      },
    });

    const response = (await controller.opsAgentWorkflows(
      ADMIN_USER_ID,
      "support",
      "20",
      "replayable",
      "social",
      "true",
    )) as any;

    expect(response.data.summary.totalRuns).toBe(1);
    expect(response.data.runs).toHaveLength(1);
    expect(response.data.runs[0]?.workflowRunId).toBe("social:intent:intent-1");
    expect(adminAuditService.recordAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "admin.ops_agent_workflows_view",
        metadata: expect.objectContaining({
          replayabilityFilter: "replayable",
          domainFilter: "social",
          dedupeOnly: true,
          unfilteredRunCount: 3,
          runCount: 1,
        }),
      }),
    );
  });

  it("filters workflow runtime summaries by health", async () => {
    const { controller } = createController({
      workflowRuntimeService: {
        listRecentRuns: vi.fn().mockResolvedValue([
          {
            workflowRunId: "social:intent:intent-healthy",
            traceId: "trace-healthy",
            domain: "social",
            entityType: "intent",
            entityId: "intent-healthy",
            userId: ADMIN_USER_ID,
            threadId: null,
            startedAt: "2026-03-24T00:00:00.000Z",
            lastActivityAt: "2026-03-24T00:00:05.000Z",
            summary: "Healthy run.",
            stages: [
              {
                stage: "ranking",
                status: "completed",
                at: "2026-03-24T00:00:03.000Z",
                summary: "Ranking done.",
              },
            ],
            replayability: "replayable",
            integrity: {
              sideEffectCount: 0,
              dedupedSideEffectCount: 0,
              reusedRelations: [],
            },
            sideEffects: [],
          },
          {
            workflowRunId: "social:intent:intent-critical",
            traceId: "trace-critical",
            domain: "social",
            entityType: "intent",
            entityId: "intent-critical",
            userId: ADMIN_USER_ID,
            threadId: null,
            startedAt: "2026-03-24T00:10:00.000Z",
            lastActivityAt: "2026-03-24T00:10:05.000Z",
            summary: "Critical run.",
            stages: [
              {
                stage: "fanout",
                status: "failed",
                at: "2026-03-24T00:10:03.000Z",
                summary: "Fanout failed.",
              },
            ],
            replayability: "partial",
            integrity: {
              sideEffectCount: 0,
              dedupedSideEffectCount: 0,
              reusedRelations: [],
            },
            sideEffects: [],
          },
        ]),
        getRunDetails: vi.fn().mockResolvedValue(null),
      },
    });

    const response = (await controller.opsAgentWorkflows(
      ADMIN_USER_ID,
      "support",
      "20",
      undefined,
      undefined,
      undefined,
      "critical",
    )) as any;

    expect(response.data.summary.totalRuns).toBe(1);
    expect(response.data.summary.health).toEqual({
      healthy: 0,
      watch: 0,
      critical: 1,
    });
    expect(response.data.summary.stageStatusCounts.failed).toBe(1);
    expect(response.data.runs[0]?.workflowRunId).toBe(
      "social:intent:intent-critical",
    );
    expect(response.data.runs[0]?.health).toBe("critical");
  });

  it("filters workflow runtime summaries by failure class", async () => {
    const { controller } = createController({
      workflowRuntimeService: {
        listRecentRuns: vi.fn().mockResolvedValue([
          {
            workflowRunId: "social:intent:intent-matching",
            traceId: "trace-matching",
            domain: "social",
            entityType: "intent",
            entityId: "intent-matching",
            userId: ADMIN_USER_ID,
            threadId: null,
            startedAt: "2026-03-24T00:00:00.000Z",
            lastActivityAt: "2026-03-24T00:00:05.000Z",
            summary: "Matching run failed in fanout.",
            stages: [
              {
                stage: "fanout",
                status: "failed",
                at: "2026-03-24T00:00:03.000Z",
                summary: "Fanout request failed.",
              },
            ],
            replayability: "partial",
            integrity: {
              sideEffectCount: 0,
              dedupedSideEffectCount: 0,
              reusedRelations: [],
            },
            sideEffects: [],
          },
          {
            workflowRunId: "social:intent:intent-policy",
            traceId: "trace-policy",
            domain: "social",
            entityType: "intent",
            entityId: "intent-policy",
            userId: ADMIN_USER_ID,
            threadId: null,
            startedAt: "2026-03-24T00:10:00.000Z",
            lastActivityAt: "2026-03-24T00:10:05.000Z",
            summary: "Policy blocked run.",
            stages: [
              {
                stage: "moderation",
                status: "blocked",
                at: "2026-03-24T00:10:03.000Z",
                summary: "Blocked by policy gate.",
              },
            ],
            replayability: "partial",
            integrity: {
              sideEffectCount: 0,
              dedupedSideEffectCount: 0,
              reusedRelations: [],
            },
            sideEffects: [],
          },
        ]),
        getRunDetails: vi.fn().mockResolvedValue(null),
      },
    });

    const response = (await controller.opsAgentWorkflows(
      ADMIN_USER_ID,
      "support",
      "20",
      undefined,
      undefined,
      undefined,
      undefined,
      "matching_or_negotiation",
    )) as any;

    expect(response.data.summary.totalRuns).toBe(1);
    expect(response.data.summary.failureClasses.matchingOrNegotiation).toBe(1);
    expect(response.data.summary.failureClasses.moderationOrPolicy).toBe(0);
    expect(response.data.runs[0]?.workflowRunId).toBe(
      "social:intent:intent-matching",
    );
    expect(response.data.runs[0]?.triage.failureClass).toBe(
      "matching_or_negotiation",
    );
    expect(response.data.runs[0]?.triage.suspectStages).toEqual(["fanout"]);
    expect(response.data.runs[0]?.triage.replayHint).toContain(
      "Replay is partial",
    );
  });

  it("maps scenario-backed workflow failure families to triage classes", async () => {
    const scenarioDataset = loadScenarioDataset();
    const scenarioById = new Map(
      scenarioDataset.scenarios.map((scenario) => [scenario.id, scenario]),
    );

    const matrix = [
      {
        scenarioId: "workflow_failure_llm_schema_v1",
        expectedFailureClass: "llm_or_schema",
        stageStatus: "failed",
        dedupedSideEffectCount: 0,
      },
      {
        scenarioId: "workflow_failure_queue_replay_v1",
        expectedFailureClass: "queue_or_replay",
        stageStatus: "failed",
        dedupedSideEffectCount: 0,
      },
      {
        scenarioId: "workflow_failure_notification_followup_v1",
        expectedFailureClass: "notification_or_followup",
        stageStatus: "failed",
        dedupedSideEffectCount: 0,
      },
      {
        scenarioId: "workflow_failure_persistence_dedupe_v1",
        expectedFailureClass: "persistence_or_dedupe",
        stageStatus: "failed",
        dedupedSideEffectCount: 1,
      },
      {
        scenarioId: "workflow_failure_latency_capacity_v1",
        expectedFailureClass: "latency_or_capacity",
        stageStatus: "degraded",
        dedupedSideEffectCount: 0,
      },
      {
        scenarioId: "workflow_failure_observability_gap_v1",
        expectedFailureClass: "observability_gap",
        stageStatus: "failed",
        dedupedSideEffectCount: 0,
      },
    ] as const;

    const runs = matrix.map((entry, index) => {
      const scenario = scenarioById.get(entry.scenarioId);
      if (!scenario) {
        throw new Error(`missing scenario ${entry.scenarioId}`);
      }
      const stage = scenario.expected.workflowStages[0] ?? "unknown";
      return {
        workflowRunId: `social:intent:${scenario.id}`,
        traceId: `trace-failure-family-${index + 1}`,
        domain: "social",
        entityType: "intent",
        entityId: scenario.id,
        userId: ADMIN_USER_ID,
        threadId: null,
        startedAt: "2026-03-24T00:00:00.000Z",
        lastActivityAt: "2026-03-24T00:00:05.000Z",
        summary: scenario.utterance,
        stages: [
          {
            stage,
            status: entry.stageStatus,
            at: "2026-03-24T00:00:03.000Z",
            summary: `Scenario ${scenario.id} failure stage`,
          },
        ],
        replayability:
          entry.stageStatus === "degraded" ? "replayable" : "partial",
        integrity: {
          sideEffectCount: entry.dedupedSideEffectCount > 0 ? 1 : 0,
          dedupedSideEffectCount: entry.dedupedSideEffectCount,
          reusedRelations:
            entry.dedupedSideEffectCount > 0 ? ["intent_request_reused"] : [],
        },
        sideEffects: [],
      };
    });

    const { controller } = createController({
      workflowRuntimeService: {
        listRecentRuns: vi.fn().mockResolvedValue(runs),
        getRunDetails: vi.fn().mockResolvedValue(null),
      },
    });

    const response = (await controller.opsAgentWorkflows(
      ADMIN_USER_ID,
      "support",
      "50",
    )) as any;

    const triageByRunId = new Map<string, any>(
      response.data.runs.map((run: any) => [run.workflowRunId, run.triage]),
    );

    for (const entry of matrix) {
      const scenario = scenarioById.get(entry.scenarioId);
      if (!scenario) {
        throw new Error(`missing scenario ${entry.scenarioId}`);
      }
      const triage = triageByRunId.get(`social:intent:${scenario.id}`);
      expect(triage?.failureClass).toBe(entry.expectedFailureClass);
      expect(Array.isArray(triage?.suspectStages)).toBe(true);
      expect(String(triage?.replayHint ?? "").length).toBeGreaterThan(0);
    }
  });

  it("filters workflow runtime summaries by suspect stage", async () => {
    const { controller, adminAuditService } = createController({
      workflowRuntimeService: {
        listRecentRuns: vi.fn().mockResolvedValue([
          {
            workflowRunId: "social:intent:intent-fanout",
            traceId: "trace-fanout",
            domain: "social",
            entityType: "intent",
            entityId: "intent-fanout",
            userId: ADMIN_USER_ID,
            threadId: null,
            startedAt: "2026-03-24T00:00:00.000Z",
            lastActivityAt: "2026-03-24T00:00:05.000Z",
            summary: "Fanout failure run.",
            stages: [
              {
                stage: "fanout",
                status: "failed",
                at: "2026-03-24T00:00:03.000Z",
                summary: "Fanout failed.",
              },
            ],
            replayability: "partial",
            integrity: {
              sideEffectCount: 0,
              dedupedSideEffectCount: 0,
              reusedRelations: [],
            },
            sideEffects: [],
          },
          {
            workflowRunId: "social:intent:intent-moderation",
            traceId: "trace-moderation",
            domain: "social",
            entityType: "intent",
            entityId: "intent-moderation",
            userId: ADMIN_USER_ID,
            threadId: null,
            startedAt: "2026-03-24T00:10:00.000Z",
            lastActivityAt: "2026-03-24T00:10:05.000Z",
            summary: "Moderation blocked run.",
            stages: [
              {
                stage: "moderation",
                status: "blocked",
                at: "2026-03-24T00:10:03.000Z",
                summary: "Moderation blocked.",
              },
            ],
            replayability: "partial",
            integrity: {
              sideEffectCount: 0,
              dedupedSideEffectCount: 0,
              reusedRelations: [],
            },
            sideEffects: [],
          },
        ]),
        getRunDetails: vi.fn().mockResolvedValue(null),
      },
    });

    const response = (await controller.opsAgentWorkflows(
      ADMIN_USER_ID,
      "support",
      "20",
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      "fanout",
    )) as any;

    expect(response.data.summary.totalRuns).toBe(1);
    expect(response.data.runs).toHaveLength(1);
    expect(response.data.runs[0]?.workflowRunId).toBe(
      "social:intent:intent-fanout",
    );
    expect(response.data.runs[0]?.triage.suspectStages).toEqual(["fanout"]);
    expect(adminAuditService.recordAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "admin.ops_agent_workflows_view",
        metadata: expect.objectContaining({
          suspectStageFilter: ["fanout"],
        }),
      }),
    );
  });

  it("filters workflow runtime summaries by failuresOnly and reports top failure stages", async () => {
    const { controller, adminAuditService } = createController({
      workflowRuntimeService: {
        listRecentRuns: vi.fn().mockResolvedValue([
          {
            workflowRunId: "social:intent:intent-healthy",
            traceId: "trace-healthy",
            domain: "social",
            entityType: "intent",
            entityId: "intent-healthy",
            userId: ADMIN_USER_ID,
            threadId: null,
            startedAt: "2026-03-24T00:00:00.000Z",
            lastActivityAt: "2026-03-24T00:00:05.000Z",
            summary: "Healthy run.",
            stages: [
              {
                stage: "parse",
                status: "completed",
                at: "2026-03-24T00:00:03.000Z",
                summary: "Parse done.",
              },
            ],
            replayability: "replayable",
            integrity: {
              sideEffectCount: 0,
              dedupedSideEffectCount: 0,
              reusedRelations: [],
            },
            sideEffects: [],
          },
          {
            workflowRunId: "social:intent:intent-critical-1",
            traceId: "trace-critical-1",
            domain: "social",
            entityType: "intent",
            entityId: "intent-critical-1",
            userId: ADMIN_USER_ID,
            threadId: null,
            startedAt: "2026-03-24T00:10:00.000Z",
            lastActivityAt: "2026-03-24T00:10:05.000Z",
            summary: "Critical run 1.",
            stages: [
              {
                stage: "fanout",
                status: "failed",
                at: "2026-03-24T00:10:03.000Z",
                summary: "Fanout failed.",
              },
            ],
            replayability: "partial",
            integrity: {
              sideEffectCount: 0,
              dedupedSideEffectCount: 0,
              reusedRelations: [],
            },
            sideEffects: [],
          },
          {
            workflowRunId: "social:intent:intent-critical-2",
            traceId: "trace-critical-2",
            domain: "social",
            entityType: "intent",
            entityId: "intent-critical-2",
            userId: ADMIN_USER_ID,
            threadId: null,
            startedAt: "2026-03-24T00:20:00.000Z",
            lastActivityAt: "2026-03-24T00:20:05.000Z",
            summary: "Critical run 2.",
            stages: [
              {
                stage: "fanout",
                status: "failed",
                at: "2026-03-24T00:20:03.000Z",
                summary: "Fanout failed.",
              },
              {
                stage: "moderation",
                status: "blocked",
                at: "2026-03-24T00:20:04.000Z",
                summary: "Moderation blocked.",
              },
            ],
            replayability: "partial",
            integrity: {
              sideEffectCount: 0,
              dedupedSideEffectCount: 0,
              reusedRelations: [],
            },
            sideEffects: [],
          },
        ]),
        getRunDetails: vi.fn().mockResolvedValue(null),
      },
    });

    const response = (await controller.opsAgentWorkflows(
      ADMIN_USER_ID,
      "support",
      "20",
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      "true",
    )) as any;

    expect(response.data.summary.totalRuns).toBe(2);
    expect(response.data.summary.health).toEqual({
      healthy: 0,
      watch: 0,
      critical: 2,
    });
    expect(response.data.summary.topFailureStages[0]).toEqual({
      stage: "fanout",
      status: "failed",
      count: 2,
    });
    expect(response.data.runs).toHaveLength(2);
    expect(adminAuditService.recordAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "admin.ops_agent_workflows_view",
        metadata: expect.objectContaining({
          failuresOnly: true,
        }),
      }),
    );
  });

  it("rejects invalid workflow replayability filter", async () => {
    const { controller } = createController();

    await expect(
      controller.opsAgentWorkflows(ADMIN_USER_ID, "support", "20", "invalid"),
    ).rejects.toThrow(
      "replayability must be replayable, partial, or inspect_only",
    );
  });

  it("rejects invalid workflow health filter", async () => {
    const { controller } = createController();

    await expect(
      controller.opsAgentWorkflows(
        ADMIN_USER_ID,
        "support",
        "20",
        undefined,
        undefined,
        undefined,
        "unstable",
      ),
    ).rejects.toThrow("health must be healthy, watch, or critical");
  });

  it("rejects invalid workflow failure class filter", async () => {
    const { controller } = createController();

    await expect(
      controller.opsAgentWorkflows(
        ADMIN_USER_ID,
        "support",
        "20",
        undefined,
        undefined,
        undefined,
        undefined,
        "unknown_class",
      ),
    ).rejects.toThrow("failureClass must be one of:");
  });

  it("rejects invalid failuresOnly query", async () => {
    const { controller } = createController();

    await expect(
      controller.opsAgentWorkflows(
        ADMIN_USER_ID,
        "support",
        "20",
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        "sometimes",
      ),
    ).rejects.toThrow("boolean query must be true/false");
  });

  it("returns workflow runtime detail snapshot for support role", async () => {
    const { controller, workflowRuntimeService, adminAuditService } =
      createController({
        workflowRuntimeService: {
          listRecentRuns: vi.fn().mockResolvedValue([]),
          getRunDetails: vi.fn().mockResolvedValue({
            run: {
              workflowRunId: "social:intent:intent-1",
              traceId: "trace-1",
              domain: "social",
              entityType: "intent",
              entityId: "intent-1",
              userId: ADMIN_USER_ID,
              threadId: null,
              startedAt: "2026-03-24T00:00:00.000Z",
              lastActivityAt: "2026-03-24T00:00:05.000Z",
              summary: "Intent accepted into runtime.",
              stages: [
                {
                  stage: "parse",
                  status: "completed",
                  at: "2026-03-24T00:00:01.000Z",
                  summary: "Parse complete.",
                },
              ],
              replayability: "replayable",
              integrity: {
                sideEffectCount: 1,
                dedupedSideEffectCount: 0,
                reusedRelations: [],
              },
              sideEffects: [
                {
                  relation: "intent_request",
                  entityType: "intent_request",
                  entityId: "req-1",
                  at: "2026-03-24T00:00:02.000Z",
                  summary: "Created intro request.",
                },
              ],
            },
            trace: {
              eventCount: 1,
              failedEventCount: 0,
              events: [
                {
                  id: "audit-1",
                  action: "intent.pipeline.completed",
                },
              ],
            },
          }),
        },
      });

    const response = (await controller.opsAgentWorkflowDetails(
      ADMIN_USER_ID,
      "support",
      "social:intent:intent-1",
    )) as any;

    expect(workflowRuntimeService.getRunDetails).toHaveBeenCalledWith(
      "social:intent:intent-1",
    );
    expect(response.data.run.workflowRunId).toBe("social:intent:intent-1");
    expect(response.data.trace.eventCount).toBe(1);
    expect(response.data.insights.health).toBe("healthy");
    expect(response.data.insights.stageStatusCounts.completed).toBe(1);
    expect(response.data.insights.triage.failureClass).toBe("none");
    expect(response.data.insights.triage.suspectStages).toEqual([]);
    expect(response.data.insights.triage.replayHint).toContain(
      "Replay is available",
    );
    expect(adminAuditService.recordAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "admin.ops_agent_workflow_detail_view",
        entityId: "social:intent:intent-1",
        metadata: expect.objectContaining({
          failureClass: "none",
        }),
      }),
    );
  });

  it("requires workflowRunId for workflow runtime detail snapshot", async () => {
    const { controller } = createController();

    await expect(
      controller.opsAgentWorkflowDetails(ADMIN_USER_ID, "support", undefined),
    ).rejects.toThrow("workflowRunId is required");
  });

  it("returns not found when workflow runtime detail run does not exist", async () => {
    const { controller } = createController({
      workflowRuntimeService: {
        listRecentRuns: vi.fn().mockResolvedValue([]),
        getRunDetails: vi.fn().mockResolvedValue(null),
      },
    });

    await expect(
      controller.opsAgentWorkflowDetails(
        ADMIN_USER_ID,
        "support",
        "social:intent:missing",
      ),
    ).rejects.toThrow("workflow run not found");
  });

  it("rejects moderator role for dead-letter replay actions", async () => {
    const { controller } = createController();

    await expect(
      controller.replayDeadLetter(DEAD_LETTER_ID, ADMIN_USER_ID, "moderator"),
    ).rejects.toThrow("not permitted");
  });

  it("allows admin role to replay dead letters", async () => {
    const { controller, deadLetterService, adminAuditService } =
      createController();

    await controller.replayDeadLetter(DEAD_LETTER_ID, ADMIN_USER_ID, "admin");

    expect(deadLetterService.replayDeadLetter).toHaveBeenCalledWith(
      DEAD_LETTER_ID,
    );
    expect(adminAuditService.recordAction).toHaveBeenCalledWith(
      expect.objectContaining({
        role: "admin",
        entityId: DEAD_LETTER_ID,
      }),
    );
  });

  it("allows moderator role to read moderation queue", async () => {
    const { controller, adminAuditService } = createController();

    await controller.moderationQueue(ADMIN_USER_ID, "moderator", "50");

    expect(adminAuditService.listModerationQueue).toHaveBeenCalledWith({
      limit: 50,
      status: undefined,
      entityType: undefined,
      reasonContains: undefined,
    });
    expect(adminAuditService.recordAction).toHaveBeenCalledWith(
      expect.objectContaining({
        role: "moderator",
        action: "admin.moderation_queue_list",
      }),
    );
  });

  it("passes moderation queue filters through to the audit service", async () => {
    const { controller, adminAuditService } = createController();

    await controller.moderationQueue(
      ADMIN_USER_ID,
      "moderator",
      "25",
      "resolved",
      "chat_message",
      "threat",
    );

    expect(adminAuditService.listModerationQueue).toHaveBeenCalledWith({
      limit: 25,
      status: "resolved",
      entityType: "chat_message",
      reasonContains: "threat",
    });
  });

  it("lists agent-thread moderation risk flags with filters", async () => {
    const { controller, prisma, adminAuditService } = createController({
      prisma: {
        moderationFlag: {
          findMany: vi.fn().mockResolvedValue([
            {
              id: DEAD_LETTER_ID,
              entityType: "agent_thread",
              entityId: AGENT_THREAD_ID,
              reason: "agent_pre_tools_blocked:blocked_term_bomb_threat",
              status: "open",
              createdAt: new Date("2026-03-20T18:00:00.000Z"),
            },
          ]),
          count: vi.fn().mockResolvedValue(1),
        },
        auditLog: {
          findMany: vi.fn().mockResolvedValue([
            {
              id: "66666666-6666-4666-8666-666666666666",
              entityId: AGENT_THREAD_ID,
              metadata: {
                phase: "pre_tools",
                decision: "blocked",
              },
              createdAt: new Date("2026-03-20T18:00:01.000Z"),
            },
            {
              id: "77777777-7777-4777-8777-777777777777",
              entityId: DEAD_LETTER_ID,
              metadata: {
                assigneeUserId: ADMIN_USER_ID,
              },
              createdAt: new Date("2026-03-20T18:10:00.000Z"),
            },
          ]),
        },
      },
    });

    const result = await controller.moderationAgentRiskFlags(
      ADMIN_USER_ID,
      "moderator",
      "20",
      "open",
      "blocked",
    );
    const payload = result.data as {
      totalMatching: number;
      items: Array<{
        id: string;
        latestRiskAudit: { id: string } | null;
        latestAssignment: { id: string } | null;
      }>;
    };

    expect(prisma.moderationFlag.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          entityType: "agent_thread",
          status: "open",
          reason: expect.objectContaining({
            contains: "_blocked:",
          }),
        }),
        take: 20,
      }),
    );
    expect(payload.totalMatching).toBe(1);
    expect(payload.items[0]?.latestRiskAudit?.id).toBe(
      "66666666-6666-4666-8666-666666666666",
    );
    expect(payload.items[0]?.latestAssignment?.id).toBe(
      "77777777-7777-4777-8777-777777777777",
    );
    expect(adminAuditService.recordAction).toHaveBeenCalledWith(
      expect.objectContaining({
        role: "moderator",
        action: "admin.moderation_agent_risk_list",
      }),
    );
  });

  it("falls back when moderation risk queries hit schema drift", async () => {
    const schemaDriftError = Object.assign(new Error("missing column"), {
      code: "P2022",
    });
    const { controller } = createController({
      prisma: {
        moderationFlag: {
          findMany: vi.fn().mockRejectedValue(schemaDriftError),
          count: vi.fn().mockResolvedValue(0),
        },
      },
    });

    const result = await controller.moderationAgentRiskFlags(
      ADMIN_USER_ID,
      "moderator",
      "20",
      "open",
      "blocked",
    );
    const payload = result.data as {
      totalMatching: number;
      items: Array<unknown>;
      degradedReadWarnings: string[];
    };

    expect(payload.totalMatching).toBe(0);
    expect(payload.items).toEqual([]);
    expect(payload.degradedReadWarnings).toContain(
      "moderation_agent_risk_flags.read",
    );
  });

  it("builds agent action debug snapshots with replay hints", async () => {
    const auditLogFindMany = vi
      .fn()
      .mockResolvedValueOnce([
        {
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          actorUserId: DEAD_LETTER_ID,
          entityId: AGENT_THREAD_ID,
          createdAt: new Date("2026-03-22T12:00:00.000Z"),
          metadata: {
            traceId: "trace-agentic-debug",
            tool: "intro.send_request",
            status: "denied",
            role: "manager",
            reason: "human_approval_required",
            summary: "Planner requested approval before sending intro.",
            input: {
              targetUserId: INTENT_ID,
            },
            output: null,
          },
        },
      ])
      .mockResolvedValueOnce([
        {
          id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          action: "matching.candidates_retrieved",
          entityType: "agent_thread",
          entityId: AGENT_THREAD_ID,
          createdAt: new Date("2026-03-22T11:59:58.000Z"),
          metadata: {
            traceId: "trace-agentic-debug",
            summary: "Retrieved 3 candidate profiles after language filtering.",
          },
        },
      ]);

    const { controller, prisma, adminAuditService } = createController({
      prisma: {
        auditLog: {
          findMany: auditLogFindMany,
          create: vi.fn().mockResolvedValue({ id: "audit-1" }),
        },
        agentPlanCheckpoint: {
          findMany: vi.fn().mockResolvedValue([
            {
              id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
              threadId: AGENT_THREAD_ID,
              traceId: "trace-agentic-debug",
              actionType: "social_outreach",
              riskLevel: "high",
              status: "pending",
              decisionReason: "human_approval_required",
              requestedByRole: "manager",
              tool: "intro.send_request",
              createdAt: new Date("2026-03-22T12:00:01.000Z"),
              resolvedAt: null,
            },
          ]),
        },
        agentMessage: {
          findMany: vi.fn().mockResolvedValue([
            {
              id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
              threadId: AGENT_THREAD_ID,
              content: "Find me someone to talk startups with tonight.",
              createdAt: new Date("2026-03-22T11:59:50.000Z"),
            },
          ]),
        },
        agentThread: {
          findMany: vi.fn().mockResolvedValue([
            {
              id: AGENT_THREAD_ID,
              title: "Tonight startup intros",
              createdAt: new Date("2026-03-22T11:58:00.000Z"),
            },
          ]),
        },
      },
    });

    const result = await controller.opsAgentActions(ADMIN_USER_ID, "support", {
      limit: "25",
      status: "denied",
      tool: "intro.send_request",
      threadId: AGENT_THREAD_ID,
      traceId: "trace-agentic-debug",
    });

    const payload = result.data as {
      items: Array<{
        tool: string | null;
        status: string | null;
        latestUserMessage: { content: string } | null;
        linkedCheckpoint: { id: string } | null;
        replayHint: string;
        relatedTraceEvents: Array<{ id: string }>;
      }>;
    };

    expect(payload.items).toHaveLength(1);
    expect(payload.items[0]?.tool).toBe("intro.send_request");
    expect(payload.items[0]?.status).toBe("denied");
    expect(payload.items[0]?.latestUserMessage?.content).toContain(
      "talk startups with tonight",
    );
    expect(payload.items[0]?.linkedCheckpoint?.id).toBe(
      "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    );
    expect(payload.items[0]?.relatedTraceEvents).toEqual([
      expect.objectContaining({
        id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      }),
    ]);
    expect(payload.items[0]?.replayHint).toContain("approval checkpoint");
    expect(adminAuditService.recordAction).toHaveBeenCalledWith(
      expect.objectContaining({
        role: "support",
        action: "admin.ops_agent_actions_view",
      }),
    );
    expect(prisma.agentPlanCheckpoint.findMany).toHaveBeenCalled();
    expect(prisma.agentMessage.findMany).toHaveBeenCalled();
    expect(prisma.agentThread.findMany).toHaveBeenCalled();
  });

  it("assigns moderation flags to an admin reviewer", async () => {
    const { controller, prisma, adminAuditService } = createController({
      prisma: {
        moderationFlag: {
          findUnique: vi.fn().mockResolvedValue({
            id: DEAD_LETTER_ID,
            entityType: "agent_thread",
            entityId: AGENT_THREAD_ID,
            reason: "agent_pre_send_review:review_term_scam",
            status: "open",
            createdAt: new Date("2026-03-20T18:05:00.000Z"),
          }),
          update: vi.fn().mockResolvedValue({
            id: DEAD_LETTER_ID,
            assigneeUserId: ADMIN_USER_ID,
          }),
        },
        auditLog: {
          create: vi.fn().mockResolvedValue({
            id: "88888888-8888-4888-8888-888888888888",
          }),
        },
      },
    });

    await controller.assignModerationFlag(
      DEAD_LETTER_ID,
      {
        assigneeUserId: ADMIN_USER_ID,
        reason: "manual review ownership",
      },
      ADMIN_USER_ID,
      "support",
    );

    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "admin.moderation_flag_assigned",
          entityType: "moderation_flag",
          entityId: DEAD_LETTER_ID,
          metadata: expect.objectContaining({
            assigneeUserId: ADMIN_USER_ID,
          }),
        }),
      }),
    );
    expect(prisma.moderationFlag.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: DEAD_LETTER_ID },
        data: expect.objectContaining({
          assigneeUserId: ADMIN_USER_ID,
          assignmentNote: "manual review ownership",
        }),
      }),
    );
    expect(adminAuditService.recordAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "admin.moderation_flag_assign",
        role: "support",
      }),
    );
  });

  it("triages moderation flags with resolve action", async () => {
    const { controller, prisma, adminAuditService } = createController({
      prisma: {
        moderationFlag: {
          findUnique: vi.fn().mockResolvedValue({
            id: DEAD_LETTER_ID,
            entityType: "agent_thread",
            entityId: AGENT_THREAD_ID,
            reason: "agent_pre_send_review:review_term_scam",
            status: "open",
            createdAt: new Date("2026-03-20T18:05:00.000Z"),
          }),
          update: vi.fn().mockResolvedValue({
            id: DEAD_LETTER_ID,
            entityType: "agent_thread",
            entityId: AGENT_THREAD_ID,
            reason: "agent_pre_send_review:review_term_scam",
            status: "resolved",
            createdAt: new Date("2026-03-20T18:05:00.000Z"),
          }),
        },
      },
    });

    await controller.triageModerationFlag(
      DEAD_LETTER_ID,
      {
        action: "resolve",
        reason: "handled by moderator",
      },
      ADMIN_USER_ID,
      "support",
    );

    expect(prisma.moderationFlag.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "resolved",
        }),
      }),
    );
    expect(adminAuditService.recordAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "admin.moderation_flag_triage",
        role: "support",
      }),
    );
  });

  it("triages moderation flags with strike escalation", async () => {
    const { controller, prisma, moderationService } = createController({
      prisma: {
        moderationFlag: {
          findUnique: vi.fn().mockResolvedValue({
            id: DEAD_LETTER_ID,
            entityType: "agent_thread",
            entityId: AGENT_THREAD_ID,
            reason: "agent_pre_tools_blocked:blocked_term_bomb_threat",
            status: "open",
            createdAt: new Date("2026-03-20T18:07:00.000Z"),
          }),
          update: vi.fn().mockResolvedValue({
            id: DEAD_LETTER_ID,
            entityType: "agent_thread",
            entityId: AGENT_THREAD_ID,
            reason: "agent_pre_tools_blocked:blocked_term_bomb_threat",
            status: "resolved",
            createdAt: new Date("2026-03-20T18:07:00.000Z"),
          }),
        },
      },
    });

    await controller.triageModerationFlag(
      DEAD_LETTER_ID,
      {
        action: "escalate_strike",
        targetUserId: DEAD_LETTER_ID,
        strikeSeverity: 3,
      },
      ADMIN_USER_ID,
      "moderator",
    );

    expect(moderationService.issueStrike).toHaveBeenCalledWith(
      expect.objectContaining({
        moderatorUserId: ADMIN_USER_ID,
        targetUserId: DEAD_LETTER_ID,
        severity: 3,
        entityType: "user",
        entityId: DEAD_LETTER_ID,
      }),
    );
    expect(prisma.moderationFlag.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "resolved",
        }),
      }),
    );
  });

  it("links triage with human moderation decision when decisionId is provided", async () => {
    const { controller, prisma, moderationService } = createController({
      prisma: {
        moderationFlag: {
          findUnique: vi.fn().mockResolvedValue({
            id: DEAD_LETTER_ID,
            entityType: "chat_message",
            entityId: CHAT_ID,
            reason: "decision:review:review_term_scam",
            status: "open",
            createdAt: new Date("2026-03-20T18:07:00.000Z"),
          }),
          update: vi.fn().mockResolvedValue({
            id: DEAD_LETTER_ID,
            entityType: "chat_message",
            entityId: CHAT_ID,
            reason: "decision:review:review_term_scam",
            status: "resolved",
            createdAt: new Date("2026-03-20T18:07:00.000Z"),
          }),
        },
      },
      moderationService: {
        issueStrike: vi.fn().mockResolvedValue({}),
        submitHumanReview: vi.fn().mockResolvedValue({
          id: "decision-123",
          riskLevel: "allow",
          decisionSource: "human",
        }),
      },
    });

    const result = await controller.triageModerationFlag(
      DEAD_LETTER_ID,
      {
        action: "resolve",
        decisionId: "decision-123",
        reason: "approved after moderator review",
      },
      ADMIN_USER_ID,
      "moderator",
    );

    expect(moderationService.submitHumanReview).toHaveBeenCalledWith(
      expect.objectContaining({
        decisionId: "decision-123",
        action: "approve",
        reviewerUserId: ADMIN_USER_ID,
      }),
    );
    const payload = result.data as { humanReviewResult: { id: string } };
    expect(payload.humanReviewResult.id).toBe("decision-123");
    expect(prisma.moderationFlag.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "resolved",
        }),
      }),
    );
  });

  it("submits direct human review decisions from admin endpoint", async () => {
    const { controller, moderationService, adminAuditService } =
      createController({
        moderationService: {
          issueStrike: vi.fn().mockResolvedValue({}),
          submitHumanReview: vi.fn().mockResolvedValue({
            id: "decision-abc",
            riskLevel: "block",
            decisionSource: "human",
          }),
        },
      });

    const result = await controller.submitModerationDecisionReview(
      "decision-abc",
      {
        action: "reject",
        note: "policy-confirmed abuse",
      },
      ADMIN_USER_ID,
      "support",
    );

    expect(moderationService.submitHumanReview).toHaveBeenCalledWith(
      expect.objectContaining({
        decisionId: "decision-abc",
        action: "reject",
        reviewerUserId: ADMIN_USER_ID,
        note: "policy-confirmed abuse",
      }),
    );
    expect(adminAuditService.recordAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "admin.moderation_decision_review",
        entityType: "moderation_decision",
        entityId: "decision-abc",
      }),
    );
    const payload = result.data as { decision: { id: string } };
    expect(payload.decision.id).toBe("decision-abc");
  });

  it("builds a moderation summary snapshot", async () => {
    const { controller, adminAuditService } = createController({
      prisma: {
        moderationFlag: {
          count: vi
            .fn()
            .mockResolvedValueOnce(12)
            .mockResolvedValueOnce(4)
            .mockResolvedValueOnce(2)
            .mockResolvedValueOnce(5),
          findMany: vi
            .fn()
            .mockResolvedValueOnce([
              {
                id: DEAD_LETTER_ID,
                entityType: "agent_thread",
                entityId: AGENT_THREAD_ID,
                reason: "agent_pre_tools_blocked:blocked_term",
                status: "open",
                createdAt: new Date("2026-03-20T18:00:00.000Z"),
              },
            ])
            .mockResolvedValueOnce([
              {
                entityId: AGENT_THREAD_ID,
                reason: "agent_pre_tools_blocked:blocked_term",
                status: "open",
                createdAt: new Date("2026-03-20T18:00:00.000Z"),
                assignedAt: new Date("2026-03-20T18:05:00.000Z"),
                triagedAt: new Date("2026-03-20T18:12:00.000Z"),
              },
              {
                entityId: AGENT_THREAD_ID,
                reason: "agent_pre_tools_blocked:blocked_term",
                status: "dismissed",
                createdAt: new Date("2026-03-20T19:00:00.000Z"),
                assignedAt: new Date("2026-03-20T19:06:00.000Z"),
                triagedAt: new Date("2026-03-20T19:15:00.000Z"),
              },
              {
                entityId: INTENT_ID,
                reason: "profile_media_review",
                status: "resolved",
                createdAt: new Date("2026-03-20T20:00:00.000Z"),
                assignedAt: new Date("2026-03-20T20:04:00.000Z"),
                triagedAt: new Date("2026-03-20T20:08:00.000Z"),
              },
            ]),
        },
        userReport: {
          count: vi.fn().mockResolvedValueOnce(3).mockResolvedValueOnce(8),
          findMany: vi.fn().mockResolvedValue([
            {
              id: INTENT_ID,
              reporterUserId: ADMIN_USER_ID,
              targetUserId: DEAD_LETTER_ID,
              reason: "abuse",
              status: "open",
              createdAt: new Date("2026-03-20T18:30:00.000Z"),
            },
          ]),
        },
        userProfile: {
          count: vi.fn().mockResolvedValue(6),
        },
        user: {
          count: vi.fn().mockResolvedValue(2),
        },
      },
    });

    const result = await controller.moderationSummary(
      ADMIN_USER_ID,
      "moderator",
    );
    const payload = result.data as {
      queue: {
        openFlags: number;
        agentRiskOpenFlags: number;
        reportsOpen: number;
      };
      actions24h: {
        reports24h: number;
        resolvedFlags24h: number;
        dismissedFlags24h: number;
      };
      enforcement: { blockedProfiles: number; suspendedUsers: number };
      analytics: {
        avgTimeToAssignmentMinutes: number | null;
        avgTimeToDecisionMinutes: number | null;
        dismissalRate24h: number;
        repeatOffenders24h: number;
        topReasons: Array<{ reason: string; count: number }>;
      };
      recent: { flags: unknown[]; reports: unknown[] };
    };

    expect(payload.queue).toEqual({
      openFlags: 12,
      agentRiskOpenFlags: 5,
      reportsOpen: 3,
    });
    expect(payload.actions24h).toEqual({
      reports24h: 8,
      resolvedFlags24h: 4,
      dismissedFlags24h: 2,
    });
    expect(payload.enforcement).toEqual({
      blockedProfiles: 6,
      suspendedUsers: 2,
    });
    expect(payload.analytics.avgTimeToAssignmentMinutes).toBe(5);
    expect(payload.analytics.avgTimeToDecisionMinutes).toBe(12);
    expect(payload.analytics.dismissalRate24h).toBeCloseTo(0.33);
    expect(payload.analytics.repeatOffenders24h).toBe(1);
    expect(payload.analytics.topReasons[0]).toEqual({
      reason: "agent_pre_tools_blocked:blocked_term",
      count: 2,
    });
    expect(payload.recent.flags).toHaveLength(1);
    expect(payload.recent.reports).toHaveLength(1);
    expect(adminAuditService.recordAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "admin.moderation_summary_view",
      }),
    );
  });

  it("returns a sanitized moderation settings snapshot", async () => {
    const originalEnv = {
      MODERATION_PROVIDER: process.env.MODERATION_PROVIDER,
      MODERATION_PROVIDER_API_KEY: process.env.MODERATION_PROVIDER_API_KEY,
      MODERATION_AGENT_RISK_ENABLED: process.env.MODERATION_AGENT_RISK_ENABLED,
      MODERATION_AUTO_BLOCK_TERMS_ENABLED:
        process.env.MODERATION_AUTO_BLOCK_TERMS_ENABLED,
      MODERATION_STRICT_MEDIA_REVIEW_ENABLED:
        process.env.MODERATION_STRICT_MEDIA_REVIEW_ENABLED,
      MODERATION_USER_REPORTS_ENABLED:
        process.env.MODERATION_USER_REPORTS_ENABLED,
      ALERT_MODERATION_BACKLOG_THRESHOLD:
        process.env.ALERT_MODERATION_BACKLOG_THRESHOLD,
      ALERT_DB_LATENCY_THRESHOLD_MS: process.env.ALERT_DB_LATENCY_THRESHOLD_MS,
      ALERT_OPENAI_ERROR_RATE_THRESHOLD:
        process.env.ALERT_OPENAI_ERROR_RATE_THRESHOLD,
      MODERATION_AGENT_BLOCKED_LABEL:
        process.env.MODERATION_AGENT_BLOCKED_LABEL,
      MODERATION_AGENT_REVIEW_LABEL: process.env.MODERATION_AGENT_REVIEW_LABEL,
    };
    process.env.MODERATION_PROVIDER = "openai";
    process.env.MODERATION_PROVIDER_API_KEY = "set";
    process.env.MODERATION_AGENT_RISK_ENABLED = "true";
    process.env.MODERATION_AUTO_BLOCK_TERMS_ENABLED = "false";
    process.env.MODERATION_STRICT_MEDIA_REVIEW_ENABLED = "true";
    process.env.MODERATION_USER_REPORTS_ENABLED = "true";
    process.env.ALERT_MODERATION_BACKLOG_THRESHOLD = "111";
    process.env.ALERT_DB_LATENCY_THRESHOLD_MS = "900";
    process.env.ALERT_OPENAI_ERROR_RATE_THRESHOLD = "0.4";
    process.env.MODERATION_AGENT_BLOCKED_LABEL = "blocked";
    process.env.MODERATION_AGENT_REVIEW_LABEL = "review";

    try {
      const { controller, adminAuditService } = createController();
      const result = await controller.moderationSettings(
        ADMIN_USER_ID,
        "moderator",
      );
      const payload = result.data as {
        provider: string;
        keys: {
          moderationProviderConfigured: boolean;
          openaiConfigured: boolean;
          customProviderConfigured: boolean;
        };
        toggles: {
          agentRiskEnabled: boolean;
          autoBlockTermsEnabled: boolean;
          strictMediaReview: boolean;
          userReportsEnabled: boolean;
        };
        thresholds: {
          moderationBacklogAlert: number;
          dbLatencyAlertMs: number;
          openAiErrorRateAlert: number;
        };
      };

      expect(payload.provider).toBe("openai");
      expect(payload.keys.moderationProviderConfigured).toBe(true);
      expect(payload.toggles.autoBlockTermsEnabled).toBe(false);
      expect(payload.thresholds).toEqual({
        moderationBacklogAlert: 111,
        dbLatencyAlertMs: 900,
        openAiErrorRateAlert: 0.4,
      });
      expect(adminAuditService.recordAction).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "admin.moderation_settings_view",
        }),
      );
    } finally {
      for (const [key, value] of Object.entries(originalEnv)) {
        if (value === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = value;
        }
      }
    }
  });

  it("deactivates users and revokes active sessions", async () => {
    const { controller, prisma, adminAuditService } = createController({
      prisma: {
        user: {
          update: vi
            .fn()
            .mockResolvedValue({ id: DEAD_LETTER_ID, status: "suspended" }),
          findMany: vi.fn().mockResolvedValue([]),
        },
        intent: { findMany: vi.fn().mockResolvedValue([]) },
        intentRequest: { findMany: vi.fn().mockResolvedValue([]) },
        connection: { findMany: vi.fn().mockResolvedValue([]) },
        chat: { findMany: vi.fn().mockResolvedValue([]) },
        userReport: { findMany: vi.fn().mockResolvedValue([]) },
        userSession: {
          updateMany: vi.fn().mockResolvedValue({ count: 3 }),
        },
        userProfile: { upsert: vi.fn() },
      },
    });

    await controller.deactivateUser(
      DEAD_LETTER_ID,
      { reason: "fraud" },
      ADMIN_USER_ID,
      "admin",
    );

    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: DEAD_LETTER_ID },
      }),
    );
    expect(prisma.userSession.updateMany).toHaveBeenCalledTimes(1);
    expect(adminAuditService.recordAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "admin.user_deactivate",
      }),
    );
  });

  it("lists users for moderator role", async () => {
    const { controller, prisma, adminAuditService } = createController();

    await controller.listUsers(ADMIN_USER_ID, "moderator", "25");

    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 25,
      }),
    );
    expect(adminAuditService.recordAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "admin.users_list",
        role: "moderator",
      }),
    );
  });

  it("lists intents for support role", async () => {
    const { controller, prisma, adminAuditService } = createController();

    await controller.listIntents(ADMIN_USER_ID, "support", "20");

    expect(prisma.intent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 20,
      }),
    );
    expect(adminAuditService.recordAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "admin.intents_list",
        role: "support",
      }),
    );
  });

  it("lists reports for support role", async () => {
    const { controller, prisma, adminAuditService } = createController();

    await controller.listReports(ADMIN_USER_ID, "support", "15");

    expect(prisma.userReport.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 15,
      }),
    );
    expect(adminAuditService.recordAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "admin.reports_list",
      }),
    );
  });

  it("replays intent workflow for support role", async () => {
    const { controller, intentsService } = createController();
    await controller.replayIntentWorkflow(INTENT_ID, ADMIN_USER_ID, "support");

    expect(intentsService.retryIntent).toHaveBeenCalledWith(
      INTENT_ID,
      expect.any(String),
    );
  });

  it("resends notifications for support role", async () => {
    const { controller, notificationsService } = createController();
    await controller.resendNotification(
      DEAD_LETTER_ID,
      {
        type: "agent_update",
        body: "Retrying your workflow update.",
      },
      ADMIN_USER_ID,
      "support",
    );

    expect(notificationsService.createInAppNotification).toHaveBeenCalledWith(
      DEAD_LETTER_ID,
      "agent_update",
      "Retrying your workflow update.",
    );
  });

  it("repairs stuck chat flow and posts repair marker", async () => {
    const { controller, chatsService, outboxRelayService } = createController();
    await controller.repairChatFlow(
      CHAT_ID,
      {
        syncUserId: DEAD_LETTER_ID,
      },
      ADMIN_USER_ID,
      "support",
    );

    expect(chatsService.getChatMetadata).toHaveBeenCalledWith(CHAT_ID);
    expect(chatsService.createSystemMessage).toHaveBeenCalledTimes(1);
    expect(outboxRelayService.relayPendingEvents).toHaveBeenCalledWith(50);
  });

  it("returns queue monitor overview for admin tools", async () => {
    const queue = {
      getJobCounts: vi.fn().mockResolvedValue({
        waiting: 1,
        active: 2,
        delayed: 0,
        completed: 10,
        failed: 1,
      }),
      isPaused: vi.fn().mockResolvedValue(false),
    };
    const moduleRef = {
      get: vi.fn().mockReturnValue(queue),
    };
    const { controller, adminAuditService } = createController({
      moduleRef,
    });

    const result = await controller.queueOverview(ADMIN_USER_ID, "support");
    const payload = result.data as {
      queues: Array<{ available: boolean }>;
    };

    expect(moduleRef.get).toHaveBeenCalledTimes(JOB_QUEUE_NAMES.length);
    expect(payload.queues).toHaveLength(JOB_QUEUE_NAMES.length);
    expect(payload.queues[0]).toEqual(
      expect.objectContaining({
        available: true,
      }),
    );
    expect(adminAuditService.recordAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "admin.queue_overview",
      }),
    );
  });

  it("returns operational metrics snapshot for support role", async () => {
    resetOpsRuntimeMetrics();
    recordHttpRequestMetric(90, 200);
    recordQueueJobProcessing("notification", 55);
    recordQueueJobFailure("notification");
    recordOpenAIMetric({
      operation: "intent_parsing",
      latencyMs: 210,
      ok: true,
    });
    recordOnboardingInferenceMetric({
      mode: "fast",
      model: "ministral-3:14b",
      durationMs: 1100,
      unavailable: false,
      fallback: false,
    });

    const { controller, adminAuditService } = createController({
      prisma: {
        user: { count: vi.fn().mockResolvedValue(50) },
        userReport: { count: vi.fn().mockResolvedValue(2) },
        moderationFlag: { count: vi.fn().mockResolvedValue(1) },
        auditLog: { count: vi.fn().mockResolvedValue(1) },
        userProfile: { count: vi.fn().mockResolvedValue(1) },
        notification: {
          count: vi.fn().mockResolvedValueOnce(10).mockResolvedValueOnce(4),
        },
      },
    });

    const result = await controller.opsMetrics(ADMIN_USER_ID, "support");
    const payload = result.data as {
      apiLatency: { avgMs: number };
      queueLag: Array<{ queue: string }>;
      openaiLatencyCost: { calls: number };
      openaiBudget: { clientCount: number };
      dbLatency: { pingMs: number | null };
      moderationRates: {
        reports24h: number;
        moderationDecisionReviews24h: number;
        overturnRate24h: number;
      };
      queueDepth: Array<{ queue: string; waiting: number }>;
      pushDeliverySuccess: { pushSent24h: number; pushRead24h: number };
      onboardingInference: { calls: number };
    };

    expect(payload.apiLatency.avgMs).toBeGreaterThan(0);
    expect(payload.queueLag).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ queue: "notification" }),
      ]),
    );
    expect(payload.openaiLatencyCost.calls).toBe(1);
    expect(payload.openaiBudget.clientCount).toBeGreaterThanOrEqual(0);
    expect(payload.dbLatency.pingMs).not.toBeNull();
    expect(payload.moderationRates.reports24h).toBe(2);
    expect(payload.moderationRates.moderationDecisionReviews24h).toBe(1);
    expect(payload.moderationRates.overturnRate24h).toBeGreaterThanOrEqual(0);
    expect(payload.queueDepth).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ queue: "notification" }),
      ]),
    );
    expect(payload.pushDeliverySuccess.pushSent24h).toBe(10);
    expect(payload.pushDeliverySuccess.pushRead24h).toBe(4);
    expect(payload.onboardingInference.calls).toBe(1);
    expect(adminAuditService.recordAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "admin.ops_metrics_view",
      }),
    );
  });

  it("returns llm runtime health snapshot for support role", async () => {
    resetOpsRuntimeMetrics();
    recordOpenAIMetric({
      operation: "conversation_response",
      latencyMs: 320,
      ok: true,
    });
    recordOnboardingInferenceMetric({
      mode: "fast",
      model: "gpt-4.1-mini",
      durationMs: 950,
      unavailable: false,
      fallback: false,
    });
    recordOnboardingInferenceMetric({
      mode: "rich",
      model: "gpt-4.1-mini",
      durationMs: 1800,
      unavailable: true,
      fallback: true,
    });

    const { controller, adminAuditService } = createController();
    const result = await controller.llmRuntimeHealth(ADMIN_USER_ID, "support");
    const payload = result.data as {
      onboarding: {
        calls: number;
        fallbackRate: number;
        byMode: { fast: any };
      };
      openai: { calls: number; errorRate: number };
      budget: { clientCount: number; anyCircuitOpen: boolean };
    };

    expect(payload.onboarding.calls).toBe(2);
    expect(payload.onboarding.fallbackRate).toBeGreaterThan(0);
    expect(payload.onboarding.byMode.fast).toBeTruthy();
    expect(payload.openai.calls).toBe(1);
    expect(payload.openai.errorRate).toBe(0);
    expect(payload.budget.clientCount).toBeGreaterThanOrEqual(0);
    expect(typeof payload.budget.anyCircuitOpen).toBe("boolean");
    expect(adminAuditService.recordAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "admin.ops_llm_runtime_health_view",
      }),
    );
  });

  it("returns onboarding activation ops snapshot from client mutations", async () => {
    const { controller, adminAuditService, prisma } = createController({
      prisma: {
        clientMutation: {
          findMany: vi.fn().mockResolvedValue([
            {
              status: "completed",
              createdAt: new Date("2026-03-23T12:00:00.000Z"),
              updatedAt: new Date("2026-03-23T12:00:04.000Z"),
            },
            {
              status: "failed",
              createdAt: new Date("2026-03-23T12:01:00.000Z"),
              updatedAt: new Date("2026-03-23T12:01:03.000Z"),
            },
            {
              status: "processing",
              createdAt: new Date("2026-03-23T12:02:00.000Z"),
              updatedAt: new Date("2026-03-23T12:02:00.000Z"),
            },
          ]),
        },
      },
    });

    const result = await controller.onboardingActivationSnapshot(
      ADMIN_USER_ID,
      "support",
      "24",
    );
    const payload = result.data as {
      counters: {
        started: number;
        succeeded: number;
        failed: number;
        processing: number;
      };
      metrics: {
        successRate: number | null;
        failureRate: number | null;
        processingRate: number | null;
      };
    };

    expect(prisma.clientMutation.findMany).toHaveBeenCalled();
    expect(payload.counters).toEqual({
      started: 3,
      succeeded: 1,
      failed: 1,
      processing: 1,
    });
    expect(payload.metrics.successRate).toBeCloseTo(1 / 3);
    expect(payload.metrics.failureRate).toBeCloseTo(1 / 3);
    expect(payload.metrics.processingRate).toBeCloseTo(1 / 3);
    expect(adminAuditService.recordAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "admin.ops_onboarding_activation_view",
      }),
    );
  });

  it("reuses cached ops metric counts when available", async () => {
    resetOpsRuntimeMetrics();

    const appCacheService = {
      getJson: vi.fn().mockResolvedValue({
        dbLatencyMs: 12,
        totalUsers: 10,
        reports24h: 1,
        moderationFlags24h: 2,
        blockedProfiles: 1,
        pushSent24h: 8,
        pushRead24h: 3,
      }),
      setJson: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
    };
    const prisma = {
      user: { count: vi.fn() },
      userReport: { count: vi.fn() },
      moderationFlag: { count: vi.fn() },
      userProfile: { count: vi.fn() },
      notification: { count: vi.fn() },
    };
    const { controller } = createController({
      appCacheService,
      prisma,
    });

    const result = await controller.opsMetrics(ADMIN_USER_ID, "support");
    const payload = result.data as {
      dbLatency: { pingMs: number | null };
      moderationRates: {
        reports24h: number;
        moderationFlags24h: number;
        moderationDecisionReviews24h: number;
      };
    };

    expect(payload.dbLatency.pingMs).toBe(12);
    expect(payload.moderationRates.reports24h).toBe(1);
    expect(payload.moderationRates.moderationFlags24h).toBe(2);
    expect(payload.moderationRates.moderationDecisionReviews24h).toBe(0);
    expect(prisma.user.count).not.toHaveBeenCalled();
    expect(appCacheService.setJson).not.toHaveBeenCalled();
  });

  it("returns triggered ops alerts for backlog/error conditions", async () => {
    resetOpsRuntimeMetrics();
    recordWebsocketConnectionOpened();
    recordWebsocketError("invalid_socket_payload");
    for (let index = 0; index < 25; index += 1) {
      recordOpenAIMetric({
        operation: "intent_parsing",
        latencyMs: 120,
        ok: index % 2 === 0,
      });
    }
    for (let index = 0; index < 12; index += 1) {
      recordOnboardingInferenceMetric({
        mode: "rich",
        model: "gpt-oss:20b",
        durationMs: 7_000,
        unavailable: false,
        fallback: index % 2 === 0,
      });
    }
    for (let index = 0; index < 12; index += 1) {
      recordOnboardingInferenceMetric({
        mode: "fast",
        model: "gpt-oss:20b",
        durationMs: 4_500,
        unavailable: true,
        fallback: false,
      });
    }

    const queue = {
      getJobCounts: vi.fn().mockResolvedValue({
        waiting: 300,
        active: 0,
        delayed: 0,
        paused: 0,
        prioritized: 0,
        "waiting-children": 0,
      }),
      isPaused: vi.fn().mockResolvedValue(false),
    };
    const moduleRef = {
      get: vi.fn().mockReturnValue(queue),
    };
    const { controller, adminAuditService } = createController({
      databaseLatencyService: {
        measureLatencyMs: vi.fn().mockResolvedValue(700),
      },
      moduleRef,
      prisma: {
        auditLog: { count: vi.fn().mockResolvedValue(2) },
        moderationFlag: { count: vi.fn().mockResolvedValue(180) },
        clientMutation: {
          findMany: vi.fn().mockResolvedValue([
            ...Array.from({ length: 6 }, () => ({
              status: "failed",
              createdAt: new Date("2026-03-23T12:00:00.000Z"),
              updatedAt: new Date("2026-03-23T12:00:04.000Z"),
            })),
            ...Array.from({ length: 3 }, () => ({
              status: "processing",
              createdAt: new Date("2026-03-23T12:00:00.000Z"),
              updatedAt: new Date("2026-03-23T12:00:00.000Z"),
            })),
            ...Array.from({ length: 3 }, () => ({
              status: "completed",
              createdAt: new Date("2026-03-23T12:00:00.000Z"),
              updatedAt: new Date("2026-03-23T12:00:12.000Z"),
            })),
          ]),
        },
      },
    });

    const result = await controller.opsAlerts(ADMIN_USER_ID, "support");
    const payload = result.data as {
      alerts: Array<{ key: string }>;
      summary: { status: string };
    };

    expect(payload.summary.status).toBe("degraded");
    expect(payload.alerts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "queue_stalled" }),
        expect.objectContaining({ key: "queue_backlog_high" }),
        expect.objectContaining({ key: "openai_error_spike" }),
        expect.objectContaining({ key: "moderation_backlog_high" }),
        expect.objectContaining({ key: "onboarding_fallback_spike" }),
        expect.objectContaining({ key: "onboarding_unavailable_spike" }),
        expect.objectContaining({ key: "onboarding_fast_latency_high" }),
        expect.objectContaining({ key: "onboarding_rich_latency_high" }),
        expect.objectContaining({ key: "onboarding_activation_failure_high" }),
        expect.objectContaining({
          key: "onboarding_activation_processing_high",
        }),
        expect.objectContaining({
          key: "onboarding_activation_latency_high",
        }),
      ]),
    );
    expect(adminAuditService.recordAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "admin.ops_alerts_view",
      }),
    );
  });

  it("returns ops alerts with schema drift warnings instead of throwing", async () => {
    const schemaDriftError = Object.assign(new Error("missing table"), {
      code: "P2021",
    });
    const { controller } = createController({
      prisma: {
        auditLog: { count: vi.fn().mockResolvedValue(0) },
        moderationFlag: { count: vi.fn().mockResolvedValue(0) },
        clientMutation: {
          findMany: vi.fn().mockRejectedValue(schemaDriftError),
        },
      },
    });

    const result = await controller.opsAlerts(ADMIN_USER_ID, "support");
    const payload = result.data as {
      degradedReadWarnings: string[];
    };

    expect(payload.degradedReadWarnings).toContain(
      "ops_alerts.onboarding_activation_rows",
    );
  });

  it("returns agentic eval snapshot for support role", async () => {
    const { controller, adminAuditService, agenticEvalsService } =
      createController({
        agenticEvalsService: {
          runSnapshot: vi.fn().mockResolvedValue({
            generatedAt: "2026-03-20T12:00:00.000Z",
            summary: {
              total: 5,
              passed: 5,
              failed: 0,
              passRate: 1,
              score: 1,
              status: "healthy",
              regressionCount: 0,
            },
            traceGrade: {
              grade: "A",
              status: "healthy",
              score: 0.95,
            },
            regressions: [],
            scenarios: [
              {
                id: "planning_bounds",
                title: "Plan bounds",
                passed: true,
                score: 1,
                details: "ok",
              },
            ],
          }),
        },
      });

    const result = await controller.opsAgenticEvals(ADMIN_USER_ID, "support");
    const payload = result.data as {
      summary: { total: number; passRate: number };
      scenarios: Array<{ id: string }>;
    };

    expect(agenticEvalsService.runSnapshot).toHaveBeenCalledTimes(1);
    expect(payload.summary.total).toBe(5);
    expect(payload.summary.passRate).toBe(1);
    expect(payload.scenarios[0]?.id).toBe("planning_bounds");
    expect(adminAuditService.recordAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "admin.ops_agentic_evals_view",
        metadata: expect.objectContaining({
          traceGradeStatus: "healthy",
          regressionCount: 0,
        }),
      }),
    );
  });

  it("ingests and lists verification runs for support role", async () => {
    let cachedRuns: unknown[] = [];
    const appCacheService = {
      getJson: vi.fn().mockImplementation(async () => cachedRuns),
      setJson: vi
        .fn()
        .mockImplementation(async (_key: string, value: unknown) => {
          cachedRuns = Array.isArray(value) ? value : [];
        }),
      delete: vi.fn().mockResolvedValue(undefined),
    };
    const { controller, adminAuditService } = createController({
      appCacheService,
    });

    const ingest = (await controller.ingestVerificationRun(
      {
        runId: "agent-suite-2026-03-26T22-00-00-000Z",
        lane: "verification",
        layer: "full",
        status: "passed",
        canaryVerdict: "healthy",
        summary: {
          checks: 12,
        },
      },
      ADMIN_USER_ID,
      "support",
    )) as any;

    expect(ingest.data.stored.runId).toBe(
      "agent-suite-2026-03-26T22-00-00-000Z",
    );
    expect(appCacheService.setJson).toHaveBeenCalledTimes(1);

    const listed = (await controller.opsVerificationRuns(
      ADMIN_USER_ID,
      "support",
      "20",
      "verification",
      "passed",
    )) as any;

    expect(listed.data.summary.totalRuns).toBe(1);
    expect(listed.data.summary.byStatus.passed).toBe(1);
    expect(listed.data.summary.byLane.verification).toBe(1);
    expect(listed.data.runs[0]?.runId).toBe(
      "agent-suite-2026-03-26T22-00-00-000Z",
    );
    expect(adminAuditService.recordAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "admin.ops_verification_runs_view",
      }),
    );
  });

  it("returns agent reliability snapshot with canary verdict and verification context", async () => {
    const appCacheService = {
      getJson: vi.fn().mockResolvedValue([
        {
          runId: "agent-suite-2026-03-26T23-00-00-000Z",
          lane: "verification",
          layer: "full",
          status: "failed",
          generatedAt: "2026-03-26T23:00:00.000Z",
          ingestedAt: "2026-03-26T23:00:10.000Z",
          canaryVerdict: "critical",
          summary: { reason: "benchmark_threshold_breach" },
          artifact: null,
        },
      ]),
      setJson: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
    };
    const { controller, adminAuditService, workflowRuntimeService } =
      createController({
        appCacheService,
        workflowRuntimeService: {
          listRecentRuns: vi.fn().mockResolvedValue([
            {
              workflowRunId: "social:intent:intent-critical",
              traceId: "trace-critical",
              domain: "social",
              entityType: "intent",
              entityId: "intent-critical",
              userId: ADMIN_USER_ID,
              threadId: null,
              startedAt: "2026-03-24T00:10:00.000Z",
              lastActivityAt: "2026-03-24T00:10:05.000Z",
              summary: "Critical run.",
              stages: [
                {
                  stage: "fanout",
                  status: "failed",
                  at: "2026-03-24T00:10:03.000Z",
                  summary: "Fanout failed.",
                },
              ],
              replayability: "partial",
              integrity: {
                sideEffectCount: 0,
                dedupedSideEffectCount: 0,
                reusedRelations: [],
              },
              sideEffects: [],
            },
          ]),
          getRunDetails: vi.fn().mockResolvedValue(null),
        },
        agenticEvalsService: {
          runSnapshot: vi.fn().mockResolvedValue({
            generatedAt: "2026-03-26T23:01:00.000Z",
            summary: {
              total: 10,
              passed: 8,
              failed: 2,
              passRate: 0.8,
              score: 0.82,
              status: "watch",
              regressionCount: 1,
            },
            traceGrade: {
              grade: "B",
              status: "watch",
              score: 0.82,
            },
            regressions: [
              {
                key: "dimension_correctness_degraded",
                status: "triggered",
                severity: "warning",
                value: 0.72,
                threshold: 0.75,
              },
            ],
            scenarios: [],
          }),
        },
      });

    const result = (await controller.opsAgentReliability(
      ADMIN_USER_ID,
      "support",
      "25",
      "10",
    )) as any;

    expect(workflowRuntimeService.listRecentRuns).toHaveBeenCalledWith(25);
    expect(result.data.workflow.totalRuns).toBe(1);
    expect(result.data.workflow.topFailureStages[0]).toEqual({
      stage: "fanout",
      status: "failed",
      count: 1,
    });
    expect(result.data.eval.status).toBe("watch");
    expect(result.data.verification.latest?.status).toBe("failed");
    expect(result.data.canary.verdict).toBe("critical");
    expect(adminAuditService.recordAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "admin.ops_agent_reliability_view",
      }),
    );
  });

  it("returns agent outcome telemetry snapshot for support role", async () => {
    const { controller, adminAuditService, analyticsService } =
      createController({
        analyticsService: {
          getAgentOutcomeMetrics: vi.fn().mockResolvedValue({
            window: {
              days: 14,
              start: "2026-03-08T00:00:00.000Z",
              end: "2026-03-22T00:00:00.000Z",
              followupEngagementHours: 24,
            },
            summary: {
              totalActions: 9,
              executedActions: 7,
              deniedActions: 1,
              failedActions: 1,
            },
            toolAttempts: [
              {
                tool: "intro.send_request",
                attempted: 3,
                executed: 3,
                denied: 0,
                failed: 0,
              },
            ],
            introRequestAcceptance: {
              attempted: 3,
              accepted: 2,
              pending: 1,
              rejected: 0,
              cancelled: 0,
              expired: 0,
              settled: 2,
              acceptanceRate: 0.6667,
              settledRate: 0.6667,
            },
            circleJoinConversion: {
              attempted: 2,
              executed: 2,
              converted: 1,
              failed: 0,
              conversionRate: 0.5,
            },
            followupUsefulness: {
              scheduled: 2,
              completedRuns: 1,
              skippedRuns: 0,
              failedRuns: 0,
              engagedRuns: 1,
              completionRate: 0.5,
              usefulnessRate: 1,
              engagementWindowHours: 24,
            },
          }),
        },
      });

    const result = await controller.opsAgentOutcomes(
      ADMIN_USER_ID,
      "support",
      "14",
    );
    const payload = result.data as {
      summary: { totalActions: number };
      introRequestAcceptance: { accepted: number };
      circleJoinConversion: { conversionRate: number | null };
      followupUsefulness: { usefulnessRate: number | null };
    };

    expect(analyticsService.getAgentOutcomeMetrics).toHaveBeenCalledWith({
      days: 14,
    });
    expect(payload.summary.totalActions).toBe(9);
    expect(payload.introRequestAcceptance.accepted).toBe(2);
    expect(payload.circleJoinConversion.conversionRate).toBe(0.5);
    expect(payload.followupUsefulness.usefulnessRate).toBe(1);
    expect(adminAuditService.recordAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "admin.ops_agent_outcomes_view",
      }),
    );
  });

  it("returns security posture snapshot for support role", async () => {
    const { controller, adminAuditService } = createController();

    const result = await controller.securityPosture(ADMIN_USER_ID, "support");
    const payload = result.data as {
      checks: Record<string, boolean>;
      violations: string[];
    };

    expect(payload.checks).toBeDefined();
    expect(Array.isArray(payload.violations)).toBe(true);
    expect(adminAuditService.recordAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "admin.security_posture_view",
      }),
    );
  });
});
