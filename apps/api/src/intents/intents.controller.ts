import {
  Body,
  Controller,
  Get,
  Optional,
  Param,
  Patch,
  Post,
} from "@nestjs/common";
import {
  cancelIntentBodySchema,
  convertIntentModeBodySchema,
  createIntentBodySchema,
  createIntentFromAgentMessageBodySchema,
  intentFollowupActionBodySchema,
  summarizePendingIntentsBodySchema,
  updateIntentBodySchema,
  uuidSchema,
} from "@opensocial/types";
import { randomUUID } from "node:crypto";
import { ok } from "../common/api-response.js";
import { ActorUserId } from "../common/actor-user-id.decorator.js";
import { assertActorOwnsUser } from "../common/auth-context.js";
import { LaunchControlsService } from "../launch-controls/launch-controls.service.js";
import { parseRequestPayload } from "../common/validation.js";
import { IntentsService } from "./intents.service.js";

@Controller("intents")
export class IntentsController {
  constructor(
    private readonly intentsService: IntentsService,
    @Optional()
    private readonly launchControlsService?: LaunchControlsService,
  ) {}

  @Post()
  async createIntent(
    @Body() body: unknown,
    @ActorUserId() actorUserId: string,
  ) {
    const payload = parseRequestPayload(createIntentBodySchema, body);
    assertActorOwnsUser(
      actorUserId,
      payload.userId,
      "intent user does not match authenticated user",
    );
    if (this.launchControlsService) {
      await this.launchControlsService.assertActionAllowed(
        "new_intents",
        payload.userId,
      );
    }
    return ok(
      await this.intentsService.createIntent(
        payload.userId,
        payload.rawText,
        randomUUID(),
        payload.agentThreadId,
      ),
    );
  }

  @Post("from-agent")
  async createIntentFromAgent(
    @Body() body: unknown,
    @ActorUserId() actorUserId: string,
  ) {
    const payload = parseRequestPayload(
      createIntentFromAgentMessageBodySchema,
      body,
    );
    assertActorOwnsUser(
      actorUserId,
      payload.userId,
      "intent user does not match authenticated user",
    );
    if (this.launchControlsService) {
      await this.launchControlsService.assertActionAllowed(
        "new_intents",
        payload.userId,
      );
    }
    return ok(
      await this.intentsService.createIntentFromAgentMessage(
        payload.threadId,
        payload.userId,
        payload.content,
        {
          allowDecomposition: payload.allowDecomposition,
          maxIntents: payload.maxIntents,
        },
      ),
    );
  }

  @Patch(":intentId")
  async updateIntent(
    @Param("intentId") intentIdParam: string,
    @Body() body: unknown,
    @ActorUserId() actorUserId: string,
  ) {
    const intentId = parseRequestPayload(uuidSchema, intentIdParam);
    await this.intentsService.assertIntentOwnership(intentId, actorUserId);
    const payload = parseRequestPayload(updateIntentBodySchema, body);
    return ok(
      await this.intentsService.updateIntent(intentId, payload.rawText),
    );
  }

  @Get(":intentId/explanations")
  async listIntentExplanations(
    @Param("intentId") intentIdParam: string,
    @ActorUserId() actorUserId: string,
  ) {
    const intentId = parseRequestPayload(uuidSchema, intentIdParam);
    await this.intentsService.assertIntentOwnership(intentId, actorUserId);
    return ok(await this.intentsService.listIntentExplanations(intentId));
  }

  @Get(":intentId/explanations/user")
  async getUserFacingExplanation(
    @Param("intentId") intentIdParam: string,
    @ActorUserId() actorUserId: string,
  ) {
    const intentId = parseRequestPayload(uuidSchema, intentIdParam);
    await this.intentsService.assertIntentOwnership(intentId, actorUserId);
    return ok(
      await this.intentsService.getUserFacingIntentExplanation(intentId),
    );
  }

  @Post(":intentId/cancel")
  async cancelIntent(
    @Param("intentId") intentIdParam: string,
    @Body() body: unknown,
    @ActorUserId() actorUserId: string,
  ) {
    const intentId = parseRequestPayload(uuidSchema, intentIdParam);
    await this.intentsService.assertIntentOwnership(intentId, actorUserId);
    const payload = parseRequestPayload(cancelIntentBodySchema, body ?? {});
    if (payload.userId) {
      assertActorOwnsUser(
        actorUserId,
        payload.userId,
        "intent user does not match authenticated user",
      );
    }
    return ok(
      await this.intentsService.cancelIntent(intentId, {
        userId: actorUserId,
        agentThreadId: payload.agentThreadId,
      }),
    );
  }

  @Post(":intentId/retry")
  async retryIntent(
    @Param("intentId") intentIdParam: string,
    @Body() body: unknown,
    @ActorUserId() actorUserId: string,
  ) {
    const intentId = parseRequestPayload(uuidSchema, intentIdParam);
    await this.intentsService.assertIntentOwnership(intentId, actorUserId);
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
    @ActorUserId() actorUserId: string,
  ) {
    const intentId = parseRequestPayload(uuidSchema, intentIdParam);
    await this.intentsService.assertIntentOwnership(intentId, actorUserId);
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

  @Post("summarize-pending")
  async summarizePending(
    @Body() body: unknown,
    @ActorUserId() actorUserId: string,
  ) {
    const payload = parseRequestPayload(
      summarizePendingIntentsBodySchema,
      body,
    );
    assertActorOwnsUser(
      actorUserId,
      payload.userId,
      "intent user does not match authenticated user",
    );
    return ok(
      await this.intentsService.summarizePendingIntents(
        payload.userId,
        payload.agentThreadId,
        payload.maxIntents,
      ),
    );
  }

  @Post(":intentId/convert")
  async convertIntentMode(
    @Param("intentId") intentIdParam: string,
    @Body() body: unknown,
    @ActorUserId() actorUserId: string,
  ) {
    const intentId = parseRequestPayload(uuidSchema, intentIdParam);
    await this.intentsService.assertIntentOwnership(intentId, actorUserId);
    const payload = parseRequestPayload(convertIntentModeBodySchema, body);
    return ok(
      await this.intentsService.convertIntentMode(intentId, payload.mode, {
        groupSizeTarget: payload.groupSizeTarget,
      }),
    );
  }
}
