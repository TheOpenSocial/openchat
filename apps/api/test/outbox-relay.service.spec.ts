import { describe, expect, it, vi } from "vitest";
import { OutboxRelayService } from "../src/jobs/outbox-relay.service.js";

describe("OutboxRelayService", () => {
  it("marks pending outbox events as published and writes relay audit logs", async () => {
    const prisma: any = {
      outboxEvent: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            aggregateType: "auth",
            aggregateId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
            eventType: "auth.session_revoked",
            payload: { version: 1, userId: "user-1" },
          },
        ]),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      auditLog: {
        create: vi.fn().mockResolvedValue({}),
      },
      $transaction: vi.fn(async (ops: Array<Promise<unknown>>) =>
        Promise.all(ops),
      ),
    };

    const service = new OutboxRelayService(prisma);
    const result = await service.relayPendingEvents(10);

    expect(result.relayedCount).toBe(1);
    expect(result.relayedEventIds).toEqual([
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    ]);
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "outbox.relay_published",
          entityId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        }),
      }),
    );
    expect(prisma.outboxEvent.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: {
            in: ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"],
          },
        }),
      }),
    );
  });
});
