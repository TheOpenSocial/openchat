import { Body, Controller, Post } from "@nestjs/common";
import {
  moderationBlockBodySchema,
  moderationReportBodySchema,
} from "@opensocial/types";
import { ok } from "../common/api-response.js";
import { parseRequestPayload } from "../common/validation.js";
import { ModerationService } from "./moderation.service.js";

@Controller("moderation")
export class ModerationController {
  constructor(private readonly moderationService: ModerationService) {}

  @Post("reports")
  async report(@Body() body: unknown) {
    const payload = parseRequestPayload(moderationReportBodySchema, body);
    return ok(
      await this.moderationService.createReport(
        payload.reporterUserId,
        payload.targetUserId,
        payload.reason,
        payload.details,
      ),
    );
  }

  @Post("blocks")
  async block(@Body() body: unknown) {
    const payload = parseRequestPayload(moderationBlockBodySchema, body);
    return ok(
      await this.moderationService.blockUser(
        payload.blockerUserId,
        payload.blockedUserId,
      ),
    );
  }
}
