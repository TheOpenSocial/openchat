import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  Headers,
  MessageEvent,
  Param,
  Post,
  Query,
  Sse,
} from "@nestjs/common";
import {
  agentPlanCheckpointDecisionBodySchema,
  agentPlanCheckpointListQuerySchema,
  agentThreadRespondBodySchema,
  postAgentThreadMessageBodySchema,
  uuidSchema,
} from "@opensocial/types";
import { Observable, fromEventPattern, map } from "rxjs";
import { ok } from "../common/api-response.js";
import { ActorUserId } from "../common/actor-user-id.decorator.js";
import { assertActorOwnsUser } from "../common/auth-context.js";
import { readIdempotencyKeyHeader } from "../common/idempotency.js";
import { parseRequestPayload } from "../common/validation.js";
import { ClientMutationService } from "../database/client-mutation.service.js";
import { AgentConversationService } from "./agent-conversation.service.js";
import { AgentService } from "./agent.service.js";

@Controller("agent/threads")
export class AgentController {
  constructor(
    private readonly agentService: AgentService,
    private readonly agentConversationService: AgentConversationService,
    private readonly clientMutationService: ClientMutationService,
  ) {}

  /** Static path must stay ahead of `:threadId/*` routes. */
  @Get("me/summary")
  async getMyThreadSummary(@ActorUserId() actorUserId: string) {
    const summary =
      await this.agentService.findPrimaryThreadSummaryForUser(actorUserId);
    return ok(summary);
  }

  @Sse(":threadId/stream")
  async streamThread(
    @Param("threadId") threadIdParam: string,
    @ActorUserId() actorUserId: string,
  ): Promise<Observable<MessageEvent>> {
    const threadId = parseRequestPayload(uuidSchema, threadIdParam);
    await this.agentService.assertThreadOwnership(threadId, actorUserId);
    return fromEventPattern<{
      id: string;
      threadId: string;
      role: string;
      content: string;
      createdByUserId: string | null;
      createdAt: Date;
    }>(
      (handler) => this.agentService.subscribeToThread(threadId, handler),
      (handler) => this.agentService.unsubscribeFromThread(threadId, handler),
    ).pipe(
      map((message) => ({
        type: "agent.message",
        data: message,
      })),
    );
  }

  @Get(":threadId/messages")
  async getMessages(
    @Param("threadId") threadIdParam: string,
    @Query("includeInternalWorkflow")
    includeInternalWorkflowParam: string | undefined,
    @ActorUserId() actorUserId: string,
  ) {
    const threadId = parseRequestPayload(uuidSchema, threadIdParam);
    const includeInternalWorkflow =
      this.parseOptionalBooleanQuery(includeInternalWorkflowParam) ?? false;
    await this.agentService.assertThreadOwnership(threadId, actorUserId);
    return ok(
      await this.agentService.listThreadMessages(threadId, {
        includeInternalWorkflow,
      }),
    );
  }

  @Post(":threadId/messages")
  async postMessage(
    @Param("threadId") threadIdParam: string,
    @Body() body: unknown,
    @ActorUserId() actorUserId: string,
  ) {
    const threadId = parseRequestPayload(uuidSchema, threadIdParam);
    const payload = parseRequestPayload(postAgentThreadMessageBodySchema, body);
    await this.agentService.assertThreadOwnership(threadId, actorUserId);
    assertActorOwnsUser(
      actorUserId,
      payload.userId,
      "agent message user does not match authenticated user",
    );
    return ok(
      await this.agentService.createUserMessage(
        threadId,
        payload.content,
        payload.userId,
      ),
    );
  }

  @Post(":threadId/respond")
  async respond(
    @Param("threadId") threadIdParam: string,
    @Body() body: unknown,
    @ActorUserId() actorUserId: string,
    @Headers("idempotency-key") idempotencyKeyHeader?: string,
  ) {
    const threadId = parseRequestPayload(uuidSchema, threadIdParam);
    const payload = parseRequestPayload(agentThreadRespondBodySchema, body);
    await this.agentService.assertThreadOwnership(threadId, actorUserId);
    assertActorOwnsUser(
      actorUserId,
      payload.userId,
      "agent response user does not match authenticated user",
    );

    let result: Awaited<
      ReturnType<typeof this.agentConversationService.runAgenticTurn>
    >;
    try {
      result = await this.clientMutationService.run({
        userId: payload.userId,
        scope: "agent.respond",
        idempotencyKey: readIdempotencyKeyHeader(idempotencyKeyHeader),
        handler: () =>
          this.agentConversationService.runAgenticTurn({
            threadId,
            userId: payload.userId,
            content: payload.content,
            traceId: payload.traceId,
            streamResponseTokens: payload.streamResponseTokens,
            voiceTranscript: payload.voiceTranscript,
            attachments: payload.attachments,
          }),
      });
    } catch (error) {
      if (
        error instanceof ConflictException &&
        error.message === "request is already processing"
      ) {
        return ok(
          {
            traceId: payload.traceId ?? null,
            status: "processing",
            assistantMessage: null,
            userMessageId: null,
            agentMessageId: null,
          },
          payload.traceId,
        );
      }
      throw error;
    }

    return ok(result, result.traceId);
  }

