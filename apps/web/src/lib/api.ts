import {
  clearStoredSession,
  loadStoredSession,
  saveStoredSession,
} from "./session";

export interface SessionTokens {
  accessToken: string;
  refreshToken: string;
  sessionId: string;
}

export interface AuthUser {
  id: string;
  displayName: string;
  email: string | null;
}

export interface AuthResult extends SessionTokens {
  user: AuthUser;
}

export interface ProfileCompletion {
  completed: boolean;
  onboardingState: string;
  checks: {
    hasBio: boolean;
    hasCity: boolean;
    hasCountry: boolean;
    hasInterests: boolean;
  };
}

export interface InboxRequestRecord {
  id: string;
  intentId: string;
  senderUserId: string;
  recipientUserId: string;
  status: "pending" | "accepted" | "rejected" | "expired" | "cancelled";
  wave: number;
  createdAt: string;
  respondedAt?: string | null;
}

export interface ChatRecord {
  id: string;
  connectionId: string;
  type: "dm" | "group";
  createdAt: string;
}

export interface ChatMessageRecord {
  id: string;
  chatId: string;
  senderUserId: string;
  body: string;
  createdAt: string;
}

export interface RecurringCircleRecord {
  id: string;
  ownerUserId: string;
  title: string;
  description: string | null;
  status: "active" | "paused" | "archived";
  visibility: "private" | "invite_only" | "discoverable";
  nextSessionAt: string | null;
}

export interface RecurringCircleSessionRecord {
  id: string;
  circleId: string;
  status: string;
  scheduledFor: string;
  generatedIntentId: string | null;
  summary: string | null;
}

export interface SavedSearchRecord {
  id: string;
  userId: string;
  title: string;
  searchType: string;
  queryConfig: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface ScheduledTaskRecord {
  id: string;
  userId: string;
  title: string;
  description: string | null;
  taskType: string;
  status: string;
  scheduleType: string;
  scheduleConfig: Record<string, unknown>;
  taskConfig: Record<string, unknown>;
  nextRunAt: string | null;
  lastRunAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ScheduledTaskRunRecord {
  id: string;
  scheduledTaskId: string;
  userId: string;
  status: string;
  triggeredAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  traceId: string;
  resultPayload: Record<string, unknown> | null;
  errorMessage: string | null;
}

export interface PendingIntentSummaryItem {
  intentId: string;
  rawText: string;
  status: string;
  ageMinutes: number;
  requests: {
    pending: number;
    accepted: number;
    rejected: number;
    expired: number;
    cancelled: number;
  };
}

export interface PendingIntentsSummaryResponse {
  userId: string;
  activeIntentCount: number;
  summaryText: string;
  intents: PendingIntentSummaryItem[];
}

export interface DiscoveryUserSuggestion {
  userId: string;
  displayName: string;
  score: number;
  reason: string;
}

export interface DiscoveryGroupSuggestion {
  title: string;
  topic: string;
  participantUserIds: string[];
  score: number;
}

export interface DiscoveryReconnectSuggestion {
  userId: string;
  displayName: string;
  interactionCount: number;
  lastInteractionAt: string | null;
  score: number;
}

export interface PassiveDiscoveryResponse {
  userId: string;
  generatedAt: string;
  tonight: {
    suggestions: DiscoveryUserSuggestion[];
    seedTopics: string[];
  };
  activeIntentsOrUsers: {
    items: Array<Record<string, unknown>>;
  };
  groups: {
    groups: DiscoveryGroupSuggestion[];
  };
  reconnects: {
    reconnects: DiscoveryReconnectSuggestion[];
  };
}

export interface DiscoveryInboxSuggestionsResponse {
  userId: string;
  generatedAt: string;
  pendingRequestCount: number;
  suggestions: Array<{
    title: string;
    reason: string;
    score: number;
  }>;
}

export interface DiscoveryAgentRecommendationsResponse {
  userId: string;
  generatedAt: string;
  threadId: string | null;
  delivered: boolean;
  message: string;
  discovery: PassiveDiscoveryResponse;
}

export interface UserIntentExplanation {
  intentId: string;
  status: string;
  summary: string;
  factors: string[];
}

export interface SearchSnapshotResponse {
  userId: string;
  query: string;
  generatedAt: string;
  users: Array<{
    userId: string;
    displayName: string;
    city: string | null;
    country: string | null;
    moderationState: string;
    score: number;
  }>;
  topics: Array<{
    label: string;
    count: number;
    score: number;
  }>;
  activities: Array<{
    intentId: string;
    ownerUserId: string;
    status: string;
    summary: string;
    createdAt: string;
    score: number;
  }>;
  groups: Array<{
    circleId: string;
    title: string;
    description: string | null;
    visibility: string;
    ownerUserId: string;
    nextSessionAt: string | null;
    score: number;
  }>;
}

type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

interface ApiEnvelope<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}

interface AuthLifecycleHandlers {
  onSessionRefreshed?: (tokens: SessionTokens) => void;
  onAuthFailure?: () => void;
}

type RetryMode = "none" | "transient";

type RequestOptions = {
  signal?: AbortSignal;
  retryMode?: RetryMode;
};

const REMOTE_API_BASE_URL = "https://api.opensocial.so/api";

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  (process.env.NODE_ENV === "production"
    ? REMOTE_API_BASE_URL
    : "http://localhost:3000/api");

let refreshInFlight: Promise<SessionTokens> | null = null;
let authLifecycleHandlers: AuthLifecycleHandlers = {};

const TRANSIENT_STATUS_CODES = new Set([408, 425, 429, 500, 502, 503, 504]);
const RETRY_BASE_DELAY_MS = 350;
const RETRY_MAX_ATTEMPTS = 3;

export class ApiRequestError extends Error {
  readonly code: string;
  readonly statusCode: number | null;
  readonly transient: boolean;
  readonly offline: boolean;

