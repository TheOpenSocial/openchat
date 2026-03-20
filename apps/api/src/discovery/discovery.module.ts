import { Module } from "@nestjs/common";
import { AgentModule } from "../agent/agent.module.js";
import { InboxModule } from "../inbox/inbox.module.js";
import { MatchingModule } from "../matching/matching.module.js";
import { PersonalizationModule } from "../personalization/personalization.module.js";
import { DiscoveryController } from "./discovery.controller.js";
import { DiscoveryService } from "./discovery.service.js";

@Module({
  imports: [MatchingModule, PersonalizationModule, AgentModule, InboxModule],
  providers: [DiscoveryService],
  controllers: [DiscoveryController],
  exports: [DiscoveryService],
})
export class DiscoveryModule {}
