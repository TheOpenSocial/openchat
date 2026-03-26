import { describe, expect, it, vi } from "vitest";
import { AgentWorkflowRuntimeService } from "../src/database/agent-workflow-runtime.service.js";

describe("AgentWorkflowRuntimeService", () => {
  it("builds a deterministic workflow run id", () => {
    const service = new AgentWorkflowRuntimeService({} as any);

    expect(
      service.buildWorkflowRunId({
        domain: "social",
        entityType: "intent",
        entityId: "intent-1",
      }),
    ).toBe("social:intent:intent-1");
  });

  it("aggregates recent runs from workflow audit rows", async () => {
    const prisma = {
      auditLog: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "audit-3",
            action: "agent.workflow_side_effect_linked",
            entityType: "notification",
            entityId: "notif-1",
            actorUserId: null,
            createdAt: new Date("2026-03-24T00:00:03.000Z"),
            metadata: {
              workflowRunId: "social:intent:intent-1",
              traceId: "trace-1",
              relation: "followup_notification",
              summary: "Persisted async follow-up notification.",
            },
          },
          {
            id: "audit-2",
            action: "agent.workflow_stage_checkpoint",
            entityType: "intent",
            entityId: "intent-1",
            actorUserId: null,
            createdAt: new Date("2026-03-24T00:00:02.000Z"),
            metadata: {
              workflowRunId: "social:intent:intent-1",
              traceId: "trace-1",
              stage: "ranking",
              status: "completed",
              summary: "Candidate retrieval completed.",
            },
          },
          {
            id: "audit-1",
            action: "agent.workflow_run_started",
            entityType: "intent",
            entityId: "intent-1",
            actorUserId: "user-1",
            createdAt: new Date("2026-03-24T00:00:01.000Z"),
            metadata: {
              workflowRunId: "social:intent:intent-1",
              traceId: "trace-1",
              domain: "social",
              userId: "user-1",
              summary: "Intent accepted into the agentic workflow runtime.",
            },
          },
        ]),
      },
    };
    const service = new AgentWorkflowRuntimeService(prisma as any);

    const runs = await service.listRecentRuns(5);

    expect(runs).toHaveLength(1);
    expect(runs[0]?.workflowRunId).toBe("social:intent:intent-1");
    expect(runs[0]?.stages[0]).toEqual(
      expect.objectContaining({
        stage: "ranking",
        status: "completed",
      }),
    );
    expect(runs[0]?.sideEffects[0]).toEqual(
      expect.objectContaining({
        relation: "followup_notification",
      }),
    );
    expect(runs[0]?.replayability).toBe("replayable");
    expect(runs[0]?.health).toBe("healthy");
    expect(runs[0]?.latestCheckpoint).toEqual(
      expect.objectContaining({
        stage: "ranking",
        status: "completed",
      }),
    );
    expect(runs[0]?.stageStatusCounts).toEqual(
      expect.objectContaining({
        completed: 1,
        failed: 0,
        blocked: 0,
      }),
    );
    expect(runs[0]?.integrity).toEqual(
      expect.objectContaining({
        sideEffectCount: 1,
        dedupedSideEffectCount: 0,
      }),
    );
  });

  it("returns workflow run details with related trace events", async () => {
    const findMany = vi
      .fn()
      .mockResolvedValueOnce([
        {
          id: "audit-3",
          action: "agent.workflow_side_effect_linked",
          entityType: "notification",
          entityId: "notif-1",
          actorUserId: null,
          createdAt: new Date("2026-03-24T00:00:03.000Z"),
          metadata: {
            workflowRunId: "social:intent:intent-1",
            traceId: "trace-1",
            relation: "followup_notification",
            summary: "Persisted async follow-up notification.",
          },
        },
        {
          id: "audit-2",
          action: "agent.workflow_stage_checkpoint",
          entityType: "intent",
          entityId: "intent-1",
          actorUserId: null,
          createdAt: new Date("2026-03-24T00:00:02.000Z"),
          metadata: {
            workflowRunId: "social:intent:intent-1",
            traceId: "trace-1",
            stage: "ranking",
            status: "completed",
            summary: "Candidate retrieval completed.",
          },
        },
        {
          id: "audit-1",
          action: "agent.workflow_run_started",
          entityType: "intent",
          entityId: "intent-1",
          actorUserId: "user-1",
          createdAt: new Date("2026-03-24T00:00:01.000Z"),
          metadata: {
            workflowRunId: "social:intent:intent-1",
            traceId: "trace-1",
            domain: "social",
            userId: "user-1",
            summary: "Intent accepted into the agentic workflow runtime.",
          },
        },
      ])
      .mockResolvedValueOnce([
        {
          id: "trace-audit-1",
          action: "intent.pipeline.completed",
          entityType: "intent",
          entityId: "intent-1",
          createdAt: new Date("2026-03-24T00:00:04.000Z"),
          metadata: {
            traceId: "trace-1",
            status: "completed",
            summary: "Intent pipeline completed.",
          },
        },
      ]);
    const prisma = {
      auditLog: {
        findMany,
      },
    };
    const service = new AgentWorkflowRuntimeService(prisma as any);

    const details = await service.getRunDetails("social:intent:intent-1");

    expect(findMany).toHaveBeenCalledTimes(2);
    expect(details?.run.workflowRunId).toBe("social:intent:intent-1");
    expect(details?.trace.eventCount).toBe(1);
    expect(details?.trace.failedEventCount).toBe(0);
    expect(details?.trace.events[0]).toEqual(
      expect.objectContaining({
        id: "trace-audit-1",
        action: "intent.pipeline.completed",
      }),
    );
    expect(details?.run.health).toBe("healthy");
    expect(details?.run.stageStatusCounts.completed).toBe(1);
  });

  it("marks runs with blocked or failed checkpoints as critical", async () => {
    const prisma = {
      auditLog: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "audit-2",
            action: "agent.workflow_stage_checkpoint",
            entityType: "intent",
            entityId: "intent-2",
            actorUserId: null,
            createdAt: new Date("2026-03-24T00:00:02.000Z"),
            metadata: {
              workflowRunId: "social:intent:intent-2",
              traceId: "trace-2",
              stage: "fanout",
              status: "failed",
              summary: "Fanout execution failed.",
            },
          },
          {
            id: "audit-1",
            action: "agent.workflow_run_started",
            entityType: "intent",
            entityId: "intent-2",
            actorUserId: "user-2",
            createdAt: new Date("2026-03-24T00:00:01.000Z"),
            metadata: {
              workflowRunId: "social:intent:intent-2",
              traceId: "trace-2",
              domain: "social",
              userId: "user-2",
              summary: "Intent run started.",
            },
          },
        ]),
      },
    };
    const service = new AgentWorkflowRuntimeService(prisma as any);

    const runs = await service.listRecentRuns(5);

    expect(runs).toHaveLength(1);
    expect(runs[0]?.replayability).toBe("partial");
    expect(runs[0]?.health).toBe("critical");
    expect(runs[0]?.stageStatusCounts.failed).toBe(1);
  });
});
