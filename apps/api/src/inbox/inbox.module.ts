import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { AnalyticsModule } from "../analytics/analytics.module.js";
import { NotificationsModule } from "../notifications/notifications.module.js";
import { PersonalizationModule } from "../personalization/personalization.module.js";
import { RealtimeModule } from "../realtime/realtime.module.js";
import { InboxController } from "./inbox.controller.js";
import { InboxService } from "./inbox.service.js";

@Module({
  imports: [
    BullModule.registerQueue({ name: "connection-setup" }),
    NotificationsModule,
    PersonalizationModule,
    AnalyticsModule,
    RealtimeModule,
  ],
  providers: [InboxService],
  controllers: [InboxController],
  exports: [InboxService],
})
export class InboxModule {}