  constructor(input: {
    message: string;
    code: string;
    statusCode?: number | null;
    transient?: boolean;
    offline?: boolean;
  }) {
    super(input.message);
    this.name = "ApiRequestError";
    this.code = input.code;
    this.statusCode = input.statusCode ?? null;
    this.transient = input.transient ?? false;
    this.offline = input.offline ?? false;
  }
}

export function configureApiAuthLifecycle(handlers: AuthLifecycleHandlers) {
  authLifecycleHandlers = handlers;
}

export function isRetryableApiError(error: unknown): error is ApiRequestError {
  return error instanceof ApiRequestError && error.transient;
}

export function isOfflineApiError(error: unknown): error is ApiRequestError {
  return error instanceof ApiRequestError && error.offline;
}

export function buildAgentThreadStreamUrl(
  threadId: string,
  accessToken: string,
) {
  const params = new URLSearchParams({ access_token: accessToken });
  return `${API_BASE_URL}/agent/threads/${threadId}/stream?${params.toString()}`;
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

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}

function isOfflineLikeError(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }
  const message = error.message.toLowerCase();
  return (
    message.includes("network request failed") ||
    message.includes("networkerror") ||
    message.includes("failed to fetch") ||
    message.includes("load failed") ||
    message.includes("offline")
  );
}

function shouldRetryStatus(statusCode: number) {
  return TRANSIENT_STATUS_CODES.has(statusCode);
}

function shouldRetryMode(method: HttpMethod, mode: RetryMode | undefined) {
  if (mode) {
    return mode === "transient";
  }
  return method === "GET";
}

