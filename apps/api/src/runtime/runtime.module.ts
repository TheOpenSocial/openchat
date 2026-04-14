import { Module } from "@nestjs/common";
import { NotificationsModule } from "../notifications/notifications.module.js";
import { ProtocolModule } from "../protocol/protocol.module.js";
import { RuntimeController } from "./runtime.controller.js";
import { RuntimeService } from "./runtime.service.js";

@Module({
  imports: [NotificationsModule, ProtocolModule],
  controllers: [RuntimeController],
  providers: [RuntimeService],
  exports: [RuntimeService],
})
export class RuntimeModule {}
