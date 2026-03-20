import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  Param,
  Post,
} from "@nestjs/common";
import {
  bulkInboxRequestActionBodySchema,
  cancelIntentRequestBodySchema,
  uuidSchema,
} from "@opensocial/types";
import { timingSafeEqual } from "node:crypto";
import { ok } from "../common/api-response.js";
import { ActorUserId } from "../common/actor-user-id.decorator.js";
import { assertActorOwnsUser } from "../common/auth-context.js";
import { parseRequestPayload } from "../common/validation.js";
import { InboxService } from "./inbox.service.js";

@Controller("inbox/requests")
export class InboxController {
  constructor(private readonly inboxService: InboxService) {}

  @Get(":userId")
  async listPending(
    @Param("userId") userIdParam: string,
    @ActorUserId() actorUserId: string,
  ) {
    const userId = parseRequestPayload(uuidSchema, userIdParam);
    assertActorOwnsUser(
      actorUserId,
      userId,
      "inbox does not belong to authenticated user",
    );
    return ok(await this.inboxService.listPendingRequests(userId));
  }

  @Post(":requestId/accept")
  async accept(
    @Param("requestId") requestIdParam: string,
    @ActorUserId() actorUserId: string,
  ) {
    const requestId = parseRequestPayload(uuidSchema, requestIdParam);
    return ok(
      await this.inboxService.updateStatus(requestId, "accepted", actorUserId),
    );
  }

  @Post(":requestId/reject")
  async reject(
    @Param("requestId") requestIdParam: string,
    @ActorUserId() actorUserId: string,
  ) {
    const requestId = parseRequestPayload(uuidSchema, requestIdParam);
    return ok(
      await this.inboxService.updateStatus(requestId, "rejected", actorUserId),
    );
  }

  @Post(":requestId/cancel")
  async cancel(
    @Param("requestId") requestIdParam: string,
    @Body() body: unknown,
    @ActorUserId() actorUserId: string,
  ) {
    const requestId = parseRequestPayload(uuidSchema, requestIdParam);
    const payload = parseRequestPayload(cancelIntentRequestBodySchema, body);
    assertActorOwnsUser(
      actorUserId,
      payload.originatorUserId,
      "request originator does not match authenticated user",
    );
    return ok(
      await this.inboxService.cancelByOriginator(requestId, actorUserId),
    );
  }

  @Post("expire-stale")
  async expireStale(@Headers("x-cron-key") cronKeyHeader?: string | string[]) {
    this.assertCronAccessAllowed(cronKeyHeader);
    return ok(await this.inboxService.expireStaleRequests());
  }

  @Post("bulk")
  async bulkAction(@Body() body: unknown, @ActorUserId() actorUserId: string) {
    const payload = parseRequestPayload(bulkInboxRequestActionBodySchema, body);
    assertActorOwnsUser(
      actorUserId,
      payload.recipientUserId,
      "inbox action does not belong to authenticated user",
    );
    return ok(
      await this.inboxService.bulkAction({
        recipientUserId: actorUserId,
        requestIds: payload.requestIds,
        action: payload.action,
        snoozeMinutes: payload.snoozeMinutes,
      }),
    );
  }

  private assertCronAccessAllowed(cronKeyHeader?: string | string[]) {
    const requiredCronKey = process.env.INBOX_EXPIRE_STALE_CRON_KEY?.trim();
    const environment = (process.env.NODE_ENV ?? "").trim().toLowerCase();
    if (!requiredCronKey) {
      if (environment === "production") {
        throw new ForbiddenException(
          "stale-expiry endpoint is disabled without INBOX_EXPIRE_STALE_CRON_KEY",
        );
      }
      return;
    }

    const providedCronKey = Array.isArray(cronKeyHeader)
      ? cronKeyHeader[0]
      : cronKeyHeader;
    if (
      !this.constantTimeEqual(providedCronKey?.trim() ?? "", requiredCronKey)
    ) {
      throw new ForbiddenException("invalid cron key");
    }
  }

  private constantTimeEqual(left: string, right: string) {
    const leftBuffer = Buffer.from(left);
    const rightBuffer = Buffer.from(right);
    if (leftBuffer.length !== rightBuffer.length) {
      return false;
    }
    return timingSafeEqual(leftBuffer, rightBuffer);
  }
}
