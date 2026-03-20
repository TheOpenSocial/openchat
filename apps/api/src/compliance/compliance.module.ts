import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module.js";
import { ComplianceController } from "./compliance.controller.js";
import { ComplianceService } from "./compliance.service.js";

@Module({
  imports: [DatabaseModule],
  controllers: [ComplianceController],
  providers: [ComplianceService],
  exports: [ComplianceService],
})
export class ComplianceModule {}
