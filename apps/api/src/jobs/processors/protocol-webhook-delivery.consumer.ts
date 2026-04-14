import { OnWorkerEvent, Processor, WorkerHost } from "@nestjs/bullmq";
import { Injectable, Logger } from "@nestjs/common";
import { Job } from "bullmq";
import { runInTraceSpan } from "../../common/tracing.js";
import { ProtocolWebhookDeliveryRunnerService } from "../../protocol/protocol-webhook-delivery-runner.service.js";
import { DeadLetterService } from "../dead-letter.service.js";
import { extractJobTraceId, logJobProcessing } from "../job-logging.js";

type RunProtocolWebhookDeliveriesJob = {
  type?: string;
  traceId?: string;
  appId?: string;
  limit?: number;
};

@Injectable()
@Processor("protocol-webhooks")
export class ProtocolWebhookDeliveryConsumer extends WorkerHost {
  private readonly logger = new Logger(ProtocolWebhookDeliveryConsumer.name);

  constructor(
    private readonly runner: ProtocolWebhookDeliveryRunnerService,
    private readonly deadLetterService: DeadLetterService,
  ) {
    super();
  }

  async process(job: Job<unknown, unknown, string>) {
    const traceId = extractJobTraceId(job.data) ?? undefined;
    return runInTraceSpan(
      `queue.protocol-webhooks.${job.name}`,
      {
        traceId,
        attributes: {
          "queue.name": "protocol-webhooks",
          "queue.job.name": job.name,
          "queue.job.id": job.id ? String(job.id) : undefined,
        },
      },
      async () => {
        logJobProcessing(this.logger, "protocol-webhooks", job);

        if (job.name !== "RunProtocolWebhookDeliveries") {
          this.logger.warn(
            JSON.stringify({
              event: "queue.job.skipped",
              queue: "protocol-webhooks",
              jobId: job.id,
              jobName: job.name,
              reason: "unsupported_job_name",
            }),
          );
          return { acknowledged: true, skipped: true };
        }

        const input =
          job.data && typeof job.data === "object"
            ? (job.data as RunProtocolWebhookDeliveriesJob)
            : {};
        const limit =
          typeof input.limit === "number" && Number.isFinite(input.limit)
            ? input.limit
            : 25;

        const result = await this.runner.runDueDeliveries({
          appId:
            typeof input.appId === "string" && input.appId.trim().length > 0
              ? input.appId.trim()
              : undefined,
          limit,
        });

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
      "protocol-webhooks",
      job,
      error,
    );
  }

  @OnWorkerEvent("stalled")
  async onStalled(jobId: string, prev: string) {
    await this.deadLetterService.captureStalledJob(
      "protocol-webhooks",
      jobId,
      prev,
    );
  }
}
