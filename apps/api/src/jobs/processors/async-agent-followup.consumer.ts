import { OnWorkerEvent, Processor, WorkerHost } from "@nestjs/bullmq";
import { Injectable, Logger } from "@nestjs/common";
import { NotificationType } from "@opensocial/types";
import { Job } from "bullmq";
import { AgentService } from "../../agent/agent.service.js";
import { recordQueueJobSkipped } from "../../common/ops-metrics.js";
import { runInTraceSpan } from "../../common/tracing.js";
import { PrismaService } from "../../database/prisma.service.js";
import { ExecutionReconciliationService } from "../../execution-reconciliation/execution-reconciliation.service.js";
import { NotificationsService } from "../../notifications/notifications.service.js";
import { DeadLetterService } from "../dead-letter.service.js";
import { extractJobTraceId, logJobProcessing } from "../job-logging.js";
import { validateQueuePayload } from "../queue-validation.js";

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

        const threadId =
          payload.agentThreadId ??
          (await this.resolveLatestThreadIdForUser(intent.userId));

        if (threadId) {
          await this.agentService.createAgentMessage(threadId, message);
        }

        await this.notificationsService.createInAppNotification(
          intent.userId,
          payload.notificationType ?? NotificationType.AGENT_UPDATE,
          message,
        );
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
            threadMessageInserted: Boolean(threadId),
            notificationType:
              payload.notificationType ?? NotificationType.AGENT_UPDATE,
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
    if (template === "no_match_yet") {
      return "Nobody matched yet; want me to widen filters?";
    }

    if (template === "progress_update") {
      return `I found progress for your request: ${counts.accepted} accepted and ${counts.pending} still pending.`;
    }

    if (counts.accepted > 0 && counts.pending > 0) {
      return `Remember you asked earlier about "${rawText.slice(0, 48)}": ${counts.accepted} accepted and ${counts.pending} are still pending.`;
    }

    if (counts.accepted > 0 && counts.pending === 0) {
      return `Remember you asked earlier: ${counts.accepted} accepted so far. I can send another wave if you want.`;
    }

    return `Remember you asked earlier: still waiting on ${counts.pending} pending invite${counts.pending === 1 ? "" : "s"}.`;
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
}
