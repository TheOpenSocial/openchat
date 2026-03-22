import { Injectable, Logger } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../database/prisma.service.js";
import { PersonalizationService } from "../personalization/personalization.service.js";

@Injectable()
export class ExecutionReconciliationService {
  private readonly logger = new Logger(ExecutionReconciliationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly personalizationService: PersonalizationService,
  ) {}

  async recordRequestOutcome(input: {
    senderUserId: string;
    recipientUserId: string;
    requestId: string;
    intentId?: string | null;
    outcome: "cancelled" | "expired";
    source: string;
  }) {
    const senderSummary =
      input.outcome === "cancelled"
        ? "Cancelled a pending intro request before it turned into a live connection."
        : "A pending intro request expired before it turned into a live connection.";
    const recipientSummary =
      input.outcome === "cancelled"
        ? "A pending intro request from another user was cancelled before it became active."
        : "An incoming intro request expired before the connection moved forward.";

    await Promise.all([
      this.recordUserExecutionSummary(input.senderUserId, senderSummary, {
        source: input.source,
        outcome: `request_${input.outcome}`,
        perspective: "sender",
        requestId: input.requestId,
        intentId: input.intentId ?? null,
        counterpartUserId: input.recipientUserId,
      }),
      this.recordUserExecutionSummary(input.recipientUserId, recipientSummary, {
        source: input.source,
        outcome: `request_${input.outcome}`,
        perspective: "recipient",
        requestId: input.requestId,
        intentId: input.intentId ?? null,
        counterpartUserId: input.senderUserId,
      }),
      this.recordAudit(
        "agent.execution_reconciled",
        "intent_request",
        input.requestId,
        {
          source: input.source,
          outcome: `request_${input.outcome}`,
          senderUserId: input.senderUserId,
          recipientUserId: input.recipientUserId,
          intentId: input.intentId ?? null,
        },
      ),
    ]);
  }

  async recordIntentTerminalState(input: {
    userId: string;
    intentId: string;
    status: "cancelled" | "expired" | "connected";
    source: string;
  }) {
    const summaryByStatus: Record<typeof input.status, string> = {
      cancelled:
        "A social intent was cancelled, so future planning should not assume it is still active.",
      expired:
        "A social intent expired without reaching an outcome, so the agent should adapt rather than repeat the same plan unchanged.",
      connected:
        "A social intent is already resolved into a real connection, so extra follow-up on that same flow should be suppressed.",
    };

    await Promise.all([
      this.recordUserExecutionSummary(
        input.userId,
        summaryByStatus[input.status],
        {
          source: input.source,
          outcome: `intent_${input.status}`,
          intentId: input.intentId,
        },
      ),
      this.recordAudit("agent.execution_reconciled", "intent", input.intentId, {
        source: input.source,
        outcome: `intent_${input.status}`,
        userId: input.userId,
      }),
    ]);
  }

  async recordScheduledTaskSkipped(input: {
    userId: string;
    scheduledTaskId: string;
    scheduledTaskRunId: string;
    reason: string;
    source: string;
  }) {
    await Promise.all([
      this.recordUserExecutionSummary(
        input.userId,
        `A scheduled follow-up was skipped (${input.reason}), so the agent should not assume that reminder executed.`,
        {
          source: input.source,
          outcome: "scheduled_task_skipped",
          scheduledTaskId: input.scheduledTaskId,
          scheduledTaskRunId: input.scheduledTaskRunId,
          reason: input.reason,
        },
      ),
      this.recordAudit(
        "agent.execution_reconciled",
        "scheduled_task_run",
        input.scheduledTaskRunId,
        {
          source: input.source,
          outcome: "scheduled_task_skipped",
          userId: input.userId,
          scheduledTaskId: input.scheduledTaskId,
          reason: input.reason,
        },
      ),
    ]);
  }

  async recordGroupFormationStalled(input: {
    userId: string;
    intentId: string;
    participantCount: number;
    targetSize: number;
    backfillRequested: number;
    source: string;
  }) {
    await Promise.all([
      this.recordUserExecutionSummary(
        input.userId,
        `A group plan stalled at ${input.participantCount}/${input.targetSize} participants, so the agent should adjust rather than assume the group is still progressing.`,
        {
          source: input.source,
          outcome: "group_formation_stalled",
          intentId: input.intentId,
          participantCount: input.participantCount,
          targetSize: input.targetSize,
          backfillRequested: input.backfillRequested,
        },
      ),
      this.recordAudit("agent.execution_reconciled", "intent", input.intentId, {
        source: input.source,
        outcome: "group_formation_stalled",
        userId: input.userId,
        participantCount: input.participantCount,
        targetSize: input.targetSize,
        backfillRequested: input.backfillRequested,
      }),
    ]);
  }

  private async recordUserExecutionSummary(
    userId: string,
    summary: string,
    context: Record<string, unknown>,
  ) {
    try {
      await this.personalizationService.storeInteractionSummary(userId, {
        summary,
        safe: true,
        context,
      });
    } catch (error) {
      this.logger.warn(
        `failed to store reconciliation summary for ${userId}: ${String(error)}`,
      );
    }
  }

  private async recordAudit(
    action: string,
    entityType: string,
    entityId: string,
    metadata: Record<string, unknown>,
  ) {
    try {
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
    } catch (error) {
      this.logger.warn(
        `failed to persist reconciliation audit record: ${String(error)}`,
      );
    }
  }
}
