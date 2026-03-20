import { Body, Controller, Get, Param, Post, Put } from "@nestjs/common";
import {
  profileAvailabilityWindowsBodySchema,
  profileIntentTypePreferenceBodySchema,
  profileInterestsBodySchema,
  profilePhotoUploadCompleteBodySchema,
  profilePhotoUploadIntentBodySchema,
  profileSocialModeBodySchema,
  profileTopicsBodySchema,
  profileUpdateBodySchema,
  uuidSchema,
} from "@opensocial/types";
import { ok } from "../common/api-response.js";
import { ActorUserId } from "../common/actor-user-id.decorator.js";
import { assertActorOwnsUser } from "../common/auth-context.js";
import { parseRequestPayload } from "../common/validation.js";
import { ProfilesService } from "./profiles.service.js";

@Controller("profiles")
export class ProfilesController {
  constructor(private readonly profilesService: ProfilesService) {}

  @Get(":userId/completion")
  async getProfileCompletion(
    @Param("userId") userIdParam: string,
    @ActorUserId() actorUserId: string,
  ) {
    const userId = this.parseOwnedUserId(userIdParam, actorUserId);
    return ok(await this.profilesService.getProfileCompletion(userId));
  }

  @Get(":userId/trust")
  async getTrustProfile(
    @Param("userId") userIdParam: string,
    @ActorUserId() actorUserId: string,
  ) {
    const userId = this.parseOwnedUserId(userIdParam, actorUserId);
    return ok(await this.profilesService.getTrustProfile(userId));
  }

  @Get(":userId/interests")
  async listInterests(
    @Param("userId") userIdParam: string,
    @ActorUserId() actorUserId: string,
  ) {
    const userId = this.parseOwnedUserId(userIdParam, actorUserId);
    return ok(await this.profilesService.listInterests(userId));
  }

  @Put(":userId/interests")
  async replaceInterests(
    @Param("userId") userIdParam: string,
    @Body() body: unknown,
    @ActorUserId() actorUserId: string,
  ) {
    const userId = this.parseOwnedUserId(userIdParam, actorUserId);
    const payload = parseRequestPayload(profileInterestsBodySchema, body);
    return ok(
      await this.profilesService.replaceInterests(userId, payload.interests),
    );
  }

  @Get(":userId/topics")
  async listTopics(
    @Param("userId") userIdParam: string,
    @ActorUserId() actorUserId: string,
  ) {
    const userId = this.parseOwnedUserId(userIdParam, actorUserId);
    return ok(await this.profilesService.listTopics(userId));
  }

  @Put(":userId/topics")
  async replaceTopics(
    @Param("userId") userIdParam: string,
    @Body() body: unknown,
    @ActorUserId() actorUserId: string,
  ) {
    const userId = this.parseOwnedUserId(userIdParam, actorUserId);
    const payload = parseRequestPayload(profileTopicsBodySchema, body);
    return ok(await this.profilesService.replaceTopics(userId, payload.topics));
  }

  @Get(":userId/availability-windows")
  async listAvailabilityWindows(
    @Param("userId") userIdParam: string,
    @ActorUserId() actorUserId: string,
  ) {
    const userId = this.parseOwnedUserId(userIdParam, actorUserId);
    return ok(await this.profilesService.listAvailabilityWindows(userId));
  }

  @Put(":userId/availability-windows")
  async replaceAvailabilityWindows(
    @Param("userId") userIdParam: string,
    @Body() body: unknown,
    @ActorUserId() actorUserId: string,
  ) {
    const userId = this.parseOwnedUserId(userIdParam, actorUserId);
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
    @ActorUserId() actorUserId: string,
  ) {
    const userId = this.parseOwnedUserId(userIdParam, actorUserId);
    const payload = parseRequestPayload(profileSocialModeBodySchema, body);
    return ok(
      await this.profilesService.setSocialModeSettings(userId, payload),
    );
  }

  @Get(":userId/intent-preferences")
  async listIntentPreferences(
    @Param("userId") userIdParam: string,
    @ActorUserId() actorUserId: string,
  ) {
    const userId = this.parseOwnedUserId(userIdParam, actorUserId);
    return ok(await this.profilesService.listIntentTypePreferences(userId));
  }

  @Put(":userId/intent-preferences")
  async setIntentPreference(
    @Param("userId") userIdParam: string,
    @Body() body: unknown,
    @ActorUserId() actorUserId: string,
  ) {
    const userId = this.parseOwnedUserId(userIdParam, actorUserId);
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

  @Post(":userId/photos/upload-intent")
  async createPhotoUploadIntent(
    @Param("userId") userIdParam: string,
    @Body() body: unknown,
    @ActorUserId() actorUserId: string,
  ) {
    const userId = this.parseOwnedUserId(userIdParam, actorUserId);
    const payload = parseRequestPayload(
      profilePhotoUploadIntentBodySchema,
      body,
    );
    return ok(
      await this.profilesService.createPhotoUploadIntent(userId, payload),
    );
  }

  @Post(":userId/photos/:imageId/complete")
  async completePhotoUpload(
    @Param("userId") userIdParam: string,
    @Param("imageId") imageIdParam: string,
    @Body() body: unknown,
    @ActorUserId() actorUserId: string,
  ) {
    const userId = this.parseOwnedUserId(userIdParam, actorUserId);
    const imageId = parseRequestPayload(uuidSchema, imageIdParam);
    const payload = parseRequestPayload(
      profilePhotoUploadCompleteBodySchema,
      body,
    );
    return ok(
      await this.profilesService.confirmPhotoUpload(userId, imageId, payload),
    );
  }

  @Get(":userId/photos")
  async listProfilePhotos(
    @Param("userId") userIdParam: string,
    @ActorUserId() actorUserId: string,
  ) {
    const userId = this.parseOwnedUserId(userIdParam, actorUserId);
    return ok(await this.profilesService.listProfilePhotos(userId));
  }

  @Get(":userId/photo")
  async getPrimaryPhoto(
    @Param("userId") userIdParam: string,
    @ActorUserId() actorUserId: string,
  ) {
    const userId = this.parseOwnedUserId(userIdParam, actorUserId);
    return ok(await this.profilesService.getPrimaryProfilePhoto(userId));
  }

  @Get(":userId")
  async getProfile(
    @Param("userId") userIdParam: string,
    @ActorUserId() actorUserId: string,
  ) {
    const userId = this.parseOwnedUserId(userIdParam, actorUserId);
    return ok(await this.profilesService.getProfile(userId));
  }

  @Put(":userId")
  async updateProfile(
    @Param("userId") userIdParam: string,
    @Body() body: unknown,
    @ActorUserId() actorUserId: string,
  ) {
    const userId = this.parseOwnedUserId(userIdParam, actorUserId);
    const payload = parseRequestPayload(profileUpdateBodySchema, body);
    return ok(await this.profilesService.upsertProfile(userId, payload));
  }

  private parseOwnedUserId(userIdParam: string, actorUserId: string) {
    const userId = parseRequestPayload(uuidSchema, userIdParam);
    assertActorOwnsUser(
      actorUserId,
      userId,
      "profile does not belong to authenticated user",
    );
    return userId;
  }
}
