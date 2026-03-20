import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../database/prisma.service.js";

@Injectable()
export class OutboxRelayService {
  constructor(private readonly prisma: PrismaService) {}

  async relayPendingEvents(limit = 100) {
    const events = await this.prisma.outboxEvent.findMany({
      where: {
        publishedAt: null,
      },
      orderBy: {
        createdAt: "asc",
      },
      take: Math.min(Math.max(limit, 1), 500),
      select: {
        id: true,
        aggregateType: true,
        aggregateId: true,
        eventType: true,
        payload: true,
      },
    });
    if (events.length === 0) {
      return { relayedCount: 0, relayedEventIds: [] as string[] };
    }

    const publishedAt = new Date();
    const eventIds = events.map((event) => event.id);
    await this.prisma.$transaction([
      ...events.map((event) =>
        this.prisma.auditLog.create({
          data: {
            actorType: "system",
            action: "outbox.relay_published",
            entityType: "outbox_event",
            entityId: event.id,
            metadata: this.toJsonObject({
              aggregateType: event.aggregateType,
              aggregateId: event.aggregateId,
              eventType: event.eventType,
              payload: event.payload,
              relayedAt: publishedAt.toISOString(),
            }),
          },
        }),
      ),
      this.prisma.outboxEvent.updateMany({
        where: {
          id: {
            in: eventIds,
          },
          publishedAt: null,
        },
        data: {
          publishedAt,
        },
      }),
    ]);

    return {
      relayedCount: events.length,
      relayedEventIds: eventIds,
      publishedAt: publishedAt.toISOString(),
    };
  }

  private toJsonObject(input: Record<string, unknown>) {
    return JSON.parse(JSON.stringify(input)) as Prisma.InputJsonObject;
  }
}
