import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import {
  moderationAssessBodySchema,
  moderationBlockBodySchema,
  moderationIssueStrikeBodySchema,
  moderationReportBodySchema,
  uuidSchema,
} from "@opensocial/types";
import { ok } from "../common/api-response.js";
import { ActorUserId } from "../common/actor-user-id.decorator.js";
import { assertActorOwnsUser } from "../common/auth-context.js";
import { parseRequestPayload } from "../common/validation.js";
import { ModerationService } from "./moderation.service.js";

@Controller("moderation")
export class ModerationController {
  constructor(private readonly moderationService: ModerationService) {}

  @Post("assess")
  async assess(@Body() body: unknown, @ActorUserId() actorUserId: string) {
    const payload = parseRequestPayload(moderationAssessBodySchema, body);
    if (payload.userId) {
      assertActorOwnsUser(
        actorUserId,
        payload.userId,
        "moderation assess user does not match authenticated user",
      );
    }
    return ok(
      this.moderationService.assessContentRisk({
        content: payload.content,
        context: payload.context,
        surface: payload.surface,
      }),
    );
  }

  @Post("reports")
  async report(@Body() body: unknown, @ActorUserId() actorUserId: string) {
    const payload = parseRequestPayload(moderationReportBodySchema, body);
    assertActorOwnsUser(
      actorUserId,
      payload.reporterUserId,
      "reporter does not match authenticated user",
    );
    return ok(
      await this.moderationService.createReport(
        actorUserId,
        payload.targetUserId,
        payload.reason,
        payload.details,
        {
          entityType: payload.entityType,
          entityId: payload.entityId,
        },
      ),
    );
  }

  @Post("blocks")
  async block(@Body() body: unknown, @ActorUserId() actorUserId: string) {
    const payload = parseRequestPayload(moderationBlockBodySchema, body);
    assertActorOwnsUser(
      actorUserId,
      payload.blockerUserId,
      "blocker does not match authenticated user",
    );
    return ok(
      await this.moderationService.blockUser(
        actorUserId,
        payload.blockedUserId,
      ),
    );
  }

  @Post("strikes")
  async issueStrike(@Body() body: unknown, @ActorUserId() actorUserId: string) {
    const payload = parseRequestPayload(moderationIssueStrikeBodySchema, body);
    assertActorOwnsUser(
      actorUserId,
      payload.moderatorUserId,
      "moderator does not match authenticated user",
    );
    return ok(
      await this.moderationService.issueStrike({
        moderatorUserId: actorUserId,
        targetUserId: payload.targetUserId,
        reason: payload.reason,
        severity: payload.severity ?? 1,
        entityType: payload.entityType,
        entityId: payload.entityId,
      }),
    );
  }

  @Get("users/:userId/enforcement")
  async getEnforcementStatus(
    @Param("userId") userIdParam: string,
    @ActorUserId() actorUserId: string,
  ) {
    const userId = parseRequestPayload(uuidSchema, userIdParam);
    assertActorOwnsUser(
      actorUserId,
      userId,
      "enforcement status does not belong to authenticated user",
    );
    return ok(await this.moderationService.getEnforcementStatus(userId));
  }
}
