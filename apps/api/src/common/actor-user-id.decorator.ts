import {
  UnauthorizedException,
  createParamDecorator,
  type ExecutionContext,
} from "@nestjs/common";
import type { AuthenticatedRequest } from "./auth-context.js";

export const ActorUserId = createParamDecorator(
  (_data: unknown, context: ExecutionContext) => {
    const request = context
      .switchToHttp()
      .getRequest<AuthenticatedRequest | undefined>();
    const actorUserId = request?.auth?.userId;
    if (!actorUserId) {
      throw new UnauthorizedException("authenticated user context missing");
    }
    return actorUserId;
  },
);
