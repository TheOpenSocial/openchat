import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";
import { AnalyticsModule } from "../analytics/analytics.module.js";
import { ModerationModule } from "../moderation/moderation.module.js";
import { ChatsController } from "./chats.controller.js";
import { ChatsService } from "./chats.service.js";

@Module({
  imports: [
    BullModule.registerQueue({ name: "moderation" }),
    AnalyticsModule,
    ModerationModule,
  ],
  providers: [ChatsService],
  controllers: [ChatsController],
  exports: [ChatsService],
})
export class ChatsModule {}
