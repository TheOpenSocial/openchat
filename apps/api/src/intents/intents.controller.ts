import { Body, Controller, Param, Patch, Post } from "@nestjs/common";
import {
  createIntentBodySchema,
  intentFollowupActionBodySchema,
  updateIntentBodySchema,
  uuidSchema,
} from "@opensocial/types";
import { randomUUID } from "node:crypto";
import { ok } from "../common/api-response.js";
import { parseRequestPayload } from "../common/validation.js";
import { IntentsService } from "./intents.service.js";

@Controller("intents")
export class IntentsController {
  constructor(private readonly intentsService: IntentsService) {}

  @Post()
  async createIntent(@Body() body: unknown) {
    const payload = parseRequestPayload(createIntentBodySchema, body);
    return ok(
      await this.intentsService.createIntent(
        payload.userId,
        payload.rawText,
        randomUUID(),
        payload.agentThreadId,
      ),
    );
  }

  @Patch(":intentId")
  async updateIntent(
    @Param("intentId") intentIdParam: string,
    @Body() body: unknown,
  ) {
    const intentId = parseRequestPayload(uuidSchema, intentIdParam);
    const payload = parseRequestPayload(updateIntentBodySchema, body);
    return ok(
      await this.intentsService.updateIntent(intentId, payload.rawText),
    );
  }

  @Post(":intentId/cancel")
  async cancelIntent(@Param("intentId") intentIdParam: string) {
    const intentId = parseRequestPayload(uuidSchema, intentIdParam);
    return ok(await this.intentsService.cancelIntent(intentId));
  }

  @Post(":intentId/retry")
  async retryIntent(
    @Param("intentId") intentIdParam: string,
    @Body() body: unknown,
  ) {
    const intentId = parseRequestPayload(uuidSchema, intentIdParam);
    const payload = parseRequestPayload(
      intentFollowupActionBodySchema,
      body ?? {},
    );
    return ok(
      await this.intentsService.retryIntent(
        intentId,
        randomUUID(),
        payload.agentThreadId,
      ),
    );
  }

  @Post(":intentId/widen")
  async widenIntent(
    @Param("intentId") intentIdParam: string,
    @Body() body: unknown,
  ) {
    const intentId = parseRequestPayload(uuidSchema, intentIdParam);
    const payload = parseRequestPayload(
      intentFollowupActionBodySchema,
      body ?? {},
    );
    return ok(
      await this.intentsService.widenIntentFilters(
        intentId,
        randomUUID(),
        payload.agentThreadId,
      ),
    );
  }
}
