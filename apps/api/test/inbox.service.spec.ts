import { describe, expect, it, vi } from "vitest";
import { InboxService } from "../src/inbox/inbox.service.js";

function createService(
  overrides: { prisma?: any; realtimeEventsService?: any } = {},
) {
  const prisma: any =
    overrides.prisma ??
    ({
      intentRequest: {
        findUnique: vi.fn(),
        findMany: vi.fn().mockResolvedValue([]),
        update: vi.fn(),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      requestResponse: {
        findMany: vi.fn().mockResolvedValue([]),
        createMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
    } as any);

  const notificationsService: any = {
    createInAppNotification: vi.fn().mockResolvedValue({}),
  };

  const queue: any = {
    add: vi.fn().mockResolvedValue({}),
  };

  const personalizationService: any = {
    recordBehaviorSignal: vi.fn().mockResolvedValue({}),
  };

  const realtimeEventsService: any =
    overrides.realtimeEventsService ??
    ({
      emitRequestUpdated: vi.fn(),
    } as any);
  const executionReconciliationService: any = {
    recordRequestOutcome: vi.fn().mockResolvedValue(undefined),
  };

  return {
    prisma,
    notificationsService,
    queue,
    personalizationService,
    realtimeEventsService,
    executionReconciliationService,
    service: new InboxService(
      prisma,
      notificationsService,
      personalizationService,
      executionReconciliationService,
      queue,
      undefined,
      realtimeEventsService,
    ),
  };
}

describe("InboxService", () => {
  it("queues connection setup when request is accepted", async () => {
    const {
      service,
      queue,
      personalizationService,
      notificationsService,
      realtimeEventsService,
      executionReconciliationService,
    } = createService({
      prisma: {
        intentRequest: {
          findUnique: vi.fn().mockResolvedValue({
            id: "req-1",
            status: "pending",
            senderUserId: "11111111-1111-1111-1111-111111111111",
            recipientUserId: "22222222-2222-2222-2222-222222222222",
            intentId: "33333333-3333-4333-8333-333333333333",
          }),
          update: vi.fn().mockResolvedValue({
            id: "req-1",
            status: "accepted",
            senderUserId: "11111111-1111-1111-1111-111111111111",
            recipientUserId: "22222222-2222-2222-2222-222222222222",
            intentId: "33333333-3333-4333-8333-333333333333",
          }),
        },
      },
    });

    const result = await service.updateStatus("req-1", "accepted");

    expect(result.queued).toBe(true);
    expect(queue.add).toHaveBeenCalledTimes(1);
    expect(queue.add).toHaveBeenCalledWith(
      "RequestAccepted",
      expect.objectContaining({
        type: "RequestAccepted",
        idempotencyKey: "request-accepted:req-1",
        payload: expect.objectContaining({
          requestId: "req-1",
        }),
      }),
      expect.objectContaining({
        jobId: "request-accepted:req-1",
      }),
    );
    expect(personalizationService.recordBehaviorSignal).toHaveBeenCalledTimes(
      2,
    );
    expect(realtimeEventsService.emitRequestUpdated).toHaveBeenCalledWith(
      [
        "11111111-1111-1111-1111-111111111111",
        "22222222-2222-2222-2222-222222222222",
      ],
      {
        requestId: "req-1",
        status: "accepted",
      },
    );
    expect(notificationsService.createInAppNotification).not.toHaveBeenCalled();
    expect(
      executionReconciliationService.recordRequestOutcome,
    ).not.toHaveBeenCalled();
  });

  it("hides snoozed pending requests until snooze window expires", async () => {
    const now = Date.now();
    const { service } = createService({
      prisma: {
        intentRequest: {
          findMany: vi.fn().mockResolvedValue([
            {
              id: "req-1",
              status: "pending",
              senderUserId: "sender-1",
              intentId: "intent-1",
              sentAt: new Date(now - 10 * 60_000),
              expiresAt: new Date(now + 10 * 60_000),
            },
            {
              id: "req-2",
              status: "pending",
              senderUserId: "sender-2",
              intentId: "intent-2",
              sentAt: new Date(now - 10 * 60_000),
              expiresAt: new Date(now + 10 * 60_000),
            },
          ]),
        },
        requestResponse: {
          findMany: vi.fn().mockResolvedValue([
            {
              requestId: "req-1",
              action: "snooze:30",
              createdAt: new Date(now - 5 * 60_000),
            },
            {
              requestId: "req-2",
              action: "snooze:15",
              createdAt: new Date(now - 20 * 60_000),
            },
          ]),
        },
      },
    });

    const result = await service.listPendingRequests(
      "11111111-1111-4111-8111-111111111111",
    );

    expect(result.map((request) => request.id)).toEqual(["req-2"]);
  });

  it("includes request card summary with who/what/when and internal why-me hints", async () => {
    const now = Date.now();
    const { service } = createService({
      prisma: {
        intentRequest: {
          findMany: vi.fn().mockResolvedValue([
            {
              id: "req-1",
              status: "pending",
              senderUserId: "sender-1",
              intentId: "intent-1",
              sentAt: new Date(now - 4 * 60_000),
              expiresAt: new Date(now + 16 * 60_000),
            },
          ]),
        },
        requestResponse: {
          findMany: vi.fn().mockResolvedValue([]),
        },
        intent: {
          findMany: vi.fn().mockResolvedValue([
            {
              id: "intent-1",
              rawText: "Looking for tennis after work",
            },
          ]),
        },
        user: {
          findMany: vi.fn().mockResolvedValue([
            {
              id: "sender-1",
              displayName: "Alex",
            },
          ]),
        },
        intentCandidate: {
          findMany: vi.fn().mockResolvedValue([
            {
              intentId: "intent-1",
              rationale: {
                selectedBecause: ["availability_fit", "semantic_similarity"],
              },
            },
          ]),
        },
      },
    });

    const result = await service.listPendingRequests("recipient-1");
    const first = result[0] as any;
    expect(first?.cardSummary).toEqual(
      expect.objectContaining({
        who: "Alex",
        what: "Looking for tennis after work",
      }),
    );
    expect(first?.cardSummary.when).toContain("sent");
    expect(first?.internal).toEqual(
      expect.objectContaining({
        whyMe: ["availability_fit", "semantic_similarity"],
      }),
    );
  });

  it("bulk declines pending requests and notifies senders", async () => {
    const { service, prisma, notificationsService, personalizationService } =
      createService({
        prisma: {
          intentRequest: {
            findMany: vi.fn().mockResolvedValue([
              {
                id: "req-1",
                senderUserId: "sender-1",
                recipientUserId: "recipient-1",
              },
              {
                id: "req-2",
                senderUserId: "sender-2",
                recipientUserId: "recipient-1",
              },
            ]),
            updateMany: vi.fn().mockResolvedValue({ count: 2 }),
          },
        },
      });

    const result = await service.bulkAction({
      recipientUserId: "recipient-1",
      action: "decline",
    });

    expect(result).toEqual({
      action: "decline",
      affectedCount: 2,
    });
    expect(prisma.intentRequest.updateMany).toHaveBeenCalledTimes(1);
    expect(notificationsService.createInAppNotification).toHaveBeenCalledTimes(
      2,
    );
    expect(personalizationService.recordBehaviorSignal).toHaveBeenCalledTimes(
      2,
    );
  });

  it("bulk snoozes pending requests by writing request responses", async () => {
    const { service, prisma } = createService({
      prisma: {
        intentRequest: {
          findMany: vi.fn().mockResolvedValue([
            {
              id: "req-1",
              senderUserId: "sender-1",
              recipientUserId: "recipient-1",
            },
          ]),
        },
        requestResponse: {
          createMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
      },
    });

    const result = await service.bulkAction({
      recipientUserId: "recipient-1",
      action: "snooze",
      snoozeMinutes: 30,
    });

    expect(result.action).toBe("snooze");
    expect(result.affectedCount).toBe(1);
    expect(prisma.requestResponse.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [
          expect.objectContaining({
            requestId: "req-1",
            userId: "recipient-1",
            action: "snooze:30",
          }),
        ],
      }),
    );
  });

  it("forwards notification metadata when rejecting a request", async () => {
    const { service, notificationsService } = createService({
      prisma: {
        intentRequest: {
          findUnique: vi.fn().mockResolvedValue({
            id: "req-1",
            status: "pending",
            senderUserId: "sender-1",
            recipientUserId: "recipient-1",
            intentId: "intent-1",
          }),
          update: vi.fn().mockResolvedValue({
            id: "req-1",
            status: "rejected",
            senderUserId: "sender-1",
            recipientUserId: "recipient-1",
            intentId: "intent-1",
          }),
        },
      },
    });

    await service.updateStatus("req-1", "rejected", "recipient-1", {
      notificationMetadata: {
        provenance: {
          source: "protocol",
          action: "request.reject",
        },
      },
    });

    expect(notificationsService.createInAppNotification).toHaveBeenCalledWith(
      "sender-1",
      "agent_update",
      "One request was declined. I can keep looking for more people.",
      {
        provenance: {
          source: "protocol",
          action: "request.reject",
        },
      },
    );
  });
});
