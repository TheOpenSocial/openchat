import { Body, Controller, Post } from "@nestjs/common";
import { createConnectionBodySchema } from "@opensocial/types";
import { ok } from "../common/api-response.js";
import { ActorUserId } from "../common/actor-user-id.decorator.js";
import { assertActorOwnsUser } from "../common/auth-context.js";
import { parseRequestPayload } from "../common/validation.js";
import { ProtocolService } from "../protocol/protocol.service.js";

@Controller("connections")
export class ConnectionsController {
  constructor(private readonly protocolService: ProtocolService) {}

  @Post()
  async create(@Body() body: unknown, @ActorUserId() actorUserId: string) {
    const payload = parseRequestPayload(createConnectionBodySchema, body);
    assertActorOwnsUser(
      actorUserId,
      payload.createdByUserId,
      "connection creator does not match authenticated user",
    );
    return ok(
      await this.protocolService.createFirstPartyConnectionAction({
        actorUserId,
        type: payload.type,
        originIntentId: payload.originIntentId,
        metadata: {
          source: "connections.controller.create",
        },
      }),
    );
  }
}
