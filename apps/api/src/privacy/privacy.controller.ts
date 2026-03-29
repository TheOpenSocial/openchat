import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import {
  privacyDeleteAccountBodySchema,
  privacyDeleteMessagesBodySchema,
  privacyResetMemoryBodySchema,
  uuidSchema,
} from "@opensocial/types";
import { PublicRoute } from "../auth/public-route.decorator.js";
import { ok } from "../common/api-response.js";
import { ActorUserId } from "../common/actor-user-id.decorator.js";
import { assertActorOwnsUser } from "../common/auth-context.js";
import { parseRequestPayload } from "../common/validation.js";
import { PrivacyService } from "./privacy.service.js";

@Controller("privacy")
export class PrivacyController {
  constructor(private readonly privacyService: PrivacyService) {}

  @PublicRoute()
  @Get("policy")
  getPolicy() {
    return ok(this.privacyService.getRetentionPolicy());
  }

  @Get(":userId/export")
  async exportUserData(
    @Param("userId") userIdParam: string,
    @ActorUserId() actorUserId: string,
  ) {
    const userId = parseRequestPayload(uuidSchema, userIdParam);
    assertActorOwnsUser(actorUserId, userId, "user data not owned by actor");
    return ok(await this.privacyService.exportUserData(userId));
  }

  @Post(":userId/messages/delete")
  async deleteMessages(
    @Param("userId") userIdParam: string,
    @Body() body: unknown,
    @ActorUserId() actorUserId: string,
  ) {
    const userId = parseRequestPayload(uuidSchema, userIdParam);
    const payload = parseRequestPayload(privacyDeleteMessagesBodySchema, body);
    assertActorOwnsUser(actorUserId, userId, "user data not owned by actor");
    if (payload.actorUserId) {
      assertActorOwnsUser(
        actorUserId,
        payload.actorUserId,
        "actor mismatch for message deletion",
      );
    }
    return ok(
      await this.privacyService.deleteAllSentMessages(userId, {
        actorUserId: payload.actorUserId,
        reason: payload.reason,
      }),
    );
  }

  @Post(":userId/memory/reset")
  async resetMemory(
    @Param("userId") userIdParam: string,
    @Body() body: unknown,
    @ActorUserId() actorUserId: string,
  ) {
    const userId = parseRequestPayload(uuidSchema, userIdParam);
    const payload = parseRequestPayload(privacyResetMemoryBodySchema, body);
    assertActorOwnsUser(actorUserId, userId, "user data not owned by actor");
    if (payload.actorUserId) {
      assertActorOwnsUser(
        actorUserId,
        payload.actorUserId,
        "actor mismatch for memory reset",
      );
    }
    return ok(
      await this.privacyService.resetUserMemory(userId, {
        mode: payload.mode ?? "learned_memory",
        actorUserId: payload.actorUserId,
        reason: payload.reason,
        domains: payload.domains,
        surfaces: payload.surfaces,
      }),
    );
  }

  @Post(":userId/account/delete")
  async deleteAccount(
    @Param("userId") userIdParam: string,
    @Body() body: unknown,
    @ActorUserId() actorUserId: string,
  ) {
    const userId = parseRequestPayload(uuidSchema, userIdParam);
    const payload = parseRequestPayload(privacyDeleteAccountBodySchema, body);
    assertActorOwnsUser(actorUserId, userId, "account not owned by actor");
    if (payload.actorUserId) {
      assertActorOwnsUser(
        actorUserId,
        payload.actorUserId,
        "actor mismatch for account deletion",
      );
    }
    return ok(
      await this.privacyService.deleteAccount(userId, {
        actorUserId: payload.actorUserId,
        reason: payload.reason,
      }),
    );
  }
}
