import { BullModule } from "@nestjs/bullmq";
import { Module, forwardRef } from "@nestjs/common";
import { AnalyticsModule } from "../analytics/analytics.module.js";
import { AgentModule } from "../agent/agent.module.js";
import { MatchingModule } from "../matching/matching.module.js";
import { NotificationsModule } from "../notifications/notifications.module.js";
import { PersonalizationModule } from "../personalization/personalization.module.js";
import { RealtimeModule } from "../realtime/realtime.module.js";
import { IntentsController } from "./intents.controller.js";
import { IntentsService } from "./intents.service.js";

@Module({
  imports: [
    BullModule.registerQueue(
      { name: "intent-processing" },
      { name: "notification" },
    ),
    MatchingModule,
    NotificationsModule,
    PersonalizationModule,
    forwardRef(() => AgentModule),
    AnalyticsModule,
    RealtimeModule,
  ],
  providers: [IntentsService],
  controllers: [IntentsController],
  exports: [IntentsService],
})
export class IntentsModule {}
