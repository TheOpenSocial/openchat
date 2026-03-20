import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import {
  analyticsCoreMetricsQuerySchema,
  analyticsListEventsQuerySchema,
  analyticsTrackEventBodySchema,
  uuidSchema,
} from "@opensocial/types";
import { ok } from "../common/api-response.js";
import { ActorUserId } from "../common/actor-user-id.decorator.js";
import { assertActorOwnsUser } from "../common/auth-context.js";
import { parseRequestPayload } from "../common/validation.js";
import { AnalyticsService } from "./analytics.service.js";

@Controller("analytics")
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Post("events")
  async trackEvent(@Body() body: unknown, @ActorUserId() actorUserId: string) {
    const payload = parseRequestPayload(analyticsTrackEventBodySchema, body);
    if (payload.actorUserId) {
      assertActorOwnsUser(
        actorUserId,
        payload.actorUserId,
        "analytics actor does not match authenticated user",
      );
    }
    return ok(
      await this.analyticsService.trackEvent({
        ...payload,
        actorUserId,
      }),
    );
  }

  @Get("events")
  async listEvents(
    @Query() query: unknown,
    @ActorUserId() actorUserId: string,
  ) {
    const payload = parseRequestPayload(analyticsListEventsQuerySchema, query);
    if (payload.actorUserId) {
      assertActorOwnsUser(
        actorUserId,
        payload.actorUserId,
        "analytics actor filter does not match authenticated user",
      );
    }
    return ok(
      await this.analyticsService.listEvents({
        ...payload,
        actorUserId,
      }),
    );
  }

  @Get("metrics/core")
  async coreMetrics(@Query() query: unknown) {
    const payload = parseRequestPayload(analyticsCoreMetricsQuerySchema, query);
    return ok(await this.analyticsService.getCoreMetrics(payload));
  }

  @Get("experiments/guardrails")
  async experimentGuardrails() {
    return ok(await this.analyticsService.getExperimentGuardrails());
  }

  @Get("experiments/users/:userId/assignments")
  async experimentAssignments(
    @Param("userId") userIdParam: string,
    @ActorUserId() actorUserId: string,
  ) {
    const userId = parseRequestPayload(uuidSchema, userIdParam);
    assertActorOwnsUser(
      actorUserId,
      userId,
      "experiment assignments do not belong to authenticated user",
    );
    return ok(await this.analyticsService.getExperimentAssignments(userId));
  }
}
