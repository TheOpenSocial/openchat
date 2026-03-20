import { Module } from "@nestjs/common";
import { LaunchControlsModule } from "../launch-controls/launch-controls.module.js";
import { NotificationsModule } from "../notifications/notifications.module.js";
import { RecurringCirclesController } from "./recurring-circles.controller.js";
import { RecurringCirclesService } from "./recurring-circles.service.js";

@Module({
  imports: [LaunchControlsModule, NotificationsModule],
  providers: [RecurringCirclesService],
  controllers: [RecurringCirclesController],
  exports: [RecurringCirclesService],
})
export class RecurringCirclesModule {}
