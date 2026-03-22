import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import {
  NotificationType,
  type recurringCircleAddMemberBodySchema,
  type recurringCircleCreateBodySchema,
  type recurringCircleListQuerySchema,
  type recurringCircleUpdateBodySchema,
} from "@opensocial/types";
import type { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { AgentService } from "../agent/agent.service.js";
import { computeNextWeeklyOccurrence } from "../common/timezone-scheduling.js";
import { LaunchControlsService } from "../launch-controls/launch-controls.service.js";
import { NotificationsService } from "../notifications/notifications.service.js";
import { PrismaService } from "../database/prisma.service.js";
import { IntentsService } from "../intents/intents.service.js";

type RecurringCircleCreateBody = zodInfer<
  typeof recurringCircleCreateBodySchema
>;
type RecurringCircleUpdateBody = zodInfer<
  typeof recurringCircleUpdateBodySchema
>;
type RecurringCircleListQuery = zodInfer<typeof recurringCircleListQuerySchema>;
type RecurringCircleAddMemberBody = zodInfer<
  typeof recurringCircleAddMemberBodySchema
>;

type zodInfer<T extends { _output: unknown }> = T["_output"];

const DEFAULT_LIST_LIMIT = 50;

@Injectable()
export class RecurringCirclesService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional()
    private readonly notificationsService?: NotificationsService,
    @Optional()
    private readonly launchControlsService?: LaunchControlsService,
    @Optional()
    private readonly intentsService?: IntentsService,
    @Optional()
    private readonly agentService?: AgentService,
  ) {}

  async listCircles(userId: string, query: RecurringCircleListQuery) {
    const limit = query.limit ?? DEFAULT_LIST_LIMIT;
    return this.prisma.recurringCircle.findMany({
      where: {
        ownerUserId: userId,
        ...(query.status
          ? { status: query.status }
          : { status: { not: "archived" } }),
      },
      orderBy: [{ nextSessionAt: "asc" }, { createdAt: "desc" }],
      take: limit,
      include: {
        _count: {
          select: { members: true, sessions: true },
        },
      },
    });
  }

  async createCircle(userId: string, body: RecurringCircleCreateBody) {
    await this.assertLaunchAction("recurring_circles", userId);
    const now = new Date();
    const nextSessionAt = this.computeNextSessionAt(body.cadence, now);

    return this.prisma.$transaction(async (tx) => {
      const circle = await tx.recurringCircle.create({
        data: {
          ownerUserId: userId,
          title: body.title,
          description: body.description ?? null,
          visibility: body.visibility,
          topicTags: body.topicTags as unknown as Prisma.InputJsonValue,
          targetSize: body.targetSize ?? null,
          cadenceType: body.cadence.kind,
          cadenceConfig: body.cadence as unknown as Prisma.InputJsonValue,
          kickoffPrompt: body.kickoffPrompt ?? null,
          nextSessionAt,
        },
      });

      await tx.recurringCircleMember.create({
        data: {
          circleId: circle.id,
          userId,
          role: "owner",
          status: "active",
          joinedAt: now,
          invitedByUserId: userId,
        },
      });

      return circle;
    });
  }

  async updateCircle(
    circleId: string,
    ownerUserId: string,
    body: RecurringCircleUpdateBody,
  ) {
    await this.requireCircleOwnership(circleId, ownerUserId);
    return this.prisma.recurringCircle.update({
      where: { id: circleId },
      data: {
        ...(body.title !== undefined ? { title: body.title } : {}),
        ...(body.description !== undefined
          ? { description: body.description }
          : {}),
        ...(body.visibility !== undefined
          ? { visibility: body.visibility }
          : {}),
        ...(body.topicTags !== undefined
          ? {
              topicTags: body.topicTags as unknown as Prisma.InputJsonValue,
            }
          : {}),
        ...(body.targetSize !== undefined
          ? { targetSize: body.targetSize }
          : {}),
        ...(body.kickoffPrompt !== undefined
          ? { kickoffPrompt: body.kickoffPrompt }
          : {}),
        ...(body.status !== undefined ? { status: body.status } : {}),
        ...(body.cadence
          ? {
              cadenceType: body.cadence.kind,
              cadenceConfig: body.cadence as unknown as Prisma.InputJsonValue,
              nextSessionAt: this.computeNextSessionAt(
                body.cadence,
                new Date(),
              ),
            }
          : {}),
      },
    });
  }

  async archiveCircle(circleId: string, ownerUserId: string) {
    await this.requireCircleOwnership(circleId, ownerUserId);
    return this.prisma.recurringCircle.update({
      where: { id: circleId },
      data: {
        status: "archived",
        nextSessionAt: null,
      },
    });
  }

  async pauseCircle(circleId: string, ownerUserId: string) {
    await this.requireCircleOwnership(circleId, ownerUserId);
    return this.prisma.recurringCircle.update({
      where: { id: circleId },
      data: { status: "paused" },
    });
  }

  async resumeCircle(circleId: string, ownerUserId: string) {
    const circle = await this.requireCircleOwnership(circleId, ownerUserId);
    const cadence =
      circle.cadenceConfig as unknown as RecurringCircleCreateBody["cadence"];
    return this.prisma.recurringCircle.update({
      where: { id: circleId },
      data: {
        status: "active",
        nextSessionAt: this.computeNextSessionAt(cadence, new Date()),
      },
    });
  }

  async listMembers(circleId: string, userId: string) {
    await this.assertCircleAccess(circleId, userId);
    return this.prisma.recurringCircleMember.findMany({
      where: {
        circleId,
        status: { in: ["active", "invited"] },
      },
      orderBy: [{ role: "asc" }, { createdAt: "asc" }],
    });
  }

  async addMember(
    circleId: string,
    ownerUserId: string,
    body: RecurringCircleAddMemberBody,
  ) {
    await this.requireCircleOwnership(circleId, ownerUserId);

    return this.prisma.recurringCircleMember.upsert({
      where: {
        circleId_userId: {
          circleId,
          userId: body.userId,
        },
      },
      update: {
        role: body.role,
        status: "active",
        leftAt: null,
        joinedAt: new Date(),
        invitedByUserId: ownerUserId,
      },
      create: {
        circleId,
        userId: body.userId,
        role: body.role,
        status: "active",
        joinedAt: new Date(),
        invitedByUserId: ownerUserId,
      },
    });
  }

  async removeMember(
    circleId: string,
    ownerUserId: string,
    memberUserId: string,
  ) {
    const circle = await this.requireCircleOwnership(circleId, ownerUserId);
    if (memberUserId === circle.ownerUserId) {
      throw new ForbiddenException("cannot remove circle owner");
    }

    const existing = await this.prisma.recurringCircleMember.findUnique({
      where: {
        circleId_userId: {
          circleId,
          userId: memberUserId,
        },
      },
    });
    if (!existing) {
      throw new NotFoundException("circle member not found");
    }

    return this.prisma.recurringCircleMember.update({
      where: { id: existing.id },
      data: {
        status: "removed",
        leftAt: new Date(),
      },
    });
  }

  async listSessions(circleId: string, userId: string, limit = 50) {
    await this.assertCircleAccess(circleId, userId);
    return this.prisma.recurringCircleSession.findMany({
      where: { circleId },
      orderBy: { scheduledFor: "desc" },
      take: limit,
    });
  }

  async createSessionNow(circleId: string, ownerUserId: string) {
    const circle = await this.requireCircleOwnership(circleId, ownerUserId);
    const now = new Date();
    const session = await this.openCircleSession(circle, now, "manual");

    const cadence =
      circle.cadenceConfig as unknown as RecurringCircleCreateBody["cadence"];
    await this.prisma.recurringCircle.update({
      where: { id: circle.id },
      data: {
        lastSessionAt: now,
        nextSessionAt: this.computeNextSessionAt(cadence, now),
        lastFailureAt: null,
        lastFailureReason: null,
      },
    });

    await this.notifyCircleMembers(circle.id, circle.title);
    return session;
  }

  async dispatchDueSessions() {
    await this.assertLaunchAction("recurring_circles");
    const now = new Date();
    const circles = await this.prisma.recurringCircle.findMany({
      where: {
        status: "active",
        nextSessionAt: { lte: now },
      },
      orderBy: { nextSessionAt: "asc" },
      take: 50,
    });
    let failures = 0;

    for (const circle of circles) {
      try {
        const cadence =
          circle.cadenceConfig as unknown as RecurringCircleCreateBody["cadence"];
        const scheduledFor = circle.nextSessionAt ?? now;
        await this.openCircleSession(circle, scheduledFor, "scheduled");
        await this.prisma.recurringCircle.update({
          where: { id: circle.id },
          data: {
            lastSessionAt: now,
            nextSessionAt: this.computeNextSessionAt(cadence, now),
            lastFailureAt: null,
            lastFailureReason: null,
          },
        });
        await this.notifyCircleMembers(circle.id, circle.title);
      } catch (error) {
        failures += 1;
        await this.prisma.recurringCircle.update({
          where: { id: circle.id },
          data: {
            lastFailureAt: now,
            lastFailureReason:
              error instanceof Error
                ? error.message.slice(0, 300)
                : "session_open_failed",
          },
        });
      }
    }

    return { dispatched: circles.length - failures, failures };
  }

  async listAdminCircles(query: RecurringCircleListQuery) {
    const limit = query.limit ?? DEFAULT_LIST_LIMIT;
    return this.prisma.recurringCircle.findMany({
      where: query.status ? { status: query.status } : undefined,
      orderBy: [{ nextSessionAt: "asc" }, { createdAt: "desc" }],
      take: limit,
      include: {
        _count: {
          select: { members: true, sessions: true },
        },
      },
    });
  }

  async listAdminSessions(circleId: string, limit = 100) {
    await this.requireCircle(circleId);
    return this.prisma.recurringCircleSession.findMany({
      where: { circleId },
      orderBy: { scheduledFor: "desc" },
      take: limit,
    });
  }

  private async notifyCircleMembers(circleId: string, title: string) {
    if (!this.notificationsService) {
      return;
    }
    const members = await this.prisma.recurringCircleMember.findMany({
      where: {
        circleId,
        status: "active",
      },
      select: { userId: true },
    });

    await Promise.all(
      members.map((member) =>
        this.notificationsService!.createInAppNotification(
          member.userId,
          NotificationType.REMINDER,
          `Your recurring circle '${title}' is ready.`,
        ),
      ),
    );
  }

  private async openCircleSession(
    circle: {
      id: string;
      ownerUserId: string;
      title: string;
      kickoffPrompt: string | null;
      topicTags: Prisma.JsonValue | null;
    },
    scheduledFor: Date,
    trigger: "manual" | "scheduled",
  ) {
    const startedAt = new Date();
    const session = await this.prisma.recurringCircleSession.create({
      data: {
        circleId: circle.id,
        scheduledFor,
        status: "opened",
        summary:
          trigger === "manual"
            ? `Recurring circle session opened for ${circle.title}.`
            : `Scheduled recurring circle session opened for ${circle.title}.`,
        startedAt,
      },
    });

    try {
      const intent = await this.createSessionIntent(circle, session.id);
      if (intent) {
        await this.prisma.recurringCircleSession.update({
          where: { id: session.id },
          data: {
            generatedIntentId: intent.id,
            summary: `Recurring circle session opened for ${circle.title}; intent ${intent.id} is in matching.`,
          },
        });
      }
    } catch (error) {
      await this.prisma.recurringCircleSession.update({
        where: { id: session.id },
        data: {
          summary: `Recurring circle session opened for ${circle.title}; intent generation failed.`,
        },
      });
      await this.prisma.recurringCircle.update({
        where: { id: circle.id },
        data: {
          lastFailureAt: new Date(),
          lastFailureReason:
            error instanceof Error
              ? error.message.slice(0, 300)
              : "session_intent_generation_failed",
        },
      });
    }
    return session;
  }

  private async createSessionIntent(
    circle: {
      id: string;
      ownerUserId: string;
      title: string;
      kickoffPrompt: string | null;
      topicTags: Prisma.JsonValue | null;
    },
    sessionId: string,
  ) {
    if (!this.intentsService) {
      return null;
    }
    const traceId = randomUUID();
    const topicTags = Array.isArray(circle.topicTags)
      ? circle.topicTags.filter(
          (value): value is string => typeof value === "string",
        )
      : [];
    const tagsSuffix =
      topicTags.length > 0 ? ` Topics: ${topicTags.join(", ")}.` : "";
    const rawText = circle.kickoffPrompt?.trim().length
      ? `${circle.kickoffPrompt.trim()}${tagsSuffix}`
      : `Open the recurring circle '${circle.title}' for this session.${tagsSuffix}`;

    const ownerThread = this.agentService
      ? await this.agentService.findPrimaryThreadSummaryForUser(
          circle.ownerUserId,
        )
      : null;
    const intent = await this.intentsService.createIntent(
      circle.ownerUserId,
      rawText,
      traceId,
      ownerThread?.id,
    );

    if (this.agentService && ownerThread) {
      await this.agentService.appendWorkflowUpdate(
        ownerThread.id,
        `Recurring circle '${circle.title}' session opened and matching started.`,
        {
          category: "recurring_circle_session",
          circleId: circle.id,
          sessionId,
          intentId: intent.id,
          traceId,
        },
      );
    }

    return intent;
  }

  private async assertCircleAccess(circleId: string, userId: string) {
    const circle = await this.requireCircle(circleId);
    if (circle.ownerUserId === userId) {
      return circle;
    }
    const membership = await this.prisma.recurringCircleMember.findUnique({
      where: {
        circleId_userId: {
          circleId,
          userId,
        },
      },
    });
    if (!membership || membership.status !== "active") {
      throw new ForbiddenException("recurring circle is not accessible");
    }
    return circle;
  }

  private async requireCircleOwnership(circleId: string, ownerUserId: string) {
    const circle = await this.requireCircle(circleId);
    if (circle.ownerUserId !== ownerUserId) {
      throw new ForbiddenException("recurring circle is not owned by user");
    }
    return circle;
  }

  private async requireCircle(circleId: string) {
    const circle = await this.prisma.recurringCircle.findUnique({
      where: { id: circleId },
    });
    if (!circle) {
      throw new NotFoundException("recurring circle not found");
    }
    return circle;
  }

  private computeNextSessionAt(
    cadence: RecurringCircleCreateBody["cadence"],
    from: Date,
  ) {
    if (cadence.days.length === 0) {
      throw new ForbiddenException("circle cadence days cannot be empty");
    }
    return computeNextWeeklyOccurrence({
      days: cadence.days,
      hour: cadence.hour,
      minute: cadence.minute,
      timezone: cadence.timezone,
      from,
      intervalWeeks: cadence.intervalWeeks,
    });
  }

  private async assertLaunchAction(
    action: "recurring_circles",
    userId?: string,
  ) {
    if (!this.launchControlsService) {
      return;
    }
    await this.launchControlsService.assertActionAllowed(action, userId);
  }
}
