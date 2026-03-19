import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { cancelIntentRequestBodySchema, uuidSchema } from "@opensocial/types";
import { ok } from "../common/api-response.js";
import { parseRequestPayload } from "../common/validation.js";
import { InboxService } from "./inbox.service.js";

@Controller("inbox/requests")
export class InboxController {
  constructor(private readonly inboxService: InboxService) {}

  @Get(":userId")
  async listPending(@Param("userId") userIdParam: string) {
    const userId = parseRequestPayload(uuidSchema, userIdParam);
    return ok(await this.inboxService.listPendingRequests(userId));
  }

  @Post(":requestId/accept")
  async accept(@Param("requestId") requestIdParam: string) {
    const requestId = parseRequestPayload(uuidSchema, requestIdParam);
    return ok(await this.inboxService.updateStatus(requestId, "accepted"));
  }

  @Post(":requestId/reject")
  async reject(@Param("requestId") requestIdParam: string) {
    const requestId = parseRequestPayload(uuidSchema, requestIdParam);
    return ok(await this.inboxService.updateStatus(requestId, "rejected"));
  }

  @Post(":requestId/cancel")
  async cancel(
    @Param("requestId") requestIdParam: string,
    @Body() body: unknown,
  ) {
    const requestId = parseRequestPayload(uuidSchema, requestIdParam);
    const payload = parseRequestPayload(cancelIntentRequestBodySchema, body);
    return ok(
      await this.inboxService.cancelByOriginator(
        requestId,
        payload.originatorUserId,
      ),
    );
  }

  @Post("expire-stale")
  async expireStale() {
    return ok(await this.inboxService.expireStaleRequests());
  }
}
