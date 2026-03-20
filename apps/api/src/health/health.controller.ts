import { Controller, Get } from "@nestjs/common";
import { PublicRoute } from "../auth/public-route.decorator.js";
import { ok } from "../common/api-response.js";

@Controller("health")
export class HealthController {
  @Get()
  @PublicRoute()
  health() {
    return ok({
      status: "ok",
      service: "api",
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    });
  }
}
