import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { AuthModule } from "./auth/auth.module.js";
import { AccessTokenGuard } from "./auth/access-token.guard.js";
import { ProfilesModule } from "./profiles/profiles.module.js";
import { AgentModule } from "./agent/agent.module.js";
import { IntentsModule } from "./intents/intents.module.js";
import { InboxModule } from "./inbox/inbox.module.js";
import { ChatsModule } from "./chats/chats.module.js";
import { ConnectionsModule } from "./connections/connections.module.js";
import { ModerationModule } from "./moderation/moderation.module.js";
import { AdminModule } from "./admin/admin.module.js";
import { RealtimeModule } from "./realtime/realtime.module.js";
import { JobsModule } from "./jobs/jobs.module.js";
import { NotificationsModule } from "./notifications/notifications.module.js";
import { PersonalizationModule } from "./personalization/personalization.module.js";
import { MatchingModule } from "./matching/matching.module.js";
import { DatabaseModule } from "./database/database.module.js";
import { DiscoveryModule } from "./discovery/discovery.module.js";
import { AnalyticsModule } from "./analytics/analytics.module.js";
import { PrivacyModule } from "./privacy/privacy.module.js";
import { ComplianceModule } from "./compliance/compliance.module.js";
import { LaunchControlsModule } from "./launch-controls/launch-controls.module.js";
import { ScheduledTasksModule } from "./scheduled-tasks/scheduled-tasks.module.js";
import { RecurringCirclesModule } from "./recurring-circles/recurring-circles.module.js";
import { HealthController } from "./health/health.controller.js";
import { SearchModule } from "./search/search.module.js";
import { OnboardingModule } from "./onboarding/onboarding.module.js";
import { RuntimeModule } from "./runtime/runtime.module.js";

@Module({
  controllers: [HealthController],
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    BullModule.forRoot({
      connection: {
        host: process.env.REDIS_HOST ?? "127.0.0.1",
        port: Number(process.env.REDIS_PORT ?? 6379),
      },
    }),
    DatabaseModule,
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
    ScheduledTasksModule,
    RecurringCirclesModule,
    SearchModule,
    OnboardingModule,
    RuntimeModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: AccessTokenGuard,
    },
  ],
})
export class AppModule {}
