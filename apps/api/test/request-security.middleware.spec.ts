import { afterEach, describe, expect, it, vi } from "vitest";
import {
  requestSecurityMiddleware,
  resetRequestSecurityState,
} from "../src/common/request-security.middleware.js";

function createResponse() {
  const response: any = {
    setHeader: vi.fn().mockReturnThis(),
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
  return response;
}

function createRequest(input: {
  method: string;
  path: string;
  ip?: string;
  traceId?: string;
  headers?: Record<string, string>;
}) {
  return {
    method: input.method,
    path: input.path,
    originalUrl: input.path,
    ip: input.ip ?? "127.0.0.1",
    headers: input.headers ?? {},
    socket: { remoteAddress: input.ip ?? "127.0.0.1" },
    traceId: input.traceId,
  } as any;
}

describe("requestSecurityMiddleware", () => {
  afterEach(() => {
    delete process.env.RATE_LIMIT_GLOBAL_MAX_REQUESTS;
    delete process.env.RATE_LIMIT_GLOBAL_WINDOW_MS;
    delete process.env.ABUSE_THROTTLE_MAX_SCORE;
    delete process.env.ABUSE_THROTTLE_BLOCK_MS;
    resetRequestSecurityState();
  });

  it("allows requests within configured rate limits", () => {
    process.env.RATE_LIMIT_GLOBAL_MAX_REQUESTS = "5";
    const request = createRequest({
      method: "GET",
      path: "/api/profiles/11111111-1111-4111-8111-111111111111",
    });
    const response = createResponse();
    const next = vi.fn();

    requestSecurityMiddleware(request, response, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(response.status).not.toHaveBeenCalled();
  });

  it("returns 429 when fixed-window rate limit is exceeded", () => {
    process.env.RATE_LIMIT_GLOBAL_MAX_REQUESTS = "1";
    process.env.RATE_LIMIT_GLOBAL_WINDOW_MS = "60000";

    const request = createRequest({
      method: "GET",
      path: "/api/health",
      ip: "203.0.113.10",
    });
    const responseA = createResponse();
    const responseB = createResponse();
    const next = vi.fn();

    requestSecurityMiddleware(request, responseA, next);
    requestSecurityMiddleware(request, responseB, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(responseB.status).toHaveBeenCalledWith(429);
    expect(responseB.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({
          code: "rate_limited",
        }),
      }),
    );
  });

  it("throttles abusive bursts on high-risk endpoints", () => {
    process.env.ABUSE_THROTTLE_MAX_SCORE = "8";
    process.env.ABUSE_THROTTLE_BLOCK_MS = "60000";

    const request = createRequest({
      method: "POST",
      path: "/api/intents",
      ip: "203.0.113.99",
    });
    const responseA = createResponse();
    const responseB = createResponse();
    const next = vi.fn();

    requestSecurityMiddleware(request, responseA, next);
    requestSecurityMiddleware(request, responseB, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(responseB.status).toHaveBeenCalledWith(429);
    expect(responseB.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({
          code: "abuse_throttled",
        }),
      }),
    );
  });

  it("does not abuse-throttle trusted admin reads", () => {
    process.env.ABUSE_THROTTLE_MAX_SCORE = "8";
    process.env.ABUSE_THROTTLE_BLOCK_MS = "60000";

    const next = vi.fn();

    for (let index = 0; index < 5; index += 1) {
      const request = createRequest({
        method: "GET",
        path: "/api/admin/ops/metrics",
        ip: "203.0.113.50",
        headers: {
          "x-admin-user-id": "11111111-1111-4111-8111-111111111111",
          "x-admin-role": "admin",
        },
      });
      const response = createResponse();

      requestSecurityMiddleware(request, response, next);

      expect(response.status).not.toHaveBeenCalled();
    }

    expect(next).toHaveBeenCalledTimes(5);
  });

  it("still abuse-throttles admin reads without trusted admin headers", () => {
    process.env.ABUSE_THROTTLE_MAX_SCORE = "8";
    process.env.ABUSE_THROTTLE_BLOCK_MS = "60000";

    const request = createRequest({
      method: "GET",
      path: "/api/admin/ops/metrics",
      ip: "203.0.113.51",
    });
    const responseA = createResponse();
    const responseB = createResponse();
    const next = vi.fn();

    requestSecurityMiddleware(request, responseA, next);
    requestSecurityMiddleware(request, responseB, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(responseB.status).toHaveBeenCalledWith(429);
    expect(responseB.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({
          code: "abuse_throttled",
        }),
      }),
    );
  });
});
