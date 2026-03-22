import { describe, expect, it, vi } from "vitest";
import { ExecutionReconciliationService } from "../src/execution-reconciliation/execution-reconciliation.service.js";

describe("ExecutionReconciliationService", () => {
  it("records request expiry outcomes for both participants", async () => {
    const prisma: any = {
      auditLog: {
        create: vi.fn().mockResolvedValue({ id: "audit-1" }),
      },
    };
    const personalizationService: any = {
      storeInteractionSummary: vi
        .fn()
        .mockResolvedValue({ documentId: "doc-1" }),
    };

    const service = new ExecutionReconciliationService(
      prisma,
      personalizationService,
    );

    await service.recordRequestOutcome({
      senderUserId: "user-1",
      recipientUserId: "user-2",
      requestId: "req-1",
      intentId: "intent-1",
      outcome: "expired",
      source: "test",
    });

    expect(
      personalizationService.storeInteractionSummary,
    ).toHaveBeenCalledTimes(2);
    expect(personalizationService.storeInteractionSummary).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({
        summary: expect.stringContaining("expired"),
        context: expect.objectContaining({
          outcome: "request_expired",
          perspective: "sender",
        }),
      }),
    );
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "agent.execution_reconciled",
          entityType: "intent_request",
          entityId: "req-1",
        }),
      }),
    );
  });

  it("records scheduled-task skips and stalled group formation", async () => {
    const prisma: any = {
      auditLog: {
        create: vi.fn().mockResolvedValue({ id: "audit-1" }),
      },
    };
    const personalizationService: any = {
      storeInteractionSummary: vi
        .fn()
        .mockResolvedValue({ documentId: "doc-1" }),
    };

    const service = new ExecutionReconciliationService(
      prisma,
      personalizationService,
    );

    await service.recordScheduledTaskSkipped({
      userId: "user-1",
      scheduledTaskId: "task-1",
      scheduledTaskRunId: "run-1",
      reason: "task_not_active",
      source: "test",
    });
    await service.recordGroupFormationStalled({
      userId: "user-1",
      intentId: "intent-2",
      participantCount: 2,
      targetSize: 4,
      backfillRequested: 0,
      source: "test",
    });

    expect(personalizationService.storeInteractionSummary).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({
        summary: expect.stringContaining("scheduled follow-up was skipped"),
        context: expect.objectContaining({
          outcome: "scheduled_task_skipped",
          scheduledTaskId: "task-1",
        }),
      }),
    );
    expect(personalizationService.storeInteractionSummary).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({
        summary: expect.stringContaining("group plan stalled"),
        context: expect.objectContaining({
          outcome: "group_formation_stalled",
          intentId: "intent-2",
        }),
      }),
    );
  });
});
