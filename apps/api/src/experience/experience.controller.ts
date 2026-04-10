import { Controller, Get, Param } from "@nestjs/common";
import { ok } from "../common/api-response.js";
import { ActorUserId } from "../common/actor-user-id.decorator.js";
import { assertActorOwnsUser } from "../common/auth-context.js";
import { parseRequestPayload } from "../common/validation.js";
import { uuidSchema } from "@opensocial/types";
import { ExperienceService } from "./experience.service.js";

@Controller("experience")
export class ExperienceController {
  constructor(private readonly experienceService: ExperienceService) {}

  @Get(":userId/home-summary")
  async getHomeSummary(
    @Param("userId") userIdParam: string,
    @ActorUserId() actorUserId: string,
  ) {
    const userId = parseRequestPayload(uuidSchema, userIdParam);
    assertActorOwnsUser(
      actorUserId,
      userId,
      "experience target does not match authenticated user",
    );
    return ok(await this.experienceService.getHomeSummary(userId));
  }

  @Get(":userId/bootstrap")
  async getBootstrapSummary(
    @Param("userId") userIdParam: string,
    @ActorUserId() actorUserId: string,
  ) {
    const userId = parseRequestPayload(uuidSchema, userIdParam);
    assertActorOwnsUser(
      actorUserId,
      userId,
      "experience target does not match authenticated user",
    );
    return ok(await this.experienceService.getBootstrapSummary(userId));
  }

  @Get(":userId/activity-summary")
  async getActivitySummary(
    @Param("userId") userIdParam: string,
    @ActorUserId() actorUserId: string,
  ) {
    const userId = parseRequestPayload(uuidSchema, userIdParam);
    assertActorOwnsUser(
      actorUserId,
      userId,
      "experience target does not match authenticated user",
    );
    return ok(await this.experienceService.getActivitySummary(userId));
  }
}
