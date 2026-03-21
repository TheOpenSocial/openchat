import { Logger } from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";

interface CounterWindow {
  windowStartedAt: number;
  count: number;
  blockedUntil: number | null;
}

interface RequestSecurityConfig {
  globalWindowMs: number;
  globalLimit: number;
  writeWindowMs: number;
  writeLimit: number;
  authWindowMs: number;
  authLimit: number;
  abuseWindowMs: number;
  abuseMaxScore: number;
  abuseBlockMs: number;
}

const logger = new Logger("RequestSecurity");
const rateCounters = new Map<string, CounterWindow>();
const abuseCounters = new Map<string, CounterWindow>();
let requestCounter = 0;
const ADMIN_ROLES = new Set(["admin", "support", "moderator"]);
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const DEFAULT_CONFIG: RequestSecurityConfig = {
  globalWindowMs: 60_000,
  globalLimit: 300,
  writeWindowMs: 60_000,
  writeLimit: 150,
  authWindowMs: 60_000,
  authLimit: 40,
  abuseWindowMs: 30_000,
  abuseMaxScore: 32,
  abuseBlockMs: 5 * 60_000,
};

function readConfig(): RequestSecurityConfig {
  return {
    globalWindowMs: readEnvNumber(
      "RATE_LIMIT_GLOBAL_WINDOW_MS",
      DEFAULT_CONFIG.globalWindowMs,
    ),
    globalLimit: readEnvNumber(
      "RATE_LIMIT_GLOBAL_MAX_REQUESTS",
      DEFAULT_CONFIG.globalLimit,
    ),
    writeWindowMs: readEnvNumber(
      "RATE_LIMIT_WRITE_WINDOW_MS",
      DEFAULT_CONFIG.writeWindowMs,
    ),
    writeLimit: readEnvNumber(
      "RATE_LIMIT_WRITE_MAX_REQUESTS",
      DEFAULT_CONFIG.writeLimit,
    ),
    authWindowMs: readEnvNumber(
      "RATE_LIMIT_AUTH_WINDOW_MS",
      DEFAULT_CONFIG.authWindowMs,
    ),
    authLimit: readEnvNumber(
      "RATE_LIMIT_AUTH_MAX_REQUESTS",
      DEFAULT_CONFIG.authLimit,
    ),
    abuseWindowMs: readEnvNumber(
      "ABUSE_THROTTLE_WINDOW_MS",
      DEFAULT_CONFIG.abuseWindowMs,
    ),
    abuseMaxScore: readEnvNumber(
      "ABUSE_THROTTLE_MAX_SCORE",
      DEFAULT_CONFIG.abuseMaxScore,
    ),
    abuseBlockMs: readEnvNumber(
      "ABUSE_THROTTLE_BLOCK_MS",
      DEFAULT_CONFIG.abuseBlockMs,
    ),
  };
}

function readEnvNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.floor(parsed);
}

function normalizePath(request: Request) {
  const path = request.path || request.originalUrl.split("?")[0] || "/";
  return path.toLowerCase();
}

function resolveClientIp(request: Request) {
  const forwarded = request.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim().length > 0) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) {
      return first;
    }
  }
  if (Array.isArray(forwarded) && forwarded.length > 0) {
    const first = forwarded[0]?.split(",")[0]?.trim();
    if (first) {
      return first;
    }
  }
  return request.ip || request.socket?.remoteAddress || "unknown-ip";
}

function isWriteMethod(method: string) {
  return (
    method === "POST" ||
    method === "PUT" ||
    method === "PATCH" ||
    method === "DELETE"
  );
}

function isAuthPath(path: string) {
  return path.startsWith("/api/auth/");
}

function isHighRiskPath(path: string) {
  return (
    path.startsWith("/api/intents") ||
    path.startsWith("/api/chats/") ||
    path.startsWith("/api/moderation/") ||
    path.startsWith("/api/inbox/requests/") ||
    path.startsWith("/api/admin/")
  );
}

function getSingleHeader(
  header: string | string[] | undefined,
): string | undefined {
  if (Array.isArray(header)) {
    return header[0];
  }
  return header;
}

function isTrustedAdminRequest(request: Request, path: string) {
  if (!path.startsWith("/api/admin/")) {
    return false;
  }

  const adminUserId = getSingleHeader(request.headers["x-admin-user-id"]);
  const adminRole = getSingleHeader(request.headers["x-admin-role"]);

  if (
    typeof adminUserId !== "string" ||
    !UUID_REGEX.test(adminUserId) ||
    typeof adminRole !== "string" ||
    !ADMIN_ROLES.has(adminRole)
  ) {
    return false;
  }

  const requiredApiKey = process.env.ADMIN_API_KEY?.trim();
  if (!requiredApiKey) {
    return true;
  }

  const adminApiKey = getSingleHeader(request.headers["x-admin-api-key"]);
  return typeof adminApiKey === "string" && adminApiKey === requiredApiKey;
}

function getOrInitWindow(
  map: Map<string, CounterWindow>,
  key: string,
  now: number,
  windowMs: number,
): CounterWindow {
  const existing = map.get(key);
  if (!existing) {
    const created: CounterWindow = {
      windowStartedAt: now,
      count: 0,
      blockedUntil: null,
    };
    map.set(key, created);
    return created;
  }

  if (now - existing.windowStartedAt >= windowMs) {
    existing.windowStartedAt = now;
    existing.count = 0;
  }
  return existing;
}

