import { Module, forwardRef } from "@nestjs/common";
import { AgentModule } from "../agent/agent.module.js";
import { IntentsModule } from "../intents/intents.module.js";
import { LaunchControlsModule } from "../launch-controls/launch-controls.module.js";
import { NotificationsModule } from "../notifications/notifications.module.js";
import { RecurringCirclesController } from "./recurring-circles.controller.js";
import { RecurringCirclesService } from "./recurring-circles.service.js";

@Module({
  imports: [
    LaunchControlsModule,
    NotificationsModule,
    IntentsModule,
    forwardRef(() => AgentModule),
  ],
  providers: [RecurringCirclesService],
  controllers: [RecurringCirclesController],
  exports: [RecurringCirclesService],
})
export class RecurringCirclesModule {}
