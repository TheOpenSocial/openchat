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
      },
      userProfile: {
        upsert: vi.fn().mockResolvedValue({}),
      },
      agentThread: {
        findUnique: vi
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValue({ id: "thread" }),
        create: vi.fn().mockResolvedValue({ id: "thread" }),
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

    const service = new AdminPlaygroundService(
      prisma,
      authService,
      appCacheService,
      adminAuditService,
    );

    return {
      service,
      prisma,
      authService,
      appCacheService,
      adminAuditService,
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
});
