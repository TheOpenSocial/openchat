import { describe, expect, it, vi } from "vitest";
import { AdminController } from "../src/admin/admin.controller.js";
import {
  recordHttpRequestMetric,
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
    userSession: { updateMany: vi.fn() },
    userProfile: {
      upsert: vi.fn(),
      count: vi.fn().mockResolvedValue(0),
    },
    notification: {
      count: vi.fn().mockResolvedValue(0),
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

  return {
    deadLetterService,
    outboxRelayService,
    adminAuditService,
    appCacheService,
    databaseLatencyService,
    prisma,
    intentsService,
    moderationService,
    personalizationService,
    notificationsService,
    chatsService,
    agenticEvalsService,
    moduleRef,
    controller: new AdminController(
      deadLetterService,
      outboxRelayService,
      adminAuditService,
      appCacheService,
      databaseLatencyService as DatabaseLatencyService,
      prisma,
      intentsService,
      moderationService,
      personalizationService,
      notificationsService,
      chatsService,
      moduleRef,
      agenticEvalsService,
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

    const { controller, adminAuditService } = createController({
      prisma: {
        user: { count: vi.fn().mockResolvedValue(50) },
        userReport: { count: vi.fn().mockResolvedValue(2) },
        moderationFlag: { count: vi.fn().mockResolvedValue(1) },
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
      moderationRates: { reports24h: number };
      pushDeliverySuccess: { pushSent24h: number; pushRead24h: number };
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
    expect(payload.pushDeliverySuccess.pushSent24h).toBe(10);
    expect(payload.pushDeliverySuccess.pushRead24h).toBe(4);
    expect(adminAuditService.recordAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "admin.ops_metrics_view",
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
      moderationRates: { reports24h: number; moderationFlags24h: number };
    };

    expect(payload.dbLatency.pingMs).toBe(12);
    expect(payload.moderationRates.reports24h).toBe(1);
    expect(payload.moderationRates.moderationFlags24h).toBe(2);
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
      ]),
    );
    expect(adminAuditService.recordAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "admin.ops_alerts_view",
      }),
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
            },
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
