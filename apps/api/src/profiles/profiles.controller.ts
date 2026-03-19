import { Body, Controller, Get, Param, Put } from "@nestjs/common";
import {
  profileAvailabilityWindowsBodySchema,
  profileIntentTypePreferenceBodySchema,
  profileInterestsBodySchema,
  profileSocialModeBodySchema,
  profileTopicsBodySchema,
  profileUpdateBodySchema,
  uuidSchema,
} from "@opensocial/types";
import { ok } from "../common/api-response.js";
import { parseRequestPayload } from "../common/validation.js";
import { ProfilesService } from "./profiles.service.js";

@Controller("profiles")
export class ProfilesController {
  constructor(private readonly profilesService: ProfilesService) {}

  @Get(":userId/completion")
  async getProfileCompletion(@Param("userId") userIdParam: string) {
    const userId = parseRequestPayload(uuidSchema, userIdParam);
    return ok(await this.profilesService.getProfileCompletion(userId));
  }

  @Get(":userId/interests")
  async listInterests(@Param("userId") userIdParam: string) {
    const userId = parseRequestPayload(uuidSchema, userIdParam);
    return ok(await this.profilesService.listInterests(userId));
  }

  @Put(":userId/interests")
  async replaceInterests(
    @Param("userId") userIdParam: string,
    @Body() body: unknown,
  ) {
    const userId = parseRequestPayload(uuidSchema, userIdParam);
    const payload = parseRequestPayload(profileInterestsBodySchema, body);
    return ok(
      await this.profilesService.replaceInterests(userId, payload.interests),
    );
  }

  @Get(":userId/topics")
  async listTopics(@Param("userId") userIdParam: string) {
    const userId = parseRequestPayload(uuidSchema, userIdParam);
    return ok(await this.profilesService.listTopics(userId));
  }

  @Put(":userId/topics")
  async replaceTopics(
    @Param("userId") userIdParam: string,
    @Body() body: unknown,
  ) {
    const userId = parseRequestPayload(uuidSchema, userIdParam);
    const payload = parseRequestPayload(profileTopicsBodySchema, body);
    return ok(await this.profilesService.replaceTopics(userId, payload.topics));
  }

  @Get(":userId/availability-windows")
  async listAvailabilityWindows(@Param("userId") userIdParam: string) {
    const userId = parseRequestPayload(uuidSchema, userIdParam);
    return ok(await this.profilesService.listAvailabilityWindows(userId));
  }

  @Put(":userId/availability-windows")
  async replaceAvailabilityWindows(
    @Param("userId") userIdParam: string,
    @Body() body: unknown,
  ) {
    const userId = parseRequestPayload(uuidSchema, userIdParam);
    const payload = parseRequestPayload(
      profileAvailabilityWindowsBodySchema,
      body,
    );
    return ok(
      await this.profilesService.replaceAvailabilityWindows(
        userId,
        payload.windows,
      ),
    );
  }

  @Put(":userId/social-mode")
  async setSocialMode(
    @Param("userId") userIdParam: string,
    @Body() body: unknown,
  ) {
    const userId = parseRequestPayload(uuidSchema, userIdParam);
    const payload = parseRequestPayload(profileSocialModeBodySchema, body);
    return ok(
      await this.profilesService.setSocialModeSettings(userId, payload),
    );
  }

  @Get(":userId/intent-preferences")
  async listIntentPreferences(@Param("userId") userIdParam: string) {
    const userId = parseRequestPayload(uuidSchema, userIdParam);
    return ok(await this.profilesService.listIntentTypePreferences(userId));
  }

  @Put(":userId/intent-preferences")
  async setIntentPreference(
    @Param("userId") userIdParam: string,
    @Body() body: unknown,
  ) {
    const userId = parseRequestPayload(uuidSchema, userIdParam);
    const payload = parseRequestPayload(
      profileIntentTypePreferenceBodySchema,
      body,
    );
    return ok(
      await this.profilesService.setIntentTypePreference(
        userId,
        payload.intentType,
        payload.payload,
      ),
    );
  }

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
