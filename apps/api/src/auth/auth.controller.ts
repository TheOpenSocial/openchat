import { Body, Controller, Get, Param, Post, Query, Res } from "@nestjs/common";
import {
  authGoogleBrowserCallbackQuerySchema,
  authGoogleCallbackBodySchema,
  authGoogleStartQuerySchema,
  authRefreshBodySchema,
  authRevokeAllSessionsBodySchema,
  authRevokeSessionBodySchema,
  uuidSchema,
} from "@opensocial/types";
import type { Response } from "express";
import { ok } from "../common/api-response.js";
import { ActorUserId } from "../common/actor-user-id.decorator.js";
import { assertActorOwnsUser } from "../common/auth-context.js";
import { parseRequestPayload } from "../common/validation.js";
import { AuthService } from "./auth.service.js";
import { PublicRoute } from "./public-route.decorator.js";

@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @PublicRoute()
  @Get("google")
  googleAuthStart(@Query() query: unknown) {
    const payload = parseRequestPayload(
      authGoogleStartQuerySchema,
      query ?? {},
    );
    return ok(
      this.authService.getGoogleOAuthUrl({
        mobileRedirectUri: payload.mobileRedirectUri,
      }),
    );
  }

  @PublicRoute()
  @Get("google/callback")
  googleCallbackBrowser(@Query() query: unknown, @Res() response: Response) {
    const payload = parseRequestPayload(
      authGoogleBrowserCallbackQuerySchema,
      query ?? {},
    );
    const result = this.authService.buildGoogleOAuthCallbackResponse(payload);
    if (result.redirectUrl) {
      response.redirect(result.statusCode, result.redirectUrl);
      return;
    }
    response
      .status(result.statusCode)
      .contentType("text/html; charset=utf-8")
      .send(result.html ?? "");
  }

  @PublicRoute()
  @Post("google/callback")
  async googleCallbackTokenExchange(@Body() body: unknown) {
    const parsed = parseRequestPayload(authGoogleCallbackBodySchema, body);
    const user = await this.authService.bootstrapGoogleUser(parsed.code);
    return ok({
      user,
      ...(await this.authService.issueSessionTokens(user.id)),
    });
  }

  @PublicRoute()
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
  async listSessions(
    @Param("userId") userIdParam: string,
    @ActorUserId() actorUserId: string,
  ) {
    const userId = parseRequestPayload(uuidSchema, userIdParam);
    assertActorOwnsUser(actorUserId, userId, "sessions not owned by user");
    return ok(await this.authService.listUserSessions(userId));
  }

  @Post("sessions/:sessionId/revoke")
  async revokeSession(
    @Param("sessionId") sessionIdParam: string,
    @Body() body: unknown,
    @ActorUserId() actorUserId: string,
  ) {
    const sessionId = parseRequestPayload(uuidSchema, sessionIdParam);
    const payload = parseRequestPayload(authRevokeSessionBodySchema, body);
    assertActorOwnsUser(
      actorUserId,
      payload.userId,
      "session not owned by user",
    );
    return ok(await this.authService.revokeSession(payload.userId, sessionId));
  }

  @Post("sessions/revoke-all")
  async revokeAllSessions(
    @Body() body: unknown,
    @ActorUserId() actorUserId: string,
  ) {
    const payload = parseRequestPayload(authRevokeAllSessionsBodySchema, body);
    assertActorOwnsUser(
      actorUserId,
      payload.userId,
      "sessions not owned by user",
    );
    return ok(
      await this.authService.revokeAllSessions(
        payload.userId,
        payload.exceptSessionId,
      ),
    );
  }
}
