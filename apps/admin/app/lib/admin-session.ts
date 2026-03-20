export const ADMIN_SESSION_STORAGE_KEY = "opensocial-admin-session";
export const ADMIN_API_KEY_STORAGE_KEY = "opensocial-admin-api-key";

export type AdminSession = {
  userId: string;
  email: string | null;
  displayName: string | null;
  accessToken: string;
  refreshToken: string;
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

export function loadStoredAdminApiKey(): string {
  if (typeof window === "undefined") {
    return "";
  }
  return window.localStorage.getItem(ADMIN_API_KEY_STORAGE_KEY)?.trim() ?? "";
}

export function saveStoredAdminApiKey(value: string) {
  if (typeof window === "undefined") {
    return;
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    window.localStorage.removeItem(ADMIN_API_KEY_STORAGE_KEY);
    return;
  }
  window.localStorage.setItem(ADMIN_API_KEY_STORAGE_KEY, trimmed);
}
