import { describe, expect, it, vi } from "vitest";
import { ProtocolWebhookDeliveryConsumer } from "../src/jobs/processors/protocol-webhook-delivery.consumer.js";

describe("ProtocolWebhookDeliveryConsumer", () => {
  it("runs the delivery runner for protocol queue jobs", async () => {
    const runner = {
      runDueDeliveries: vi.fn().mockResolvedValue({
        claimedCount: 1,
        attemptedCount: 1,
        deliveredCount: 1,
        retryScheduledCount: 0,
        deadLetteredCount: 0,
        skippedCount: 0,
        ranAt: "2026-04-13T00:00:00.000Z",
        results: [],
      }),
    };
    const deadLetterService = {
      captureFailedJob: vi.fn(),
      captureStalledJob: vi.fn(),
    };
    const consumer = new ProtocolWebhookDeliveryConsumer(
      runner as any,
      deadLetterService as any,
    );

    const result = await consumer.process({
      name: "RunProtocolWebhookDeliveries",
      id: "job-1",
      attemptsMade: 0,
      data: {
        traceId: "00000000-0000-4000-8000-000000000001",
        appId: "partner.alpha",
        limit: 9,
      },
    } as any);

    expect(runner.runDueDeliveries).toHaveBeenCalledWith({
      appId: "partner.alpha",
      limit: 9,
    });
    expect(result).toMatchObject({
      acknowledged: true,
      claimedCount: 1,
      deliveredCount: 1,
    });
  });

  it("skips unsupported queue jobs", async () => {
    const runner = {
      runDueDeliveries: vi.fn(),
    };
    const deadLetterService = {
      captureFailedJob: vi.fn(),
      captureStalledJob: vi.fn(),
    };
    const consumer = new ProtocolWebhookDeliveryConsumer(
      runner as any,
      deadLetterService as any,
    );

    const result = await consumer.process({
      name: "UnsupportedJob",
      id: "job-2",
      attemptsMade: 0,
      data: {},
    } as any);

    expect(runner.runDueDeliveries).not.toHaveBeenCalled();
    expect(result).toEqual({ acknowledged: true, skipped: true });
  });
});
