import { Injectable, Logger } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { AppCacheService } from "../common/app-cache.service.js";
import { AdminAuditService, type AdminRole } from "./admin-audit.service.js";

type SocialSimProvider = "ollama" | "openai";
type SocialSimHorizon = "short" | "medium" | "long";
type SocialSimCleanupMode = "archive" | "delete";
type SocialSimRunStatus =
  | "created"
  | "replayed"
  | "running"
  | "completed"
  | "failed"
  | "archived"
  | "deleted";

export type SocialSimRunRecord = {
  runId: string;
  scenarioFamily: string;
  provider: SocialSimProvider;
  judgeProvider: SocialSimProvider;
  horizon: SocialSimHorizon;
  seed: string;
  namespace: string;
  turnBudget: number;
  actorCount: number;
  cleanupMode: SocialSimCleanupMode;
  status: SocialSimRunStatus;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  sourceRunId: string | null;
  replayOfRunId: string | null;
  artifactDir: string;
  summary: SocialSimRunSummary;
};

export type SocialSimRunSummary = {
  scenarioFamily: string;
  provider: SocialSimProvider;
  judgeProvider: SocialSimProvider;
  horizon: SocialSimHorizon;
  seed: string;
  namespace: string;
  turnBudget: number;
  actorCount: number;
  artifactCount: number;
  memoryConsistency: number | null;
  convergenceScore: number | null;
  matchRate: number | null;
  introToChatRate: number | null;
  chatToOutcomeRate: number | null;
  noMatchRecoveryQuality: number | null;
  safetyFlags: string[];
  notes: string[];
};

export type SocialSimCreateRunInput = {
  scenarioFamily: string;
  provider?: SocialSimProvider;
  judgeProvider?: SocialSimProvider;
  horizon: SocialSimHorizon;
  seed?: string;
  namespace?: string;
  turnBudget?: number;
  actorCount?: number;
  cleanupMode?: SocialSimCleanupMode;
  notes?: string[];
};

export type SocialSimReplayInput = {
  seed?: string;
  namespace?: string;
  provider?: SocialSimProvider;
  judgeProvider?: SocialSimProvider;
  horizon?: SocialSimHorizon;
  turnBudget?: number;
  actorCount?: number;
  cleanupMode?: SocialSimCleanupMode;
};

export type SocialSimTurnRecordInput = {
  namespace: string;
  runId?: string | null;
  worldId: string;
  actorId: string;
  actorKind: string;
  stage: string;
  promptVersion: string;
  action: Record<string, unknown>;
  metrics?: {
    turnIndex?: number;
  };
};

type SocialSimArtifactFile = {
  name: string;
  path: string;
  sizeBytes: number;
  mtimeMs: number;
};

const DEFAULT_PROVIDER: SocialSimProvider = "ollama";
const DEFAULT_JUDGE_PROVIDER: SocialSimProvider = "ollama";
const DEFAULT_HORIZON: SocialSimHorizon = "medium";
const DEFAULT_TURN_BUDGET = 24;
const DEFAULT_ACTOR_COUNT = 12;
const DEFAULT_CLEANUP_MODE: SocialSimCleanupMode = "archive";
const RUN_CACHE_TTL_SECONDS = 60 * 60 * 24 * 14;
const RUN_CACHE_KEY = "ops:social-sim-runs:v1";

@Injectable()
export class SocialSimService {
  private readonly logger = new Logger(SocialSimService.name);
  private readonly artifactRoot = path.resolve(
    process.cwd(),
    process.env.SOCIAL_SIM_ARTIFACT_DIR ?? ".artifacts/social-sim",
  );
  private readonly archiveRoot = path.join(this.artifactRoot, "archive");

  constructor(
    private readonly appCacheService: AppCacheService,
    private readonly adminAuditService: AdminAuditService,
  ) {}

  isEnabled() {
    return process.env.SOCIAL_SIM_ENABLED === "true";
  }

  isMutationsEnabled() {
    return process.env.SOCIAL_SIM_MUTATIONS_ENABLED === "true";
  }

