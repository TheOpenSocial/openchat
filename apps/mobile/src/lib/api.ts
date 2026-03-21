import Constants from "expo-constants";
import { Platform } from "react-native";
import {
  clearStoredSession,
  loadStoredSession,
  saveStoredSession,
} from "./session-storage";

type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
type RequestQueryValue = string | number | boolean | null | undefined;

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

export interface GoogleAuthUrlResponse {
  url: string;
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

export interface ChatMetadataRecord {
  chatId: string;
  type: "dm" | "group";
  connectionId: string;
  createdAt: string;
  connectionType: "dm" | "group";
  connectionStatus: string;
  ownerUserId: string;
  participantCount: number;
  participants: Array<{
    userId: string;
    role: string;
    joinedAt: string;
  }>;
  archived: boolean;
}

export interface ChatSyncResponse {
  messages: ChatMessageRecord[];
  unreadCount: number;
  highWatermark: string | null;
  hasMore: boolean;
  deduped: boolean;
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

const REMOTE_API_BASE_URL = "https://api.opensocial.so/api";

/**
 * Accepts `api.opensocial.so`, `https://api.opensocial.so`, or full `https://…/api`.
 * Paths default to `/api` when omitted so `fetch(\`\${base}/auth/…\`)` stays correct.
 */
function normalizeExpoPublicApiBaseUrl(
  raw: string | undefined,
): string | undefined {
  if (raw == null) {
    return undefined;
  }
  const trimmed = raw.trim();
  if (!trimmed) {
    return undefined;
  }

  let withScheme = trimmed;
  if (!/^https?:\/\//i.test(withScheme)) {
    withScheme = `https://${withScheme}`;
  }

  let parsed: URL;
  try {
    parsed = new URL(withScheme);
  } catch {
    return trimmed;
  }

  const path = parsed.pathname.replace(/\/+$/, "") || "";
  const suffix = path === "" || path === "/" ? "/api" : path;

  return `${parsed.origin}${suffix}`.replace(/\/+$/, "");
}

const LOCAL_API_BASE = Platform.select({
  android: "http://10.0.2.2:3000/api",
  default: "http://localhost:3000/api",
});

const maybeConfig = Constants as unknown as {
  expoConfig?: { hostUri?: string };
  expoGoConfig?: { debuggerHost?: string };
};
const expoHostUri =
  maybeConfig.expoConfig?.hostUri ?? maybeConfig.expoGoConfig?.debuggerHost;
const expoLanBase = expoHostUri
  ? `http://${expoHostUri.split(":")[0]}:3000/api`
  : null;

const devApiBase = expoLanBase ?? LOCAL_API_BASE;

const useLocalApiInDev =
  process.env.EXPO_PUBLIC_USE_LOCAL_API === "1" ||
  process.env.EXPO_PUBLIC_USE_LOCAL_API === "true";

/**
 * Default: production API (`https://api.opensocial.so/api`) so dev builds and
 * store builds behave the same unless you override.
 * - Production host only: `EXPO_PUBLIC_API_BASE_URL=api.opensocial.so` (https + `/api` added).
 * - Local API: `EXPO_PUBLIC_API_BASE_URL=http://<host>:3000/api` or
 *   `EXPO_PUBLIC_USE_LOCAL_API=1` (LAN / emulator defaults).
 */
export const API_BASE_URL =
  normalizeExpoPublicApiBaseUrl(process.env.EXPO_PUBLIC_API_BASE_URL) ??
  (__DEV__ && useLocalApiInDev ? devApiBase : REMOTE_API_BASE_URL);

let refreshInFlight: Promise<SessionTokens> | null = null;
let authLifecycleHandlers: AuthLifecycleHandlers = {};

export function configureApiAuthLifecycle(handlers: AuthLifecycleHandlers) {
  authLifecycleHandlers = handlers;
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

/**
 * NestJS (and similar) error bodies use `{ statusCode, message, error }` without `success`,
 * which previously surfaced as the vague "Invalid API response envelope" on mobile.
 */
function envelopeFromNestStyleError(raw: unknown): ApiEnvelope<never> | null {
  if (!isRecord(raw) || typeof raw.success === "boolean") {
    return null;
  }
  const statusCode = raw.statusCode;
  if (typeof statusCode !== "number") {
    return null;
  }

  const msg = raw.message;
  let message: string;
  if (typeof msg === "string") {
    message = msg;
  } else if (Array.isArray(msg)) {
    message = msg.map((m) => String(m)).join("; ");
  } else if (isRecord(msg)) {
    const inner = msg.message;
    message = typeof inner === "string" ? inner : JSON.stringify(msg);
  } else {
    message =
      typeof raw.error === "string"
        ? raw.error
        : `Request failed (${statusCode})`;
  }

  return {
    success: false,
    error: {
      code: "http_error",
      message:
        message.trim().length > 0 ? message : `Request failed (${statusCode})`,
    },
  };
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
    const nest = envelopeFromNestStyleError(raw);
    if (nest) {
      return nest;
    }
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
    const currentSession = await loadStoredSession();
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
    await saveStoredSession({
      ...currentSession,
      ...refreshed,
    });
    authLifecycleHandlers.onSessionRefreshed?.(refreshed);
    return refreshed;
  })()
    .catch(async (error) => {
      await clearStoredSession();
      authLifecycleHandlers.onAuthFailure?.();
      throw error;
    })
    .finally(() => {
      refreshInFlight = null;
    });

