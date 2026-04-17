import { InjectQueue } from "@nestjs/bullmq";
import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  Optional,
  Param,
  Post,
} from "@nestjs/common";
import {
  bulkInboxRequestActionBodySchema,
  cancelIntentRequestBodySchema,
  uuidSchema,
} from "@opensocial/types";
import { Queue } from "bullmq";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { ok } from "../common/api-response.js";
import { ActorUserId } from "../common/actor-user-id.decorator.js";
import { assertActorOwnsUser } from "../common/auth-context.js";
import { parseRequestPayload } from "../common/validation.js";
import { ProtocolService } from "../protocol/protocol.service.js";
import { InboxService } from "./inbox.service.js";

@Controller("inbox/requests")
export class InboxController {
  constructor(
    private readonly inboxService: InboxService,
    @Optional()
    private readonly protocolService?: ProtocolService,
    @Optional()
    @InjectQueue("cleanup")
    private readonly cleanupQueue?: Queue,
  ) {}

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
    if (!this.protocolService) {
      return ok(
        await this.inboxService.updateStatus(
          requestId,
          "accepted",
          actorUserId,
        ),
      );
    }

    const result = await this.protocolService.acceptFirstPartyRequestAction(
      requestId,
      {
        actorUserId,
        metadata: {
          source: "inbox.controller.accept",
        },
      },
    );
    return ok({
      request: await this.inboxService.getOwnedRequest(requestId, actorUserId),
      ...(result.queued ? { queued: true } : {}),
      ...(result.unchanged ? { unchanged: true } : {}),
    });
  }

  @Post(":requestId/reject")
  async reject(
    @Param("requestId") requestIdParam: string,
    @ActorUserId() actorUserId: string,
  ) {
    const requestId = parseRequestPayload(uuidSchema, requestIdParam);
    if (!this.protocolService) {
      return ok(
        await this.inboxService.updateStatus(
          requestId,
          "rejected",
          actorUserId,
        ),
      );
    }

    const result = await this.protocolService.rejectFirstPartyRequestAction(
      requestId,
      {
        actorUserId,
        metadata: {
          source: "inbox.controller.reject",
        },
      },
    );
    return ok({
      request: await this.inboxService.getOwnedRequest(requestId, actorUserId),
      ...(result.unchanged ? { unchanged: true } : {}),
    });
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
    if (this.protocolService) {
      const result = await this.protocolService.cancelFirstPartyRequestAction({
        requestId,
        actorUserId,
        metadata: {
          source: "inbox.controller.cancel",
        },
      });
      return ok({
        request: await this.inboxService.getOwnedRequest(
          requestId,
          actorUserId,
        ),
        ...(result.unchanged ? { unchanged: true } : {}),
      });
    }
    return ok(
      await this.inboxService.cancelByOriginator(requestId, actorUserId),
    );
  }

  @Post("expire-stale")
  async expireStale(@Headers("x-cron-key") cronKeyHeader?: string | string[]) {
    this.assertCronAccessAllowed(cronKeyHeader);
    const staleResult = await this.inboxService.expireStaleRequests();
    const cleanupResult = await this.enqueueDailyModerationRetentionCleanup();
    if (!cleanupResult) {
      return ok(staleResult);
    }
    return ok({
      ...staleResult,
      moderationRetentionCleanupEnqueued: cleanupResult.enqueued,
      moderationRetentionCleanupJobId: cleanupResult.jobId,
    });
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

  private async enqueueDailyModerationRetentionCleanup() {
    if (!this.cleanupQueue) {
      return null;
    }
    const retentionDays = Number.parseInt(
      process.env.MODERATION_DECISION_RETENTION_DAYS ?? "180",
      10,
    );
    const idempotencyKey = `moderation-retention:auto:${new Date().toISOString().slice(0, 10)}`;
    const job = await this.cleanupQueue.add(
      "ModerationDecisionRetentionCleanup",
      {
        version: 1,
        traceId: randomUUID(),
        idempotencyKey,
        timestamp: new Date().toISOString(),
        retentionDays:
          Number.isFinite(retentionDays) && retentionDays >= 1
            ? retentionDays
            : 180,
      },
      {
        jobId: idempotencyKey,
        attempts: 2,
        removeOnComplete: 500,
      },
    );
    return {
      enqueued: true,
      jobId: job.id ? String(job.id) : null,
    };
  }
}
