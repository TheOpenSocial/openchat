import { OnWorkerEvent, Processor, WorkerHost } from "@nestjs/bullmq";
import { Injectable, Logger } from "@nestjs/common";
import { Job } from "bullmq";
import { IntentsService } from "../../intents/intents.service.js";
import { recordQueueJobSkipped } from "../../common/ops-metrics.js";
import { runInTraceSpan } from "../../common/tracing.js";
import { DeadLetterService } from "../dead-letter.service.js";
import { extractJobTraceId, logJobProcessing } from "../job-logging.js";
import { validateQueuePayload } from "../queue-validation.js";

@Injectable()
@Processor("intent-processing")
export class IntentProcessingConsumer extends WorkerHost {
  private readonly logger = new Logger(IntentProcessingConsumer.name);

  constructor(
    private readonly intentsService: IntentsService,
    private readonly deadLetterService: DeadLetterService,
  ) {
    super();
  }

  async process(
    job: Job<unknown, unknown, string>,
  ): Promise<{ acknowledged: boolean }> {
    const traceId = extractJobTraceId(job.data) ?? undefined;
    return runInTraceSpan(
      `queue.intent-processing.${job.name}`,
      {
        traceId,
        attributes: {
          "queue.name": "intent-processing",
          "queue.job.name": job.name,
          "queue.job.id": job.id ? String(job.id) : undefined,
        },
      },
      async () => {
        logJobProcessing(this.logger, "intent-processing", job);

        if (job.name !== "IntentCreated") {
          recordQueueJobSkipped("intent-processing");
          this.logger.warn(
            JSON.stringify({
              event: "queue.job.skipped",
              queue: "intent-processing",
              jobId: job.id,
              jobName: job.name,
              reason: "unsupported_job_name",
            }),
          );
          return { acknowledged: true };
        }

        const payload = validateQueuePayload("IntentCreated", job.data);
        const result = await this.intentsService.processIntentPipeline(
          payload.payload.intentId,
          payload.traceId,
          payload.payload.agentThreadId ?? undefined,
        );
        this.logger.log(
          JSON.stringify({
            event: "queue.job.completed",
            queue: "intent-processing",
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
      "intent-processing",
      job,
      error,
    );
  }

  @OnWorkerEvent("stalled")
  async onStalled(jobId: string, prev: string) {
    await this.deadLetterService.captureStalledJob(
      "intent-processing",
      jobId,
      prev,
    );
  }
}
