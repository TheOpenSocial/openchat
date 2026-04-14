import Constants from "expo-constants";
import { Platform } from "react-native";
import {
  clearStoredSession,
  loadStoredSession,
  saveStoredSession,
} from "./session-storage";
import {
  buildChatThreadDetail,
  buildChatThreadSummaries,
} from "./chat-threads";
import {
  buildProtocolAppRegistrationRequest,
  createProtocolClient,
  type ProtocolAppRegistrationRequestInput,
} from "@opensocial/protocol-client";

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

type RetryMode = "none" | "transient";

type RequestOptions = {
  signal?: AbortSignal;
  retryMode?: RetryMode;
  headers?: Record<string, string>;
};

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

export interface ProfilePhotoUploadIntentResult {
  imageId: string;
  storageKey: string;
  mimeType: string;
  maxByteSize: number;
  expiresAt: string;
  uploadToken: string;
  uploadUrl: string;
  deliveryBaseUrl: string;
  requiredHeaders: Record<string, string>;
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

export interface ChatListItemRecord {
  id: string;
  connectionId: string;
  title: string;
  type: "dm" | "group";
  createdAt: string;
  highWatermark: string | null;
  unreadCount: number;
  participantCount: number | null;
  connectionStatus: string | null;
}

export interface ChatMessageStatusRecord {
  state: "sent" | "delivered" | "read";
  deliveredCount: number;
  readCount: number;
  pendingCount: number;
}

export interface ChatMessageReactionRecord {
  id: string;
  messageId: string;
  userId: string;
  emoji: string;
  createdAt: string;
}

export interface ChatMessageRecord {
  id: string;
  chatId: string;
  senderUserId: string;
  body: string;
  createdAt: string;
  moderationState?: "clean" | "flagged" | "blocked" | "review";
  editedAt?: string | null;
  replyToMessageId?: string | null;
  reactions?: ChatMessageReactionRecord[];
  status?: ChatMessageStatusRecord;
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
    presence?: {
      online: boolean;
      state:
        | "online"
        | "away"
        | "invisible"
        | "available_now"
        | "available_today";
      lastSeenAt?: string | null;
    };
  }>;
  archived: boolean;
}

export interface ProtocolScopeGrantRecord {
  grantId: string;
  appId: string;
  subjectType: "user" | "app" | "service" | "agent";
  subjectId: string;
  scope: string;
  capabilities: string[];
  status: "active" | "revoked";
  createdAt: string;
  updatedAt: string;
  revokedAt: string | null;
  metadata: Record<string, unknown>;
}

export interface ChatThreadSummaryRecord {
  rootMessage: ChatMessageRecord;
  replyCount: number;
  messageCount: number;
  participantCount: number;
  lastReplyAt: string | null;
  lastActivityAt: string;
}

export interface ChatThreadListResponse {
  chatId: string;
  threads: ChatThreadSummaryRecord[];
}

export interface ChatThreadDetailEntryRecord {
  depth: number;
  message: ChatMessageRecord;
}

