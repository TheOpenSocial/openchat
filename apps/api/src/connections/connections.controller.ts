import { Body, Controller, Post } from "@nestjs/common";
import { createConnectionBodySchema } from "@opensocial/types";
import { ok } from "../common/api-response.js";
import { parseRequestPayload } from "../common/validation.js";
import { ConnectionsService } from "./connections.service.js";

@Controller("connections")
export class ConnectionsController {
  constructor(private readonly connectionsService: ConnectionsService) {}

  @Post()
  async create(@Body() body: unknown) {
    const payload = parseRequestPayload(createConnectionBodySchema, body);
    return ok(
      await this.connectionsService.createConnection(
        payload.type,
        payload.createdByUserId,
        payload.originIntentId,
      ),
    );
  }
}
