import type { Logger } from "@nestjs/common";
import type { Job } from "bullmq";
import { recordQueueJobProcessing } from "../common/ops-metrics.js";
import { redactForLogs } from "../common/redaction.js";

function readTraceId(input: unknown): string | null {
  if (!input || typeof input !== "object") {
    return null;
  }
  const value = (input as Record<string, unknown>).traceId;
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function extractJobTraceId(jobData: unknown) {
  const topLevel = readTraceId(jobData);
  if (topLevel) {
    return topLevel;
  }

  if (!jobData || typeof jobData !== "object") {
    return null;
  }
  const payload = (jobData as Record<string, unknown>).payload;
  return readTraceId(payload);
}

export function logJobProcessing(
  logger: Logger,
  queue: string,
  job: Job<unknown, unknown, string>,
) {
  const lagMs =
    typeof job.timestamp === "number"
      ? Math.max(0, Date.now() - job.timestamp)
      : 0;
  recordQueueJobProcessing(queue, lagMs);
  logger.log(
    JSON.stringify({
      event: "queue.job.processing",
      queue,
      jobId: job.id,
      jobName: job.name,
      traceId: extractJobTraceId(job.data),
      lagMs,
      attemptsMade: job.attemptsMade,
      data: redactForLogs(job.data),
    }),
  );
}
