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

  it("computes agent outcome metrics from social action telemetry", async () => {
    const now = new Date("2026-03-22T12:00:00.000Z");
    vi.useFakeTimers();
    vi.setSystemTime(now);

    const prisma: any = {
      auditLog: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "evt-1",
            actorUserId: "user-1",
            entityType: "agent_thread",
            entityId: "thread-1",
            createdAt: new Date("2026-03-21T10:00:00.000Z"),
            metadata: {
              eventType: "agent_social_action",
              properties: {
                tool: "intro.send_request",
                status: "executed",
                requestId: "request-1",
                sent: true,
              },
            },
          },
          {
            id: "evt-2",
            actorUserId: "user-1",
            entityType: "agent_thread",
            entityId: "thread-1",
            createdAt: new Date("2026-03-21T11:00:00.000Z"),
            metadata: {
              eventType: "circle.join",
              properties: {},
            },
          },
          {
            id: "evt-3",
            actorUserId: "user-1",
            entityType: "agent_thread",
            entityId: "thread-1",
            createdAt: new Date("2026-03-21T11:05:00.000Z"),
            metadata: {
              eventType: "agent_social_action",
              properties: {
                tool: "circle.join",
                status: "executed",
                joined: true,
                circleId: "circle-1",
              },
            },
          },
          {
            id: "evt-4",
            actorUserId: "user-1",
            entityType: "agent_thread",
            entityId: "thread-1",
            createdAt: new Date("2026-03-21T12:00:00.000Z"),
            metadata: {
              eventType: "agent_social_action",
              properties: {
                tool: "followup.schedule",
                status: "executed",
                taskId: "task-1",
                scheduled: true,
              },
            },
          },
          {
            id: "evt-5",
            actorUserId: "user-1",
            entityType: "intent",
            entityId: "intent-1",
            createdAt: new Date("2026-03-21T13:00:00.000Z"),
            metadata: {
              eventType: "intent_created",
              properties: {
                source: "followup",
              },
            },
          },
        ]),
      },
      intentRequest: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "request-1",
            status: "accepted",
          },
        ]),
      },
      scheduledTaskRun: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "run-1",
            scheduledTaskId: "task-1",
            userId: "user-1",
            status: "completed",
            triggeredAt: new Date("2026-03-21T12:30:00.000Z"),
            finishedAt: new Date("2026-03-21T12:31:00.000Z"),
          },
        ]),
      },
    };

    const service = new AnalyticsService(prisma);
    const result = await service.getAgentOutcomeMetrics({ days: 30 });

    expect(result.summary.totalActions).toBe(3);
    expect(result.introRequestAcceptance).toEqual(
      expect.objectContaining({
        attempted: 1,
        accepted: 1,
        acceptanceRate: 1,
      }),
    );
    expect(result.circleJoinConversion).toEqual(
      expect.objectContaining({
        attempted: 1,
        converted: 1,
        conversionRate: 1,
      }),
    );
    expect(result.followupUsefulness).toEqual(
      expect.objectContaining({
        scheduled: 1,
        completedRuns: 1,
        engagedRuns: 1,
        usefulnessRate: 1,
      }),
    );

    vi.useRealTimers();
  });
});
