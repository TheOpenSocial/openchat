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
  recurringCircleAddMemberBodySchema,
  recurringCircleCreateBodySchema,
  recurringCircleListQuerySchema,
  recurringCircleSessionListQuerySchema,
  recurringCircleUpdateBodySchema,
  uuidSchema,
} from "@opensocial/types";
import { ok } from "../common/api-response.js";
import { ActorUserId } from "../common/actor-user-id.decorator.js";
import { assertActorOwnsUser } from "../common/auth-context.js";
import { parseRequestPayload } from "../common/validation.js";
import { ProtocolService } from "../protocol/protocol.service.js";
import { RecurringCirclesService } from "./recurring-circles.service.js";

@Controller()
export class RecurringCirclesController {
  constructor(
    private readonly recurringCirclesService: RecurringCirclesService,
    private readonly protocolService?: ProtocolService,
  ) {}

  @Get("recurring-circles/:userId")
  async listCircles(
    @Param("userId") userIdParam: string,
    @Query() query: unknown,
    @ActorUserId() actorUserId: string,
  ) {
    const userId = parseRequestPayload(uuidSchema, userIdParam);
    assertActorOwnsUser(
      actorUserId,
      userId,
      "recurring circles target does not match authenticated user",
    );
    const parsedQuery = parseRequestPayload(
      recurringCircleListQuerySchema,
      query,
    );
    return ok(
      await this.recurringCirclesService.listCircles(userId, parsedQuery),
    );
  }

  @Post("recurring-circles/:userId")
  async createCircle(
    @Param("userId") userIdParam: string,
    @Body() body: unknown,
    @ActorUserId() actorUserId: string,
  ) {
    const userId = parseRequestPayload(uuidSchema, userIdParam);
    assertActorOwnsUser(
      actorUserId,
      userId,
      "recurring circles target does not match authenticated user",
    );
    const payload = parseRequestPayload(recurringCircleCreateBodySchema, body);
    if (!this.protocolService) {
      return ok(
        await this.recurringCirclesService.createCircle(userId, payload),
      );
    }

    const result = await this.protocolService.createFirstPartyCircleAction({
      actorUserId: userId,
      title: payload.title,
      description: payload.description,
      visibility: payload.visibility,
      topicTags: payload.topicTags,
      targetSize: payload.targetSize,
      kickoffPrompt: payload.kickoffPrompt,
      cadence: payload.cadence,
      metadata: {
        source: "recurring-circles.controller.create",
      },
    });
    return ok(
      await this.recurringCirclesService.getOwnedCircle(
        result.circleId,
        userId,
      ),
    );
  }

  @Put("recurring-circles/:circleId")
  async updateCircle(
    @Param("circleId") circleIdParam: string,
    @Body() body: unknown,
    @ActorUserId() actorUserId: string,
  ) {
    const circleId = parseRequestPayload(uuidSchema, circleIdParam);
    const payload = parseRequestPayload(recurringCircleUpdateBodySchema, body);
    return ok(
      await this.recurringCirclesService.updateCircle(
        circleId,
        actorUserId,
        payload,
      ),
    );
  }

  @Delete("recurring-circles/:circleId")
  async archiveCircle(
    @Param("circleId") circleIdParam: string,
    @ActorUserId() actorUserId: string,
  ) {
    const circleId = parseRequestPayload(uuidSchema, circleIdParam);
    return ok(
      await this.recurringCirclesService.archiveCircle(circleId, actorUserId),
    );
  }

  @Post("recurring-circles/:circleId/pause")
  async pauseCircle(
    @Param("circleId") circleIdParam: string,
    @ActorUserId() actorUserId: string,
  ) {
    const circleId = parseRequestPayload(uuidSchema, circleIdParam);
    return ok(
      await this.recurringCirclesService.pauseCircle(circleId, actorUserId),
    );
  }