async function delayWithSignal(ms: number, signal?: AbortSignal) {
  if (signal?.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);
    const onAbort = () => {
      cleanup();
      reject(new DOMException("Aborted", "AbortError"));
    };
    const cleanup = () => {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", onAbort);
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

async function performRequestWithRetry(
  method: HttpMethod,
  doFetch: () => Promise<Response>,
  signal?: AbortSignal,
  retryMode?: RetryMode,
) {
  const allowRetry = shouldRetryMode(method, retryMode);
  let attempt = 0;

  while (true) {
    try {
      const response = await doFetch();
      if (
        allowRetry &&
        shouldRetryStatus(response.status) &&
        attempt < RETRY_MAX_ATTEMPTS - 1
      ) {
        attempt += 1;
        await delayWithSignal(RETRY_BASE_DELAY_MS * 2 ** (attempt - 1), signal);
        continue;
      }
      return response;
    } catch (error) {
      if (isAbortError(error)) {
        throw error;
      }
      const offline = isOfflineLikeError(error);
      const transient = offline || allowRetry;
      if (!transient || attempt >= RETRY_MAX_ATTEMPTS - 1) {
        throw new ApiRequestError({
          message:
            error instanceof Error ? error.message : "Network request failed",
          code: offline ? "offline" : "network_error",
          transient,
          offline,
        });
      }
      attempt += 1;
      await delayWithSignal(RETRY_BASE_DELAY_MS * 2 ** (attempt - 1), signal);
    }
  }
}

function toApiRequestError(
  envelope: ApiEnvelope<unknown>,
  method: HttpMethod,
  path: string,
  response: Response,
) {
  const statusCode = response.status;
  return new ApiRequestError({
    message:
      envelope.error?.message ??
      `API request failed: ${method} ${path} (${statusCode})`,
    code: envelope.error?.code ?? "http_error",
    statusCode,
    transient: shouldRetryStatus(statusCode),
  });
}

async function refreshSessionTokens(): Promise<SessionTokens> {
  if (refreshInFlight) {
    return refreshInFlight;
  }

  refreshInFlight = (async () => {
    const currentSession = loadStoredSession();
    if (!currentSession?.refreshToken) {
      throw new Error("Missing refresh token");
    }

    const response = await performRequestWithRetry(
      "POST",
      () =>
        fetch(`${API_BASE_URL}/auth/refresh`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            refreshToken: currentSession.refreshToken,
          }),
        }),
      undefined,
      "transient",
    );

    const envelope = await readEnvelope<SessionTokens>(response);
    if (!response.ok || !envelope.success || envelope.data == null) {
      throw new Error(
        envelope.error?.message ?? "Could not refresh authenticated session.",
      );
    }

    const refreshed = envelope.data;
    saveStoredSession({
      ...currentSession,
      ...refreshed,
    });
    authLifecycleHandlers.onSessionRefreshed?.(refreshed);
    return refreshed;
  })()
    .catch((error) => {
      if (isRetryableApiError(error)) {
        throw error;
      }
      clearStoredSession();
      authLifecycleHandlers.onAuthFailure?.();
      throw error;
    })
    .finally(() => {
      refreshInFlight = null;
    });

  return refreshInFlight;
}

async function request<T>(
  method: HttpMethod,
  path: string,
  body?: Record<string, unknown>,
  accessToken?: string,
  requestOptions?: RequestOptions,
): Promise<T> {
  const doRequest = (token?: string) =>
    fetch(`${API_BASE_URL}${path}`, {
      method,
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: requestOptions?.signal,
    });

  let response = await performRequestWithRetry(
    method,
    () => doRequest(accessToken),
    requestOptions?.signal,
    requestOptions?.retryMode,
  );
  if (response.status === 401 && accessToken) {
    try {
      const refreshed = await refreshSessionTokens();
      response = await performRequestWithRetry(
        method,
        () => doRequest(refreshed.accessToken),
        requestOptions?.signal,
        requestOptions?.retryMode,
      );
    } catch {
      throw new ApiRequestError({
        message: "Session expired. Sign in again.",
        code: "auth_expired",
        statusCode: 401,
      });
    }
  }

  const envelope = await readEnvelope<T>(response);
  if (!response.ok || !envelope.success || envelope.data == null) {
    throw toApiRequestError(envelope, method, path, response);
  }

  return envelope.data;
}

async function requestNullable<T>(
  method: HttpMethod,
  path: string,
  accessToken?: string,
  requestOptions?: RequestOptions,
): Promise<T | null> {
  const doRequest = (token?: string) =>
    fetch(`${API_BASE_URL}${path}`, {
      method,
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      signal: requestOptions?.signal,
    });

  let response = await performRequestWithRetry(
    "GET",
    () => doRequest(accessToken),
    requestOptions?.signal,
  );
  if (response.status === 401 && accessToken) {
    try {
      const refreshed = await refreshSessionTokens();
      response = await performRequestWithRetry(
        "GET",
        () => doRequest(refreshed.accessToken),
        requestOptions?.signal,
      );
    } catch {
      throw new ApiRequestError({
        message: "Session expired. Sign in again.",
        code: "auth_expired",
        statusCode: 401,
      });
    }
  }

  const envelope = await readEnvelope<T | null>(response);
  if (!response.ok || !envelope.success) {
    throw toApiRequestError(envelope, method, path, response);
  }

  return envelope.data ?? null;
}

