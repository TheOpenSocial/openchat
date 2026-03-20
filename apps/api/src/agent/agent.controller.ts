import {
  Body,
  Controller,
  Get,
  MessageEvent,
  Param,
  Post,
  Sse,
} from "@nestjs/common";
import {
  agentThreadRespondBodySchema,
  postAgentThreadMessageBodySchema,
  uuidSchema,
} from "@opensocial/types";
import { Observable, fromEventPattern, map } from "rxjs";
import { ok } from "../common/api-response.js";
import { ActorUserId } from "../common/actor-user-id.decorator.js";
import { assertActorOwnsUser } from "../common/auth-context.js";
import { parseRequestPayload } from "../common/validation.js";
import { AgentConversationService } from "./agent-conversation.service.js";
import { AgentService } from "./agent.service.js";

@Controller("agent/threads")
export class AgentController {
  constructor(
    private readonly agentService: AgentService,
    private readonly agentConversationService: AgentConversationService,
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
    @ActorUserId() actorUserId: string,
  ) {
    const threadId = parseRequestPayload(uuidSchema, threadIdParam);
    await this.agentService.assertThreadOwnership(threadId, actorUserId);
    return ok(await this.agentService.listThreadMessages(threadId));
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
  ) {
    const threadId = parseRequestPayload(uuidSchema, threadIdParam);
    const payload = parseRequestPayload(agentThreadRespondBodySchema, body);
    await this.agentService.assertThreadOwnership(threadId, actorUserId);
    assertActorOwnsUser(
      actorUserId,
      payload.userId,
      "agent response user does not match authenticated user",
    );

    const result = await this.agentConversationService.runAgenticTurn({
      threadId,
      userId: payload.userId,
      content: payload.content,
      traceId: payload.traceId,
      streamResponseTokens: payload.streamResponseTokens,
      voiceTranscript: payload.voiceTranscript,
      attachments: payload.attachments,
    });

    return ok(result, result.traceId);
  }

  @Post(":threadId/respond/stream")
  async respondStream(
    @Param("threadId") threadIdParam: string,
    @Body() body: unknown,
    @ActorUserId() actorUserId: string,
  ) {
    const threadId = parseRequestPayload(uuidSchema, threadIdParam);
    const payload = parseRequestPayload(agentThreadRespondBodySchema, body);
    await this.agentService.assertThreadOwnership(threadId, actorUserId);
    assertActorOwnsUser(
      actorUserId,
      payload.userId,
      "agent response user does not match authenticated user",
    );

    const result = await this.agentConversationService.runAgenticTurn({
      threadId,
      userId: payload.userId,
      content: payload.content,
      traceId: payload.traceId,
      streamResponseTokens: true,
      voiceTranscript: payload.voiceTranscript,
      attachments: payload.attachments,
    });

    return ok(result, result.traceId);
  }
}
