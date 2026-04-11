#!/usr/bin/env node

function decodeSessionIdFromAccessToken(accessToken) {
  try {
    const [, payload] = accessToken.split(".");
    if (!payload) {
      return null;
    }
    const decoded = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    );
    return typeof decoded.sessionId === "string" &&
      decoded.sessionId.trim().length > 0
      ? decoded.sessionId.trim()
      : null;
  } catch {
    return null;
  }
}

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required env ${name}`);
  }
  return value;
}

function main() {
  const userId = requireEnv("SMOKE_USER_ID");
  const accessToken = requireEnv("SMOKE_ACCESS_TOKEN");
  const refreshToken = requireEnv("SMOKE_REFRESH_TOKEN");
  const sessionId =
    process.env.SMOKE_SESSION_ID?.trim() ||
    decodeSessionIdFromAccessToken(accessToken);

  if (!sessionId) {
    throw new Error("Unable to derive sessionId from SMOKE_ACCESS_TOKEN");
  }

  const payload = {
    userId,
    displayName: process.env.SMOKE_DISPLAY_NAME?.trim() || "Playground Smoke User",
    email: process.env.SMOKE_EMAIL?.trim() || "playground-smoke@opensocial.test",
    accessToken,
    refreshToken,
    sessionId,
    profileCompleted: true,
    onboardingState: "complete",
  };

  const json = JSON.stringify(payload);
  const base64 = Buffer.from(json, "utf8").toString("base64");

  process.stdout.write(
    JSON.stringify(
      {
        encodedSession: base64,
        session: {
          ...payload,
          accessToken: "[redacted]",
          refreshToken: "[redacted]",
        },
      },
      null,
      2,
    ),
  );
}

main();
