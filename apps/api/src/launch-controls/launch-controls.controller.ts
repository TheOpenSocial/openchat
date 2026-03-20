import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { launchControlsUpdateBodySchema, uuidSchema } from "@opensocial/types";
import { PublicRoute } from "../auth/public-route.decorator.js";
import { ok } from "../common/api-response.js";
import { parseRequestPayload } from "../common/validation.js";
import { LaunchControlsService } from "./launch-controls.service.js";

@PublicRoute()
@Controller("admin/launch-controls")
export class LaunchControlsController {
  constructor(private readonly launchControlsService: LaunchControlsService) {}

  @Get()
  async getLaunchControls() {
    return ok(await this.launchControlsService.getSnapshot());
  }

  @Post()
  async updateLaunchControls(@Body() body: unknown) {
    const payload = parseRequestPayload(launchControlsUpdateBodySchema, body);
    return ok(await this.launchControlsService.updateControls(payload));
  }

  @Get("users/:userId/eligibility")
  async getUserEligibility(@Param("userId") userIdParam: string) {
    const userId = parseRequestPayload(uuidSchema, userIdParam);
    return ok(await this.launchControlsService.getUserEligibility(userId));
  }
}
