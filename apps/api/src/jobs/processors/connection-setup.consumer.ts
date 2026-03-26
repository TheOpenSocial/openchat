import { OnWorkerEvent, Processor, WorkerHost } from "@nestjs/bullmq";
import { Injectable, Logger } from "@nestjs/common";
import { Job } from "bullmq";
import { recordQueueJobSkipped } from "../../common/ops-metrics.js";
import { runInTraceSpan } from "../../common/tracing.js";
import { ConnectionSetupService } from "../../connections/connection-setup.service.js";
import { DeadLetterService } from "../dead-letter.service.js";
import { extractJobTraceId, logJobProcessing } from "../job-logging.js";
import { validateQueuePayload } from "../queue-validation.js";

@Injectable()
@Processor("connection-setup")
export class ConnectionSetupConsumer extends WorkerHost {
  private readonly logger = new Logger(ConnectionSetupConsumer.name);

  constructor(
    private readonly connectionSetupService: ConnectionSetupService,
    private readonly deadLetterService: DeadLetterService,
  ) {
    super();
  }

  async process(
    job: Job<unknown, unknown, string>,
  ): Promise<{ acknowledged: boolean }> {
    const traceId = extractJobTraceId(job.data) ?? undefined;
    return runInTraceSpan(
      `queue.connection-setup.${job.name}`,
      {
        traceId,
        attributes: {
          "queue.name": "connection-setup",
          "queue.job.name": job.name,
          "queue.job.id": job.id ? String(job.id) : undefined,
        },
      },
      async () => {
        logJobProcessing(this.logger, "connection-setup", job);

        if (job.name !== "RequestAccepted") {
          recordQueueJobSkipped("connection-setup");
          this.logger.warn(
            JSON.stringify({
              event: "queue.job.skipped",
              queue: "connection-setup",
              jobId: job.id,
              jobName: job.name,
              reason: "unsupported_job_name",
            }),
          );
          return { acknowledged: true };
        }

        const payload = validateQueuePayload("RequestAccepted", job.data);
        const result =
          await this.connectionSetupService.setupFromAcceptedRequest(
            payload.payload.requestId,
            payload.traceId,
          );
        this.logger.log(
          JSON.stringify({
            event: "queue.job.completed",
            queue: "connection-setup",
            jobId: job.id,
            jobName: job.name,
            traceId: payload.traceId,
            result,
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
    await this.deadLetterService.captureFailedJob(
      "connection-setup",
      job,
      error,
    );
  }

  @OnWorkerEvent("stalled")
  async onStalled(jobId: string, prev: string) {
    await this.deadLetterService.captureStalledJob(
      "connection-setup",
      jobId,
      prev,
    );
  }
}
