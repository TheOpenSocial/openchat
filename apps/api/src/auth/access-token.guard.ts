import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { AuthenticatedRequest } from "../common/auth-context.js";
import { extractAccessTokenForHttp } from "../common/auth-context.js";
import { AuthService } from "./auth.service.js";
import { PUBLIC_ROUTE_KEY } from "./public-route.decorator.js";

@Injectable()
export class AccessTokenGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authService: AuthService,
  ) {}

  async canActivate(context: ExecutionContext) {
    if (context.getType() !== "http") {
      return true;
    }
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (request.method?.toUpperCase() === "OPTIONS") {
      return true;
    }
    const isPublicRoute = this.reflector.getAllAndOverride<boolean>(
      PUBLIC_ROUTE_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (isPublicRoute) {
      return true;
    }

    const accessToken = extractAccessTokenForHttp(request);
    if (!accessToken) {
      throw new UnauthorizedException("access token is required");
    }

    const principal = await this.authService.verifyAccessToken(accessToken);
    request.auth = principal;
    return true;
  }
}
