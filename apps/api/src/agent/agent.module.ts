import { Module, forwardRef } from "@nestjs/common";
import { AnalyticsModule } from "../analytics/analytics.module.js";
import { DiscoveryModule } from "../discovery/discovery.module.js";
import { InboxModule } from "../inbox/inbox.module.js";
import { IntentsModule } from "../intents/intents.module.js";
import { MatchingModule } from "../matching/matching.module.js";
import { ModerationModule } from "../moderation/moderation.module.js";
import { PersonalizationModule } from "../personalization/personalization.module.js";
import { ProfilesModule } from "../profiles/profiles.module.js";
import { RecurringCirclesModule } from "../recurring-circles/recurring-circles.module.js";
import { ScheduledTasksModule } from "../scheduled-tasks/scheduled-tasks.module.js";
import { AgentConversationService } from "./agent-conversation.service.js";
import { AgentController } from "./agent.controller.js";
import { AgentOutcomeToolsService } from "./agent-outcome-tools.service.js";
import { AgentService } from "./agent.service.js";

@Module({
  imports: [
    AnalyticsModule,
    ModerationModule,
    MatchingModule,
    PersonalizationModule,
    ProfilesModule,
    forwardRef(() => DiscoveryModule),
    InboxModule,
    forwardRef(() => IntentsModule),
    forwardRef(() => RecurringCirclesModule),
    forwardRef(() => ScheduledTasksModule),
  ],
  providers: [AgentService, AgentOutcomeToolsService, AgentConversationService],
  controllers: [AgentController],
  exports: [AgentService, AgentOutcomeToolsService, AgentConversationService],
})
export class AgentModule {}
