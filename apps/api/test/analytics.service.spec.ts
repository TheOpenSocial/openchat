import { describe, expect, it, vi } from "vitest";
import { AnalyticsService } from "../src/analytics/analytics.service.js";

describe("AnalyticsService", () => {
  it("tracks analytics events in audit logs", async () => {
    const prisma: any = {
      auditLog: {
        create: vi.fn().mockResolvedValue({ id: "audit-1" }),
      },
    };

    const service = new AnalyticsService(prisma);
    const result = await service.trackEvent({
      eventType: "intent_created",
      actorUserId: "11111111-1111-4111-8111-111111111111",
      entityType: "intent",
      entityId: "22222222-2222-4222-8222-222222222222",
      properties: {
        source: "api",
      },
    });

    expect(result).toEqual(
      expect.objectContaining({
        recorded: true,
        eventType: "intent_created",
      }),
    );
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "analytics.event",
          entityType: "intent",
          entityId: "22222222-2222-4222-8222-222222222222",
        }),
      }),
    );
  });

  it("lists analytics events and applies eventType filter", async () => {
    const now = new Date("2026-03-19T12:00:00.000Z");
    const prisma: any = {
      auditLog: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "event-1",
            actorUserId: "11111111-1111-4111-8111-111111111111",
            entityType: "intent",
            entityId: "22222222-2222-4222-8222-222222222222",
            createdAt: now,
            metadata: {
              eventType: "request_sent",
              occurredAt: now.toISOString(),
              properties: {
                requestCount: 2,
              },
            },
          },
          {
            id: "event-2",
            actorUserId: "11111111-1111-4111-8111-111111111111",
            entityType: "intent",
            entityId: "33333333-3333-4333-8333-333333333333",
            createdAt: now,
            metadata: {
              eventType: "intent_created",
            },
          },
        ]),
      },
    };

    const service = new AnalyticsService(prisma);
    const events = await service.listEvents({
      eventType: "request_sent",
      limit: 10,
    });

    expect(events).toHaveLength(1);
    expect(events[0]).toEqual(
      expect.objectContaining({
        id: "event-1",
        eventType: "request_sent",
      }),
    );
  });

  it("computes core metrics from aggregate tables", async () => {
    const prisma: any = {
      intent: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      intentRequest: {
        count: vi.fn().mockResolvedValue(10),
      },
      connection: {
        count: vi.fn().mockResolvedValue(4),
      },
      notification: {
        count: vi.fn().mockResolvedValueOnce(20).mockResolvedValueOnce(5),
      },
      userReport: {
        count: vi.fn().mockResolvedValue(2),
      },
      user: {
        count: vi.fn().mockResolvedValue(50),
      },
    };

    const service = new AnalyticsService(prisma);
    const core = await service.getCoreMetrics({ days: 30 });

    expect(core.metrics.connectionSuccessRate).toEqual(
      expect.objectContaining({
        rate: 0.4,
        numerator: 4,
        denominator: 10,
      }),
    );
    expect(core.metrics.notificationToOpenRate).toEqual(
      expect.objectContaining({
        rate: 0.25,
        openedCount: 5,
        totalCount: 20,
      }),
    );
    expect(core.metrics.moderationIncidentRate).toEqual(
      expect.objectContaining({
        incidentCount: 2,
        activeUserCount: 50,
      }),
    );
  });

  it("generates experiment assignments and persists them", async () => {
    const prisma: any = {
      auditLog: {
        create: vi.fn().mockResolvedValue({ id: "audit-1" }),
      },
      userPreference: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: "pref-1" }),
      },
    };

    const service = new AnalyticsService(prisma);
    vi.spyOn(service, "getExperimentGuardrails").mockResolvedValue({
      onTrack: true,
      thresholds: {},
      checks: {},
      observed: {},
      generatedAt: new Date().toISOString(),
    } as any);

    const result = await service.getExperimentAssignments(
      "11111111-1111-4111-8111-111111111111",
    );

    expect(result.assignments).toHaveLength(3);
    expect(prisma.userPreference.create).toHaveBeenCalledTimes(3);
    expect(prisma.auditLog.create).toHaveBeenCalledTimes(3);
  });
});
