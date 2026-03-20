import { UnauthorizedException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { AccessTokenGuard } from "../src/auth/access-token.guard.js";

function buildHttpContext(request: Record<string, unknown>, isPublic = false) {
  const reflector = {
    getAllAndOverride: vi.fn().mockReturnValue(isPublic),
  };
  const authService = {
    verifyAccessToken: vi.fn().mockResolvedValue({
      userId: "11111111-1111-4111-8111-111111111111",
      sessionId: "22222222-2222-4222-8222-222222222222",
    }),
  };
  const context = {
    getType: () => "http",
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  };

  return {
    guard: new AccessTokenGuard(reflector as any, authService as any),
    authService,
    context,
  };
}

describe("AccessTokenGuard", () => {
  it("allows OPTIONS requests without authentication", async () => {
    const request = {
      method: "OPTIONS",
      headers: {},
    };
    const { guard, authService, context } = buildHttpContext(request);

    await expect(guard.canActivate(context as any)).resolves.toBe(true);
    expect(authService.verifyAccessToken).not.toHaveBeenCalled();
  });

  it("allows public routes without authentication", async () => {
    const request = {
      method: "GET",
      headers: {},
    };
    const { guard, authService, context } = buildHttpContext(request, true);

    await expect(guard.canActivate(context as any)).resolves.toBe(true);
    expect(authService.verifyAccessToken).not.toHaveBeenCalled();
  });

  it("rejects private routes without bearer token", async () => {
    const request = {
      method: "GET",
      headers: {},
    };
    const { guard, context } = buildHttpContext(request);

    await expect(guard.canActivate(context as any)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it("accepts access_token query for agent thread SSE GET (EventSource)", async () => {
    const request = {
      method: "GET",
      path: "/api/agent/threads/11111111-1111-4111-8111-111111111111/stream",
      headers: {},
      query: { access_token: "sse-token" },
    };
    const { guard, authService, context } = buildHttpContext(request);

    await expect(guard.canActivate(context as any)).resolves.toBe(true);
    expect(authService.verifyAccessToken).toHaveBeenCalledWith("sse-token");
  });

  it("accepts access_token when path omits global /api prefix", async () => {
    const request = {
      method: "GET",
      path: "/agent/threads/11111111-1111-4111-8111-111111111111/stream",
      headers: {},
      query: { access_token: "sse-token-2" },
    };
    const { guard, authService, context } = buildHttpContext(request);

    await expect(guard.canActivate(context as any)).resolves.toBe(true);
    expect(authService.verifyAccessToken).toHaveBeenCalledWith("sse-token-2");
  });

  it("rejects access_token query outside agent thread SSE path", async () => {
    const request = {
      method: "GET",
      path: "/api/profiles/11111111-1111-4111-8111-111111111111/trust",
      headers: {},
      query: { access_token: "ignored" },
    };
    const { guard, authService, context } = buildHttpContext(request);

    await expect(guard.canActivate(context as any)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(authService.verifyAccessToken).not.toHaveBeenCalled();
  });
});
