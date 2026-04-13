import { describe, expect, it, vi } from "vitest";
import { ProtocolWebhookDeliveryWorkerService } from "../src/protocol/protocol-webhook-delivery-worker.service.js";

type DeliveryRow = {
  deliveryId: string;
  subscriptionId: string;
  eventId: string | null;
  eventType: string;
  payload: unknown;
  dedupeKey: string | null;
  attemptCount: number;
  status: string;
  nextAttemptAt: string | null;
  deliveredAt: string | null;
  failedAt: string | null;
  responseStatus: number | null;
  responseBody: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
};

function fromRawRow(row: DeliveryRow) {
  return {
    ...row,
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(row.updatedAt).toISOString(),
  };
}

function createPrismaStub(initialRows: DeliveryRow[]) {
  const rows = initialRows.map((row) => ({ ...row }));

  return {
    $queryRawUnsafe: vi.fn(async (query: string, ...params: any[]) => {
      if (query.includes('SELECT id AS "deliveryId"')) {
        const [deliveryId] = params;
        const row = rows.find((entry) => entry.deliveryId === deliveryId);
        return row
          ? [
              {
                deliveryId: row.deliveryId,
                attemptCount: row.attemptCount,
                status: row.status,
                createdAt: new Date(row.createdAt),
              },
            ]
          : [];
      }

      if (query.includes("WITH candidate_ids AS")) {
        const limit = Number(params[0]);
        const now = new Date(String(params[1]));
        const due = rows
          .filter(
            (row) =>
              (row.status === "queued" || row.status === "retrying") &&
              (!row.nextAttemptAt ||
                Date.parse(row.nextAttemptAt) <= now.getTime()),
          )
          .sort(
            (left, right) =>
              Date.parse(left.nextAttemptAt ?? left.createdAt) -
                Date.parse(right.nextAttemptAt ?? right.createdAt) ||
              Date.parse(left.createdAt) - Date.parse(right.createdAt),
          )
          .slice(0, limit);

        for (const row of due) {
          row.status = "retrying";
          row.attemptCount += 1;
          row.nextAttemptAt = null;
          row.updatedAt = now.toISOString();
        }

        return due.map((row) => fromRawRow(row));
      }

      if (query.includes("SET status = 'delivered'")) {
        const [deliveryId, deliveredAt, responseStatus, responseBody] = params;
        const row = rows.find((entry) => entry.deliveryId === deliveryId);
        if (!row) {
          return [];
        }

        row.status = "delivered";
        row.deliveredAt = String(deliveredAt);
        row.failedAt = null;
        row.nextAttemptAt = null;
        row.responseStatus = responseStatus ?? null;
        row.responseBody = responseBody ?? null;
        row.errorCode = null;
        row.errorMessage = null;
        row.updatedAt = String(deliveredAt);
        return [fromRawRow(row)];
      }

      if (query.includes("SET status = $2")) {
        const [
          deliveryId,
          status,
          failedAt,
          nextAttemptAt,
          responseStatus,
          responseBody,
          errorCode,
          errorMessage,
        ] = params;
        const row = rows.find((entry) => entry.deliveryId === deliveryId);
        if (!row) {
          return [];
        }

        row.status = String(status);
        row.failedAt = String(failedAt);
        row.nextAttemptAt = nextAttemptAt ? String(nextAttemptAt) : null;
        row.responseStatus = responseStatus ?? null;
        row.responseBody = responseBody ?? null;
        row.errorCode = errorCode ?? null;
        row.errorMessage = errorMessage ?? null;
        row.updatedAt = String(failedAt);
        return [fromRawRow(row)];
      }

      throw new Error(`unexpected query: ${query}`);
    }),
  };
}

