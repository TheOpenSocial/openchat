import {
  Body,
  Controller,
  ForbiddenException,
  Delete,
  Get,
  Headers,
  Param,
  Post,
  Put,
  Query,
} from "@nestjs/common";
import {
  savedSearchCreateBodySchema,
  savedSearchUpdateBodySchema,
  scheduledTaskCreateBodySchema,
  scheduledTaskListQuerySchema,
  scheduledTaskListRunsQuerySchema,
  scheduledTaskUpdateBodySchema,
  uuidSchema,
} from "@opensocial/types";
import { z } from "zod";
import {
  type AdminRole,
  AdminAuditService,
} from "../admin/admin-audit.service.js";
import { ok } from "../common/api-response.js";
import { ActorUserId } from "../common/actor-user-id.decorator.js";
import { assertActorOwnsUser } from "../common/auth-context.js";
import { parseRequestPayload } from "../common/validation.js";
import { ScheduledTasksService } from "./scheduled-tasks.service.js";

const adminActionReasonBodySchema = z
  .object({
    reason: z.string().min(1).max(500).optional(),
  })
  .default({});

@Controller()
export class ScheduledTasksController {
  constructor(
    private readonly scheduledTasksService: ScheduledTasksService,
    private readonly adminAuditService: AdminAuditService,
  ) {}

  @Get("scheduled-tasks/:userId")
  async listTasks(
    @Param("userId") userIdParam: string,
    @Query() query: unknown,
    @ActorUserId() actorUserId: string,
  ) {
    const userId = parseRequestPayload(uuidSchema, userIdParam);
    assertActorOwnsUser(
      actorUserId,
      userId,
      "scheduled tasks target does not match authenticated user",
    );
    const parsedQuery = parseRequestPayload(
      scheduledTaskListQuerySchema,
      query,
    );
    return ok(await this.scheduledTasksService.listTasks(userId, parsedQuery));
  }

  @Post("scheduled-tasks/:userId")
  async createTask(
    @Param("userId") userIdParam: string,
    @Body() body: unknown,
    @ActorUserId() actorUserId: string,
  ) {
    const userId = parseRequestPayload(uuidSchema, userIdParam);
    assertActorOwnsUser(
      actorUserId,
      userId,
      "scheduled tasks target does not match authenticated user",
    );
    const payload = parseRequestPayload(scheduledTaskCreateBodySchema, body);
    return ok(await this.scheduledTasksService.createTask(userId, payload));
  }

  @Put("scheduled-tasks/:taskId")
  async updateTask(
    @Param("taskId") taskIdParam: string,
    @Body() body: unknown,
    @ActorUserId() actorUserId: string,
  ) {
    const taskId = parseRequestPayload(uuidSchema, taskIdParam);
    const payload = parseRequestPayload(scheduledTaskUpdateBodySchema, body);
    return ok(
      await this.scheduledTasksService.updateTask(taskId, actorUserId, payload),
    );
  }

  @Delete("scheduled-tasks/:taskId")
  async archiveTask(
    @Param("taskId") taskIdParam: string,
    @ActorUserId() actorUserId: string,
  ) {
    const taskId = parseRequestPayload(uuidSchema, taskIdParam);
    return ok(
      await this.scheduledTasksService.archiveTask(taskId, actorUserId),
    );
  }

  @Post("scheduled-tasks/:taskId/pause")
  async pauseTask(
    @Param("taskId") taskIdParam: string,
    @ActorUserId() actorUserId: string,
  ) {
    const taskId = parseRequestPayload(uuidSchema, taskIdParam);
    return ok(await this.scheduledTasksService.pauseTask(taskId, actorUserId));
  }

  @Post("scheduled-tasks/:taskId/resume")
  async resumeTask(
    @Param("taskId") taskIdParam: string,
    @ActorUserId() actorUserId: string,
  ) {
    const taskId = parseRequestPayload(uuidSchema, taskIdParam);
    return ok(await this.scheduledTasksService.resumeTask(taskId, actorUserId));
  }

  @Post("scheduled-tasks/:taskId/run-now")
  async runTaskNow(
    @Param("taskId") taskIdParam: string,
    @ActorUserId() actorUserId: string,
  ) {
    const taskId = parseRequestPayload(uuidSchema, taskIdParam);
    return ok(await this.scheduledTasksService.runTaskNow(taskId, actorUserId));
  }