  isActorMutationAllowed(actorUserId: string) {
    const raw = process.env.SOCIAL_SIM_ALLOWED_ADMIN_USER_IDS?.trim();
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

  async createRun(
    input: SocialSimCreateRunInput,
    actor: { adminUserId: string; role: AdminRole },
  ) {
    const runId = this.createRunId(input.scenarioFamily);
    const createdAt = new Date().toISOString();
    const artifactDir = this.resolveRunArtifactDir(runId);
    const record = this.buildRunRecord({
      runId,
      createdAt,
      updatedAt: createdAt,
      status: "created",
      sourceRunId: null,
      replayOfRunId: null,
      artifactDir,
      input,
    });
    this.writeRunArtifact(record);
    await this.storeRunRecord(record);
    await this.adminAuditService.recordAction({
      adminUserId: actor.adminUserId,
      role: actor.role,
      action: "admin.social_sim_run_created",
      entityType: "social_sim_run",
      entityId: runId,
      metadata: {
        scenarioFamily: record.scenarioFamily,
        horizon: record.horizon,
        provider: record.provider,
        judgeProvider: record.judgeProvider,
        seed: record.seed,
        namespace: record.namespace,
      },
    });
    return this.toRunEnvelope(record);
  }

  async listRuns(actor: { adminUserId: string; role: AdminRole }, limit = 50) {
    const runs = await this.loadRunRecords();
    const sliced = runs.slice(0, Math.min(Math.max(limit, 1), 100));
    await this.adminAuditService.recordAction({
      adminUserId: actor.adminUserId,
      role: actor.role,
      action: "admin.social_sim_runs_view",
      entityType: "social_sim_run",
      metadata: {
        resultCount: sliced.length,
      },
    });
    return {
      generatedAt: new Date().toISOString(),
      runs: sliced.map((record) => this.toRunEnvelope(record)),
    };
  }

  async getSummary(
    runId: string,
    actor: { adminUserId: string; role: AdminRole },
  ) {
    const record = await this.requireRunRecord(runId);
    const artifacts = this.listArtifactFiles(record.artifactDir);
    const summary = {
      ...record.summary,
      artifactCount: artifacts.length,
      artifactFiles: artifacts.map((artifact) => ({
        name: artifact.name,
        sizeBytes: artifact.sizeBytes,
        mtimeMs: artifact.mtimeMs,
      })),
      cleanup: record.cleanupMode,
      status: record.status,
      replayOfRunId: record.replayOfRunId,
    };
    await this.adminAuditService.recordAction({
      adminUserId: actor.adminUserId,
      role: actor.role,
      action: "admin.social_sim_run_summary_view",
      entityType: "social_sim_run",
      entityId: runId,
      metadata: {
        artifactCount: artifacts.length,
        status: record.status,
      },
    });
    return {
      generatedAt: new Date().toISOString(),
      run: this.toRunEnvelope(record),
      summary,
    };
  }

  async listArtifacts(
    runId: string,
    actor: { adminUserId: string; role: AdminRole },
    limit = 50,
  ) {
    const record = await this.requireRunRecord(runId);
    const files = this.listArtifactFiles(record.artifactDir).slice(
      0,
      Math.min(Math.max(limit, 1), 100),
    );
    await this.adminAuditService.recordAction({
      adminUserId: actor.adminUserId,
      role: actor.role,
      action: "admin.social_sim_run_artifacts_view",
      entityType: "social_sim_run",
      entityId: runId,
      metadata: {
        resultCount: files.length,
      },
    });
    return {
      generatedAt: new Date().toISOString(),
      runId,
      artifactDir: record.artifactDir,
      artifacts: files,
    };
  }

  async cleanupRun(
    runId: string,
    mode: SocialSimCleanupMode,
    actor: { adminUserId: string; role: AdminRole },
  ) {
    const record = await this.requireRunRecord(runId);
    const nextUpdatedAt = new Date().toISOString();
    let cleanupRecord = {
      mode,
      status: "archived" as SocialSimRunStatus,
      archivedAt: nextUpdatedAt,
      deletedAt: null as string | null,
      archiveDir: null as string | null,
    };

    if (mode === "archive") {
      const archiveDir = this.resolveArchivedRunDir(runId);
      mkdirSync(path.dirname(archiveDir), { recursive: true });
      if (existsSync(record.artifactDir)) {
        if (existsSync(archiveDir)) {
          rmSync(archiveDir, { recursive: true, force: true });
        }
        renameSync(record.artifactDir, archiveDir);
      }
      cleanupRecord = {
        ...cleanupRecord,
        archiveDir,
      };
    } else {
      if (existsSync(record.artifactDir)) {
        rmSync(record.artifactDir, { recursive: true, force: true });
      }
      cleanupRecord = {
        ...cleanupRecord,
        status: "deleted",
        deletedAt: nextUpdatedAt,
      };
    }

    const nextRecord: SocialSimRunRecord = {
      ...record,
      status: cleanupRecord.status,
      updatedAt: nextUpdatedAt,
      artifactDir:
        cleanupRecord.archiveDir ??
        (cleanupRecord.deletedAt ? "" : record.artifactDir),
      summary: {
        ...record.summary,
        notes: [
          ...record.summary.notes,
          mode === "archive"
            ? `Archived at ${cleanupRecord.archivedAt}`
            : `Deleted at ${cleanupRecord.deletedAt}`,
        ],
      },
    };

    await this.storeRunRecord(nextRecord);
    await this.adminAuditService.recordAction({
      adminUserId: actor.adminUserId,
      role: actor.role,
      action: "admin.social_sim_run_cleanup",
      entityType: "social_sim_run",
      entityId: runId,
      metadata: {
        mode,
        status: nextRecord.status,
      },
    });

    return {
      run: this.toRunEnvelope(nextRecord),
      cleanup: cleanupRecord,
    };
  }

  async replayRun(
    runId: string,
    input: SocialSimReplayInput,
    actor: { adminUserId: string; role: AdminRole },
  ) {
    const source = await this.requireRunRecord(runId);
    const replayInput: SocialSimCreateRunInput = {
      scenarioFamily: source.scenarioFamily,
      provider: input.provider ?? source.provider,
      judgeProvider: input.judgeProvider ?? source.judgeProvider,
      horizon: input.horizon ?? source.horizon,
      seed:
        input.seed?.trim() ||
        `${source.seed}:replay:${randomUUID().slice(0, 8)}`,
      namespace: input.namespace?.trim() || source.namespace,
      turnBudget: input.turnBudget ?? source.turnBudget,
      actorCount: input.actorCount ?? source.actorCount,
      cleanupMode: input.cleanupMode ?? source.cleanupMode,
      notes: [...source.summary.notes, `Replayed from ${source.runId}`],
    };

    const created = await this.createRun(replayInput, actor);
    const replayRecord = await this.requireRunRecord(created.runId);
    const nextRecord: SocialSimRunRecord = {
      ...replayRecord,
      status: "replayed",
      sourceRunId: source.runId,
      replayOfRunId: source.runId,
      updatedAt: new Date().toISOString(),
      summary: {
        ...replayRecord.summary,
        notes: [...replayRecord.summary.notes, `Replayed from ${source.runId}`],
      },
    };
    await this.storeRunRecord(nextRecord);

    await this.adminAuditService.recordAction({
      adminUserId: actor.adminUserId,
      role: actor.role,
      action: "admin.social_sim_run_replay",
      entityType: "social_sim_run",
      entityId: nextRecord.runId,
      metadata: {
        sourceRunId: source.runId,
      },
    });

    return {
      sourceRunId: source.runId,
      run: this.toRunEnvelope(nextRecord),
    };
  }

  async recordTurn(
    input: SocialSimTurnRecordInput,
    actor: { adminUserId: string; role: AdminRole },
  ) {
    const runId = input.runId?.trim();
    if (!runId) {
      return {
        accepted: false,
        mode: "ignored",
        reason: "runId is required to persist social sim turns",
      };
    }

    const record = await this.requireRunRecord(runId);
    const updatedAt = new Date().toISOString();
    const turnIndex = Math.max(0, input.metrics?.turnIndex ?? 0);
    const actorSlug = input.actorId
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    const filename = `turn-${String(turnIndex).padStart(4, "0")}-${actorSlug || "actor"}.json`;
    const artifactPath = path.join(record.artifactDir, filename);

    writeFileSync(
      artifactPath,
      JSON.stringify(
        {
          recordedAt: updatedAt,
          namespace: input.namespace,
          runId,
          worldId: input.worldId,
          actorId: input.actorId,
          actorKind: input.actorKind,
          stage: input.stage,
          promptVersion: input.promptVersion,
          action: input.action,
          metrics: input.metrics ?? {},
        },
        null,
        2,
      ),
      "utf8",
    );

    const artifactCount = this.listArtifactFiles(record.artifactDir).length;
    const nextRecord: SocialSimRunRecord = {
      ...record,
      status:
        record.status === "created" || record.status === "replayed"
          ? "running"
          : record.status,
      updatedAt,
      startedAt: record.startedAt ?? updatedAt,
      summary: {
        ...record.summary,
        artifactCount,
      },
    };
    await this.storeRunRecord(nextRecord);

    await this.adminAuditService.recordAction({
      adminUserId: actor.adminUserId,
      role: actor.role,
      action: "admin.social_sim_turn_ingest",
      entityType: "social_sim_run",
      entityId: runId,
      metadata: {
        worldId: input.worldId,
        actorId: input.actorId,
        turnIndex,
        artifact: filename,
      },
    });

    return {
      accepted: true,
      mode: "persisted",
      runId,
      artifact: {
        name: filename,
        path: artifactPath,
      },
    };
  }

  private buildRunRecord(input: {
    runId: string;
    createdAt: string;
    updatedAt: string;
    status: SocialSimRunStatus;
    sourceRunId: string | null;
    replayOfRunId: string | null;
    artifactDir: string;
    input: SocialSimCreateRunInput;
  }): SocialSimRunRecord {
    const provider = input.input.provider ?? DEFAULT_PROVIDER;
    const judgeProvider = input.input.judgeProvider ?? DEFAULT_JUDGE_PROVIDER;
    const horizon = input.input.horizon ?? DEFAULT_HORIZON;
    const seed =
      input.input.seed?.trim() ||
      `${input.input.scenarioFamily}:${input.runId.slice(0, 8)}`;
    const namespace =
      input.input.namespace?.trim() || `social-sim:${input.runId.slice(0, 8)}`;
    const turnBudget = input.input.turnBudget ?? DEFAULT_TURN_BUDGET;
    const actorCount = input.input.actorCount ?? DEFAULT_ACTOR_COUNT;
    const cleanupMode = input.input.cleanupMode ?? DEFAULT_CLEANUP_MODE;
    const notes = input.input.notes ?? [];

    mkdirSync(input.artifactDir, { recursive: true });

    return {
      runId: input.runId,
      scenarioFamily: input.input.scenarioFamily,
      provider,
      judgeProvider,
      horizon,
      seed,
      namespace,
      turnBudget,
      actorCount,
      cleanupMode,
      status: input.status,
      createdAt: input.createdAt,
      updatedAt: input.updatedAt,
      startedAt: null,
      finishedAt: null,
      sourceRunId: input.sourceRunId,
      replayOfRunId: input.replayOfRunId,
      artifactDir: input.artifactDir,
      summary: {
        scenarioFamily: input.input.scenarioFamily,
        provider,
        judgeProvider,
        horizon,
        seed,
        namespace,
        turnBudget,
        actorCount,
        artifactCount: 1,
        memoryConsistency: null,
        convergenceScore: null,
        matchRate: null,
        introToChatRate: null,
        chatToOutcomeRate: null,
        noMatchRecoveryQuality: null,
        safetyFlags: [],
        notes,
      },
    };
  }

  private toRunEnvelope(record: SocialSimRunRecord) {
    return {
      runId: record.runId,
      scenarioFamily: record.scenarioFamily,
      provider: record.provider,
      judgeProvider: record.judgeProvider,
      horizon: record.horizon,
      seed: record.seed,
      namespace: record.namespace,
      turnBudget: record.turnBudget,
      actorCount: record.actorCount,
      cleanupMode: record.cleanupMode,
      status: record.status,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      startedAt: record.startedAt,
      finishedAt: record.finishedAt,
      sourceRunId: record.sourceRunId,
      replayOfRunId: record.replayOfRunId,
      artifactDir: record.artifactDir,
      summary: record.summary,
    };
  }

  private createRunId(scenarioFamily: string) {
    const slug = scenarioFamily
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    return `social-sim-${slug || "run"}-${new Date()
      .toISOString()
      .replace(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}`;
  }

  private resolveRunArtifactDir(runId: string) {
    return path.join(this.artifactRoot, runId);
  }

  private resolveArchivedRunDir(runId: string) {
    return path.join(this.archiveRoot, runId);
  }

  private async requireRunRecord(runId: string) {
    const record = await this.getRunRecord(runId);
    if (!record) {
      throw new Error(`social sim run not found: ${runId}`);
    }
    return record;
  }

  private async getRunRecord(runId: string) {
    const runs = await this.loadRunRecords();
    return runs.find((run) => run.runId === runId) ?? null;
  }

  private async loadRunRecords() {
    const fromCache = await this.appCacheService.getJson(RUN_CACHE_KEY);
    const cachedRuns = Array.isArray(fromCache)
      ? fromCache
          .filter(this.isRunRecordLike)
          .map((record) => record as SocialSimRunRecord)
      : [];
    const fromDisk = this.scanRunRecordsFromDisk();
    const merged = new Map<string, SocialSimRunRecord>();
    for (const run of [...cachedRuns, ...fromDisk]) {
      merged.set(run.runId, run);
    }
    return [...merged.values()].sort((left, right) =>
      right.updatedAt.localeCompare(left.updatedAt),
    );
  }

  private async storeRunRecord(record: SocialSimRunRecord) {
    const runs = await this.loadRunRecords();
    const nextRuns = [
      record,
      ...runs.filter((run) => run.runId !== record.runId),
    ].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    await this.appCacheService.setJson(
      RUN_CACHE_KEY,
      nextRuns,
      RUN_CACHE_TTL_SECONDS,
    );
    this.writeRunArtifact(record);
  }

  private writeRunArtifact(record: SocialSimRunRecord) {
    mkdirSync(record.artifactDir, { recursive: true });
    writeFileSync(
      path.join(record.artifactDir, "run.json"),
      JSON.stringify(record, null, 2),
      "utf8",
    );
  }

  private scanRunRecordsFromDisk() {
    const roots = [this.artifactRoot, this.archiveRoot];
    const records: SocialSimRunRecord[] = [];
    for (const root of roots) {
      if (!existsSync(root)) {
        continue;
      }
      const entries = readdirSync(root, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) {
          continue;
        }
        const runJsonPath = path.join(root, entry.name, "run.json");
        if (!existsSync(runJsonPath)) {
          continue;
        }
        try {
          const raw = JSON.parse(readFileSync(runJsonPath, "utf8"));
          if (this.isRunRecordLike(raw)) {
            records.push(raw as SocialSimRunRecord);
          }
        } catch (error) {
          this.logger.warn(
            `failed to read social sim run artifact ${runJsonPath}: ${String(error)}`,
          );
        }
      }
    }
    return records;
  }

