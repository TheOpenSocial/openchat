import { Injectable, Logger, Optional } from "@nestjs/common";
import { NotificationType, RequestStatus } from "@opensocial/types";
import { AuthService } from "../auth/auth.service.js";
import { AppCacheService } from "../common/app-cache.service.js";
import { PrismaService } from "../database/prisma.service.js";
import { AdminAuditService, type AdminRole } from "./admin-audit.service.js";
import { randomBytes, randomUUID } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { ChatsService } from "../chats/chats.service.js";
import { NotificationsService } from "../notifications/notifications.service.js";
import {
  getSandboxWorldDefinition,
  type SandboxPersona,
} from "./admin-sandbox-worlds.js";

type BootstrapInput = {
  rotateProbeToken?: boolean;
  laneId?: string;
  smokeBaseUrl?: string;
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

type SandboxWorldId = "design-sandbox-v1";

type SandboxWorldRecord = {
  worldId: SandboxWorldId;
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
    role: "synthetic";
  }>;
  seededEntityIds: {
    syntheticUserIds: string[];
    connectionIds: string[];
    chatIds: string[];
    chatMessageIds: string[];
    notificationIds: string[];
    intentIds: string[];
    intentRequestIds: string[];
    agentMessageIds: string[];
  };
  notes: string[];
};

