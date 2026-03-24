import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Optional,
  Post,
  UnauthorizedException,
  Headers,
} from "@nestjs/common";
import {
  onboardingActivationPlanBodySchema,
  onboardingInferBodySchema,
} from "@opensocial/types";
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
  model: z.string().min(1).max(120).optional(),
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

  @Post("activation-plan")
  async activationPlan(
    @Body() body: unknown,
    @ActorUserId() actorUserId: string,
  ) {
    const payload = parseRequestPayload(
      onboardingActivationPlanBodySchema,
      body,
    );
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
    return ok(await this.onboardingService.buildActivationPlan(payload));
  }

  @PublicRoute()
  @Post("probe")
  async probe(
    @Body() body: unknown,
    @Headers("x-onboarding-probe-token") providedToken?: string,
  ) {
    this.assertProbeAuthorized(providedToken);

    const payload = parseRequestPayload(onboardingProbeBodySchema, body);
    const mode = payload.mode ?? "fast";
    const startedAt = Date.now();
    const modelOverride = payload.model?.trim() || undefined;

    const result =
      mode === "rich"
        ? await this.onboardingService.inferFromTranscript(
            "onboarding-probe",
            payload.transcript,
            { modelOverride },
          )
        : await this.onboardingService.inferQuickFromTranscript(
            "onboarding-probe",
            payload.transcript,
            { modelOverride },
          );

    return ok({
      mode,
      model: modelOverride ?? null,
      durationMs: Date.now() - startedAt,
      result,
    });
  }

  @PublicRoute()
  @Get("probe-config")
  async probeConfig(
    @Headers("x-onboarding-probe-token") providedToken?: string,
  ) {
    this.assertProbeAuthorized(providedToken);
    const baseUrl = null;
    const provider = "openai";
    const fastModel =
      process.env.ONBOARDING_LLM_FAST_MODEL?.trim() ||
      process.env.ONBOARDING_LLM_MODEL?.trim() ||
      null;
    const richModel =
      process.env.ONBOARDING_LLM_RICH_MODEL?.trim() ||
      process.env.ONBOARDING_LLM_MODEL?.trim() ||
      null;
    const timeoutMs = Number(process.env.ONBOARDING_LLM_TIMEOUT_MS ?? 4_000);
    const richTimeoutMs = Number(
      process.env.ONBOARDING_LLM_RICH_TIMEOUT_MS ?? 15_000,
    );

    return ok({
      provider,
      baseUrl,
      fastModel,
      richModel,
      timeoutMs,
      richTimeoutMs,
      hasApiKey: Boolean(process.env.OPENAI_API_KEY?.trim()),
      apiKeyPrefix: (process.env.OPENAI_API_KEY?.trim() || "").slice(0, 6),
    });
  }

  private assertProbeAuthorized(providedToken?: string) {
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
  }
}
