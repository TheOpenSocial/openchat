import { Body, Controller, Param, Post } from "@nestjs/common";
import { notificationMarkReadBodySchema, uuidSchema } from "@opensocial/types";
import { ok } from "../common/api-response.js";
import { ActorUserId } from "../common/actor-user-id.decorator.js";
import { assertActorOwnsUser } from "../common/auth-context.js";
import { parseRequestPayload } from "../common/validation.js";
import { NotificationsService } from "./notifications.service.js";

@Controller("notifications")
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Post(":userId/digest")
  async sendDigest(
    @Param("userId") userIdParam: string,
    @ActorUserId() actorUserId: string,
  ) {
    const userId = parseRequestPayload(uuidSchema, userIdParam);
    assertActorOwnsUser(
      actorUserId,
      userId,
      "digest target does not match authenticated user",
    );
    return ok(await this.notificationsService.sendDigestNow(userId));
  }

  @Post(":notificationId/read")
  async markRead(
    @Param("notificationId") notificationIdParam: string,
    @Body() body: unknown,
    @ActorUserId() actorUserId: string,
  ) {
    const notificationId = parseRequestPayload(uuidSchema, notificationIdParam);
    const payload = parseRequestPayload(notificationMarkReadBodySchema, body);
    assertActorOwnsUser(
      actorUserId,
      payload.userId,
      "notification actor does not match authenticated user",
    );
    return ok(
      await this.notificationsService.markNotificationRead(
        notificationId,
        actorUserId,
      ),
    );
  }
}