export interface ChatThreadDetailResponse {
  chatId: string;
  thread: ChatThreadSummaryRecord;
  entries: ChatThreadDetailEntryRecord[];
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

export interface ExperienceHomeSummaryResponse {
  generatedAt: string;
  thread: {
    id: string;
    title: string | null;
    createdAt: string | Date;
  } | null;
  status: {
    eyebrow: string;
    title: string;
    body: string;
    tone: "active" | "waiting" | "recovery" | "idle";
    footnote: string | null;
    nextAction: {
      kind:
        | "review_requests"
        | "open_matches"
        | "resume_intent"
        | "start_intent";
      label: string;
    };
  };
  counts: {
    activeIntents: number;
    pendingRequests: number;
    unreadNotifications: number;
    tonightSuggestions: number;
    reconnectCandidates: number;
  };
  spotlight: {
    coordination: {
      variant: "accepted" | "waiting";
      title: string;
      body: string;
      actionLabel: string;
      targetChatId: string | null;
    } | null;
    recovery: {
      title: string;
      body: string;
      actionLabel: string;
      secondaryLabel: string | null;
    } | null;
    leadIntent: {
      intentId: string;
      rawText: string;
      status: string;
      requests: {
        pending: number;
        accepted: number;
        rejected: number;
        expired: number;
        cancelled: number;
      };
    } | null;
    topSuggestion: {
      userId: string;
      displayName: string;
      score: number;
      reason: string;
    } | null;
  };
}

export interface ExperienceActivitySummaryResponse {
  generatedAt: string;
  counts: {
    unreadNotifications: number;
    pendingRequests: number;
    activeIntents: number;
    discoverySuggestions: number;
  };
  orderedSections: Array<{
    id:
      | "actionRequired"
      | "updates"
      | "activeIntents"
      | "suggestions"
      | "discoveryHighlights";
    title: string;
    subtitle: string;
    emphasis: "urgent" | "active" | "passive";
  }>;
  sections: {
    actionRequired: Array<{
      id: string;
      kind: "request";
      priority: number;
      eyebrow: string;
      title: string;
      body: string;
      status: string;
      intentId: string | null;
      createdAt: string | Date;
      cardSummary: {
        who?: string;
        what?: string;
        when?: string;
      } | null;
    }>;
    updates: Array<{
      id: string;
      kind: "notification";
      priority: number;
      eyebrow: string;
      title: string;
      body: string;
      type: string;
      channel: string;
      isRead: boolean;
      createdAt: string;
    }>;
    activeIntents: Array<{
      intentId: string;
      priority: number;
      eyebrow: string;
      title: string;
      body: string;
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
    }>;
    suggestions: Array<{
      id: string;
      priority: number;
      eyebrow: string;
      title: string;
      body: string;
      score: number;
      scoreLabel: string;
    }>;
    discoveryHighlights: Array<{
      id: string;
      priority: number;
      eyebrow: string;
      title: string;
      body: string;
    }>;
    discoverySnapshot: {
      tonightCount: number;
      groupCount: number;
      reconnectCount: number;
    };
  };
}

export interface ExperienceBootstrapSummaryResponse {
  generatedAt: string;
  home: ExperienceHomeSummaryResponse;
  activity: {
    counts: ExperienceActivitySummaryResponse["counts"];
  };
}

export interface UserIntentExplanation {
  intentId: string;
  status: string;
  summary: string;
  factors: string[];
}

export interface IntentMutationResult {
  intentId: string;
  status: string;
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

export interface TopicSuggestionRecord {
  label: string;
  count: number;
  score: number;
}

export interface OnboardingInferenceFieldMeta {
  source: "voice" | "manual" | "inferred";
  confidence: number;
  needsConfirmation: boolean;
}

export interface OnboardingInferenceResult {
  transcript: string;
  interests: string[];
  goals: string[];
  mode: "social" | "dating" | "both";
  format: "one_to_one" | "small_groups" | "both";
  style: "Chill" | "Spontaneous" | "Planned" | "Focused" | "Outgoing";
  availability: "Right now" | "Evenings" | "Weekends" | "Flexible";
  area: string;
  country: string;
  summary: string;
  persona: string;
  firstIntent: string;
  followUpQuestion?: string;
  inferenceMeta: {
    goals: OnboardingInferenceFieldMeta;
    interests: OnboardingInferenceFieldMeta;
    format: OnboardingInferenceFieldMeta;
    mode: OnboardingInferenceFieldMeta;
    style: OnboardingInferenceFieldMeta;
    availability: OnboardingInferenceFieldMeta;
    location: OnboardingInferenceFieldMeta;
    firstIntent: OnboardingInferenceFieldMeta;
    persona: OnboardingInferenceFieldMeta;
  };
}

export interface OnboardingQuickInferenceResult {
  transcript: string;
  interests: string[];
  goals: string[];
  summary: string;
  firstIntent: string;
  followUpQuestion?: string;
}

export interface OnboardingActivationPlanResponse {
  state: "idle" | "pending" | "ready" | "failed";
  source: "llm" | "fallback";
  summary: string;
  idempotencyKey: string;
  activationFingerprint: string;
  recommendedAction: {
    kind: "agent_thread_seed" | "intent_create";
    label: string;
    text: string;
  };
}

export interface OnboardingActivationBootstrapResponse {
  onboardingState: string;
  activation: OnboardingActivationPlanResponse;
  primaryThread: {
    id: string;
    title: string | null;
    createdAt: string;
  } | null;
  discovery: {
    tonightCount: number;
    reconnectCount: number;
    groupCount: number;
    activeIntentCount: number;
    topTonight: Array<{
      userId: string;
      displayName: string;
      reason: string;
      score: number;
    }>;
    inboxSuggestions: Array<{
      title: string;
      reason: string;
      score: number;
    }>;
  };
  execution: {
    scope: "intent.create_from_agent";
    idempotencyKey: string;
    status: "idle" | "processing" | "completed" | "failed";
    hasCachedResponse: boolean;
    cachedResponse: {
      threadId?: string | null;
      intentId?: string | null;
      status?: string | null;
      intentCount?: number | null;
    } | null;
  };
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

const protocolClient: any = createProtocolClient({
  request: (path, init) => fetch(`${API_BASE_URL}${path}`, init),
});

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
    const currentSession = await loadStoredSession();
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
      throw new ApiRequestError({
        message:
          envelope.error?.message ?? "Could not refresh authenticated session.",
        code: envelope.error?.code ?? "auth_refresh_failed",
        statusCode: response.status,
        transient: shouldRetryStatus(response.status),
      });
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
      if (isRetryableApiError(error)) {
        throw error;
      }
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
  requestOptions?: RequestOptions,
): Promise<T> {
  const pathWithQuery = buildPathWithQuery(path, query);
  const doRequest = (token?: string) =>
    fetch(`${API_BASE_URL}${pathWithQuery}`, {
      method,
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(requestOptions?.headers ?? {}),
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
    } catch (error) {
      if (isRetryableApiError(error)) {
        throw error;
      }
      throw new ApiRequestError({
        message: "Session expired. Sign in again.",
        code: "auth_expired",
        statusCode: 401,
      });
    }
  }

  const envelope = await readEnvelope<T>(response);
  if (!response.ok || !envelope.success || envelope.data == null) {
    throw toApiRequestError(envelope, method, pathWithQuery, response);
  }

  return envelope.data;
}

async function requestNullable<T>(
  method: HttpMethod,
  path: string,
  accessToken?: string,
  query?: Record<string, RequestQueryValue>,
  requestOptions?: RequestOptions,
): Promise<T | null> {
  const pathWithQuery = buildPathWithQuery(path, query);
  const doRequest = (token?: string) =>
    fetch(`${API_BASE_URL}${pathWithQuery}`, {
      method,
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(requestOptions?.headers ?? {}),
      },
      signal: requestOptions?.signal,
    });

