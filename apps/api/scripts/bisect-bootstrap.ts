import "reflect-metadata";
import { BullModule } from "@nestjs/bullmq";
import { Module, Logger } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { NestFactory } from "@nestjs/core";

import { AccessTokenGuard } from "../src/auth/access-token.guard.js";
import { AuthModule } from "../src/auth/auth.module.js";
import { ProfilesModule } from "../src/profiles/profiles.module.js";
import { AgentModule } from "../src/agent/agent.module.js";
import { IntentsModule } from "../src/intents/intents.module.js";
import { InboxModule } from "../src/inbox/inbox.module.js";
import { ChatsModule } from "../src/chats/chats.module.js";
import { ConnectionsModule } from "../src/connections/connections.module.js";
import { ModerationModule } from "../src/moderation/moderation.module.js";
import { AdminModule } from "../src/admin/admin.module.js";
import { RealtimeModule } from "../src/realtime/realtime.module.js";
import { JobsModule } from "../src/jobs/jobs.module.js";
import { NotificationsModule } from "../src/notifications/notifications.module.js";
import { PersonalizationModule } from "../src/personalization/personalization.module.js";
import { MatchingModule } from "../src/matching/matching.module.js";
import { DatabaseModule } from "../src/database/database.module.js";
import { DiscoveryModule } from "../src/discovery/discovery.module.js";
import { AnalyticsModule } from "../src/analytics/analytics.module.js";
import { PrivacyModule } from "../src/privacy/privacy.module.js";
import { ComplianceModule } from "../src/compliance/compliance.module.js";
import { LaunchControlsModule } from "../src/launch-controls/launch-controls.module.js";

const logger = new Logger("Bisect");

const modules = [
  AuthModule,
  ProfilesModule,
  AgentModule,
  IntentsModule,
  InboxModule,
  ChatsModule,
  ConnectionsModule,
  ModerationModule,
  AdminModule,
  RealtimeModule,
  JobsModule,
  NotificationsModule,
  PersonalizationModule,
  MatchingModule,
  DiscoveryModule,
  AnalyticsModule,
  PrivacyModule,
  ComplianceModule,
  LaunchControlsModule,
] as const;

const baseImports = [
  ConfigModule.forRoot({ isGlobal: true }),
  BullModule.forRoot({
    connection: {
      host: process.env.REDIS_HOST ?? "127.0.0.1",
      port: Number(process.env.REDIS_PORT ?? 6379),
    },
  }),
  DatabaseModule,
];

function timeout(ms: number): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error(`timeout_${ms}ms`)), ms);
  });
}

async function runIncremental() {
  const imports: unknown[] = [...baseImports];
  for (const moduleRef of modules) {
    imports.push(moduleRef);
    @Module({
      imports: [...imports],
      providers: [
        {
          provide: APP_GUARD,
          useClass: AccessTokenGuard,
        },
      ],
    })
    class TestModule {}

    const label = moduleRef.name;
    try {
      const app = await Promise.race([
        NestFactory.create(TestModule, {
          logger: false,
        }),
        timeout(15000),
      ]);
      await app.close();
      logger.log(`ok ${label}`);
    } catch (error) {
      logger.error(`fail ${label}: ${String(error)}`);
      process.exit(1);
    }
  }
  logger.log("all incremental imports booted");
}

void runIncremental();
