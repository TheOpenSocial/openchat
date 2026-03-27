import { OnWorkerEvent, Processor, WorkerHost } from "@nestjs/bullmq";
import { Injectable, Logger } from "@nestjs/common";
import { Job } from "bullmq";
import { runInTraceSpan } from "../../common/tracing.js";
import { ModerationService } from "../../moderation/moderation.service.js";
import { DeadLetterService } from "../dead-letter.service.js";
import { extractJobTraceId, logJobProcessing } from "../job-logging.js";

@Injectable()
@Processor("cleanup")
export class CleanupConsumer extends WorkerHost {
  private readonly logger = new Logger(CleanupConsumer.name);

  constructor(
    private readonly moderationService: ModerationService,
    private readonly deadLetterService: DeadLetterService,
  ) {
    super();
  }

  async process(job: Job<unknown, unknown, string>) {
    const traceId = extractJobTraceId(job.data) ?? undefined;
    return runInTraceSpan(
      `queue.cleanup.${job.name}`,
      {
        traceId,
        attributes: {
          "queue.name": "cleanup",
          "queue.job.name": job.name,
          "queue.job.id": job.id ? String(job.id) : undefined,
        },
      },
      async () => {
        logJobProcessing(this.logger, "cleanup", job);

        if (job.name === "ModerationDecisionRetentionCleanup") {
          const retentionDays =
            typeof job.data === "object" &&
            job.data &&
            "retentionDays" in job.data &&
            typeof (job.data as { retentionDays?: unknown }).retentionDays ===
              "number"
              ? (job.data as { retentionDays: number }).retentionDays
              : undefined;
          const result = await this.moderationService.cleanupExpiredDecisions({
            retentionDays,
          });
          return { acknowledged: true, ...result };
        }

        return { acknowledged: true, skipped: true };
      },
    );
  }

  @OnWorkerEvent("failed")
  async onFailed(job: Job | undefined, error: Error) {
    if (!job) {
      return;
    }
    await this.deadLetterService.captureFailedJob("cleanup", job, error);
  }

  @OnWorkerEvent("stalled")
  async onStalled(jobId: string, prev: string) {
    await this.deadLetterService.captureStalledJob("cleanup", jobId, prev);
  }
}