  @Get("scheduled-tasks/:taskId/runs")
  async listTaskRuns(
    @Param("taskId") taskIdParam: string,
    @Query() query: unknown,
    @ActorUserId() actorUserId: string,
  ) {
    const taskId = parseRequestPayload(uuidSchema, taskIdParam);
    const parsedQuery = parseRequestPayload(
      scheduledTaskListRunsQuerySchema,
      query,
    );
    return ok(
      await this.scheduledTasksService.listTaskRuns(
        taskId,
        actorUserId,
        parsedQuery.limit ?? 50,
      ),
    );
  }

  @Get("saved-searches/:userId")
  async listSavedSearches(
    @Param("userId") userIdParam: string,
    @ActorUserId() actorUserId: string,
  ) {
    const userId = parseRequestPayload(uuidSchema, userIdParam);
    assertActorOwnsUser(
      actorUserId,
      userId,
      "saved searches target does not match authenticated user",
    );
    return ok(await this.scheduledTasksService.listSavedSearches(userId));
  }

  @Post("saved-searches/:userId")
  async createSavedSearch(
    @Param("userId") userIdParam: string,
    @Body() body: unknown,
    @ActorUserId() actorUserId: string,
  ) {
    const userId = parseRequestPayload(uuidSchema, userIdParam);
    assertActorOwnsUser(
      actorUserId,
      userId,
      "saved searches target does not match authenticated user",
    );
    const payload = parseRequestPayload(savedSearchCreateBodySchema, body);
    return ok(
      await this.scheduledTasksService.createSavedSearch(userId, payload),
    );
  }

  @Put("saved-searches/:searchId")
  async updateSavedSearch(
    @Param("searchId") searchIdParam: string,
    @Body() body: unknown,
    @ActorUserId() actorUserId: string,
  ) {
    const searchId = parseRequestPayload(uuidSchema, searchIdParam);
    const payload = parseRequestPayload(savedSearchUpdateBodySchema, body);
    return ok(
      await this.scheduledTasksService.updateSavedSearch(
        searchId,
        actorUserId,
        payload,
      ),
    );
  }

  @Delete("saved-searches/:searchId")
  async deleteSavedSearch(
    @Param("searchId") searchIdParam: string,
    @ActorUserId() actorUserId: string,
  ) {
    const searchId = parseRequestPayload(uuidSchema, searchIdParam);
    return ok(
      await this.scheduledTasksService.deleteSavedSearch(searchId, actorUserId),
    );
  }

  @Get("admin/scheduled-tasks")
  async listAdminTasks(
    @Query() query: unknown,
    @Headers("x-admin-user-id") adminUserIdHeader?: string,
    @Headers("x-admin-role") adminRoleHeader?: string,
  ) {
    const admin = this.parseAdminContext(adminUserIdHeader, adminRoleHeader, [
      "admin",
      "support",
    ]);
    const parsedQuery = parseRequestPayload(
      scheduledTaskListQuerySchema,
      query,
    );
    const tasks = await this.scheduledTasksService.listAdminTasks(parsedQuery);
    await this.adminAuditService.recordAction({
      adminUserId: admin.adminUserId,
      role: admin.role,
      action: "admin.scheduled_tasks_view",
      entityType: "scheduled_task",
      metadata: {
        status: parsedQuery.status ?? null,
        limit: parsedQuery.limit ?? null,
        count: tasks.length,
      },
    });
    return ok(tasks);
  }

  @Get("admin/scheduled-tasks/:taskId/runs")
  async listAdminTaskRuns(
    @Param("taskId") taskIdParam: string,
    @Query() query: unknown,
    @Headers("x-admin-user-id") adminUserIdHeader?: string,
    @Headers("x-admin-role") adminRoleHeader?: string,
  ) {
    const admin = this.parseAdminContext(adminUserIdHeader, adminRoleHeader, [
      "admin",
      "support",
    ]);
    const taskId = parseRequestPayload(uuidSchema, taskIdParam);
    const parsedQuery = parseRequestPayload(
      scheduledTaskListRunsQuerySchema,
      query,
    );
    const runs = await this.scheduledTasksService.listAdminTaskRuns(
      taskId,
      parsedQuery.limit ?? 100,
    );
    await this.adminAuditService.recordAction({
      adminUserId: admin.adminUserId,
      role: admin.role,
      action: "admin.scheduled_task_runs_view",
      entityType: "scheduled_task",
      entityId: taskId,
      metadata: {
        limit: parsedQuery.limit ?? 100,
        count: runs.length,
      },
    });
    return ok(runs);
  }

