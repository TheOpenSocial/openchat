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

async function maybeRefreshSession({
  accessToken,
  baseUrl,
  refreshToken,
  sessionId,
}) {
  if (!baseUrl || !refreshToken) {
    return { accessToken, refreshToken, sessionId };
  }

  const response = await fetch(`${baseUrl.replace(/\/+$/, "")}/api/auth/refresh`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      refreshToken,
      deviceId: "staging-mobile-e2e-session",
      deviceName: "Staging Mobile E2E Session",
    }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.success || !payload?.data?.accessToken) {
    const preview = JSON.stringify(payload).slice(0, 300);
    throw new Error(`Unable to refresh mobile E2E session (${response.status}): ${preview}`);
  }

  return {
    accessToken: String(payload.data.accessToken).trim(),
    refreshToken:
      typeof payload.data.refreshToken === "string" &&
      payload.data.refreshToken.trim().length > 0
        ? payload.data.refreshToken.trim()
        : refreshToken,
    sessionId:
      typeof payload.data.sessionId === "string" &&
      payload.data.sessionId.trim().length > 0
        ? payload.data.sessionId.trim()
        : sessionId,
  };
}

async function main() {
  const userId = requireEnv("SMOKE_USER_ID");
  const baseUrl = process.env.SMOKE_BASE_URL?.trim() || "";
  const initialAccessToken = requireEnv("SMOKE_ACCESS_TOKEN");
  const refreshToken = requireEnv("SMOKE_REFRESH_TOKEN");
  const initialSessionId =
    process.env.SMOKE_SESSION_ID?.trim() ||
    decodeSessionIdFromAccessToken(initialAccessToken);

  if (!initialSessionId) {
    throw new Error("Unable to derive sessionId from SMOKE_ACCESS_TOKEN");
  }

  const refreshed = await maybeRefreshSession({
    accessToken: initialAccessToken,
    baseUrl,
    refreshToken,
    sessionId: initialSessionId,
  });

  const payload = {
    userId,
    displayName: process.env.SMOKE_DISPLAY_NAME?.trim() || "Playground Smoke User",
    email: process.env.SMOKE_EMAIL?.trim() || "playground-smoke@opensocial.test",
    accessToken: refreshed.accessToken,
    refreshToken: refreshed.refreshToken,
    sessionId: refreshed.sessionId,
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

await main();
