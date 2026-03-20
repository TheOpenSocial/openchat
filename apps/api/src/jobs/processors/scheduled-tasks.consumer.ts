import { OnWorkerEvent, Processor, WorkerHost } from "@nestjs/bullmq";
import { Injectable, Logger } from "@nestjs/common";
import { Job } from "bullmq";
import { runInTraceSpan } from "../../common/tracing.js";
import { ScheduledTasksService } from "../../scheduled-tasks/scheduled-tasks.service.js";
import { DeadLetterService } from "../dead-letter.service.js";
import { extractJobTraceId, logJobProcessing } from "../job-logging.js";
import { validateQueuePayload } from "../queue-validation.js";

@Injectable()
@Processor("scheduled-tasks")
export class ScheduledTasksConsumer extends WorkerHost {
  private readonly logger = new Logger(ScheduledTasksConsumer.name);

  constructor(
    private readonly scheduledTasksService: ScheduledTasksService,
    private readonly deadLetterService: DeadLetterService,
  ) {
    super();
  }

  async process(job: Job<unknown, unknown, string>) {
    const traceId = extractJobTraceId(job.data) ?? undefined;
    return runInTraceSpan(
      `queue.scheduled-tasks.${job.name}`,
      {
        traceId,
        attributes: {
          "queue.name": "scheduled-tasks",
          "queue.job.name": job.name,
          "queue.job.id": job.id ? String(job.id) : undefined,
        },
      },
      async () => {
        logJobProcessing(this.logger, "scheduled-tasks", job);

        if (job.name === "ScheduledTaskDispatch") {
          const envelope = validateQueuePayload(
            "ScheduledTaskDispatch",
            job.data,
          );
          const dispatched = await this.scheduledTasksService.dispatchDueTasks(
            envelope.payload.source,
          );
          return { acknowledged: true, ...dispatched };
        }

        if (job.name === "ScheduledTaskRun") {
          const envelope = validateQueuePayload("ScheduledTaskRun", job.data);
          const result = await this.scheduledTasksService.runQueuedTask({
            scheduledTaskId: envelope.payload.scheduledTaskId,
            scheduledTaskRunId: envelope.payload.scheduledTaskRunId,
            trigger: envelope.payload.trigger,
          });
          return { acknowledged: true, ...result };
        }

        this.logger.warn(
          JSON.stringify({
            event: "queue.job.skipped",
            queue: "scheduled-tasks",
            jobId: job.id,
            jobName: job.name,
            reason: "unsupported_job_name",
          }),
        );
        return { acknowledged: true, skipped: true };
      },
    );
  }

  @OnWorkerEvent("failed")
  async onFailed(job: Job | undefined, error: Error) {
    if (!job) {
      return;
    }
    await this.deadLetterService.captureFailedJob(
      "scheduled-tasks",
      job,
      error,
    );
  }

  @OnWorkerEvent("stalled")
  async onStalled(jobId: string, prev: string) {
    await this.deadLetterService.captureStalledJob(
      "scheduled-tasks",
      jobId,
      prev,
    );
  }
}
