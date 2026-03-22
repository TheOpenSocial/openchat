import {
  Body,
  Controller,
  Get,
  Optional,
  Param,
  Post,
  Put,
} from "@nestjs/common";
import {
  globalRulesBodySchema,
  lifeGraphBehaviorSignalBodySchema,
  lifeGraphExplicitEdgeBodySchema,
  lifeGraphUpsertNodesBodySchema,
  retrievalContextQueryBodySchema,
  retrievalInteractionSummaryBodySchema,
  ruleDecisionExplainBodySchema,
  uuidSchema,
} from "@opensocial/types";
import { ok } from "../common/api-response.js";
import { ActorUserId } from "../common/actor-user-id.decorator.js";
import { assertActorOwnsUser } from "../common/auth-context.js";
import { LaunchControlsService } from "../launch-controls/launch-controls.service.js";
import { parseRequestPayload } from "../common/validation.js";
import {
  type GlobalRules,
  PersonalizationService,
} from "./personalization.service.js";

@Controller("personalization")
export class PersonalizationController {
  constructor(
    private readonly personalizationService: PersonalizationService,
    @Optional()
    private readonly launchControlsService?: LaunchControlsService,
  ) {}

  @Get(":userId/rules/global")
  async getGlobalRules(
    @Param("userId") userIdParam: string,
    @ActorUserId() actorUserId: string,
  ) {
    const userId = this.parseOwnedUserId(userIdParam, actorUserId);
    await this.assertPersonalizationEnabled(userId);
    return ok(await this.personalizationService.getGlobalRules(userId));
  }

  @Put(":userId/rules/global")
  async putGlobalRules(
    @Param("userId") userIdParam: string,
    @Body() body: unknown,
    @ActorUserId() actorUserId: string,
  ) {
    const userId = this.parseOwnedUserId(userIdParam, actorUserId);
    await this.assertPersonalizationEnabled(userId);
    const rawPayload = globalRulesBodySchema.parse(body) as GlobalRules & {
      timezone?: string;
    };
    const payload: GlobalRules = {
      ...rawPayload,
      timezone: rawPayload.timezone ?? "UTC",
    };
    return ok(
      await this.personalizationService.setGlobalRules(userId, payload),
    );
  }

  @Get(":userId/life-graph")
  async getLifeGraph(
    @Param("userId") userIdParam: string,
    @ActorUserId() actorUserId: string,
  ) {
    const userId = this.parseOwnedUserId(userIdParam, actorUserId);
    await this.assertPersonalizationEnabled(userId);
    return ok(await this.personalizationService.getLifeGraph(userId));
  }

  @Post(":userId/life-graph/nodes")
  async upsertLifeGraphNodes(
    @Param("userId") userIdParam: string,
    @Body() body: unknown,
    @ActorUserId() actorUserId: string,
  ) {
    const userId = this.parseOwnedUserId(userIdParam, actorUserId);
    await this.assertPersonalizationEnabled(userId);
    const payload = parseRequestPayload(lifeGraphUpsertNodesBodySchema, body);
    return ok(
      await this.personalizationService.upsertLifeGraphNodes(
        userId,
        payload.nodes,
      ),
    );
  }

  @Post(":userId/life-graph/edges/explicit")
  async setExplicitLifeGraphEdge(
    @Param("userId") userIdParam: string,
    @Body() body: unknown,
    @ActorUserId() actorUserId: string,
  ) {
    const userId = this.parseOwnedUserId(userIdParam, actorUserId);
    await this.assertPersonalizationEnabled(userId);
    const payload = parseRequestPayload(lifeGraphExplicitEdgeBodySchema, body);
    return ok(
      await this.personalizationService.setExplicitLifeGraphEdge(
        userId,
        payload,
      ),
    );
  }

  @Post(":userId/life-graph/signals")
  async recordLifeGraphSignal(
    @Param("userId") userIdParam: string,
    @Body() body: unknown,
    @ActorUserId() actorUserId: string,
  ) {
    const userId = this.parseOwnedUserId(userIdParam, actorUserId);
    await this.assertPersonalizationEnabled(userId);
    const payload = parseRequestPayload(
      lifeGraphBehaviorSignalBodySchema,
      body,
    );
    return ok(
      await this.personalizationService.recordBehaviorSignal(userId, payload),
    );
  }

  @Post(":userId/retrieval/profile-summary/refresh")
  async refreshProfileSummary(
    @Param("userId") userIdParam: string,
    @ActorUserId() actorUserId: string,
  ) {
    const userId = this.parseOwnedUserId(userIdParam, actorUserId);
    await this.assertPersonalizationEnabled(userId);
    return ok(
      await this.personalizationService.refreshProfileSummaryDocument(userId),
    );
  }

  @Post(":userId/retrieval/preference-memory/refresh")
  async refreshPreferenceMemory(
    @Param("userId") userIdParam: string,
    @ActorUserId() actorUserId: string,
  ) {
    const userId = this.parseOwnedUserId(userIdParam, actorUserId);
    await this.assertPersonalizationEnabled(userId);
    return ok(
      await this.personalizationService.refreshPreferenceMemoryDocument(userId),
    );
  }

  @Post(":userId/retrieval/interactions")
  async storeInteractionSummary(
    @Param("userId") userIdParam: string,
    @Body() body: unknown,
    @ActorUserId() actorUserId: string,
  ) {
    const userId = this.parseOwnedUserId(userIdParam, actorUserId);
    await this.assertPersonalizationEnabled(userId);
    const payload = parseRequestPayload(
      retrievalInteractionSummaryBodySchema,
      body,
    );
    return ok(
      await this.personalizationService.storeInteractionSummary(
        userId,
        payload,
      ),
    );
  }

  @Post(":userId/retrieval/query")
  async queryRetrievalContext(
    @Param("userId") userIdParam: string,
    @Body() body: unknown,
    @ActorUserId() actorUserId: string,
  ) {
    const userId = this.parseOwnedUserId(userIdParam, actorUserId);
    await this.assertPersonalizationEnabled(userId);
    const payload = parseRequestPayload(retrievalContextQueryBodySchema, body);
    return ok(
      await this.personalizationService.retrievePersonalizationContext(
        userId,
        payload,
      ),
    );
  }

  @Post(":userId/policy/explain")
  async explainPolicyDecision(
    @Param("userId") userIdParam: string,
    @Body() body: unknown,
    @ActorUserId() actorUserId: string,
  ) {
    const userId = this.parseOwnedUserId(userIdParam, actorUserId);
    await this.assertPersonalizationEnabled(userId);
    const payload = parseRequestPayload(ruleDecisionExplainBodySchema, body);
    const { context, ...decisionInput } = payload;
    return ok(
      await this.personalizationService.explainDecision(
        userId,
        decisionInput,
        context,
      ),
    );
  }

  private async assertPersonalizationEnabled(userId: string) {
    if (!this.launchControlsService) {
      return;
    }
    await this.launchControlsService.assertActionAllowed(
      "personalization",
      userId,
    );
  }

  private parseOwnedUserId(userIdParam: string, actorUserId: string) {
    const userId = parseRequestPayload(uuidSchema, userIdParam);
    assertActorOwnsUser(
      actorUserId,
      userId,
      "personalization target does not match authenticated user",
    );
    return userId;
  }
}
