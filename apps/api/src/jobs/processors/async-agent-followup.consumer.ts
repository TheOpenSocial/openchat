import { OnWorkerEvent, Processor, WorkerHost } from "@nestjs/bullmq";
import { Injectable, Logger, Optional } from "@nestjs/common";
import { NotificationType } from "@opensocial/types";
import { Job } from "bullmq";
import { AgentService } from "../../agent/agent.service.js";
import { recordQueueJobSkipped } from "../../common/ops-metrics.js";
import { runInTraceSpan } from "../../common/tracing.js";
import { AgentWorkflowRuntimeService } from "../../database/agent-workflow-runtime.service.js";
import { PrismaService } from "../../database/prisma.service.js";
import { ExecutionReconciliationService } from "../../execution-reconciliation/execution-reconciliation.service.js";
import { NotificationsService } from "../../notifications/notifications.service.js";
import { DeadLetterService } from "../dead-letter.service.js";
import { extractJobTraceId, logJobProcessing } from "../job-logging.js";
import { validateQueuePayload } from "../queue-validation.js";

const FOLLOWUP_NOTIFICATION_REPLAY_DEDUPE_WINDOW_MS = 30 * 60_000;

@Injectable()
@Processor("notification")
export class AsyncAgentFollowupConsumer extends WorkerHost {
  private readonly logger = new Logger(AsyncAgentFollowupConsumer.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly agentService: AgentService,
    private readonly notificationsService: NotificationsService,
    private readonly executionReconciliationService: ExecutionReconciliationService,
    private readonly deadLetterService: DeadLetterService,
    @Optional()
    private readonly workflowRuntimeService?: AgentWorkflowRuntimeService,
  ) {
    super();
  }