export interface AgentThreadSummary {
  id: string;
  title: string;
  createdAt: string;
}

export interface AgentThreadMessage {
  id: string;
  threadId: string;
  role: string;
  content: string;
  createdByUserId: string | null;
  createdAt: string;
  metadata?: unknown;
}

export interface AgenticTurnResult {
  traceId: string;
  userMessageId: string;
  agentMessageId: string;
  plan: Record<string, unknown>;
  toolResults: unknown[];
  specialistNotes: unknown[];
  streaming?: {
    responseTokenStreamed: boolean;
    chunkCount: number;
  };
}

export interface AgentMessageIntentResult {
  threadId: string;
  messageId: string;
  intentId: string;
  status: string;
  intentCount: number;
  intentIds: string[];
  traceId: string;
}

export type ModerationRiskDecision = "blocked" | "review" | "clean";

export interface ContentRiskAssessment {
  decision: ModerationRiskDecision;
  score: number;
  reasons: string[];
  surface: string;
  signals: {
    urlCount: number;
    mentionCount: number;
    repeatedWordRatio: number;
    repeatedCharacterRun: boolean;
  };
}

export async function getGoogleOAuthStartUrl(
  webRedirectUri: string,
): Promise<string> {
  const params = new URLSearchParams({ webRedirectUri });
  const response = await fetch(
    `${API_BASE_URL}/auth/google?${params.toString()}`,
  );
  const envelope = await readEnvelope<{ url: string }>(response);
  if (!response.ok || !envelope.success || envelope.data?.url == null) {
    throw new Error(
      envelope.error?.message ?? "Could not start Google sign-in.",
    );
  }
  return envelope.data.url;
}

