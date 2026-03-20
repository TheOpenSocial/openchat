import { Module } from "@nestjs/common";
import { ChatsModule } from "../chats/chats.module.js";
import { DatabaseModule } from "../database/database.module.js";
import { IntentsModule } from "../intents/intents.module.js";
import { JobsModule } from "../jobs/jobs.module.js";
import { ModerationModule } from "../moderation/moderation.module.js";
import { NotificationsModule } from "../notifications/notifications.module.js";
import { PersonalizationModule } from "../personalization/personalization.module.js";
import { AgenticEvalsService } from "./agentic-evals.service.js";
import { AdminAuditService } from "./admin-audit.service.js";
import { AdminController } from "./admin.controller.js";

@Module({
  imports: [
    JobsModule,
    DatabaseModule,
    IntentsModule,
    ModerationModule,
    PersonalizationModule,
    NotificationsModule,
    ChatsModule,
  ],
  providers: [AdminAuditService, AgenticEvalsService],
  controllers: [AdminController],
})
export class AdminModule {}
