import {
  Body,
  Controller,
  ForbiddenException,
  Optional,
  Post,
  UnauthorizedException,
  Headers,
} from "@nestjs/common";
import { onboardingInferBodySchema } from "@opensocial/types";
import { z } from "zod";
import { PublicRoute } from "../auth/public-route.decorator.js";
import { ok } from "../common/api-response.js";
import { ActorUserId } from "../common/actor-user-id.decorator.js";
import { assertActorOwnsUser } from "../common/auth-context.js";
import { parseRequestPayload } from "../common/validation.js";
import { LaunchControlsService } from "../launch-controls/launch-controls.service.js";
import { OnboardingService } from "./onboarding.service.js";

const onboardingProbeBodySchema = z.object({
  transcript: z.string().min(1),
  mode: z.enum(["fast", "rich"]).optional(),
});

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

  @Post("infer-fast")
  async inferFast(@Body() body: unknown, @ActorUserId() actorUserId: string) {
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
      await this.onboardingService.inferQuickFromTranscript(
        payload.userId,
        payload.transcript,
      ),
    );
  }

  @PublicRoute()
  @Post("probe")
  async probe(
    @Body() body: unknown,
    @Headers("x-onboarding-probe-token") providedToken?: string,
  ) {
    const expectedToken = process.env.ONBOARDING_PROBE_TOKEN?.trim();
    if (!expectedToken) {
      throw new ForbiddenException("onboarding probe is disabled");
    }
    if (!providedToken?.trim()) {
      throw new UnauthorizedException("missing onboarding probe token");
    }
    if (providedToken.trim() !== expectedToken) {
      throw new UnauthorizedException("invalid onboarding probe token");
    }

    const payload = parseRequestPayload(onboardingProbeBodySchema, body);
    const mode = payload.mode ?? "fast";
    const startedAt = Date.now();

    const result =
      mode === "rich"
        ? await this.onboardingService.inferFromTranscript(
            "onboarding-probe",
            payload.transcript,
          )
        : await this.onboardingService.inferQuickFromTranscript(
            "onboarding-probe",
            payload.transcript,
          );

    return ok({
      mode,
      durationMs: Date.now() - startedAt,
      result,
    });
  }
}
