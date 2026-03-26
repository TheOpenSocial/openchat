import { Global, Module } from "@nestjs/common";
import { AppCacheService } from "../common/app-cache.service.js";
import { AgentWorkflowRuntimeService } from "./agent-workflow-runtime.service.js";
import { ClientMutationService } from "./client-mutation.service.js";
import { DatabaseLatencyService } from "./database-latency.service.js";
import { PrismaService } from "./prisma.service.js";

@Global()
@Module({
  providers: [
    PrismaService,
    DatabaseLatencyService,
    AppCacheService,
    ClientMutationService,
    AgentWorkflowRuntimeService,
  ],
  exports: [
    PrismaService,
    DatabaseLatencyService,
    AppCacheService,
    ClientMutationService,
    AgentWorkflowRuntimeService,
  ],
})
export class DatabaseModule {}
