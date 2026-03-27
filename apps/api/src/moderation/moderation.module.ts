import { Module, forwardRef } from "@nestjs/common";
import { AnalyticsModule } from "../analytics/analytics.module.js";
import { RealtimeModule } from "../realtime/realtime.module.js";
import { ModerationController } from "./moderation.controller.js";
import { ModerationService } from "./moderation.service.js";

@Module({
  imports: [AnalyticsModule, forwardRef(() => RealtimeModule)],
  providers: [ModerationService],
  controllers: [ModerationController],
  exports: [ModerationService],
})
export class ModerationModule {}
