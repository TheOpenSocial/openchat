"use client";

export const dynamic = "force-dynamic";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";

import { AdminShell } from "./components/AdminShell";
import { AdminSignIn } from "./components/AdminSignIn";
import { AppLoading } from "./components/AppLoading";
import { useAdminApiActions } from "./components/workbench/useAdminApiActions";
import { useAgentStream } from "./components/workbench/useAgentStream";
import { WorkbenchContent } from "./components/workbench/WorkbenchContent";
import { useWorkbenchState } from "./components/workbench/useWorkbenchState";
import { useModerationWorkbench } from "./components/workbench/useModerationWorkbench";
import {
  type AdminTab,
  type OnboardingActivationSnapshot,
  tabConfig,
  tabSubtitle,
} from "./components/workbench/workbench-config";
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
  configureAdminApiAuthLifecycle,
  fetchGoogleOAuthStartUrl,
} from "./lib/api";

interface DeadLetterRow {
  id: string;
  queueName: string;
  jobName: string;
  attempts: number;
  lastError: string;
  createdAt: string;
}

const DEBUG_HISTORY_LIMIT = 20;
const ADMIN_LOCALE_STORAGE_KEY = "opensocial.admin.locale.v1";

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

function createHistoryId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function AdminHomeContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [locale, setLocale] = useState<AppLocale>("en");
  const [sessionHydrated, setSessionHydrated] = useState(false);
  const [signedInSession, setSignedInSession] = useState<AdminSession | null>(
    null,
  );
  const [signInError, setSignInError] = useState<string | null>(null);

  const {
    DEFAULT_UUID,
    activeTab,
    setActiveTab,
    busyKey,
    setBusyKey,
    banner,
    setBanner,
    health,
    setHealth,
    relayCount,
    setRelayCount,
    onboardingActivationSnapshot,
    setOnboardingActivationSnapshot,
    deadLetters,
    setDeadLetters,
    adminUserId,
    setAdminUserId,
    adminRole,
    setAdminRole,
    userId,
    setUserId,
    intentId,
    setIntentId,
    chatId,
    setChatId,
    threadId,
    setThreadId,
    revokeSessionId,
    setRevokeSessionId,
    actingUserId,
    setActingUserId,
    messageId,
    setMessageId,
    moderatorUserId,
    setModeratorUserId,
    hideReason,
    setHideReason,
    syncAfter,
    setSyncAfter,
    groupSizeTarget,
    setGroupSizeTarget,
    policyContextInput,
    setPolicyContextInput,
    policyFlags,
    setPolicyFlags,
    agentMessage,
    setAgentMessage,
    debugMethod,
    setDebugMethod,
    debugPath,
    setDebugPath,
    debugQueryInput,
    setDebugQueryInput,
    debugBodyInput,
    setDebugBodyInput,
    debugResponse,
    setDebugResponse,
    debugHistory,
    setDebugHistory,
    streamStatus,
    setStreamStatus,
    streamEvents,
    setStreamEvents,
    streamRef,
    profileSnapshot,
    setProfileSnapshot,
    trustSnapshot,
    setTrustSnapshot,
    ruleSnapshot,
    setRuleSnapshot,
    interestSnapshot,
    setInterestSnapshot,
    topicSnapshot,
    setTopicSnapshot,
    availabilitySnapshot,
    setAvailabilitySnapshot,
    photoSnapshot,
    setPhotoSnapshot,
    sessionSnapshot,
    setSessionSnapshot,
    inboxSnapshot,
    setInboxSnapshot,
    recurringCircleSnapshot,
    setRecurringCircleSnapshot,
    recurringCircleSessionSnapshot,
    setRecurringCircleSessionSnapshot,
    savedSearchSnapshot,
    setSavedSearchSnapshot,
    scheduledTaskSnapshot,
    setScheduledTaskSnapshot,
    scheduledTaskRunsSnapshot,
    setScheduledTaskRunsSnapshot,
    discoveryPassiveSnapshot,
    setDiscoveryPassiveSnapshot,
    discoveryInboxSnapshot,
    setDiscoveryInboxSnapshot,
    pendingIntentSummarySnapshot,
    setPendingIntentSummarySnapshot,
    continuityIntentExplainSnapshot,
    setContinuityIntentExplainSnapshot,
    searchQuery,
    setSearchQuery,
    searchSnapshot,
    setSearchSnapshot,
    intentExplainSnapshot,
    setIntentExplainSnapshot,
    intentUserExplainSnapshot,
    setIntentUserExplainSnapshot,
    intentActionSnapshot,
    setIntentActionSnapshot,
    chatMessagesSnapshot,
    setChatMessagesSnapshot,
    chatMetadataSnapshot,
    setChatMetadataSnapshot,
    chatSyncSnapshot,
    setChatSyncSnapshot,
    deactivateReason,
    setDeactivateReason,
    restrictReason,
    setRestrictReason,
    lifeGraphSnapshot,
    setLifeGraphSnapshot,
    policyExplainSnapshot,
    setPolicyExplainSnapshot,
    memoryResetSnapshot,
    setMemoryResetSnapshot,
    agentTraceSnapshot,
    setAgentTraceSnapshot,
  } = useWorkbenchState();

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

  const { requestApi, requestApiNullable, runAction } = useAdminApiActions({
    accessToken: signedInSession?.accessToken,
    adminRole,
    adminUserId,
    setBusyKey,
    setBanner,
  });

  const { startAgentStream, stopAgentStream } = useAgentStream({
    accessToken: signedInSession?.accessToken,
    setBanner,
    setStreamEvents,
    setStreamStatus,
    streamRef,
    threadId,
  });

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

  const loadOnboardingActivationSnapshot = () =>
    runAction(
      "Load onboarding activation snapshot",
      () =>
        requestApi<OnboardingActivationSnapshot>(
          "GET",
          "/admin/ops/onboarding-activation",
          {
            query: {
              hours: 24,
            },
          },
        ),
      "Onboarding activation snapshot refreshed.",
      (snapshot) => setOnboardingActivationSnapshot(snapshot),
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

  const moderation = useModerationWorkbench({
    activeTab,
    requestApi,
    runAction,
    setBanner,
  });

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
      (payload) => moderation.setModerationSnapshot(payload),
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
      (payload) => moderation.setModerationSnapshot(payload),
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
      <WorkbenchContent
        activeTab={activeTab}
        agentProps={{
          actingUserId,
          adminButtonClass,
          adminButtonGhostClass,
          adminInputClass,
          adminLabelClass,
          agentMessage,
          agentTraceSnapshot,
          inspectAgentThread,
          loadPrimaryAgentThreadFromSession,
          postAgentMessage,
          runAgenticRespond,
          setActingUserId,
          setAgentMessage,
          setStreamEvents,
          setThreadId,
          startAgentStream,
          stopAgentStream,
          streamEvents,
          streamStatus,
          threadId,
        }}
        banner={banner}
        chatsProps={{
          actingUserId,
          adminButtonClass,
          adminButtonDangerClass,
          adminButtonGhostClass,
          adminInputClass,
          adminLabelClass,
          chatId,
          chatMessagesSnapshot,
          chatMetadataSnapshot,
          chatSyncSnapshot,
          hideChatMessage,
          hideReason,
          inspectChat,
          leaveChat,
          messageId,
          moderatorUserId,
          repairChatFlow,
          setActingUserId,
          setChatId,
          setHideReason,
          setMessageId,
          setModeratorUserId,
          setSyncAfter,
          syncAfter,
          syncChat,
        }}
        intentsProps={{
          adminButtonClass,
          adminButtonGhostClass,
          adminInputClass,
          adminLabelClass,
          cancelIntent,
          convertIntent,
          groupSizeTarget,
          inspectIntent,
          intentActionSnapshot,
          intentExplainSnapshot,
          intentId,
          intentUserExplainSnapshot,
          retryIntent,
          setGroupSizeTarget,
          setIntentId,
          setThreadId,
          setUserId,
          threadId,
          userId,
          widenIntent,
        }}
        moderationProps={{
          adminButtonClass,
          adminButtonGhostClass,
          adminInputClass,
          adminLabelClass,
          agentRiskDecisionQuery: moderation.agentRiskDecisionQuery,
          agentRiskItems: moderation.agentRiskItems,
          agentRiskLimit: moderation.agentRiskLimit,
          agentRiskSnapshot: moderation.agentRiskSnapshot,
          agentRiskStatusQuery: moderation.agentRiskStatusQuery,
          assignAgentRiskFlag: moderation.assignAgentRiskFlag,
          assignFlagId: moderation.assignFlagId,
          assignReason: moderation.assignReason,
          assigneeUserId: moderation.assigneeUserId,
          auditLogLimit: moderation.auditLogLimit,
          auditLogSnapshot: moderation.auditLogSnapshot,
          blockedUserId: moderation.blockedUserId,
          blockerUserId: moderation.blockerUserId,
          createBlock: moderation.createBlock,
          createReport: moderation.createReport,
          loadAgentRiskFlags: moderation.loadAgentRiskFlags,
          loadAuditLogs: moderation.loadAuditLogs,
          loadModerationQueue: moderation.loadModerationQueue,
          loadModerationSettings: moderation.loadModerationSettings,
          loadModerationSummary: moderation.loadModerationSummary,
          moderationQueueEntityTypeQuery:
            moderation.moderationQueueEntityTypeQuery,
          moderationQueueItems: moderation.moderationQueueItems,
          moderationQueueLimit: moderation.moderationQueueLimit,
          moderationQueueReasonQuery: moderation.moderationQueueReasonQuery,
          moderationQueueSnapshot: moderation.moderationQueueSnapshot,
          moderationQueueStatusQuery: moderation.moderationQueueStatusQuery,
          moderationSettingsSnapshot: moderation.moderationSettingsSnapshot,
          moderationSnapshot: moderation.moderationSnapshot,
          moderationSummarySnapshot: moderation.moderationSummarySnapshot,
          primeTriageFromFlag: moderation.primeTriageFromFlag,
          reportDetails: moderation.reportDetails,
          reportReason: moderation.reportReason,
          reporterUserId: moderation.reporterUserId,
          setAgentRiskDecisionQuery: moderation.setAgentRiskDecisionQuery,
          setAgentRiskLimit: moderation.setAgentRiskLimit,
          setAgentRiskStatusQuery: moderation.setAgentRiskStatusQuery,
          setAssignFlagId: moderation.setAssignFlagId,
          setAssignReason: moderation.setAssignReason,
          setAssigneeUserId: moderation.setAssigneeUserId,
          setAuditLogLimit: moderation.setAuditLogLimit,
          setBlockedUserId: moderation.setBlockedUserId,
          setBlockerUserId: moderation.setBlockerUserId,
          setModerationQueueEntityTypeQuery:
            moderation.setModerationQueueEntityTypeQuery,
          setModerationQueueLimit: moderation.setModerationQueueLimit,
          setModerationQueueReasonQuery:
            moderation.setModerationQueueReasonQuery,
          setModerationQueueSnapshot: moderation.setModerationQueueSnapshot,
          setModerationQueueStatusQuery:
            moderation.setModerationQueueStatusQuery,
          setReportDetails: moderation.setReportDetails,
          setReportReason: moderation.setReportReason,
          setReporterUserId: moderation.setReporterUserId,
          setTargetUserId: moderation.setTargetUserId,
          setTriageAction: moderation.setTriageAction,
          setTriageFlagId: moderation.setTriageFlagId,
          setTriageReason: moderation.setTriageReason,
          setTriageTargetUserId: moderation.setTriageTargetUserId,
          targetUserId: moderation.targetUserId,
          triageAction: moderation.triageAction,
          triageAgentRiskFlag: moderation.triageAgentRiskFlag,
          triageFlagId: moderation.triageFlagId,
          triageReason: moderation.triageReason,
          triageTargetUserId: moderation.triageTargetUserId,
        }}
        overviewProps={{
          adminButtonClass,
          adminButtonGhostClass,
          adminInputClass,
          adminLabelClass,
          adminRole,
          adminUserId,
          deadLetters,
          debugBodyInput,
          debugHistory,
          debugMethod,
          debugPath,
          debugQueryInput,
          debugResponse,
          executeDebugQuery,
          health,
          loadDeadLetters,
          loadOnboardingActivationSnapshot,
          onboardingActivationSnapshot,
          relayCount,
          relayOutbox,
          replayDeadLetter,
          setAdminRole,
          setAdminUserId,
          setDebugBodyInput,
          setDebugMethod,
          setDebugPath,
          setDebugQueryInput,
          setThreadId,
          setUserId,
          threadId,
          userId,
        }}
        personalizationProps={{
          adminButtonClass,
          adminButtonGhostClass,
          adminInputClass,
          adminLabelClass,
          explainPolicy,
          inspectLifeGraph,
          lifeGraphSnapshot,
          memoryResetSnapshot,
          policyContextInput,
          policyExplainSnapshot,
          policyFlags,
          resetLearnedMemory,
          setPolicyContextInput,
          setPolicyFlags,
          setUserId,
          userId,
        }}
        tabSubtitle={tabSubtitle}
        userInspectorProps={{
          adminButtonClass,
          adminButtonDangerClass,
          adminButtonGhostClass,
          adminInputClass,
          adminLabelClass,
          availabilitySnapshot,
          continuityIntentExplainSnapshot,
          deactivateReason,
          deactivateUser,
          discoveryInboxSnapshot,
          discoveryPassiveSnapshot,
          inboxSnapshot,
          inspectUser,
          interestSnapshot,
          pendingIntentSummarySnapshot,
          photoSnapshot,
          profileSnapshot,
          recurringCircleSessionSnapshot,
          recurringCircleSnapshot,
          restrictReason,
          restrictUser,
          revokeAllSessions,
          revokeSession,
          revokeSessionId,
          ruleSnapshot,
          runSearch,
          savedSearchSnapshot,
          scheduledTaskRunsSnapshot,
          scheduledTaskSnapshot,
          searchQuery,
          searchSnapshot,
          sendDigest,
          sessionSnapshot,
          setDeactivateReason,
          setRestrictReason,
          setRevokeSessionId,
          setSearchQuery,
          setUserId,
          summarizePendingIntents,
          topicSnapshot,
          trustSnapshot,
          userId,
        }}
      />
    </AdminShell>
  );
}

export default function AdminHome() {
  return (
    <Suspense fallback={<AppLoading />}>
      <AdminHomeContent />
    </Suspense>
  );
}
