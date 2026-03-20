import {
  Body,
  Controller,
  Get,
  Optional,
  Param,
  Post,
  Query,
} from "@nestjs/common";
import {
  discoveryAgentRecommendationsBodySchema,
  discoveryQuerySchema,
  uuidSchema,
} from "@opensocial/types";
import { ok } from "../common/api-response.js";
import { ActorUserId } from "../common/actor-user-id.decorator.js";
import { assertActorOwnsUser } from "../common/auth-context.js";
import { LaunchControlsService } from "../launch-controls/launch-controls.service.js";
import { parseRequestPayload } from "../common/validation.js";
import { DiscoveryService } from "./discovery.service.js";

@Controller("discovery")
export class DiscoveryController {
  constructor(
    private readonly discoveryService: DiscoveryService,
    @Optional()
    private readonly launchControlsService?: LaunchControlsService,
  ) {}

  @Get(":userId/tonight")
  async suggestTonight(
    @Param("userId") userIdParam: string,
    @Query() query: unknown,
    @ActorUserId() actorUserId: string,
  ) {
    const userId = this.parseOwnedUserId(userIdParam, actorUserId);
    await this.assertDiscoveryEnabled(userId);
    const payload = parseRequestPayload(discoveryQuerySchema, query);
    return ok(
      await this.discoveryService.suggestTonight(userId, payload.limit),
    );
  }

  @Get(":userId/passive")
  async passiveDiscovery(
    @Param("userId") userIdParam: string,
    @Query() query: unknown,
    @ActorUserId() actorUserId: string,
  ) {
    const userId = this.parseOwnedUserId(userIdParam, actorUserId);
    await this.assertDiscoveryEnabled(userId);
    const payload = parseRequestPayload(discoveryQuerySchema, query);
    return ok(
      await this.discoveryService.getPassiveDiscovery(userId, payload.limit),
    );
  }

  @Get(":userId/inbox-suggestions")
  async inboxSuggestions(
    @Param("userId") userIdParam: string,
    @Query() query: unknown,
    @ActorUserId() actorUserId: string,
  ) {
    const userId = this.parseOwnedUserId(userIdParam, actorUserId);
    await this.assertDiscoveryEnabled(userId);
    const payload = parseRequestPayload(discoveryQuerySchema, query);
    return ok(
      await this.discoveryService.getInboxSuggestions(userId, payload.limit),
    );
  }

  @Post(":userId/agent-recommendations")
  async publishAgentRecommendations(
    @Param("userId") userIdParam: string,
    @Body() body: unknown,
    @ActorUserId() actorUserId: string,
  ) {
    const userId = this.parseOwnedUserId(userIdParam, actorUserId);
    await this.assertDiscoveryEnabled(userId);
    const payload = parseRequestPayload(
      discoveryAgentRecommendationsBodySchema,
      body ?? {},
    );
    return ok(
      await this.discoveryService.publishAgentRecommendations(userId, payload),
    );
  }

  private async assertDiscoveryEnabled(userId: string) {
    if (!this.launchControlsService) {
      return;
    }
    await this.launchControlsService.assertActionAllowed("discovery", userId);
  }

  private parseOwnedUserId(userIdParam: string, actorUserId: string) {
    const userId = parseRequestPayload(uuidSchema, userIdParam);
    assertActorOwnsUser(
      actorUserId,
      userId,
      "discovery target does not match authenticated user",
    );
    return userId;
  }
}
