import { Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { createHash, randomUUID } from "node:crypto";
import { PrismaService } from "../database/prisma.service.js";

interface SessionContext {
  deviceId?: string;
  deviceName?: string;
  userAgent?: string;
  ipAddress?: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  getGoogleOAuthUrl(): { url: string } {
    const clientId = process.env.GOOGLE_CLIENT_ID ?? "unset-client-id";
    const redirectUri =
      process.env.GOOGLE_REDIRECT_URI ??
      "http://localhost:3000/api/auth/google/callback";
    const scope = encodeURIComponent("openid email profile");
    const url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${scope}`;
    return { url };
  }

  async bootstrapGoogleUser(code: string) {
    const normalizedCode = code.trim().toLowerCase();
    const googleSubjectId = createHash("sha256")
      .update(normalizedCode)
      .digest("hex")
      .slice(0, 24);
    const email = `${googleSubjectId}@oauth.local`;
    const displayName = `User ${googleSubjectId.slice(-6)}`;

    const existing = await this.prisma.user.findUnique({
      where: { googleSubjectId },
    });
    if (existing) {
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
    const accessToken = this.jwtService.sign({ sub: userId, sessionId });
    const refreshToken = this.jwtService.sign(
      { sub: userId, sessionId, tokenType: "refresh" },
      {
        secret: process.env.JWT_REFRESH_SECRET ?? "dev-refresh-secret",
        expiresIn: "30d",
      },
    );

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

    return { accessToken, refreshToken, sessionId };
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
      payload = this.jwtService.verify(refreshToken, {
        secret: process.env.JWT_REFRESH_SECRET ?? "dev-refresh-secret",
      });
    } catch {
      throw new UnauthorizedException("invalid refresh token");
    }

    if (payload.tokenType !== "refresh") {
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
      throw new UnauthorizedException("session not active");
    }
    if (session.expiresAt <= new Date()) {
      throw new UnauthorizedException("session expired");
    }
    if (session.refreshTokenHash !== this.hashToken(refreshToken)) {
      throw new UnauthorizedException("refresh token mismatch");
    }

    const accessToken = this.jwtService.sign({
      sub: payload.sub,
      sessionId: payload.sessionId,
    });
    const rotatedRefreshToken = this.jwtService.sign(
      { sub: payload.sub, sessionId: payload.sessionId, tokenType: "refresh" },
      {
        secret: process.env.JWT_REFRESH_SECRET ?? "dev-refresh-secret",
        expiresIn: "30d",
      },
    );

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

    return { revoked: result.count > 0, sessionId };
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

  private hashToken(token: string) {
    return createHash("sha256").update(token).digest("hex");
  }

  private getRefreshExpiry() {
    const now = Date.now();
    return new Date(now + 30 * 24 * 60 * 60 * 1000);
  }
}
