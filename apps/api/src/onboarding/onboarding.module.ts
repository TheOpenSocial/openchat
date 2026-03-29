import { Module } from "@nestjs/common";
import { AgentModule } from "../agent/agent.module.js";
import { DiscoveryModule } from "../discovery/discovery.module.js";
import { LaunchControlsModule } from "../launch-controls/launch-controls.module.js";
import { PersonalizationModule } from "../personalization/personalization.module.js";
import { OnboardingController } from "./onboarding.controller.js";
import { OnboardingService } from "./onboarding.service.js";

@Module({
  imports: [
    LaunchControlsModule,
    DiscoveryModule,
    AgentModule,
    PersonalizationModule,
  ],
  controllers: [OnboardingController],
  providers: [OnboardingService],
  exports: [OnboardingService],
})
export class OnboardingModule {}
