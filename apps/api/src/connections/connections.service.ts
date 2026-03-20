import { Injectable } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service.js";

@Injectable()
export class ConnectionsService {
  constructor(private readonly prisma: PrismaService) {}

  createConnection(
    type: "dm" | "group",
    createdByUserId: string,
    originIntentId?: string,
  ) {
    return this.prisma.connection.create({
      data: {
        type,
        createdByUserId,
        originIntentId,
      },
    });
  }
}
