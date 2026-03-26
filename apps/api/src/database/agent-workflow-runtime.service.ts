import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "./prisma.service.js";

type WorkflowDomain =
  | "social"
  | "dating"
  | "commerce"
  | "circle"
  | "event"
  | "discovery";

type WorkflowStageStatus =
  | "started"
  | "completed"
  | "skipped"
  | "blocked"
  | "degraded"
  | "failed";

interface WorkflowRunInput {
  workflowRunId: string;
  traceId: string;
  domain: WorkflowDomain;
  entityType: string;
  entityId: string;
  userId?: string | null;
  threadId?: string | null;
  summary?: string;
  metadata?: Record<string, unknown>;
}

interface WorkflowCheckpointInput {
  workflowRunId: string;
  traceId: string;
  stage: string;
  status: WorkflowStageStatus;
  entityType: string;
  entityId: string;
  userId?: string | null;
  summary?: string;
  metadata?: Record<string, unknown>;
}

interface WorkflowSideEffectInput {
  workflowRunId: string;
  traceId: string;
  relation: string;
  entityType: string;
  entityId: string;
  userId?: string | null;
  summary?: string;
  metadata?: Record<string, unknown>;
}

interface AuditWorkflowMetadata {
  workflowRunId?: string;
  traceId?: string;
  domain?: string;
  stage?: string;
  status?: string;
  relation?: string;
  summary?: string;
  userId?: string | null;
  threadId?: string | null;
  [key: string]: unknown;
}

interface WorkflowStageSummary {
  stage: string;
  status: string;
  at: string;
  summary: string | null;
}

interface WorkflowSideEffectSummary {
  relation: string;
  entityType: string;
  entityId: string;
  at: string;
  summary: string | null;
}

interface WorkflowRunSummary {
  workflowRunId: string;
  traceId: string | null;
  domain: string | null;
  entityType: string;
  entityId: string;
  userId: string | null;
  threadId: string | null;
  startedAt: string;
  lastActivityAt: string;
  summary: string | null;
  stages: WorkflowStageSummary[];
  sideEffects: WorkflowSideEffectSummary[];
  replayability: "replayable" | "partial" | "inspect_only";
  health: "healthy" | "watch" | "critical";
  latestCheckpoint: {
    stage: string;
    status: string;
    at: string;
  } | null;
  stageStatusCounts: {
    started: number;
    completed: number;
    skipped: number;
    blocked: number;
    degraded: number;
    failed: number;
    unknown: number;
  };
  integrity: {
    sideEffectCount: number;
    dedupedSideEffectCount: number;
    reusedRelations: string[];
  };
}

@Injectable()
export class AgentWorkflowRuntimeService {
  constructor(private readonly prisma: PrismaService) {}

  buildWorkflowRunId(input: {
    domain: WorkflowDomain;
    entityType: string;
    entityId: string;
  }) {
    return `${input.domain}:${input.entityType}:${input.entityId}`;
  }

  async startRun(input: WorkflowRunInput) {
    await this.recordAudit(
      "agent.workflow_run_started",
      input.entityType,
      input.entityId,
      {
        workflowRunId: input.workflowRunId,
        traceId: input.traceId,
        domain: input.domain,
        userId: input.userId ?? null,
        threadId: input.threadId ?? null,
        summary: input.summary ?? null,
        ...(input.metadata ?? {}),
      },
    );
  }

  async checkpoint(input: WorkflowCheckpointInput) {
    await this.recordAudit(
      "agent.workflow_stage_checkpoint",
      input.entityType,
      input.entityId,
      {
        workflowRunId: input.workflowRunId,
        traceId: input.traceId,
        stage: input.stage,
        status: input.status,
        userId: input.userId ?? null,
        summary: input.summary ?? null,
        ...(input.metadata ?? {}),
      },
    );
  }

  async linkSideEffect(input: WorkflowSideEffectInput) {
    await this.recordAudit(
      "agent.workflow_side_effect_linked",
      input.entityType,
      input.entityId,
      {
        workflowRunId: input.workflowRunId,
        traceId: input.traceId,
        relation: input.relation,
        userId: input.userId ?? null,
        summary: input.summary ?? null,
        ...(input.metadata ?? {}),
      },
    );
  }