const USER_ID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class AdminPlaygroundService {
  private readonly logger = new Logger(AdminPlaygroundService.name);
  private readonly verificationRunCacheKey = "ops:agent-verification-runs:v1";
  private readonly verificationRunMaxItems = 200;
  private readonly sandboxWorldCacheKey = "ops:playground:sandbox-worlds:v1";

  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
    private readonly appCacheService: AppCacheService,
    private readonly adminAuditService: AdminAuditService,
    @Optional()
    private readonly chatsService?: ChatsService,
    @Optional()
    private readonly notificationsService?: NotificationsService,
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
      process.env.PLAYGROUND_SMOKE_USER_ID,
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

  async createSandboxWorld(
    input: {
      worldId: SandboxWorldId;
      focalUserId?: string;
      reset?: boolean;
    },
    actor: { adminUserId: string; role: AdminRole },
  ) {
    if (input.reset) {
      await this.resetSandboxWorld(input.worldId, actor);
    }
    const next = await this.seedSandboxWorld(
      input.worldId,
      input.focalUserId ?? null,
    );
    await this.adminAuditService.recordAction({
      adminUserId: actor.adminUserId,
      role: actor.role,
      action: "admin.playground_sandbox_world_create",
      entityType: "admin_playground",
      entityId: input.worldId,
      metadata: {
        focalUserId: input.focalUserId ?? null,
      },
    });
    return next;
  }

  async getSandboxWorld(
    worldId: SandboxWorldId,
    actor: { adminUserId: string; role: AdminRole },
  ) {
    const world =
      (await this.findSandboxWorldRecord(worldId)) ??
      (await this.buildSandboxWorldRecordFromDatabase(worldId));
    await this.adminAuditService.recordAction({
      adminUserId: actor.adminUserId,
      role: actor.role,
      action: "admin.playground_sandbox_world_view",
      entityType: "admin_playground",
      entityId: worldId,
    });
    return (
      world ?? {
        worldId,
        fixtureLabel: getSandboxWorldDefinition(worldId).label,
        status: "reset",
        createdAt: new Date(0).toISOString(),
        updatedAt: new Date(0).toISOString(),
        joinedAt: null,
        focalUserId: null,
        actorCount: getSandboxWorldDefinition(worldId).syntheticUsers.length,
        directChatCount: 0,
        groupChatCount: 0,
        notificationCount: 0,
        syntheticActors: getSandboxWorldDefinition(worldId).syntheticUsers.map(
          (entry) => ({
            userId: entry.id,
            displayName: entry.displayName,
            role: "synthetic" as const,
          }),
        ),
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
        notes: getSandboxWorldDefinition(worldId).notes,
      }
    );
  }

  async resetSandboxWorld(
    worldId: SandboxWorldId,
    actor: { adminUserId: string; role: AdminRole },
  ) {
    await this.teardownSandboxWorld(worldId);
    await this.removeSandboxWorldRecord(worldId);
    await this.adminAuditService.recordAction({
      adminUserId: actor.adminUserId,
      role: actor.role,
      action: "admin.playground_sandbox_world_reset",
      entityType: "admin_playground",
      entityId: worldId,
    });
    return {
      worldId,
      status: "reset" as const,
      resetAt: new Date().toISOString(),
    };
  }

  async tickSandboxWorld(
    worldId: SandboxWorldId,
    input: { note?: string },
    actor: { adminUserId: string; role: AdminRole },
  ) {
    const record = await this.requireSandboxWorldRecord(worldId);
    const definition = getSandboxWorldDefinition(worldId);
    const focalUserId = record.focalUserId;
    if (!focalUserId) {
      throw new Error("sandbox world has no focal user joined");
    }

    const nextMessageBody =
      input.note?.trim() ||
      `${definition.syntheticUsers[5]?.displayName ?? "A participant"} is open to starting online first before committing to an in-person plan.`;

    const targetChatId = record.seededEntityIds.chatIds[0] ?? null;
    let createdMessageId: string | null = null;
    if (targetChatId) {
      const senderUserId =
        definition.directChats[0]?.participantUserId ??
        definition.syntheticUsers[0]?.id;
      const created = await this.ensureChatMessage(
        targetChatId,
        definition.tick.messageId,
        senderUserId,
        nextMessageBody,
      );
      createdMessageId = typeof created?.id === "string" ? created.id : null;
    }

    const notification = await this.prisma.notification.upsert({
      where: { id: definition.tick.notificationId },
      update: {
        recipientUserId: focalUserId,
        type: NotificationType.AGENT_UPDATE,
        body: "Your sandbox world moved. There is a new reply waiting in a live thread.",
        channel: "in_app",
      },
      create: {
        id: definition.tick.notificationId,
        recipientUserId: focalUserId,
        type: NotificationType.AGENT_UPDATE,
        body: "Your sandbox world moved. There is a new reply waiting in a live thread.",
        channel: "in_app",
      },
    });

    const nextNotificationIds = [
      ...new Set([...record.seededEntityIds.notificationIds, notification.id]),
    ];
    const updated = await this.upsertSandboxWorldRecord({
      ...record,
      updatedAt: new Date().toISOString(),
      notificationCount: nextNotificationIds.length,
      seededEntityIds: {
        ...record.seededEntityIds,
        chatMessageIds: createdMessageId
          ? [
              ...new Set([
                ...record.seededEntityIds.chatMessageIds,
                createdMessageId,
              ]),
            ]
          : record.seededEntityIds.chatMessageIds,
        notificationIds: nextNotificationIds,
      },
      notes: [
        ...record.notes,
        "Tick injected one synthetic reply and one fresh agent update notification.",
      ].slice(-8),
    });

    await this.adminAuditService.recordAction({
      adminUserId: actor.adminUserId,
      role: actor.role,
      action: "admin.playground_sandbox_world_tick",
      entityType: "admin_playground",
      entityId: worldId,
      metadata: {
        focalUserId,
      },
    });
    return updated;
  }

  async joinSandboxWorld(
    worldId: SandboxWorldId,
    focalUserId: string,
    actor: { adminUserId: string; role: AdminRole },
  ) {
    await this.teardownSandboxWorld(worldId);
    const updated = await this.seedSandboxWorld(worldId, focalUserId);
    await this.adminAuditService.recordAction({
      adminUserId: actor.adminUserId,
      role: actor.role,
      action: "admin.playground_sandbox_world_join",
      entityType: "admin_playground",
      entityId: worldId,
      metadata: {
        focalUserId,
      },
    });
    return updated;
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

  private async seedSandboxWorld(
    worldId: SandboxWorldId,
    focalUserId: string | null,
  ): Promise<SandboxWorldRecord> {
    const definition = getSandboxWorldDefinition(worldId);
    const nowIso = new Date().toISOString();
    const existing = await this.findSandboxWorldRecord(worldId);
    const nextFocalUserId =
      focalUserId?.trim() ||
      existing?.focalUserId ||
      this.resolveStableUuid(
        process.env.PLAYGROUND_SMOKE_USER_ID,
        "77777777-7777-4777-8777-777777777777",
      );

    await this.ensureUser(nextFocalUserId, "Playground Smoke User");
    const focalThreadId = await this.ensureSandboxAgentThread(
      definition.focalThreadId,
      nextFocalUserId,
    );

    for (const persona of definition.syntheticUsers) {
      await this.ensureSandboxUser(persona);
    }

    const seededConnectionIds: string[] = [];
    const seededChatIds: string[] = [];
    const seededChatMessageIds: string[] = [];
    const seededNotificationIds: string[] = [];
    const seededIntentIds: string[] = [];
    const seededIntentRequestIds: string[] = [];
    const seededAgentMessageIds: string[] = [];

    for (const direct of definition.directChats) {
      await this.prisma.connection.upsert({
        where: { id: direct.connectionId },
        update: {},
        create: {
          id: direct.connectionId,
          type: "dm",
          createdByUserId: nextFocalUserId,
          status: "active",
        },
      });
      seededConnectionIds.push(direct.connectionId);

      await this.ensureConnectionParticipant(
        direct.connectionId,
        nextFocalUserId,
      );
      await this.ensureConnectionParticipant(
        direct.connectionId,
        direct.participantUserId,
      );

      const chat =
        (await this.prisma.chat.findUnique({
          where: { id: direct.id },
          select: { id: true },
        })) ??
        (this.chatsService
          ? await this.prisma.chat.create({
              data: {
                id: direct.id,
                connectionId: direct.connectionId,
                type: "dm",
              },
            })
          : await this.prisma.chat.create({
              data: {
                id: direct.id,
                connectionId: direct.connectionId,
                type: "dm",
              },
            }));
      seededChatIds.push(chat.id);

      for (const message of direct.messages) {
        const created = await this.ensureChatMessage(
          chat.id,
          message.id,
          message.senderUserId,
          message.body,
        );
        seededChatMessageIds.push(created.id);
      }
    }

    for (const group of definition.groupChats) {
      await this.prisma.connection.upsert({
        where: { id: group.connectionId },
        update: {},
        create: {
          id: group.connectionId,
          type: "group",
          createdByUserId: nextFocalUserId,
          status: "active",
        },
      });
      seededConnectionIds.push(group.connectionId);
      await this.ensureConnectionParticipant(
        group.connectionId,
        nextFocalUserId,
      );
      for (const participantUserId of group.participantUserIds) {
        await this.ensureConnectionParticipant(
          group.connectionId,
          participantUserId,
        );
      }
      const chat = await this.prisma.chat.upsert({
        where: { id: group.id },
        update: {},
        create: {
          id: group.id,
          connectionId: group.connectionId,
          type: "group",
        },
      });
      seededChatIds.push(chat.id);
      for (const message of group.messages) {
        const created = await this.ensureChatMessage(
          chat.id,
          message.id,
          message.senderUserId,
          message.body,
        );
        seededChatMessageIds.push(created.id);
      }
    }

    for (const seedMessage of definition.focalAgentThread) {
      const agentMessage = await this.prisma.agentMessage.upsert({
        where: { id: seedMessage.id },
        update: {
          threadId: focalThreadId,
          createdByUserId: seedMessage.role === "user" ? nextFocalUserId : null,
          role: seedMessage.role,
          content: seedMessage.content,
        },
        create: {
          id: seedMessage.id,
          threadId: focalThreadId,
          createdByUserId: seedMessage.role === "user" ? nextFocalUserId : null,
          role: seedMessage.role,
          content: seedMessage.content,
        },
      });
      seededAgentMessageIds.push(agentMessage.id);
    }

    const intent = await this.prisma.intent.upsert({
      where: { id: definition.focalIntent.id },
      update: {
        userId: nextFocalUserId,
        rawText: definition.focalIntent.rawText,
        status: "matching",
        parsedIntent: definition.focalIntent.parsedIntent as never,
      },
      create: {
        id: definition.focalIntent.id,
        userId: nextFocalUserId,
        rawText: definition.focalIntent.rawText,
        status: "matching",
        parsedIntent: definition.focalIntent.parsedIntent as never,
      },
    });
    seededIntentIds.push(intent.id);

    const requestTargets = definition.syntheticUsers.slice(0, 2);
    for (
      let index = 0;
      index < definition.focalIntent.requestIds.length;
      index += 1
    ) {
      const requestId = definition.focalIntent.requestIds[index];
      const recipientUserId = requestTargets[index]?.id;
      if (!recipientUserId) {
        continue;
      }
      const request = await this.prisma.intentRequest.upsert({
        where: { id: requestId },
        update: {
          intentId: intent.id,
          senderUserId: nextFocalUserId,
          recipientUserId,
          status: index === 0 ? RequestStatus.ACCEPTED : RequestStatus.PENDING,
        },
        create: {
          id: requestId,
          intentId: intent.id,
          senderUserId: nextFocalUserId,
          recipientUserId,
          status: index === 0 ? RequestStatus.ACCEPTED : RequestStatus.PENDING,
          wave: 1,
        },
      });
      seededIntentRequestIds.push(request.id);
    }

    for (const item of definition.focalNotifications) {
      const notification = await this.prisma.notification.upsert({
        where: { id: item.id },
        update: {
          recipientUserId: nextFocalUserId,
          type: item.type,
          body: item.body,
          channel: "in_app",
        },
        create: {
          id: item.id,
          recipientUserId: nextFocalUserId,
          type: item.type,
          body: item.body,
          channel: "in_app",
        },
      });
      seededNotificationIds.push(notification.id);
    }

    return this.upsertSandboxWorldRecord({
      worldId,
      fixtureLabel: definition.label,
      status: focalUserId ? "joined" : (existing?.status ?? "ready"),
      createdAt: existing?.createdAt ?? nowIso,
      updatedAt: nowIso,
      joinedAt: focalUserId ? nowIso : (existing?.joinedAt ?? null),
      focalUserId: nextFocalUserId,
      actorCount: definition.syntheticUsers.length + 1,
      directChatCount: definition.directChats.length,
      groupChatCount: definition.groupChats.length,
      notificationCount: seededNotificationIds.length,
      syntheticActors: definition.syntheticUsers.map((entry) => ({
        userId: entry.id,
        displayName: entry.displayName,
        role: "synthetic" as const,
      })),
      seededEntityIds: {
        syntheticUserIds: definition.syntheticUsers.map((entry) => entry.id),
        connectionIds: seededConnectionIds,
        chatIds: seededChatIds,
        chatMessageIds: seededChatMessageIds,
        notificationIds: seededNotificationIds,
        intentIds: seededIntentIds,
        intentRequestIds: seededIntentRequestIds,
        agentMessageIds: seededAgentMessageIds,
      },
      notes: [
        ...definition.notes,
        `Focal user ${nextFocalUserId} is attached to the sandbox world.`,
      ],
    });
  }

  private async teardownSandboxWorld(worldId: SandboxWorldId) {
    const record = await this.findSandboxWorldRecord(worldId);
    const definition = getSandboxWorldDefinition(worldId);
    const fallbackIds = this.getSandboxWorldFixedIds(definition);
    const seededEntityIds = record?.seededEntityIds ?? fallbackIds;

    await this.prisma.notification.deleteMany({
      where: { id: { in: seededEntityIds.notificationIds } },
    });
    await this.prisma.intentRequest.deleteMany({
      where: { id: { in: seededEntityIds.intentRequestIds } },
    });
    await this.prisma.intent.deleteMany({
      where: { id: { in: seededEntityIds.intentIds } },
    });
    await this.prisma.agentMessage.deleteMany({
      where: { id: { in: seededEntityIds.agentMessageIds } },
    });
    await this.prisma.agentThread.deleteMany({
      where: { id: definition.focalThreadId },
    });
    await this.prisma.chatMessage.deleteMany({
      where: { id: { in: seededEntityIds.chatMessageIds } },
    });
    await this.prisma.chat.deleteMany({
      where: { id: { in: seededEntityIds.chatIds } },
    });
    await this.prisma.connectionParticipant.deleteMany({
      where: { connectionId: { in: seededEntityIds.connectionIds } },
    });
    await this.prisma.connection.deleteMany({
      where: { id: { in: seededEntityIds.connectionIds } },
    });
    await this.prisma.userAvailabilityWindow.deleteMany({
      where: { userId: { in: seededEntityIds.syntheticUserIds } },
    });
    await this.prisma.userTopic.deleteMany({
      where: { userId: { in: seededEntityIds.syntheticUserIds } },
    });
    await this.prisma.userInterest.deleteMany({
      where: { userId: { in: seededEntityIds.syntheticUserIds } },
    });
    await this.prisma.userProfile.deleteMany({
      where: { userId: { in: seededEntityIds.syntheticUserIds } },
    });
    await this.prisma.user.deleteMany({
      where: { id: { in: seededEntityIds.syntheticUserIds } },
    });
  }

  private async ensureSandboxUser(persona: SandboxPersona) {
    await this.ensureUser(persona.id, persona.displayName);
    await this.prisma.userProfile.update({
      where: { userId: persona.id },
      data: {
        bio: persona.bio,
        city: persona.city,
        country: persona.country,
        onboardingState: "complete",
      },
    });
    await this.prisma.userInterest.deleteMany({
      where: { userId: persona.id },
    });
    await this.prisma.userTopic.deleteMany({ where: { userId: persona.id } });
    await this.prisma.userAvailabilityWindow.deleteMany({
      where: { userId: persona.id },
    });
    if (persona.interests.length > 0) {
      await this.prisma.userInterest.createMany({
        data: persona.interests.map((label, index) => ({
          userId: persona.id,
          kind: "interest",
          label,
          normalizedLabel: label.toLowerCase(),
          weight: 1 + index * 0.1,
          source: "sandbox",
        })),
      });
    }
    if (persona.topics.length > 0) {
      await this.prisma.userTopic.createMany({
        data: persona.topics.map((label, index) => ({
          userId: persona.id,
          label,
          normalizedLabel: label.toLowerCase(),
          weight: 1 + index * 0.1,
          source: "sandbox",
        })),
      });
    }
    await this.prisma.userAvailabilityWindow.createMany({
      data: [
        {
          userId: persona.id,
          dayOfWeek: 4,
          startMinute: 18 * 60,
          endMinute: 21 * 60,
          mode: "available",
          timezone: "America/Argentina/Buenos_Aires",
        },
      ],
    });
  }

  private async ensureSandboxAgentThread(threadId: string, userId: string) {
    const existing = await this.prisma.agentThread.findUnique({
      where: { id: threadId },
      select: { id: true },
    });
    if (existing?.id) {
      await this.prisma.agentThread.update({
        where: { id: threadId },
        data: {
          userId,
          title: "Sandbox world conversation",
        },
      });
      return threadId;
    }
    const created = await this.prisma.agentThread.create({
      data: {
        id: threadId,
        userId,
        title: "Sandbox world conversation",
      },
    });
    return created.id;
  }

  private async ensureConnectionParticipant(
    connectionId: string,
    userId: string,
  ) {
    const existing = await this.prisma.connectionParticipant.findFirst({
      where: { connectionId, userId },
      select: { id: true },
    });
    if (existing?.id) {
      await this.prisma.connectionParticipant.update({
        where: { id: existing.id },
        data: { leftAt: null },
      });
      return;
    }
    await this.prisma.connectionParticipant.create({
      data: {
        id: randomUUID(),
        connectionId,
        userId,
        role: "member",
      },
    });
  }

  private async ensureChatMessage(
    chatId: string,
    messageId: string,
    senderUserId: string,
    body: string,
  ) {
    const existing = await this.prisma.chatMessage.findUnique({
      where: { id: messageId },
      select: { id: true },
    });
    if (existing?.id) {
      return existing;
    }
    return this.prisma.chatMessage.create({
      data: {
        id: messageId,
        chatId,
        senderUserId,
        body,
      },
    });
  }

  private mapSandboxNotificationType(
    type:
      | "agent_update"
      | "request_received"
      | "request_accepted"
      | "group_formed"
      | "reminder",
  ) {
    switch (type) {
      case "request_received":
        return NotificationType.REQUEST_RECEIVED;
      case "request_accepted":
        return NotificationType.REQUEST_ACCEPTED;
      case "group_formed":
        return NotificationType.GROUP_FORMED;
      case "reminder":
        return NotificationType.REMINDER;
      default:
        return NotificationType.AGENT_UPDATE;
    }
  }

  private async loadSandboxWorldRecords() {
    return (
      (await this.appCacheService.getJson<SandboxWorldRecord[]>(
        this.sandboxWorldCacheKey,
      )) ?? []
    );
  }

  private async buildSandboxWorldRecordFromDatabase(worldId: SandboxWorldId) {
    const definition = getSandboxWorldDefinition(worldId);
    const fixedIds = this.getSandboxWorldFixedIds(definition);
    const thread = await this.prisma.agentThread.findUnique({
      where: { id: definition.focalThreadId },
      select: { userId: true, createdAt: true, updatedAt: true },
    });
    if (!thread) {
      return null;
    }
    const notificationCount = await this.prisma.notification.count({
      where: { id: { in: fixedIds.notificationIds } },
    });
    return {
      worldId,
      fixtureLabel: definition.label,
      status:
        thread.userId ===
        this.resolveStableUuid(
          process.env.PLAYGROUND_SMOKE_USER_ID,
          "77777777-7777-4777-8777-777777777777",
        )
          ? ("ready" as const)
          : ("joined" as const),
      createdAt: thread.createdAt.toISOString(),
      updatedAt: thread.updatedAt.toISOString(),
      joinedAt: thread.createdAt.toISOString(),
      focalUserId: thread.userId,
      actorCount: definition.syntheticUsers.length + 1,
      directChatCount: definition.directChats.length,
      groupChatCount: definition.groupChats.length,
      notificationCount,
      syntheticActors: definition.syntheticUsers.map((entry) => ({
        userId: entry.id,
        displayName: entry.displayName,
        role: "synthetic" as const,
      })),
      seededEntityIds: fixedIds,
      notes: [
        ...definition.notes,
        `Focal user ${thread.userId} is attached to the sandbox world.`,
      ],
    };
  }

  private getSandboxWorldFixedIds(
    definition: ReturnType<typeof getSandboxWorldDefinition>,
  ) {
    return {
      syntheticUserIds: definition.syntheticUsers.map((entry) => entry.id),
      connectionIds: [
        ...definition.directChats.map((entry) => entry.connectionId),
        ...definition.groupChats.map((entry) => entry.connectionId),
      ],
      chatIds: [
        ...definition.directChats.map((entry) => entry.id),
        ...definition.groupChats.map((entry) => entry.id),
      ],
      chatMessageIds: [
        ...definition.directChats.flatMap((entry) =>
          entry.messages.map((message) => message.id),
        ),
        ...definition.groupChats.flatMap((entry) =>
          entry.messages.map((message) => message.id),
        ),
        definition.tick.messageId,
      ],
      notificationIds: [
        ...definition.focalNotifications.map((entry) => entry.id),
        definition.tick.notificationId,
      ],
      intentIds: [definition.focalIntent.id],
      intentRequestIds: definition.focalIntent.requestIds,
      agentMessageIds: definition.focalAgentThread.map((entry) => entry.id),
    };
  }

  private async findSandboxWorldRecord(worldId: SandboxWorldId) {
    const worlds = await this.loadSandboxWorldRecords();
    return worlds.find((entry) => entry.worldId === worldId) ?? null;
  }

  private async requireSandboxWorldRecord(worldId: SandboxWorldId) {
    const world = await this.findSandboxWorldRecord(worldId);
    if (!world) {
      throw new Error(`sandbox world ${worldId} is not initialized`);
    }
    return world;
  }

  private async removeSandboxWorldRecord(worldId: SandboxWorldId) {
    const worlds = await this.loadSandboxWorldRecords();
    const next = worlds.filter((entry) => entry.worldId !== worldId);
    await this.appCacheService.setJson(
      this.sandboxWorldCacheKey,
      next,
      60 * 60 * 24 * 14,
    );
  }

  private async upsertSandboxWorldRecord(record: SandboxWorldRecord) {
    const worlds = await this.loadSandboxWorldRecords();
    const next = [
      record,
      ...worlds.filter((entry) => entry.worldId !== record.worldId),
    ].slice(0, 20);
    await this.appCacheService.setJson(
      this.sandboxWorldCacheKey,
      next,
      60 * 60 * 24 * 14,
    );
    return record;
  }
}
