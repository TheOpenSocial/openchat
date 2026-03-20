import { Logger } from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";
import { timingSafeEqual } from "node:crypto";

const logger = new Logger("AdminSecurity");
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ADMIN_ROLES = new Set(["admin", "support", "moderator"]);

function isEnabled() {
  return process.env.ADMIN_SECURITY_ENABLED !== "false";
}

function parseAllowedAdminUsers() {
  const raw = process.env.ADMIN_ALLOWED_USER_IDS?.trim();
  if (!raw) {
    return null;
  }
  const users = new Set(
    raw
      .split(",")
      .map((value) => value.trim())
      .filter((value) => value.length > 0),
  );
  return users.size > 0 ? users : null;
}

function parseAdminRoleBindings() {
  const raw = process.env.ADMIN_ROLE_BINDINGS?.trim();
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as Record<string, string | string[]>;
    const bindings = new Map<string, Set<string>>();
    for (const [userId, value] of Object.entries(parsed)) {
      const roles = Array.isArray(value) ? value : [value];
      const normalized = roles
        .map((role) => role.trim())
        .filter((role) => ADMIN_ROLES.has(role));
      if (normalized.length > 0) {
        bindings.set(userId, new Set(normalized));
      }
    }
    return bindings;
  } catch {
    return null;
  }
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }
  return timingSafeEqual(leftBuffer, rightBuffer);
}

function reject(
  response: Response,
  message: string,
  code = "admin_access_denied",
) {
  response.status(403).json({
    success: false,
    error: {
      code,
      message,
    },
  });
}

export function adminSecurityMiddleware(
  request: Request,
  response: Response,
  next: NextFunction,
) {
  if (!isEnabled()) {
    next();
    return;
  }

  const path = (request.path || request.originalUrl || "").toLowerCase();
  if (!path.startsWith("/api/admin")) {
    next();
    return;
  }

  const adminUserIdRaw = request.headers["x-admin-user-id"];
  const adminRoleRaw = request.headers["x-admin-role"];
  const adminApiKeyRaw = request.headers["x-admin-api-key"];

  const adminUserId = Array.isArray(adminUserIdRaw)
    ? adminUserIdRaw[0]
    : adminUserIdRaw;
  const adminRole = Array.isArray(adminRoleRaw)
    ? adminRoleRaw[0]
    : adminRoleRaw;
  const adminApiKey = Array.isArray(adminApiKeyRaw)
    ? adminApiKeyRaw[0]
    : adminApiKeyRaw;

  if (typeof adminUserId !== "string" || !UUID_REGEX.test(adminUserId)) {
    reject(response, "admin user id is required");
    return;
  }

  if (typeof adminRole !== "string" || !ADMIN_ROLES.has(adminRole)) {
    reject(response, "admin role is required");
    return;
  }

  const requiredApiKey = process.env.ADMIN_API_KEY?.trim();
  if (requiredApiKey) {
    if (
      typeof adminApiKey !== "string" ||
      !safeEqual(adminApiKey, requiredApiKey)
    ) {
      logger.warn(
        JSON.stringify({
          event: "security.admin_access_denied",
          reason: "invalid_api_key",
          adminUserId,
          adminRole,
          path,
          ip: request.ip ?? null,
        }),
      );
      reject(response, "admin api key is invalid");
      return;
    }
  }

  const allowedUsers = parseAllowedAdminUsers();
  if (allowedUsers && !allowedUsers.has(adminUserId)) {
    reject(response, "admin user is not allowlisted");
    return;
  }

  const roleBindings = parseAdminRoleBindings();
  if (roleBindings) {
    const allowedRoles = roleBindings.get(adminUserId);
    if (!allowedRoles || !allowedRoles.has(adminRole)) {
      reject(response, "admin role binding mismatch");
      return;
    }
  }

  next();
}
