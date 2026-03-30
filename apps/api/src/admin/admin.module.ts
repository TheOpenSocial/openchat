import { Module } from "@nestjs/common";
import { AnalyticsModule } from "../analytics/analytics.module.js";
import { AuthModule } from "../auth/auth.module.js";
import { ChatsModule } from "../chats/chats.module.js";
import { DatabaseModule } from "../database/database.module.js";
import { IntentsModule } from "../intents/intents.module.js";
import { JobsModule } from "../jobs/jobs.module.js";
import { ModerationModule } from "../moderation/moderation.module.js";
import { NotificationsModule } from "../notifications/notifications.module.js";
import { PersonalizationModule } from "../personalization/personalization.module.js";
import { AdminPlaygroundController } from "./admin-playground.controller.js";
import { AdminPlaygroundService } from "./admin-playground.service.js";
import { SocialSimController } from "./social-sim.controller.js";
import { SocialSimService } from "./social-sim.service.js";
import { AgenticEvalsService } from "./agentic-evals.service.js";
import { AdminAuditService } from "./admin-audit.service.js";
import { AdminController } from "./admin.controller.js";

@Module({
  imports: [
    AuthModule,
    JobsModule,
    AnalyticsModule,
    DatabaseModule,
    IntentsModule,
    ModerationModule,
    PersonalizationModule,
    NotificationsModule,
    ChatsModule,
  ],
  providers: [
    AdminAuditService,
    AgenticEvalsService,
    AdminPlaygroundService,
    SocialSimService,
  ],
  controllers: [
    AdminController,
    AdminPlaygroundController,
    SocialSimController,
  ],
})
export class AdminModule {}
