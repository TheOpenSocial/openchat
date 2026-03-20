import { Global, Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module.js";
import { LaunchControlsController } from "./launch-controls.controller.js";
import { LaunchControlsService } from "./launch-controls.service.js";

@Global()
@Module({
  imports: [DatabaseModule],
  providers: [LaunchControlsService],
  controllers: [LaunchControlsController],
  exports: [LaunchControlsService],
})
export class LaunchControlsModule {}