  async listRecentRuns(limit = 20) {
    if (!this.prisma.auditLog?.findMany) {
      return [];
    }

    const normalizedLimit = Math.min(Math.max(limit, 1), 50);
    const rows = await this.prisma.auditLog.findMany({
      where: {
        action: {
          in: [
            "agent.workflow_run_started",
            "agent.workflow_stage_checkpoint",
            "agent.workflow_side_effect_linked",
          ],
        },
      },
      orderBy: { createdAt: "desc" },
      take: Math.min(normalizedLimit * 30, 600),
      select: {
        id: true,
        action: true,
        entityType: true,
        entityId: true,
        actorUserId: true,
        createdAt: true,
        metadata: true,
      },
    });

    return this.aggregateWorkflowRuns(rows, normalizedLimit);
  }

  async getRunDetails(workflowRunId: string) {
    if (!this.prisma.auditLog?.findMany) {
      return null;
    }

    const normalizedRunId = this.readString(workflowRunId);
    if (!normalizedRunId) {
      return null;
    }

    const workflowRows = await this.prisma.auditLog.findMany({
      where: {
        action: {
          in: [
            "agent.workflow_run_started",
            "agent.workflow_stage_checkpoint",
            "agent.workflow_side_effect_linked",
          ],
        },
      },
      orderBy: { createdAt: "desc" },
      take: 1200,
      select: {
        id: true,
        action: true,
        entityType: true,
        entityId: true,
        actorUserId: true,
        createdAt: true,
        metadata: true,
      },
    });
    const runRows = workflowRows.filter((row) => {
      const metadata = this.readMetadata(row.metadata);
      return this.readString(metadata.workflowRunId) === normalizedRunId;
    });
    if (runRows.length === 0) {
      return null;
    }

    const [run] = this.aggregateWorkflowRuns(runRows, 1);
    if (!run) {
      return null;
    }
    if (!run.traceId) {
      return {
        run,
        trace: {
          eventCount: 0,
          failedEventCount: 0,
          events: [],
        },
      };
    }

    const traceRows = await this.prisma.auditLog.findMany({
      where: {
        action: {
          notIn: [
            "agent.workflow_run_started",
            "agent.workflow_stage_checkpoint",
            "agent.workflow_side_effect_linked",
          ],
        },
      },
      orderBy: { createdAt: "desc" },
      take: 1200,
      select: {
        id: true,
        action: true,
        entityType: true,
        entityId: true,
        createdAt: true,
        metadata: true,
      },
    });
    const traceEvents = traceRows
      .filter((row) => {
        const metadata = this.readMetadata(row.metadata);
        return this.readString(metadata.traceId) === run.traceId;
      })
      .slice(0, 200)
      .map((row) => {
        const metadata = this.readMetadata(row.metadata);
        const status = this.readString(metadata.status);
        const reason = this.readString(metadata.reason);
        return {
          id: row.id,
          action: row.action,
          entityType: row.entityType,
          entityId: row.entityId ?? "unknown",
          at: row.createdAt.toISOString(),
          status,
          reason,
          summary: this.readString(metadata.summary),
          metadata,
        };
      });
    const failedEventCount = traceEvents.filter(
      (event) =>
        event.status === "failed" ||
        event.action.includes("failed") ||
        event.action.includes("error"),
    ).length;

    return {
      run,
      trace: {
        eventCount: traceEvents.length,
        failedEventCount,
        events: traceEvents,
      },
    };
  }

