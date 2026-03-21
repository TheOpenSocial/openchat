"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { AdminShell } from "./components/AdminShell";
import { AdminSignIn } from "./components/AdminSignIn";
import { AppLoading } from "./components/AppLoading";
import { JsonView } from "./components/JsonView";
import { Notice } from "./components/Notice";
import { Panel } from "./components/Panel";
import {
  clearAdminSession,
  clearLegacyAdminApiKeyStorage,
  loadAdminSession,
  type AdminSession,
} from "./lib/admin-session";
import {
  adminButtonClass,
  adminButtonDangerClass,
  adminButtonGhostClass,
  adminInputClass,
  adminLabelClass,
} from "./lib/admin-ui";
import { type AppLocale, supportedLocales, t } from "./lib/i18n";
import {
  apiRequest,
  apiRequestNullable,
  buildApiUrl,
  configureAdminApiAuthLifecycle,
  fetchGoogleOAuthStartUrl,
  type HttpMethod,
} from "./lib/api";

type AdminTab =
  | "overview"
  | "users"
  | "intents"
  | "chats"
  | "moderation"
  | "personalization"
  | "agent";

interface Banner {
  tone: "info" | "error" | "success";
  text: string;
}

interface DeadLetterRow {
  id: string;
  queueName: string;
  jobName: string;
  attempts: number;
  lastError: string;
  createdAt: string;
}

interface StreamEventRow {
  id: string;
  at: string;
  kind: string;
  payload: unknown;
}

interface DebugHistoryRow {
  id: string;
  at: string;
  method: HttpMethod;
  path: string;
  success: boolean;
}

interface ModerationFlagRow {
  id: string;
  entityType: string;
  entityId: string;
  reason: string;
  status: string;
  assigneeUserId?: string | null;
  assignmentNote?: string | null;
  assignedAt?: string | null;
  lastDecision?: string | null;
  triageNote?: string | null;
  triagedByAdminUserId?: string | null;
  triagedAt?: string | null;
  createdAt: string;
  latestRiskAudit?: {
    id: string;
    metadata: unknown;
    createdAt: string;
  } | null;
  latestAssignment?: {
    id: string;
    metadata: unknown;
    createdAt: string;
  } | null;
}

interface ModerationReportRow {
  id: string;
  reporterUserId: string;
  targetUserId: string | null;
  reason: string;
  status: string;
  createdAt: string;
}

interface ModerationSummarySnapshot {
  generatedAt: string;
  queue: {
    openFlags: number;
    agentRiskOpenFlags: number;
    reportsOpen: number;
  };
  actions24h: {
    reports24h: number;
    resolvedFlags24h: number;
    dismissedFlags24h: number;
  };
  enforcement: {
    blockedProfiles: number;
    suspendedUsers: number;
  };
  analytics: {
    avgTimeToAssignmentMinutes: number | null;
    avgTimeToDecisionMinutes: number | null;
    dismissalRate24h: number;
    repeatOffenders24h: number;
    topReasons: Array<{ reason: string; count: number }>;
  };
  recent: {
    flags: ModerationFlagRow[];
    reports: ModerationReportRow[];
  };
}

interface ModerationSettingsSnapshot {
  provider: string;
  keys: {
    moderationProviderConfigured: boolean;
    openaiConfigured: boolean;
    customProviderConfigured: boolean;
  };
  toggles: {
    agentRiskEnabled: boolean;
    autoBlockTermsEnabled: boolean;
    strictMediaReview: boolean;
    userReportsEnabled: boolean;
  };
  thresholds: {
    moderationBacklogAlert: number;
    dbLatencyAlertMs: number;
    openAiErrorRateAlert: number;
  };
  policyModes: {
    agentBlockedDecisionLabel: string;
    agentReviewDecisionLabel: string;
  };
  surfaces: {
    profilePhotos: boolean;
    chatMessages: boolean;
    intents: boolean;
    agentThreads: boolean;
  };
}

const DEFAULT_UUID = "00000000-0000-0000-0000-000000000000";
const STREAM_EVENT_LIMIT = 60;
const DEBUG_HISTORY_LIMIT = 20;
const ADMIN_LOCALE_STORAGE_KEY = "opensocial.admin.locale.v1";

const tabConfig: Array<{ id: AdminTab; label: string; subtitle: string }> = [
  {
    id: "overview",
    label: "Overview",
    subtitle:
      "Queue controls, health, dead-letter replay, and debug query helper",
  },
  {
    id: "users",
    label: "Users",
    subtitle: "Profile, trust, rules, sessions, inbox, and digest",
  },
  {
    id: "intents",
    label: "Intents",
    subtitle: "Inspect explanations and run follow-up superpowers",
  },
  {
    id: "chats",
    label: "Chats",
    subtitle: "Inspect metadata/sync and run stuck-flow repair actions",
  },
  {
    id: "moderation",
    label: "Moderation",
    subtitle:
      "Reports, blocks, queue, agent-thread risk flags (triage / assign)",
  },
  {
    id: "personalization",
    label: "Personalization",
    subtitle: "Inspect life graph and explain policy decisions",
  },
  {
    id: "agent",
    label: "Agent",
    subtitle: "Inspect thread traces with live SSE stream viewer",
  },
];

function errorText(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function parseRecordJsonInput(
  label: string,
  raw: string,
  allowEmpty = true,
): Record<string, unknown> | undefined {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    if (allowEmpty) {
      return undefined;
    }
    throw new Error(`${label} cannot be empty.`);
  }

  const parsed = JSON.parse(trimmed) as unknown;
  if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
    return parsed as Record<string, unknown>;
  }

  throw new Error(`${label} must be a JSON object.`);
}

function parseContextInput(raw: string): Record<string, unknown> | undefined {
  return parseRecordJsonInput("Policy context", raw);
}

function normalizeQueryValues(
  record: Record<string, unknown> | undefined,
): Record<string, string | number | boolean | undefined> | undefined {
  if (!record) {
    return undefined;
  }

  const normalized: Record<string, string | number | boolean | undefined> = {};
  for (const [key, value] of Object.entries(record)) {
    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean" ||
      value === undefined
    ) {
      normalized[key] = value;
      continue;
    }

    if (value === null) {
      normalized[key] = "null";
      continue;
    }

    normalized[key] = JSON.stringify(value);
  }

  return normalized;
}

function tabSubtitle(tab: AdminTab) {
  return tabConfig.find((entry) => entry.id === tab)?.subtitle ?? "";
}

function safeJsonParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function createHistoryId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function AdminHome() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [locale, setLocale] = useState<AppLocale>("en");
  const [sessionHydrated, setSessionHydrated] = useState(false);
  const [signedInSession, setSignedInSession] = useState<AdminSession | null>(
    null,
  );
  const [signInError, setSignInError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<AdminTab>("overview");
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [banner, setBanner] = useState<Banner | null>(null);

  const [health, setHealth] = useState("checking...");
  const [relayCount, setRelayCount] = useState<number | null>(null);
  const [deadLetters, setDeadLetters] = useState<DeadLetterRow[]>([]);
  const [adminUserId, setAdminUserId] = useState(DEFAULT_UUID);
  const [adminRole, setAdminRole] = useState<"admin" | "support" | "moderator">(
    "admin",
  );

  const [userId, setUserId] = useState(DEFAULT_UUID);
  const [intentId, setIntentId] = useState("");
  const [chatId, setChatId] = useState("");
  const [threadId, setThreadId] = useState("");
  const [revokeSessionId, setRevokeSessionId] = useState("");

  const [actingUserId, setActingUserId] = useState(DEFAULT_UUID);
  const [messageId, setMessageId] = useState("");
  const [moderatorUserId, setModeratorUserId] = useState(DEFAULT_UUID);
  const [hideReason, setHideReason] = useState("policy violation");
  const [syncAfter, setSyncAfter] = useState("");
  const [groupSizeTarget, setGroupSizeTarget] = useState(3);

  const [reporterUserId, setReporterUserId] = useState(DEFAULT_UUID);
  const [targetUserId, setTargetUserId] = useState(DEFAULT_UUID);
  const [reportReason, setReportReason] = useState("abuse");
  const [reportDetails, setReportDetails] = useState("");
  const [blockerUserId, setBlockerUserId] = useState(DEFAULT_UUID);
  const [blockedUserId, setBlockedUserId] = useState(DEFAULT_UUID);

  const [policyContextInput, setPolicyContextInput] = useState(
    '{"surface":"admin","source":"manual"}',
  );
  const [policyFlags, setPolicyFlags] = useState({
    safetyAllowed: true,
    hardRuleAllowed: true,
    productPolicyAllowed: true,
    overrideAllowed: true,
    learnedPreferenceAllowed: true,
    rankingAllowed: true,
  });

  const [agentMessage, setAgentMessage] = useState("Manual admin trace ping");

  const [debugMethod, setDebugMethod] = useState<HttpMethod>("GET");
  const [debugPath, setDebugPath] = useState("/admin/health");
  const [debugQueryInput, setDebugQueryInput] = useState("{}");
  const [debugBodyInput, setDebugBodyInput] = useState("{}");
  const [debugResponse, setDebugResponse] = useState<unknown>(null);
  const [debugHistory, setDebugHistory] = useState<DebugHistoryRow[]>([]);

  const [streamStatus, setStreamStatus] = useState<
    "idle" | "connecting" | "live" | "error"
  >("idle");
  const [streamEvents, setStreamEvents] = useState<StreamEventRow[]>([]);
  const streamRef = useRef<EventSource | null>(null);

  const [profileSnapshot, setProfileSnapshot] = useState<unknown>(null);
  const [trustSnapshot, setTrustSnapshot] = useState<unknown>(null);
  const [ruleSnapshot, setRuleSnapshot] = useState<unknown>(null);
  const [interestSnapshot, setInterestSnapshot] = useState<unknown>(null);
  const [topicSnapshot, setTopicSnapshot] = useState<unknown>(null);
  const [availabilitySnapshot, setAvailabilitySnapshot] =
    useState<unknown>(null);
  const [photoSnapshot, setPhotoSnapshot] = useState<unknown>(null);
  const [sessionSnapshot, setSessionSnapshot] = useState<unknown>(null);
  const [inboxSnapshot, setInboxSnapshot] = useState<unknown>(null);
  const [recurringCircleSnapshot, setRecurringCircleSnapshot] =
    useState<unknown>(null);
  const [recurringCircleSessionSnapshot, setRecurringCircleSessionSnapshot] =
    useState<unknown>(null);
  const [savedSearchSnapshot, setSavedSearchSnapshot] = useState<unknown>(null);
  const [scheduledTaskSnapshot, setScheduledTaskSnapshot] =
    useState<unknown>(null);
  const [scheduledTaskRunsSnapshot, setScheduledTaskRunsSnapshot] =
    useState<unknown>(null);
  const [discoveryPassiveSnapshot, setDiscoveryPassiveSnapshot] =
    useState<unknown>(null);
  const [discoveryInboxSnapshot, setDiscoveryInboxSnapshot] =
    useState<unknown>(null);
  const [pendingIntentSummarySnapshot, setPendingIntentSummarySnapshot] =
    useState<unknown>(null);
  const [continuityIntentExplainSnapshot, setContinuityIntentExplainSnapshot] =
    useState<unknown>(null);
  const [searchQuery, setSearchQuery] = useState("tennis");
  const [searchSnapshot, setSearchSnapshot] = useState<unknown>(null);

  const [intentExplainSnapshot, setIntentExplainSnapshot] =
    useState<unknown>(null);
  const [intentUserExplainSnapshot, setIntentUserExplainSnapshot] =
    useState<unknown>(null);
  const [intentActionSnapshot, setIntentActionSnapshot] =
    useState<unknown>(null);

  const [chatMessagesSnapshot, setChatMessagesSnapshot] =
    useState<unknown>(null);
  const [chatMetadataSnapshot, setChatMetadataSnapshot] =
    useState<unknown>(null);
  const [chatSyncSnapshot, setChatSyncSnapshot] = useState<unknown>(null);

  const [moderationSnapshot, setModerationSnapshot] = useState<unknown>(null);
  const [moderationSummarySnapshot, setModerationSummarySnapshot] =
    useState<ModerationSummarySnapshot | null>(null);
  const [moderationSettingsSnapshot, setModerationSettingsSnapshot] =
    useState<ModerationSettingsSnapshot | null>(null);
  const [moderationQueueSnapshot, setModerationQueueSnapshot] =
    useState<unknown>(null);
  const [auditLogSnapshot, setAuditLogSnapshot] = useState<unknown>(null);
  const [moderationQueueLimit, setModerationQueueLimit] = useState(100);
  const [moderationQueueStatusQuery, setModerationQueueStatusQuery] = useState<
    "open" | "resolved" | "dismissed"
  >("open");
  const [moderationQueueEntityTypeQuery, setModerationQueueEntityTypeQuery] =
    useState("");
  const [moderationQueueReasonQuery, setModerationQueueReasonQuery] =
    useState("");
  const [auditLogLimit, setAuditLogLimit] = useState(100);
  const [agentRiskSnapshot, setAgentRiskSnapshot] = useState<unknown>(null);
  const [agentRiskLimit, setAgentRiskLimit] = useState(50);
  const [agentRiskStatusQuery, setAgentRiskStatusQuery] = useState<
    "open" | "resolved" | "dismissed"
  >("open");
  const [agentRiskDecisionQuery, setAgentRiskDecisionQuery] = useState("");
  const [triageFlagId, setTriageFlagId] = useState("");
  const [triageAction, setTriageAction] = useState<
    "resolve" | "reopen" | "escalate_strike" | "restrict_user"
  >("resolve");
  const [triageTargetUserId, setTriageTargetUserId] = useState("");
  const [triageReason, setTriageReason] = useState("");
  const [assignFlagId, setAssignFlagId] = useState("");
  const [assigneeUserId, setAssigneeUserId] = useState("");
  const [assignReason, setAssignReason] = useState("");
  const [deactivateReason, setDeactivateReason] =
    useState("support escalation");
  const [restrictReason, setRestrictReason] = useState("safety restriction");
  const [lifeGraphSnapshot, setLifeGraphSnapshot] = useState<unknown>(null);
  const [policyExplainSnapshot, setPolicyExplainSnapshot] =
    useState<unknown>(null);
  const [memoryResetSnapshot, setMemoryResetSnapshot] = useState<unknown>(null);
  const [agentTraceSnapshot, setAgentTraceSnapshot] = useState<unknown>(null);

  useEffect(() => {
    const tab = searchParams.get("tab");
    if (
      tab === "overview" ||
      tab === "users" ||
      tab === "intents" ||
      tab === "chats" ||
      tab === "moderation" ||
      tab === "personalization" ||
      tab === "agent"
    ) {
      setActiveTab(tab);
    }
  }, [searchParams]);

  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    if (params.get("tab") === activeTab) {
      return;
    }
    params.set("tab", activeTab);
    const next = params.toString();
    router.replace(next.length ? `${pathname}?${next}` : pathname, {
      scroll: false,
    });
  }, [activeTab, pathname, router, searchParams]);

  const summary = useMemo(
    () =>
      `health=${health} · deadLetters=${deadLetters.length} · relay=${relayCount ?? "n/a"}`,
    [deadLetters.length, health, relayCount],
  );

  const runAction = async <T,>(
    key: string,
    operation: () => Promise<T>,
    successText: string | ((payload: T) => string),
    onSuccess?: (payload: T) => void,
  ) => {
    setBusyKey(key);
    setBanner(null);

    try {
      const payload = await operation();
      onSuccess?.(payload);
      const text =
        typeof successText === "function" ? successText(payload) : successText;
      setBanner({
        tone: "success",
        text,
      });
      return payload;
    } catch (error) {
      setBanner({
        tone: "error",
        text: `${key} failed: ${errorText(error)}`,
      });
      return null;
    } finally {
      setBusyKey((current) => (current === key ? null : current));
    }
  };

  const adminRequestHeaders = useMemo(
    () => ({
      ...(signedInSession?.accessToken
        ? { authorization: `Bearer ${signedInSession.accessToken}` }
        : {}),
      "x-admin-user-id": adminUserId.trim(),
      "x-admin-role": adminRole,
    }),
    [adminRole, adminUserId, signedInSession?.accessToken],
  );

  const requestApi = <T,>(
    method: HttpMethod,
    path: string,
    options?: {
      body?: Record<string, unknown>;
      query?: Record<string, string | number | boolean | undefined>;
      headers?: Record<string, string>;
    },
  ) =>
    apiRequest<T>(method, path, {
      ...options,
      headers: {
        ...(options?.headers ?? {}),
        ...adminRequestHeaders,
      },
    });

  const requestApiNullable = <T,>(
    method: HttpMethod,
    path: string,
    options?: {
      body?: Record<string, unknown>;
      query?: Record<string, string | number | boolean | undefined>;
      headers?: Record<string, string>;
    },
  ) =>
    apiRequestNullable<T>(method, path, {
      ...options,
      headers: {
        ...(options?.headers ?? {}),
        ...adminRequestHeaders,
      },
    });

  const moderationQueueItems = useMemo(() => {
    if (!Array.isArray(moderationQueueSnapshot)) {
      return [];
    }
    return moderationQueueSnapshot as ModerationFlagRow[];
  }, [moderationQueueSnapshot]);

  const agentRiskItems = useMemo(() => {
    if (
      !agentRiskSnapshot ||
      typeof agentRiskSnapshot !== "object" ||
      !("items" in agentRiskSnapshot) ||
      !Array.isArray((agentRiskSnapshot as { items?: unknown }).items)
    ) {
      return [];
    }
    return (agentRiskSnapshot as { items: ModerationFlagRow[] }).items;
  }, [agentRiskSnapshot]);

  const pushStreamEvent = (kind: string, payload: unknown) => {
    setStreamEvents((current) =>
      [
        {
          id: createHistoryId(),
          at: new Date().toISOString(),
          kind,
          payload,
        },
        ...current,
      ].slice(0, STREAM_EVENT_LIMIT),
    );
  };

  const stopAgentStream = () => {
    streamRef.current?.close();
    streamRef.current = null;
    setStreamStatus("idle");
  };

  const startAgentStream = () => {
    if (!threadId.trim()) {
      setBanner({ tone: "error", text: "Provide a thread id." });
      return;
    }

    const streamToken = signedInSession?.accessToken?.trim();
    if (!streamToken) {
      setBanner({
        tone: "error",
        text: "Sign in again to attach an access token for the live stream.",
      });
      return;
    }

    stopAgentStream();
    setStreamStatus("connecting");

    const source = new EventSource(
      buildApiUrl(`/agent/threads/${threadId.trim()}/stream`, {
        access_token: streamToken,
      }),
    );
    streamRef.current = source;

    source.onopen = () => {
      setStreamStatus("live");
      setBanner({
        tone: "success",
        text: `Live SSE stream connected for thread ${threadId.trim().slice(0, 8)}...`,
      });
    };

    source.onerror = () => {
      setStreamStatus("error");
    };

    source.onmessage = (event) => {
      pushStreamEvent(event.type || "message", safeJsonParse(event.data));
    };

    source.addEventListener("agent.message", (event) => {
      const messageEvent = event as MessageEvent;
      pushStreamEvent("agent.message", safeJsonParse(messageEvent.data));
    });
  };

  useEffect(
    () => () => {
      stopAgentStream();
    },
    [],
  );

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const stored = window.localStorage.getItem(ADMIN_LOCALE_STORAGE_KEY);
    if (stored && supportedLocales.includes(stored as AppLocale)) {
      setLocale(stored as AppLocale);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem(ADMIN_LOCALE_STORAGE_KEY, locale);
  }, [locale]);

  useEffect(() => {
    configureAdminApiAuthLifecycle({
      onSessionRefreshed: (tokens) => {
        setSignedInSession((current) => {
          if (!current) {
            return current;
          }
          return {
            ...current,
            ...tokens,
          };
        });
      },
      onAuthFailure: () => {
        stopAgentStream();
        clearAdminSession();
        setSignedInSession(null);
        setAdminUserId(DEFAULT_UUID);
        setSignInError("Session expired. Sign in again.");
      },
    });

    return () => {
      configureAdminApiAuthLifecycle({});
    };
  }, []);

  const refreshHealth = async () => {
    try {
      const payload = await requestApi<{ service: string; status: string }>(
        "GET",
        "/admin/health",
      );
      setHealth(`${payload.service}:${payload.status}`);
    } catch (error) {
      setHealth(`error:${errorText(error)}`);
    }
  };

  useEffect(() => {
    clearLegacyAdminApiKeyStorage();
    const session = loadAdminSession();
    setSignedInSession(session);
    if (session) {
      setAdminUserId(session.userId);
    }
    setSessionHydrated(true);
  }, []);

  useEffect(() => {
    if (!sessionHydrated || !signedInSession) {
      return;
    }

    refreshHealth().catch(() => {});
    const timer = setInterval(() => {
      refreshHealth().catch(() => {});
    }, 15_000);

    return () => clearInterval(timer);
  }, [sessionHydrated, signedInSession]);

  const loadDeadLetters = () =>
    runAction(
      "Load dead letters",
      () => requestApi<DeadLetterRow[]>("GET", "/admin/jobs/dead-letters"),
      (rows) => `Loaded ${rows.length} dead-letter rows.`,
      (rows) => setDeadLetters(rows),
    );

  const replayDeadLetter = (deadLetterId: string) =>
    runAction(
      "Replay dead letter",
      async () => {
        await requestApi(
          "POST",
          `/admin/jobs/dead-letters/${deadLetterId}/replay`,
          {
            body: {},
          },
        );
        return requestApi<DeadLetterRow[]>("GET", "/admin/jobs/dead-letters");
      },
      "Replay requested and dead-letter list refreshed.",
      (rows) => setDeadLetters(rows),
    );

  const relayOutbox = () =>
    runAction(
      "Relay outbox",
      () =>
        requestApi<{ processedCount: number }>("POST", "/admin/outbox/relay", {
          body: {},
        }),
      (result) => `Outbox relay processed ${result.processedCount} event(s).`,
      (result) => setRelayCount(result.processedCount),
    );

  const inspectUser = () =>
    runAction(
      "Inspect user",
      async () => {
        const id = userId.trim();
        const [
          profile,
          trust,
          rules,
          interests,
          topics,
          windows,
          photos,
          sessions,
          inbox,
          circles,
          savedSearches,
          scheduledTasks,
          discoveryPassive,
          discoveryInbox,
          pendingIntentSummary,
        ] = await Promise.all([
          requestApi("GET", `/profiles/${id}`),
          requestApi("GET", `/profiles/${id}/trust`),
          requestApi("GET", `/personalization/${id}/rules/global`),
          requestApi("GET", `/profiles/${id}/interests`),
          requestApi("GET", `/profiles/${id}/topics`),
          requestApi("GET", `/profiles/${id}/availability-windows`),
          requestApi("GET", `/profiles/${id}/photos`),
          requestApi("GET", `/auth/sessions/${id}`),
          requestApi("GET", `/inbox/requests/${id}`),
          requestApi("GET", `/recurring-circles/${id}`),
          requestApi("GET", `/saved-searches/${id}`),
          requestApi("GET", `/scheduled-tasks/${id}`, {
            query: { limit: 20 },
          }),
          requestApi("GET", `/discovery/${id}/passive`, {
            query: { limit: 3 },
          }),
          requestApi("GET", `/discovery/${id}/inbox-suggestions`, {
            query: { limit: 4 },
          }),
          requestApi("POST", "/intents/summarize-pending", {
            body: {
              userId: id,
              maxIntents: 5,
            },
          }),
        ]);
        const firstCircleId = Array.isArray(circles)
          ? (circles[0] as { id?: string } | undefined)?.id
          : undefined;
        const circleSessions = firstCircleId
          ? await requestApi(
              "GET",
              `/recurring-circles/${firstCircleId}/sessions`,
            )
          : [];
        const firstTaskId = Array.isArray(scheduledTasks)
          ? (scheduledTasks[0] as { id?: string } | undefined)?.id
          : undefined;
        const scheduledTaskRuns = firstTaskId
          ? await requestApi("GET", `/scheduled-tasks/${firstTaskId}/runs`, {
              query: { limit: 10 },
            })
          : [];
        const firstIntentId =
          typeof pendingIntentSummary === "object" &&
          pendingIntentSummary !== null &&
          "intents" in pendingIntentSummary &&
          Array.isArray(
            (pendingIntentSummary as { intents?: unknown[] }).intents,
          )
            ? ((
                pendingIntentSummary as {
                  intents?: Array<{ intentId?: string }>;
                }
              ).intents?.[0]?.intentId ?? null)
            : null;
        const continuityUserExplain = firstIntentId
          ? await requestApi(
              "GET",
              `/intents/${firstIntentId}/explanations/user`,
            ).catch(() => null)
          : null;

        return {
          profile,
          trust,
          rules,
          interests,
          topics,
          windows,
          photos,
          sessions,
          inbox,
          circles,
          circleSessions,
          savedSearches,
          scheduledTasks,
          scheduledTaskRuns,
          discoveryPassive,
          discoveryInbox,
          pendingIntentSummary,
          continuityUserExplain,
        };
      },
      "User snapshots loaded.",
      (payload) => {
        setProfileSnapshot(payload.profile);
        setTrustSnapshot(payload.trust);
        setRuleSnapshot(payload.rules);
        setInterestSnapshot(payload.interests);
        setTopicSnapshot(payload.topics);
        setAvailabilitySnapshot(payload.windows);
        setPhotoSnapshot(payload.photos);
        setSessionSnapshot(payload.sessions);
        setInboxSnapshot(payload.inbox);
        setRecurringCircleSnapshot(payload.circles);
        setRecurringCircleSessionSnapshot(payload.circleSessions);
        setSavedSearchSnapshot(payload.savedSearches);
        setScheduledTaskSnapshot(payload.scheduledTasks);
        setScheduledTaskRunsSnapshot(payload.scheduledTaskRuns);
        setDiscoveryPassiveSnapshot(payload.discoveryPassive);
        setDiscoveryInboxSnapshot(payload.discoveryInbox);
        setPendingIntentSummarySnapshot(payload.pendingIntentSummary);
        setContinuityIntentExplainSnapshot(payload.continuityUserExplain);
      },
    );

  const sendDigest = () =>
    runAction(
      "Send digest",
      () =>
        requestApi("POST", `/notifications/${userId.trim()}/digest`, {
          body: {},
        }),
      "Digest request submitted.",
    );

  const summarizePendingIntents = () =>
    runAction(
      "Summarize pending intents",
      () =>
        requestApi("POST", "/intents/summarize-pending", {
          body: {
            userId: userId.trim(),
          },
        }),
      "Pending intent summary generated.",
      (payload) => setIntentActionSnapshot(payload),
    );

  const runSearch = () =>
    runAction(
      "Run search",
      () =>
        requestApi("GET", `/search/${userId.trim()}`, {
          query: {
            q: searchQuery.trim(),
            limit: 6,
          },
        }),
      "Search snapshot loaded.",
      (payload) => setSearchSnapshot(payload),
    );

  const revokeSession = () => {
    if (!revokeSessionId.trim()) {
      setBanner({ tone: "error", text: "Provide a session id to revoke." });
      return Promise.resolve(null);
    }

    return runAction(
      "Revoke session",
      async () => {
        const revoked = await requestApi(
          "POST",
          `/auth/sessions/${revokeSessionId.trim()}/revoke`,
          {
            body: {
              userId: userId.trim(),
            },
          },
        );
        const sessions = await requestApi(
          "GET",
          `/auth/sessions/${userId.trim()}`,
        );
        return { revoked, sessions };
      },
      "Session revoked and list refreshed.",
      (payload) => setSessionSnapshot(payload.sessions),
    );
  };

  const revokeAllSessions = () =>
    runAction(
      "Revoke all sessions",
      async () => {
        const revoked = await requestApi("POST", "/auth/sessions/revoke-all", {
          body: {
            userId: userId.trim(),
          },
        });
        const sessions = await requestApi(
          "GET",
          `/auth/sessions/${userId.trim()}`,
        );
        return { revoked, sessions };
      },
      "All sessions revoked and list refreshed.",
      (payload) => setSessionSnapshot(payload.sessions),
    );

  const inspectIntent = () => {
    if (!intentId.trim()) {
      setBanner({ tone: "error", text: "Provide an intent id." });
      return Promise.resolve(null);
    }

    return runAction(
      "Inspect intent",
      async () => {
        const [adminExplain, userExplain] = await Promise.all([
          requestApi("GET", `/intents/${intentId.trim()}/explanations`),
          requestApi("GET", `/intents/${intentId.trim()}/explanations/user`),
        ]);

        return { adminExplain, userExplain };
      },
      "Intent explanation snapshots loaded.",
      (payload) => {
        setIntentExplainSnapshot(payload.adminExplain);
        setIntentUserExplainSnapshot(payload.userExplain);
      },
    );
  };

  const cancelIntent = () => {
    if (!intentId.trim()) {
      setBanner({ tone: "error", text: "Provide an intent id." });
      return Promise.resolve(null);
    }

    return runAction(
      "Cancel intent",
      () =>
        requestApi("POST", `/intents/${intentId.trim()}/cancel`, {
          body: {
            userId: userId.trim(),
            ...(threadId.trim() ? { agentThreadId: threadId.trim() } : {}),
          },
        }),
      "Intent cancellation submitted.",
      (payload) => setIntentActionSnapshot(payload),
    );
  };

  const retryIntent = () => {
    if (!intentId.trim()) {
      setBanner({ tone: "error", text: "Provide an intent id." });
      return Promise.resolve(null);
    }

    return runAction(
      "Retry intent",
      () =>
        requestApi("POST", `/intents/${intentId.trim()}/retry`, {
          body: {
            ...(threadId.trim() ? { agentThreadId: threadId.trim() } : {}),
          },
        }),
      "Intent retry job submitted.",
      (payload) => setIntentActionSnapshot(payload),
    );
  };

  const widenIntent = () => {
    if (!intentId.trim()) {
      setBanner({ tone: "error", text: "Provide an intent id." });
      return Promise.resolve(null);
    }

    return runAction(
      "Widen intent",
      () =>
        requestApi("POST", `/intents/${intentId.trim()}/widen`, {
          body: {
            ...(threadId.trim() ? { agentThreadId: threadId.trim() } : {}),
          },
        }),
      "Intent widen job submitted.",
      (payload) => setIntentActionSnapshot(payload),
    );
  };

  const convertIntent = (mode: "group" | "one_to_one") => {
    if (!intentId.trim()) {
      setBanner({ tone: "error", text: "Provide an intent id." });
      return Promise.resolve(null);
    }

    return runAction(
      `Convert intent to ${mode}`,
      () =>
        requestApi("POST", `/intents/${intentId.trim()}/convert`, {
          body:
            mode === "group"
              ? {
                  mode,
                  groupSizeTarget,
                }
              : {
                  mode,
                },
        }),
      `Intent converted to ${mode}.`,
      (payload) => setIntentActionSnapshot(payload),
    );
  };

  const inspectChat = () => {
    if (!chatId.trim()) {
      setBanner({ tone: "error", text: "Provide a chat id." });
      return Promise.resolve(null);
    }

    return runAction(
      "Inspect chat",
      async () => {
        const [messages, metadata] = await Promise.all([
          requestApi("GET", `/chats/${chatId.trim()}/messages`),
          requestApi("GET", `/chats/${chatId.trim()}/metadata`),
        ]);
        return { messages, metadata };
      },
      "Chat messages and metadata loaded.",
      (payload) => {
        setChatMessagesSnapshot(payload.messages);
        setChatMetadataSnapshot(payload.metadata);
      },
    );
  };

  const syncChat = () => {
    if (!chatId.trim()) {
      setBanner({ tone: "error", text: "Provide a chat id." });
      return Promise.resolve(null);
    }

    return runAction(
      "Sync chat",
      () =>
        requestApi("GET", `/chats/${chatId.trim()}/sync`, {
          query: {
            userId: actingUserId.trim(),
            ...(syncAfter.trim() ? { after: syncAfter.trim() } : {}),
          },
        }),
      "Chat sync snapshot loaded.",
      (payload) => setChatSyncSnapshot(payload),
    );
  };

  const leaveChat = () => {
    if (!chatId.trim()) {
      setBanner({ tone: "error", text: "Provide a chat id." });
      return Promise.resolve(null);
    }

    return runAction(
      "Leave chat",
      () =>
        requestApi("POST", `/chats/${chatId.trim()}/leave`, {
          body: {
            userId: actingUserId.trim(),
          },
        }),
      "Leave chat action completed.",
      (payload) => setChatMetadataSnapshot(payload),
    );
  };

  const hideChatMessage = () => {
    if (!chatId.trim() || !messageId.trim()) {
      setBanner({
        tone: "error",
        text: "Provide both chat id and message id.",
      });
      return Promise.resolve(null);
    }

    return runAction(
      "Hide chat message",
      () =>
        requestApi(
          "POST",
          `/chats/${chatId.trim()}/messages/${messageId.trim()}/hide`,
          {
            body: {
              moderatorUserId: moderatorUserId.trim(),
              ...(hideReason.trim() ? { reason: hideReason.trim() } : {}),
            },
          },
        ),
      "Message hidden by moderation.",
      (payload) => setChatMessagesSnapshot(payload),
    );
  };

  const repairChatFlow = () => {
    if (!chatId.trim()) {
      setBanner({ tone: "error", text: "Provide a chat id." });
      return Promise.resolve(null);
    }

    return runAction(
      "Repair chat flow",
      async () => {
        const [metadata, syncSnapshot, relay] = await Promise.all([
          requestApi("GET", `/chats/${chatId.trim()}/metadata`),
          requestApi("GET", `/chats/${chatId.trim()}/sync`, {
            query: {
              userId: actingUserId.trim(),
            },
          }),
          requestApi<{ processedCount: number }>(
            "POST",
            "/admin/outbox/relay",
            {
              body: {},
            },
          ),
        ]);

        return {
          metadata,
          syncSnapshot,
          relay,
        };
      },
      (payload) =>
        `Repair routine complete. Outbox processed ${payload.relay.processedCount} event(s).`,
      (payload) => {
        setChatMetadataSnapshot(payload.metadata);
        setChatSyncSnapshot(payload.syncSnapshot);
        setRelayCount(payload.relay.processedCount);
      },
    );
  };

  const createReport = () =>
    runAction(
      "Create report",
      () =>
        requestApi("POST", "/moderation/reports", {
          body: {
            reporterUserId: reporterUserId.trim(),
            targetUserId:
              targetUserId.trim().length > 0 ? targetUserId.trim() : null,
            reason: reportReason.trim(),
            ...(reportDetails.trim() ? { details: reportDetails.trim() } : {}),
          },
        }),
      "Moderation report created.",
      (payload) => setModerationSnapshot(payload),
    );

  const createBlock = () =>
    runAction(
      "Create block",
      () =>
        requestApi("POST", "/moderation/blocks", {
          body: {
            blockerUserId: blockerUserId.trim(),
            blockedUserId: blockedUserId.trim(),
          },
        }),
      "User block created.",
      (payload) => setModerationSnapshot(payload),
    );

  const loadModerationSummary = () =>
    runAction(
      "Load moderation summary",
      () =>
        requestApi<ModerationSummarySnapshot>(
          "GET",
          "/admin/moderation/summary",
        ),
      "Moderation summary loaded.",
      (payload) => setModerationSummarySnapshot(payload),
    );

  const loadModerationSettings = () =>
    runAction(
      "Load moderation settings",
      () =>
        requestApi<ModerationSettingsSnapshot>(
          "GET",
          "/admin/moderation/settings",
        ),
      "Moderation settings loaded.",
      (payload) => setModerationSettingsSnapshot(payload),
    );

  const loadModerationQueue = () =>
    runAction(
      "Load moderation queue",
      () =>
        requestApi("GET", "/admin/moderation/queue", {
          query: {
            limit: moderationQueueLimit,
            status: moderationQueueStatusQuery,
            entityType:
              moderationQueueEntityTypeQuery.trim().length > 0
                ? moderationQueueEntityTypeQuery.trim()
                : undefined,
            reasonContains:
              moderationQueueReasonQuery.trim().length > 0
                ? moderationQueueReasonQuery.trim()
                : undefined,
          },
        }),
      "Moderation queue snapshot loaded.",
      (payload) => setModerationQueueSnapshot(payload),
    );

  const loadAuditLogs = () =>
    runAction(
      "Load audit logs",
      () =>
        requestApi("GET", "/admin/audit-logs", {
          query: {
            limit: auditLogLimit,
          },
        }),
      "Audit log snapshot loaded.",
      (payload) => setAuditLogSnapshot(payload),
    );

  const loadAgentRiskFlags = () =>
    runAction(
      "Load agent risk flags",
      () =>
        requestApi("GET", "/admin/moderation/agent-risk-flags", {
          query: {
            limit: agentRiskLimit,
            status: agentRiskStatusQuery,
            ...(agentRiskDecisionQuery.trim() === "review" ||
            agentRiskDecisionQuery.trim() === "blocked"
              ? {
                  decision: agentRiskDecisionQuery.trim() as
                    | "review"
                    | "blocked",
                }
              : {}),
          },
        }),
      "Agent risk flags loaded.",
      (payload) => setAgentRiskSnapshot(payload),
    );

  const triageAgentRiskFlag = () => {
    if (!triageFlagId.trim()) {
      setBanner({ tone: "error", text: "Provide a moderation flag id." });
      return Promise.resolve(null);
    }
    const body: Record<string, unknown> = { action: triageAction };
    if (triageReason.trim()) {
      body.reason = triageReason.trim();
    }
    if (triageTargetUserId.trim()) {
      body.targetUserId = triageTargetUserId.trim();
    }
    return runAction(
      "Triage moderation flag",
      () =>
        requestApi(
          "POST",
          `/admin/moderation/flags/${triageFlagId.trim()}/triage`,
          { body },
        ),
      "Flag triage applied.",
      () => {
        void loadAgentRiskFlags();
      },
    );
  };

  const primeTriageFromFlag = (flag: ModerationFlagRow) => {
    setTriageFlagId(flag.id);
    setAssignFlagId(flag.id);
    setTriageReason(flag.reason);
    setAssignReason(flag.assignmentNote ?? "");
    setAssigneeUserId(flag.assigneeUserId ?? "");
  };

  const assignAgentRiskFlag = () => {
    if (!assignFlagId.trim() || !assigneeUserId.trim()) {
      setBanner({
        tone: "error",
        text: "Provide flag id and assignee user id.",
      });
      return Promise.resolve(null);
    }
    return runAction(
      "Assign moderation flag",
      () =>
        requestApi(
          "POST",
          `/admin/moderation/flags/${assignFlagId.trim()}/assign`,
          {
            body: {
              assigneeUserId: assigneeUserId.trim(),
              ...(assignReason.trim() ? { reason: assignReason.trim() } : {}),
            },
          },
        ),
      "Assignment recorded.",
      () => {
        void loadAgentRiskFlags();
      },
    );
  };

  const deactivateUser = () => {
    if (!userId.trim()) {
      setBanner({ tone: "error", text: "Provide a user id." });
      return Promise.resolve(null);
    }

    return runAction(
      "Deactivate account",
      () =>
        requestApi("POST", `/admin/users/${userId.trim()}/deactivate`, {
          body: {
            reason: deactivateReason.trim(),
          },
        }),
      "Account deactivated.",
      (payload) => setModerationSnapshot(payload),
    );
  };

  const restrictUser = () => {
    if (!userId.trim()) {
      setBanner({ tone: "error", text: "Provide a user id." });
      return Promise.resolve(null);
    }

    return runAction(
      "Restrict account",
      () =>
        requestApi("POST", `/admin/users/${userId.trim()}/restrict`, {
          body: {
            reason: restrictReason.trim(),
          },
        }),
      "Account restriction applied.",
      (payload) => setModerationSnapshot(payload),
    );
  };

  const inspectLifeGraph = () =>
    runAction(
      "Inspect life graph",
      () => requestApi("GET", `/personalization/${userId.trim()}/life-graph`),
      "Life graph snapshot loaded.",
      (payload) => setLifeGraphSnapshot(payload),
    );

  const explainPolicy = () =>
    runAction(
      "Explain policy",
      async () => {
        const context = parseContextInput(policyContextInput);
        return requestApi(
          "POST",
          `/personalization/${userId.trim()}/policy/explain`,
          {
            body: {
              ...policyFlags,
              ...(context ? { context } : {}),
            },
          },
        );
      },
      "Policy explanation generated.",
      (payload) => setPolicyExplainSnapshot(payload),
    );

  const resetLearnedMemory = () =>
    runAction(
      "Reset learned memory",
      () =>
        requestApi("POST", `/privacy/${userId.trim()}/memory/reset`, {
          body: {
            actorUserId: userId.trim(),
            mode: "learned_memory",
            reason: "admin_panel_manual_reset",
          },
        }),
      "Learned memory reset completed.",
      (payload) => setMemoryResetSnapshot(payload),
    );

  const inspectAgentThread = () => {
    if (!threadId.trim()) {
      setBanner({ tone: "error", text: "Provide a thread id." });
      return Promise.resolve(null);
    }

    return runAction(
      "Inspect agent thread",
      () => requestApi("GET", `/agent/threads/${threadId.trim()}/messages`),
      "Agent thread messages loaded.",
      (payload) => setAgentTraceSnapshot(payload),
    );
  };

  const loadPrimaryAgentThreadFromSession = () =>
    runAction(
      "Load primary agent thread",
      () =>
        requestApiNullable<{
          id: string;
          title: string;
          createdAt: string;
        }>("GET", "/agent/threads/me/summary"),
      (payload) =>
        payload?.id
          ? `Primary thread “${payload.title}” — id copied to field.`
          : "No primary thread for the signed-in user (data was null).",
      (payload) => {
        setAgentTraceSnapshot(payload);
        if (payload?.id) {
          setThreadId(payload.id);
        }
      },
    );

  useEffect(() => {
    if (activeTab !== "moderation") {
      return;
    }
    if (!moderationSummarySnapshot) {
      void loadModerationSummary();
    }
    if (!moderationSettingsSnapshot) {
      void loadModerationSettings();
    }
  }, [activeTab, moderationSettingsSnapshot, moderationSummarySnapshot]);

  const postAgentMessage = () => {
    if (!threadId.trim()) {
      setBanner({ tone: "error", text: "Provide a thread id." });
      return Promise.resolve(null);
    }

    return runAction(
      "Post agent thread message",
      async () => {
        await requestApi("POST", `/agent/threads/${threadId.trim()}/messages`, {
          body: {
            userId: actingUserId.trim(),
            content: agentMessage.trim(),
          },
        });
        return requestApi("GET", `/agent/threads/${threadId.trim()}/messages`);
      },
      "Thread message inserted and trace refreshed.",
      (payload) => setAgentTraceSnapshot(payload),
    );
  };

  const runAgenticRespond = () => {
    if (!threadId.trim()) {
      setBanner({ tone: "error", text: "Provide a thread id." });
      return Promise.resolve(null);
    }
    if (!actingUserId.trim()) {
      setBanner({ tone: "error", text: "Provide acting user id." });
      return Promise.resolve(null);
    }
    if (!agentMessage.trim()) {
      setBanner({ tone: "error", text: "Provide inject message content." });
      return Promise.resolve(null);
    }

    return runAction(
      "Agentic respond",
      async () => {
        await requestApi("POST", `/agent/threads/${threadId.trim()}/respond`, {
          body: {
            userId: actingUserId.trim(),
            content: agentMessage.trim(),
          },
        });
        return requestApi("GET", `/agent/threads/${threadId.trim()}/messages`);
      },
      "Agentic turn completed; thread refreshed.",
      (payload) => setAgentTraceSnapshot(payload),
    );
  };

  const executeDebugQuery = async () => {
    const pathValue = debugPath.trim();
    if (pathValue.length === 0) {
      setBanner({ tone: "error", text: "Debug path cannot be empty." });
      return;
    }

    setBusyKey("Debug query");
    setBanner(null);

    const normalizedPath = pathValue.startsWith("/")
      ? pathValue
      : `/${pathValue}`;
    const now = new Date().toISOString();

    try {
      const parsedQuery = parseRecordJsonInput("Debug query", debugQueryInput);
      const query = normalizeQueryValues(parsedQuery);
      const parsedBody =
        debugMethod === "GET"
          ? undefined
          : parseRecordJsonInput("Debug body", debugBodyInput);

      const payload = await requestApi(debugMethod, normalizedPath, {
        ...(query ? { query } : {}),
        ...(parsedBody ? { body: parsedBody } : {}),
      });

      setDebugResponse(payload);
      setDebugHistory((current) =>
        [
          {
            id: createHistoryId(),
            at: now,
            method: debugMethod,
            path: normalizedPath,
            success: true,
          },
          ...current,
        ].slice(0, DEBUG_HISTORY_LIMIT),
      );
      setBanner({
        tone: "success",
        text: `Debug query succeeded: ${debugMethod} ${normalizedPath}`,
      });
    } catch (error) {
      setDebugHistory((current) =>
        [
          {
            id: createHistoryId(),
            at: now,
            method: debugMethod,
            path: normalizedPath,
            success: false,
          },
          ...current,
        ].slice(0, DEBUG_HISTORY_LIMIT),
      );
      setBanner({
        tone: "error",
        text: `Debug query failed: ${errorText(error)}`,
      });
    } finally {
      setBusyKey((current) => (current === "Debug query" ? null : current));
    }
  };

  if (!sessionHydrated) {
    return <AppLoading label="Restoring session…" />;
  }

  if (!signedInSession) {
    return (
      <AdminSignIn
        errorText={signInError}
        onGoogleSignIn={async () => {
          setSignInError(null);
          const url = await fetchGoogleOAuthStartUrl(
            `${window.location.origin}/auth/callback`,
          );
          window.location.assign(url);
        }}
      />
    );
  }

  const sessionLabel =
    signedInSession.displayName?.trim() ||
    signedInSession.email?.trim() ||
    signedInSession.userId.slice(0, 8);

  return (
    <AdminShell
      activeId={activeTab}
      busyKey={busyKey}
      busyPrefixLabel={t("busyPrefix", locale)}
      navItems={tabConfig.map((tab) => ({ id: tab.id, label: tab.label }))}
      locale={locale}
      localeEnglishLabel={t("english", locale)}
      localeLabel={t("language", locale)}
      localeSpanishLabel={t("spanish", locale)}
      onNavigate={(id) => setActiveTab(id as AdminTab)}
      onLocaleChange={setLocale}
      onSignOut={() => {
        clearAdminSession();
        setSignedInSession(null);
        setAdminUserId(DEFAULT_UUID);
      }}
      operatorContextNote={t("operatorContextNote", locale)}
      readyLabel={t("ready", locale)}
      sessionLabel={sessionLabel}
      sessionTitle={
        signedInSession.email ??
        signedInSession.displayName ??
        signedInSession.userId
      }
      signOutLabel={t("signOut", locale)}
      activeDescription={tabSubtitle(activeTab)}
      subtitle="OpenSocial"
      summary={summary}
      title="Operations workbench"
    >
      {banner ? (
        <div className="mb-4">
          <Notice text={banner.text} tone={banner.tone} />
        </div>
      ) : null}

      <p className="mb-4 text-xs text-muted-foreground md:hidden">
        {tabSubtitle(activeTab)}
      </p>

      {activeTab === "overview" ? (
        <section className="mt-4 space-y-4">
          <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
            <Panel
              subtitle="Live queue operations and system health."
              title="System Controls"
            >
              <div className="flex flex-wrap gap-2">
                <button
                  className={adminButtonClass}
                  onClick={loadDeadLetters}
                  type="button"
                >
                  Load dead letters
                </button>
                <button
                  className={adminButtonClass}
                  onClick={relayOutbox}
                  type="button"
                >
                  Relay outbox
                </button>
              </div>
              <p className="mt-3 text-xs text-ash">
                health: <span className="text-slate-200">{health}</span>
              </p>
              <p className="text-xs text-ash">
                outbox processed:{" "}
                <span className="text-slate-200">{relayCount ?? "n/a"}</span>
              </p>
            </Panel>

            <Panel
              subtitle="Google sign-in sets your admin user id. Override only for impersonation or debugging."
              title="Context"
            >
              <label className={adminLabelClass}>
                admin user id (x-admin-user-id)
                <input
                  className={adminInputClass}
                  onChange={(event) =>
                    setAdminUserId(event.currentTarget.value)
                  }
                  value={adminUserId}
                />
              </label>
              <label className={adminLabelClass}>
                admin role (x-admin-role)
                <select
                  className={adminInputClass}
                  onChange={(event) =>
                    setAdminRole(
                      event.currentTarget.value as
                        | "admin"
                        | "support"
                        | "moderator",
                    )
                  }
                  value={adminRole}
                >
                  <option value="admin">admin</option>
                  <option value="support">support</option>
                  <option value="moderator">moderator</option>
                </select>
              </label>
              <label className={adminLabelClass}>
                user id
                <input
                  className={adminInputClass}
                  onChange={(event) => setUserId(event.currentTarget.value)}
                  value={userId}
                />
              </label>
              <label className={adminLabelClass}>
                thread id
                <input
                  className={adminInputClass}
                  onChange={(event) => setThreadId(event.currentTarget.value)}
                  placeholder="agent thread uuid"
                  value={threadId}
                />
              </label>
            </Panel>
          </div>

          <Panel
            subtitle="Replay failed jobs without touching Redis manually."
            title="Dead-letter Queue"
          >
            {deadLetters.length === 0 ? (
              <p className="text-sm text-ash">No dead-letter rows loaded.</p>
            ) : (
              <div className="space-y-2">
                {deadLetters.map((row) => (
                  <article
                    className="rounded-xl border border-slate-700 bg-night px-3 py-3"
                    key={row.id}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-slate-100">
                        {row.queueName} / {row.jobName}
                      </p>
                      <button
                        className={adminButtonGhostClass}
                        onClick={() => {
                          replayDeadLetter(row.id).catch(() => {});
                        }}
                        type="button"
                      >
                        Replay
                      </button>
                    </div>
                    <p className="mt-1 text-xs text-ash">
                      attempts: {row.attempts} · createdAt: {row.createdAt}
                    </p>
                    <p className="mt-1 text-xs text-rose-200">
                      {row.lastError}
                    </p>
                  </article>
                ))}
              </div>
            )}
          </Panel>

          <div className="grid gap-4 lg:grid-cols-[1.25fr_0.75fr]">
            <Panel
              subtitle="Call any API route directly from admin with JSON query/body payloads."
              title="Internal Query Helper"
            >
              <div className="grid gap-3 md:grid-cols-3">
                <label className={adminLabelClass}>
                  method
                  <select
                    className={adminInputClass}
                    onChange={(event) =>
                      setDebugMethod(event.currentTarget.value as HttpMethod)
                    }
                    value={debugMethod}
                  >
                    <option value="GET">GET</option>
                    <option value="POST">POST</option>
                    <option value="PUT">PUT</option>
                    <option value="PATCH">PATCH</option>
                  </select>
                </label>
                <label className={`${adminLabelClass} md:col-span-2`}>
                  path
                  <input
                    className={adminInputClass}
                    onChange={(event) =>
                      setDebugPath(event.currentTarget.value)
                    }
                    placeholder="/admin/health"
                    value={debugPath}
                  />
                </label>
              </div>

              <div className="mt-3 grid gap-3 lg:grid-cols-2">
                <label className={adminLabelClass}>
                  query json
                  <textarea
                    className={`${adminInputClass} min-h-24`}
                    onChange={(event) =>
                      setDebugQueryInput(event.currentTarget.value)
                    }
                    value={debugQueryInput}
                  />
                </label>
                <label className={adminLabelClass}>
                  body json
                  <textarea
                    className={`${adminInputClass} min-h-24`}
                    disabled={debugMethod === "GET"}
                    onChange={(event) =>
                      setDebugBodyInput(event.currentTarget.value)
                    }
                    value={debugBodyInput}
                  />
                </label>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  className={adminButtonClass}
                  onClick={() => {
                    executeDebugQuery().catch(() => {});
                  }}
                  type="button"
                >
                  Execute query
                </button>
                <button
                  className={adminButtonGhostClass}
                  onClick={() => {
                    setDebugMethod("GET");
                    setDebugPath("/admin/health");
                    setDebugQueryInput("{}");
                    setDebugBodyInput("{}");
                  }}
                  type="button"
                >
                  Load health preset
                </button>
                <button
                  className={adminButtonGhostClass}
                  onClick={() => {
                    setDebugMethod("GET");
                    setDebugPath("/admin/jobs/dead-letters");
                    setDebugQueryInput("{}");
                    setDebugBodyInput("{}");
                  }}
                  type="button"
                >
                  Load dead-letter preset
                </button>
              </div>

              <div className="mt-3">
                <JsonView
                  emptyLabel="No debug response yet."
                  value={debugResponse}
                />
              </div>
            </Panel>

            <Panel
              subtitle="Recent manual debug queries."
              title="Debug History"
            >
              {debugHistory.length === 0 ? (
                <p className="text-sm text-ash">
                  No debug queries executed yet.
                </p>
              ) : (
                <div className="space-y-2">
                  {debugHistory.map((item) => (
                    <article
                      className="rounded-xl border border-slate-700 bg-night px-3 py-2"
                      key={item.id}
                    >
                      <p className="text-xs font-semibold text-slate-100">
                        {item.method} {item.path}
                      </p>
                      <p className="mt-1 text-xs text-ash">
                        {item.at} · {item.success ? "ok" : "failed"}
                      </p>
                    </article>
                  ))}
                </div>
              )}
            </Panel>
          </div>
        </section>
      ) : null}

      {activeTab === "users" ? (
        <section className="mt-4 space-y-4">
          <Panel
            subtitle="Inspect profile, trust, rules, sessions, and inbox from one action."
            title="User Inspector"
          >
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <label className={adminLabelClass}>
                user id
                <input
                  className={adminInputClass}
                  onChange={(event) => setUserId(event.currentTarget.value)}
                  value={userId}
                />
              </label>
              <label className={adminLabelClass}>
                revoke session id
                <input
                  className={adminInputClass}
                  onChange={(event) =>
                    setRevokeSessionId(event.currentTarget.value)
                  }
                  placeholder="session uuid"
                  value={revokeSessionId}
                />
              </label>
              <label className={adminLabelClass}>
                search query
                <input
                  className={adminInputClass}
                  onChange={(event) =>
                    setSearchQuery(event.currentTarget.value)
                  }
                  placeholder="tennis"
                  value={searchQuery}
                />
              </label>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                className={adminButtonClass}
                onClick={inspectUser}
                type="button"
              >
                Inspect user
              </button>
              <button
                className={adminButtonGhostClass}
                onClick={sendDigest}
                type="button"
              >
                Send digest
              </button>
              <button
                className={adminButtonGhostClass}
                onClick={summarizePendingIntents}
                type="button"
              >
                Summarize pending intents
              </button>
              <button
                className={adminButtonGhostClass}
                onClick={runSearch}
                type="button"
              >
                Run search
              </button>
              <button
                className={adminButtonGhostClass}
                onClick={revokeSession}
                type="button"
              >
                Revoke one session
              </button>
              <button
                className={adminButtonDangerClass}
                onClick={revokeAllSessions}
                type="button"
              >
                Revoke all sessions
              </button>
            </div>
            <div className="mt-3 grid gap-3 lg:grid-cols-2">
              <label className={adminLabelClass}>
                deactivate reason
                <input
                  className={adminInputClass}
                  onChange={(event) =>
                    setDeactivateReason(event.currentTarget.value)
                  }
                  value={deactivateReason}
                />
              </label>
              <label className={adminLabelClass}>
                restrict reason
                <input
                  className={adminInputClass}
                  onChange={(event) =>
                    setRestrictReason(event.currentTarget.value)
                  }
                  value={restrictReason}
                />
              </label>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                className={adminButtonDangerClass}
                onClick={deactivateUser}
                type="button"
              >
                Deactivate account
              </button>
              <button
                className={adminButtonDangerClass}
                onClick={restrictUser}
                type="button"
              >
                Restrict / shadow-ban
              </button>
            </div>
          </Panel>

          <div className="grid gap-4 lg:grid-cols-3">
            <Panel title="Profile">
              <JsonView
                emptyLabel="No profile data loaded."
                value={profileSnapshot}
              />
            </Panel>
            <Panel title="Trust">
              <JsonView
                emptyLabel="No trust data loaded."
                value={trustSnapshot}
              />
            </Panel>
            <Panel title="Global Rules">
              <JsonView emptyLabel="No rules loaded." value={ruleSnapshot} />
            </Panel>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Panel title="Interests">
              <JsonView value={interestSnapshot} />
            </Panel>
            <Panel title="Topics">
              <JsonView value={topicSnapshot} />
            </Panel>
            <Panel title="Availability">
              <JsonView value={availabilitySnapshot} />
            </Panel>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Panel title="Photos">
              <JsonView value={photoSnapshot} />
            </Panel>
            <Panel title="Sessions">
              <JsonView value={sessionSnapshot} />
            </Panel>
            <Panel title="Inbox Requests">
              <JsonView value={inboxSnapshot} />
            </Panel>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title="Recurring Circles">
              <JsonView value={recurringCircleSnapshot} />
            </Panel>
            <Panel title="Circle Sessions (first circle)">
              <JsonView value={recurringCircleSessionSnapshot} />
            </Panel>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Panel title="Saved Searches">
              <JsonView value={savedSearchSnapshot} />
            </Panel>
            <Panel title="Scheduled Tasks">
              <JsonView value={scheduledTaskSnapshot} />
            </Panel>
            <Panel title="Scheduled Task Runs (first task)">
              <JsonView value={scheduledTaskRunsSnapshot} />
            </Panel>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title="Passive Discovery">
              <JsonView value={discoveryPassiveSnapshot} />
            </Panel>
            <Panel title="Inbox Suggestions">
              <JsonView value={discoveryInboxSnapshot} />
            </Panel>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title="Pending Intent Summary">
              <JsonView value={pendingIntentSummarySnapshot} />
            </Panel>
            <Panel title="User Routing Explanation (first pending intent)">
              <JsonView value={continuityIntentExplainSnapshot} />
            </Panel>
          </div>

          <div className="grid gap-4 lg:grid-cols-1">
            <Panel title="Search Snapshot">
              <JsonView value={searchSnapshot} />
            </Panel>
          </div>
        </section>
      ) : null}

      {activeTab === "intents" ? (
        <section className="mt-4 space-y-4">
          <Panel
            subtitle="Run intent follow-up superpowers without direct DB edits."
            title="Intent Controls"
          >
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <label className={adminLabelClass}>
                intent id
                <input
                  className={adminInputClass}
                  onChange={(event) => setIntentId(event.currentTarget.value)}
                  placeholder="intent uuid"
                  value={intentId}
                />
              </label>
              <label className={adminLabelClass}>
                user id (cancel)
                <input
                  className={adminInputClass}
                  onChange={(event) => setUserId(event.currentTarget.value)}
                  value={userId}
                />
              </label>
              <label className={adminLabelClass}>
                agent thread id (optional)
                <input
                  className={adminInputClass}
                  onChange={(event) => setThreadId(event.currentTarget.value)}
                  value={threadId}
                />
              </label>
              <label className={adminLabelClass}>
                group size target (2-4)
                <input
                  className={adminInputClass}
                  max={4}
                  min={2}
                  onChange={(event) =>
                    setGroupSizeTarget(Number(event.currentTarget.value))
                  }
                  type="number"
                  value={groupSizeTarget}
                />
              </label>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                className={adminButtonClass}
                onClick={inspectIntent}
                type="button"
              >
                Inspect explanations
              </button>
              <button
                className={adminButtonGhostClass}
                onClick={cancelIntent}
                type="button"
              >
                Force-cancel intent
              </button>
              <button
                className={adminButtonGhostClass}
                onClick={retryIntent}
                type="button"
              >
                Retry routing
              </button>
              <button
                className={adminButtonGhostClass}
                onClick={widenIntent}
                type="button"
              >
                Widen filters
              </button>
              <button
                className={adminButtonGhostClass}
                onClick={() => {
                  convertIntent("group").catch(() => {});
                }}
                type="button"
              >
                Convert to group
              </button>
              <button
                className={adminButtonGhostClass}
                onClick={() => {
                  convertIntent("one_to_one").catch(() => {});
                }}
                type="button"
              >
                Convert to 1:1
              </button>
            </div>
          </Panel>

          <div className="grid gap-4 lg:grid-cols-3">
            <Panel title="Admin Explanation">
              <JsonView value={intentExplainSnapshot} />
            </Panel>
            <Panel title="User-facing Explanation">
              <JsonView value={intentUserExplainSnapshot} />
            </Panel>
            <Panel title="Last Action Result">
              <JsonView value={intentActionSnapshot} />
            </Panel>
          </div>
        </section>
      ) : null}

      {activeTab === "chats" ? (
        <section className="mt-4 space-y-4">
          <Panel
            subtitle="Inspect chat health and recover flows with sync and membership actions."
            title="Chat Controls"
          >
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <label className={adminLabelClass}>
                chat id
                <input
                  className={adminInputClass}
                  onChange={(event) => setChatId(event.currentTarget.value)}
                  placeholder="chat uuid"
                  value={chatId}
                />
              </label>
              <label className={adminLabelClass}>
                acting user id
                <input
                  className={adminInputClass}
                  onChange={(event) =>
                    setActingUserId(event.currentTarget.value)
                  }
                  value={actingUserId}
                />
              </label>
              <label className={adminLabelClass}>
                sync after (ISO)
                <input
                  className={adminInputClass}
                  onChange={(event) => setSyncAfter(event.currentTarget.value)}
                  placeholder="2026-03-19T20:00:00.000Z"
                  value={syncAfter}
                />
              </label>
              <label className={adminLabelClass}>
                message id (hide action)
                <input
                  className={adminInputClass}
                  onChange={(event) => setMessageId(event.currentTarget.value)}
                  placeholder="message uuid"
                  value={messageId}
                />
              </label>
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              <label className={adminLabelClass}>
                moderator user id
                <input
                  className={adminInputClass}
                  onChange={(event) =>
                    setModeratorUserId(event.currentTarget.value)
                  }
                  value={moderatorUserId}
                />
              </label>
              <label className={adminLabelClass}>
                hide reason
                <input
                  className={adminInputClass}
                  onChange={(event) => setHideReason(event.currentTarget.value)}
                  value={hideReason}
                />
              </label>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                className={adminButtonClass}
                onClick={inspectChat}
                type="button"
              >
                Inspect messages + metadata
              </button>
              <button
                className={adminButtonGhostClass}
                onClick={syncChat}
                type="button"
              >
                Reconnect sync
              </button>
              <button
                className={adminButtonGhostClass}
                onClick={leaveChat}
                type="button"
              >
                Leave participant
              </button>
              <button
                className={adminButtonGhostClass}
                onClick={repairChatFlow}
                type="button"
              >
                Repair stuck flow
              </button>
              <button
                className={adminButtonDangerClass}
                onClick={hideChatMessage}
                type="button"
              >
                Hide message
              </button>
            </div>
          </Panel>

          <div className="grid gap-4 lg:grid-cols-3">
            <Panel title="Messages">
              <JsonView value={chatMessagesSnapshot} />
            </Panel>
            <Panel title="Metadata (connection view)">
              <JsonView value={chatMetadataSnapshot} />
            </Panel>
            <Panel title="Sync Snapshot">
              <JsonView value={chatSyncSnapshot} />
            </Panel>
          </div>
        </section>
      ) : null}

      {activeTab === "moderation" ? (
        <section className="mt-4 space-y-4">
          <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
            <Panel
              subtitle="Backlog, enforcement, and recent safety activity."
              title="Moderation Command Center"
            >
              <div className="flex flex-wrap gap-2">
                <button
                  className={adminButtonClass}
                  onClick={() => {
                    loadModerationSummary().catch(() => {});
                  }}
                  type="button"
                >
                  Refresh summary
                </button>
                <button
                  className={adminButtonGhostClass}
                  onClick={() => {
                    loadModerationSettings().catch(() => {});
                  }}
                  type="button"
                >
                  Refresh settings
                </button>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {[
                  {
                    label: "Open flags",
                    value: moderationSummarySnapshot?.queue.openFlags ?? "—",
                    tone: "text-rose-300",
                  },
                  {
                    label: "Agent risk open",
                    value:
                      moderationSummarySnapshot?.queue.agentRiskOpenFlags ??
                      "—",
                    tone: "text-amber-300",
                  },
                  {
                    label: "Open reports",
                    value: moderationSummarySnapshot?.queue.reportsOpen ?? "—",
                    tone: "text-sky-300",
                  },
                  {
                    label: "Reports (24h)",
                    value:
                      moderationSummarySnapshot?.actions24h.reports24h ?? "—",
                    tone: "text-violet-300",
                  },
                  {
                    label: "Blocked profiles",
                    value:
                      moderationSummarySnapshot?.enforcement.blockedProfiles ??
                      "—",
                    tone: "text-fuchsia-300",
                  },
                  {
                    label: "Suspended users",
                    value:
                      moderationSummarySnapshot?.enforcement.suspendedUsers ??
                      "—",
                    tone: "text-orange-300",
                  },
                ].map((item) => (
                  <div
                    className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4"
                    key={item.label}
                  >
                    <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">
                      {item.label}
                    </p>
                    <p className={`mt-2 text-3xl font-semibold ${item.tone}`}>
                      {item.value}
                    </p>
                  </div>
                ))}
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {[
                  {
                    label: "Avg assign mins",
                    value:
                      moderationSummarySnapshot?.analytics
                        .avgTimeToAssignmentMinutes ?? "—",
                  },
                  {
                    label: "Avg decision mins",
                    value:
                      moderationSummarySnapshot?.analytics
                        .avgTimeToDecisionMinutes ?? "—",
                  },
                  {
                    label: "Dismissal rate",
                    value:
                      moderationSummarySnapshot?.analytics.dismissalRate24h ??
                      "—",
                  },
                  {
                    label: "Repeat offenders (24h)",
                    value:
                      moderationSummarySnapshot?.analytics.repeatOffenders24h ??
                      "—",
                  },
                ].map((item) => (
                  <div
                    className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4"
                    key={item.label}
                  >
                    <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">
                      {item.label}
                    </p>
                    <p className="mt-2 text-2xl font-semibold text-cyan-200">
                      {item.value}
                    </p>
                  </div>
                ))}
              </div>
              <div className="mt-4 grid gap-3 lg:grid-cols-2">
                <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                    Recent flags
                  </p>
                  <div className="mt-3 space-y-2">
                    {(moderationSummarySnapshot?.recent.flags ?? []).length ===
                    0 ? (
                      <p className="text-sm text-slate-400">
                        No recent flags loaded yet.
                      </p>
                    ) : (
                      moderationSummarySnapshot?.recent.flags.map((flag) => (
                        <button
                          className="w-full rounded-xl border border-slate-800 bg-slate-900/80 px-3 py-3 text-left text-sm text-slate-100 transition hover:border-slate-600"
                          key={flag.id}
                          onClick={() => primeTriageFromFlag(flag)}
                          type="button"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <span className="font-medium text-slate-100">
                              {flag.entityType}
                            </span>
                            <span className="text-xs uppercase tracking-wide text-slate-400">
                              {flag.status}
                            </span>
                          </div>
                          <p className="mt-1 text-xs text-slate-400">
                            {flag.reason}
                          </p>
                        </button>
                      ))
                    )}
                  </div>
                </div>
                <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                    Recent reports
                  </p>
                  <div className="mt-3 space-y-2">
                    {(moderationSummarySnapshot?.recent.reports ?? [])
                      .length === 0 ? (
                      <p className="text-sm text-slate-400">
                        No recent reports loaded yet.
                      </p>
                    ) : (
                      moderationSummarySnapshot?.recent.reports.map(
                        (report) => (
                          <div
                            className="rounded-xl border border-slate-800 bg-slate-900/80 px-3 py-3"
                            key={report.id}
                          >
                            <div className="flex items-center justify-between gap-3">
                              <span className="font-medium text-slate-100">
                                {report.reason}
                              </span>
                              <span className="text-xs uppercase tracking-wide text-slate-400">
                                {report.status}
                              </span>
                            </div>
                            <p className="mt-1 text-xs text-slate-400">
                              reporter {report.reporterUserId}
                              {report.targetUserId
                                ? ` -> target ${report.targetUserId}`
                                : ""}
                            </p>
                          </div>
                        ),
                      )
                    )}
                  </div>
                </div>
              </div>
              <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                  Top reasons
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {(moderationSummarySnapshot?.analytics.topReasons ?? []).map(
                    (item) => (
                      <span
                        className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-300"
                        key={`${item.reason}-${item.count}`}
                      >
                        {item.reason} ({item.count})
                      </span>
                    ),
                  )}
                </div>
              </div>
            </Panel>

            <Panel
              subtitle="Configured provider, switches, and alert thresholds."
              title="Policy Settings"
            >
              <div className="space-y-4 text-sm text-slate-200">
                <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
                    Provider
                  </p>
                  <p className="mt-2 text-xl font-semibold text-slate-100">
                    {moderationSettingsSnapshot?.provider ?? "Not loaded"}
                  </p>
                  <div className="mt-3 grid gap-2">
                    {[
                      [
                        "Provider key configured",
                        moderationSettingsSnapshot?.keys
                          .moderationProviderConfigured,
                      ],
                      [
                        "OpenAI configured",
                        moderationSettingsSnapshot?.keys.openaiConfigured,
                      ],
                      [
                        "Custom provider configured",
                        moderationSettingsSnapshot?.keys
                          .customProviderConfigured,
                      ],
                    ].map(([label, enabled]) => (
                      <div
                        className="flex items-center justify-between rounded-xl border border-slate-800 px-3 py-2"
                        key={String(label)}
                      >
                        <span>{label}</span>
                        <span
                          className={
                            enabled ? "text-emerald-300" : "text-amber-300"
                          }
                        >
                          {enabled ? "yes" : "no"}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
                    Toggles
                  </p>
                  <div className="mt-3 grid gap-2">
                    {Object.entries(
                      moderationSettingsSnapshot?.toggles ?? {},
                    ).map(([label, enabled]) => (
                      <div
                        className="flex items-center justify-between rounded-xl border border-slate-800 px-3 py-2"
                        key={label}
                      >
                        <span>{label}</span>
                        <span
                          className={
                            enabled ? "text-emerald-300" : "text-slate-400"
                          }
                        >
                          {enabled ? "enabled" : "disabled"}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
                    Thresholds
                  </p>
                  <div className="mt-3 space-y-2">
                    <div className="flex items-center justify-between rounded-xl border border-slate-800 px-3 py-2">
                      <span>Moderation backlog alert</span>
                      <span>
                        {moderationSettingsSnapshot?.thresholds
                          .moderationBacklogAlert ?? "—"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between rounded-xl border border-slate-800 px-3 py-2">
                      <span>DB latency alert</span>
                      <span>
                        {moderationSettingsSnapshot?.thresholds
                          .dbLatencyAlertMs ?? "—"}
                        ms
                      </span>
                    </div>
                    <div className="flex items-center justify-between rounded-xl border border-slate-800 px-3 py-2">
                      <span>OpenAI error-rate alert</span>
                      <span>
                        {moderationSettingsSnapshot?.thresholds
                          .openAiErrorRateAlert ?? "—"}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </Panel>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Panel
              subtitle="Create moderation report records."
              title="Report User"
            >
              <div className="grid gap-3 md:grid-cols-2">
                <label className={adminLabelClass}>
                  reporter user id
                  <input
                    className={adminInputClass}
                    onChange={(event) =>
                      setReporterUserId(event.currentTarget.value)
                    }
                    value={reporterUserId}
                  />
                </label>
                <label className={adminLabelClass}>
                  target user id (optional)
                  <input
                    className={adminInputClass}
                    onChange={(event) =>
                      setTargetUserId(event.currentTarget.value)
                    }
                    value={targetUserId}
                  />
                </label>
              </div>
              <label className={`${adminLabelClass} mt-3`}>
                reason
                <input
                  className={adminInputClass}
                  onChange={(event) =>
                    setReportReason(event.currentTarget.value)
                  }
                  value={reportReason}
                />
              </label>
              <label className={`${adminLabelClass} mt-3`}>
                details
                <textarea
                  className={`${adminInputClass} min-h-24`}
                  onChange={(event) =>
                    setReportDetails(event.currentTarget.value)
                  }
                  value={reportDetails}
                />
              </label>
              <button
                className={`${adminButtonClass} mt-3`}
                onClick={createReport}
                type="button"
              >
                Create report
              </button>
            </Panel>

            <Panel
              subtitle="Block relationships for safety enforcement."
              title="Block User"
            >
              <div className="grid gap-3 md:grid-cols-2">
                <label className={adminLabelClass}>
                  blocker user id
                  <input
                    className={adminInputClass}
                    onChange={(event) =>
                      setBlockerUserId(event.currentTarget.value)
                    }
                    value={blockerUserId}
                  />
                </label>
                <label className={adminLabelClass}>
                  blocked user id
                  <input
                    className={adminInputClass}
                    onChange={(event) =>
                      setBlockedUserId(event.currentTarget.value)
                    }
                    value={blockedUserId}
                  />
                </label>
              </div>
              <button
                className={`${adminButtonClass} mt-3`}
                onClick={createBlock}
                type="button"
              >
                Create block
              </button>
            </Panel>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Panel title="Moderation Result">
              <JsonView value={moderationSnapshot} />
            </Panel>
            <Panel
              subtitle="Filter open or resolved items and drill into flagged content quickly."
              title="Moderation Queue"
            >
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <label className={adminLabelClass}>
                  limit
                  <input
                    className={adminInputClass}
                    max={250}
                    min={1}
                    onChange={(event) =>
                      setModerationQueueLimit(
                        Number(event.currentTarget.value) || 100,
                      )
                    }
                    type="number"
                    value={moderationQueueLimit}
                  />
                </label>
                <label className={adminLabelClass}>
                  status
                  <select
                    className={adminInputClass}
                    onChange={(event) =>
                      setModerationQueueStatusQuery(
                        event.currentTarget.value as
                          | "open"
                          | "resolved"
                          | "dismissed",
                      )
                    }
                    value={moderationQueueStatusQuery}
                  >
                    <option value="open">open</option>
                    <option value="resolved">resolved</option>
                    <option value="dismissed">dismissed</option>
                  </select>
                </label>
                <label className={adminLabelClass}>
                  entity type (optional)
                  <input
                    className={adminInputClass}
                    onChange={(event) =>
                      setModerationQueueEntityTypeQuery(
                        event.currentTarget.value,
                      )
                    }
                    placeholder="agent_thread"
                    value={moderationQueueEntityTypeQuery}
                  />
                </label>
                <label className={adminLabelClass}>
                  reason contains
                  <input
                    className={adminInputClass}
                    onChange={(event) =>
                      setModerationQueueReasonQuery(event.currentTarget.value)
                    }
                    placeholder="threat"
                    value={moderationQueueReasonQuery}
                  />
                </label>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  className={adminButtonClass}
                  onClick={loadModerationQueue}
                  type="button"
                >
                  Load moderation queue
                </button>
                <button
                  className={adminButtonGhostClass}
                  onClick={() => setModerationQueueSnapshot(null)}
                  type="button"
                >
                  Clear
                </button>
              </div>
              <div className="mt-4 space-y-3">
                {moderationQueueItems.length === 0 ? (
                  <p className="text-sm text-slate-400">
                    No moderation queue items loaded.
                  </p>
                ) : (
                  moderationQueueItems.map((flag) => (
                    <div
                      className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4"
                      key={flag.id}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-100">
                            {flag.entityType}
                          </p>
                          <p className="text-xs text-slate-400">
                            {flag.id} · {flag.entityId}
                          </p>
                        </div>
                        <span className="rounded-full border border-slate-700 px-3 py-1 text-xs uppercase tracking-wide text-slate-300">
                          {flag.status}
                        </span>
                      </div>
                      <p className="mt-3 text-sm text-slate-200">
                        {flag.reason}
                      </p>
                      <div className="mt-2 space-y-1 text-xs text-slate-400">
                        {flag.assigneeUserId ? (
                          <p>Assignee: {flag.assigneeUserId}</p>
                        ) : null}
                        {flag.assignmentNote ? (
                          <p>Assignment note: {flag.assignmentNote}</p>
                        ) : null}
                        {flag.lastDecision ? (
                          <p>Last decision: {flag.lastDecision}</p>
                        ) : null}
                        {flag.triageNote ? (
                          <p>Triage note: {flag.triageNote}</p>
                        ) : null}
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          className={adminButtonGhostClass}
                          onClick={() => primeTriageFromFlag(flag)}
                          type="button"
                        >
                          Use in triage
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
              <div className="mt-4">
                <JsonView value={moderationQueueSnapshot} />
              </div>
            </Panel>
            <Panel
              subtitle="Load from /api/admin/audit-logs."
              title="Audit Logs"
            >
              <label className={adminLabelClass}>
                limit
                <input
                  className={adminInputClass}
                  max={250}
                  min={1}
                  onChange={(event) =>
                    setAuditLogLimit(Number(event.currentTarget.value) || 100)
                  }
                  type="number"
                  value={auditLogLimit}
                />
              </label>
              <button
                className={`${adminButtonClass} mt-3`}
                onClick={loadAuditLogs}
                type="button"
              >
                Load audit logs
              </button>
              <div className="mt-3">
                <JsonView value={auditLogSnapshot} />
              </div>
            </Panel>
          </div>

          <Panel
            subtitle="Flags from conversational risk checks on agent threads; pair with audit action moderation.agent_risk_assessed."
            title="Agent thread risk flags"
          >
            <div className="grid gap-3 md:grid-cols-3">
              <label className={adminLabelClass}>
                limit
                <input
                  className={adminInputClass}
                  max={250}
                  min={1}
                  onChange={(event) =>
                    setAgentRiskLimit(Number(event.currentTarget.value) || 50)
                  }
                  type="number"
                  value={agentRiskLimit}
                />
              </label>
              <label className={adminLabelClass}>
                status
                <select
                  className={adminInputClass}
                  onChange={(event) =>
                    setAgentRiskStatusQuery(
                      event.currentTarget.value as
                        | "open"
                        | "resolved"
                        | "dismissed",
                    )
                  }
                  value={agentRiskStatusQuery}
                >
                  <option value="open">open</option>
                  <option value="resolved">resolved</option>
                  <option value="dismissed">dismissed</option>
                </select>
              </label>
              <label className={adminLabelClass}>
                decision filter (optional)
                <select
                  className={adminInputClass}
                  onChange={(event) =>
                    setAgentRiskDecisionQuery(event.currentTarget.value)
                  }
                  value={agentRiskDecisionQuery}
                >
                  <option value="">any</option>
                  <option value="blocked">blocked</option>
                  <option value="review">review</option>
                </select>
              </label>
            </div>
            <button
              className={`${adminButtonClass} mt-3`}
              onClick={() => {
                loadAgentRiskFlags().catch(() => {});
              }}
              type="button"
            >
              Load agent risk flags
            </button>
            <div className="mt-4 space-y-3">
              {agentRiskItems.length === 0 ? (
                <p className="text-sm text-slate-400">
                  No agent risk flags loaded.
                </p>
              ) : (
                agentRiskItems.map((flag) => (
                  <div
                    className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4"
                    key={flag.id}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-100">
                          {flag.reason}
                        </p>
                        <p className="text-xs text-slate-400">
                          {flag.id} · thread {flag.entityId}
                        </p>
                      </div>
                      <span className="rounded-full border border-slate-700 px-3 py-1 text-xs uppercase tracking-wide text-slate-300">
                        {flag.status}
                      </span>
                    </div>
                    {flag.latestAssignment ? (
                      <p className="mt-2 text-xs text-slate-400">
                        Assigned:{" "}
                        {JSON.stringify(flag.latestAssignment.metadata)}
                      </p>
                    ) : null}
                    {flag.assigneeUserId ? (
                      <p className="mt-2 text-xs text-slate-400">
                        Current assignee: {flag.assigneeUserId}
                      </p>
                    ) : null}
                    {flag.assignmentNote ? (
                      <p className="mt-2 text-xs text-slate-400">
                        Assignment note: {flag.assignmentNote}
                      </p>
                    ) : null}
                    {flag.latestRiskAudit ? (
                      <p className="mt-2 text-xs text-slate-400">
                        Risk audit:{" "}
                        {JSON.stringify(flag.latestRiskAudit.metadata)}
                      </p>
                    ) : null}
                    {flag.lastDecision ? (
                      <p className="mt-2 text-xs text-slate-400">
                        Last decision: {flag.lastDecision}
                        {flag.triageNote ? ` · ${flag.triageNote}` : ""}
                      </p>
                    ) : null}
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        className={adminButtonGhostClass}
                        onClick={() => primeTriageFromFlag(flag)}
                        type="button"
                      >
                        Use in triage
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="mt-3 max-h-64 overflow-y-auto">
              <JsonView value={agentRiskSnapshot} />
            </div>
            <div className="mt-4 grid gap-3 border-t border-slate-800 pt-4 md:grid-cols-2">
              <div className="space-y-2">
                <p className="text-xs font-semibold text-slate-300">
                  Triage flag
                </p>
                <label className={adminLabelClass}>
                  flag id
                  <input
                    className={adminInputClass}
                    onChange={(event) =>
                      setTriageFlagId(event.currentTarget.value)
                    }
                    value={triageFlagId}
                  />
                </label>
                <label className={adminLabelClass}>
                  action
                  <select
                    className={adminInputClass}
                    onChange={(event) =>
                      setTriageAction(
                        event.currentTarget.value as typeof triageAction,
                      )
                    }
                    value={triageAction}
                  >
                    <option value="resolve">resolve</option>
                    <option value="reopen">reopen</option>
                    <option value="escalate_strike">escalate_strike</option>
                    <option value="restrict_user">restrict_user</option>
                  </select>
                </label>
                <label className={adminLabelClass}>
                  target user id (strike / restrict)
                  <input
                    className={adminInputClass}
                    onChange={(event) =>
                      setTriageTargetUserId(event.currentTarget.value)
                    }
                    value={triageTargetUserId}
                  />
                </label>
                <label className={adminLabelClass}>
                  reason (optional)
                  <input
                    className={adminInputClass}
                    onChange={(event) =>
                      setTriageReason(event.currentTarget.value)
                    }
                    value={triageReason}
                  />
                </label>
                <button
                  className={adminButtonClass}
                  onClick={() => {
                    triageAgentRiskFlag().catch(() => {});
                  }}
                  type="button"
                >
                  Apply triage
                </button>
              </div>
              <div className="space-y-2">
                <p className="text-xs font-semibold text-slate-300">
                  Assign flag
                </p>
                <label className={adminLabelClass}>
                  flag id
                  <input
                    className={adminInputClass}
                    onChange={(event) =>
                      setAssignFlagId(event.currentTarget.value)
                    }
                    value={assignFlagId}
                  />
                </label>
                <label className={adminLabelClass}>
                  assignee user id
                  <input
                    className={adminInputClass}
                    onChange={(event) =>
                      setAssigneeUserId(event.currentTarget.value)
                    }
                    value={assigneeUserId}
                  />
                </label>
                <label className={adminLabelClass}>
                  reason (optional)
                  <input
                    className={adminInputClass}
                    onChange={(event) =>
                      setAssignReason(event.currentTarget.value)
                    }
                    value={assignReason}
                  />
                </label>
                <button
                  className={adminButtonClass}
                  onClick={() => {
                    assignAgentRiskFlag().catch(() => {});
                  }}
                  type="button"
                >
                  Record assignment
                </button>
              </div>
            </div>
          </Panel>
        </section>
      ) : null}

      {activeTab === "personalization" ? (
        <section className="mt-4 space-y-4">
          <Panel
            subtitle="Inspect profile graph and explain evaluation gates in order."
            title="Personalization Inspector"
          >
            <label className={adminLabelClass}>
              user id
              <input
                className={adminInputClass}
                onChange={(event) => setUserId(event.currentTarget.value)}
                value={userId}
              />
            </label>

            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {Object.entries(policyFlags).map(([flag, enabled]) => (
                <label
                  className="flex items-center gap-2 rounded-xl border border-slate-700 bg-night px-3 py-2 text-xs text-slate-200"
                  key={flag}
                >
                  <input
                    checked={enabled}
                    onChange={(event) =>
                      setPolicyFlags((current) => ({
                        ...current,
                        [flag]: event.currentTarget.checked,
                      }))
                    }
                    type="checkbox"
                  />
                  {flag}
                </label>
              ))}
            </div>

            <label className={`${adminLabelClass} mt-3`}>
              policy context (json object)
              <textarea
                className={`${adminInputClass} min-h-24`}
                onChange={(event) =>
                  setPolicyContextInput(event.currentTarget.value)
                }
                value={policyContextInput}
              />
            </label>

            <div className="mt-3 flex flex-wrap gap-2">
              <button
                className={adminButtonClass}
                onClick={inspectLifeGraph}
                type="button"
              >
                Inspect life graph
              </button>
              <button
                className={adminButtonGhostClass}
                onClick={explainPolicy}
                type="button"
              >
                Explain policy
              </button>
              <button
                className={adminButtonGhostClass}
                onClick={resetLearnedMemory}
                type="button"
              >
                Reset learned memory
              </button>
            </div>
          </Panel>

          <div className="grid gap-4 lg:grid-cols-3">
            <Panel title="Life Graph Snapshot">
              <JsonView value={lifeGraphSnapshot} />
            </Panel>
            <Panel title="Policy Explanation">
              <JsonView value={policyExplainSnapshot} />
            </Panel>
            <Panel title="Memory Reset Result">
              <JsonView value={memoryResetSnapshot} />
            </Panel>
          </div>
        </section>
      ) : null}

      {activeTab === "agent" ? (
        <section className="mt-4 space-y-4">
          <Panel
            subtitle="Investigate agent-thread history, append test events, and observe SSE in real time."
            title="Agent Traces"
          >
            <div className="grid gap-3 md:grid-cols-2">
              <label className={adminLabelClass}>
                thread id
                <input
                  className={adminInputClass}
                  onChange={(event) => setThreadId(event.currentTarget.value)}
                  value={threadId}
                />
              </label>
              <label className={adminLabelClass}>
                acting user id
                <input
                  className={adminInputClass}
                  onChange={(event) =>
                    setActingUserId(event.currentTarget.value)
                  }
                  value={actingUserId}
                />
              </label>
            </div>

            <label className={`${adminLabelClass} mt-3`}>
              inject message
              <textarea
                className={`${adminInputClass} min-h-24`}
                onChange={(event) => setAgentMessage(event.currentTarget.value)}
                value={agentMessage}
              />
            </label>

            <div className="mt-3 flex flex-wrap gap-2">
              <button
                className={adminButtonGhostClass}
                onClick={() => {
                  void loadPrimaryAgentThreadFromSession();
                }}
                type="button"
              >
                Load my thread id
              </button>
              <button
                className={adminButtonClass}
                onClick={inspectAgentThread}
                type="button"
              >
                Inspect trace
              </button>
              <button
                className={adminButtonGhostClass}
                onClick={postAgentMessage}
                type="button"
              >
                Insert thread message
              </button>
              <button
                className={adminButtonClass}
                onClick={runAgenticRespond}
                type="button"
              >
                Run agentic respond
              </button>
              <button
                className={adminButtonGhostClass}
                onClick={startAgentStream}
                type="button"
              >
                Start live stream
              </button>
              <button
                className={adminButtonGhostClass}
                onClick={stopAgentStream}
                type="button"
              >
                Stop stream
              </button>
              <button
                className={adminButtonGhostClass}
                onClick={() => setStreamEvents([])}
                type="button"
              >
                Clear stream log
              </button>
              <span className="rounded-full border border-slate-700 px-3 py-2 text-xs text-slate-200">
                stream: {streamStatus}
              </span>
            </div>
          </Panel>

          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title="Thread Messages">
              <JsonView value={agentTraceSnapshot} />
            </Panel>
            <Panel title="Live Stream Events">
              {streamEvents.length === 0 ? (
                <p className="text-sm text-ash">
                  No stream events captured. Start stream to begin tracing.
                </p>
              ) : (
                <div className="space-y-2">
                  {streamEvents.map((event) => (
                    <article
                      className="rounded-xl border border-slate-700 bg-night px-3 py-2"
                      key={event.id}
                    >
                      <p className="text-xs text-ash">
                        {event.at} · {event.kind}
                      </p>
                      <pre className="mt-1 max-h-28 overflow-auto text-xs text-slate-200">
                        {JSON.stringify(event.payload, null, 2)}
                      </pre>
                    </article>
                  ))}
                </div>
              )}
            </Panel>
          </div>
        </section>
      ) : null}
    </AdminShell>
  );
}
