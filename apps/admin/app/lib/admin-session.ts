export const ADMIN_SESSION_STORAGE_KEY = "opensocial-admin-session";

export type AdminSession = {
  userId: string;
  email: string | null;
  displayName: string | null;
  accessToken: string;
  refreshToken: string;
  sessionId?: string;
};

export function loadAdminSession(): AdminSession | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(ADMIN_SESSION_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as Partial<AdminSession>;
    if (
      typeof parsed.userId !== "string" ||
      typeof parsed.accessToken !== "string" ||
      typeof parsed.refreshToken !== "string"
    ) {
      return null;
    }
    return {
      userId: parsed.userId,
      email: typeof parsed.email === "string" ? parsed.email : null,
      displayName:
        typeof parsed.displayName === "string" ? parsed.displayName : null,
      accessToken: parsed.accessToken,
      refreshToken: parsed.refreshToken,
      ...(typeof parsed.sessionId === "string"
        ? { sessionId: parsed.sessionId }
        : {}),
    };
  } catch {
    return null;
  }
}

export function saveAdminSession(session: AdminSession) {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(
    ADMIN_SESSION_STORAGE_KEY,
    JSON.stringify(session),
  );
}

export function clearAdminSession() {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.removeItem(ADMIN_SESSION_STORAGE_KEY);
}

/** Earlier admin builds stored `ADMIN_API_KEY` in localStorage; strip it on load. */
export function clearLegacyAdminApiKeyStorage() {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.removeItem("opensocial-admin-api-key");
}
