import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AdminPlaygroundService } from "../src/admin/admin-playground.service.js";

const ADMIN_USER_ID = "11111111-1111-4111-8111-111111111111";
const ACTOR = { adminUserId: ADMIN_USER_ID, role: "admin" as const };

describe("AdminPlaygroundService", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.ONBOARDING_PROBE_TOKEN;
  });

  function createService(overrides: Partial<Record<string, any>> = {}) {
    const cacheStore = new Map<string, unknown>();
    const prisma = overrides.prisma ?? {
      user: {
        upsert: vi.fn().mockResolvedValue({}),
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      userProfile: {
        upsert: vi.fn().mockResolvedValue({}),
        update: vi.fn().mockResolvedValue({}),
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      userInterest: {
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
        createMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      userTopic: {
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
        createMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      userAvailabilityWindow: {
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
        createMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      agentThread: {
        findUnique: vi
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValue({ id: "thread" }),
        update: vi.fn().mockResolvedValue({ id: "thread" }),
        create: vi.fn().mockResolvedValue({ id: "thread" }),
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      agentMessage: {
        upsert: vi.fn().mockResolvedValue({ id: "agent-message-1" }),
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      connection: {
        upsert: vi.fn().mockResolvedValue({}),
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      connectionParticipant: {
        upsert: vi.fn().mockResolvedValue({}),
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({}),
        update: vi.fn().mockResolvedValue({}),
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      chat: {
        findUnique: vi.fn().mockResolvedValue(null),
        findFirst: vi.fn().mockResolvedValue({ id: "chat-1" }),
        create: vi.fn().mockResolvedValue({ id: "chat-1" }),
        upsert: vi.fn().mockResolvedValue({ id: "chat-1" }),
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      chatMessage: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: "chat-message-1" }),
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      intent: {
        upsert: vi.fn().mockResolvedValue({ id: "intent-1" }),
        update: vi.fn().mockResolvedValue({ id: "intent-1" }),
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      intentRequest: {
        findFirst: vi.fn().mockResolvedValue(null),
        upsert: vi.fn().mockResolvedValue({ id: "request-1" }),
        updateMany: vi.fn().mockResolvedValue({ count: 2 }),
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      notification: {
        create: vi.fn().mockResolvedValue({ id: "notification-1" }),
        upsert: vi.fn().mockResolvedValue({ id: "notification-service-1" }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        count: vi.fn().mockResolvedValue(3),
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
    };
    const authService = overrides.authService ?? {
      issueSessionTokens: vi.fn().mockResolvedValue({
        accessToken: "playground-access-token",
        refreshToken: "playground-refresh-token",
        expiresInSec: 3600,
      }),
    };
    const appCacheService = overrides.appCacheService ?? {
      getJson: vi.fn().mockImplementation(async (key: string) => {
        return cacheStore.get(key) ?? null;
      }),
      setJson: vi
        .fn()
        .mockImplementation(async (key: string, value: unknown) => {
          cacheStore.set(key, value);
        }),
    };
    const adminAuditService = overrides.adminAuditService ?? {
      recordAction: vi.fn().mockResolvedValue({}),
    };
    const chatsService = overrides.chatsService ?? {
      createMessage: vi
        .fn()
        .mockResolvedValue({ id: "chat-message-service-1" }),
    };
    const notificationsService = overrides.notificationsService ?? {
      createInAppNotification: vi
        .fn()
        .mockResolvedValue({ id: "notification-service-1" }),
    };
    const experienceService = overrides.experienceService ?? {
      getHomeSummary: vi.fn().mockResolvedValue({
        status: { title: "A match is moving" },
      }),
      getActivitySummary: vi.fn().mockResolvedValue({
        counts: { pendingRequests: 1 },
      }),
    };

    const service = new AdminPlaygroundService(
      prisma,
      authService,
      appCacheService,
      adminAuditService,
      chatsService,
      notificationsService,
      experienceService,
    );

    return {
      service,
      prisma,
      authService,
      appCacheService,
      adminAuditService,
      chatsService,
      notificationsService,
      experienceService,
      cacheStore,
    };
  }

  it("reuses stable smoke entities across bootstrap runs", async () => {
    process.env.ONBOARDING_PROBE_TOKEN = "existing-probe-token";
    const { service, prisma, authService } = createService();

    const first = await service.bootstrap({}, ACTOR);
    const second = await service.bootstrap({}, ACTOR);

    expect(first.entities).toEqual(second.entities);
    expect(first.env.SMOKE_USER_ID).toBe(second.env.SMOKE_USER_ID);
    expect(first.env.SMOKE_AGENT_THREAD_ID).toBe(
      second.env.SMOKE_AGENT_THREAD_ID,
    );
    expect(authService.issueSessionTokens).toHaveBeenCalledTimes(2);
    expect(prisma.agentThread.create).toHaveBeenCalledTimes(1);
  });

  it("stores verification-lane run records when suite verification succeeds", async () => {
    const { service, appCacheService, cacheStore } = createService();
    const artifactDir = mkdtempSync(
      path.join(tmpdir(), "playground-artifact-"),
    );
    const artifactPath = path.join(artifactDir, "suite-artifact.json");
    writeFileSync(
      artifactPath,
      JSON.stringify({ runId: "artifact-run", passed: true }),
      "utf8",
    );
    vi.spyOn(service as any, "executeCommand").mockReturnValue({
      status: 0,
      stdout: `Artifact written to ${artifactPath}\n`,
      stderr: "",
    });

    const result = await service.runSuite({ layer: "verification" }, ACTOR);

    expect(result.status).toBe("passed");
    expect(appCacheService.setJson).toHaveBeenCalled();
    const cached = cacheStore.get("ops:agent-verification-runs:v1") as Array<
      Record<string, unknown>
    >;
    expect(Array.isArray(cached)).toBe(true);
    expect(cached[0]).toEqual(
      expect.objectContaining({
        runId: result.runId,
        lane: "verification",
        layer: "full",
        status: "passed",
        canaryVerdict: "healthy",
      }),
    );
  });

  it("marks run-suite failures as critical in verification cache", async () => {
    const { service, cacheStore } = createService();
    vi.spyOn(service as any, "executeCommand").mockReturnValue({
      status: 1,
      stdout: "",
      stderr: "suite failed",
    });

    const result = await service.runSuite({ layer: "full" }, ACTOR);

    expect(result.status).toBe("failed");
    const cached = cacheStore.get("ops:agent-verification-runs:v1") as Array<
      Record<string, unknown>
    >;
    expect(cached[0]).toEqual(
      expect.objectContaining({
        runId: result.runId,
        lane: "suite",
        status: "failed",
        canaryVerdict: "critical",
      }),
    );
  });

  it("creates, joins, and resets the sandbox world", async () => {
    const { service, prisma } = createService();

    const created = await service.createSandboxWorld(
      { worldId: "design-sandbox-v1" },
      ACTOR,
    );
    const joined = await service.joinSandboxWorld(
      "design-sandbox-v1",
      "77777777-7777-4777-8777-777777777777",
      ACTOR,
    );
    const ticked = await service.tickSandboxWorld(
      "design-sandbox-v1",
      { note: "Synthetic follow-up" },
      ACTOR,
    );
    const reset = await service.resetSandboxWorld("design-sandbox-v1", ACTOR);

    expect(created.worldId).toBe("design-sandbox-v1");
    expect(joined.status).toBe("joined");
    expect(ticked.notificationCount).toBeGreaterThanOrEqual(1);
    expect(reset.status).toBe("reset");
    expect(prisma.connection.upsert).toHaveBeenCalled();
    expect(prisma.intent.upsert).toHaveBeenCalled();
    expect(prisma.notification.upsert).toHaveBeenCalled();
  });

  it("applies waiting-replies scenario to a joined sandbox world", async () => {
    const { service, prisma } = createService();

    await service.joinSandboxWorld(
      "design-sandbox-v1",
      "77777777-7777-4777-8777-777777777777",
      ACTOR,
    );
    const updated = await service.setSandboxWorldScenario(
      "design-sandbox-v1",
      "waiting_replies",
      ACTOR,
    );

    expect(updated.worldId).toBe("design-sandbox-v1");
    expect(prisma.intentRequest.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "pending",
          respondedAt: null,
        }),
      }),
    );
    expect(prisma.notification.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          body: "Your search is live and you are waiting on replies.",
        }),
      }),
    );
  });

  it("applies stalled-search scenario to a joined sandbox world", async () => {
    const { service, prisma } = createService();

    await service.joinSandboxWorld(
      "design-sandbox-v1",
      "77777777-7777-4777-8777-777777777777",
      ACTOR,
    );
    const updated = await service.setSandboxWorldScenario(
      "design-sandbox-v1",
      "stalled_search",
      ACTOR,
    );

    expect(updated.worldId).toBe("design-sandbox-v1");
    expect(prisma.intent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "f1111111-1111-4111-8111-111111111111" },
        data: expect.objectContaining({
          rawText:
            "Find a very niche late-night online design systems salon this week.",
          status: "matching",
        }),
      }),
    );
    expect(prisma.intentRequest.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "rejected",
        }),
      }),
    );
  });

  it("inspects the sandbox world experience state for the joined focal user", async () => {
    const { service, experienceService } = createService();

    await service.joinSandboxWorld(
      "design-sandbox-v1",
      "77777777-7777-4777-8777-777777777777",
      ACTOR,
    );
    const inspection = await service.inspectSandboxWorld(
      "design-sandbox-v1",
      ACTOR,
    );

    expect(experienceService.getHomeSummary).toHaveBeenCalledWith(
      "77777777-7777-4777-8777-777777777777",
    );
    expect(experienceService.getActivitySummary).toHaveBeenCalledWith(
      "77777777-7777-4777-8777-777777777777",
    );
    expect(inspection.experience.home.status.title).toBe("A match is moving");
  });
});
