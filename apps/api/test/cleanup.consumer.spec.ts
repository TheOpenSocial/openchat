import { describe, expect, it, vi } from "vitest";
import { CleanupConsumer } from "../src/jobs/processors/cleanup.consumer.js";

function createConsumer() {
  const moderationService: any = {
    cleanupExpiredDecisions: vi
      .fn()
      .mockResolvedValue({ deletedCount: 5, retentionDays: 180 }),
  };
  const deadLetterService: any = {
    captureFailedJob: vi.fn().mockResolvedValue(undefined),
    captureStalledJob: vi.fn().mockResolvedValue(undefined),
  };
  return {
    moderationService,
    deadLetterService,
    consumer: new CleanupConsumer(moderationService, deadLetterService),
  };
}

describe("CleanupConsumer", () => {
  it("runs moderation decision retention cleanup with retentionDays", async () => {
    const { consumer, moderationService } = createConsumer();
    const result = await consumer.process({
      name: "ModerationDecisionRetentionCleanup",
      id: "cleanup-1",
      data: {
        version: 1,
        traceId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        idempotencyKey: "moderation-retention:2026-03-27",
        timestamp: "2026-03-27T00:00:00.000Z",
        retentionDays: 90,
      },
    } as any);

    expect(moderationService.cleanupExpiredDecisions).toHaveBeenCalledWith({
      retentionDays: 90,
    });
    expect(result).toEqual(
      expect.objectContaining({
        acknowledged: true,
        deletedCount: 5,
      }),
    );
  });

  it("acknowledges unknown cleanup jobs as skipped", async () => {
    const { consumer, moderationService } = createConsumer();
    const result = await consumer.process({
      name: "UnknownCleanupJob",
      id: "cleanup-unknown",
      data: {},
    } as any);

    expect(moderationService.cleanupExpiredDecisions).not.toHaveBeenCalled();
    expect(result).toEqual({
      acknowledged: true,
      skipped: true,
    });
  });

  it("captures failed cleanup jobs in dead-letter flow", async () => {
    const { consumer, deadLetterService } = createConsumer();
    const job = {
      name: "ModerationDecisionRetentionCleanup",
      id: "job-failed",
      attemptsMade: 2,
      opts: { attempts: 2 },
      data: {},
    } as any;
    await consumer.onFailed(job, new Error("cleanup failure"));
    expect(deadLetterService.captureFailedJob).toHaveBeenCalledWith(
      "cleanup",
      job,
      expect.any(Error),
    );
  });

  it("captures stalled cleanup jobs", async () => {
    const { consumer, deadLetterService } = createConsumer();
    await consumer.onStalled("job-stalled", "active");
    expect(deadLetterService.captureStalledJob).toHaveBeenCalledWith(
      "cleanup",
      "job-stalled",
      "active",
    );
  });
});
