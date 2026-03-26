import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  Post,
  Query,
} from "@nestjs/common";
import {
  adminPlaygroundBootstrapBodySchema,
  adminPlaygroundBootstrapResponseSchema,
  adminPlaygroundRotateProbeTokenBodySchema,
  adminPlaygroundRotateProbeTokenResponseSchema,
  adminPlaygroundRunScenarioBodySchema,
  adminPlaygroundRunSuiteBodySchema,
  adminPlaygroundRunSuiteResponseSchema,
  adminPlaygroundStateResponseSchema,
} from "@opensocial/types";
import { PublicRoute } from "../auth/public-route.decorator.js";
import { ok } from "../common/api-response.js";
import { parseRequestPayload } from "../common/validation.js";
import { AdminPlaygroundService } from "./admin-playground.service.js";
import type { AdminRole } from "./admin-audit.service.js";

const ADMIN_ROLES = new Set<AdminRole>(["admin", "support", "moderator"]);
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@PublicRoute()
@Controller("admin/playground")
export class AdminPlaygroundController {
  constructor(private readonly playgroundService: AdminPlaygroundService) {}

  @Get("state")
  async state(
    @Headers("x-admin-user-id") adminUserIdHeader?: string,
    @Headers("x-admin-role") adminRoleHeader?: string,
  ) {
    this.ensurePlaygroundEnabled();
    const actor = this.parseAdminContext(adminUserIdHeader, adminRoleHeader, [
      "admin",
      "support",
    ]);
    const data = await this.playgroundService.getState(actor);
    return ok(parseRequestPayload(adminPlaygroundStateResponseSchema, data));
  }

  @Post("bootstrap")
  async bootstrap(
    @Body() body: unknown,
    @Headers("x-admin-user-id") adminUserIdHeader?: string,
    @Headers("x-admin-role") adminRoleHeader?: string,
  ) {
    this.ensurePlaygroundEnabled();
    const actor = this.parseAdminContext(adminUserIdHeader, adminRoleHeader, [
      "admin",
    ]);
    this.ensureMutationAllowed(actor.adminUserId);
    const payload = parseRequestPayload(
      adminPlaygroundBootstrapBodySchema,
      body,
    );
    const data = await this.playgroundService.bootstrap(payload, actor);
    return ok(
      parseRequestPayload(adminPlaygroundBootstrapResponseSchema, data),
    );
  }

  @Post("run-scenario")
  async runScenario(
    @Body() body: unknown,
    @Headers("x-admin-user-id") adminUserIdHeader?: string,
    @Headers("x-admin-role") adminRoleHeader?: string,
  ) {
    this.ensurePlaygroundEnabled();
    const actor = this.parseAdminContext(adminUserIdHeader, adminRoleHeader, [
      "admin",
    ]);
    this.ensureMutationAllowed(actor.adminUserId);
    const payload = parseRequestPayload(
      adminPlaygroundRunScenarioBodySchema,
      body,
    );
    const data = await this.playgroundService.runScenario(
      payload.scenarioId,
      actor,
    );
    return ok(data);
  }

  @Post("run-suite")
  async runSuite(
    @Body() body: unknown,
    @Headers("x-admin-user-id") adminUserIdHeader?: string,
    @Headers("x-admin-role") adminRoleHeader?: string,
  ) {
    this.ensurePlaygroundEnabled();
    const actor = this.parseAdminContext(adminUserIdHeader, adminRoleHeader, [
      "admin",
    ]);
    this.ensureMutationAllowed(actor.adminUserId);
    const payload = parseRequestPayload(
      adminPlaygroundRunSuiteBodySchema,
      body,
    );
    const data = await this.playgroundService.runSuite(payload, actor);
    return ok(parseRequestPayload(adminPlaygroundRunSuiteResponseSchema, data));
  }

  @Post("rotate-probe-token")
  async rotateProbeToken(
    @Body() body: unknown,
    @Headers("x-admin-user-id") adminUserIdHeader?: string,
    @Headers("x-admin-role") adminRoleHeader?: string,
  ) {
    this.ensurePlaygroundEnabled();
    const actor = this.parseAdminContext(adminUserIdHeader, adminRoleHeader, [
      "admin",
    ]);
    this.ensureMutationAllowed(actor.adminUserId);
    const payload = parseRequestPayload(
      adminPlaygroundRotateProbeTokenBodySchema,
      body,
    );
    const data = await this.playgroundService.rotateProbeToken(
      payload.length,
      actor,
    );
    return ok(
      parseRequestPayload(adminPlaygroundRotateProbeTokenResponseSchema, data),
    );
  }

  @Get("artifacts")
  async artifacts(
    @Query("limit") limitParam: string | undefined,
    @Headers("x-admin-user-id") adminUserIdHeader?: string,
    @Headers("x-admin-role") adminRoleHeader?: string,
  ) {
    this.ensurePlaygroundEnabled();
    const actor = this.parseAdminContext(adminUserIdHeader, adminRoleHeader, [
      "admin",
      "support",
    ]);
    const parsedLimit = limitParam
      ? Number.parseInt(limitParam, 10)
      : undefined;
    if (
      limitParam &&
      (!Number.isFinite(parsedLimit ?? NaN) ||
        (parsedLimit ?? 0) <= 0 ||
        (parsedLimit ?? 0) > 100)
    ) {
      throw new BadRequestException("limit must be between 1 and 100");
    }
    const data = await this.playgroundService.listArtifacts(actor, parsedLimit);
    return ok(data);
  }

  private ensurePlaygroundEnabled() {
    if (!this.playgroundService.isPlaygroundEnabled()) {
      throw new ForbiddenException("admin playground is disabled");
    }
  }

  private ensureMutationAllowed(actorUserId: string) {
    if (!this.playgroundService.isPlaygroundMutationsEnabled()) {
      throw new ForbiddenException("admin playground mutations are disabled");
    }
    if (!this.playgroundService.isActorMutationAllowed(actorUserId)) {
      throw new ForbiddenException(
        "admin user is not allowlisted for playground mutations",
      );
    }
  }

  private parseAdminContext(
    adminUserIdHeader: string | undefined,
    adminRoleHeader: string | undefined,
    allowedRoles: AdminRole[],
  ) {
    const adminUserId = adminUserIdHeader?.trim();
    if (!adminUserId || !UUID_REGEX.test(adminUserId)) {
      throw new BadRequestException("x-admin-user-id is required");
    }

    const role = adminRoleHeader?.trim() as AdminRole | undefined;
    if (!role || !ADMIN_ROLES.has(role)) {
      throw new BadRequestException("x-admin-role is required");
    }
    if (!allowedRoles.includes(role)) {
      throw new ForbiddenException("not permitted");
    }

    return {
      adminUserId,
      role,
    };
  }
}