  let response = await performRequestWithRetry(
    "GET",
    () => doRequest(accessToken),
    requestOptions?.signal,
    requestOptions?.retryMode,
  );
  if (response.status === 401 && accessToken) {
    try {
      const refreshed = await refreshSessionTokens();
      response = await performRequestWithRetry(
        "GET",
        () => doRequest(refreshed.accessToken),
        requestOptions?.signal,
        requestOptions?.retryMode,
      );
    } catch (error) {
      if (isRetryableApiError(error)) {
        throw error;
      }
      throw new ApiRequestError({
        message: "Session expired. Sign in again.",
        code: "auth_expired",
        statusCode: 401,
      });
    }
  }

  const envelope = await readEnvelope<T | null>(response);
  if (!response.ok || !envelope.success) {
    throw toApiRequestError(envelope, method, pathWithQuery, response);
  }

  return envelope.data ?? null;
}

async function fetchChatThreadMessages(
  chatId: string,
  accessToken?: string,
  options?: { maxPages?: number; pageSize?: number },
) {
  const maxPages = Math.max(options?.maxPages ?? 6, 1);
  const pageSize = Math.max(options?.pageSize ?? 100, 1);
  const messages: ChatMessageRecord[] = [];
  let before: string | undefined;

  for (let index = 0; index < maxPages; index += 1) {
    const page = await api.listChatMessages(chatId, accessToken, {
      before,
      limit: pageSize,
    });
    if (page.length === 0) {
      break;
    }

    messages.push(...page);
    before = page.at(-1)?.createdAt;

    if (!before) {
      break;
    }
  }

  return messages;
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
      displayName?: string;
      bio?: string;
      city?: string;
      country?: string;
      visibility?: "public" | "limited" | "private";
    },
    accessToken?: string,
    options?: { idempotencyKey?: string },
  ) {
    return request(
      "PUT",
      `/profiles/${userId}`,
      payload,
      accessToken,
      undefined,
      {
        ...(options?.idempotencyKey
          ? { headers: { "idempotency-key": options.idempotencyKey } }
          : {}),
      },
    );
  },
  createProfilePhotoUploadIntent(
    userId: string,
    payload: {
      fileName: string;
      mimeType: "image/jpeg" | "image/png" | "image/webp";
      byteSize: number;
    },
    accessToken?: string,
  ) {
    return request<ProfilePhotoUploadIntentResult>(
      "POST",
      `/profiles/${userId}/photos/upload-intent`,
      payload,
      accessToken,
    );
  },
  completeProfilePhotoUpload(
    userId: string,
    imageId: string,
    payload: {
      uploadToken: string;
      byteSize: number;
      width?: number;
      height?: number;
    },
    accessToken?: string,
  ) {
    return request(
      "POST",
      `/profiles/${userId}/photos/${imageId}/complete`,
      payload,
      accessToken,
    );
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
  getTopicSuggestions(
    userId: string,
    q: string,
    limit = 12,
    accessToken?: string,
  ) {
    return request<TopicSuggestionRecord[]>(
      "GET",
      `/search/${userId}/topic-suggestions?q=${encodeURIComponent(q)}&limit=${limit}`,
      undefined,
      accessToken,
    );
  },
  inferOnboarding(userId: string, transcript: string, accessToken?: string) {
    return request<OnboardingInferenceResult>(
      "POST",
      "/onboarding/infer",
      { userId, transcript },
      accessToken,
    );
  },
  inferOnboardingQuick(
    userId: string,
    transcript: string,
    accessToken?: string,
  ) {
    return request<OnboardingQuickInferenceResult>(
      "POST",
      "/onboarding/infer-fast",
      { userId, transcript },
      accessToken,
    );
  },
  createOnboardingActivationPlan(
    userId: string,
    payload: {
      firstIntentText?: string;
      summary?: string;
      persona?: string;
      goals?: string[];
      interests?: string[];
      city?: string;
      country?: string;
      socialMode?: "one_to_one" | "group" | "either";
    },
    accessToken?: string,
  ) {
    return request<OnboardingActivationPlanResponse>(
      "POST",
      "/onboarding/activation-plan",
      { userId, ...payload },
      accessToken,
    );
  },
  createOnboardingActivationBootstrap(
    userId: string,
    payload: {
      firstIntentText?: string;
      summary?: string;
      persona?: string;
      goals?: string[];
      interests?: string[];
      city?: string;
      country?: string;
      socialMode?: "one_to_one" | "group" | "either";
      limit?: number;
    },
    accessToken?: string,
  ) {
    return request<OnboardingActivationBootstrapResponse>(
      "POST",
      "/onboarding/activation-bootstrap",
      { userId, ...payload },
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
      countryPreferences: string[];
      requireVerifiedUsers: boolean;
      notificationMode: "immediate" | "digest" | "quiet";
      agentAutonomy: "manual" | "suggest_only" | "auto_non_risky";
      memoryMode: "minimal" | "standard" | "extended";
    },
    accessToken?: string,
    options?: { idempotencyKey?: string },
  ) {
    return request(
      "PUT",
      `/personalization/${userId}/rules/global`,
      payload,
      accessToken,
      undefined,
      {
        ...(options?.idempotencyKey
          ? { headers: { "idempotency-key": options.idempotencyKey } }
          : {}),
      },
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
    options?: {
      signal?: AbortSignal;
      agentThreadId?: string;
      idempotencyKey?: string;
    },
  ) {
    return request<Record<string, unknown>>(
      "POST",
      "/intents",
      {
        userId,
        rawText,
        ...(options?.agentThreadId
          ? { agentThreadId: options.agentThreadId }
          : {}),
      },
      accessToken,
      undefined,
      {
        signal: options?.signal,
        ...(options?.idempotencyKey
          ? { headers: { "idempotency-key": options.idempotencyKey } }
          : {}),
      },
    );
  },
  createIntentFromAgentMessage(
    threadId: string,
    userId: string,
    content: string,
    accessToken?: string,
    options?: {
      allowDecomposition?: boolean;
      maxIntents?: number;
      idempotencyKey?: string;
    },
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
      undefined,
      {
        ...(options?.idempotencyKey
          ? { headers: { "idempotency-key": options.idempotencyKey } }
          : {}),
      },
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
    fetchOptions?: { signal?: AbortSignal; idempotencyKey?: string },
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
      {
        signal: fetchOptions?.signal,
        ...(fetchOptions?.idempotencyKey
          ? { headers: { "idempotency-key": fetchOptions.idempotencyKey } }
          : {}),
      },
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
      idempotencyKey?: string;
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
      {
        signal: options?.signal,
        ...(options?.idempotencyKey
          ? { headers: { "idempotency-key": options.idempotencyKey } }
          : {}),
      },
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
  getExperienceHomeSummary(userId: string, accessToken?: string) {
    return request<ExperienceHomeSummaryResponse>(
      "GET",
      `/experience/${userId}/home-summary`,
      undefined,
      accessToken,
    );
  },
  getExperienceBootstrapSummary(userId: string, accessToken?: string) {
    return request<ExperienceBootstrapSummaryResponse>(
      "GET",
      `/experience/${userId}/bootstrap`,
      undefined,
      accessToken,
    );
  },
  getExperienceActivitySummary(userId: string, accessToken?: string) {
    return request<ExperienceActivitySummaryResponse>(
      "GET",
      `/experience/${userId}/activity-summary`,
      undefined,
      accessToken,
    );
  },
  getProtocolManifest() {
    return protocolClient.getManifest();
  },
  getProtocolDiscovery() {
    return protocolClient.getDiscovery();
  },
  listProtocolApps() {
    return protocolClient.listApps();
  },
  getProtocolApp(appId: string) {
    return protocolClient.getApp(appId);
  },
  registerProtocolApp(input: ProtocolAppRegistrationRequestInput) {
    return protocolClient.registerApp(input);
  },
  listProtocolWebhooks(appId: string, appToken: string) {
    return protocolClient.listWebhooks(appId, appToken);
  },
  createProtocolWebhook(
    appId: string,
    appToken: string,
    payload: Parameters<typeof protocolClient.createWebhook>[2],
  ) {
    return protocolClient.createWebhook(appId, appToken, payload);
  },
  listProtocolGrants(appId: string, appToken: string) {
    return protocolClient.listGrants(appId, appToken);
  },
  createProtocolGrant(
    appId: string,
    appToken: string,
    payload: Parameters<typeof protocolClient.createGrant>[2],
  ) {
    return protocolClient.createGrant(appId, appToken, payload);
  },
  revokeProtocolGrant(
    appId: string,
    appToken: string,
    grantId: string,
    input?: Parameters<typeof protocolClient.revokeGrant>[3],
  ) {
    return protocolClient.revokeGrant(appId, appToken, grantId, input);
  },
  rotateProtocolAppToken(
    appId: string,
    appToken: string,
    input?: Parameters<typeof protocolClient.rotateAppToken>[2],
  ) {
    return protocolClient.rotateAppToken(appId, appToken, input);
  },
  revokeProtocolAppToken(
    appId: string,
    appToken: string,
    input?: Parameters<typeof protocolClient.revokeAppToken>[2],
  ) {
    return protocolClient.revokeAppToken(appId, appToken, input);
  },
  listProtocolWebhookDeliveries(
    appId: string,
    appToken: string,
    subscriptionId: string,
  ) {
    return protocolClient.listWebhookDeliveries(
      appId,
      appToken,
      subscriptionId,
    );
  },
  inspectProtocolDeliveryQueue(
    appId: string,
    appToken: string,
    cursor?: string,
  ) {
    return protocolClient.inspectDeliveryQueue(appId, appToken, cursor);
  },
  replayProtocolEvents(appId: string, appToken: string, cursor?: string) {
    return protocolClient.replayEvents(appId, appToken, cursor);
  },
  getProtocolReplayCursor(appId: string, appToken: string) {
    return protocolClient.getReplayCursor(appId, appToken);
  },
  saveProtocolReplayCursor(appId: string, appToken: string, cursor: string) {
    return protocolClient.saveReplayCursor(appId, appToken, cursor);
  },
  buildProtocolAppRegistrationRequest(
    input: ProtocolAppRegistrationRequestInput,
  ) {
    return buildProtocolAppRegistrationRequest(input);
  },
  getUserIntentExplanation(intentId: string, accessToken?: string) {
    return request<UserIntentExplanation>(
      "GET",
      `/intents/${intentId}/explanations/user`,
      undefined,
      accessToken,
    );
  },
  cancelIntent(
    intentId: string,
    userId: string,
    accessToken?: string,
    options?: { agentThreadId?: string },
  ) {
    return request<IntentMutationResult>(
      "POST",
      `/intents/${intentId}/cancel`,
      {
        userId,
        ...(options?.agentThreadId
          ? { agentThreadId: options.agentThreadId }
          : {}),
      },
      accessToken,
    );
  },
  retryIntent(
    intentId: string,
    accessToken?: string,
    options?: { agentThreadId?: string },
  ) {
    return request<IntentMutationResult>(
      "POST",
      `/intents/${intentId}/retry`,
      {
        ...(options?.agentThreadId
          ? { agentThreadId: options.agentThreadId }
          : {}),
      },
      accessToken,
    );
  },
  widenIntent(
    intentId: string,
    accessToken?: string,
    options?: { agentThreadId?: string },
  ) {
    return request<IntentMutationResult>(
      "POST",
      `/intents/${intentId}/widen`,
      {
        ...(options?.agentThreadId
          ? { agentThreadId: options.agentThreadId }
          : {}),
      },
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
  pauseScheduledTask(taskId: string, accessToken?: string) {
    return request<ScheduledTaskRecord>(
      "POST",
      `/scheduled-tasks/${taskId}/pause`,
      {},
      accessToken,
    );
  },
  resumeScheduledTask(taskId: string, accessToken?: string) {
    return request<ScheduledTaskRecord>(
      "POST",
      `/scheduled-tasks/${taskId}/resume`,
      {},
      accessToken,
    );
  },
  archiveScheduledTask(taskId: string, accessToken?: string) {
    return request<ScheduledTaskRecord>(
      "DELETE",
      `/scheduled-tasks/${taskId}`,
      undefined,
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
  listChats(accessToken?: string) {
    return request<ChatListItemRecord[]>(
      "GET",
      "/chats",
      undefined,
      accessToken,
    );
  },
  listChatMessages(
    chatId: string,
    accessToken?: string,
    options?: { before?: string; limit?: number },
  ) {
    return request<ChatMessageRecord[]>(
      "GET",
      `/chats/${chatId}/messages`,
      undefined,
      accessToken,
      {
        before: options?.before,
        limit: options?.limit,
      },
    );
  },
  async getChatThreadSummaries(
    chatId: string,
    accessToken?: string,
    options?: { maxPages?: number; pageSize?: number },
  ): Promise<ChatThreadSummaryRecord[]> {
    const messages = await fetchChatThreadMessages(
      chatId,
      accessToken,
      options,
    );
    return buildChatThreadSummaries(messages);
  },
  async getChatThreadDetail(
    chatId: string,
    rootMessageId: string,
    accessToken?: string,
    options?: { maxPages?: number; pageSize?: number },
  ): Promise<ChatThreadDetailResponse | null> {
    const messages = await fetchChatThreadMessages(
      chatId,
      accessToken,
      options,
    );
    return buildChatThreadDetail(messages, rootMessageId, chatId);
  },
  getChatMetadata(chatId: string, accessToken?: string) {
    return request<ChatMetadataRecord>(
      "GET",
      `/chats/${chatId}/metadata`,
      undefined,
      accessToken,
    );
  },
  listChatThreads(chatId: string, accessToken?: string) {
    return this.getChatThreadSummaries(chatId, accessToken).then((threads) => ({
      chatId,
      threads,
    }));
  },
  getChatThread(chatId: string, rootMessageId: string, accessToken?: string) {
    return this.getChatThreadDetail(chatId, rootMessageId, accessToken).then(
      (thread) => {
        if (!thread) {
          throw new ApiRequestError({
            message: "Thread not found.",
            code: "not_found",
            statusCode: 404,
          });
        }
        return thread;
      },
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
    options?: { clientMessageId?: string; replyToMessageId?: string },
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
        ...(options?.replyToMessageId
          ? { replyToMessageId: options.replyToMessageId }
          : {}),
      },
      accessToken,
    );
  },
  createChatMessageReaction(
    chatId: string,
    messageId: string,
    userId: string,
    emoji: string,
    accessToken?: string,
  ) {
    return request<ChatMessageReactionRecord>(
      "POST",
      `/chats/${chatId}/messages/${messageId}/reactions`,
      {
        userId,
        emoji,
      },
      accessToken,
    );
  },
  markChatMessageRead(
    chatId: string,
    messageId: string,
    userId: string,
    accessToken?: string,
  ) {
    return request<Record<string, unknown>>(
      "POST",
      `/chats/${chatId}/messages/${messageId}/read`,
      {
        userId,
      },
      accessToken,
    );
  },
  softDeleteChatMessage(
    chatId: string,
    messageId: string,
    userId: string,
    accessToken?: string,
  ) {
    return request<ChatMessageRecord>(
      "POST",
      `/chats/${chatId}/messages/${messageId}/soft-delete`,
      {
        userId,
      },
      accessToken,
    );
  },
  editChatMessage(
    chatId: string,
    messageId: string,
    userId: string,
    body: string,
    accessToken?: string,
  ) {
    return request<ChatMessageRecord>(
      "PATCH",
      `/chats/${chatId}/messages/${messageId}/edit`,
      {
        userId,
        body,
      },
      accessToken,
    );
  },
};
