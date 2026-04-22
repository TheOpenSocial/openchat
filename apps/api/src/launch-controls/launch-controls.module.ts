import { Global, Module } from "@nestjs/common";
import { AdminAuditService } from "../admin/admin-audit.service.js";
import { DatabaseModule } from "../database/database.module.js";
import { LaunchControlsController } from "./launch-controls.controller.js";
import { LaunchControlsService } from "./launch-controls.service.js";

@Global()
@Module({
  imports: [DatabaseModule],
  providers: [LaunchControlsService, AdminAuditService],
  controllers: [LaunchControlsController],
  exports: [LaunchControlsService],
})
export class LaunchControlsModule {}