  private aggregateWorkflowRuns(
    rows: Array<{
      id: string;
      action: string;
      entityType: string;
      entityId: string | null;
      actorUserId: string | null;
      createdAt: Date;
      metadata: unknown;
    }>,
    limit: number,
  ): WorkflowRunSummary[] {
    const byRunId = new Map<string, WorkflowRunSummary>();

    for (const row of [...rows].reverse()) {
      const metadata = this.readMetadata(row.metadata);
      const workflowRunId =
        this.readString(metadata.workflowRunId) ?? `unknown:${row.id}`;
      const existing = byRunId.get(workflowRunId);
      if (!existing) {
        byRunId.set(workflowRunId, {
          workflowRunId,
          traceId: this.readString(metadata.traceId),
          domain: this.readString(metadata.domain),
          entityType: row.entityType,
          entityId: row.entityId ?? "unknown",
          userId: this.readString(metadata.userId) ?? row.actorUserId ?? null,
          threadId: this.readString(metadata.threadId),
          startedAt: row.createdAt.toISOString(),
          lastActivityAt: row.createdAt.toISOString(),
          summary: this.readString(metadata.summary),
          stages: [],
          sideEffects: [],
          replayability: "inspect_only",
          health: "watch",
          latestCheckpoint: null,
          stageStatusCounts: {
            started: 0,
            completed: 0,
            skipped: 0,
            blocked: 0,
            degraded: 0,
            failed: 0,
            unknown: 0,
          },
          integrity: {
            sideEffectCount: 0,
            dedupedSideEffectCount: 0,
            reusedRelations: [],
          },
        });
      }

      const run = byRunId.get(workflowRunId)!;
      run.lastActivityAt = row.createdAt.toISOString();
      run.traceId = run.traceId ?? this.readString(metadata.traceId);
      run.domain = run.domain ?? this.readString(metadata.domain);
      run.threadId = run.threadId ?? this.readString(metadata.threadId);
      run.summary = run.summary ?? this.readString(metadata.summary);

      if (row.action === "agent.workflow_stage_checkpoint") {
        run.stages.push({
          stage: this.readString(metadata.stage) ?? "unknown",
          status: this.readString(metadata.status) ?? "unknown",
          at: row.createdAt.toISOString(),
          summary: this.readString(metadata.summary),
        });
      }

      if (row.action === "agent.workflow_side_effect_linked") {
        run.sideEffects.push({
          relation: this.readString(metadata.relation) ?? "unknown",
          entityType: row.entityType,
          entityId: row.entityId ?? "unknown",
          at: row.createdAt.toISOString(),
          summary: this.readString(metadata.summary),
        });
      }
    }

    return Array.from(byRunId.values())
      .map((run) => {
        const reusedRelations = Array.from(
          new Set(
            run.sideEffects
              .map((sideEffect) => sideEffect.relation)
              .filter(
                (relation) =>
                  relation.includes("reused") || relation.includes("deduped"),
              ),
          ),
        );
        const dedupedSideEffectCount = reusedRelations.length;
        const hasCompletedStage = run.stages.some(
          (stage) => stage.status === "completed",
        );
        const stageStatusCounts = {
          started: run.stages.filter((stage) => stage.status === "started")
            .length,
          completed: run.stages.filter((stage) => stage.status === "completed")
            .length,
          skipped: run.stages.filter((stage) => stage.status === "skipped")
            .length,
          blocked: run.stages.filter((stage) => stage.status === "blocked")
            .length,
          degraded: run.stages.filter((stage) => stage.status === "degraded")
            .length,
          failed: run.stages.filter((stage) => stage.status === "failed")
            .length,
          unknown: run.stages.filter((stage) => stage.status === "unknown")
            .length,
        };
        const latestCheckpoint =
          run.stages.length === 0 ? null : run.stages[run.stages.length - 1];
        const replayability: WorkflowRunSummary["replayability"] =
          run.traceId && hasCompletedStage
            ? "replayable"
            : run.traceId || run.stages.length > 0
              ? "partial"
              : "inspect_only";
        const health: WorkflowRunSummary["health"] =
          stageStatusCounts.failed > 0 || stageStatusCounts.blocked > 0
            ? "critical"
            : stageStatusCounts.degraded > 0 ||
                stageStatusCounts.skipped > 0 ||
                stageStatusCounts.started > 0 ||
                replayability !== "replayable"
              ? "watch"
              : "healthy";
        return {
          ...run,
          replayability,
          health,
          latestCheckpoint:
            latestCheckpoint === null
              ? null
              : {
                  stage: latestCheckpoint.stage,
                  status: latestCheckpoint.status,
                  at: latestCheckpoint.at,
                },
          stageStatusCounts,
          integrity: {
            sideEffectCount: run.sideEffects.length,
            dedupedSideEffectCount,
            reusedRelations,
          },
        };
      })
      .sort((left, right) =>
        right.lastActivityAt.localeCompare(left.lastActivityAt),
      )
      .slice(0, limit);
  }

  private async recordAudit(
    action: string,
    entityType: string,
    entityId: string,
    metadata: Record<string, unknown>,
  ) {
    if (!this.prisma.auditLog?.create) {
      return;
    }

    await this.prisma.auditLog.create({
      data: {
        actorType: "system",
        action,
        entityType,
        entityId,
        metadata: metadata as Prisma.InputJsonValue,
      },
    });
  }

  private readMetadata(value: unknown): AuditWorkflowMetadata {
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as AuditWorkflowMetadata)
      : {};
  }

  private readString(value: unknown) {
    return typeof value === "string" && value.trim().length > 0
      ? value.trim()
      : null;
  }
}
