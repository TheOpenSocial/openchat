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
    delete process.env.RATE_LIMIT_PLAYGROUND_MAX_REQUESTS;
    delete process.env.RATE_LIMIT_PLAYGROUND_WINDOW_MS;
    delete process.env.REQUEST_SECURITY_VERIFICATION_BYPASS_ENABLED;
    delete process.env.SMOKE_SESSION_APPLICATION_KEY;
    delete process.env.SMOKE_SESSION_APPLICATION_TOKEN;
    delete process.env.AGENTIC_VERIFICATION_LANE_ID;
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

  it("isolates abuse throttling by authenticated token instead of shared ip", () => {
    process.env.ABUSE_THROTTLE_MAX_SCORE = "8";
    process.env.ABUSE_THROTTLE_BLOCK_MS = "60000";

    const sharedIp = "203.0.113.100";
    const next = vi.fn();

    const firstUserRequest = createRequest({
      method: "POST",
      path: "/api/profiles/11111111-1111-4111-8111-111111111111/photos/upload-intent",
      ip: sharedIp,
      headers: {
        authorization: "Bearer first-user-token",
      },
    });
    const secondUserRequest = createRequest({
      method: "POST",
      path: "/api/profiles/22222222-2222-4222-8222-222222222222/photos/upload-intent",
      ip: sharedIp,
      headers: {
        authorization: "Bearer second-user-token",
      },
    });

    const firstResponse = createResponse();
    const secondResponse = createResponse();

    requestSecurityMiddleware(firstUserRequest, firstResponse, next);
    requestSecurityMiddleware(secondUserRequest, secondResponse, next);

    expect(firstResponse.status).not.toHaveBeenCalled();
    expect(secondResponse.status).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(2);
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

  it("rate-limits admin playground requests with dedicated bucket", () => {
    process.env.RATE_LIMIT_PLAYGROUND_MAX_REQUESTS = "1";
    process.env.RATE_LIMIT_PLAYGROUND_WINDOW_MS = "60000";

    const request = createRequest({
      method: "GET",
      path: "/api/admin/playground/state",
      ip: "203.0.113.77",
      headers: {
        "x-admin-user-id": "11111111-1111-4111-8111-111111111111",
        "x-admin-role": "admin",
      },
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
          message: "playground request rate limit exceeded",
        }),
      }),
    );
  });

  it("bypasses abuse throttling for verification-lane requests with valid application credentials", () => {
    process.env.REQUEST_SECURITY_VERIFICATION_BYPASS_ENABLED = "true";
    process.env.SMOKE_SESSION_APPLICATION_KEY = "app-key";
    process.env.SMOKE_SESSION_APPLICATION_TOKEN = "app-token";
    process.env.AGENTIC_VERIFICATION_LANE_ID = "verification-lane-1";
    process.env.ABUSE_THROTTLE_MAX_SCORE = "8";
    process.env.ABUSE_THROTTLE_BLOCK_MS = "60000";

    const next = vi.fn();

    for (let index = 0; index < 4; index += 1) {
      const request = createRequest({
        method: "POST",
        path: "/api/intents",
        ip: "203.0.113.111",
        headers: {
          "x-application-key": "app-key",
          "x-application-token": "app-token",
          "x-verification-lane-id": "verification-lane-1",
        },
      });
      const response = createResponse();
      requestSecurityMiddleware(request, response, next);
      expect(response.status).not.toHaveBeenCalled();
    }

    expect(next).toHaveBeenCalledTimes(4);
  });

  it("does not bypass abuse throttling when verification-lane credentials are invalid", () => {
    process.env.REQUEST_SECURITY_VERIFICATION_BYPASS_ENABLED = "true";
    process.env.SMOKE_SESSION_APPLICATION_KEY = "app-key";
    process.env.SMOKE_SESSION_APPLICATION_TOKEN = "app-token";
    process.env.AGENTIC_VERIFICATION_LANE_ID = "verification-lane-1";
    process.env.ABUSE_THROTTLE_MAX_SCORE = "8";
    process.env.ABUSE_THROTTLE_BLOCK_MS = "60000";

    const next = vi.fn();
    const request = createRequest({
      method: "POST",
      path: "/api/intents",
      ip: "203.0.113.112",
      headers: {
        "x-application-key": "wrong-key",
        "x-application-token": "app-token",
        "x-verification-lane-id": "verification-lane-1",
      },
    });
    const responseA = createResponse();
    const responseB = createResponse();

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

  it("bypasses abuse throttling for trusted social simulation admin traffic with namespace header", () => {
    process.env.ABUSE_THROTTLE_MAX_SCORE = "8";
    process.env.ABUSE_THROTTLE_BLOCK_MS = "60000";

    const next = vi.fn();

    for (let index = 0; index < 6; index += 1) {
      const request = createRequest({
        method: "POST",
        path: "/api/admin/social-sim/turn",
        ip: "203.0.113.120",
        headers: {
          "x-admin-user-id": "11111111-1111-4111-8111-111111111111",
          "x-admin-role": "admin",
          "x-social-sim-namespace": "gha-social-sim-23813500382",
        },
      });
      const response = createResponse();
      requestSecurityMiddleware(request, response, next);
      expect(response.status).not.toHaveBeenCalled();
    }

    expect(next).toHaveBeenCalledTimes(6);
  });

  it("does not bypass abuse throttling for social simulation traffic without namespace header", () => {
    process.env.ABUSE_THROTTLE_MAX_SCORE = "3";
    process.env.ABUSE_THROTTLE_BLOCK_MS = "60000";

    const request = createRequest({
      method: "POST",
      path: "/api/admin/social-sim/turn",
      ip: "203.0.113.121",
      headers: {
        "x-admin-user-id": "11111111-1111-4111-8111-111111111111",
        "x-admin-role": "admin",
      },
    });
    const next = vi.fn();

    const responses = Array.from({ length: 4 }, () => createResponse());
    for (const response of responses) {
      requestSecurityMiddleware(request, response, next);
    }

    expect(next).toHaveBeenCalledTimes(3);
    const blockedResponse = responses[3];
    expect(blockedResponse.status).toHaveBeenCalledWith(429);
    expect(blockedResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({
          code: "abuse_throttled",
        }),
      }),
    );
  });
});
