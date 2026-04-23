import { OnWorkerEvent, Processor, WorkerHost } from "@nestjs/bullmq";
import { Injectable, Logger } from "@nestjs/common";
import { Job } from "bullmq";
import { ChatsService } from "../../chats/chats.service.js";
import { runInTraceSpan } from "../../common/tracing.js";
import { ModerationService } from "../../moderation/moderation.service.js";
import { DeadLetterService } from "../dead-letter.service.js";
import { extractJobTraceId, logJobProcessing } from "../job-logging.js";
import { validateQueuePayload } from "../queue-validation.js";

@Injectable()
@Processor("moderation")
export class ModerationConsumer extends WorkerHost {
  private readonly logger = new Logger(ModerationConsumer.name);

  constructor(
    private readonly chatsService: ChatsService,
    private readonly moderationService: ModerationService,
    private readonly deadLetterService: DeadLetterService,
  ) {
    super();
  }

  async process(
    job: Job<unknown, unknown, string>,
  ): Promise<{ acknowledged: boolean }> {
    const traceId = extractJobTraceId(job.data) ?? undefined;
    return runInTraceSpan(
      `queue.moderation.${job.name}`,
      {
        traceId,
        attributes: {
          "queue.name": "moderation",
          "queue.job.name": job.name,
          "queue.job.id": job.id ? String(job.id) : undefined,
        },
      },
      async () => {
        logJobProcessing(this.logger, "moderation", job);

        if (job.name === "ChatMessageModerationRequested") {
          const payload = validateQueuePayload(
            "ChatMessageModerationRequested",
            job.data,
          );
          await this.chatsService.processQueuedMessageModeration(
            payload.payload.messageId,
            payload.payload.chatId,
            payload.payload.senderUserId,
            payload.payload.body,
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
    await this.deadLetterService.captureFailedJob("moderation", job, error);
  }

  @OnWorkerEvent("stalled")
  async onStalled(jobId: string, prev: string) {
    await this.deadLetterService.captureStalledJob("moderation", jobId, prev);
  }
}
