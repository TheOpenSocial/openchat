import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import {
  authGoogleCallbackBodySchema,
  authRefreshBodySchema,
  authRevokeSessionBodySchema,
  uuidSchema,
} from "@opensocial/types";
import { ok } from "../common/api-response.js";
import { parseRequestPayload } from "../common/validation.js";
import { AuthService } from "./auth.service.js";

@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get("google")
  googleAuthStart() {
    return ok(this.authService.getGoogleOAuthUrl());
  }

  @Post("google/callback")
  async googleCallback(@Body() body: unknown) {
    const parsed = parseRequestPayload(authGoogleCallbackBodySchema, body);
    const user = await this.authService.bootstrapGoogleUser(parsed.code);
    return ok({
      user,
      ...(await this.authService.issueSessionTokens(user.id)),
    });
  }

  @Post("refresh")
  async refresh(@Body() body: unknown) {
    const payload = parseRequestPayload(authRefreshBodySchema, body);
    return ok(
      await this.authService.refreshSession(payload.refreshToken, {
        deviceId: payload.deviceId,
        deviceName: payload.deviceName,
        userAgent: payload.userAgent,
        ipAddress: payload.ipAddress,
      }),
    );
  }

  @Get("sessions/:userId")
  async listSessions(@Param("userId") userIdParam: string) {
    const userId = parseRequestPayload(uuidSchema, userIdParam);
    return ok(await this.authService.listUserSessions(userId));
  }

  @Post("sessions/:sessionId/revoke")
  async revokeSession(
    @Param("sessionId") sessionIdParam: string,
    @Body() body: unknown,
  ) {
    const sessionId = parseRequestPayload(uuidSchema, sessionIdParam);
    const payload = parseRequestPayload(authRevokeSessionBodySchema, body);
    return ok(await this.authService.revokeSession(payload.userId, sessionId));
  }
}
