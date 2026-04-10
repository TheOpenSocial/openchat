import { beforeEach, describe, expect, it, vi } from "vitest";
import { AdminPlaygroundController } from "../src/admin/admin-playground.controller.js";

const ADMIN_USER_ID = "11111111-1111-4111-8111-111111111111";

function createController(overrides: Partial<Record<string, any>> = {}) {
  const service = overrides.service ?? {
    isPlaygroundEnabled: vi.fn().mockReturnValue(true),
    isPlaygroundMutationsEnabled: vi.fn().mockReturnValue(true),
    isActorMutationAllowed: vi.fn().mockReturnValue(true),
    getState: vi.fn().mockResolvedValue({
      enabled: true,
      mutationsEnabled: true,
      mutationAllowedForActor: true,
      hasProbeToken: true,
      baseUrl: "http://localhost:3000",
      requiredEnvStatus: {},
    }),
    bootstrap: vi.fn().mockResolvedValue({
      runId: "playground-bootstrap-1",
      traceId: "trace-1",
      workflowRunId: "admin:playground:bootstrap:1",
      env: {
        SMOKE_BASE_URL: "http://localhost:3000",
        SMOKE_ACCESS_TOKEN: "token",
        SMOKE_USER_ID: "77777777-7777-4777-8777-777777777777",
        SMOKE_AGENT_THREAD_ID: "99999999-9999-4999-8999-999999999999",
        SMOKE_ADMIN_USER_ID: "88888888-8888-4888-8888-888888888888",
        AGENTIC_BENCH_ACCESS_TOKEN: "token",
        AGENTIC_BENCH_USER_ID: "77777777-7777-4777-8777-777777777777",
        AGENTIC_BENCH_THREAD_ID: "99999999-9999-4999-8999-999999999999",
        AGENTIC_VERIFICATION_LANE_ID: "verification-lane",
        ONBOARDING_PROBE_TOKEN: "probe-token",
      },
      entities: {
        smokeUserId: "77777777-7777-4777-8777-777777777777",
        smokeAdminUserId: "88888888-8888-4888-8888-888888888888",
        smokeAgentThreadId: "99999999-9999-4999-8999-999999999999",
      },
      notes: [],
    }),
    runScenario: vi.fn().mockResolvedValue({
      runId: "playground-scenario-1",
      traceId: "trace-1",
      workflowRunId: "admin:playground:scenario:1",
      scenarioId: "social_direct_match_v1",
      status: "passed",
      latencyMs: 100,
      stdoutPreview: null,
      stderrPreview: null,
    }),
    runSuite: vi.fn().mockResolvedValue({
      runId: "playground-suite-1",
      traceId: "trace-1",
      workflowRunId: "admin:playground:suite:1",
      layer: "verification",
      status: "passed",
      latencyMs: 100,
      artifactPath: "/tmp/artifact.json",
      stdoutPreview: null,
      stderrPreview: null,
    }),
    rotateProbeToken: vi.fn().mockResolvedValue({
      token: "rotated-token",
      generatedAt: "2026-03-26T00:00:00.000Z",
      notes: [],
    }),
    createSandboxWorld: vi.fn().mockResolvedValue({
      worldId: "design-sandbox-v1",
      fixtureLabel: "Design Sandbox v1",
      status: "ready",
      createdAt: "2026-03-26T00:00:00.000Z",
      updatedAt: "2026-03-26T00:00:00.000Z",
      joinedAt: null,
      focalUserId: "77777777-7777-4777-8777-777777777777",
      actorCount: 7,
      directChatCount: 2,
      groupChatCount: 1,
      notificationCount: 3,
      syntheticActors: [],
      notes: [],
      seededEntityIds: {
        syntheticUserIds: [],
        connectionIds: [],
        chatIds: [],
        chatMessageIds: [],
        notificationIds: [],
        intentIds: [],
        intentRequestIds: [],
        agentMessageIds: [],
      },
    }),
    getSandboxWorld: vi.fn().mockResolvedValue({
      worldId: "design-sandbox-v1",
      fixtureLabel: "Design Sandbox v1",
      status: "ready",
      createdAt: "2026-03-26T00:00:00.000Z",
      updatedAt: "2026-03-26T00:00:00.000Z",
      joinedAt: null,
      focalUserId: "77777777-7777-4777-8777-777777777777",
      actorCount: 7,
      directChatCount: 2,
      groupChatCount: 1,
      notificationCount: 3,
      syntheticActors: [],
      notes: [],
      seededEntityIds: {
        syntheticUserIds: [],
        connectionIds: [],
        chatIds: [],
        chatMessageIds: [],
        notificationIds: [],
        intentIds: [],
        intentRequestIds: [],
        agentMessageIds: [],
      },
    }),
    inspectSandboxWorld: vi.fn().mockResolvedValue({
      world: {
        worldId: "design-sandbox-v1",
        fixtureLabel: "Design Sandbox v1",
        status: "joined",
      },
      experience: {
        home: {
          status: {
            title: "A match is moving",
          },
        },
        activity: {
          counts: {
            pendingRequests: 1,
          },
        },
      },
    }),
    resetSandboxWorld: vi.fn().mockResolvedValue({
      worldId: "design-sandbox-v1",
      status: "reset",
      resetAt: "2026-03-26T00:00:00.000Z",
    }),
    tickSandboxWorld: vi.fn().mockResolvedValue({
      worldId: "design-sandbox-v1",
      fixtureLabel: "Design Sandbox v1",
      status: "joined",
      createdAt: "2026-03-26T00:00:00.000Z",
      updatedAt: "2026-03-26T00:00:05.000Z",
      joinedAt: "2026-03-26T00:00:00.000Z",
      focalUserId: "77777777-7777-4777-8777-777777777777",
      actorCount: 7,
      directChatCount: 2,
      groupChatCount: 1,
      notificationCount: 4,
      syntheticActors: [],
      notes: [],
      seededEntityIds: {
        syntheticUserIds: [],
        connectionIds: [],
        chatIds: [],
        chatMessageIds: [],
        notificationIds: [],
        intentIds: [],
        intentRequestIds: [],
        agentMessageIds: [],
      },
    }),
    joinSandboxWorld: vi.fn().mockResolvedValue({
      worldId: "design-sandbox-v1",
      fixtureLabel: "Design Sandbox v1",
      status: "joined",
      createdAt: "2026-03-26T00:00:00.000Z",
      updatedAt: "2026-03-26T00:00:00.000Z",
      joinedAt: "2026-03-26T00:00:00.000Z",
      focalUserId: "77777777-7777-4777-8777-777777777777",
      actorCount: 7,
      directChatCount: 2,
      groupChatCount: 1,
      notificationCount: 3,
      syntheticActors: [],
      notes: [],
      seededEntityIds: {
        syntheticUserIds: [],
        connectionIds: [],
        chatIds: [],
        chatMessageIds: [],
        notificationIds: [],
        intentIds: [],
        intentRequestIds: [],
        agentMessageIds: [],
      },
    }),
    setSandboxWorldScenario: vi.fn().mockResolvedValue({
      worldId: "design-sandbox-v1",
      fixtureLabel: "Design Sandbox v1",
      status: "joined",
      createdAt: "2026-03-26T00:00:00.000Z",
      updatedAt: "2026-03-26T00:00:10.000Z",
      joinedAt: "2026-03-26T00:00:00.000Z",
      focalUserId: "77777777-7777-4777-8777-777777777777",
      actorCount: 7,
      directChatCount: 2,
      groupChatCount: 1,
      notificationCount: 4,
      syntheticActors: [],
      notes: [],
      seededEntityIds: {
        syntheticUserIds: [],
        connectionIds: [],
        chatIds: [],
        chatMessageIds: [],
        notificationIds: [],
        intentIds: [],
        intentRequestIds: [],
        agentMessageIds: [],
      },
    }),
    listArtifacts: vi.fn().mockResolvedValue({
      generatedAt: "2026-03-26T00:00:00.000Z",
      artifacts: [],
    }),
  };

  return {
    service,
    controller: new AdminPlaygroundController(service),
  };
}

