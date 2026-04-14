import { OnWorkerEvent, Processor, WorkerHost } from "@nestjs/bullmq";
import { Injectable, Logger } from "@nestjs/common";
import { Job } from "bullmq";
import { z } from "zod";
import { queueEnvelopeSchema } from "@opensocial/types";
import { runInTraceSpan } from "../../common/tracing.js";
import { DeadLetterService } from "../dead-letter.service.js";
import { extractJobTraceId, logJobProcessing } from "../job-logging.js";
import { ProtocolWebhookDeliveryRunnerService } from "../../protocol/protocol-webhook-delivery-runner.service.js";

const PROTOCOL_WEBHOOK_DELIVERIES_QUEUE = "protocol-webhook-deliveries";

const runProtocolWebhookDeliveriesJobSchema = queueEnvelopeSchema.extend({
  type: z.literal("RunProtocolWebhookDeliveries"),
  payload: z
    .object({
      appId: z.string().uuid().optional(),
      limit: z.number().int().min(1).max(500).optional(),
      now: z.string().datetime().optional(),
      requestTimeoutMs: z.number().int().min(100).max(120_000).optional(),
      maxAttempts: z.number().int().min(1).max(50).optional(),
      baseBackoffMs: z.number().int().min(0).max(60_000).optional(),
      maxBackoffMs: z.number().int().min(0).max(600_000).optional(),
    })
    .strict(),
});

@Injectable()
@Processor(PROTOCOL_WEBHOOK_DELIVERIES_QUEUE)
export class ProtocolWebhookDeliveryConsumer extends WorkerHost {
  private readonly logger = new Logger(ProtocolWebhookDeliveryConsumer.name);

  constructor(
    private readonly deliveryRunner: ProtocolWebhookDeliveryRunnerService,
    private readonly deadLetterService: DeadLetterService,
  ) {
    super();
  }

  async process(job: Job<unknown, unknown, string>) {
    const traceId = extractJobTraceId(job.data) ?? undefined;
    return runInTraceSpan(
      `queue.${PROTOCOL_WEBHOOK_DELIVERIES_QUEUE}.${job.name}`,
      {
        traceId,
        attributes: {
          "queue.name": PROTOCOL_WEBHOOK_DELIVERIES_QUEUE,
          "queue.job.name": job.name,
          "queue.job.id": job.id ? String(job.id) : undefined,
        },
      },
      async () => {
        logJobProcessing(this.logger, PROTOCOL_WEBHOOK_DELIVERIES_QUEUE, job);

        if (job.name !== "RunProtocolWebhookDeliveries") {
          this.logger.warn(
            JSON.stringify({
              event: "queue.job.skipped",
              queue: PROTOCOL_WEBHOOK_DELIVERIES_QUEUE,
              jobId: job.id,
              jobName: job.name,
              reason: "unsupported_job_name",
            }),
          );
          return { acknowledged: true, skipped: true };
        }

        const envelope = runProtocolWebhookDeliveriesJobSchema.parse(job.data);
        const result = await this.deliveryRunner.runDueDeliveries({
          appId: envelope.payload.appId,
          limit: envelope.payload.limit,
          now: envelope.payload.now ? new Date(envelope.payload.now) : undefined,
          requestTimeoutMs: envelope.payload.requestTimeoutMs,
          maxAttempts: envelope.payload.maxAttempts,
          baseBackoffMs: envelope.payload.baseBackoffMs,
          maxBackoffMs: envelope.payload.maxBackoffMs,
        });

        this.logger.log(
          JSON.stringify({
            event: "queue.job.completed",
            queue: PROTOCOL_WEBHOOK_DELIVERIES_QUEUE,
            jobId: job.id,
            jobName: job.name,
            traceId: envelope.traceId,
            result,
          }),
        );

        return { acknowledged: true, ...result };
      },
    );
  }

  @OnWorkerEvent("failed")
  async onFailed(job: Job | undefined, error: Error) {
    if (!job) {
      return;
    }
    await this.deadLetterService.captureFailedJob(
      PROTOCOL_WEBHOOK_DELIVERIES_QUEUE,
      job,
      error,
    );
  }

  @OnWorkerEvent("stalled")
  async onStalled(jobId: string, prev: string) {
    await this.deadLetterService.captureStalledJob(
      PROTOCOL_WEBHOOK_DELIVERIES_QUEUE,
      jobId,
      prev,
    );
  }
}
