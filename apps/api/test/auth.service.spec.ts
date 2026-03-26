import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { AuthService } from "../src/auth/auth.service.js";

describe("AuthService", () => {
  it("requires GOOGLE_CLIENT_ID for OAuth start URL", () => {
    const previousClientId = process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_ID;

    try {
      const prisma: any = {};
      const jwtService: any = {
        sign: vi.fn(),
        verify: vi.fn(),
      };

      const service = new AuthService(jwtService, prisma);
      expect(() => service.getGoogleOAuthUrl()).toThrow(
        "missing GOOGLE_CLIENT_ID",
      );
    } finally {
      process.env.GOOGLE_CLIENT_ID = previousClientId;
    }
  });

  it("bootstraps user/profile/thread for first Google login", async () => {
    const previousClientId = process.env.GOOGLE_CLIENT_ID;
    const previousClientSecret = process.env.GOOGLE_CLIENT_SECRET;
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
    try {
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
        auditLog: {
          create: vi.fn().mockResolvedValue({}),
        },
        outboxEvent: {
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
      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: "auth.google_login_success",
          }),
        }),
      );
    } finally {
      process.env.GOOGLE_CLIENT_ID = previousClientId;
      process.env.GOOGLE_CLIENT_SECRET = previousClientSecret;
    }
  });

  it("records oauth-connected and signup-completed analytics for first login", async () => {
    const previousClientId = process.env.GOOGLE_CLIENT_ID;
    const previousClientSecret = process.env.GOOGLE_CLIENT_SECRET;
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
    try {
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
        auditLog: {
          create: vi.fn().mockResolvedValue({}),
        },
        outboxEvent: {
          create: vi.fn().mockResolvedValue({}),
        },
      };
      const jwtService: any = {
        sign: vi.fn(),
        verify: vi.fn(),
      };
      const analyticsService: any = {
        trackEvent: vi.fn().mockResolvedValue({ recorded: true }),
      };

      const service = new AuthService(jwtService, prisma, analyticsService);
      await service.bootstrapGoogleUser("test-google-code");

      expect(analyticsService.trackEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: "oauth_connected",
          actorUserId: "11111111-1111-4111-8111-111111111111",
        }),
      );
      expect(analyticsService.trackEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: "signup_completed",
          actorUserId: "11111111-1111-4111-8111-111111111111",
        }),
      );
    } finally {
      process.env.GOOGLE_CLIENT_ID = previousClientId;
      process.env.GOOGLE_CLIENT_SECRET = previousClientSecret;
    }
  });

  it("exchanges Google auth code and uses userinfo identity", async () => {
    const previousClientId = process.env.GOOGLE_CLIENT_ID;
    const previousClientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const previousRedirectUri = process.env.GOOGLE_REDIRECT_URI;
    process.env.GOOGLE_CLIENT_ID = "google-client-id";
    process.env.GOOGLE_CLIENT_SECRET = "google-client-secret";
    process.env.GOOGLE_REDIRECT_URI =
      "http://localhost:3000/api/auth/google/callback";

    try {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: vi.fn().mockResolvedValue({
            access_token: "google-access-token",
            token_type: "Bearer",
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: vi.fn().mockResolvedValue({
            sub: "google-subject-123",
            email: "user@example.com",
            name: "Google User",
          }),
        });
      vi.stubGlobal("fetch", fetchMock);

      const prisma: any = {
        user: {
          findUnique: vi
            .fn()
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce(null),
          create: vi.fn().mockResolvedValue({
            id: "11111111-1111-4111-8111-111111111111",
            displayName: "Google User",
          }),
        },
        userProfile: {
          create: vi.fn().mockResolvedValue({}),
        },
        agentThread: {
          create: vi.fn().mockResolvedValue({}),
        },
        auditLog: {
          create: vi.fn().mockResolvedValue({}),
        },
        outboxEvent: {
          create: vi.fn().mockResolvedValue({}),
        },
      };

      const jwtService: any = {
        sign: vi.fn(),
        verify: vi.fn(),
      };

      const service = new AuthService(jwtService, prisma);
      const user = await service.bootstrapGoogleUser("google-oauth-code");

      expect(user.id).toBe("11111111-1111-4111-8111-111111111111");
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(fetchMock).toHaveBeenNthCalledWith(
        1,
        "https://oauth2.googleapis.com/token",
        expect.objectContaining({
          method: "POST",
        }),
      );
      expect(fetchMock).toHaveBeenNthCalledWith(
        2,
        "https://openidconnect.googleapis.com/v1/userinfo",
        expect.objectContaining({
          headers: expect.objectContaining({
            authorization: "Bearer google-access-token",
          }),
        }),
      );
      expect(prisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            googleSubjectId: "google-subject-123",
            email: "user@example.com",
            displayName: "Google User",
          }),
        }),
      );
    } finally {
      process.env.GOOGLE_CLIENT_ID = previousClientId;
      process.env.GOOGLE_CLIENT_SECRET = previousClientSecret;
      process.env.GOOGLE_REDIRECT_URI = previousRedirectUri;
      vi.unstubAllGlobals();
    }
  });

  it("rejects admin console bootstrap when email is not allowlisted", async () => {
    const previousClientId = process.env.GOOGLE_CLIENT_ID;
    const previousClientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const previousRedirectUri = process.env.GOOGLE_REDIRECT_URI;
    const previousAdminEmails = process.env.ADMIN_CONSOLE_ALLOWED_EMAILS;
    process.env.GOOGLE_CLIENT_ID = "google-client-id";
    process.env.GOOGLE_CLIENT_SECRET = "google-client-secret";
    process.env.GOOGLE_REDIRECT_URI =
      "http://localhost:3000/api/auth/google/callback";
    process.env.ADMIN_CONSOLE_ALLOWED_EMAILS = "other@example.com";

    try {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: vi.fn().mockResolvedValue({
            access_token: "google-access-token",
            token_type: "Bearer",
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: vi.fn().mockResolvedValue({
            sub: "google-subject-xyz",
            email: "user@example.com",
            name: "Google User",
          }),
        });
      vi.stubGlobal("fetch", fetchMock);

      const prisma: any = {
        user: { findUnique: vi.fn() },
      };
      const jwtService: any = {
        sign: vi.fn(),
        verify: vi.fn(),
      };

      const service = new AuthService(jwtService, prisma);
      await expect(
        service.bootstrapGoogleUser("google-oauth-code", {
          adminConsole: true,
        }),
      ).rejects.toThrow("not authorized");

      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    } finally {
      process.env.GOOGLE_CLIENT_ID = previousClientId;
      process.env.GOOGLE_CLIENT_SECRET = previousClientSecret;
      process.env.GOOGLE_REDIRECT_URI = previousRedirectUri;
      if (previousAdminEmails === undefined) {
        delete process.env.ADMIN_CONSOLE_ALLOWED_EMAILS;
      } else {
        process.env.ADMIN_CONSOLE_ALLOWED_EMAILS = previousAdminEmails;
      }
      vi.unstubAllGlobals();
    }
  });

  it("builds OAuth start URL with mobile redirect state when provided", () => {
    const prisma: any = {};
    const jwtService: any = {
      sign: vi.fn(),
      verify: vi.fn(),
    };

    const service = new AuthService(jwtService, prisma);
    const { url } = service.getGoogleOAuthUrl({
      mobileRedirectUri: "exp://127.0.0.1:8081/--/auth/google",
    });

    const parsed = new URL(url);
    const state = parsed.searchParams.get("state");
    expect(state).toBeTruthy();

    const decoded = JSON.parse(
      Buffer.from(state ?? "", "base64url").toString("utf8"),
    ) as { mobileRedirectUri?: string };
    expect(decoded.mobileRedirectUri).toBe(
      "exp://127.0.0.1:8081/--/auth/google",
    );
  });

  it("builds OAuth start URL with exp+opensocial dev-client redirect in state", () => {
    const prisma: any = {};
    const jwtService: any = {
      sign: vi.fn(),
      verify: vi.fn(),
    };

    const service = new AuthService(jwtService, prisma);
    const mobileRedirectUri = "exp+opensocial://expo-development-client/";
    const { url } = service.getGoogleOAuthUrl({ mobileRedirectUri });

    const parsed = new URL(url);
    const state = parsed.searchParams.get("state");
    expect(state).toBeTruthy();

    const decoded = JSON.parse(
      Buffer.from(state ?? "", "base64url").toString("utf8"),
    ) as { mobileRedirectUri?: string };
    expect(decoded.mobileRedirectUri).toBe(mobileRedirectUri);
  });

  it("builds OAuth start URL with admin dashboard redirect in state for localhost callback", () => {
    const prisma: any = {};
    const jwtService: any = {
      sign: vi.fn(),
      verify: vi.fn(),
    };

    const service = new AuthService(jwtService, prisma);
    const { url } = service.getGoogleOAuthUrl({
      mobileRedirectUri: "http://localhost:3001/auth/callback",
    });

    const parsed = new URL(url);
    const state = parsed.searchParams.get("state");
    expect(state).toBeTruthy();

    const decoded = JSON.parse(
      Buffer.from(state ?? "", "base64url").toString("utf8"),
    ) as { mobileRedirectUri?: string };
    expect(decoded.mobileRedirectUri).toBe(
      "http://localhost:3001/auth/callback",
    );
  });

  it("redirects browser callback to mobile deep link when state is present", () => {
    const prisma: any = {};
    const jwtService: any = {
      sign: vi.fn(),
      verify: vi.fn(),
    };

    const service = new AuthService(jwtService, prisma);
    const state = Buffer.from(
      JSON.stringify({
        mobileRedirectUri: "com.opensocial.app://auth/google",
      }),
      "utf8",
    ).toString("base64url");

    const response = service.buildGoogleOAuthCallbackResponse({
      code: "google-code-123",
      state,
    });

    expect(response.statusCode).toBe(302);
    expect(response.redirectUrl).toBe(
      "com.opensocial.app://auth/google?code=google-code-123",
    );
  });

  it("redirects browser callback to admin dashboard when state uses localhost callback", () => {
    const prisma: any = {};
    const jwtService: any = {
      sign: vi.fn(),
      verify: vi.fn(),
    };

    const service = new AuthService(jwtService, prisma);
    const state = Buffer.from(
      JSON.stringify({
        mobileRedirectUri: "http://localhost:3001/auth/callback",
      }),
      "utf8",
    ).toString("base64url");

    const response = service.buildGoogleOAuthCallbackResponse({
      code: "google-code-123",
      state,
    });

    expect(response.statusCode).toBe(302);
    expect(response.redirectUrl).toBe(
      "http://localhost:3001/auth/callback?code=google-code-123",
    );
  });

  it("builds OAuth start URL with web redirect state when provided", () => {
    const prisma: any = {};
    const jwtService: any = {
      sign: vi.fn(),
      verify: vi.fn(),
    };

    const service = new AuthService(jwtService, prisma);
    const { url } = service.getGoogleOAuthUrl({
      webRedirectUri: "http://localhost:3002/auth/callback",
    });

    const parsed = new URL(url);
    const state = parsed.searchParams.get("state");
    expect(state).toBeTruthy();

    const decoded = JSON.parse(
      Buffer.from(state ?? "", "base64url").toString("utf8"),
    ) as { webRedirectUri?: string };
    expect(decoded.webRedirectUri).toBe("http://localhost:3002/auth/callback");
  });

  it("redirects browser callback to web app when state uses webRedirectUri", () => {
    const prisma: any = {};
    const jwtService: any = {
      sign: vi.fn(),
      verify: vi.fn(),
    };

    const service = new AuthService(jwtService, prisma);
    const state = Buffer.from(
      JSON.stringify({
        webRedirectUri: "http://127.0.0.1:3002/auth/callback",
      }),
      "utf8",
    ).toString("base64url");

    const response = service.buildGoogleOAuthCallbackResponse({
      code: "google-code-xyz",
      state,
    });

    expect(response.statusCode).toBe(302);
    expect(response.redirectUrl).toBe(
      "http://127.0.0.1:3002/auth/callback?code=google-code-xyz",
    );
  });

  it("redirects OAuth errors to web app when webRedirectUri is in state", () => {
    const prisma: any = {};
    const jwtService: any = {
      sign: vi.fn(),
      verify: vi.fn(),
    };

    const service = new AuthService(jwtService, prisma);
    const state = Buffer.from(
      JSON.stringify({
        webRedirectUri: "http://localhost:3002/auth/callback",
      }),
      "utf8",
    ).toString("base64url");

    const response = service.buildGoogleOAuthCallbackResponse({
      state,
      error: "access_denied",
      error_description: "User cancelled",
    });

    expect(response.statusCode).toBe(302);
    expect(response.redirectUrl).toContain("error=access_denied");
    expect(response.redirectUrl).toContain("error_description=");
  });

  it("creates persisted session when issuing tokens", async () => {
    const prisma: any = {
      userSession: {
        create: vi.fn().mockResolvedValue({}),
      },
      auditLog: {
        create: vi.fn().mockResolvedValue({}),
      },
      outboxEvent: {
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
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "auth.session_issued",
          entityId: result.sessionId,
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
      auditLog: {
        create: vi.fn().mockResolvedValue({}),
      },
      outboxEvent: {
        create: vi.fn().mockResolvedValue({}),
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
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "auth.session_refreshed",
          entityId: "session-1",
        }),
      }),
    );
  });

  it("accepts refresh tokens signed by older rotated secrets", async () => {
    const previousRefreshChain = process.env.JWT_REFRESH_SECRETS;
    process.env.JWT_REFRESH_SECRETS =
      "refresh-v2:refresh-new-secret,refresh-v1:refresh-old-secret";
    try {
      const oldRefreshToken = "refresh-old";
      const oldHash = createHash("sha256")
        .update(oldRefreshToken)
        .digest("hex");
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
        auditLog: {
          create: vi.fn().mockResolvedValue({}),
        },
        outboxEvent: {
          create: vi.fn().mockResolvedValue({}),
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
        decode: vi.fn().mockReturnValue({
          header: {
            kid: "refresh-v1",
          },
        }),
        verify: vi.fn().mockImplementation((_token: string, options: any) => {
          if (options?.secret !== "refresh-old-secret") {
            throw new Error("bad signature");
          }
          return {
            sub: "11111111-1111-4111-8111-111111111111",
            sessionId: "session-1",
            tokenType: "refresh",
          };
        }),
      };

      const service = new AuthService(jwtService, prisma);
      const result = await service.refreshSession(oldRefreshToken);

      expect(result.refreshToken).toBe("refresh-new");
      expect(jwtService.verify).toHaveBeenCalledWith(oldRefreshToken, {
        secret: "refresh-old-secret",
      });
    } finally {
      process.env.JWT_REFRESH_SECRETS = previousRefreshChain;
    }
  });

  it("revokes session and emits suspicious hook when refresh token mismatches", async () => {
    const prisma: any = {
      userSession: {
        findUnique: vi.fn().mockResolvedValue({
          id: "session-1",
          userId: "11111111-1111-4111-8111-111111111111",
          status: "active",
          expiresAt: new Date(Date.now() + 60_000),
          refreshTokenHash: createHash("sha256")
            .update("refresh-expected")
            .digest("hex"),
          deviceId: "device-a",
          deviceName: "MacBook",
          userAgent: "agent-a",
          ipAddress: "1.2.3.4",
        }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      auditLog: {
        create: vi.fn().mockResolvedValue({}),
      },
      outboxEvent: {
        create: vi.fn().mockResolvedValue({}),
      },
    };

    const jwtService: any = {
      sign: vi.fn(),
      verify: vi.fn().mockReturnValue({
        sub: "11111111-1111-4111-8111-111111111111",
        sessionId: "session-1",
        tokenType: "refresh",
      }),
    };

    const service = new AuthService(jwtService, prisma);
    await expect(
      service.refreshSession("refresh-got", {
        deviceId: "device-b",
        userAgent: "agent-b",
        ipAddress: "5.6.7.8",
      }),
    ).rejects.toThrow("refresh token mismatch");

    expect(prisma.userSession.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: "session-1" }),
        data: expect.objectContaining({ status: "revoked" }),
      }),
    );
    expect(prisma.outboxEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          eventType: "auth.suspicious_login_detected",
        }),
      }),
    );
  });

  it("keeps refresh successful on context mismatch and only emits suspicious signal", async () => {
    const oldRefreshToken = "refresh-old";
    const oldHash = createHash("sha256").update(oldRefreshToken).digest("hex");
    const prisma: any = {
      userSession: {
        findUnique: vi.fn().mockResolvedValue({
          id: "session-ctx",
          userId: "11111111-1111-4111-8111-111111111111",
          status: "active",
          expiresAt: new Date(Date.now() + 60_000),
          refreshTokenHash: oldHash,
          deviceId: "device-old",
          deviceName: "Old Device",
          userAgent: "agent-old",
          ipAddress: "1.1.1.1",
        }),
        update: vi.fn().mockResolvedValue({}),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      auditLog: {
        create: vi.fn().mockResolvedValue({}),
      },
      outboxEvent: {
        create: vi.fn().mockResolvedValue({}),
      },
    };
    const jwtService: any = {
      sign: vi
        .fn()
        .mockImplementation((payload: any) =>
          payload.tokenType === "refresh"
            ? "refresh-ctx-new"
            : `access-${payload.sub}-${payload.sessionId}`,
        ),
      verify: vi.fn().mockReturnValue({
        sub: "11111111-1111-4111-8111-111111111111",
        sessionId: "session-ctx",
        tokenType: "refresh",
      }),
    };

    const service = new AuthService(jwtService, prisma);
    const result = await service.refreshSession(oldRefreshToken, {
      deviceId: "device-new",
      userAgent: "agent-new",
      ipAddress: "2.2.2.2",
    });

    expect(result.sessionId).toBe("session-ctx");
    expect(prisma.userSession.updateMany).not.toHaveBeenCalled();
    expect(prisma.outboxEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          eventType: "auth.suspicious_login_detected",
        }),
      }),
    );
  });

  it("does not force revoke session on transient storage errors during refresh", async () => {
    const oldRefreshToken = "refresh-old";
    const oldHash = createHash("sha256").update(oldRefreshToken).digest("hex");
    const prisma: any = {
      userSession: {
        findUnique: vi.fn().mockResolvedValue({
          id: "session-transient",
          userId: "11111111-1111-4111-8111-111111111111",
          status: "active",
          expiresAt: new Date(Date.now() + 60_000),
          refreshTokenHash: oldHash,
          deviceId: null,
          deviceName: null,
          userAgent: null,
          ipAddress: null,
        }),
        update: vi
          .fn()
          .mockRejectedValue(new Error("db temporarily unavailable")),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      auditLog: {
        create: vi.fn().mockResolvedValue({}),
      },
      outboxEvent: {
        create: vi.fn().mockResolvedValue({}),
      },
    };
    const jwtService: any = {
      sign: vi
        .fn()
        .mockImplementation((payload: any) =>
          payload.tokenType === "refresh"
            ? "refresh-transient-new"
            : `access-${payload.sub}-${payload.sessionId}`,
        ),
      verify: vi.fn().mockReturnValue({
        sub: "11111111-1111-4111-8111-111111111111",
        sessionId: "session-transient",
        tokenType: "refresh",
      }),
    };

    const service = new AuthService(jwtService, prisma);
    await expect(service.refreshSession(oldRefreshToken)).rejects.toThrow(
      "db temporarily unavailable",
    );
    expect(prisma.userSession.updateMany).not.toHaveBeenCalled();
  });

  it("revokes all active sessions except an optional current session", async () => {
    const prisma: any = {
      userSession: {
        updateMany: vi.fn().mockResolvedValue({ count: 2 }),
      },
      auditLog: {
        create: vi.fn().mockResolvedValue({}),
      },
      outboxEvent: {
        create: vi.fn().mockResolvedValue({}),
      },
    };

    const jwtService: any = {
      sign: vi.fn(),
      verify: vi.fn(),
    };

    const service = new AuthService(jwtService, prisma);
    const result = await service.revokeAllSessions(
      "11111111-1111-4111-8111-111111111111",
      "22222222-2222-4222-8222-222222222222",
    );

    expect(result).toEqual({
      revokedCount: 2,
      userId: "11111111-1111-4111-8111-111111111111",
      exceptSessionId: "22222222-2222-4222-8222-222222222222",
    });
    expect(prisma.userSession.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: "11111111-1111-4111-8111-111111111111",
          status: "active",
          NOT: { id: "22222222-2222-4222-8222-222222222222" },
        }),
      }),
    );
  });
});
