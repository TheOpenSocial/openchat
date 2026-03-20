import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import {
  complianceBirthDateBodySchema,
  complianceRecordAcceptanceBodySchema,
  uuidSchema,
} from "@opensocial/types";
import { PublicRoute } from "../auth/public-route.decorator.js";
import { ok } from "../common/api-response.js";
import { ActorUserId } from "../common/actor-user-id.decorator.js";
import { assertActorOwnsUser } from "../common/auth-context.js";
import { parseRequestPayload } from "../common/validation.js";
import { ComplianceService } from "./compliance.service.js";

@Controller("compliance")
export class ComplianceController {
  constructor(private readonly complianceService: ComplianceService) {}

  @PublicRoute()
  @Get("policy")
  getPolicyInputs() {
    return ok(this.complianceService.getPolicyInputs());
  }

  @Post(":userId/acceptance")
  async recordAcceptance(
    @Param("userId") userIdParam: string,
    @Body() body: unknown,
    @ActorUserId() actorUserId: string,
  ) {
    const userId = parseRequestPayload(uuidSchema, userIdParam);
    assertActorOwnsUser(
      actorUserId,
      userId,
      "compliance data not owned by user",
    );
    const payload = parseRequestPayload(
      complianceRecordAcceptanceBodySchema,
      body,
    );
    return ok(await this.complianceService.recordAcceptance(userId, payload));
  }

  @Post(":userId/birth-date")
  async setBirthDate(
    @Param("userId") userIdParam: string,
    @Body() body: unknown,
    @ActorUserId() actorUserId: string,
  ) {
    const userId = parseRequestPayload(uuidSchema, userIdParam);
    assertActorOwnsUser(
      actorUserId,
      userId,
      "compliance data not owned by user",
    );
    const payload = parseRequestPayload(complianceBirthDateBodySchema, body);
    return ok(
      await this.complianceService.setBirthDate(userId, payload.birthDate),
    );
  }

  @Get(":userId/eligibility")
  async getEligibility(
    @Param("userId") userIdParam: string,
    @ActorUserId() actorUserId: string,
  ) {
    const userId = parseRequestPayload(uuidSchema, userIdParam);
    assertActorOwnsUser(
      actorUserId,
      userId,
      "compliance data not owned by user",
    );
    return ok(await this.complianceService.getUserEligibility(userId));
  }
}
