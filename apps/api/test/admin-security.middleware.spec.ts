import { afterEach, describe, expect, it, vi } from "vitest";
import { adminSecurityMiddleware } from "../src/admin/admin-security.middleware.js";

function createResponse() {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as any;
}

function createRequest(headers: Record<string, string>) {
  return {
    path: "/api/admin/health",
    originalUrl: "/api/admin/health",
    headers,
    ip: "127.0.0.1",
  } as any;
}

describe("adminSecurityMiddleware", () => {
  afterEach(() => {
    delete process.env.ADMIN_API_KEY;
    delete process.env.ADMIN_ALLOWED_USER_IDS;
    delete process.env.ADMIN_ROLE_BINDINGS;
  });

  it("allows admin requests when security constraints are satisfied", () => {
    process.env.ADMIN_API_KEY = "super-secret";
    process.env.ADMIN_ALLOWED_USER_IDS = "11111111-1111-4111-8111-111111111111";

    const request = createRequest({
      "x-admin-user-id": "11111111-1111-4111-8111-111111111111",
      "x-admin-role": "admin",
      "x-admin-api-key": "super-secret",
    });
    const response = createResponse();
    const next = vi.fn();

    adminSecurityMiddleware(request, response, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(response.status).not.toHaveBeenCalled();
  });

  it("rejects requests with missing or invalid admin api key", () => {
    process.env.ADMIN_API_KEY = "required-secret";

    const request = createRequest({
      "x-admin-user-id": "11111111-1111-4111-8111-111111111111",
      "x-admin-role": "admin",
      "x-admin-api-key": "wrong-secret",
    });
    const response = createResponse();
    const next = vi.fn();

    adminSecurityMiddleware(request, response, next);

    expect(next).not.toHaveBeenCalled();
    expect(response.status).toHaveBeenCalledWith(403);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({
          code: "admin_access_denied",
        }),
      }),
    );
  });

  it("enforces admin role bindings when configured", () => {
    process.env.ADMIN_ROLE_BINDINGS = JSON.stringify({
      "11111111-1111-4111-8111-111111111111": ["support"],
    });

    const request = createRequest({
      "x-admin-user-id": "11111111-1111-4111-8111-111111111111",
      "x-admin-role": "admin",
    });
    const response = createResponse();
    const next = vi.fn();

    adminSecurityMiddleware(request, response, next);

    expect(next).not.toHaveBeenCalled();
    expect(response.status).toHaveBeenCalledWith(403);
  });
});
