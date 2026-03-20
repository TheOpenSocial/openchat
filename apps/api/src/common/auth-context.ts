import { ForbiddenException, UnauthorizedException } from "@nestjs/common";
import type { Request } from "express";

export interface AccessPrincipal {
  userId: string;
  sessionId: string;
}

export interface AuthenticatedRequest extends Request {
  auth?: AccessPrincipal;
}

export function extractBearerToken(
  authorizationHeader: string | string[] | undefined,
) {
  const headerValue = Array.isArray(authorizationHeader)
    ? authorizationHeader[0]
    : authorizationHeader;
  if (!headerValue) {
    return null;
  }
  const [scheme, token] = headerValue.split(" ");
  if (!scheme || !token || scheme.toLowerCase() !== "bearer") {
    return null;
  }
  return token.trim().length > 0 ? token.trim() : null;
}

const AGENT_THREAD_SSE_UUID =
  "[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
const AGENT_THREAD_SSE_PATH = new RegExp(
  `^/api/agent/threads/${AGENT_THREAD_SSE_UUID}/stream/?$`,
  "i",
);
const AGENT_THREAD_SSE_PATH_UNPREFIXED = new RegExp(
  `^/agent/threads/${AGENT_THREAD_SSE_UUID}/stream/?$`,
  "i",
);

export function isAgentThreadSseGetPath(path: string | undefined): boolean {
  if (!path) {
    return false;
  }
  return (
    AGENT_THREAD_SSE_PATH.test(path) ||
    AGENT_THREAD_SSE_PATH_UNPREFIXED.test(path)
  );
}

/**
 * Prefer Authorization bearer; for GET agent thread SSE only, accept `access_token` query
 * because browsers cannot attach headers to EventSource.
 */
function resolvedHttpPath(request: AuthenticatedRequest) {
  const fromPath = request.path?.trim();
  if (fromPath && fromPath.length > 0) {
    return fromPath;
  }
  const raw = request.originalUrl ?? request.url ?? "";
  return raw.split("?")[0] ?? "";
}

export function extractAccessTokenForHttp(request: AuthenticatedRequest) {
  const bearer = extractBearerToken(request.headers.authorization);
  if (bearer) {
    return bearer;
  }
  if (request.method?.toUpperCase() !== "GET") {
    return null;
  }
  if (!isAgentThreadSseGetPath(resolvedHttpPath(request))) {
    return null;
  }
  const raw = request.query?.access_token;
  const token = Array.isArray(raw) ? raw[0] : raw;
  return typeof token === "string" && token.trim().length > 0
    ? token.trim()
    : null;
}

export function requireAccessPrincipal(request: Request): AccessPrincipal {
  const principal = (request as AuthenticatedRequest).auth;
  if (!principal?.userId || !principal.sessionId) {
    throw new UnauthorizedException("authenticated user context missing");
  }
  return principal;
}

export function requireAuthenticatedUserId(request: Request) {
  return requireAccessPrincipal(request).userId;
}

export function assertActorOwnsUser(
  actorUserId: string,
  targetUserId: string,
  errorMessage = "resource not owned by authenticated user",
) {
  if (actorUserId !== targetUserId) {
    throw new ForbiddenException(errorMessage);
  }
}
