import { Controller, Get, Optional, Param, Query } from "@nestjs/common";
import { searchQuerySchema, uuidSchema } from "@opensocial/types";
import { ok } from "../common/api-response.js";
import { ActorUserId } from "../common/actor-user-id.decorator.js";
import { assertActorOwnsUser } from "../common/auth-context.js";
import { parseRequestPayload } from "../common/validation.js";
import { LaunchControlsService } from "../launch-controls/launch-controls.service.js";
import { SearchService } from "./search.service.js";

@Controller("search")
export class SearchController {
  constructor(
    private readonly searchService: SearchService,
    @Optional()
    private readonly launchControlsService?: LaunchControlsService,
  ) {}

  @Get(":userId")
  async search(
    @Param("userId") userIdParam: string,
    @Query() query: unknown,
    @ActorUserId() actorUserId: string,
  ) {
    const userId = parseRequestPayload(uuidSchema, userIdParam);
    assertActorOwnsUser(
      actorUserId,
      userId,
      "search target does not match authenticated user",
    );
    if (this.launchControlsService) {
      await this.launchControlsService.assertActionAllowed("discovery", userId);
    }
    const payload = parseRequestPayload(searchQuerySchema, query);
    return ok(
      await this.searchService.search(userId, payload.q, payload.limit),
    );
  }

  @Get(":userId/topic-suggestions")
  async topicSuggestions(
    @Param("userId") userIdParam: string,
    @Query("q") query: string | undefined,
    @Query("limit") limitRaw: string | undefined,
    @ActorUserId() actorUserId: string,
  ) {
    const userId = parseRequestPayload(uuidSchema, userIdParam);
    assertActorOwnsUser(
      actorUserId,
      userId,
      "search target does not match authenticated user",
    );
    if (this.launchControlsService) {
      await this.launchControlsService.assertActionAllowed("discovery", userId);
    }

    const limit = Number(limitRaw);
    return ok(
      await this.searchService.topicSuggestions(
        query ?? "",
        Number.isFinite(limit) ? limit : 12,
      ),
    );
  }
}
