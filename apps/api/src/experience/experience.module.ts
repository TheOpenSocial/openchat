import { Module, forwardRef } from "@nestjs/common";
import { AgentModule } from "../agent/agent.module.js";
import { DiscoveryModule } from "../discovery/discovery.module.js";
import { InboxModule } from "../inbox/inbox.module.js";
import { IntentsModule } from "../intents/intents.module.js";
import { ExperienceController } from "./experience.controller.js";
import { ExperienceService } from "./experience.service.js";

@Module({
  imports: [
    forwardRef(() => AgentModule),
    DiscoveryModule,
    InboxModule,
    IntentsModule,
  ],
  providers: [ExperienceService],
  controllers: [ExperienceController],
  exports: [ExperienceService],
})
export class ExperienceModule {}
