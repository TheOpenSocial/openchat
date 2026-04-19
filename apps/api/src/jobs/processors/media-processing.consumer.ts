import { OnWorkerEvent, Processor, WorkerHost } from "@nestjs/bullmq";
import { Injectable, Logger } from "@nestjs/common";
import { Job } from "bullmq";
import { runInTraceSpan } from "../../common/tracing.js";
import { ProfilesService } from "../../profiles/profiles.service.js";
import { VideoTranscriptsService } from "../../video-transcripts/video-transcripts.service.js";
import { DeadLetterService } from "../dead-letter.service.js";
import { extractJobTraceId, logJobProcessing } from "../job-logging.js";
import { validateQueuePayload } from "../queue-validation.js";

@Injectable()
@Processor("media-processing")
export class MediaProcessingConsumer extends WorkerHost {
  private readonly logger = new Logger(MediaProcessingConsumer.name);

  constructor(
    private readonly profilesService: ProfilesService,
    private readonly videoTranscriptsService: VideoTranscriptsService,
    private readonly deadLetterService: DeadLetterService,
  ) {
    super();
  }

  async process(job: Job<unknown, unknown, string>): Promise<unknown> {
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

        if (job.name === "PublicVideoTranscriptRequested") {
          const payload = job.data as {
            payload?: {
              jobId: string;
              storageKey:
                | "video/mp4"
                | "video/quicktime"
                | "video/webm"
                | string;
              mimeType: "video/mp4" | "video/quicktime" | "video/webm";
              byteSize: number;
            };
          };
          if (
            !payload?.payload?.jobId ||
            !payload.payload.storageKey ||
            !payload.payload.mimeType ||
            !Number.isFinite(payload.payload.byteSize)
          ) {
            throw new Error("invalid PublicVideoTranscriptRequested payload");
          }
          return this.videoTranscriptsService.processVideoTranscript(
            payload.payload,
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
