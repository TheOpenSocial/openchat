import { describe, expect, it, vi } from "vitest";
import { AdminController } from "../src/admin/admin.controller.js";
import { AdminPlaygroundService } from "../src/admin/admin-playground.service.js";
import type { DatabaseLatencyService } from "../src/database/database-latency.service.js";

const ADMIN_USER_ID = "11111111-1111-4111-8111-111111111111";

function createSharedCache() {
  const store = new Map<string, unknown>();
  return {
    getJson: vi.fn().mockImplementation(async (key: string) => {
      return store.get(key) ?? null;
    }),
    setJson: vi.fn().mockImplementation(async (key: string, value: unknown) => {
      store.set(key, value);
    }),
    delete: vi.fn().mockResolvedValue(undefined),
  };
}

describe("Admin Playground -> reliability wiring", () => {
  it("surfaces playground suite verification runs in agent reliability snapshot", async () => {
    const appCacheService = createSharedCache();
    const adminAuditService = {
      recordAction: vi.fn().mockResolvedValue({}),
      listModerationQueue: vi.fn().mockResolvedValue([]),
      listAuditLogs: vi.fn().mockResolvedValue([]),
    };
    const prisma: any = {
      user: {
        upsert: vi.fn().mockResolvedValue({}),
        update: vi.fn(),
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
      },
      userProfile: {
        upsert: vi.fn().mockResolvedValue({}),
        count: vi.fn().mockResolvedValue(0),
      },
      agentThread: {
        findUnique: vi.fn().mockResolvedValue({ id: "thread" }),
        create: vi.fn(),
        findMany: vi.fn().mockResolvedValue([]),
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
      userSession: { updateMany: vi.fn() },
      notification: {
        count: vi.fn().mockResolvedValue(0),
      },
      clientMutation: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    };
    const authService: any = {
      issueSessionTokens: vi.fn().mockResolvedValue({
        accessToken: "smoke-token",
        refreshToken: "refresh-token",
        expiresInSec: 3600,
      }),
    };

    const playgroundService = new AdminPlaygroundService(
      prisma,
      authService,
      appCacheService as any,
      adminAuditService as any,
    );
    vi.spyOn(playgroundService as any, "executeCommand").mockReturnValue({
      status: 0,
      stdout: "",
      stderr: "",
    });
    const suiteResult = await playgroundService.runSuite(
      { layer: "verification" },
      { adminUserId: ADMIN_USER_ID, role: "admin" },
    );

    const controller = new AdminController(
      { listDeadLetters: vi.fn(), replayDeadLetter: vi.fn() } as any,
      { relayPendingEvents: vi.fn() } as any,
      adminAuditService as any,
      appCacheService as any,
      {
        measureLatencyMs: vi.fn().mockResolvedValue(42),
      } as unknown as DatabaseLatencyService,
      prisma,
      { getAgentOutcomeMetrics: vi.fn().mockResolvedValue({}) } as any,
      { retryIntent: vi.fn(), listIntentExplanations: vi.fn() } as any,
      { issueStrike: vi.fn() } as any,
      { getGlobalRules: vi.fn() } as any,
      { createInAppNotification: vi.fn() } as any,
      {
        getChatMetadata: vi.fn(),
        createSystemMessage: vi.fn(),
        listMessagesForSync: vi.fn(),
      } as any,
      { get: vi.fn().mockReturnValue(null) } as any,
      {
        runSnapshot: vi.fn().mockResolvedValue({
          generatedAt: new Date().toISOString(),
          summary: {
            total: 1,
            passed: 1,
            failed: 0,
            passRate: 1,
            score: 1,
            status: "healthy",
            regressionCount: 0,
          },
          traceGrade: { grade: "A", status: "healthy", score: 1 },
          regressions: [],
          scenarios: [],
        }),
      } as any,
      {
        listRecentRuns: vi.fn().mockResolvedValue([]),
        getRunDetails: vi.fn().mockResolvedValue(null),
      } as any,
    );

    const reliability = (await controller.opsAgentReliability(
      ADMIN_USER_ID,
      "support",
    )) as any;

    expect(suiteResult.status).toBe("passed");
    expect(reliability.data.verification.latest?.runId).toBe(suiteResult.runId);
    expect(reliability.data.verification.latest?.lane).toBe("verification");
    expect(reliability.data.canary.verdict).toBe("healthy");
  });
});
