import { describe, expect, it, vi } from "vitest";
import { ModerationConsumer } from "../src/jobs/processors/moderation.consumer.js";

function createConsumer() {
  const chatsService: any = {
    processQueuedMessageModeration: vi.fn().mockResolvedValue(undefined),
  };
  const deadLetterService: any = {
    captureFailedJob: vi.fn().mockResolvedValue(undefined),
    captureStalledJob: vi.fn().mockResolvedValue(undefined),
  };

  return {
    chatsService,
    deadLetterService,
    consumer: new ModerationConsumer(chatsService, deadLetterService),
  };
}

describe("ModerationConsumer", () => {
  it("processes ChatMessageModerationRequested jobs", async () => {
    const { consumer, chatsService } = createConsumer();
    const result = await consumer.process({
      name: "ChatMessageModerationRequested",
      id: "job-1",
      data: {
        version: 1,
        traceId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        idempotencyKey: "chat-message-review:msg-1",
        timestamp: "2026-03-27T00:00:00.000Z",
        type: "ChatMessageModerationRequested",
        payload: {
          messageId: "11111111-1111-4111-8111-111111111111",
          chatId: "22222222-2222-4222-8222-222222222222",
          senderUserId: "33333333-3333-4333-8333-333333333333",
          body: "hello there",
        },
      },
    } as any);

    expect(result).toEqual({ acknowledged: true });
    expect(chatsService.processQueuedMessageModeration).toHaveBeenCalledWith(
      "11111111-1111-4111-8111-111111111111",
      "22222222-2222-4222-8222-222222222222",
      "33333333-3333-4333-8333-333333333333",
      "hello there",
    );
  });

  it("captures failed moderation jobs in dead-letter flow", async () => {
    const { consumer, deadLetterService } = createConsumer();
    const job = {
      name: "ChatMessageModerationRequested",
      id: "job-failed",
      attemptsMade: 3,
      opts: { attempts: 3 },
      data: {},
    } as any;
    await consumer.onFailed(job, new Error("queue timeout"));
    expect(deadLetterService.captureFailedJob).toHaveBeenCalledWith(
      "moderation",
      job,
      expect.any(Error),
    );
  });

  it("captures stalled moderation jobs", async () => {
    const { consumer, deadLetterService } = createConsumer();
    await consumer.onStalled("job-stalled", "active");
    expect(deadLetterService.captureStalledJob).toHaveBeenCalledWith(
      "moderation",
      "job-stalled",
      "active",
    );
  });
});
