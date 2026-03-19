import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import {
  postAgentThreadMessageBodySchema,
  uuidSchema,
} from "@opensocial/types";
import { ok } from "../common/api-response.js";
import { parseRequestPayload } from "../common/validation.js";
import { AgentService } from "./agent.service.js";

@Controller("agent/threads")
export class AgentController {
  constructor(private readonly agentService: AgentService) {}

  @Get(":threadId/messages")
  async getMessages(@Param("threadId") threadIdParam: string) {
    const threadId = parseRequestPayload(uuidSchema, threadIdParam);
    return ok(await this.agentService.listThreadMessages(threadId));
  }

  @Post(":threadId/messages")
  async postMessage(
    @Param("threadId") threadIdParam: string,
    @Body() body: unknown,
  ) {
    const threadId = parseRequestPayload(uuidSchema, threadIdParam);
    const payload = parseRequestPayload(postAgentThreadMessageBodySchema, body);
    return ok(
      await this.agentService.createUserMessage(
        threadId,
        payload.content,
        payload.userId,
      ),
    );
  }
}