  async process(
    job: Job<unknown, unknown, string>,
  ): Promise<{ acknowledged: boolean; skipped?: boolean }> {
    const traceId = extractJobTraceId(job.data) ?? undefined;
    return runInTraceSpan(
      `queue.notification.${job.name}`,
      {
        traceId,
        attributes: {
          "queue.name": "notification",
          "queue.job.name": job.name,
          "queue.job.id": job.id ? String(job.id) : undefined,
        },
      },
      async () => {
        logJobProcessing(this.logger, "notification", job);

        if (job.name === "NotificationDispatch") {
          const payloadEnvelope = validateQueuePayload(
            "NotificationDispatch",
            job.data,
          );
          const payload = payloadEnvelope.payload;
          const notification = await this.prisma.notification.findUnique({
            where: { id: payload.notificationId },
            select: {
              id: true,
              channel: true,
              type: true,
              recipientUserId: true,
            },
          });
          if (!notification || notification.channel !== "digest") {
            recordQueueJobSkipped("notification");
            this.logger.log(
              JSON.stringify({
                event: "queue.job.completed",
                queue: "notification",
                jobId: job.id,
                jobName: job.name,
                traceId: payloadEnvelope.traceId,
                skipped: true,
                reason: "notification_not_digest",
                notificationId: payload.notificationId,
              }),
            );
            return { acknowledged: true, skipped: true };
          }

          if (this.prisma.auditLog?.create) {
            await this.prisma.auditLog.create({
              data: {
                actorType: "system",
                action: "notification.email_digest_dispatched",
                entityType: "notification",
                entityId: notification.id,
                metadata: {
                  recipientUserId: notification.recipientUserId,
                  notificationType: notification.type,
                  dispatchedAt: new Date().toISOString(),
                },
              },
            });
          }
          this.logger.log(
            JSON.stringify({
              event: "queue.job.completed",
              queue: "notification",
              jobId: job.id,
              jobName: job.name,
              traceId: payloadEnvelope.traceId,
              notificationId: notification.id,
              recipientUserId: notification.recipientUserId,
              channel: notification.channel,
            }),
          );
          return { acknowledged: true };
        }

        if (job.name !== "AsyncAgentFollowup") {
          recordQueueJobSkipped("notification");
          this.logger.warn(
            JSON.stringify({
              event: "queue.job.skipped",
              queue: "notification",
              jobId: job.id,
              jobName: job.name,
              reason: "unsupported_job_name",
            }),
          );
          return { acknowledged: true };
        }

        const payloadEnvelope = validateQueuePayload(
          "AsyncAgentFollowup",
          job.data,
        );
        const payload = payloadEnvelope.payload;
        const intent = await this.prisma.intent.findUnique({
          where: { id: payload.intentId },
          select: {
            id: true,
            userId: true,
            rawText: true,
            status: true,
          },
        });

        if (
          !intent ||
          ["cancelled", "expired", "connected"].includes(intent.status)
        ) {
          if (intent) {
            await this.executionReconciliationService.recordIntentTerminalState(
              {
                userId: intent.userId,
                intentId: intent.id,
                status: intent.status as "cancelled" | "expired" | "connected",
                source: "jobs.async_agent_followup",
              },
            );
          }
          recordQueueJobSkipped("notification");
          this.logger.log(
            JSON.stringify({
              event: "queue.job.completed",
              queue: "notification",
              jobId: job.id,
              jobName: job.name,
              traceId: payloadEnvelope.traceId,
              skipped: true,
              reason: "intent_not_processable",
              intentId: payload.intentId,
              status: intent?.status ?? null,
            }),
          );
          return { acknowledged: true, skipped: true };
        }

        const requests = await this.prisma.intentRequest.findMany({
          where: {
            intentId: intent.id,
          },
          select: {
            status: true,
          },
        });

        const counts = requests.reduce(
          (acc, request) => {
            acc[request.status] += 1;
            return acc;
          },
          {
            pending: 0,
            accepted: 0,
            rejected: 0,
            expired: 0,
            cancelled: 0,
          },
        );

        const message =
          payload.message ??
          this.renderFollowupMessage(payload.template, counts, intent.rawText);
        const workflowRunId =
          this.workflowRuntimeService?.buildWorkflowRunId({
            domain: "social",
            entityType: "intent",
            entityId: intent.id,
          }) ?? `social:intent:${intent.id}`;

        const threadId =
          payload.agentThreadId ??
          (await this.resolveLatestThreadIdForUser(intent.userId));
        let threadMessageInserted = false;

        if (threadId) {
          const existingThreadMessage =
            await this.findRecentDuplicateThreadMessage(threadId, message);
          const threadMessage =
            existingThreadMessage ??
            (await this.agentService.createAgentMessage(threadId, message));
          threadMessageInserted = existingThreadMessage == null;
          await this.workflowRuntimeService?.linkSideEffect({
            workflowRunId,
            traceId: payloadEnvelope.traceId,
            relation: "followup_thread_message",
            entityType: "agent_message",
            entityId: threadMessage.id,
            userId: intent.userId,
            summary: threadMessageInserted
              ? "Persisted async follow-up into the agent thread."
              : "Reused a recent async follow-up already present in the agent thread.",
            metadata: {
              template: payload.template,
              threadId,
              deduped: !threadMessageInserted,
            },
          });
        }

        const notificationType =
          payload.notificationType ?? NotificationType.AGENT_UPDATE;
        const existingNotification = await this.findRecentFollowupNotification({
          workflowRunId,
          userId: intent.userId,
          template: payload.template,
          notificationType,
        });
        const notification =
          existingNotification ??
          (await this.notificationsService.createInAppNotification(
            intent.userId,
            notificationType,
            message,
          ));
        const notificationDeduped = existingNotification != null;
        await this.workflowRuntimeService?.linkSideEffect({
          workflowRunId,
          traceId: payloadEnvelope.traceId,
          relation: "followup_notification",
          entityType: "notification",
          entityId: notification.id,
          userId: intent.userId,
          summary: notificationDeduped
            ? "Reused a recent async follow-up notification already persisted for this workflow."
            : "Persisted async follow-up notification.",
          metadata: {
            template: payload.template,
            notificationType,
            deduped: notificationDeduped,
          },
        });
        await this.workflowRuntimeService?.checkpoint({
          workflowRunId,
          traceId: payloadEnvelope.traceId,
          stage: "followup_delivery",
          status: "completed",
          entityType: "intent",
          entityId: intent.id,
          userId: intent.userId,
          summary:
            "Async follow-up delivered to thread and notification surfaces.",
          metadata: {
            template: payload.template,
            threadId: threadId ?? null,
            notificationId: notification.id,
            notificationDeduped,
          },
        });
        this.logger.log(
          JSON.stringify({
            event: "queue.job.completed",
            queue: "notification",
            jobId: job.id,
            jobName: job.name,
            traceId: payloadEnvelope.traceId,
            intentId: intent.id,
            userId: intent.userId,
            threadId: threadId ?? null,
            threadMessageInserted,
            notificationType,
            notificationDeduped,
          }),
        );

        return { acknowledged: true };
      },
    );
  }

  @OnWorkerEvent("failed")
  async onFailed(job: Job | undefined, error: Error) {
    if (!job) {
      return;
    }
    await this.deadLetterService.captureFailedJob("notification", job, error);
  }

  @OnWorkerEvent("stalled")
  async onStalled(jobId: string, prev: string) {
    await this.deadLetterService.captureStalledJob("notification", jobId, prev);
  }

