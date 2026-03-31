import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  Param,
  Post,
  Query,
} from "@nestjs/common";
import { z } from "zod";
import { PublicRoute } from "../auth/public-route.decorator.js";
import { ok } from "../common/api-response.js";
import { parseRequestPayload } from "../common/validation.js";
import { AdminPlaygroundService } from "./admin-playground.service.js";
import { SocialSimService } from "./social-sim.service.js";
import type { AdminRole } from "./admin-audit.service.js";

const ADMIN_ROLES = new Set<AdminRole>(["admin", "support", "moderator"]);
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const socialSimProviderSchema = z.enum(["ollama", "openai"]);
const socialSimHorizonSchema = z.enum(["short", "medium", "long"]);
const socialSimCleanupModeSchema = z.enum(["archive", "delete"]);

const socialSimCreateRunBodySchema = z.object({
  scenarioFamily: z.string().min(1).max(120),
  provider: socialSimProviderSchema.optional(),
  judgeProvider: socialSimProviderSchema.optional(),
  horizon: socialSimHorizonSchema,
  seed: z.string().min(1).max(120).optional(),
  namespace: z.string().min(1).max(120).optional(),
  turnBudget: z.number().int().min(1).max(400).optional(),
  actorCount: z.number().int().min(1).max(200).optional(),
  cleanupMode: socialSimCleanupModeSchema.optional(),
  notes: z.array(z.string().min(1).max(500)).optional(),
});

const socialSimReplayBodySchema = z.object({
  seed: z.string().min(1).max(120).optional(),
  provider: socialSimProviderSchema.optional(),
  judgeProvider: socialSimProviderSchema.optional(),
  horizon: socialSimHorizonSchema.optional(),
  namespace: z.string().min(1).max(120).optional(),
  turnBudget: z.number().int().min(1).max(400).optional(),
  actorCount: z.number().int().min(1).max(200).optional(),
  cleanupMode: socialSimCleanupModeSchema.optional(),
});

const socialSimCleanupBodySchema = z.object({
  mode: socialSimCleanupModeSchema.optional(),
});

const socialSimListQuerySchema = z.object({
  limit: z.number().int().min(1).max(100).optional(),
});

const socialSimTurnBodySchema = z.object({
  namespace: z.string().min(1).max(120),
  runId: z.string().min(1).max(160).nullable().optional(),
  worldId: z.string().min(1).max(160),
  actorId: z.string().min(1).max(160),
  actorKind: z.string().min(1).max(80),
  stage: z.string().min(1).max(80),
  promptVersion: z.string().min(1).max(80),
  action: z.record(z.string(), z.unknown()),
  metrics: z
    .object({
      turnIndex: z.number().int().min(0).max(10_000).optional(),
    })
    .optional(),
});

@PublicRoute()
@Controller("admin/social-sim")
export class SocialSimController {
  constructor(
    private readonly socialSimService: SocialSimService,
    private readonly playgroundService: AdminPlaygroundService,
  ) {}

  @Post("runs")
  async createRun(
    @Body() body: unknown,
    @Headers("x-admin-user-id") adminUserIdHeader?: string,
    @Headers("x-admin-role") adminRoleHeader?: string,
  ) {
    this.ensureEnabled();
    const actor = this.parseAdminContext(adminUserIdHeader, adminRoleHeader, [
      "admin",
    ]);
    this.ensureMutationAllowed(actor.adminUserId);
    const payload = parseRequestPayload(socialSimCreateRunBodySchema, body);
    return ok(await this.socialSimService.createRun(payload, actor));
  }

  @Post("turn")
  async ingestTurn(
    @Body() body: unknown,
    @Headers("x-admin-user-id") adminUserIdHeader?: string,
    @Headers("x-admin-role") adminRoleHeader?: string,
  ) {
    this.ensureEnabled();
    const actor = this.parseAdminContext(adminUserIdHeader, adminRoleHeader, [
      "admin",
      "support",
      "moderator",
    ]);
    this.ensureMutationAllowed(actor.adminUserId);
    const payload = parseRequestPayload(socialSimTurnBodySchema, body);
    return ok(await this.socialSimService.recordTurn(payload, actor));
  }