function writeRateLimitHeaders(
  response: Response,
  limit: number,
  remaining: number,
  resetMs: number,
) {
  response.setHeader("x-rate-limit-limit", String(limit));
  response.setHeader("x-rate-limit-remaining", String(Math.max(0, remaining)));
  response.setHeader("x-rate-limit-reset-ms", String(Math.max(0, resetMs)));
}

function reject(
  response: Response,
  statusCode: number,
  code: "rate_limited" | "abuse_throttled",
  message: string,
  retryAfterSeconds: number,
) {
  response.setHeader("retry-after", String(Math.max(1, retryAfterSeconds)));
  response.status(statusCode).json({
    success: false,
    error: {
      code,
      message,
    },
  });
}

function maybePrune(now: number, config: RequestSecurityConfig) {
  requestCounter += 1;
  if (requestCounter % 200 !== 0) {
    return;
  }
  pruneMap(
    rateCounters,
    now,
    Math.max(config.globalWindowMs, config.writeWindowMs),
  );
  pruneMap(
    abuseCounters,
    now,
    Math.max(config.abuseWindowMs, config.abuseBlockMs),
  );
}

function pruneMap(
  map: Map<string, CounterWindow>,
  now: number,
  inactivityWindowMs: number,
) {
  for (const [key, value] of map.entries()) {
    const inactive = now - value.windowStartedAt > inactivityWindowMs * 2;
    const unblocked = !value.blockedUntil || value.blockedUntil <= now;
    if (inactive && unblocked) {
      map.delete(key);
    }
  }
}

function isEnabled() {
  return process.env.REQUEST_SECURITY_ENABLED !== "false";
}

export function requestSecurityMiddleware(
  request: Request,
  response: Response,
  next: NextFunction,
) {
  if (!isEnabled()) {
    next();
    return;
  }

  const config = readConfig();
  const now = Date.now();
  maybePrune(now, config);

  const method = request.method.toUpperCase();
  const path = normalizePath(request);
  const ip = resolveClientIp(request);
  const traceId = (request as Request & { traceId?: string }).traceId ?? null;
  const isWrite = isWriteMethod(method);
  const isAuth = isAuthPath(path);

  const rateKey = isAuth
    ? `auth:${ip}`
    : isWrite
      ? `write:${ip}`
      : `global:${ip}`;
  const rateWindowMs = isAuth
    ? config.authWindowMs
    : isWrite
      ? config.writeWindowMs
      : config.globalWindowMs;
  const rateLimit = isAuth
    ? config.authLimit
    : isWrite
      ? config.writeLimit
      : config.globalLimit;

  const rateWindow = getOrInitWindow(rateCounters, rateKey, now, rateWindowMs);
  if (rateWindow.blockedUntil && rateWindow.blockedUntil > now) {
    const retryAfterMs = rateWindow.blockedUntil - now;
    writeRateLimitHeaders(response, rateLimit, 0, retryAfterMs);
    reject(
      response,
      429,
      "rate_limited",
      "request rate limit exceeded",
      Math.ceil(retryAfterMs / 1000),
    );
    return;
  }

  rateWindow.count += 1;
  const rateRemaining = rateLimit - rateWindow.count;
  const rateResetMs = Math.max(
    0,
    rateWindow.windowStartedAt + rateWindowMs - now,
  );
  writeRateLimitHeaders(response, rateLimit, rateRemaining, rateResetMs);
  if (rateWindow.count > rateLimit) {
    rateWindow.blockedUntil = now + Math.min(rateWindowMs, 15_000);
    logger.warn(
      JSON.stringify({
        event: "security.rate_limited",
        traceId,
        ip,
        method,
        path,
        limit: rateLimit,
        windowMs: rateWindowMs,
      }),
    );
    reject(
      response,
      429,
      "rate_limited",
      "request rate limit exceeded",
      Math.ceil(Math.min(rateWindowMs, 15_000) / 1000),
    );
    return;
  }

  const abuseKey = `abuse:${ip}`;
  const abuseWindow = getOrInitWindow(
    abuseCounters,
    abuseKey,
    now,
    config.abuseWindowMs,
  );
  if (abuseWindow.blockedUntil && abuseWindow.blockedUntil > now) {
    const retryAfterMs = abuseWindow.blockedUntil - now;
    reject(
      response,
      429,
      "abuse_throttled",
      "request temporarily blocked due to abuse controls",
      Math.ceil(retryAfterMs / 1000),
    );
    return;
  }

  const requestScore = isTrustedAdminRequest(request, path)
    ? 1
    : isHighRiskPath(path)
      ? 8
      : isWrite
        ? 3
        : 1;
  abuseWindow.count += requestScore;
  if (abuseWindow.count > config.abuseMaxScore) {
    abuseWindow.blockedUntil = now + config.abuseBlockMs;
    logger.warn(
      JSON.stringify({
        event: "security.abuse_throttled",
        traceId,
        ip,
        method,
        path,
        score: abuseWindow.count,
        maxScore: config.abuseMaxScore,
        blockMs: config.abuseBlockMs,
      }),
    );
    reject(
      response,
      429,
      "abuse_throttled",
      "request temporarily blocked due to abuse controls",
      Math.ceil(config.abuseBlockMs / 1000),
    );
    return;
  }

  next();
}

export function resetRequestSecurityState() {
  rateCounters.clear();
  abuseCounters.clear();
  requestCounter = 0;
}
