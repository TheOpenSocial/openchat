import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { AuthService } from "../src/auth/auth.service.js";

describe("AuthService", () => {
  it("bootstraps user/profile/thread for first Google login", async () => {
    const prisma: any = {
      user: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({
          id: "11111111-1111-4111-8111-111111111111",
          displayName: "User demo",
        }),
      },
      userProfile: {
        create: vi.fn().mockResolvedValue({}),
      },
      agentThread: {
        create: vi.fn().mockResolvedValue({}),
      },
    };

    const jwtService: any = {
      sign: vi.fn(),
      verify: vi.fn(),
    };

    const service = new AuthService(jwtService, prisma);
    const user = await service.bootstrapGoogleUser("test-google-code");

    expect(user.id).toBe("11111111-1111-4111-8111-111111111111");
    expect(prisma.user.create).toHaveBeenCalledTimes(1);
    expect(prisma.userProfile.create).toHaveBeenCalledTimes(1);
    expect(prisma.agentThread.create).toHaveBeenCalledTimes(1);
  });

  it("creates persisted session when issuing tokens", async () => {
    const prisma: any = {
      userSession: {
        create: vi.fn().mockResolvedValue({}),
      },
    };

    const jwtService: any = {
      sign: vi
        .fn()
        .mockImplementation((payload: any) =>
          payload.tokenType === "refresh"
            ? `refresh-${payload.sub}-${payload.sessionId}`
            : `access-${payload.sub}-${payload.sessionId}`,
        ),
      verify: vi.fn(),
    };

    const service = new AuthService(jwtService, prisma);
    const result = await service.issueSessionTokens(
      "11111111-1111-4111-8111-111111111111",
      {
        deviceName: "MacBook",
      },
    );

    expect(result.sessionId).toBeDefined();
    expect(prisma.userSession.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          id: result.sessionId,
          deviceName: "MacBook",
        }),
      }),
    );
  });

  it("rotates refresh token on refresh", async () => {
    const oldRefreshToken = "refresh-old";
    const oldHash = createHash("sha256").update(oldRefreshToken).digest("hex");

    const prisma: any = {
      userSession: {
        findUnique: vi.fn().mockResolvedValue({
          id: "session-1",
          userId: "11111111-1111-4111-8111-111111111111",
          status: "active",
          expiresAt: new Date(Date.now() + 60_000),
          refreshTokenHash: oldHash,
          deviceId: null,
          deviceName: null,
          userAgent: null,
          ipAddress: null,
        }),
        update: vi.fn().mockResolvedValue({}),
      },
    };

    const jwtService: any = {
      sign: vi
        .fn()
        .mockImplementation((payload: any) =>
          payload.tokenType === "refresh"
            ? "refresh-new"
            : `access-${payload.sub}-${payload.sessionId}`,
        ),
      verify: vi.fn().mockReturnValue({
        sub: "11111111-1111-4111-8111-111111111111",
        sessionId: "session-1",
        tokenType: "refresh",
      }),
    };

    const service = new AuthService(jwtService, prisma);
    const result = await service.refreshSession(oldRefreshToken, {
      userAgent: "new-agent",
    });

    expect(result.refreshToken).toBe("refresh-new");
    expect(prisma.userSession.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "session-1" },
        data: expect.objectContaining({
          userAgent: "new-agent",
          refreshTokenHash: createHash("sha256")
            .update("refresh-new")
            .digest("hex"),
        }),
      }),
    );
  });
});
