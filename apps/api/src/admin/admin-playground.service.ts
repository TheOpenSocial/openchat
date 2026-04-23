import { Injectable, Logger } from "@nestjs/common";
import { NotificationType } from "@opensocial/types";
import { AuthService } from "../auth/auth.service.js";
import { AppCacheService } from "../common/app-cache.service.js";
import { ChatsService } from "../chats/chats.service.js";
import { PrismaService } from "../database/prisma.service.js";
import { ExperienceService } from "../experience/experience.service.js";
import { NotificationsService } from "../notifications/notifications.service.js";
import { AdminAuditService, type AdminRole } from "./admin-audit.service.js";
import { getSandboxWorldDefinition } from "./admin-sandbox-worlds.js";
import { randomBytes, randomUUID } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  designSandboxWorldV1Fixture,
  normalizeDesignSandboxWorldFixture,
} from "./sandbox-worlds/design-sandbox-v1.fixture.js";
import {
  seedDesignSandboxWorld as seedDesignSandboxWorldFixture,
  type SandboxWorldSeedResult,
} from "./sandbox-worlds/design-sandbox-seeder.js";

type BootstrapInput = {
  rotateProbeToken?: boolean;
  laneId?: string;
  smokeBaseUrl?: string;
  smokeUserId?: string;
};

type RunSuiteInput = {
  layer:
    | "contract"
    | "workflow"
    | "queue"
    | "scenario"
    | "eval"
    | "benchmark"
    | "prod-smoke"
    | "full"
    | "verification";
};

type VerificationRunRecord = {
  runId: string;
  lane: "suite" | "verification" | "prod-smoke";
  layer: string;
  status: "passed" | "failed" | "skipped";
  generatedAt: string;
  ingestedAt: string;
  canaryVerdict: "healthy" | "watch" | "critical";
  summary: Record<string, unknown> | null;
  artifact: Record<string, unknown> | null;
};

type SandboxWorldScenario =
  | "baseline"
  | "waiting_replies"
  | "activity_burst"
  | "stalled_search";

type SandboxWorldSummary = {
  worldId: "design-sandbox-v1";
  fixtureLabel: string;
  status: "ready" | "joined" | "reset";
  createdAt: string;
  updatedAt: string;
  joinedAt: string | null;
  focalUserId: string | null;
  actorCount: number;
  directChatCount: number;
  groupChatCount: number;
  notificationCount: number;
  syntheticActors: Array<{
    userId: string;
    displayName: string;
    role: "focal" | "synthetic";
  }>;
  notes: string[];
};