  @Post("admin/scheduled-tasks/:taskId/pause")
  async pauseAdminTask(
    @Param("taskId") taskIdParam: string,
    @Body() body: unknown,
    @Headers("x-admin-user-id") adminUserIdHeader?: string,
    @Headers("x-admin-role") adminRoleHeader?: string,
  ) {
    const admin = this.parseAdminContext(adminUserIdHeader, adminRoleHeader, [
      "admin",
    ]);
    const taskId = parseRequestPayload(uuidSchema, taskIdParam);
    const payload = parseRequestPayload(
      adminActionReasonBodySchema,
      body ?? {},
    );
    const task = await this.scheduledTasksService.adminPauseTask(taskId);
    await this.adminAuditService.recordAction({
      adminUserId: admin.adminUserId,
      role: admin.role,
      action: "admin.scheduled_task_pause",
      entityType: "scheduled_task",
      entityId: taskId,
      metadata: {
        reason: payload.reason ?? null,
        userId: task.userId,
        status: task.status,
      },
    });
    return ok(task);
  }

  @Post("admin/scheduled-tasks/:taskId/resume")
  async resumeAdminTask(
    @Param("taskId") taskIdParam: string,
    @Body() body: unknown,
    @Headers("x-admin-user-id") adminUserIdHeader?: string,
    @Headers("x-admin-role") adminRoleHeader?: string,
  ) {
    const admin = this.parseAdminContext(adminUserIdHeader, adminRoleHeader, [
      "admin",
    ]);
    const taskId = parseRequestPayload(uuidSchema, taskIdParam);
    const payload = parseRequestPayload(
      adminActionReasonBodySchema,
      body ?? {},
    );
    const task = await this.scheduledTasksService.adminResumeTask(taskId);
    await this.adminAuditService.recordAction({
      adminUserId: admin.adminUserId,
      role: admin.role,
      action: "admin.scheduled_task_resume",
      entityType: "scheduled_task",
      entityId: taskId,
      metadata: {
        reason: payload.reason ?? null,
        userId: task.userId,
        status: task.status,
      },
    });
    return ok(task);
  }

  @Post("admin/scheduled-tasks/:taskId/archive")
  async archiveAdminTask(
    @Param("taskId") taskIdParam: string,
    @Body() body: unknown,
    @Headers("x-admin-user-id") adminUserIdHeader?: string,
    @Headers("x-admin-role") adminRoleHeader?: string,
  ) {
    const admin = this.parseAdminContext(adminUserIdHeader, adminRoleHeader, [
      "admin",
    ]);
    const taskId = parseRequestPayload(uuidSchema, taskIdParam);
    const payload = parseRequestPayload(
      adminActionReasonBodySchema,
      body ?? {},
    );
    const task = await this.scheduledTasksService.adminArchiveTask(taskId);
    await this.adminAuditService.recordAction({
      adminUserId: admin.adminUserId,
      role: admin.role,
      action: "admin.scheduled_task_archive",
      entityType: "scheduled_task",
      entityId: taskId,
      metadata: {
        reason: payload.reason ?? null,
        userId: task.userId,
        status: task.status,
      },
    });
    return ok(task);
  }

  @Post("admin/scheduled-tasks/:taskId/run-now")
  async runAdminTaskNow(
    @Param("taskId") taskIdParam: string,
    @Body() body: unknown,
    @Headers("x-admin-user-id") adminUserIdHeader?: string,
    @Headers("x-admin-role") adminRoleHeader?: string,
  ) {
    const admin = this.parseAdminContext(adminUserIdHeader, adminRoleHeader, [
      "admin",
    ]);
    const taskId = parseRequestPayload(uuidSchema, taskIdParam);
    const payload = parseRequestPayload(
      adminActionReasonBodySchema,
      body ?? {},
    );
    const result = await this.scheduledTasksService.adminRunTaskNow(taskId);
    await this.adminAuditService.recordAction({
      adminUserId: admin.adminUserId,
      role: admin.role,
      action: "admin.scheduled_task_run_now",
      entityType: "scheduled_task",
      entityId: taskId,
      metadata: {
        reason: payload.reason ?? null,
        userId: result.userId,
        runId: result.runId,
      },
    });
    return ok(result);
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

    return {
      adminUserId,
      role,
    };
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
