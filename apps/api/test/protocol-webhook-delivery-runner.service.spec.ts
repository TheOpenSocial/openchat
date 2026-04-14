import { afterEach, describe, expect, it, vi } from "vitest";
import { ProtocolWebhookDeliveryRunnerService } from "../src/protocol/protocol-webhook-delivery-runner.service.js";
import type { QueuedWebhookDelivery } from "../src/protocol/protocol-webhook-delivery-worker.service.js";
import { protocolIds } from "@opensocial/protocol-types";

function createPrismaStub(subscriptionRows: any[]) {
  return {
    $queryRawUnsafe: vi.fn(async (query: string, ...params: any[]) => {
      if (query.includes("FROM protocol_webhook_subscriptions")) {
        const ids = params[0] as string[];
        return subscriptionRows.filter((row) =>
          ids.includes(row.subscriptionId),
        );
      }
      return [];
    }),
  };
}

function createWorkerStub(overrides?: Partial<any>) {
  return {
    claimDueDeliveries: vi.fn(),
    markDeliverySucceeded: vi.fn(),
    markDeliveryFailed: vi.fn(),
    ...overrides,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("ProtocolWebhookDeliveryRunnerService", () => {
  it("delivers signed webhooks and marks success", async () => {
    const claimed: QueuedWebhookDelivery[] = [
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
    ];
    const worker = createWorkerStub({
      claimDueDeliveries: vi.fn().mockResolvedValue({
        claimedCount: 1,
        claimedAt: "2026-04-13T10:05:00.000Z",
        deliveries: claimed,
      }),
      markDeliverySucceeded: vi.fn().mockResolvedValue({
        deliveryId: "delivery-1",
        status: "delivered",
        attemptCount: 1,
        nextAttemptAt: null,
        transitionedAt: "2026-04-13T10:05:00.000Z",
      }),
    });
    const prisma = createPrismaStub([
      {
        subscriptionId: "subscription-1",
        targetUrl: "https://partner.example.com/hooks/opensocial",
        status: "active",
        eventNames: ["intent.created"],
        metadata: { tenant: "alpha" },
      },
    ]);
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 204,
      statusText: "No Content",
      text: vi.fn().mockResolvedValue(""),
    });
    vi.stubGlobal("fetch", fetchMock);

    const service = new ProtocolWebhookDeliveryRunnerService(
      prisma as any,
      worker as any,
    );
    const result = await service.runDueDeliveries({
      now: new Date("2026-04-13T10:05:00.000Z"),
      limit: 10,
    });

    expect(result.claimedCount).toBe(1);
    expect(result.deliveredCount).toBe(1);
    expect(result.retryScheduledCount).toBe(0);
    expect(worker.claimDueDeliveries).toHaveBeenCalledWith(
      10,
      expect.any(Date),
      undefined,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://partner.example.com/hooks/opensocial");
    expect(init?.method).toBe("POST");
    expect(init?.headers).toEqual(
      expect.objectContaining({
        "content-type": "application/json",
        "x-opensocial-protocol-delivery-id": "delivery-1",
        "x-opensocial-protocol-subscription-id": "subscription-1",
        "x-opensocial-protocol-event-name": "intent.created",
        "x-opensocial-protocol-event-family": "protocol",
        "x-opensocial-protocol-signature": expect.any(String),
      }),
    );

    const body = JSON.parse(String(init?.body));
    expect(body.protocolId).toBe(protocolIds.protocol);
    expect(body.deliveryId).toBe("delivery-1");
    expect(body.signature).toBeNull();
    expect(worker.markDeliverySucceeded).toHaveBeenCalledWith(
      "delivery-1",
      expect.objectContaining({
        responseStatus: 204,
        responseBody: "",
      }),
    );
    expect(result.results[0].outcome).toBe("delivered");
  });

  it("marks a failed response for retry with backoff metadata", async () => {
    const claimed: QueuedWebhookDelivery[] = [
      {
        deliveryId: "delivery-1",
        subscriptionId: "subscription-1",
        eventId: "event-1",
        eventType: "intent.updated",
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
    ];
    const worker = createWorkerStub({
      claimDueDeliveries: vi.fn().mockResolvedValue({
        claimedCount: 1,
        claimedAt: "2026-04-13T10:05:00.000Z",
        deliveries: claimed,
      }),
      markDeliveryFailed: vi.fn().mockResolvedValue({
        deliveryId: "delivery-1",
        status: "retrying",
        attemptCount: 2,
        nextAttemptAt: "2026-04-13T10:05:02.000Z",
        transitionedAt: "2026-04-13T10:05:00.000Z",
      }),
    });
    const prisma = createPrismaStub([
      {
        subscriptionId: "subscription-1",
        targetUrl: "https://partner.example.com/hooks/opensocial",
        status: "active",
        eventNames: ["intent.updated"],
        metadata: {},
      },
    ]);
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      statusText: "Service Unavailable",
      text: vi.fn().mockResolvedValue("temporarily unavailable"),
    });
    vi.stubGlobal("fetch", fetchMock);

    const service = new ProtocolWebhookDeliveryRunnerService(
      prisma as any,
      worker as any,
    );
    const result = await service.runDueDeliveries({
      now: new Date("2026-04-13T10:05:00.000Z"),
      limit: 10,
      maxAttempts: 5,
      baseBackoffMs: 1000,
      maxBackoffMs: 8000,
    });

    expect(result.retryScheduledCount).toBe(1);
    expect(result.deadLetteredCount).toBe(0);
    expect(worker.markDeliveryFailed).toHaveBeenCalledWith(
      "delivery-1",
      expect.objectContaining({
        responseStatus: 503,
        errorCode: "http_503",
        maxAttempts: 5,
        baseBackoffMs: 1000,
        maxBackoffMs: 8000,
      }),
    );
    expect(result.results[0].outcome).toBe("retrying");
  });

  it("dead-letters a delivery when its subscription is missing", async () => {
    const claimed: QueuedWebhookDelivery[] = [
      {
        deliveryId: "delivery-1",
        subscriptionId: "subscription-missing",
        eventId: "event-1",
        eventType: "notification.created",
        payload: { notificationId: "notification-1" },
        dedupeKey: "dedupe-1",
        attemptCount: 3,
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
    ];
    const worker = createWorkerStub({
      claimDueDeliveries: vi.fn().mockResolvedValue({
        claimedCount: 1,
        claimedAt: "2026-04-13T10:05:00.000Z",
        deliveries: claimed,
      }),
      markDeliveryFailed: vi.fn().mockResolvedValue({
        deliveryId: "delivery-1",
        status: "dead_lettered",
        attemptCount: 3,
        nextAttemptAt: null,
        transitionedAt: "2026-04-13T10:05:00.000Z",
      }),
    });
    const prisma = createPrismaStub([]);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const service = new ProtocolWebhookDeliveryRunnerService(
      prisma as any,
      worker as any,
    );
    const result = await service.runDueDeliveries({
      now: new Date("2026-04-13T10:05:00.000Z"),
      limit: 10,
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(worker.markDeliveryFailed).toHaveBeenCalledWith(
      "delivery-1",
      expect.objectContaining({
        maxAttempts: 1,
        errorCode: "subscription_not_found",
      }),
    );
    expect(result.deadLetteredCount).toBe(1);
    expect(result.results[0].outcome).toBe("dead_lettered");
  });
});
