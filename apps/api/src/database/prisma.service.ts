import { INestApplication, Injectable, OnModuleInit } from "@nestjs/common";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  constructor() {
    const databaseUrl = PrismaService.resolveDatabaseUrl();
    const adapter = new PrismaPg({
      connectionString: databaseUrl,
    });
    super({
      adapter,
    });
  }

  private static resolveDatabaseUrl(): string {
    const configured = process.env.DATABASE_URL?.trim();
    if (configured) {
      return configured;
    }

    const environment = (process.env.NODE_ENV ?? "development").trim();
    if (environment === "production") {
      throw new Error(
        "DATABASE_URL is required in production; refusing to fall back to localhost",
      );
    }

    return "postgresql://postgres:postgres@localhost:5432/opensocial";
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async enableShutdownHooks(app: INestApplication): Promise<void> {
    await app.init();
  }
}
