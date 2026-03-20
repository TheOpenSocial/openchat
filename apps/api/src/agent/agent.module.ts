import { Module } from "@nestjs/common";
import { ModerationModule } from "../moderation/moderation.module.js";
import { AgentConversationService } from "./agent-conversation.service.js";
import { AgentController } from "./agent.controller.js";
import { AgentService } from "./agent.service.js";

@Module({
  imports: [ModerationModule],
  providers: [AgentService, AgentConversationService],
  controllers: [AgentController],
  exports: [AgentService, AgentConversationService],
})
export class AgentModule {}
