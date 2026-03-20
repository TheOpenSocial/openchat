import { Module } from "@nestjs/common";
import { AnalyticsModule } from "../analytics/analytics.module.js";
import { DatabaseModule } from "../database/database.module.js";
import { PersonalizationController } from "./personalization.controller.js";
import { PersonalizationService } from "./personalization.service.js";

@Module({
  imports: [DatabaseModule, AnalyticsModule],
  providers: [PersonalizationService],
  controllers: [PersonalizationController],
  exports: [PersonalizationService],
})
export class PersonalizationModule {}
