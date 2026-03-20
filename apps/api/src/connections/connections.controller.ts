import { Body, Controller, Post } from "@nestjs/common";
import { createConnectionBodySchema } from "@opensocial/types";
import { ok } from "../common/api-response.js";
import { ActorUserId } from "../common/actor-user-id.decorator.js";
import { assertActorOwnsUser } from "../common/auth-context.js";
import { parseRequestPayload } from "../common/validation.js";
import { ConnectionsService } from "./connections.service.js";

@Controller("connections")
export class ConnectionsController {
  constructor(private readonly connectionsService: ConnectionsService) {}

  @Post()
  async create(@Body() body: unknown, @ActorUserId() actorUserId: string) {
    const payload = parseRequestPayload(createConnectionBodySchema, body);
    assertActorOwnsUser(
      actorUserId,
      payload.createdByUserId,
      "connection creator does not match authenticated user",
    );
    return ok(
      await this.connectionsService.createConnection(
        payload.type,
        payload.createdByUserId,
        payload.originIntentId,
      ),
    );
  }
}