describe("AdminPlaygroundController", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("allows support role to read playground state", async () => {
    const { controller, service } = createController();
    const response = (await controller.state(ADMIN_USER_ID, "support")) as any;

    expect(response.data.enabled).toBe(true);
    expect(service.getState).toHaveBeenCalledWith({
      adminUserId: ADMIN_USER_ID,
      role: "support",
    });
  });

  it("rejects when playground is disabled", async () => {
    const { controller } = createController({
      service: {
        isPlaygroundEnabled: vi.fn().mockReturnValue(false),
      },
    });

    await expect(controller.state(ADMIN_USER_ID, "admin")).rejects.toThrow(
      "admin playground is disabled",
    );
  });

  it("enforces admin-only mutation routes", async () => {
    const { controller } = createController();
    await expect(
      controller.bootstrap({}, ADMIN_USER_ID, "support"),
    ).rejects.toThrow("not permitted");
  });

  it("blocks mutation routes when mutation flag is disabled", async () => {
    const { controller } = createController({
      service: {
        isPlaygroundEnabled: vi.fn().mockReturnValue(true),
        isPlaygroundMutationsEnabled: vi.fn().mockReturnValue(false),
      },
    });

    await expect(
      controller.runSuite({ layer: "verification" }, ADMIN_USER_ID, "admin"),
    ).rejects.toThrow("admin playground mutations are disabled");
  });

  it("blocks mutation routes for disallowed admin user", async () => {
    const { controller } = createController({
      service: {
        isPlaygroundEnabled: vi.fn().mockReturnValue(true),
        isPlaygroundMutationsEnabled: vi.fn().mockReturnValue(true),
        isActorMutationAllowed: vi.fn().mockReturnValue(false),
      },
    });

    await expect(
      controller.runScenario(
        { scenarioId: "social_direct_match_v1" },
        ADMIN_USER_ID,
        "admin",
      ),
    ).rejects.toThrow("admin user is not allowlisted for playground mutations");
  });

  it("runs verification suite and returns machine-readable response", async () => {
    const { controller, service } = createController();
    const response = (await controller.runSuite(
      { layer: "verification" },
      ADMIN_USER_ID,
      "admin",
    )) as any;

    expect(service.runSuite).toHaveBeenCalledWith(
      { layer: "verification" },
      {
        adminUserId: ADMIN_USER_ID,
        role: "admin",
      },
    );
    expect(response.data.layer).toBe("verification");
    expect(response.data.status).toBe("passed");
  });

  it("creates and reads a sandbox world", async () => {
    const { controller, service } = createController();
    const created = (await controller.createSandboxWorld(
      {},
      ADMIN_USER_ID,
      "admin",
    )) as any;
    const fetched = (await controller.getSandboxWorld(
      "design-sandbox-v1",
      ADMIN_USER_ID,
      "support",
    )) as any;

    expect(service.createSandboxWorld).toHaveBeenCalled();
    expect(service.getSandboxWorld).toHaveBeenCalledWith("design-sandbox-v1", {
      adminUserId: ADMIN_USER_ID,
      role: "support",
    });
    expect(created.data.worldId).toBe("design-sandbox-v1");
    expect(fetched.data.status).toBe("ready");
  });

  it("inspects a sandbox world daily-loop state", async () => {
    const { controller, service } = createController();
    const response = (await controller.inspectSandboxWorld(
      "design-sandbox-v1",
      ADMIN_USER_ID,
      "support",
    )) as any;

    expect(service.inspectSandboxWorld).toHaveBeenCalledWith(
      "design-sandbox-v1",
      {
        adminUserId: ADMIN_USER_ID,
        role: "support",
      },
    );
    expect(response.data.experience.home.status.title).toBe(
      "A match is moving",
    );
  });

  it("joins and ticks a sandbox world", async () => {
    const { controller, service } = createController();
    const focalUserId = "77777777-7777-4777-8777-777777777777";

    const joined = (await controller.joinSandboxWorld(
      "design-sandbox-v1",
      { focalUserId },
      ADMIN_USER_ID,
      "admin",
    )) as any;
    const ticked = (await controller.tickSandboxWorld(
      "design-sandbox-v1",
      { note: "Synthetic follow-up" },
      ADMIN_USER_ID,
      "admin",
    )) as any;

    expect(service.joinSandboxWorld).toHaveBeenCalledWith(
      "design-sandbox-v1",
      focalUserId,
      { adminUserId: ADMIN_USER_ID, role: "admin" },
    );
    expect(service.tickSandboxWorld).toHaveBeenCalled();
    expect(joined.data.status).toBe("joined");
    expect(ticked.data.notificationCount).toBe(4);
  });

  it("applies a sandbox world scenario", async () => {
    const { controller, service } = createController();

    const response = (await controller.setSandboxWorldScenario(
      "design-sandbox-v1",
      { scenario: "stalled_search" },
      ADMIN_USER_ID,
      "admin",
    )) as any;

    expect(service.setSandboxWorldScenario).toHaveBeenCalledWith(
      "design-sandbox-v1",
      "stalled_search",
      { adminUserId: ADMIN_USER_ID, role: "admin" },
    );
    expect(response.data.status).toBe("joined");
  });
});