  private renderFollowupMessage(
    template: "pending_reminder" | "no_match_yet" | "progress_update",
    counts: {
      pending: number;
      accepted: number;
      rejected: number;
      expired: number;
      cancelled: number;
    },
    rawText: string,
  ) {
    const contextLabel = this.buildFollowupContextLabel(rawText);
    const nextActionHint = this.buildNextActionHint(rawText);

    if (template === "no_match_yet") {
      return `No strong match yet${contextLabel}. ${nextActionHint}`;
    }

    if (template === "progress_update") {
      if (counts.accepted > 0 && counts.pending > 0) {
        return `${counts.accepted} accepted and ${counts.pending} still active${contextLabel}. ${nextActionHint}`;
      }
      if (counts.accepted > 0) {
        return `${counts.accepted} accepted so far${contextLabel}. ${nextActionHint}`;
      }
      return `${counts.pending} still active${contextLabel}. ${nextActionHint}`;
    }

    if (counts.accepted > 0 && counts.pending > 0) {
      return `${counts.accepted} accepted and ${counts.pending} still active${contextLabel}. ${nextActionHint}`;
    }

    if (counts.accepted > 0 && counts.pending === 0) {
      return `${counts.accepted} accepted${contextLabel}. ${nextActionHint}`;
    }

    return `${counts.pending} pending invite${counts.pending === 1 ? "" : "s"}${contextLabel}. ${nextActionHint}`;
  }

  private buildFollowupContextLabel(rawText: string) {
    const normalized = rawText.trim().replace(/\s+/g, " ");
    if (!normalized) {
      return "";
    }
    const snippet = normalized.slice(0, 48);
    const suffix = normalized.length > snippet.length ? "..." : "";
    return ` on "${snippet}${suffix}"`;
  }

  private buildNextActionHint(rawText: string) {
    const lowered = rawText.toLowerCase();
    if (/(tonight|today|now|soon|this week)/.test(lowered)) {
      return "If pace matters, widen timing by a day or two.";
    }
    if (/(online|virtual|remote)/.test(lowered)) {
      return "Keep online and in-person both open so the pool can widen.";
    }
    if (/(1:1|one on one|one-on-one|small group|group)/.test(lowered)) {
      return "Try both 1:1 and a small group to widen the response pool.";
    }
    return "If it stays thin, I can widen one constraint at a time.";
  }

  private async resolveLatestThreadIdForUser(userId: string) {
    if (!this.prisma.agentThread?.findFirst) {
      return null;
    }
    const thread = await this.prisma.agentThread.findFirst({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    return thread?.id;
  }

  private async findRecentDuplicateThreadMessage(
    threadId: string,
    message: string,
  ) {
    if (!this.prisma.agentMessage?.findFirst) {
      return null;
    }
    return this.prisma.agentMessage.findFirst({
      where: {
        threadId,
        role: "agent",
        content: message,
        createdAt: {
          gte: new Date(Date.now() - 10 * 60_000),
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      select: {
        id: true,
      },
    });
  }

  private async findRecentFollowupNotification(input: {
    workflowRunId: string;
    userId: string;
    template: "pending_reminder" | "no_match_yet" | "progress_update";
    notificationType: NotificationType;
  }) {
    if (
      !this.prisma.auditLog?.findMany ||
      !this.prisma.notification?.findUnique
    ) {
      return null;
    }

    const sideEffectRows = await this.prisma.auditLog.findMany({
      where: {
        action: "agent.workflow_side_effect_linked",
        entityType: "notification",
        createdAt: {
          gte: new Date(
            Date.now() - FOLLOWUP_NOTIFICATION_REPLAY_DEDUPE_WINDOW_MS,
          ),
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 20,
      select: {
        entityId: true,
        metadata: true,
      },
    });

    for (const row of sideEffectRows) {
      const metadata = this.readMetadata(row.metadata);
      const workflowRunId = this.readString(metadata.workflowRunId);
      const relation = this.readString(metadata.relation);
      const template = this.readString(metadata.template);
      const notificationType = this.readString(metadata.notificationType);
      const notificationId = this.readString(row.entityId);

      if (!notificationId) {
        continue;
      }
      if (
        workflowRunId !== input.workflowRunId ||
        relation !== "followup_notification"
      ) {
        continue;
      }
      if (
        template !== input.template ||
        notificationType !== input.notificationType
      ) {
        continue;
      }

      const existing = await this.prisma.notification.findUnique({
        where: { id: notificationId },
        select: {
          id: true,
          recipientUserId: true,
          type: true,
        },
      });
      if (!existing) {
        continue;
      }
      if (
        existing.recipientUserId === input.userId &&
        existing.type === input.notificationType
      ) {
        return existing;
      }
    }

    return null;
  }

  private readMetadata(value: unknown) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return {};
    }
    return value as Record<string, unknown>;
  }

  private readString(value: unknown) {
    if (typeof value !== "string") {
      return null;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
}
