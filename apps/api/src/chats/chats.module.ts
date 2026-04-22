import { BullModule } from "@nestjs/bullmq";
import { Module, forwardRef } from "@nestjs/common";
import { AnalyticsModule } from "../analytics/analytics.module.js";
import { ModerationModule } from "../moderation/moderation.module.js";
import { PersonalizationModule } from "../personalization/personalization.module.js";
import { RealtimeModule } from "../realtime/realtime.module.js";
import { ChatsController } from "./chats.controller.js";
import { ChatsService } from "./chats.service.js";

@Module({
  imports: [
    BullModule.registerQueue({ name: "moderation" }),
    AnalyticsModule,
    forwardRef(() => ModerationModule),
    forwardRef(() => RealtimeModule),
    PersonalizationModule,
  ],
  providers: [ChatsService],
  controllers: [ChatsController],
  exports: [ChatsService],
})
export class ChatsModule {}
