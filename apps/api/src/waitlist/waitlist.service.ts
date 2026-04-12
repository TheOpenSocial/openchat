import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../database/prisma.service.js";

interface CreateWaitlistEntryInput {
  email: string;
  source?: string;
  ipAddress?: string | null;
  referer?: string | null;
  userAgent?: string | null;
}

@Injectable()
export class WaitlistService {
  constructor(private readonly prisma: PrismaService) {}

  async createOrRefreshEntry(input: CreateWaitlistEntryInput) {
    const normalizedEmail = input.email.trim().toLowerCase();
    const source = input.source?.trim() || "web";
    const notes = this.buildNotes(input);

    const entry = await this.prisma.waitlistEntry.upsert({
      where: {
        normalizedEmail,
      },
      update: {
        email: normalizedEmail,
        source,
        status: "pending",
        ipAddress: input.ipAddress ?? null,
        referer: input.referer ?? null,
        userAgent: input.userAgent ?? null,
        ...(notes ? { notes } : {}),
      },
      create: {
        email: normalizedEmail,
        normalizedEmail,
        source,
        status: "pending",
        ipAddress: input.ipAddress ?? null,
        referer: input.referer ?? null,
        userAgent: input.userAgent ?? null,
        ...(notes ? { notes } : {}),
      },
      select: {
        id: true,
        email: true,
        normalizedEmail: true,
        source: true,
        status: true,
        createdAt: true,
      },
    });

    return {
      ...entry,
      createdAt: entry.createdAt.toISOString(),
    };
  }

  private buildNotes(
    input: CreateWaitlistEntryInput,
  ): Prisma.JsonObject | null {
    const noteEntries = Object.entries({
      referer: input.referer ?? undefined,
      userAgent: input.userAgent ?? undefined,
    }).filter(([, value]) => typeof value === "string" && value.length > 0);

    if (noteEntries.length === 0) {
      return null;
    }

    return Object.fromEntries(noteEntries) satisfies Prisma.JsonObject;
  }
}
