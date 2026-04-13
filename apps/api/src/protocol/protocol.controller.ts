import { Controller, Get } from "@nestjs/common";
import { PublicRoute } from "../auth/public-route.decorator.js";
import { ok } from "../common/api-response.js";
import { ProtocolService } from "./protocol.service.js";

@PublicRoute()
@Controller("protocol")
export class ProtocolController {
  constructor(private readonly protocolService: ProtocolService) {}

  @Get("manifest")
  async getManifest() {
    return ok(this.protocolService.getManifest());
  }
}