  return refreshInFlight;
}

function buildPathWithQuery(
  path: string,
  query?: Record<string, RequestQueryValue>,
) {
  if (!query) {
    return path;
  }

  const params = new URLSearchParams();
  for (const [key, rawValue] of Object.entries(query)) {
    if (rawValue == null) {
      continue;
    }
    params.set(key, String(rawValue));
  }
  const queryString = params.toString();
  if (!queryString) {
    return path;
  }
  return `${path}?${queryString}`;
}

async function request<T>(
  method: HttpMethod,
  path: string,
  body?: Record<string, unknown>,
  accessToken?: string,
  query?: Record<string, RequestQueryValue>,
  fetchOptions?: { signal?: AbortSignal },
): Promise<T> {
  const pathWithQuery = buildPathWithQuery(path, query);
  const doRequest = (token?: string) =>
    fetch(`${API_BASE_URL}${pathWithQuery}`, {
      method,
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: fetchOptions?.signal,
    });

  let response = await doRequest(accessToken);
  if (response.status === 401 && accessToken) {
    try {
      const refreshed = await refreshSessionTokens();
      response = await doRequest(refreshed.accessToken);
    } catch {
      throw new Error("Session expired. Sign in again.");
    }
  }

  const envelope = await readEnvelope<T>(response);
  if (!response.ok || !envelope.success || envelope.data == null) {
    throw new Error(
      envelope.error?.message ??
        `API request failed: ${method} ${pathWithQuery}`,
    );
  }

  return envelope.data;
}

async function requestNullable<T>(
  method: HttpMethod,
  path: string,
  accessToken?: string,
  query?: Record<string, RequestQueryValue>,
): Promise<T | null> {
  const pathWithQuery = buildPathWithQuery(path, query);
  const doRequest = (token?: string) =>
    fetch(`${API_BASE_URL}${pathWithQuery}`, {
      method,
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
    });

  let response = await doRequest(accessToken);
  if (response.status === 401 && accessToken) {
    try {
      const refreshed = await refreshSessionTokens();
      response = await doRequest(refreshed.accessToken);
    } catch {
      throw new Error("Session expired. Sign in again.");
    }
  }

  const envelope = await readEnvelope<T | null>(response);
  if (!response.ok || !envelope.success) {
    throw new Error(
      envelope.error?.message ??
        `API request failed: ${method} ${pathWithQuery}`,
    );
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

export const api = {
  getGoogleAuthUrl(mobileRedirectUri?: string) {
    return request<GoogleAuthUrlResponse>(
      "GET",
      "/auth/google",
      undefined,
      undefined,
      {
        mobileRedirectUri,
      },
    );
  },
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
  getProfile(userId: string, accessToken?: string) {
    return request<Record<string, unknown> | null>(
      "GET",
      `/profiles/${userId}`,
      undefined,
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
    fetchOptions?: { signal?: AbortSignal },
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
      undefined,
      fetchOptions,
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
    fetchOptions?: { signal?: AbortSignal },
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
      undefined,
      fetchOptions,
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
      undefined,
      { signal: options?.signal },
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
  search(userId: string, q: string, limit = 6, accessToken?: string) {
    return request<SearchSnapshotResponse>(
      "GET",
      `/search/${userId}`,
      undefined,
      accessToken,
      {
        q,
        limit,
      },
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
    return request<ScheduledTaskRecord[]>(
      "GET",
      `/scheduled-tasks/${userId}`,
      undefined,
      accessToken,
      {
        ...(options?.status ? { status: options.status } : {}),
        ...(typeof options?.limit === "number" ? { limit: options.limit } : {}),
      },
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
      `/scheduled-tasks/${taskId}/runs`,
      undefined,
      accessToken,
      { limit },
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
    fetchOptions?: { signal?: AbortSignal },
  ) {
    return request<ContentRiskAssessment>(
      "POST",
      "/moderation/assess",
      payload,
      accessToken,
      undefined,
      fetchOptions,
    );
  },
  createReport(
    payload: {
      reporterUserId: string;
      targetUserId: string | null;
      reason: string;
      details?: string;
      entityType?: "chat_message" | "intent" | "profile" | "user";
      entityId?: string;
    },
    accessToken?: string,
  ) {
    return request<Record<string, unknown>>(
      "POST",
      "/moderation/reports",
      payload,
      accessToken,
    );
  },
  blockUser(
    payload: {
      blockerUserId: string;
      blockedUserId: string;
    },
    accessToken?: string,
  ) {
    return request<Record<string, unknown>>(
      "POST",
      "/moderation/blocks",
      payload,
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
  getChatMetadata(chatId: string, accessToken?: string) {
    return request<ChatMetadataRecord>(
      "GET",
      `/chats/${chatId}/metadata`,
      undefined,
      accessToken,
    );
  },
  syncChatMessages(
    chatId: string,
    userId: string,
    options?: { limit?: number; after?: string },
    accessToken?: string,
  ) {
    return request<ChatSyncResponse>(
      "GET",
      `/chats/${chatId}/sync`,
      undefined,
      accessToken,
      {
        userId,
        limit: options?.limit,
        after: options?.after,
      },
    );
  },
  getPassiveDiscovery(userId: string, limit = 3, accessToken?: string) {
    return request<PassiveDiscoveryResponse>(
      "GET",
      `/discovery/${userId}/passive`,
      undefined,
      accessToken,
      {
        limit,
      },
    );
  },
  getDiscoveryInboxSuggestions(
    userId: string,
    limit = 3,
    accessToken?: string,
  ) {
    return request<DiscoveryInboxSuggestionsResponse>(
      "GET",
      `/discovery/${userId}/inbox-suggestions`,
      undefined,
      accessToken,
      {
        limit,
      },
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
  createChatMessage(
    chatId: string,
    senderUserId: string,
    body: string,
    accessToken?: string,
    options?: { clientMessageId?: string },
  ) {
    return request<ChatMessageRecord>(
      "POST",
      `/chats/${chatId}/messages`,
      {
        senderUserId,
        body,
        ...(options?.clientMessageId
          ? { clientMessageId: options.clientMessageId }
          : {}),
      },
      accessToken,
    );
  },
};