export const api = {
  authGoogleCallback(code: string) {
    return request<AuthResult>("POST", "/auth/google/callback", { code });
  },
  getProfileCompletion(userId: string, accessToken?: string) {
    return request<ProfileCompletion>(
      "GET",
      `/profiles/${userId}/completion`,
      undefined,
      accessToken,
    );
  },
  updateProfile(
    userId: string,
    payload: {
      bio?: string;
      city?: string;
      country?: string;
      visibility?: "public" | "limited" | "private";
    },
    accessToken?: string,
  ) {
    return request("PUT", `/profiles/${userId}`, payload, accessToken);
  },
  replaceInterests(
    userId: string,
    interests: Array<{
      kind: string;
      label: string;
      weight?: number;
      source?: string;
    }>,
    accessToken?: string,
  ) {
    return request(
      "PUT",
      `/profiles/${userId}/interests`,
      { interests },
      accessToken,
    );
  },
  replaceTopics(
    userId: string,
    topics: Array<{ label: string; weight?: number; source?: string }>,
    accessToken?: string,
  ) {
    return request(
      "PUT",
      `/profiles/${userId}/topics`,
      { topics },
      accessToken,
    );
  },
  setSocialMode(
    userId: string,
    payload: {
      socialMode: "chill" | "balanced" | "high_energy";
      preferOneToOne: boolean;
      allowGroupInvites: boolean;
    },
    accessToken?: string,
  ) {
    return request(
      "PUT",
      `/profiles/${userId}/social-mode`,
      payload,
      accessToken,
    );
  },
  setGlobalRules(
    userId: string,
    payload: {
      whoCanContact: "anyone" | "verified_only" | "trusted_only";
      reachable: "always" | "available_only" | "do_not_disturb";
      intentMode: "one_to_one" | "group" | "balanced";
      modality: "online" | "offline" | "either";
      languagePreferences: string[];
      requireVerifiedUsers: boolean;
      notificationMode: "immediate" | "digest" | "quiet";
      agentAutonomy: "manual" | "suggest_only" | "auto_non_risky";
      memoryMode: "minimal" | "standard" | "extended";
    },
    accessToken?: string,
  ) {
    return request(
      "PUT",
      `/personalization/${userId}/rules/global`,
      payload,
      accessToken,
    );
  },
  getGlobalRules(userId: string, accessToken?: string) {
    return request<Record<string, unknown>>(
      "GET",
      `/personalization/${userId}/rules/global`,
      undefined,
      accessToken,
    );
  },
  getLifeGraph(userId: string, accessToken?: string) {
    return request<Record<string, unknown>>(
      "GET",
      `/personalization/${userId}/life-graph`,
      undefined,
      accessToken,
    );
  },
  queryRetrievalContext(
    userId: string,
    payload: { query: string; maxChunks?: number; maxAgeDays?: number },
    accessToken?: string,
  ) {
    return request<Record<string, unknown>>(
      "POST",
      `/personalization/${userId}/retrieval/query`,
      payload,
      accessToken,
    );
  },
  refreshProfileSummaryMemory(userId: string, accessToken?: string) {
    return request<Record<string, unknown>>(
      "POST",
      `/personalization/${userId}/retrieval/profile-summary/refresh`,
      {},
      accessToken,
    );
  },
  refreshPreferenceMemory(userId: string, accessToken?: string) {
    return request<Record<string, unknown>>(
      "POST",
      `/personalization/${userId}/retrieval/preference-memory/refresh`,
      {},
      accessToken,
    );
  },
  resetMemory(
    userId: string,
    payload: {
      actorUserId: string;
      mode?: "learned_memory" | "all_personalization";
      reason?: string;
    },
    accessToken?: string,
  ) {
    return request<Record<string, unknown>>(
      "POST",
      `/privacy/${userId}/memory/reset`,
      payload,
      accessToken,
    );
  },
  getTrustProfile(userId: string, accessToken?: string) {
    return request<Record<string, unknown>>(
      "GET",
      `/profiles/${userId}/trust`,
      undefined,
      accessToken,
    );
  },
  listPendingRequests(userId: string, accessToken?: string) {
    return request<InboxRequestRecord[]>(
      "GET",
      `/inbox/requests/${userId}`,
      undefined,
      accessToken,
    );
  },
  acceptRequest(requestId: string, accessToken?: string) {
    return request<Record<string, unknown>>(
      "POST",
      `/inbox/requests/${requestId}/accept`,
      {},
      accessToken,
    );
  },
  rejectRequest(requestId: string, accessToken?: string) {
    return request<Record<string, unknown>>(
      "POST",
      `/inbox/requests/${requestId}/reject`,
      {},
      accessToken,
    );
  },
  createIntent(
    userId: string,
    rawText: string,
    accessToken?: string,
    fetchOpts?: { signal?: AbortSignal },
    agentThreadId?: string,
  ) {
    return request<Record<string, unknown>>(
      "POST",
      "/intents",
      {
        userId,
        rawText,
        ...(agentThreadId ? { agentThreadId } : {}),
      },
      accessToken,
      fetchOpts,
    );
  },
  createIntentFromAgentMessage(
    threadId: string,
    userId: string,
    content: string,
    accessToken?: string,
    options?: { allowDecomposition?: boolean; maxIntents?: number },
  ) {
    return request<AgentMessageIntentResult>(
      "POST",
      "/intents/from-agent",
      {
        threadId,
        userId,
        content,
        ...(options?.allowDecomposition !== undefined
          ? { allowDecomposition: options.allowDecomposition }
          : {}),
        ...(typeof options?.maxIntents === "number"
          ? { maxIntents: options.maxIntents }
          : {}),
      },
      accessToken,
    );
  },
  summarizePendingIntents(
    userId: string,
    maxIntents = 5,
    accessToken?: string,
  ) {
    return request<PendingIntentsSummaryResponse>(
      "POST",
      "/intents/summarize-pending",
      {
        userId,
        maxIntents,
      },
      accessToken,
    );
  },
  getUserIntentExplanation(intentId: string, accessToken?: string) {
    return request<UserIntentExplanation>(
      "GET",
      `/intents/${intentId}/explanations/user`,
      undefined,
      accessToken,
    );
  },
  getMyAgentThreadSummary(accessToken?: string) {
    return requestNullable<AgentThreadSummary>(
      "GET",
      "/agent/threads/me/summary",
      accessToken,
    );
  },
  listAgentThreadMessages(threadId: string, accessToken?: string) {
    return request<AgentThreadMessage[]>(
      "GET",
      `/agent/threads/${threadId}/messages`,
      undefined,
      accessToken,
    );
  },
  agentThreadRespond(
    threadId: string,
    userId: string,
    content: string,
    accessToken?: string,
    fetchOpts?: { signal?: AbortSignal },
    extras?: {
      voiceTranscript?: string;
      attachments?: Array<
        | { kind: "image_url"; url: string; caption?: string }
        | { kind: "file_ref"; fileId: string; caption?: string }
      >;
    },
  ) {
    return request<AgenticTurnResult>(
      "POST",
      `/agent/threads/${threadId}/respond`,
      {
        userId,
        content,
        ...(extras?.voiceTranscript
          ? { voiceTranscript: extras.voiceTranscript }
          : {}),
        ...(extras?.attachments?.length
          ? { attachments: extras.attachments }
          : {}),
      },
      accessToken,
      fetchOpts,
    );
  },
  agentThreadRespondStream(
    threadId: string,
    userId: string,
    content: string,
    accessToken?: string,
    options?: {
      signal?: AbortSignal;
      traceId?: string;
      voiceTranscript?: string;
      attachments?: Array<
        | { kind: "image_url"; url: string; caption?: string }
        | { kind: "file_ref"; fileId: string; caption?: string }
      >;
    },
  ) {
    return request<AgenticTurnResult>(
      "POST",
      `/agent/threads/${threadId}/respond/stream`,
      {
        userId,
        content,
        ...(options?.traceId ? { traceId: options.traceId } : {}),
        ...(options?.voiceTranscript
          ? { voiceTranscript: options.voiceTranscript }
          : {}),
        ...(options?.attachments?.length
          ? { attachments: options.attachments }
          : {}),
      },
      accessToken,
      { signal: options?.signal },
    );
  },
  moderationAssess(
    payload: {
      userId?: string;
      content: string;
      context?: string;
      surface?:
        | "agent_turn"
        | "agent_response"
        | "chat_message"
        | "profile"
        | "intent";
    },
    accessToken?: string,
    fetchOpts?: { signal?: AbortSignal },
  ) {
    return request<ContentRiskAssessment>(
      "POST",
      "/moderation/assess",
      payload,
      accessToken,
      fetchOpts,
    );
  },
  sendDigest(userId: string, accessToken?: string) {
    return request<Record<string, unknown>>(
      "POST",
      `/notifications/${userId}/digest`,
      {},
      accessToken,
    );
  },
  getPassiveDiscovery(userId: string, limit = 3, accessToken?: string) {
    return request<PassiveDiscoveryResponse>(
      "GET",
      `/discovery/${userId}/passive?limit=${encodeURIComponent(String(limit))}`,
      undefined,
      accessToken,
    );
  },
  getDiscoveryInboxSuggestions(
    userId: string,
    limit = 3,
    accessToken?: string,
  ) {
    return request<DiscoveryInboxSuggestionsResponse>(
      "GET",
      `/discovery/${userId}/inbox-suggestions?limit=${encodeURIComponent(
        String(limit),
      )}`,
      undefined,
      accessToken,
    );
  },
  publishAgentRecommendations(
    userId: string,
    payload?: { threadId?: string; limit?: number },
    accessToken?: string,
  ) {
    return request<DiscoveryAgentRecommendationsResponse>(
      "POST",
      `/discovery/${userId}/agent-recommendations`,
      payload ?? {},
      accessToken,
    );
  },
  search(userId: string, q: string, limit = 6, accessToken?: string) {
    const params = new URLSearchParams({
      q,
      limit: String(limit),
    });
    return request<SearchSnapshotResponse>(
      "GET",
      `/search/${userId}?${params.toString()}`,
      undefined,
      accessToken,
    );
  },
  listRecurringCircles(userId: string, accessToken?: string) {
    return request<RecurringCircleRecord[]>(
      "GET",
      `/recurring-circles/${userId}`,
      undefined,
      accessToken,
    );
  },
  createRecurringCircle(
    userId: string,
    payload: {
      title: string;
      visibility?: "private" | "invite_only" | "discoverable";
      topicTags?: string[];
      cadence: {
        kind: "weekly";
        days: Array<"sun" | "mon" | "tue" | "wed" | "thu" | "fri" | "sat">;
        hour: number;
        minute: number;
        timezone: string;
        intervalWeeks?: number;
      };
      description?: string;
      targetSize?: number;
      kickoffPrompt?: string;
    },
    accessToken?: string,
  ) {
    return request<RecurringCircleRecord>(
      "POST",
      `/recurring-circles/${userId}`,
      payload,
      accessToken,
    );
  },
  listRecurringCircleSessions(circleId: string, accessToken?: string) {
    return request<RecurringCircleSessionRecord[]>(
      "GET",
      `/recurring-circles/${circleId}/sessions`,
      undefined,
      accessToken,
    );
  },
  runRecurringCircleSessionNow(circleId: string, accessToken?: string) {
    return request<RecurringCircleSessionRecord>(
      "POST",
      `/recurring-circles/${circleId}/sessions/run-now`,
      {},
      accessToken,
    );
  },
  listSavedSearches(userId: string, accessToken?: string) {
    return request<SavedSearchRecord[]>(
      "GET",
      `/saved-searches/${userId}`,
      undefined,
      accessToken,
    );
  },
  createSavedSearch(
    userId: string,
    payload: {
      title: string;
      searchType:
        | "discovery_people"
        | "discovery_groups"
        | "reconnects"
        | "topic_search"
        | "activity_search";
      queryConfig: Record<string, unknown>;
    },
    accessToken?: string,
  ) {
    return request<SavedSearchRecord>(
      "POST",
      `/saved-searches/${userId}`,
      payload,
      accessToken,
    );
  },
  deleteSavedSearch(searchId: string, accessToken?: string) {
    return request<{ deleted: boolean; searchId: string }>(
      "DELETE",
      `/saved-searches/${searchId}`,
      undefined,
      accessToken,
    );
  },
  listScheduledTasks(
    userId: string,
    options?: { status?: string; limit?: number },
    accessToken?: string,
  ) {
    const params = new URLSearchParams();
    if (options?.status) {
      params.set("status", options.status);
    }
    if (typeof options?.limit === "number") {
      params.set("limit", String(options.limit));
    }
    const suffix = params.toString();
    return request<ScheduledTaskRecord[]>(
      "GET",
      `/scheduled-tasks/${userId}${suffix ? `?${suffix}` : ""}`,
      undefined,
      accessToken,
    );
  },
  createScheduledTask(
    userId: string,
    payload: {
      title: string;
      description?: string;
      schedule:
        | {
            kind: "hourly";
            intervalHours: number;
            timezone: string;
          }
        | {
            kind: "weekly";
            days: Array<"sun" | "mon" | "tue" | "wed" | "thu" | "fri" | "sat">;
            hour: number;
            minute: number;
            timezone: string;
            intervalWeeks?: number;
          };
      task: {
        taskType:
          | "saved_search"
          | "discovery_briefing"
          | "reconnect_briefing"
          | "social_reminder";
        config: Record<string, unknown>;
      };
    },
    accessToken?: string,
  ) {
    return request<ScheduledTaskRecord>(
      "POST",
      `/scheduled-tasks/${userId}`,
      payload,
      accessToken,
    );
  },
  runScheduledTaskNow(taskId: string, accessToken?: string) {
    return request<{ taskId: string; runId: string; status: "queued" }>(
      "POST",
      `/scheduled-tasks/${taskId}/run-now`,
      {},
      accessToken,
    );
  },
  listScheduledTaskRuns(taskId: string, limit = 10, accessToken?: string) {
    return request<ScheduledTaskRunRecord[]>(
      "GET",
      `/scheduled-tasks/${taskId}/runs?limit=${encodeURIComponent(String(limit))}`,
      undefined,
      accessToken,
    );
  },
  createConnection(userId: string, type: "dm" | "group", accessToken?: string) {
    return request<Record<string, unknown>>(
      "POST",
      "/connections",
      {
        type,
        createdByUserId: userId,
      },
      accessToken,
    );
  },
  createChat(connectionId: string, type: "dm" | "group", accessToken?: string) {
    return request<ChatRecord>(
      "POST",
      "/chats",
      {
        connectionId,
        type,
      },
      accessToken,
    );
  },
  listChatMessages(chatId: string, accessToken?: string) {
    return request<ChatMessageRecord[]>(
      "GET",
      `/chats/${chatId}/messages`,
      undefined,
      accessToken,
    );
  },
  createChatMessage(
    chatId: string,
    senderUserId: string,
    body: string,
    accessToken?: string,
  ) {
    return request<ChatMessageRecord>(
      "POST",
      `/chats/${chatId}/messages`,
      {
        senderUserId,
        body,
      },
      accessToken,
    );
  },
};
