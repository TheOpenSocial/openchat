import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  Param,
  Post,
} from "@nestjs/common";
import { launchControlsUpdateBodySchema, uuidSchema } from "@opensocial/types";
import { PublicRoute } from "../auth/public-route.decorator.js";
import { ok } from "../common/api-response.js";
import { parseRequestPayload } from "../common/validation.js";
import {
  type AdminRole,
  AdminAuditService,
} from "../admin/admin-audit.service.js";
import { LaunchControlsService } from "./launch-controls.service.js";

@PublicRoute()
@Controller("admin/launch-controls")
export class LaunchControlsController {
  constructor(
    private readonly launchControlsService: LaunchControlsService,
    private readonly adminAuditService: AdminAuditService,
  ) {}

  @Get()
  async getLaunchControls(
    @Headers("x-admin-user-id") adminUserIdHeader?: string,
    @Headers("x-admin-role") adminRoleHeader?: string,
  ) {
    const admin = this.parseAdminContext(adminUserIdHeader, adminRoleHeader, [
      "admin",
      "support",
    ]);
    const snapshot = await this.launchControlsService.getSnapshot();
    await this.adminAuditService.recordAction({
      adminUserId: admin.adminUserId,
      role: admin.role,
      action: "admin.launch_controls_view",
      entityType: "launch_controls",
      metadata: {
        globalKillSwitch: snapshot.globalKillSwitch,
        inviteOnlyMode: snapshot.inviteOnlyMode,
      },
    });
    return ok(snapshot);
  }

  @Post()
  async updateLaunchControls(
    @Body() body: unknown,
    @Headers("x-admin-user-id") adminUserIdHeader?: string,
    @Headers("x-admin-role") adminRoleHeader?: string,
  ) {
    const admin = this.parseAdminContext(adminUserIdHeader, adminRoleHeader, [
      "admin",
    ]);
    const payload = parseRequestPayload(launchControlsUpdateBodySchema, body);
    const changedKeys = Object.entries(payload)
      .filter(
        ([key, value]) =>
          key !== "actorUserId" && key !== "reason" && value !== undefined,
      )
      .map(([key]) => key);
    const snapshot = await this.launchControlsService.updateControls({
      ...payload,
      actorUserId: admin.adminUserId,
    });
    await this.adminAuditService.recordAction({
      adminUserId: admin.adminUserId,
      role: admin.role,
      action: "admin.launch_controls_update",
      entityType: "launch_controls",
      metadata: {
        changedKeys,
        reason: payload.reason ?? null,
      },
    });
    return ok(snapshot);
  }

  @Get("users/:userId/eligibility")
  async getUserEligibility(
    @Param("userId") userIdParam: string,
    @Headers("x-admin-user-id") adminUserIdHeader?: string,
    @Headers("x-admin-role") adminRoleHeader?: string,
  ) {
    const admin = this.parseAdminContext(adminUserIdHeader, adminRoleHeader, [
      "admin",
      "support",
    ]);
    const userId = parseRequestPayload(uuidSchema, userIdParam);
    const eligibility =
      await this.launchControlsService.getUserEligibility(userId);
    await this.adminAuditService.recordAction({
      adminUserId: admin.adminUserId,
      role: admin.role,
      action: "admin.launch_controls_eligibility_view",
      entityType: "launch_controls",
      entityId: userId,
      metadata: {
        eligible: eligibility.eligible,
      },
    });
    return ok(eligibility);
  }

  private parseAdminContext(
    adminUserIdHeader: string | undefined,
    adminRoleHeader: string | undefined,
    allowedRoles: AdminRole[],
  ) {
    const adminUserId = parseRequestPayload(uuidSchema, adminUserIdHeader);
    const role = this.parseAdminRole(adminRoleHeader);
    if (!allowedRoles.includes(role)) {
      throw new ForbiddenException(
        "admin role is not permitted for this action",
      );
    }
    return { adminUserId, role };
  }

  private parseAdminRole(roleHeader: string | undefined): AdminRole {
    if (
      roleHeader === "admin" ||
      roleHeader === "support" ||
      roleHeader === "moderator"
    ) {
      return roleHeader;
    }
    throw new ForbiddenException("admin role is required");
  }
}