  @Get("runs")
  async listRuns(
    @Query("limit") limitRaw: string | undefined,
    @Headers("x-admin-user-id") adminUserIdHeader?: string,
    @Headers("x-admin-role") adminRoleHeader?: string,
  ) {
    this.ensureEnabled();
    const actor = this.parseAdminContext(adminUserIdHeader, adminRoleHeader, [
      "admin",
      "support",
    ]);
    const payload = parseRequestPayload(socialSimListQuerySchema, {
      limit: limitRaw ? Number(limitRaw) : undefined,
    });
    return ok(await this.socialSimService.listRuns(actor, payload.limit));
  }

  @Get("runs/:runId/summary")
  async summary(
    @Param("runId") runId: string,
    @Headers("x-admin-user-id") adminUserIdHeader?: string,
    @Headers("x-admin-role") adminRoleHeader?: string,
  ) {
    this.ensureEnabled();
    const actor = this.parseAdminContext(adminUserIdHeader, adminRoleHeader, [
      "admin",
      "support",
    ]);
    this.assertRunId(runId);
    return ok(await this.socialSimService.getSummary(runId, actor));
  }

  @Get("runs/:runId/artifacts")
  async artifacts(
    @Param("runId") runId: string,
    @Query("limit") limitRaw: string | undefined,
    @Headers("x-admin-user-id") adminUserIdHeader?: string,
    @Headers("x-admin-role") adminRoleHeader?: string,
  ) {
    this.ensureEnabled();
    const actor = this.parseAdminContext(adminUserIdHeader, adminRoleHeader, [
      "admin",
      "support",
    ]);
    this.assertRunId(runId);
    const limit = limitRaw ? Number(limitRaw) : undefined;
    if (limitRaw && (!Number.isFinite(limit ?? NaN) || (limit ?? 0) <= 0)) {
      throw new BadRequestException("limit must be positive");
    }
    return ok(await this.socialSimService.listArtifacts(runId, actor, limit));
  }

  @Post("runs/:runId/cleanup")
  async cleanup(
    @Param("runId") runId: string,
    @Body() body: unknown,
    @Headers("x-admin-user-id") adminUserIdHeader?: string,
    @Headers("x-admin-role") adminRoleHeader?: string,
  ) {
    this.ensureEnabled();
    const actor = this.parseAdminContext(adminUserIdHeader, adminRoleHeader, [
      "admin",
    ]);
    this.ensureMutationAllowed(actor.adminUserId);
    this.assertRunId(runId);
    const payload = parseRequestPayload(socialSimCleanupBodySchema, body);
    return ok(
      await this.socialSimService.cleanupRun(
        runId,
        payload.mode ?? "archive",
        actor,
      ),
    );
  }

  @Post("runs/:runId/replay")
  async replay(
    @Param("runId") runId: string,
    @Body() body: unknown,
    @Headers("x-admin-user-id") adminUserIdHeader?: string,
    @Headers("x-admin-role") adminRoleHeader?: string,
  ) {
    this.ensureEnabled();
    const actor = this.parseAdminContext(adminUserIdHeader, adminRoleHeader, [
      "admin",
    ]);
    this.ensureMutationAllowed(actor.adminUserId);
    this.assertRunId(runId);
    const payload = parseRequestPayload(socialSimReplayBodySchema, body);
    return ok(await this.socialSimService.replayRun(runId, payload, actor));
  }

  private ensureEnabled() {
    if (!this.socialSimService.isEnabled()) {
      throw new ForbiddenException("social simulation is disabled");
    }
  }

  private ensureMutationAllowed(actorUserId: string) {
    if (!this.socialSimService.isMutationsEnabled()) {
      throw new ForbiddenException("social simulation mutations are disabled");
    }
    if (!this.socialSimService.isActorMutationAllowed(actorUserId)) {
      throw new ForbiddenException(
        "admin user is not allowlisted for social simulation mutations",
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

  private assertRunId(runId: string) {
    if (!runId || runId.trim().length === 0) {
      throw new BadRequestException("runId is required");
    }
  }
}
