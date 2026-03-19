import { Body, Controller, Get, Post } from "@nestjs/common";
import { authGoogleCallbackBodySchema } from "@opensocial/types";
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
  googleCallback(@Body() body: unknown) {
    const parsed = parseRequestPayload(authGoogleCallbackBodySchema, body);
    const userId = `google-${parsed.code.slice(0, 8)}`;
    return ok(this.authService.issueSessionTokens(userId));
  }
}