  @Post(":threadId/respond/stream")
  async respondStream(
    @Param("threadId") threadIdParam: string,
    @Body() body: unknown,
    @ActorUserId() actorUserId: string,
    @Headers("idempotency-key") idempotencyKeyHeader?: string,
  ) {
    const threadId = parseRequestPayload(uuidSchema, threadIdParam);
    const payload = parseRequestPayload(agentThreadRespondBodySchema, body);
    await this.agentService.assertThreadOwnership(threadId, actorUserId);
    assertActorOwnsUser(
      actorUserId,
      payload.userId,
      "agent response user does not match authenticated user",
    );

    const result = await this.clientMutationService.run({
      userId: payload.userId,
      scope: "agent.respond_stream",
      idempotencyKey: readIdempotencyKeyHeader(idempotencyKeyHeader),
      handler: () =>
        this.agentConversationService.runAgenticTurn({
          threadId,
          userId: payload.userId,
          content: payload.content,
          traceId: payload.traceId,
          streamResponseTokens: true,
          voiceTranscript: payload.voiceTranscript,
          attachments: payload.attachments,
        }),
    });

    return ok(result, result.traceId);
  }

  @Get(":threadId/plan-checkpoints")
  async listPlanCheckpoints(
    @Param("threadId") threadIdParam: string,
    @Query() query: unknown,
    @ActorUserId() actorUserId: string,
  ) {
    const threadId = parseRequestPayload(uuidSchema, threadIdParam);
    const payload = parseRequestPayload(
      agentPlanCheckpointListQuerySchema,
      query,
    );
    await this.agentService.assertThreadOwnership(threadId, actorUserId);
    return ok(
      await this.agentConversationService.listPlanCheckpoints({
        threadId,
        status: payload.status,
        limit: payload.limit,
      }),
    );
  }

  @Post(":threadId/plan-checkpoints/:checkpointId/approve")
  async approvePlanCheckpoint(
    @Param("threadId") threadIdParam: string,
    @Param("checkpointId") checkpointIdParam: string,
    @Body() body: unknown,
    @ActorUserId() actorUserId: string,
  ) {
    const threadId = parseRequestPayload(uuidSchema, threadIdParam);
    const checkpointId = parseRequestPayload(uuidSchema, checkpointIdParam);
    const payload = parseRequestPayload(
      agentPlanCheckpointDecisionBodySchema,
      body,
    );
    await this.agentService.assertThreadOwnership(threadId, actorUserId);
    assertActorOwnsUser(
      actorUserId,
      payload.userId,
      "plan checkpoint approval user does not match authenticated user",
    );
    return ok(
      await this.agentConversationService.resolvePlanCheckpoint({
        threadId,
        checkpointId,
        actorUserId: payload.userId,
        decision: "approved",
        reason: payload.reason,
      }),
    );
  }

  @Post(":threadId/plan-checkpoints/:checkpointId/reject")
  async rejectPlanCheckpoint(
    @Param("threadId") threadIdParam: string,
    @Param("checkpointId") checkpointIdParam: string,
    @Body() body: unknown,
    @ActorUserId() actorUserId: string,
  ) {
    const threadId = parseRequestPayload(uuidSchema, threadIdParam);
    const checkpointId = parseRequestPayload(uuidSchema, checkpointIdParam);
    const payload = parseRequestPayload(
      agentPlanCheckpointDecisionBodySchema,
      body,
    );
    await this.agentService.assertThreadOwnership(threadId, actorUserId);
    assertActorOwnsUser(
      actorUserId,
      payload.userId,
      "plan checkpoint rejection user does not match authenticated user",
    );
    return ok(
      await this.agentConversationService.resolvePlanCheckpoint({
        threadId,
        checkpointId,
        actorUserId: payload.userId,
        decision: "rejected",
        reason: payload.reason,
      }),
    );
  }

  private parseOptionalBooleanQuery(value: string | undefined) {
    if (typeof value !== "string") {
      return undefined;
    }
    const normalized = value.trim().toLowerCase();
    if (normalized.length === 0) {
      return undefined;
    }
    if (normalized === "true" || normalized === "1") {
      return true;
    }
    if (normalized === "false" || normalized === "0") {
      return false;
    }
    throw new BadRequestException("boolean query must be true or false");
  }
}
