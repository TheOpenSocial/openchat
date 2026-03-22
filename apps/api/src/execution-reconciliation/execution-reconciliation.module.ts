import { Module } from "@nestjs/common";
import { PersonalizationModule } from "../personalization/personalization.module.js";
import { ExecutionReconciliationService } from "./execution-reconciliation.service.js";

@Module({
  imports: [PersonalizationModule],
  providers: [ExecutionReconciliationService],
  exports: [ExecutionReconciliationService],
})
export class ExecutionReconciliationModule {}
