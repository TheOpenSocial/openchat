import { Injectable, Logger } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../database/prisma.service.js";

export type AdminRole = "admin" | "support" | "moderator";

@Injectable()
export class AdminAuditService {
  private readonly logger = new Logger(AdminAuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async recordAction(input: {
    adminUserId: string;
    role: AdminRole;
    action: string;
    entityType: string;
    entityId?: string;
    metadata?: Record<string, unknown>;
  }) {
    if (!this.prisma.adminAction?.create) {
      return;
    }

    try {
      await this.prisma.adminAction.create({
        data: {
          adminUserId: input.adminUserId,
          action: input.action,
          entityType: input.entityType,
          entityId: input.entityId ?? null,
          metadata: {
            role: input.role,
            ...(input.metadata ?? {}),
          } as Prisma.InputJsonValue,
        },
      });
      if (this.prisma.auditLog?.create) {
        await this.prisma.auditLog.create({
          data: {
            actorUserId: input.adminUserId,
            actorType: "admin",
            action: "admin.action",
            entityType: input.entityType,
            entityId: input.entityId ?? null,
            metadata: {
              role: input.role,
              action: input.action,
              ...(input.metadata ?? {}),
            } as Prisma.InputJsonValue,
          },
        });
      }
    } catch (error) {
      this.logger.warn(`failed to write admin audit record: ${String(error)}`);
    }
  }

  async listAuditLogs(limit = 100) {
    if (!this.prisma.auditLog?.findMany) {
      return [];
    }

    return this.prisma.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: Math.min(Math.max(limit, 1), 250),
    });
  }

  async listModerationQueue(input?: {
    limit?: number;
    status?: "open" | "resolved" | "dismissed";
    entityType?: string;
    reasonContains?: string;
  }) {
    if (!this.prisma.moderationFlag?.findMany) {
      return [];
    }

    const limit = Math.min(Math.max(input?.limit ?? 100, 1), 250);
    return this.prisma.moderationFlag.findMany({
      where: {
        status: input?.status ?? "open",
        ...(input?.entityType ? { entityType: input.entityType } : {}),
        ...(input?.reasonContains
          ? { reason: { contains: input.reasonContains, mode: "insensitive" } }
          : {}),
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
  }
}