  @Post("recurring-circles/:circleId/resume")
  async resumeCircle(
    @Param("circleId") circleIdParam: string,
    @ActorUserId() actorUserId: string,
  ) {
    const circleId = parseRequestPayload(uuidSchema, circleIdParam);
    return ok(
      await this.recurringCirclesService.resumeCircle(circleId, actorUserId),
    );
  }

  @Get("recurring-circles/:circleId/members")
  async listMembers(
    @Param("circleId") circleIdParam: string,
    @ActorUserId() actorUserId: string,
  ) {
    const circleId = parseRequestPayload(uuidSchema, circleIdParam);
    return ok(
      await this.recurringCirclesService.listMembers(circleId, actorUserId),
    );
  }

  @Post("recurring-circles/:circleId/members")
  async addMember(
    @Param("circleId") circleIdParam: string,
    @Body() body: unknown,
    @ActorUserId() actorUserId: string,
  ) {
    const circleId = parseRequestPayload(uuidSchema, circleIdParam);
    const payload = parseRequestPayload(
      recurringCircleAddMemberBodySchema,
      body,
    );
    if (!this.protocolService) {
      return ok(
        await this.recurringCirclesService.addMember(
          circleId,
          actorUserId,
          payload,
        ),
      );
    }

    await this.protocolService.joinFirstPartyCircleAction(circleId, {
      actorUserId,
      memberUserId: payload.userId,
      role: payload.role,
      metadata: {
        source: "recurring-circles.controller.add_member",
      },
    });
    return ok(
      await this.recurringCirclesService.getCircleMember(
        circleId,
        actorUserId,
        payload.userId,
      ),
    );
  }

  @Delete("recurring-circles/:circleId/members/:memberUserId")
  async removeMember(
    @Param("circleId") circleIdParam: string,
    @Param("memberUserId") memberUserIdParam: string,
    @ActorUserId() actorUserId: string,
  ) {
    const circleId = parseRequestPayload(uuidSchema, circleIdParam);
    const memberUserId = parseRequestPayload(uuidSchema, memberUserIdParam);
    return ok(
      await this.recurringCirclesService.removeMember(
        circleId,
        actorUserId,
        memberUserId,
      ),
    );
  }

  @Get("recurring-circles/:circleId/sessions")
  async listSessions(
    @Param("circleId") circleIdParam: string,
    @Query() query: unknown,
    @ActorUserId() actorUserId: string,
  ) {
    const circleId = parseRequestPayload(uuidSchema, circleIdParam);
    const parsedQuery = parseRequestPayload(
      recurringCircleSessionListQuerySchema,
      query,
    );
    return ok(
      await this.recurringCirclesService.listSessions(
        circleId,
        actorUserId,
        parsedQuery.limit ?? 50,
      ),
    );
  }

  @Post("recurring-circles/:circleId/sessions/run-now")
  async runSessionNow(
    @Param("circleId") circleIdParam: string,
    @ActorUserId() actorUserId: string,
  ) {
    const circleId = parseRequestPayload(uuidSchema, circleIdParam);
    return ok(
      await this.recurringCirclesService.createSessionNow(
        circleId,
        actorUserId,
      ),
    );
  }

  @Get("admin/recurring-circles")
  async listAdminCircles(@Query() query: unknown) {
    const parsedQuery = parseRequestPayload(
      recurringCircleListQuerySchema,
      query,
    );
    return ok(await this.recurringCirclesService.listAdminCircles(parsedQuery));
  }

  @Get("admin/recurring-circles/:circleId/sessions")
  async listAdminSessions(
    @Param("circleId") circleIdParam: string,
    @Query() query: unknown,
  ) {
    const circleId = parseRequestPayload(uuidSchema, circleIdParam);
    const parsedQuery = parseRequestPayload(
      recurringCircleSessionListQuerySchema,
      query,
    );
    return ok(
      await this.recurringCirclesService.listAdminSessions(
        circleId,
        parsedQuery.limit ?? 100,
      ),
    );
  }

  @Post("admin/recurring-circles/dispatch-due")
  async dispatchDueSessions() {
    return ok(await this.recurringCirclesService.dispatchDueSessions());
  }
}