  private listArtifactFiles(artifactDir: string): SocialSimArtifactFile[] {
    if (!artifactDir || !existsSync(artifactDir)) {
      return [];
    }
    const entries = readdirSync(artifactDir, { withFileTypes: true });
    const files: SocialSimArtifactFile[] = [];
    for (const entry of entries) {
      if (!entry.isFile()) {
        continue;
      }
      const fullPath = path.join(artifactDir, entry.name);
      const stats = statSync(fullPath);
      files.push({
        name: entry.name,
        path: fullPath,
        sizeBytes: stats.size,
        mtimeMs: stats.mtimeMs,
      });
    }
    files.sort((left, right) => right.mtimeMs - left.mtimeMs);
    return files;
  }

  private isRunRecordLike(value: unknown): value is SocialSimRunRecord {
    if (!value || typeof value !== "object") {
      return false;
    }
    const candidate = value as Record<string, unknown>;
    return (
      typeof candidate.runId === "string" &&
      typeof candidate.scenarioFamily === "string" &&
      typeof candidate.provider === "string" &&
      typeof candidate.judgeProvider === "string" &&
      typeof candidate.horizon === "string" &&
      typeof candidate.seed === "string" &&
      typeof candidate.namespace === "string" &&
      typeof candidate.turnBudget === "number" &&
      typeof candidate.actorCount === "number" &&
      typeof candidate.cleanupMode === "string" &&
      typeof candidate.status === "string" &&
      typeof candidate.createdAt === "string" &&
      typeof candidate.updatedAt === "string" &&
      typeof candidate.artifactDir === "string" &&
      typeof candidate.summary === "object"
    );
  }
}
