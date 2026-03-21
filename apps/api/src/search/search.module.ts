import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module.js";
import { LaunchControlsModule } from "../launch-controls/launch-controls.module.js";
import { SearchController } from "./search.controller.js";
import { SearchService } from "./search.service.js";

@Module({
  imports: [DatabaseModule, LaunchControlsModule],
  controllers: [SearchController],
  providers: [SearchService],
  exports: [SearchService],
})
export class SearchModule {}
