import {
  Body,
  Controller,
  Delete,
  Get,
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
import { ok } from "../common/api-response.js";
import { ActorUserId } from "../common/actor-user-id.decorator.js";
import { assertActorOwnsUser } from "../common/auth-context.js";
import { parseRequestPayload } from "../common/validation.js";
import { ScheduledTasksService } from "./scheduled-tasks.service.js";

@Controller()
export class ScheduledTasksController {
  constructor(private readonly scheduledTasksService: ScheduledTasksService) {}

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
  async listAdminTasks(@Query() query: unknown) {
    const parsedQuery = parseRequestPayload(
      scheduledTaskListQuerySchema,
      query,
    );
    return ok(await this.scheduledTasksService.listAdminTasks(parsedQuery));
  }

  @Get("admin/scheduled-tasks/:taskId/runs")
  async listAdminTaskRuns(
    @Param("taskId") taskIdParam: string,
    @Query() query: unknown,
  ) {
    const taskId = parseRequestPayload(uuidSchema, taskIdParam);
    const parsedQuery = parseRequestPayload(
      scheduledTaskListRunsQuerySchema,
      query,
    );
    return ok(
      await this.scheduledTasksService.listAdminTaskRuns(
        taskId,
        parsedQuery.limit ?? 100,
      ),
    );
  }
}
