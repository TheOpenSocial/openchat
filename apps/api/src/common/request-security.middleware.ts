import { createHash } from "node:crypto";
import { Logger } from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";
import { extractAccessTokenForHttp } from "./auth-context.js";

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
  playgroundWindowMs: number;
  playgroundLimit: number;
  authWindowMs: number;
  authLimit: number;
  abuseWindowMs: number;
  abuseMaxScore: number;
  abuseBlockMs: number;
}

const logger = new Logger("RequestSecurity");
const rateCounters = new Map<string, CounterWindow>();
const playgroundCounters = new Map<string, CounterWindow>();
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
  playgroundWindowMs: 60_000,
  playgroundLimit: 20,
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
    playgroundWindowMs: readEnvNumber(
      "RATE_LIMIT_PLAYGROUND_WINDOW_MS",
      DEFAULT_CONFIG.playgroundWindowMs,
    ),
    playgroundLimit: readEnvNumber(
      "RATE_LIMIT_PLAYGROUND_MAX_REQUESTS",
      DEFAULT_CONFIG.playgroundLimit,
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

function fingerprintAccessToken(token: string) {
  return createHash("sha256").update(token).digest("hex").slice(0, 16);
}

function resolveAbuseIdentity(request: Request, ip: string) {
  const accessToken = extractAccessTokenForHttp(request as any);
  if (!accessToken) {
    return `ip:${ip}`;
  }
  return `token:${fingerprintAccessToken(accessToken)}`;
}

function hasAuthenticatedAccessToken(request: Request) {
  return Boolean(extractAccessTokenForHttp(request as any));
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

function isPlaygroundPath(path: string) {
  return path.startsWith("/api/admin/playground/");
}

function isVerificationBypassPath(path: string) {
  return (
    path.startsWith("/api/intents") ||
    path.startsWith("/api/agent/threads/") ||
    path.startsWith("/api/admin/ops/agent-workflows")
  );
}

function isSelfServiceOnboardingPath(path: string) {
  return (
    path === "/api/onboarding/infer" ||
    path === "/api/onboarding/infer-fast" ||
    path === "/api/onboarding/activation-plan" ||
    path === "/api/onboarding/activation-bootstrap" ||
    path === "/api/onboarding/activation-execute"
  );
}

function isSelfServiceAgentThreadPath(path: string) {
  return (
    path === "/api/agent/threads/me/summary" ||
    /^\/api\/agent\/threads\/[0-9a-f-]+\/messages\/?$/i.test(path) ||
    /^\/api\/agent\/threads\/[0-9a-f-]+\/respond(\/stream)?\/?$/i.test(path)
  );
}

function computeAbuseRequestScore(input: {
  isAuthenticated: boolean;
  isHighRisk: boolean;
  isTrustedAdmin: boolean;
  isWrite: boolean;
  path: string;
}) {
  if (input.isTrustedAdmin) {
    return 1;
  }

  if (
    input.isAuthenticated &&
    (isSelfServiceOnboardingPath(input.path) ||
      isSelfServiceAgentThreadPath(input.path))
  ) {
    return input.isWrite ? 2 : 1;
  }

  if (input.isHighRisk) {
    return 8;
  }

  if (input.isWrite) {
    return 3;
  }

  return 1;
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

function isVerificationBypassRequest(request: Request, path: string) {
  if (process.env.REQUEST_SECURITY_VERIFICATION_BYPASS_ENABLED !== "true") {
    return false;
  }
  if (!isVerificationBypassPath(path)) {
    return false;
  }

  const expectedKey = process.env.SMOKE_SESSION_APPLICATION_KEY?.trim();
  const expectedToken = process.env.SMOKE_SESSION_APPLICATION_TOKEN?.trim();
  const expectedLaneId = process.env.AGENTIC_VERIFICATION_LANE_ID?.trim();
  if (!expectedKey || !expectedToken || !expectedLaneId) {
    return false;
  }

  const applicationKey = getSingleHeader(request.headers["x-application-key"]);
  const applicationToken = getSingleHeader(
    request.headers["x-application-token"],
  );
  const laneId = getSingleHeader(request.headers["x-verification-lane-id"]);
  if (
    typeof applicationKey !== "string" ||
    typeof applicationToken !== "string" ||
    typeof laneId !== "string"
  ) {
    return false;
  }

  return (
    applicationKey === expectedKey &&
    applicationToken === expectedToken &&
    laneId === expectedLaneId
  );
}

function isTrustedSocialSimBypassRequest(request: Request, path: string) {
  if (!path.startsWith("/api/admin/social-sim/")) {
    return false;
  }
  if (!isTrustedAdminRequest(request, path)) {
    return false;
  }
  const namespace = getSingleHeader(
    request.headers["x-social-sim-namespace"],
  )?.trim();
  return typeof namespace === "string" && namespace.length > 0;
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
  pruneMap(playgroundCounters, now, config.playgroundWindowMs);
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
  const abuseIdentity = resolveAbuseIdentity(request, ip);
  const traceId = (request as Request & { traceId?: string }).traceId ?? null;
  const isWrite = isWriteMethod(method);
  const isAuth = isAuthPath(path);
  const isAuthenticated = hasAuthenticatedAccessToken(request);
  const isPlayground = isPlaygroundPath(path);
  const isVerificationBypass = isVerificationBypassRequest(request, path);
  const isTrustedSocialSimBypass = isTrustedSocialSimBypassRequest(
    request,
    path,
  );

  if (isVerificationBypass) {
    next();
    return;
  }

  if (isPlayground) {
    const playgroundIdentity =
      getSingleHeader(request.headers["x-admin-user-id"])?.trim() || ip;
    const playgroundKey = `playground:${playgroundIdentity}:${ip}`;
    const playgroundWindow = getOrInitWindow(
      playgroundCounters,
      playgroundKey,
      now,
      config.playgroundWindowMs,
    );
    if (playgroundWindow.blockedUntil && playgroundWindow.blockedUntil > now) {
      const retryAfterMs = playgroundWindow.blockedUntil - now;
      writeRateLimitHeaders(response, config.playgroundLimit, 0, retryAfterMs);
      reject(
        response,
        429,
        "rate_limited",
        "playground request rate limit exceeded",
        Math.ceil(retryAfterMs / 1000),
      );
      return;
    }
    playgroundWindow.count += 1;
    const playgroundRemaining = config.playgroundLimit - playgroundWindow.count;
    const playgroundResetMs = Math.max(
      0,
      playgroundWindow.windowStartedAt + config.playgroundWindowMs - now,
    );
    writeRateLimitHeaders(
      response,
      config.playgroundLimit,
      playgroundRemaining,
      playgroundResetMs,
    );
    if (playgroundWindow.count > config.playgroundLimit) {
      playgroundWindow.blockedUntil =
        now + Math.min(config.playgroundWindowMs, 15_000);
      logger.warn(
        JSON.stringify({
          event: "security.playground_rate_limited",
          traceId,
          ip,
          method,
          path,
          limit: config.playgroundLimit,
          windowMs: config.playgroundWindowMs,
        }),
      );
      reject(
        response,
        429,
        "rate_limited",
        "playground request rate limit exceeded",
        Math.ceil(Math.min(config.playgroundWindowMs, 15_000) / 1000),
      );
      return;
    }
  }

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

  if (!isTrustedSocialSimBypass) {
    const abuseKey = `abuse:${abuseIdentity}`;
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

    const requestScore = computeAbuseRequestScore({
      isAuthenticated,
      isHighRisk: isHighRiskPath(path),
      isTrustedAdmin: isTrustedAdminRequest(request, path),
      isWrite,
      path,
    });
    abuseWindow.count += requestScore;
    if (abuseWindow.count > config.abuseMaxScore) {
      abuseWindow.blockedUntil = now + config.abuseBlockMs;
      logger.warn(
        JSON.stringify({
          event: "security.abuse_throttled",
          traceId,
          ip,
          abuseIdentity,
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
  }

  next();
}

export function resetRequestSecurityState() {
  rateCounters.clear();
  playgroundCounters.clear();
  abuseCounters.clear();
  requestCounter = 0;
}