describe("ProtocolWebhookDeliveryWorkerService", () => {
  it("claims due deliveries and increments attempt counts", async () => {
    const prisma = createPrismaStub([
      {
        deliveryId: "delivery-1",
        subscriptionId: "subscription-1",
        eventId: "event-1",
        eventType: "intent.created",
        payload: { intentId: "intent-1" },
        dedupeKey: "dedupe-1",
        attemptCount: 0,
        status: "queued",
        nextAttemptAt: null,
        deliveredAt: null,
        failedAt: null,
        responseStatus: null,
        responseBody: null,
        errorCode: null,
        errorMessage: null,
        createdAt: "2026-04-13T10:00:00.000Z",
        updatedAt: "2026-04-13T10:00:00.000Z",
      },
      {
        deliveryId: "delivery-2",
        subscriptionId: "subscription-1",
        eventId: "event-2",
        eventType: "chat.message.created",
        payload: { chatId: "chat-1" },
        dedupeKey: "dedupe-2",
        attemptCount: 2,
        status: "retrying",
        nextAttemptAt: "2026-04-13T10:01:00.000Z",
        deliveredAt: null,
        failedAt: null,
        responseStatus: null,
        responseBody: null,
        errorCode: null,
        errorMessage: null,
        createdAt: "2026-04-13T10:05:00.000Z",
        updatedAt: "2026-04-13T10:05:00.000Z",
      },
      {
        deliveryId: "delivery-3",
        subscriptionId: "subscription-2",
        eventId: "event-3",
        eventType: "notification.created",
        payload: { notificationId: "notification-1" },
        dedupeKey: "dedupe-3",
        attemptCount: 1,
        status: "retrying",
        nextAttemptAt: "2026-04-13T10:20:00.000Z",
        deliveredAt: null,
        failedAt: null,
        responseStatus: null,
        responseBody: null,
        errorCode: null,
        errorMessage: null,
        createdAt: "2026-04-13T10:10:00.000Z",
        updatedAt: "2026-04-13T10:10:00.000Z",
      },
    ]);

    const service = new ProtocolWebhookDeliveryWorkerService(prisma as any);
    const result = await service.claimDueDeliveries(
      10,
      new Date("2026-04-13T10:15:00.000Z"),
    );

    expect(result.claimedCount).toBe(2);
    expect(result.deliveries.map((row) => row.deliveryId)).toEqual([
      "delivery-1",
      "delivery-2",
    ]);
    expect(result.deliveries[0].attemptCount).toBe(1);
    expect(result.deliveries[1].attemptCount).toBe(3);
    expect(result.deliveries.every((row) => row.status === "retrying")).toBe(
      true,
    );
    expect(prisma.$queryRawUnsafe).toHaveBeenCalledTimes(1);
  });

  it("marks a delivery successful", async () => {
    const prisma = createPrismaStub([
      {
        deliveryId: "delivery-1",
        subscriptionId: "subscription-1",
        eventId: "event-1",
        eventType: "intent.created",
        payload: { intentId: "intent-1" },
        dedupeKey: "dedupe-1",
        attemptCount: 1,
        status: "retrying",
        nextAttemptAt: null,
        deliveredAt: null,
        failedAt: null,
        responseStatus: null,
        responseBody: null,
        errorCode: null,
        errorMessage: null,
        createdAt: "2026-04-13T10:00:00.000Z",
        updatedAt: "2026-04-13T10:00:00.000Z",
      },
    ]);

    const service = new ProtocolWebhookDeliveryWorkerService(prisma as any);
    const result = await service.markDeliverySucceeded("delivery-1", {
      responseStatus: 204,
      responseBody: "ok",
      deliveredAt: new Date("2026-04-13T10:16:00.000Z"),
    });

    expect(result.status).toBe("delivered");
    expect(result.attemptCount).toBe(1);
    expect(result.nextAttemptAt).toBeNull();
    expect(result.transitionedAt).toBe("2026-04-13T10:16:00.000Z");
  });

  it("marks a delivery for retry when attempts remain", async () => {
    const prisma = createPrismaStub([
      {
        deliveryId: "delivery-1",
        subscriptionId: "subscription-1",
        eventId: "event-1",
        eventType: "intent.created",
        payload: { intentId: "intent-1" },
        dedupeKey: "dedupe-1",
        attemptCount: 2,
        status: "retrying",
        nextAttemptAt: null,
        deliveredAt: null,
        failedAt: null,
        responseStatus: null,
        responseBody: null,
        errorCode: null,
        errorMessage: null,
        createdAt: "2026-04-13T10:00:00.000Z",
        updatedAt: "2026-04-13T10:00:00.000Z",
      },
    ]);

    const service = new ProtocolWebhookDeliveryWorkerService(prisma as any);
    const result = await service.markDeliveryFailed("delivery-1", {
      maxAttempts: 5,
      baseBackoffMs: 1000,
      maxBackoffMs: 8000,
      errorCode: "upstream_timeout",
      errorMessage: "timeout while posting webhook",
      now: new Date("2026-04-13T10:16:00.000Z"),
    });

    expect(result.status).toBe("retrying");
    expect(result.attemptCount).toBe(2);
    expect(result.nextAttemptAt).toBe("2026-04-13T10:16:02.000Z");
    expect(result.transitionedAt).toBe("2026-04-13T10:16:00.000Z");
  });

  it("dead-letters a delivery after the final attempt", async () => {
    const prisma = createPrismaStub([
      {
        deliveryId: "delivery-1",
        subscriptionId: "subscription-1",
        eventId: "event-1",
        eventType: "intent.created",
        payload: { intentId: "intent-1" },
        dedupeKey: "dedupe-1",
        attemptCount: 5,
        status: "retrying",
        nextAttemptAt: null,
        deliveredAt: null,
        failedAt: null,
        responseStatus: null,
        responseBody: null,
        errorCode: null,
        errorMessage: null,
        createdAt: "2026-04-13T10:00:00.000Z",
        updatedAt: "2026-04-13T10:00:00.000Z",
      },
    ]);

    const service = new ProtocolWebhookDeliveryWorkerService(prisma as any);
    const result = await service.markDeliveryFailed("delivery-1", {
      maxAttempts: 5,
      errorCode: "unreachable",
      errorMessage: "webhook endpoint unavailable",
      now: new Date("2026-04-13T10:16:00.000Z"),
    });

    expect(result.status).toBe("dead_lettered");
    expect(result.attemptCount).toBe(5);
    expect(result.nextAttemptAt).toBeNull();
    expect(result.transitionedAt).toBe("2026-04-13T10:16:00.000Z");
  });
});
