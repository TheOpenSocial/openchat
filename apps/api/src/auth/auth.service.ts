import {
  Injectable,
  Logger,
  Optional,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import type { Prisma } from "@prisma/client";
import { createHash, randomUUID } from "node:crypto";
import { AnalyticsService } from "../analytics/analytics.service.js";
import { PrismaService } from "../database/prisma.service.js";

interface SessionContext {
  deviceId?: string;
  deviceName?: string;
  userAgent?: string;
  ipAddress?: string;
}

interface AuthEvent {
  actorUserId?: string;
  actorType: "user" | "system";
  action: string;
  entityType: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
}

interface GoogleIdentity {
  googleSubjectId: string;
  email: string | null;
  displayName: string;
}

interface GoogleTokenResponse {
  access_token?: string;
  id_token?: string;
  token_type?: string;
  scope?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

interface GoogleUserInfoResponse {
  sub?: string;
  email?: string;
  name?: string;
  given_name?: string;
  family_name?: string;
}

interface GoogleOAuthCallbackResponse {
  statusCode: number;
  redirectUrl?: string;
  html?: string;
}

interface SigningSecret {
  kid: string;
  secret: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly accessSigningSecrets: SigningSecret[];
  private readonly refreshSigningSecrets: SigningSecret[];

  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    @Optional()
    private readonly analyticsService?: AnalyticsService,
  ) {
    this.accessSigningSecrets = this.readSigningSecrets({
      chainEnvKey: "JWT_ACCESS_SECRETS",
      singleEnvKey: "JWT_ACCESS_SECRET",
      fallbackSecret: "dev-access-secret",
      keyPrefix: "access",
    });
    this.refreshSigningSecrets = this.readSigningSecrets({
      chainEnvKey: "JWT_REFRESH_SECRETS",
      singleEnvKey: "JWT_REFRESH_SECRET",
      fallbackSecret: "dev-refresh-secret",
      keyPrefix: "refresh",
    });
  }

  getGoogleOAuthUrl(options?: {
    mobileRedirectUri?: string;
    webRedirectUri?: string;
  }): { url: string } {
    const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
    if (!clientId) {
      throw new ServiceUnavailableException(
        "google oauth is not configured (missing GOOGLE_CLIENT_ID)",
      );
    }
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: this.getGoogleRedirectUri(),
      response_type: "code",
      scope: "openid email profile",
      access_type: "offline",
      include_granted_scopes: "true",
      prompt: "consent",
    });

    const mobileRedirectUri = this.normalizeMobileRedirectUri(
      options?.mobileRedirectUri,
    );
    const webRedirectUri = this.normalizeWebAppRedirectUri(
      options?.webRedirectUri,
    );
    const statePayload: Record<string, string> = {};
    if (mobileRedirectUri) {
      statePayload.mobileRedirectUri = mobileRedirectUri;
    }
    if (webRedirectUri) {
      statePayload.webRedirectUri = webRedirectUri;
    }
    if (Object.keys(statePayload).length > 0) {
      params.set(
        "state",
        Buffer.from(JSON.stringify(statePayload), "utf8").toString("base64url"),
      );
    }

    const url = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
    return { url };
  }

  buildGoogleOAuthCallbackResponse(input: {
    code?: string;
    state?: string;
    error?: string;
    error_description?: string;
  }): GoogleOAuthCallbackResponse {
    const { mobileRedirectUri, webRedirectUri } =
      this.readOAuthClientRedirectsFromState(input.state);
    const oauthError = input.error?.trim();
    const oauthErrorDescription = input.error_description?.trim();

    if (oauthError) {
      const errorMessage =
        oauthErrorDescription && oauthErrorDescription.length > 0
          ? oauthErrorDescription
          : oauthError;

      if (mobileRedirectUri) {
        return {
          statusCode: 302,
          redirectUrl: this.appendQueryParams(mobileRedirectUri, {
            error: oauthError,
            error_description: errorMessage,
          }),
        };
      }

      if (webRedirectUri) {
        return {
          statusCode: 302,
          redirectUrl: this.appendQueryParams(webRedirectUri, {
            error: oauthError,
            error_description: errorMessage,
          }),
        };
      }

      return {
        statusCode: 400,
        html: this.renderOAuthStatusPage("Google sign-in failed", errorMessage),
      };
    }

    const code = input.code?.trim();
    if (!code) {
      return {
        statusCode: 400,
        html: this.renderOAuthStatusPage(
          "Google sign-in failed",
          "Authorization code missing from callback.",
        ),
      };
    }

    if (mobileRedirectUri) {
      return {
        statusCode: 302,
        redirectUrl: this.appendQueryParams(mobileRedirectUri, { code }),
      };
    }

    if (webRedirectUri) {
      return {
        statusCode: 302,
        redirectUrl: this.appendQueryParams(webRedirectUri, { code }),
      };
    }

    return {
      statusCode: 200,
      html: this.renderOAuthStatusPage(
        "Google authorization complete",
        "Copy this code and paste it in the app:",
        code,
      ),
    };
  }

  async bootstrapGoogleUser(
    code: string,
    options?: { adminConsole?: boolean },
  ) {
    const { googleSubjectId, email, displayName } =
      await this.resolveGoogleIdentity(code);

    if (options?.adminConsole) {
      this.assertAdminConsoleEmailAllowed(email);
    }

    const existing = await this.prisma.user.findUnique({
      where: { googleSubjectId },
    });
    if (existing) {
      await this.logAuthEvent({
        actorUserId: existing.id,
        actorType: "user",
        action: "auth.google_login_success",
        entityType: "user",
        entityId: existing.id,
        metadata: {
          provider: "google",
          isFirstLogin: false,
        },
      });
      await this.trackAnalyticsEventSafe({
        eventType: "oauth_connected",
        actorUserId: existing.id,
        entityType: "user",
        entityId: existing.id,
        properties: {
          provider: "google",
          isFirstLogin: false,
        },
      });
      return existing;
    }

    const username = await this.generateUniqueUsername(displayName);

    const user = await this.prisma.user.create({
      data: {
        googleSubjectId,
        email,
        displayName,
        username,
      },
    });

    await this.prisma.userProfile.create({
      data: {
        userId: user.id,
        onboardingState: "not_started",
      },
    });
    await this.prisma.agentThread.create({
      data: {
        userId: user.id,
        title: "Main",
      },
    });

    await this.logAuthEvent({
      actorUserId: user.id,
      actorType: "user",
      action: "auth.google_login_success",
      entityType: "user",
      entityId: user.id,
      metadata: {
        provider: "google",
        isFirstLogin: true,
      },
    });
    await Promise.all([
      this.trackAnalyticsEventSafe({
        eventType: "oauth_connected",
        actorUserId: user.id,
        entityType: "user",
        entityId: user.id,
        properties: {
          provider: "google",
          isFirstLogin: true,
        },
      }),
      this.trackAnalyticsEventSafe({
        eventType: "signup_completed",
        actorUserId: user.id,
        entityType: "user",
        entityId: user.id,
        properties: {
          provider: "google",
        },
      }),
    ]);

    return user;
  }

  async issueSessionTokens(
    userId: string,
    context: SessionContext = {},
  ): Promise<{
    accessToken: string;
    refreshToken: string;
    sessionId: string;
  }> {
    const sessionId = randomUUID();
    const accessToken = this.signAccessToken({ sub: userId, sessionId });
    const refreshToken = this.signRefreshToken({
      sub: userId,
      sessionId,
      tokenType: "refresh",
    });

    await this.prisma.userSession.create({
      data: {
        id: sessionId,
        userId,
        deviceId: context.deviceId,
        deviceName: context.deviceName,
        userAgent: context.userAgent,
        ipAddress: context.ipAddress,
        refreshTokenHash: this.hashToken(refreshToken),
        status: "active",
        expiresAt: this.getRefreshExpiry(),
        lastUsedAt: new Date(),
      },
    });

    await this.logAuthEvent({
      actorUserId: userId,
      actorType: "user",
      action: "auth.session_issued",
      entityType: "user_session",
      entityId: sessionId,
      metadata: {
        deviceId: context.deviceId,
        deviceName: context.deviceName,
        userAgent: context.userAgent,
        ipAddress: context.ipAddress,
      },
    });

    return { accessToken, refreshToken, sessionId };
  }

  async verifyAccessToken(accessToken: string): Promise<{
    userId: string;
    sessionId: string;
  }> {
    const decoded =
      typeof this.jwtService.decode === "function"
        ? (this.jwtService.decode(accessToken, {
            complete: true,
          }) as { header?: { kid?: unknown } } | null)
        : null;
    const preferredKid =
      decoded?.header && typeof decoded.header.kid === "string"
        ? decoded.header.kid
        : null;
    const candidateSecrets = this.prioritizeSigningSecretsByKid(
      this.accessSigningSecrets,
      preferredKid,
    );

    let payload: {
      sub?: unknown;
      sessionId?: unknown;
      tokenType?: unknown;
    } | null = null;
    for (const candidate of candidateSecrets) {
      try {
        payload = this.jwtService.verify(accessToken, {
          secret: candidate.secret,
        }) as {
          sub?: unknown;
          sessionId?: unknown;
          tokenType?: unknown;
        };
        break;
      } catch {
        // Try the next rotated secret.
      }
    }
    if (!payload) {
      throw new UnauthorizedException("invalid access token");
    }

    const userId = typeof payload.sub === "string" ? payload.sub : null;
    const sessionId =
      typeof payload.sessionId === "string" ? payload.sessionId : null;
    const tokenType =
      typeof payload.tokenType === "string" ? payload.tokenType : null;
    if (!userId || !sessionId) {
      throw new UnauthorizedException("invalid access token payload");
    }
    if (tokenType && tokenType !== "access") {
      throw new UnauthorizedException("invalid access token type");
    }

    const session = await this.prisma.userSession.findUnique({
      where: { id: sessionId },
      select: {
        id: true,
        userId: true,
        status: true,
        revokedAt: true,
        expiresAt: true,
      },
    });
    if (
      !session ||
      session.userId !== userId ||
      session.status !== "active" ||
      session.revokedAt ||
      session.expiresAt <= new Date()
    ) {
      throw new UnauthorizedException("session not active");
    }

    return { userId, sessionId };
  }

  async refreshSession(
    refreshToken: string,
    context: SessionContext = {},
  ): Promise<{
    accessToken: string;
    refreshToken: string;
    sessionId: string;
  }> {
    let payload: { sub: string; sessionId: string; tokenType?: string };
    try {
      payload = this.verifyRefreshTokenWithRotation(refreshToken);
    } catch {
      await this.logAuthEvent({
        actorType: "system",
        action: "auth.refresh_denied",
        entityType: "auth_token",
        metadata: {
          reason: "refresh_token_invalid",
        },
      });
      throw new UnauthorizedException("invalid refresh token");
    }

    if (payload.tokenType !== "refresh") {
      await this.logAuthEvent({
        actorUserId: payload.sub,
        actorType: "user",
        action: "auth.refresh_denied",
        entityType: "user_session",
        entityId: payload.sessionId,
        metadata: {
          reason: "invalid_token_type",
          tokenType: payload.tokenType ?? null,
        },
      });
      throw new UnauthorizedException("invalid token type");
    }

    const session = await this.prisma.userSession.findUnique({
      where: { id: payload.sessionId },
    });
    if (
      !session ||
      session.status !== "active" ||
      session.userId !== payload.sub
    ) {
      await this.logAuthEvent({
        actorUserId: payload.sub,
        actorType: "user",
        action: "auth.refresh_denied",
        entityType: "user_session",
        entityId: payload.sessionId,
        metadata: {
          reason: "session_not_active",
          hasSession: Boolean(session),
          sessionStatus: session?.status ?? null,
        },
      });
      throw new UnauthorizedException("session not active");
    }
    if (session.expiresAt <= new Date()) {
      await this.revokeSessionInternal(payload.sub, payload.sessionId, {
        reason: "session_expired",
      });
      throw new UnauthorizedException("session expired");
    }
    if (session.refreshTokenHash !== this.hashToken(refreshToken)) {
      await this.revokeSessionInternal(payload.sub, payload.sessionId, {
        reason: "refresh_token_mismatch",
      });
      await this.emitAuthHook("auth.suspicious_login_detected", {
        userId: payload.sub,
        sessionId: payload.sessionId,
        reason: "refresh_token_mismatch",
      });
      throw new UnauthorizedException("refresh token mismatch");
    }

    const suspiciousSignals = this.detectSuspiciousSignals(session, context);
    if (suspiciousSignals.length > 0) {
      await this.logAuthEvent({
        actorUserId: payload.sub,
        actorType: "user",
        action: "auth.suspicious_login_detected",
        entityType: "user_session",
        entityId: payload.sessionId,
        metadata: {
          reason: "context_mismatch",
          signals: suspiciousSignals,
          previousContext: {
            deviceId: session.deviceId,
            userAgent: session.userAgent,
            ipAddress: session.ipAddress,
          },
          incomingContext: {
            deviceId: context.deviceId,
            userAgent: context.userAgent,
            ipAddress: context.ipAddress,
          },
        },
      });
      await this.emitAuthHook("auth.suspicious_login_detected", {
        userId: payload.sub,
        sessionId: payload.sessionId,
        reason: "context_mismatch",
        signals: suspiciousSignals,
      });
    }

    const accessToken = this.signAccessToken({
      sub: payload.sub,
      sessionId: payload.sessionId,
    });
    const rotatedRefreshToken = this.signRefreshToken({
      sub: payload.sub,
      sessionId: payload.sessionId,
      tokenType: "refresh",
    });

    await this.prisma.userSession.update({
      where: { id: payload.sessionId },
      data: {
        refreshTokenHash: this.hashToken(rotatedRefreshToken),
        deviceId: context.deviceId ?? session.deviceId,
        deviceName: context.deviceName ?? session.deviceName,
        userAgent: context.userAgent ?? session.userAgent,
        ipAddress: context.ipAddress ?? session.ipAddress,
        lastUsedAt: new Date(),
        expiresAt: this.getRefreshExpiry(),
      },
    });

    await this.logAuthEvent({
      actorUserId: payload.sub,
      actorType: "user",
      action: "auth.session_refreshed",
      entityType: "user_session",
      entityId: payload.sessionId,
      metadata: {
        deviceId: context.deviceId ?? session.deviceId,
        deviceName: context.deviceName ?? session.deviceName,
        userAgent: context.userAgent ?? session.userAgent,
        ipAddress: context.ipAddress ?? session.ipAddress,
      },
    });

    return {
      accessToken,
      refreshToken: rotatedRefreshToken,
      sessionId: payload.sessionId,
    };
  }

  listUserSessions(userId: string) {
    return this.prisma.userSession.findMany({
      where: { userId, status: "active" },
      orderBy: { lastUsedAt: "desc" },
      select: {
        id: true,
        deviceId: true,
        deviceName: true,
        userAgent: true,
        ipAddress: true,
        lastUsedAt: true,
        expiresAt: true,
        createdAt: true,
      },
    });
  }

  async revokeSession(userId: string, sessionId: string) {
    const result = await this.revokeSessionInternal(userId, sessionId, {
      reason: "manual_revoke",
    });

    return { revoked: result.count > 0, sessionId };
  }

  async revokeAllSessions(userId: string, exceptSessionId?: string) {
    const result = await this.prisma.userSession.updateMany({
      where: {
        userId,
        status: "active",
        ...(exceptSessionId ? { NOT: { id: exceptSessionId } } : {}),
      },
      data: {
        status: "revoked",
        revokedAt: new Date(),
      },
    });

    await this.logAuthEvent({
      actorUserId: userId,
      actorType: "user",
      action: "auth.sessions_revoked_all",
      entityType: "user",
      entityId: userId,
      metadata: {
        exceptSessionId: exceptSessionId ?? null,
        revokedCount: result.count,
      },
    });

    return {
      revokedCount: result.count,
      userId,
      exceptSessionId: exceptSessionId ?? null,
    };
  }

  private async generateUniqueUsername(displayName: string) {
    const base =
      displayName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .slice(0, 20) || "user";

    for (let suffix = 0; suffix < 10_000; suffix += 1) {
      const candidate = suffix === 0 ? base : `${base}_${suffix}`;
      const existing = await this.prisma.user.findUnique({
        where: { username: candidate },
        select: { id: true },
      });
      if (!existing) {
        return candidate;
      }
    }

    return `${base}_${randomUUID().slice(0, 8)}`;
  }

  private getGoogleRedirectUri() {
    return (
      process.env.GOOGLE_REDIRECT_URI ??
      "http://localhost:3000/auth/google/callback"
    );
  }

  /**
   * Comma-separated allowlist. If unset, defaults to the initial operator account.
   */
  private assertAdminConsoleEmailAllowed(email: string | null) {
    const raw = process.env.ADMIN_CONSOLE_ALLOWED_EMAILS?.trim();
    const fallback = "jeffersonlicet@gmail.com";
    const list = (raw && raw.length > 0 ? raw : fallback)
      .split(",")
      .map((entry) => entry.trim().toLowerCase())
      .filter((entry) => entry.length > 0);

    const normalized = email?.trim().toLowerCase() ?? "";
    if (!normalized || !list.includes(normalized)) {
      throw new UnauthorizedException(
        "This Google account is not authorized for the admin console.",
      );
    }
  }

  private async resolveGoogleIdentity(code: string): Promise<GoogleIdentity> {
    const normalizedCode = code.trim();
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      return this.resolveGoogleIdentityFallback(normalizedCode);
    }

    try {
      const token = await this.exchangeGoogleAuthCode(
        normalizedCode,
        clientId,
        clientSecret,
      );
      const userInfo = await this.fetchGoogleUserInfo(token.access_token);
      const googleSubjectId = userInfo.sub?.trim();

      if (!googleSubjectId) {
        throw new UnauthorizedException("google account id missing");
      }

      return {
        googleSubjectId,
        email: userInfo.email?.trim().toLowerCase() || null,
        displayName:
          userInfo.name?.trim() ||
          userInfo.given_name?.trim() ||
          `User ${googleSubjectId.slice(-6)}`,
      };
    } catch (error) {
      await this.logAuthEvent({
        actorType: "system",
        action: "auth.google_login_failed",
        entityType: "auth_provider",
        entityId: "google",
        metadata: {
          reason:
            error instanceof Error
              ? error.message
              : "google_oauth_exchange_failed",
        },
      });

      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException("google oauth login failed");
    }
  }

  private resolveGoogleIdentityFallback(code: string): GoogleIdentity {
    const stableCode = code.toLowerCase();
    const googleSubjectId = createHash("sha256")
      .update(stableCode)
      .digest("hex")
      .slice(0, 24);

    return {
      googleSubjectId,
      email: `${googleSubjectId}@oauth.local`,
      displayName: `User ${googleSubjectId.slice(-6)}`,
    };
  }

  private async exchangeGoogleAuthCode(
    code: string,
    clientId: string,
    clientSecret: string,
  ): Promise<{ access_token: string }> {
    const tokenEndpoint =
      process.env.GOOGLE_TOKEN_ENDPOINT ??
      "https://oauth2.googleapis.com/token";
    const body = new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: this.getGoogleRedirectUri(),
      grant_type: "authorization_code",
    });
    const response = await fetch(tokenEndpoint, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });
    const payload = await this.parseJsonResponse<GoogleTokenResponse>(response);

    if (!response.ok || typeof payload.access_token !== "string") {
      throw new UnauthorizedException(
        payload.error_description ||
          payload.error ||
          "google token exchange failed",
      );
    }

    return {
      access_token: payload.access_token,
    };
  }

  private async fetchGoogleUserInfo(
    accessToken: string,
  ): Promise<GoogleUserInfoResponse> {
    const userInfoEndpoint =
      process.env.GOOGLE_USERINFO_ENDPOINT ??
      "https://openidconnect.googleapis.com/v1/userinfo";
    const response = await fetch(userInfoEndpoint, {
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    });
    const payload =
      await this.parseJsonResponse<GoogleUserInfoResponse>(response);

    if (!response.ok) {
      throw new UnauthorizedException("google user profile fetch failed");
    }

    return payload;
  }

  private async parseJsonResponse<T>(response: Response): Promise<T> {
    try {
      return (await response.json()) as T;
    } catch {
      return {} as T;
    }
  }

  private hashToken(token: string) {
    return createHash("sha256").update(token).digest("hex");
  }

  private signAccessToken(payload: { sub: string; sessionId: string }) {
    const primary = this.accessSigningSecrets[0];
    return this.jwtService.sign(
      {
        ...payload,
        tokenType: "access",
      },
      {
        secret: primary.secret,
        expiresIn: "15m",
        keyid: primary.kid,
      },
    );
  }

  private signRefreshToken(payload: {
    sub: string;
    sessionId: string;
    tokenType: "refresh";
  }) {
    const primary = this.refreshSigningSecrets[0];
    return this.jwtService.sign(payload, {
      secret: primary.secret,
      expiresIn: "30d",
      keyid: primary.kid,
    });
  }

  private verifyRefreshTokenWithRotation(token: string) {
    const decoded =
      typeof this.jwtService.decode === "function"
        ? (this.jwtService.decode(token, {
            complete: true,
          }) as { header?: { kid?: unknown } } | null)
        : null;
    const preferredKid =
      decoded?.header && typeof decoded.header.kid === "string"
        ? decoded.header.kid
        : null;
    const candidateSecrets = this.prioritizeSigningSecretsByKid(
      this.refreshSigningSecrets,
      preferredKid,
    );
    for (const candidate of candidateSecrets) {
      try {
        return this.jwtService.verify(token, {
          secret: candidate.secret,
        }) as {
          sub: string;
          sessionId: string;
          tokenType?: string;
        };
      } catch {
        // Try the next rotated secret.
      }
    }
    throw new UnauthorizedException("invalid refresh token");
  }

  private prioritizeSigningSecretsByKid(
    chain: SigningSecret[],
    preferredKid: string | null,
  ) {
    if (!preferredKid) {
      return [...chain];
    }
    const matching = chain.filter((item) => item.kid === preferredKid);
    const nonMatching = chain.filter((item) => item.kid !== preferredKid);
    return [...matching, ...nonMatching];
  }

  private readSigningSecrets(input: {
    chainEnvKey: string;
    singleEnvKey: string;
    fallbackSecret: string;
    keyPrefix: string;
  }) {
    const chainRaw = process.env[input.chainEnvKey];
    const chainItems =
      chainRaw
        ?.split(",")
        .map((item) => item.trim())
        .filter((item) => item.length > 0) ?? [];

    if (chainItems.length > 0) {
      return chainItems.map((item, index) => {
        const separatorIndex = item.indexOf(":");
        if (separatorIndex <= 0) {
          return {
            kid: `${input.keyPrefix}-${index + 1}`,
            secret: item,
          };
        }
        const kid = item.slice(0, separatorIndex).trim();
        const secret = item.slice(separatorIndex + 1).trim();
        if (!kid || !secret) {
          return {
            kid: `${input.keyPrefix}-${index + 1}`,
            secret: item,
          };
        }
        return {
          kid,
          secret,
        };
      });
    }

    const single = process.env[input.singleEnvKey];
    if (single && single.trim().length > 0) {
      return [
        {
          kid: `${input.keyPrefix}-1`,
          secret: single.trim(),
        },
      ];
    }

    return [
      {
        kid: `${input.keyPrefix}-dev`,
        secret: input.fallbackSecret,
      },
    ];
  }

  private normalizeOAuthRedirectPath(url: URL) {
    const path = url.pathname.replace(/\/$/, "") || "/";
    return `${url.origin}${path}`;
  }

  private parseAdminDashboardRedirectAllowlist(): string[] | null {
    const raw = process.env.ADMIN_DASHBOARD_REDIRECT_URIS?.trim();
    if (!raw) {
      return null;
    }
    const entries = raw
      .split(",")
      .map((value) => value.trim())
      .filter((value) => value.length > 0);
    return entries.length > 0 ? entries : null;
  }

  /**
   * Allows returning the auth code to the ops dashboard after Google hits the API callback.
   * Mobile deep links keep their own rules; admin uses http(s) on localhost or an env allowlist.
   */
  private normalizeAdminDashboardRedirectUri(trimmed: string): string | null {
    try {
      const parsed = new URL(trimmed);
      const protocol = parsed.protocol.toLowerCase();
      if (protocol !== "http:" && protocol !== "https:") {
        return null;
      }

      const allowlist = this.parseAdminDashboardRedirectAllowlist();
      if (allowlist) {
        const candidate = this.normalizeOAuthRedirectPath(parsed);
        for (const allowed of allowlist) {
          try {
            const allowedUrl = new URL(allowed);
            if (this.normalizeOAuthRedirectPath(allowedUrl) === candidate) {
              return parsed.toString();
            }
          } catch {
            continue;
          }
        }
        return null;
      }

      const host = parsed.hostname.toLowerCase();
      const pathNorm = parsed.pathname.replace(/\/$/, "") || "/";
      if (pathNorm !== "/auth/callback") {
        return null;
      }
      if (host === "localhost" || host === "127.0.0.1") {
        return parsed.toString();
      }

      return null;
    } catch {
      return null;
    }
  }

  private normalizeMobileRedirectUri(value?: string) {
    if (!value) {
      return null;
    }

    const trimmed = value.trim();
    if (trimmed.length === 0) {
      return null;
    }

    try {
      const parsed = new URL(trimmed);
      const protocol = parsed.protocol.toLowerCase();
      const isAllowedScheme =
        protocol === "exp:" ||
        protocol === "exp+opensocial:" ||
        protocol === "opensocial:" ||
        protocol === "com.opensocial.app:";
      const isAllowedExpoProxy =
        protocol === "https:" && parsed.hostname === "auth.expo.io";

      if (isAllowedScheme || isAllowedExpoProxy) {
        return parsed.toString();
      }

      const adminRedirect = this.normalizeAdminDashboardRedirectUri(trimmed);
      if (adminRedirect) {
        return adminRedirect;
      }

      return null;
    } catch {
      return null;
    }
  }

  private parseWebAppRedirectAllowlist(): string[] | null {
    const raw = process.env.WEB_APP_REDIRECT_URIS?.trim();
    if (!raw) {
      return null;
    }
    const entries = raw
      .split(",")
      .map((value) => value.trim())
      .filter((value) => value.length > 0);
    return entries.length > 0 ? entries : null;
  }

  /**
   * Where the API sends the browser after Google OAuth when the web client
   * started the flow with `webRedirectUri` (typically `/auth/callback`).
   */
  private normalizeWebAppRedirectUri(value?: string): string | null {
    if (!value) {
      return null;
    }

    const trimmed = value.trim();
    if (trimmed.length === 0) {
      return null;
    }

    try {
      const parsed = new URL(trimmed);
      const protocol = parsed.protocol.toLowerCase();
      if (protocol !== "http:" && protocol !== "https:") {
        return null;
      }

      const allowlist = this.parseWebAppRedirectAllowlist();
      if (allowlist) {
        const candidate = this.normalizeOAuthRedirectPath(parsed);
        for (const allowed of allowlist) {
          try {
            const allowedUrl = new URL(allowed);
            if (this.normalizeOAuthRedirectPath(allowedUrl) === candidate) {
              return parsed.toString();
            }
          } catch {
            continue;
          }
        }
        return null;
      }

      const host = parsed.hostname.toLowerCase();
      const pathNorm = parsed.pathname.replace(/\/$/, "") || "/";
      if (pathNorm !== "/auth/callback") {
        return null;
      }
      if (host === "localhost" || host === "127.0.0.1") {
        return parsed.toString();
      }

      return null;
    } catch {
      return null;
    }
  }

  private readOAuthClientRedirectsFromState(state?: string): {
    mobileRedirectUri: string | null;
    webRedirectUri: string | null;
  } {
    if (!state) {
      return { mobileRedirectUri: null, webRedirectUri: null };
    }

    try {
      const raw = Buffer.from(state, "base64url").toString("utf8");
      const parsed = JSON.parse(raw) as {
        mobileRedirectUri?: unknown;
        webRedirectUri?: unknown;
      };
      const mobileRedirectUri =
        typeof parsed.mobileRedirectUri === "string"
          ? this.normalizeMobileRedirectUri(parsed.mobileRedirectUri)
          : null;
      const webRedirectUri =
        typeof parsed.webRedirectUri === "string"
          ? this.normalizeWebAppRedirectUri(parsed.webRedirectUri)
          : null;
      return { mobileRedirectUri, webRedirectUri };
    } catch {
      return { mobileRedirectUri: null, webRedirectUri: null };
    }
  }

  private appendQueryParams(baseUrl: string, params: Record<string, string>) {
    const url = new URL(baseUrl);
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
    return url.toString();
  }

  private renderOAuthStatusPage(title: string, message: string, code?: string) {
    const titleHtml = this.escapeHtml(title);
    const messageHtml = this.escapeHtml(message);
    const codeHtml = code
      ? `<pre style="padding:12px;border-radius:10px;background:#0f172a;color:#e2e8f0;overflow:auto;">${this.escapeHtml(code)}</pre>`
      : "";

    return `<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${titleHtml}</title></head><body style="margin:0;background:#020617;color:#e2e8f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;"><main style="max-width:560px;margin:64px auto;padding:24px;border:1px solid #1e293b;border-radius:16px;background:#0b1220;"><h1 style="font-size:22px;margin:0 0 12px;">${titleHtml}</h1><p style="line-height:1.6;color:#cbd5e1;">${messageHtml}</p>${codeHtml}</main></body></html>`;
  }

  private escapeHtml(input: string) {
    return input
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  private getRefreshExpiry() {
    const now = Date.now();
    return new Date(now + 30 * 24 * 60 * 60 * 1000);
  }

  private detectSuspiciousSignals(
    session: {
      deviceId: string | null;
      userAgent: string | null;
      ipAddress: string | null;
    },
    context: SessionContext,
  ) {
    const signals: string[] = [];

    if (
      session.deviceId &&
      context.deviceId &&
      session.deviceId !== context.deviceId
    ) {
      signals.push("device_id_changed");
    }
    if (
      session.userAgent &&
      context.userAgent &&
      session.userAgent !== context.userAgent
    ) {
      signals.push("user_agent_changed");
    }
    if (
      session.ipAddress &&
      context.ipAddress &&
      session.ipAddress !== context.ipAddress
    ) {
      signals.push("ip_address_changed");
    }

    return signals;
  }

  private async revokeSessionInternal(
    userId: string,
    sessionId: string,
    metadata: Record<string, unknown>,
  ) {
    const result = await this.prisma.userSession.updateMany({
      where: {
        id: sessionId,
        userId,
        status: "active",
      },
      data: {
        status: "revoked",
        revokedAt: new Date(),
      },
    });

    if (result.count > 0) {
      await this.logAuthEvent({
        actorUserId: userId,
        actorType: "user",
        action: "auth.session_revoked",
        entityType: "user_session",
        entityId: sessionId,
        metadata,
      });
      await this.emitAuthHook("auth.session_revoked", {
        userId,
        sessionId,
        ...metadata,
      });
    }

    return result;
  }

  private async logAuthEvent(event: AuthEvent) {
    await this.prisma.auditLog.create({
      data: {
        actorUserId: event.actorUserId,
        actorType: event.actorType,
        action: event.action,
        entityType: event.entityType,
        entityId: event.entityId,
        metadata: this.toJsonObject(event.metadata),
      },
    });
  }

  private async emitAuthHook(
    eventType: string,
    payload: Record<string, unknown>,
  ) {
    const aggregateId =
      typeof payload.sessionId === "string" ? payload.sessionId : randomUUID();
    await this.prisma.outboxEvent.create({
      data: {
        aggregateType: "auth",
        aggregateId,
        eventType,
        payload:
          this.toJsonObject({
            version: 1,
            emittedAt: new Date().toISOString(),
            ...payload,
          }) ?? {},
      },
    });
  }

  private toJsonObject(
    input: Record<string, unknown> | undefined,
  ): Prisma.InputJsonObject | undefined {
    if (!input) {
      return undefined;
    }
    return JSON.parse(JSON.stringify(input)) as Prisma.InputJsonObject;
  }

  private async trackAnalyticsEventSafe(input: {
    eventType: string;
    actorUserId?: string;
    entityType?: string;
    entityId?: string;
    properties?: Record<string, unknown>;
  }) {
    if (!this.analyticsService) {
      return;
    }
    try {
      await this.analyticsService.trackEvent(input);
    } catch (error) {
      this.logger.warn(
        `failed to record analytics event ${input.eventType}: ${String(error)}`,
      );
    }
  }
}
