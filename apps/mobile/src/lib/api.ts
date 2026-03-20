import Constants from "expo-constants";
import { Platform } from "react-native";

type HttpMethod = "GET" | "POST" | "PUT" | "PATCH";
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

export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL ?? expoLanBase ?? LOCAL_API_BASE;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseEnvelope<T>(payload: unknown): ApiEnvelope<T> {
  if (!isRecord(payload) || typeof payload.success !== "boolean") {
    throw new Error("Invalid API envelope");
  }

  return payload as unknown as ApiEnvelope<T>;
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
  const response = await fetch(`${API_BASE_URL}${pathWithQuery}`, {
    method,
    headers: {
      "content-type": "application/json",
      ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: fetchOptions?.signal,
  });

  const raw = (await response.json()) as unknown;
  const envelope = parseEnvelope<T>(raw);
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
  const response = await fetch(`${API_BASE_URL}${pathWithQuery}`, {
    method,
    headers: {
      "content-type": "application/json",
      ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
    },
  });

  const raw = (await response.json()) as unknown;
  const envelope = parseEnvelope<T | null>(raw);
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
}

export interface AgenticTurnResult {
  traceId: string;
  userMessageId: string;
  agentMessageId: string;
  plan: Record<string, unknown>;
  toolResults: unknown[];
  specialistNotes: unknown[];
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
  sendDigest(userId: string, accessToken?: string) {
    return request<Record<string, unknown>>(
      "POST",
      `/notifications/${userId}/digest`,
      {},
      accessToken,
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
