import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";
import { AnalyticsModule } from "../analytics/analytics.module.js";
import { MatchingModule } from "../matching/matching.module.js";
import { ModerationModule } from "../moderation/moderation.module.js";
import { NotificationsModule } from "../notifications/notifications.module.js";
import { ProfilesController } from "./profiles.controller.js";
import { ProfilesService } from "./profiles.service.js";

@Module({
  imports: [
    BullModule.registerQueue({ name: "media-processing" }),
    NotificationsModule,
    MatchingModule,
    AnalyticsModule,
    ModerationModule,
  ],
  providers: [ProfilesService],
  controllers: [ProfilesController],
  exports: [ProfilesService],
})
export class ProfilesModule {}
