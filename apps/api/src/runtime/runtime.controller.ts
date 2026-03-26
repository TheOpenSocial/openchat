import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import {
  commerceListingResponseSchema,
  commerceOfferResponseSchema,
  createCommerceListingBodySchema,
  createCommerceOfferBodySchema,
  createDatingConsentBodySchema,
  createRuntimeIntentBodySchema,
  datingConsentResponseSchema,
  intentResponseSchema,
  respondCommerceOfferBodySchema,
  uuidSchema,
  workflowRunResponseSchema,
} from "@opensocial/types";
import { z } from "zod";
import { ok } from "../common/api-response.js";
import { ActorUserId } from "../common/actor-user-id.decorator.js";
import { assertActorOwnsUser } from "../common/auth-context.js";
import { parseRequestPayload } from "../common/validation.js";
import { RuntimeService } from "./runtime.service.js";

@Controller("runtime")
export class RuntimeController {
  constructor(private readonly runtimeService: RuntimeService) {}

  @Post("intents")
  async createIntent(
    @Body() body: unknown,
    @ActorUserId() actorUserId: string,
  ) {
    const payload = parseRequestPayload(createRuntimeIntentBodySchema, body);
    assertActorOwnsUser(
      actorUserId,
      payload.userId,
      "intent user does not match authenticated user",
    );
    const data = await this.runtimeService.createIntent(payload);
    return ok(parseRequestPayload(intentResponseSchema, data));
  }

  @Post("dating/consents")
  async createDatingConsent(
    @Body() body: unknown,
    @ActorUserId() actorUserId: string,
  ) {
    const payload = parseRequestPayload(createDatingConsentBodySchema, body);
    assertActorOwnsUser(
      actorUserId,
      payload.userId,
      "dating consent user does not match authenticated user",
    );
    const data = await this.runtimeService.createDatingConsent(payload);
    return ok(parseRequestPayload(datingConsentResponseSchema, data));
  }

  @Post("commerce/listings")
  async createCommerceListing(
    @Body() body: unknown,
    @ActorUserId() actorUserId: string,
  ) {
    const payload = parseRequestPayload(createCommerceListingBodySchema, body);
    assertActorOwnsUser(
      actorUserId,
      payload.sellerUserId,
      "listing seller user does not match authenticated user",
    );
    const data = await this.runtimeService.createCommerceListing(payload);
    return ok(parseRequestPayload(commerceListingResponseSchema, data));
  }

  @Post("commerce/offers")
  async createCommerceOffer(
    @Body() body: unknown,
    @ActorUserId() actorUserId: string,
  ) {
    const payload = parseRequestPayload(createCommerceOfferBodySchema, body);
    assertActorOwnsUser(
      actorUserId,
      payload.buyerUserId,
      "offer buyer user does not match authenticated user",
    );
    const data = await this.runtimeService.createCommerceOffer(payload);
    return ok(parseRequestPayload(commerceOfferResponseSchema, data));
  }

  @Post("commerce/offers/:offerId/respond")
  async respondCommerceOffer(
    @Param("offerId") offerIdParam: string,
    @Body() body: unknown,
    @ActorUserId() actorUserId: string,
  ) {
    const offerId = parseRequestPayload(uuidSchema, offerIdParam);
    const payload = parseRequestPayload(respondCommerceOfferBodySchema, body);
    assertActorOwnsUser(
      actorUserId,
      payload.actorUserId,
      "offer actor user does not match authenticated user",
    );
    const data = await this.runtimeService.respondCommerceOffer(
      offerId,
      payload,
    );
    return ok(parseRequestPayload(commerceOfferResponseSchema, data));
  }

  @Get("workflows/:workflowRunId")
  async getWorkflowRun(@Param("workflowRunId") workflowRunIdParam: string) {
    const workflowRunId = parseRequestPayload(
      z.string().min(1),
      workflowRunIdParam,
    );
    const data = await this.runtimeService.getWorkflowDetails(workflowRunId);
    if (data.run) {
      parseRequestPayload(workflowRunResponseSchema, data.run);
    }
    return ok(data);
  }
}
