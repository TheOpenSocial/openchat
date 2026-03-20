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

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3000/api";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseEnvelope<T>(payload: unknown): ApiEnvelope<T> {
  if (!isRecord(payload) || typeof payload.success !== "boolean") {
    throw new Error("Invalid API envelope");
  }

  return payload as unknown as ApiEnvelope<T>;
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
  const response = await fetch(
    `${API_BASE_URL}${path}${toQueryString(options?.query)}`,
    {
      method,
      headers: {
        "content-type": "application/json",
        ...(options?.headers ?? {}),
      },
      body: options?.body ? JSON.stringify(options.body) : undefined,
    },
  );

  const raw = (await response.json()) as unknown;
  const envelope = parseEnvelope<T>(raw);

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
  const response = await fetch(
    `${API_BASE_URL}${path}${toQueryString(options?.query)}`,
    {
      method,
      headers: {
        "content-type": "application/json",
        ...(options?.headers ?? {}),
      },
      body: options?.body ? JSON.stringify(options.body) : undefined,
    },
  );

  const raw = (await response.json()) as unknown;
  const envelope = parseEnvelope<T | null>(raw);

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
    body: { code },
  });
}
