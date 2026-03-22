import { BullModule } from "@nestjs/bullmq";
import { Module, forwardRef } from "@nestjs/common";
import { AgentModule } from "../agent/agent.module.js";
import { DiscoveryModule } from "../discovery/discovery.module.js";
import { LaunchControlsModule } from "../launch-controls/launch-controls.module.js";
import { NotificationsModule } from "../notifications/notifications.module.js";
import { ScheduledTasksController } from "./scheduled-tasks.controller.js";
import { ScheduledTasksService } from "./scheduled-tasks.service.js";

@Module({
  imports: [
    BullModule.registerQueue({ name: "scheduled-tasks" }),
    DiscoveryModule,
    NotificationsModule,
    forwardRef(() => AgentModule),
    LaunchControlsModule,
  ],
  providers: [ScheduledTasksService],
  controllers: [ScheduledTasksController],
  exports: [ScheduledTasksService],
})
export class ScheduledTasksModule {}
