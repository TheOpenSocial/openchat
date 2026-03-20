import { OnWorkerEvent, Processor, WorkerHost } from "@nestjs/bullmq";
import { Injectable, Logger } from "@nestjs/common";
import { Job } from "bullmq";
import { runInTraceSpan } from "../../common/tracing.js";
import { ProfilesService } from "../../profiles/profiles.service.js";
import { DeadLetterService } from "../dead-letter.service.js";
import { extractJobTraceId, logJobProcessing } from "../job-logging.js";
import { validateQueuePayload } from "../queue-validation.js";

@Injectable()
@Processor("media-processing")
export class MediaProcessingConsumer extends WorkerHost {
  private readonly logger = new Logger(MediaProcessingConsumer.name);

  constructor(
    private readonly profilesService: ProfilesService,
    private readonly deadLetterService: DeadLetterService,
  ) {
    super();
  }

  async process(
    job: Job<unknown, unknown, string>,
  ): Promise<{ acknowledged: boolean }> {
    const traceId = extractJobTraceId(job.data) ?? undefined;
    return runInTraceSpan(
      `queue.media-processing.${job.name}`,
      {
        traceId,
        attributes: {
          "queue.name": "media-processing",
          "queue.job.name": job.name,
          "queue.job.id": job.id ? String(job.id) : undefined,
        },
      },
      async () => {
        logJobProcessing(this.logger, "media-processing", job);

        if (job.name === "ProfilePhotoUploaded") {
          const payload = validateQueuePayload(
            "ProfilePhotoUploaded",
            job.data,
          );
          await this.profilesService.processProfilePhoto(
            payload.payload.imageId,
          );
        }

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
      "media-processing",
      job,
      error,
    );
  }

  @OnWorkerEvent("stalled")
  async onStalled(jobId: string, prev: string) {
    await this.deadLetterService.captureStalledJob(
      "media-processing",
      jobId,
      prev,
    );
  }
}
