import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Injectable, Logger } from "@nestjs/common";
import { Job } from "bullmq";
import { runInTraceSpan } from "../../common/tracing.js";
import { extractJobTraceId, logJobProcessing } from "../job-logging.js";
import { OutboxRelayService } from "../outbox-relay.service.js";

@Injectable()
@Processor("admin-maintenance")
export class AdminMaintenanceConsumer extends WorkerHost {
  private readonly logger = new Logger(AdminMaintenanceConsumer.name);

  constructor(private readonly outboxRelayService: OutboxRelayService) {
    super();
  }

  async process(
    job: Job<unknown, unknown, string>,
  ): Promise<{ acknowledged: boolean }> {
    const traceId = extractJobTraceId(job.data) ?? undefined;
    return runInTraceSpan(
      `queue.admin-maintenance.${job.name}`,
      {
        traceId,
        attributes: {
          "queue.name": "admin-maintenance",
          "queue.job.name": job.name,
          "queue.job.id": job.id ? String(job.id) : undefined,
        },
      },
      async () => {
        logJobProcessing(this.logger, "admin-maintenance", job);

        if (job.name === "RelayOutboxEvents") {
          const limit =
            typeof job.data === "object" &&
            job.data &&
            "limit" in job.data &&
            typeof (job.data as { limit?: unknown }).limit === "number"
              ? (job.data as { limit: number }).limit
              : 100;
          await this.outboxRelayService.relayPendingEvents(limit);
        }

        return { acknowledged: true };
      },
    );
  }
}
