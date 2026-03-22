import { Body, Controller, Optional, Post } from "@nestjs/common";
import { onboardingInferBodySchema } from "@opensocial/types";
import { ok } from "../common/api-response.js";
import { ActorUserId } from "../common/actor-user-id.decorator.js";
import { assertActorOwnsUser } from "../common/auth-context.js";
import { parseRequestPayload } from "../common/validation.js";
import { LaunchControlsService } from "../launch-controls/launch-controls.service.js";
import { OnboardingService } from "./onboarding.service.js";

@Controller("onboarding")
export class OnboardingController {
  constructor(
    private readonly onboardingService: OnboardingService,
    @Optional()
    private readonly launchControlsService?: LaunchControlsService,
  ) {}

  @Post("infer")
  async infer(@Body() body: unknown, @ActorUserId() actorUserId: string) {
    const payload = parseRequestPayload(onboardingInferBodySchema, body);
    assertActorOwnsUser(
      actorUserId,
      payload.userId,
      "onboarding target does not match authenticated user",
    );
    if (this.launchControlsService) {
      await this.launchControlsService.assertActionAllowed(
        "discovery",
        payload.userId,
      );
    }
    return ok(
      await this.onboardingService.inferFromTranscript(
        payload.userId,
        payload.transcript,
      ),
    );
  }
}