const USER_ID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class AdminPlaygroundService {
  private readonly logger = new Logger(AdminPlaygroundService.name);
  private readonly verificationRunCacheKey = "ops:agent-verification-runs:v1";
  private readonly verificationRunMaxItems = 200;
  private readonly sandboxWorldCacheKeyPrefix = "admin:sandbox-world";

  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
    private readonly appCacheService: AppCacheService,
    private readonly adminAuditService: AdminAuditService,
    private readonly chatsService?: ChatsService,
    private readonly notificationsService?: NotificationsService,
    private readonly experienceService?: ExperienceService,
  ) {}

  async getState(actor: { adminUserId: string; role: AdminRole }) {
    const requiredEnvStatus = this.getRequiredVerificationEnvStatus();
    const baseUrl = this.resolveBaseUrl();
    const enabled = this.isPlaygroundEnabled();
    const mutationsEnabled = this.isPlaygroundMutationsEnabled();
    const mutationAllowedForActor =
      enabled &&
      mutationsEnabled &&
      actor.role === "admin" &&
      this.isActorMutationAllowed(actor.adminUserId);

    await this.adminAuditService.recordAction({
      adminUserId: actor.adminUserId,
      role: actor.role,
      action: "admin.playground_state_view",
      entityType: "admin_playground",
      metadata: {
        enabled,
        mutationsEnabled,
        mutationAllowedForActor,
      },
    });

    return {
      enabled,
      mutationsEnabled,
      mutationAllowedForActor,
      hasProbeToken: Boolean(process.env.ONBOARDING_PROBE_TOKEN?.trim()),
      baseUrl,
      requiredEnvStatus,
    };
  }

  async bootstrap(
    input: BootstrapInput,
    actor: { adminUserId: string; role: AdminRole },
  ) {
    const runId = `playground-bootstrap-${new Date().toISOString().replace(/[:.]/g, "-")}`;
    const traceId = randomUUID();
    const workflowRunId = `admin:playground:bootstrap:${runId}`;

    const smokeUserId = this.resolveStableUuid(
      input.smokeUserId ?? process.env.PLAYGROUND_SMOKE_USER_ID,
      "77777777-7777-4777-8777-777777777777",
    );
    const smokeAdminUserId = this.resolveStableUuid(
      process.env.PLAYGROUND_SMOKE_ADMIN_USER_ID,
      "88888888-8888-4888-8888-888888888888",
    );
    const smokeThreadId = this.resolveStableUuid(
      process.env.PLAYGROUND_SMOKE_THREAD_ID,
      "99999999-9999-4999-8999-999999999999",
    );
    const laneId =
      input.laneId?.trim() ||
      process.env.AGENTIC_VERIFICATION_LANE_ID?.trim() ||
      `verification-lane-${smokeUserId.slice(0, 8)}`;
    const baseUrl = input.smokeBaseUrl?.trim() || this.resolveBaseUrl();

    await this.ensureUser(smokeUserId, "Playground Smoke User");
    await this.ensureUser(smokeAdminUserId, "Playground Smoke Admin");
    await this.ensureAgentThread(smokeThreadId, smokeUserId);

    const tokens = await this.authService.issueSessionTokens(smokeUserId, {
      deviceName: "Admin Playground",
      deviceId: "admin-playground",
    });

    const rotatedProbeToken = input.rotateProbeToken
      ? this.generateProbeToken()
      : null;
    const effectiveProbeToken =
      rotatedProbeToken ?? process.env.ONBOARDING_PROBE_TOKEN?.trim() ?? "";

    const notes: string[] = [];
    if (!effectiveProbeToken) {
      notes.push(
        "ONBOARDING_PROBE_TOKEN is not configured on runtime env; probe checks will fail until synced.",
      );
    }
    if (rotatedProbeToken) {
      notes.push(
        "A new probe token was generated for secret rotation. Sync it to runtime env and GitHub secrets before verification.",
      );
    }

    const env = {
      SMOKE_BASE_URL: baseUrl,
      SMOKE_ACCESS_TOKEN: tokens.accessToken,
      SMOKE_REFRESH_TOKEN: tokens.refreshToken,
      SMOKE_USER_ID: smokeUserId,
      SMOKE_AGENT_THREAD_ID: smokeThreadId,
      SMOKE_ADMIN_USER_ID: smokeAdminUserId,
      AGENTIC_BENCH_ACCESS_TOKEN: tokens.accessToken,
      AGENTIC_BENCH_USER_ID: smokeUserId,
      AGENTIC_BENCH_THREAD_ID: smokeThreadId,
      AGENTIC_VERIFICATION_LANE_ID: laneId,
      ONBOARDING_PROBE_TOKEN: effectiveProbeToken,
    };

    await this.adminAuditService.recordAction({
      adminUserId: actor.adminUserId,
      role: actor.role,
      action: "admin.playground_bootstrap",
      entityType: "admin_playground",
      entityId: runId,
      metadata: {
        workflowRunId,
        traceId,
        smokeUserId,
        smokeAdminUserId,
        smokeThreadId,
        laneId,
        rotatedProbeToken: Boolean(rotatedProbeToken),
      },
    });

    return {
      runId,
      traceId,
      workflowRunId,
      env,
      entities: {
        smokeUserId,
        smokeAdminUserId,
        smokeAgentThreadId: smokeThreadId,
      },
      notes,
    };
  }

  async seedDesignSandboxWorld(actor: {
    adminUserId: string;
    role: AdminRole;
  }) {
    const fixture = normalizeDesignSandboxWorldFixture(
      designSandboxWorldV1Fixture,
    );
    const result: SandboxWorldSeedResult = await seedDesignSandboxWorldFixture(
      this.prisma,
      actor,
      fixture,
    );

    await this.adminAuditService.recordAction({
      adminUserId: actor.adminUserId,
      role: actor.role,
      action: "admin.playground_seed_design_sandbox_world",
      entityType: "admin_playground",
      entityId: result.worldId,
      metadata: {
        worldId: result.worldId,
        name: result.name,
        ownerUserId: result.ownerUserId,
        focalUserId: result.focalUserId,
        seededAt: result.seededAt,
        summary: result.summary,
      },
    });

    return result;
  }

  async createSandboxWorld(
    input: {
      worldId?: "design-sandbox-v1";
      focalUserId?: string;
      reset?: boolean;
    },
    actor: { adminUserId: string; role: AdminRole },
  ) {
    const worldId = input.worldId ?? "design-sandbox-v1";
    const definition = getSandboxWorldDefinition(worldId);
    const fixture = normalizeDesignSandboxWorldFixture({
      ...designSandboxWorldV1Fixture,
      focalUserId: input.focalUserId ?? designSandboxWorldV1Fixture.focalUserId,
    });

    if (input.reset) {
      await this.clearSandboxWorldData();
    }

    const seeded = await seedDesignSandboxWorldFixture(
      this.prisma,
      actor,
      fixture,
    );
    const now = new Date().toISOString();
    const summary = this.buildSandboxWorldSummary({
      worldId,
      fixtureLabel: definition.label,
      status: "ready",
      createdAt: now,
      updatedAt: now,
      joinedAt: null,
      focalUserId: input.focalUserId ?? seeded.focalUserId,
      notes: definition.notes,
    });
    await this.saveSandboxWorldSummary(summary);
    await this.recordSandboxWorldAction(actor, "create", summary);
    return summary;
  }

  async getSandboxWorld(
    worldId: "design-sandbox-v1",
    actor: { adminUserId: string; role: AdminRole },
  ) {
    const summary = await this.loadSandboxWorldSummary(worldId);
    await this.recordSandboxWorldAction(actor, "get", summary);
    return summary;
  }

  async inspectSandboxWorld(
    worldId: "design-sandbox-v1",
    actor: { adminUserId: string; role: AdminRole },
  ) {
    const summary = await this.loadSandboxWorldSummary(worldId);
    const focalUserId =
      summary.focalUserId ?? designSandboxWorldV1Fixture.focalUserId;
    const [home, activity] = await Promise.all([
      this.experienceService?.getHomeSummary(focalUserId),
      this.experienceService?.getActivitySummary(focalUserId),
    ]);
    await this.recordSandboxWorldAction(actor, "inspect", summary);
    return {
      summary,
      experience: {
        home: home ?? null,
        activity: activity ?? null,
      },
    };
  }

  async resetSandboxWorld(
    worldId: "design-sandbox-v1",
    actor: { adminUserId: string; role: AdminRole },
  ) {
    await this.clearSandboxWorldData();
    const definition = getSandboxWorldDefinition(worldId);
    const now = new Date().toISOString();
    const summary = this.buildSandboxWorldSummary({
      worldId,
      fixtureLabel: definition.label,
      status: "reset",
      createdAt: now,
      updatedAt: now,
      joinedAt: null,
      focalUserId: null,
      notes: definition.notes,
    });
    await this.saveSandboxWorldSummary(summary);
    await this.recordSandboxWorldAction(actor, "reset", summary);
    return summary;
  }

  async tickSandboxWorld(
    worldId: "design-sandbox-v1",
    input: { note?: string },
    actor: { adminUserId: string; role: AdminRole },
  ) {
    const current = await this.loadSandboxWorldSummary(worldId);
    const definition = getSandboxWorldDefinition(worldId);
    const focalUserId =
      current.focalUserId ?? designSandboxWorldV1Fixture.focalUserId;
    const body = input.note?.trim() || "Synthetic follow-up";
    await this.notificationsService?.createInAppNotification(
      focalUserId,
      NotificationType.AGENT_UPDATE,
      body,
      { worldId, source: "sandbox-world-tick" },
    );
    await this.prisma.notification?.upsert?.({
      where: { id: definition.tick.notificationId },
      update: {
        recipientUserId: focalUserId,
        type: NotificationType.AGENT_UPDATE,
        body,
      },
      create: {
        id: definition.tick.notificationId,
        recipientUserId: focalUserId,
        type: NotificationType.AGENT_UPDATE,
        body,
      },
    });
    const summary = {
      ...current,
      status: "joined" as const,
      updatedAt: new Date().toISOString(),
      notificationCount: current.notificationCount + 1,
    };
    await this.saveSandboxWorldSummary(summary);
    await this.recordSandboxWorldAction(actor, "tick", summary);
    return summary;
  }

  async joinSandboxWorld(
    worldId: "design-sandbox-v1",
    focalUserId: string,
    actor: { adminUserId: string; role: AdminRole },
  ) {
    await this.createSandboxWorld({ worldId, focalUserId }, actor);
    const current = await this.loadSandboxWorldSummary(worldId);
    const now = new Date().toISOString();
    const summary = {
      ...current,
      status: "joined" as const,
      focalUserId,
      joinedAt: now,
      updatedAt: now,
    };
    await this.saveSandboxWorldSummary(summary);
    await this.recordSandboxWorldAction(actor, "join", summary);
    return summary;
  }

  async setSandboxWorldScenario(
    worldId: "design-sandbox-v1",
    scenario: SandboxWorldScenario,
    actor: { adminUserId: string; role: AdminRole },
  ) {
    const current = await this.loadSandboxWorldSummary(worldId);
    const definition = getSandboxWorldDefinition(worldId);
    const focalUserId =
      current.focalUserId ?? designSandboxWorldV1Fixture.focalUserId;

    if (scenario === "waiting_replies") {
      await this.prisma.intentRequest?.updateMany?.({
        where: { id: { in: definition.focalIntent.requestIds } },
        data: {
          status: "pending",
          respondedAt: null,
        },
      });
      await this.prisma.notification?.updateMany?.({
        where: { recipientUserId: focalUserId },
        data: {
          body: "Your search is live and you are waiting on replies.",
        },
      });
    }

    if (scenario === "stalled_search") {
      await this.prisma.intent?.update?.({
        where: { id: definition.focalIntent.id },
        data: {
          rawText:
            "Find a very niche late-night online design systems salon this week.",
          status: "matching",
        },
      });
      await this.prisma.intentRequest?.updateMany?.({
        where: { id: { in: definition.focalIntent.requestIds } },
        data: {
          status: "rejected",
        },
      });
    }

    if (scenario === "activity_burst") {
      await this.prisma.notification?.upsert?.({
        where: { id: definition.tick.notificationId },
        update: {
          recipientUserId: focalUserId,
          type: NotificationType.AGENT_UPDATE,
          body: "Three new updates landed in your sandbox world.",
        },
        create: {
          id: definition.tick.notificationId,
          recipientUserId: focalUserId,
          type: NotificationType.AGENT_UPDATE,
          body: "Three new updates landed in your sandbox world.",
        },
      });
    }

    const summary = {
      ...current,
      updatedAt: new Date().toISOString(),
      notes: [...current.notes, `Scenario applied: ${scenario}`],
    };
    await this.saveSandboxWorldSummary(summary);
    await this.recordSandboxWorldAction(actor, `scenario:${scenario}`, summary);
    return summary;
  }

  async runScenario(
    scenarioId: string,
    actor: { adminUserId: string; role: AdminRole },
  ) {
    const runId = `playground-scenario-${new Date().toISOString().replace(/[:.]/g, "-")}`;
    const traceId = randomUUID();
    const workflowRunId = `admin:playground:scenario:${runId}`;
    const startedAt = Date.now();
    const args = [
      "--filter",
      "@opensocial/api",
      "test",
      "--",
      "test/agentic-scenario-suite.spec.ts",
      "--testNamePattern",
      scenarioId,
    ];
    const result = this.executeCommand("pnpm", args);

    await this.adminAuditService.recordAction({
      adminUserId: actor.adminUserId,
      role: actor.role,
      action: "admin.playground_run_scenario",
      entityType: "admin_playground",
      entityId: runId,
      metadata: {
        workflowRunId,
        traceId,
        scenarioId,
        status: result.status === 0 ? "passed" : "failed",
      },
    });

    return {
      runId,
      traceId,
      workflowRunId,
      scenarioId,
      status: result.status === 0 ? "passed" : "failed",
      latencyMs: Date.now() - startedAt,
      stdoutPreview: this.previewText(result.stdout),
      stderrPreview: this.previewText(result.stderr),
    };
  }

  async runSuite(
    input: RunSuiteInput,
    actor: { adminUserId: string; role: AdminRole },
  ) {
    const runId = `playground-suite-${new Date().toISOString().replace(/[:.]/g, "-")}`;
    const traceId = randomUUID();
    const workflowRunId = `admin:playground:suite:${runId}`;
    const startedAt = Date.now();
    const command =
      input.layer === "verification"
        ? {
            cmd: "pnpm",
            args: ["test:agentic:suite:verification"],
          }
        : {
            cmd: "pnpm",
            args: ["test:agentic:suite", "--", `--layer=${input.layer}`],
          };
    const result = this.executeCommand(command.cmd, command.args);
    const latencyMs = Date.now() - startedAt;
    const status = result.status === 0 ? "passed" : "failed";
    const combinedOutput = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
    const artifactPath = this.extractArtifactPath(combinedOutput);

    const lane: VerificationRunRecord["lane"] =
      input.layer === "verification"
        ? "verification"
        : input.layer === "prod-smoke"
          ? "prod-smoke"
          : "suite";
    await this.ingestVerificationRun({
      runId,
      lane,
      layer: input.layer === "verification" ? "full" : input.layer,
      status,
      generatedAt: new Date().toISOString(),
      canaryVerdict: status === "passed" ? "healthy" : "critical",
      summary: {
        source: "admin-playground",
        latencyMs,
      },
      artifact:
        artifactPath && this.pathLooksReadable(artifactPath)
          ? this.readArtifactJsonSafe(artifactPath)
          : {
              path: artifactPath,
            },
    });

    await this.adminAuditService.recordAction({
      adminUserId: actor.adminUserId,
      role: actor.role,
      action: "admin.playground_run_suite",
      entityType: "admin_playground",
      entityId: runId,
      metadata: {
        workflowRunId,
        traceId,
        layer: input.layer,
        status,
        artifactPath,
      },
    });

    return {
      runId,
      traceId,
      workflowRunId,
      layer: input.layer,
      status,
      latencyMs,
      artifactPath,
      stdoutPreview: this.previewText(result.stdout),
      stderrPreview: this.previewText(result.stderr),
    };
  }

  async rotateProbeToken(
    length: number | undefined,
    actor: { adminUserId: string; role: AdminRole },
  ) {
    const token = this.generateProbeToken(length);
    const generatedAt = new Date().toISOString();
    const notes = [
      "Sync this token to ONBOARDING_PROBE_TOKEN runtime env.",
      "Sync this token to GitHub Actions secrets before verification lane runs.",
    ];

    await this.adminAuditService.recordAction({
      adminUserId: actor.adminUserId,
      role: actor.role,
      action: "admin.playground_rotate_probe_token",
      entityType: "admin_playground",
      metadata: {
        generatedAt,
        tokenLength: token.length,
      },
    });

    return {
      token,
      generatedAt,
      notes,
    };
  }

  async listArtifacts(
    actor: { adminUserId: string; role: AdminRole },
    limit = 30,
  ) {
    const roots = [
      path.resolve(process.cwd(), ".artifacts/agent-test-suite"),
      path.resolve(process.cwd(), ".artifacts/backend-ops-pack"),
    ];
    const entries: Array<{
      path: string;
      type: "suite" | "ops-pack";
      mtimeMs: number;
      sizeBytes: number;
    }> = [];

    for (const root of roots) {
      try {
        const names = readdirSync(root);
        for (const name of names) {
          const fullPath = path.join(root, name);
          const stats = statSync(fullPath);
          entries.push({
            path: fullPath,
            type: root.includes("agent-test-suite") ? "suite" : "ops-pack",
            mtimeMs: stats.mtimeMs,
            sizeBytes: stats.size,
          });
        }
      } catch {
        continue;
      }
    }

    entries.sort((a, b) => b.mtimeMs - a.mtimeMs);
    const sliced = entries.slice(0, Math.max(1, Math.min(limit, 100)));
    await this.adminAuditService.recordAction({
      adminUserId: actor.adminUserId,
      role: actor.role,
      action: "admin.playground_artifacts_view",
      entityType: "admin_playground",
      metadata: {
        resultCount: sliced.length,
      },
    });

    return {
      generatedAt: new Date().toISOString(),
      artifacts: sliced,
    };
  }

  isPlaygroundEnabled() {
    return process.env.PLAYGROUND_ENABLED === "true";
  }

  isPlaygroundMutationsEnabled() {
    return process.env.PLAYGROUND_MUTATIONS_ENABLED === "true";
  }

  isActorMutationAllowed(actorUserId: string) {
    const raw = process.env.PLAYGROUND_ALLOWED_ADMIN_USER_IDS?.trim();
    if (!raw) {
      return true;
    }
    const allowlist = new Set(
      raw
        .split(",")
        .map((value) => value.trim())
        .filter((value) => value.length > 0),
    );
    return allowlist.has(actorUserId);
  }

  private async ensureUser(userId: string, displayName: string) {
    if (!this.prisma.user?.upsert) {
      return;
    }
    await this.prisma.user.upsert({
      where: { id: userId },
      update: {
        displayName,
      },
      create: {
        id: userId,
        displayName,
        locale: "en",
        timezone: "UTC",
      },
    });
    await this.prisma.userProfile?.upsert?.({
      where: { userId },
      update: {},
      create: { userId },
    });
  }

  private async ensureAgentThread(threadId: string, userId: string) {
    const existing = await this.prisma.agentThread?.findUnique?.({
      where: { id: threadId },
      select: { id: true },
    });
    if (existing) {
      return;
    }
    await this.prisma.agentThread?.create?.({
      data: {
        id: threadId,
        userId,
        title: "Playground Verification Thread",
      },
    });
  }

  private buildSandboxWorldSummary(input: {
    worldId: "design-sandbox-v1";
    fixtureLabel: string;
    status: SandboxWorldSummary["status"];
    createdAt: string;
    updatedAt: string;
    joinedAt: string | null;
    focalUserId: string | null;
    notes: string[];
  }): SandboxWorldSummary {
    const definition = getSandboxWorldDefinition(input.worldId);
    return {
      worldId: input.worldId,
      fixtureLabel: input.fixtureLabel,
      status: input.status,
      createdAt: input.createdAt,
      updatedAt: input.updatedAt,
      joinedAt: input.joinedAt,
      focalUserId: input.focalUserId,
      actorCount: definition.syntheticUsers.length + 1,
      directChatCount: definition.directChats.length,
      groupChatCount: definition.groupChats.length,
      notificationCount: definition.focalNotifications.length,
      syntheticActors: [
        ...(input.focalUserId
          ? [
              {
                userId: input.focalUserId,
                displayName: "Sandbox Focal User",
                role: "focal" as const,
              },
            ]
          : []),
        ...definition.syntheticUsers.map((user) => ({
          userId: user.id,
          displayName: user.displayName,
          role: "synthetic" as const,
        })),
      ],
      notes: input.notes,
    };
  }

  private sandboxWorldCacheKey(worldId: string) {
    return `${this.sandboxWorldCacheKeyPrefix}:${worldId}`;
  }

  private async loadSandboxWorldSummary(worldId: "design-sandbox-v1") {
    const cached = await this.appCacheService.getJson<SandboxWorldSummary>(
      this.sandboxWorldCacheKey(worldId),
    );
    if (cached) {
      return cached;
    }
    const definition = getSandboxWorldDefinition(worldId);
    return this.buildSandboxWorldSummary({
      worldId,
      fixtureLabel: definition.label,
      status: "ready",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      joinedAt: null,
      focalUserId: designSandboxWorldV1Fixture.focalUserId,
      notes: definition.notes,
    });
  }

  private async saveSandboxWorldSummary(summary: SandboxWorldSummary) {
    await this.appCacheService.setJson(
      this.sandboxWorldCacheKey(summary.worldId),
      summary,
      60 * 60 * 24,
    );
  }

  private async recordSandboxWorldAction(
    actor: { adminUserId: string; role: AdminRole },
    action: string,
    summary: SandboxWorldSummary,
  ) {
    await this.adminAuditService.recordAction({
      adminUserId: actor.adminUserId,
      role: actor.role,
      action: `admin.sandbox_world_${action}`,
      entityType: "admin_sandbox_world",
      entityId: summary.worldId,
      metadata: {
        status: summary.status,
        focalUserId: summary.focalUserId,
      },
    });
  }

  private async clearSandboxWorldData() {
    await Promise.all([
      this.prisma.notification?.deleteMany?.({}),
      this.prisma.intentRequest?.deleteMany?.({}),
      this.prisma.intent?.deleteMany?.({}),
      this.prisma.chatMessage?.deleteMany?.({}),
      this.prisma.chat?.deleteMany?.({}),
      this.prisma.connectionParticipant?.deleteMany?.({}),
      this.prisma.connection?.deleteMany?.({}),
      this.prisma.agentMessage?.deleteMany?.({}),
      this.prisma.agentThread?.deleteMany?.({}),
      this.prisma.userAvailabilityWindow?.deleteMany?.({}),
      this.prisma.userTopic?.deleteMany?.({}),
      this.prisma.userInterest?.deleteMany?.({}),
    ]);
  }

  private resolveStableUuid(input: string | undefined, fallback: string) {
    const trimmed = input?.trim();
    if (trimmed && USER_ID_REGEX.test(trimmed)) {
      return trimmed;
    }
    return fallback;
  }

  private resolveBaseUrl() {
    return (
      process.env.SMOKE_BASE_URL?.trim() ||
      process.env.API_BASE_URL?.trim() ||
      process.env.STAGING_API_BASE_URL?.trim() ||
      process.env.PROD_API_BASE_URL?.trim() ||
      "http://localhost:3000"
    );
  }

  private getRequiredVerificationEnvStatus() {
    const names = [
      "AGENTIC_BENCH_ACCESS_TOKEN",
      "AGENTIC_BENCH_USER_ID",
      "AGENTIC_BENCH_THREAD_ID",
      "AGENTIC_VERIFICATION_LANE_ID",
      "SMOKE_BASE_URL",
      "SMOKE_ACCESS_TOKEN",
      "SMOKE_ADMIN_USER_ID",
      "SMOKE_AGENT_THREAD_ID",
      "SMOKE_USER_ID",
      "ONBOARDING_PROBE_TOKEN",
    ];
    return Object.fromEntries(
      names.map((name) => [name, Boolean(process.env[name]?.trim())]),
    );
  }

  private previewText(value: string | null | undefined) {
    if (!value || value.trim().length === 0) {
      return null;
    }
    return value.trim().slice(0, 2000);
  }

  private extractArtifactPath(output: string) {
    const lines = output.split("\n");
    for (const rawLine of lines.reverse()) {
      const line = rawLine.trim();
      if (!line) {
        continue;
      }
      const match = line.match(/Artifact written to (.+)$/);
      if (match?.[1]) {
        return match[1].trim();
      }
      const matchAlt = line.match(/artifact written to (.+)$/i);
      if (matchAlt?.[1]) {
        return matchAlt[1].trim();
      }
    }
    return null;
  }

  private pathLooksReadable(input: string) {
    try {
      return statSync(input).isFile();
    } catch {
      return false;
    }
  }

  private readArtifactJsonSafe(artifactPath: string): Record<string, unknown> {
    try {
      return JSON.parse(readFileSync(artifactPath, "utf8")) as Record<
        string,
        unknown
      >;
    } catch (error) {
      this.logger.warn(
        `failed to parse artifact at ${artifactPath}: ${String(error)}`,
      );
      return {
        path: artifactPath,
        parseError: true,
      };
    }
  }

  private generateProbeToken(length = 48) {
    const byteLength = Math.max(24, Math.min(length, 128));
    return randomBytes(byteLength).toString("base64url");
  }

  private async ingestVerificationRun(
    payload: Omit<VerificationRunRecord, "ingestedAt">,
  ) {
    const nowIso = new Date().toISOString();
    const existing =
      (await this.appCacheService.getJson<VerificationRunRecord[]>(
        this.verificationRunCacheKey,
      )) ?? [];
    const next: VerificationRunRecord = {
      ...payload,
      generatedAt: payload.generatedAt || nowIso,
      ingestedAt: nowIso,
    };
    const deduped = [
      next,
      ...existing.filter(
        (item) => !(item.runId === next.runId && item.layer === next.layer),
      ),
    ].slice(0, this.verificationRunMaxItems);
    await this.appCacheService.setJson(
      this.verificationRunCacheKey,
      deduped,
      60 * 60 * 24 * 14,
    );
  }

  private executeCommand(cmd: string, args: string[]) {
    return spawnSync(cmd, args, {
      cwd: process.cwd(),
      encoding: "utf8",
      shell: process.platform === "win32",
    });
  }
}
