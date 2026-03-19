import { Body, Controller, Get, Param, Put } from "@nestjs/common";
import { profileUpdateBodySchema, uuidSchema } from "@opensocial/types";
import { ok } from "../common/api-response.js";
import { parseRequestPayload } from "../common/validation.js";
import { ProfilesService } from "./profiles.service.js";

@Controller("profiles")
export class ProfilesController {
  constructor(private readonly profilesService: ProfilesService) {}

  @Get(":userId")
  async getProfile(@Param("userId") userIdParam: string) {
    const userId = parseRequestPayload(uuidSchema, userIdParam);
    return ok(await this.profilesService.getProfile(userId));
  }

  @Put(":userId")
  async updateProfile(
    @Param("userId") userIdParam: string,
    @Body() body: unknown,
  ) {
    const userId = parseRequestPayload(uuidSchema, userIdParam);
    const payload = parseRequestPayload(profileUpdateBodySchema, body);
    return ok(await this.profilesService.upsertProfile(userId, payload));
  }
}
