import {
  clearAdminSession,
  loadAdminSession,
  saveAdminSession,
} from "./admin-session";

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH";

interface ApiEnvelope<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}

interface SessionTokens {
  accessToken: string;
  refreshToken: string;
  sessionId: string;
}

interface AuthLifecycleHandlers {
  onSessionRefreshed?: (tokens: SessionTokens) => void;
  onAuthFailure?: () => void;
}

const REMOTE_API_BASE_URL = "https://api.opensocial.so/api";

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  (process.env.NODE_ENV === "production"
    ? REMOTE_API_BASE_URL
    : "http://localhost:3000/api");

let refreshInFlight: Promise<SessionTokens> | null = null;
let authLifecycleHandlers: AuthLifecycleHandlers = {};

export function configureAdminApiAuthLifecycle(
  handlers: AuthLifecycleHandlers,
) {
  authLifecycleHandlers = handlers;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseEnvelope<T>(payload: unknown): ApiEnvelope<T> {
  if (!isRecord(payload) || typeof payload.success !== "boolean") {
    throw new Error("Invalid API envelope");
  }

  return payload as unknown as ApiEnvelope<T>;
}

async function readEnvelope<T>(response: Response): Promise<ApiEnvelope<T>> {
  const raw = (await response.json().catch(() => null)) as unknown;
  if (!raw) {
    return {
      success: false,
      error: {
        code: "invalid_response",
        message: "Invalid API response payload",
      },
    };
  }
  try {
    return parseEnvelope<T>(raw);
  } catch {
    return {
      success: false,
      error: {
        code: "invalid_response",
        message: "Invalid API response envelope",
      },
    };
  }
}

async function refreshSessionTokens(): Promise<SessionTokens> {
  if (refreshInFlight) {
    return refreshInFlight;
  }

  refreshInFlight = (async () => {
    const currentSession = loadAdminSession();
    if (!currentSession?.refreshToken) {
      throw new Error("Missing refresh token");
    }

    const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        refreshToken: currentSession.refreshToken,
      }),
    });

    const envelope = await readEnvelope<SessionTokens>(response);
    if (!response.ok || !envelope.success || envelope.data == null) {
      throw new Error(
        envelope.error?.message ?? "Could not refresh authenticated session.",
      );
    }

    const refreshed = envelope.data;
    saveAdminSession({
      ...currentSession,
      ...refreshed,
    });
    authLifecycleHandlers.onSessionRefreshed?.(refreshed);
    return refreshed;
  })()
    .catch((error) => {
      clearAdminSession();
      authLifecycleHandlers.onAuthFailure?.();
      throw error;
    })
    .finally(() => {
      refreshInFlight = null;
    });

  return refreshInFlight;
}

function toQueryString(
  query?: Record<string, string | number | boolean | undefined>,
) {
  if (!query) {
    return "";
  }

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) {
      continue;
    }
    params.set(key, String(value));
  }

  const serialized = params.toString();
  return serialized.length > 0 ? `?${serialized}` : "";
}

export async function apiRequest<T>(
  method: HttpMethod,
  path: string,
  options?: {
    body?: Record<string, unknown>;
    query?: Record<string, string | number | boolean | undefined>;
    headers?: Record<string, string>;
  },
): Promise<T> {
  const pathWithQuery = `${API_BASE_URL}${path}${toQueryString(options?.query)}`;
  const rawHeaders = options?.headers ?? {};
  const doRequest = (authHeader?: string) =>
    fetch(pathWithQuery, {
      method,
      headers: {
        "content-type": "application/json",
        ...rawHeaders,
        ...(authHeader ? { authorization: authHeader } : {}),
      },
      body: options?.body ? JSON.stringify(options.body) : undefined,
    });

  const startingAuthHeader = rawHeaders.authorization;
  let response = await doRequest(startingAuthHeader);
  if (response.status === 401 && startingAuthHeader?.startsWith("Bearer ")) {
    try {
      const refreshed = await refreshSessionTokens();
      response = await doRequest(`Bearer ${refreshed.accessToken}`);
    } catch {
      throw new Error("Session expired. Sign in again.");
    }
  }

  const envelope = await readEnvelope<T>(response);

  if (!response.ok || !envelope.success || envelope.data == null) {
    throw new Error(
      envelope.error?.message ?? `API request failed: ${method} ${path}`,
    );
  }

  return envelope.data;
}

/** For endpoints that legitimately return `data: null` (e.g. no primary agent thread). */
export async function apiRequestNullable<T>(
  method: HttpMethod,
  path: string,
  options?: {
    body?: Record<string, unknown>;
    query?: Record<string, string | number | boolean | undefined>;
    headers?: Record<string, string>;
  },
): Promise<T | null> {
  const pathWithQuery = `${API_BASE_URL}${path}${toQueryString(options?.query)}`;
  const rawHeaders = options?.headers ?? {};
  const doRequest = (authHeader?: string) =>
    fetch(pathWithQuery, {
      method,
      headers: {
        "content-type": "application/json",
        ...rawHeaders,
        ...(authHeader ? { authorization: authHeader } : {}),
      },
      body: options?.body ? JSON.stringify(options.body) : undefined,
    });

  const startingAuthHeader = rawHeaders.authorization;
  let response = await doRequest(startingAuthHeader);
  if (response.status === 401 && startingAuthHeader?.startsWith("Bearer ")) {
    try {
      const refreshed = await refreshSessionTokens();
      response = await doRequest(`Bearer ${refreshed.accessToken}`);
    } catch {
      throw new Error("Session expired. Sign in again.");
    }
  }

  const envelope = await readEnvelope<T | null>(response);

  if (!response.ok || !envelope.success) {
    throw new Error(
      envelope.error?.message ?? `API request failed: ${method} ${path}`,
    );
  }

  return envelope.data ?? null;
}

export function buildApiUrl(
  path: string,
  query?: Record<string, string | number | boolean | undefined>,
) {
  return `${API_BASE_URL}${path}${toQueryString(query)}`;
}

export type GoogleAuthExchangeResult = {
  user: {
    id: string;
    email: string | null;
    displayName: string | null;
  };
  accessToken: string;
  refreshToken: string;
  sessionId: string;
};

export async function fetchGoogleOAuthStartUrl(mobileRedirectUri: string) {
  const data = await apiRequest<{ url: string }>("GET", "/auth/google", {
    query: { mobileRedirectUri },
  });
  return data.url;
}

export async function exchangeGoogleAuthCode(code: string) {
  return apiRequest<GoogleAuthExchangeResult>("POST", "/auth/google/callback", {
    body: { code, adminConsole: true },
  });
}
