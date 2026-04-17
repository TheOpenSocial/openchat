import { Module, forwardRef } from "@nestjs/common";
import { AnalyticsModule } from "../analytics/analytics.module.js";
import { AgentModule } from "../agent/agent.module.js";
import { ChatsModule } from "../chats/chats.module.js";
import { ExecutionReconciliationModule } from "../execution-reconciliation/execution-reconciliation.module.js";
import { MatchingModule } from "../matching/matching.module.js";
import { NotificationsModule } from "../notifications/notifications.module.js";
import { PersonalizationModule } from "../personalization/personalization.module.js";
import { ProtocolModule } from "../protocol/protocol.module.js";
import { ConnectionSetupService } from "./connection-setup.service.js";
import { ConnectionsController } from "./connections.controller.js";
import { ConnectionsService } from "./connections.service.js";

@Module({
  imports: [
    forwardRef(() => ProtocolModule),
    ChatsModule,
    NotificationsModule,
    PersonalizationModule,
    ExecutionReconciliationModule,
    MatchingModule,
    forwardRef(() => AgentModule),
    AnalyticsModule,
  ],
  providers: [ConnectionsService, ConnectionSetupService],
  controllers: [ConnectionsController],
  exports: [ConnectionsService, ConnectionSetupService],
})
export class ConnectionsModule {}
