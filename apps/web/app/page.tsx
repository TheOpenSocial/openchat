"use client";

import {
  agentThreadMessagesToTranscript,
  extractResponseTokenDelta,
  type AgentTranscriptRow,
} from "@opensocial/types";
import { Home, MessageSquare, UserRound } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";

import { BrandSignInLayout } from "../src/components/BrandSignInLayout";
import { ChatBubble } from "../src/components/ChatBubble";
import { GoogleMark } from "../src/components/GoogleMark";
import { EmptyState } from "../src/components/EmptyState";
import { InlineNotice } from "../src/components/InlineNotice";
import { SurfaceCard } from "../src/components/SurfaceCard";
import { useBrowserOnline } from "../src/hooks/use-browser-online";
import { usePrimaryAgentThread } from "../src/hooks/use-primary-agent-thread";
import { type AppLocale, supportedLocales, t } from "../src/i18n/strings";
import {
  api,
  buildAgentThreadStreamUrl,
  ChatMessageRecord,
  DiscoveryInboxSuggestionsResponse,
  PassiveDiscoveryResponse,
  PendingIntentsSummaryResponse,
  RecurringCircleRecord,
  RecurringCircleSessionRecord,
  SavedSearchRecord,
  ScheduledTaskRecord,
  ScheduledTaskRunRecord,
  SearchSnapshotResponse,
  UserIntentExplanation,
  configureApiAuthLifecycle,
  getGoogleOAuthStartUrl,
  isOfflineApiError,
  isRetryableApiError,
} from "../src/lib/api";
import { openAgentThreadSse } from "../src/lib/agent-thread-sse";
import {
  clearStoredSession,
  loadStoredSession,
  saveStoredSession,
} from "../src/lib/session";
import { WebDesignMockApp } from "../src/WebDesignMockApp";
import {
  AppStage,
  HomeTab,
  SocialMode,
  UserProfileDraft,
  WebSession,
} from "../src/types";

const webDesignMock =
  process.env.NEXT_PUBLIC_DESIGN_MOCK === "1" ||
  process.env.NEXT_PUBLIC_DESIGN_MOCK === "true";

function parseOptionalImageAttachmentUrl(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) {
    return undefined;
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return undefined;
    }
    return [{ kind: "image_url" as const, url: trimmed }];
  } catch {
    return undefined;
  }
}

interface ChatThread {
  id: string;
  connectionId: string;
  title: string;
  messages: ChatMessageRecord[];
}

const tabLabels: Record<HomeTab, string> = {
  home: "Home",
  chats: "Chats",
  profile: "Profile",
};

const tabDescriptions: Record<HomeTab, string> = {
  home: "Chat with your agent and follow each step as it runs.",
  chats: "Private threads with people you’ve connected with.",
  profile: "Preferences, notifications, and account.",
};

const homeTabIcon = {
  home: Home,
  chats: MessageSquare,
  profile: UserRound,
} as const;

const interestOptions = [
  "Football",
  "Gaming",
  "Tennis",
  "Startups",
  "Design",
  "AI",
];

const WELCOME_HIGHLIGHTS = [
  {
    title: "Plans, not endless feeds",
    body: "Say what you want to do or who you’d like to meet—we surface people and paths that fit, instead of noise.",
  },
  {
    title: "One thread, clear next steps",
    body: "Plan, chat, and follow progress in one place so you always know what’s happening and what to do next.",
  },
  {
    title: "Private when it matters",
    body: "Chats, requests, and your profile stay between you and the people you choose to connect with.",
  },
] as const;

function ProductionWebPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [locale, setLocale] = useState<AppLocale>("en");
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [stage, setStage] = useState<AppStage>("auth");
  const [session, setSession] = useState<WebSession | null>(null);
  const [authCode, setAuthCode] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [onboardingLoading, setOnboardingLoading] = useState(false);
  const [displayName, setDisplayName] = useState("Explorer");
  const [banner, setBanner] = useState<{
    tone: "info" | "error" | "success";
    text: string;
  } | null>(null);
  const [profile, setProfile] = useState<UserProfileDraft>({
    displayName: "Explorer",
    bio: "",
    city: "",
    country: "",
    interests: ["Football", "AI"],
    socialMode: "one_to_one",
    notificationMode: "live",
  });
  const [activeTab, setActiveTab] = useState<HomeTab>("home");
  const [intentDraft, setIntentDraft] = useState("");
  const [agentVoiceDraft, setAgentVoiceDraft] = useState("");
  const [agentImageDraft, setAgentImageDraft] = useState("");
  const [agentTimeline, setAgentTimeline] = useState<AgentTranscriptRow[]>([
    {
      id: "seed_1",
      role: "agent",
      body: "What would you like to do today—or who would you like to meet?",
    },
  ]);
  const [agentComposerMode, setAgentComposerMode] = useState<"chat" | "intent">(
    "chat",
  );
  const [intentSending, setIntentSending] = useState(false);
  const [decomposeIntent, setDecomposeIntent] = useState(true);
  const [decomposeMaxIntents, setDecomposeMaxIntents] = useState(3);
  const netOnline = useBrowserOnline();
  const agentThreadSyncEnabled = Boolean(session) && stage === "home";
  const { loading: agentThreadLoading, threadId: agentThreadId } =
    usePrimaryAgentThread({
      accessToken: session?.accessToken ?? "",
      enabled: agentThreadSyncEnabled,
      onHydrated: setAgentTimeline,
      onLoadError: () =>
        setBanner({
          tone: "error",
          text: "Could not load your conversation.",
        }),
    });
  const [chatThreads, setChatThreads] = useState<ChatThread[]>([]);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [chatDraft, setChatDraft] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const [trustSummary, setTrustSummary] = useState("trust profile not loaded");
  const [recurringCircles, setRecurringCircles] = useState<
    RecurringCircleRecord[]
  >([]);
  const [selectedCircleId, setSelectedCircleId] = useState<string | null>(null);
  const [recurringSessions, setRecurringSessions] = useState<
    RecurringCircleSessionRecord[]
  >([]);
  const [circlesBusy, setCirclesBusy] = useState(false);
  const [passiveDiscovery, setPassiveDiscovery] =
    useState<PassiveDiscoveryResponse | null>(null);
  const [inboxSuggestions, setInboxSuggestions] =
    useState<DiscoveryInboxSuggestionsResponse | null>(null);
  const [pendingIntentSummary, setPendingIntentSummary] =
    useState<PendingIntentsSummaryResponse | null>(null);
  const [selectedIntentId, setSelectedIntentId] = useState<string | null>(null);
  const [userIntentExplanation, setUserIntentExplanation] =
    useState<UserIntentExplanation | null>(null);
  const [discoveryBusy, setDiscoveryBusy] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchSnapshot, setSearchSnapshot] =
    useState<SearchSnapshotResponse | null>(null);
  const [searchBusy, setSearchBusy] = useState(false);
  const [memoryBusy, setMemoryBusy] = useState(false);
  const [memorySnapshot, setMemorySnapshot] = useState<{
    lifeGraph: Record<string, unknown> | null;
    retrieval: Record<string, unknown> | null;
  }>({ lifeGraph: null, retrieval: null });
  const [savedSearches, setSavedSearches] = useState<SavedSearchRecord[]>([]);
  const [scheduledTasks, setScheduledTasks] = useState<ScheduledTaskRecord[]>(
    [],
  );
  const [selectedScheduledTaskId, setSelectedScheduledTaskId] = useState<
    string | null
  >(null);
  const [scheduledTaskRuns, setScheduledTaskRuns] = useState<
    ScheduledTaskRunRecord[]
  >([]);
  const [automationsBusy, setAutomationsBusy] = useState(false);

  useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab === "home" || tab === "chats" || tab === "profile") {
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

  const selectedChat = useMemo(
    () => chatThreads.find((thread) => thread.id === selectedChatId) ?? null,
    [chatThreads, selectedChatId],
  );
  const selectedCircle = useMemo(
    () =>
      recurringCircles.find((circle) => circle.id === selectedCircleId) ?? null,
    [recurringCircles, selectedCircleId],
  );
  const selectedScheduledTask = useMemo(
    () =>
      scheduledTasks.find((task) => task.id === selectedScheduledTaskId) ??
      null,
    [scheduledTasks, selectedScheduledTaskId],
  );

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const stored = window.localStorage.getItem("opensocial.web.locale");
    if (stored && supportedLocales.includes(stored as AppLocale)) {
      setLocale(stored as AppLocale);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem("opensocial.web.locale", locale);
  }, [locale]);

  useEffect(() => {
    configureApiAuthLifecycle({
      onSessionRefreshed: (tokens) => {
        setSession((current) => {
          if (!current) {
            return current;
          }
          const next = {
            ...current,
            ...tokens,
          };
          saveStoredSession({
            ...next,
            profileCompleted: true,
            onboardingState: "completed",
          });
          return next;
        });
      },
      onAuthFailure: () => {
        setSession(null);
        setStage("auth");
        setBanner({
          tone: "error",
          text: "Session expired. Sign in again.",
        });
      },
    });
    return () => {
      configureApiAuthLifecycle({});
    };
  }, []);

  useEffect(() => {
    if (!session || activeTab !== "profile") {
      return;
    }
    setAutomationsBusy(true);
    Promise.all([
      api.listSavedSearches(session.userId, session.accessToken),
      api.listScheduledTasks(
        session.userId,
        { limit: 20 },
        session.accessToken,
      ),
    ])
      .then(([searches, tasks]) => {
        setSavedSearches(searches);
        setScheduledTasks(tasks);
        setSelectedScheduledTaskId((current) => {
          if (current && tasks.some((task) => task.id === current)) {
            return current;
          }
          return tasks[0]?.id ?? null;
        });
      })
      .catch((error) => {
        setBanner({
          tone: "error",
          text: `Could not load automations: ${String(error)}`,
        });
      })
      .finally(() => {
        setAutomationsBusy(false);
      });
  }, [activeTab, session]);

  useEffect(() => {
    if (!session || !selectedScheduledTaskId || activeTab !== "profile") {
      setScheduledTaskRuns([]);
      return;
    }
    api
      .listScheduledTaskRuns(selectedScheduledTaskId, 8, session.accessToken)
      .then((runs) => {
        setScheduledTaskRuns(runs);
      })
      .catch((error) => {
        setBanner({
          tone: "error",
          text: `Could not load task runs: ${String(error)}`,
        });
      });
  }, [activeTab, selectedScheduledTaskId, session]);

  useEffect(() => {
    if (!session || activeTab !== "profile") {
      return;
    }
    setCirclesBusy(true);
    api
      .listRecurringCircles(session.userId, session.accessToken)
      .then((circles) => {
        setRecurringCircles(circles);
        setSelectedCircleId((current) => {
          if (current && circles.some((circle) => circle.id === current)) {
            return current;
          }
          return circles[0]?.id ?? null;
        });
      })
      .catch((error) => {
        setBanner({
          tone: "error",
          text: `Could not load circles: ${String(error)}`,
        });
      })
      .finally(() => {
        setCirclesBusy(false);
      });
  }, [activeTab, session]);

  useEffect(() => {
    if (!session || !selectedCircleId || activeTab !== "profile") {
      setRecurringSessions([]);
      return;
    }
    api
      .listRecurringCircleSessions(selectedCircleId, session.accessToken)
      .then((sessions) => {
        setRecurringSessions(sessions);
      })
      .catch((error) => {
        setBanner({
          tone: "error",
          text: `Could not load circle sessions: ${String(error)}`,
        });
      });
  }, [activeTab, selectedCircleId, session]);

  useEffect(() => {
    if (!session || activeTab !== "profile") {
      return;
    }
    setDiscoveryBusy(true);
    Promise.all([
      api.getPassiveDiscovery(session.userId, 3, session.accessToken),
      api.getDiscoveryInboxSuggestions(session.userId, 4, session.accessToken),
      api.summarizePendingIntents(session.userId, 8, session.accessToken),
    ])
      .then(([passive, inbox, pending]) => {
        setPassiveDiscovery(passive);
        setInboxSuggestions(inbox);
        setPendingIntentSummary(pending);
        setSelectedIntentId((current) => {
          if (
            current &&
            pending.intents.some((intent) => intent.intentId === current)
          ) {
            return current;
          }
          return pending.intents[0]?.intentId ?? null;
        });
      })
      .catch((error) => {
        setBanner({
          tone: "error",
          text: `Could not load discovery snapshots: ${String(error)}`,
        });
      })
      .finally(() => {
        setDiscoveryBusy(false);
      });
  }, [activeTab, session]);

  useEffect(() => {
    if (!session || !selectedIntentId || activeTab !== "profile") {
      setUserIntentExplanation(null);
      return;
    }
    api
      .getUserIntentExplanation(selectedIntentId, session.accessToken)
      .then((explanation) => {
        setUserIntentExplanation(explanation);
      })
      .catch((error) => {
        setBanner({
          tone: "error",
          text: `Could not load intent explanation: ${String(error)}`,
        });
      });
  }, [activeTab, selectedIntentId, session]);

  useEffect(() => {
    const restore = async () => {
      let stored: ReturnType<typeof loadStoredSession> | null = null;
      try {
        stored = loadStoredSession();
        if (!stored) {
          setStage("auth");
          return;
        }

        const completion = await api.getProfileCompletion(
          stored.userId,
          stored.accessToken,
        );
        const restoredDisplayName = stored.displayName;
        setSession(stored);
        setDisplayName(restoredDisplayName);
        setProfile((current) => ({
          ...current,
          displayName: restoredDisplayName,
        }));
        setStage(completion.completed ? "home" : "onboarding");
        saveStoredSession({
          ...stored,
          profileCompleted: completion.completed,
          onboardingState: completion.onboardingState,
        });
      } catch (error) {
        if (
          stored &&
          (isRetryableApiError(error) || isOfflineApiError(error))
        ) {
          const restoredDisplayName = stored.displayName;
          setSession(stored);
          setDisplayName(restoredDisplayName);
          setProfile((current) => ({
            ...current,
            displayName: restoredDisplayName,
          }));
          setStage(stored.profileCompleted ? "home" : "onboarding");
          setBanner({
            tone: "info",
            text: "You appear to be offline. Restored your saved session and will refresh when the connection returns.",
          });
        } else {
          clearStoredSession();
          setStage("auth");
        }
      } finally {
        setIsBootstrapping(false);
      }
    };

    restore().catch(() => {
      setIsBootstrapping(false);
      setStage("auth");
    });
  }, []);

  useEffect(() => {
    if (!session || stage !== "home") {
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    const refreshDashboard = async () => {
      if (!netOnline) {
        return;
      }
      try {
        const [globalRules, trust] = await Promise.all([
          api.getGlobalRules(session.userId, session.accessToken),
          api.getTrustProfile(session.userId, session.accessToken),
        ]);
        if (cancelled) {
          return;
        }

        setProfile((current) => ({
          ...current,
          notificationMode:
            globalRules.notificationMode === "digest" ? "digest" : "live",
        }));

        setTrustSummary(
          `badge: ${String(trust.verificationBadge ?? "unknown")} · reputation: ${String(
            trust.reputationScore ?? "n/a",
          )}`,
        );
      } catch (error) {
        if (!cancelled) {
          setBanner({
            tone: "error",
            text: `Could not refresh dashboard: ${String(error)}`,
          });
        }
      }
    };

    refreshDashboard().catch(() => {});
    timer = setInterval(() => {
      refreshDashboard().catch(() => {});
    }, 28_000);

    return () => {
      cancelled = true;
      if (timer) {
        clearInterval(timer);
      }
    };
  }, [netOnline, session, stage]);

  const allowWebDemoAuth =
    process.env.NODE_ENV === "development" ||
    process.env.NEXT_PUBLIC_ALLOW_WEB_DEMO_AUTH === "1" ||
    process.env.NEXT_PUBLIC_ALLOW_WEB_DEMO_AUTH === "true";

  const startGoogleOAuth = async () => {
    setAuthLoading(true);
    setBanner(null);
    try {
      const callbackUrl = `${window.location.origin}/auth/callback`;
      const url = await getGoogleOAuthStartUrl(callbackUrl);
      window.location.assign(url);
    } catch (error) {
      setAuthLoading(false);
      setBanner({
        tone: "error",
        text: `Could not start Google sign-in: ${String(error)}`,
      });
    }
  };

  const authenticateWithDemoCode = async () => {
    setAuthLoading(true);
    setBanner(null);
    try {
      const auth = await api.authGoogleCallback(authCode.trim() || "demo-web");
      const nextSession: WebSession = {
        userId: auth.user.id,
        displayName: auth.user.displayName,
        email: auth.user.email,
        accessToken: auth.accessToken,
        refreshToken: auth.refreshToken,
        sessionId: auth.sessionId,
      };
      saveStoredSession({
        ...nextSession,
        profileCompleted: false,
        onboardingState: "started",
      });

      const completion = await api.getProfileCompletion(
        nextSession.userId,
        nextSession.accessToken,
      );
      setSession(nextSession);
      setDisplayName(nextSession.displayName);
      setProfile((current) => ({
        ...current,
        displayName: nextSession.displayName,
      }));
      setStage(completion.completed ? "home" : "onboarding");
      saveStoredSession({
        ...nextSession,
        profileCompleted: completion.completed,
        onboardingState: completion.onboardingState,
      });
      setBanner({
        tone: "success",
        text: "Authenticated and session persisted.",
      });
    } catch (error) {
      setBanner({
        tone: "error",
        text: `Auth failed: ${String(error)}`,
      });
    } finally {
      setAuthLoading(false);
    }
  };

  const completeOnboarding = async () => {
    if (!session) {
      setBanner({
        tone: "error",
        text: "Session missing. Sign in again.",
      });
      return;
    }

    if (
      profile.bio.trim().length === 0 ||
      profile.city.trim().length === 0 ||
      profile.country.trim().length === 0 ||
      profile.interests.length === 0
    ) {
      setBanner({
        tone: "error",
        text: "Complete bio, city, country, and at least one interest.",
      });
      return;
    }

    setOnboardingLoading(true);
    try {
      await api.updateProfile(
        session.userId,
        {
          bio: profile.bio.trim(),
          city: profile.city.trim(),
          country: profile.country.trim(),
          visibility: "public",
        },
        session.accessToken,
      );
      await Promise.all([
        api.replaceInterests(
          session.userId,
          profile.interests.map((interest) => ({
            kind: "topic",
            label: interest,
          })),
          session.accessToken,
        ),
        api.replaceTopics(
          session.userId,
          profile.interests.map((interest) => ({ label: interest })),
          session.accessToken,
        ),
        api.setSocialMode(
          session.userId,
          socialModeToPayload(profile.socialMode),
          session.accessToken,
        ),
        api.setGlobalRules(
          session.userId,
          {
            whoCanContact: "anyone",
            reachable: "always",
            intentMode:
              profile.socialMode === "one_to_one"
                ? "one_to_one"
                : profile.socialMode === "group"
                  ? "group"
                  : "balanced",
            modality: "either",
            languagePreferences: ["en", "es"],
            requireVerifiedUsers: false,
            notificationMode:
              profile.notificationMode === "digest" ? "digest" : "immediate",
            agentAutonomy: "suggest_only",
            memoryMode: "standard",
          },
          session.accessToken,
        ),
      ]);
      setStage("home");
      setBanner({
        tone: "success",
        text: "Onboarding saved.",
      });
    } catch (error) {
      setBanner({
        tone: "error",
        text: `Onboarding failed: ${String(error)}`,
      });
    } finally {
      setOnboardingLoading(false);
    }
  };

  const sendIntent = async () => {
    if (!session || intentDraft.trim().length === 0 || intentSending) {
      return;
    }

    if (!netOnline) {
      setBanner({
        tone: "error",
        text: t("sendBlockedOffline", locale),
      });
      return;
    }

    const text = intentDraft.trim();
    const voiceForAgent =
      agentComposerMode === "chat" ? agentVoiceDraft.trim() : "";
    const imageExtras =
      agentComposerMode === "chat"
        ? parseOptionalImageAttachmentUrl(agentImageDraft)
        : undefined;
    const marker = Date.now().toString(36);
    const useAgentChat = agentComposerMode === "chat" && Boolean(agentThreadId);
    const useIntentAgentEndpoint =
      agentComposerMode === "intent" && Boolean(agentThreadId);
    const workflowBody = useAgentChat
      ? t("agentWorkflowThinking", locale)
      : t("agentWorkflowRouting", locale);

    setIntentSending(true);
    setIntentDraft("");
    setAgentVoiceDraft("");
    setAgentImageDraft("");
    setAgentTimeline((current) => [
      ...current,
      {
        id: `user_${marker}`,
        role: "user",
        body: text,
      },
      {
        id: `workflow_${marker}`,
        role: "workflow",
        body: workflowBody,
      },
    ]);

    try {
      if (useAgentChat && agentThreadId) {
        const traceId = crypto.randomUUID();
        const streamingId = `agent_stream_${marker}`;

        setAgentTimeline((current) => [
          ...current,
          {
            id: streamingId,
            role: "agent",
            body: "",
          },
        ]);

        const sse = openAgentThreadSse(
          buildAgentThreadStreamUrl(agentThreadId, session.accessToken),
          (msg) => {
            const delta = extractResponseTokenDelta(msg, traceId);
            if (delta === null) {
              return;
            }
            setAgentTimeline((current) =>
              current.map((row) =>
                row.id === streamingId
                  ? { ...row, body: row.body + delta }
                  : row,
              ),
            );
          },
        );

        try {
          await api.agentThreadRespondStream(
            agentThreadId,
            session.userId,
            text,
            session.accessToken,
            {
              traceId,
              ...(voiceForAgent ? { voiceTranscript: voiceForAgent } : {}),
              ...(imageExtras?.length ? { attachments: imageExtras } : {}),
            },
          );
        } finally {
          sse.close();
        }

        const messages = await api.listAgentThreadMessages(
          agentThreadId,
          session.accessToken,
        );
        setAgentTimeline(agentThreadMessagesToTranscript(messages));
        return;
      }

      if (useIntentAgentEndpoint && agentThreadId) {
        const result = await api.createIntentFromAgentMessage(
          agentThreadId,
          session.userId,
          text,
          session.accessToken,
          {
            allowDecomposition: decomposeIntent,
            maxIntents: decomposeMaxIntents,
          },
        );
        setAgentTimeline((current) => [
          ...current,
          {
            id: `agent_${marker}`,
            role: "agent",
            body:
              result.intentCount > 1
                ? `Split into ${result.intentCount} intents and started matching.`
                : `Intent accepted by API (${result.intentId.slice(0, 8)}).`,
          },
        ]);
        return;
      }

      const result = await api.createIntent(
        session.userId,
        text,
        session.accessToken,
        undefined,
        agentThreadId ?? undefined,
      );
      setAgentTimeline((current) => [
        ...current,
        {
          id: `agent_${marker}`,
          role: "agent",
          body: `Intent accepted by API (${String(result.id ?? "pending id")}).`,
        },
      ]);
    } catch (error) {
      setAgentTimeline((current) => [
        ...current,
        {
          id: `agent_error_${marker}`,
          role: "error",
          body: `Could not complete request: ${String(error)}`,
        },
      ]);
    } finally {
      setIntentSending(false);
    }
  };

  const createChatSandbox = async () => {
    if (!session) {
      return;
    }
    setChatBusy(true);
    try {
      const connection = await api.createConnection(
        session.userId,
        "dm",
        session.accessToken,
      );
      const connectionId = String(connection.id);
      const chat = await api.createChat(
        connectionId,
        "dm",
        session.accessToken,
      );
      const thread: ChatThread = {
        id: chat.id,
        connectionId,
        title: `Thread ${chat.id.slice(0, 6)}`,
        messages: [],
      };
      setChatThreads((current) => [thread, ...current]);
      setSelectedChatId(thread.id);
    } catch (error) {
      setBanner({
        tone: "error",
        text: `Could not create chat sandbox: ${String(error)}`,
      });
    } finally {
      setChatBusy(false);
    }
  };

  const openChat = async (chatId: string) => {
    if (!session) {
      return;
    }
    setSelectedChatId(chatId);
    try {
      const messages = await api.listChatMessages(chatId, session.accessToken);
      setChatThreads((current) =>
        current.map((thread) =>
          thread.id === chatId
            ? { ...thread, messages: messages.reverse() }
            : thread,
        ),
      );
    } catch (error) {
      setBanner({
        tone: "error",
        text: `Could not load messages: ${String(error)}`,
      });
    }
  };

  const sendChatMessage = async () => {
    if (!session || !selectedChat || chatDraft.trim().length === 0) {
      return;
    }
    try {
      const message = await api.createChatMessage(
        selectedChat.id,
        session.userId,
        chatDraft.trim(),
        session.accessToken,
      );
      setChatDraft("");
      setChatThreads((current) =>
        current.map((thread) =>
          thread.id === selectedChat.id
            ? {
                ...thread,
                messages: [...thread.messages, message],
              }
            : thread,
        ),
      );
    } catch (error) {
      setBanner({
        tone: "error",
        text: `Could not send message: ${String(error)}`,
      });
    }
  };

  const saveProfileSettings = async () => {
    if (!session) {
      return;
    }
    try {
      await Promise.all([
        api.setSocialMode(
          session.userId,
          socialModeToPayload(profile.socialMode),
          session.accessToken,
        ),
        api.setGlobalRules(
          session.userId,
          {
            whoCanContact: "anyone",
            reachable: "always",
            intentMode:
              profile.socialMode === "one_to_one"
                ? "one_to_one"
                : profile.socialMode === "group"
                  ? "group"
                  : "balanced",
            modality: "either",
            languagePreferences: ["en", "es"],
            requireVerifiedUsers: false,
            notificationMode:
              profile.notificationMode === "digest" ? "digest" : "immediate",
            agentAutonomy: "suggest_only",
            memoryMode: "standard",
          },
          session.accessToken,
        ),
      ]);
      setBanner({
        tone: "success",
        text: "Profile settings saved.",
      });
    } catch (error) {
      setBanner({
        tone: "error",
        text: `Could not save profile settings: ${String(error)}`,
      });
    }
  };

  const sendDigestNow = async () => {
    if (!session) {
      return;
    }
    try {
      await api.sendDigest(session.userId, session.accessToken);
      setBanner({
        tone: "success",
        text: "Digest request sent.",
      });
    } catch (error) {
      setBanner({
        tone: "error",
        text: `Digest request failed: ${String(error)}`,
      });
    }
  };

  const refreshDiscoverySnapshots = async () => {
    if (!session) {
      return;
    }
    setDiscoveryBusy(true);
    try {
      const [passive, inbox, pending] = await Promise.all([
        api.getPassiveDiscovery(session.userId, 3, session.accessToken),
        api.getDiscoveryInboxSuggestions(
          session.userId,
          4,
          session.accessToken,
        ),
        api.summarizePendingIntents(session.userId, 8, session.accessToken),
      ]);
      setPassiveDiscovery(passive);
      setInboxSuggestions(inbox);
      setPendingIntentSummary(pending);
      setSelectedIntentId((current) => {
        if (
          current &&
          pending.intents.some((intent) => intent.intentId === current)
        ) {
          return current;
        }
        return pending.intents[0]?.intentId ?? null;
      });
      setBanner({
        tone: "success",
        text: "Discovery and continuity snapshots refreshed.",
      });
    } catch (error) {
      setBanner({
        tone: "error",
        text: `Could not refresh discovery snapshots: ${String(error)}`,
      });
    } finally {
      setDiscoveryBusy(false);
    }
  };

  const publishDiscoveryToAgent = async () => {
    if (!session) {
      return;
    }
    try {
      const result = await api.publishAgentRecommendations(
        session.userId,
        {
          ...(agentThreadId ? { threadId: agentThreadId } : {}),
          limit: 3,
        },
        session.accessToken,
      );
      setBanner({
        tone: "success",
        text: result.delivered
          ? "Discovery recommendations posted into your agent thread."
          : "Recommendations generated but no thread was available.",
      });
    } catch (error) {
      setBanner({
        tone: "error",
        text: `Could not publish recommendations: ${String(error)}`,
      });
    }
  };

  const runSearch = async () => {
    if (!session || searchQuery.trim().length === 0) {
      return;
    }
    setSearchBusy(true);
    try {
      const result = await api.search(
        session.userId,
        searchQuery.trim(),
        6,
        session.accessToken,
      );
      setSearchSnapshot(result);
    } catch (error) {
      setBanner({
        tone: "error",
        text: `Could not run search: ${String(error)}`,
      });
    } finally {
      setSearchBusy(false);
    }
  };

  const refreshMemorySnapshot = async () => {
    if (!session) {
      return;
    }
    setMemoryBusy(true);
    try {
      const [lifeGraph, retrieval] = await Promise.all([
        api.getLifeGraph(session.userId, session.accessToken),
        api.queryRetrievalContext(
          session.userId,
          {
            query: "Summarize my most relevant social memory context.",
            maxChunks: 4,
            maxAgeDays: 90,
          },
          session.accessToken,
        ),
      ]);
      setMemorySnapshot({ lifeGraph, retrieval });
      setBanner({
        tone: "success",
        text: "Memory snapshot refreshed.",
      });
    } catch (error) {
      setBanner({
        tone: "error",
        text: `Could not refresh memory snapshot: ${String(error)}`,
      });
    } finally {
      setMemoryBusy(false);
    }
  };

  const resetLearnedMemory = async () => {
    if (!session) {
      return;
    }
    setMemoryBusy(true);
    try {
      await api.resetMemory(
        session.userId,
        {
          actorUserId: session.userId,
          mode: "learned_memory",
          reason: "user_requested_from_profile",
        },
        session.accessToken,
      );
      setMemorySnapshot({ lifeGraph: null, retrieval: null });
      setBanner({
        tone: "success",
        text: "Learned memory reset completed.",
      });
    } catch (error) {
      setBanner({
        tone: "error",
        text: `Could not reset memory: ${String(error)}`,
      });
    } finally {
      setMemoryBusy(false);
    }
  };

  const createCircleQuick = async () => {
    if (!session) {
      return;
    }
    try {
      const created = await api.createRecurringCircle(
        session.userId,
        {
          title: "Weekly open circle",
          visibility: "invite_only",
          topicTags: profile.interests.slice(0, 3),
          cadence: {
            kind: "weekly",
            days: ["thu"],
            hour: 20,
            minute: 0,
            timezone: "UTC",
            intervalWeeks: 1,
          },
          kickoffPrompt: "Find a small group for this week's recurring circle.",
        },
        session.accessToken,
      );
      setRecurringCircles((current) => [created, ...current]);
      setSelectedCircleId(created.id);
      setBanner({
        tone: "success",
        text: "Recurring circle created.",
      });
    } catch (error) {
      setBanner({
        tone: "error",
        text: `Could not create circle: ${String(error)}`,
      });
    }
  };

  const createSavedSearchQuick = async () => {
    if (!session) {
      return;
    }
    const seed = searchQuery.trim() || "tennis";
    try {
      const created = await api.createSavedSearch(
        session.userId,
        {
          title: `Search: ${seed.slice(0, 28)}`,
          searchType: "activity_search",
          queryConfig: {
            q: seed,
            limit: 6,
          },
        },
        session.accessToken,
      );
      setSavedSearches((current) => [created, ...current]);
      setBanner({
        tone: "success",
        text: "Saved search created.",
      });
    } catch (error) {
      setBanner({
        tone: "error",
        text: `Could not create saved search: ${String(error)}`,
      });
    }
  };

  const createAutomationQuick = async () => {
    if (!session) {
      return;
    }
    try {
      let savedSearch = savedSearches[0];
      if (!savedSearch) {
        const seed = searchQuery.trim() || "tennis";
        savedSearch = await api.createSavedSearch(
          session.userId,
          {
            title: `Search: ${seed.slice(0, 28)}`,
            searchType: "activity_search",
            queryConfig: {
              q: seed,
              limit: 6,
            },
          },
          session.accessToken,
        );
        setSavedSearches((current) => [savedSearch!, ...current]);
      }

      const created = await api.createScheduledTask(
        session.userId,
        {
          title: "Weekly saved-search briefing",
          description:
            "Runs your top saved search and posts a short discovery briefing.",
          schedule: {
            kind: "weekly",
            days: ["thu"],
            hour: 18,
            minute: 0,
            timezone: "UTC",
          },
          task: {
            taskType: "saved_search",
            config: {
              savedSearchId: savedSearch.id,
              deliveryMode: "notification_and_agent_thread",
              minResults: 1,
              maxResults: 5,
            },
          },
        },
        session.accessToken,
      );
      setScheduledTasks((current) => [created, ...current]);
      setSelectedScheduledTaskId(created.id);
      setBanner({
        tone: "success",
        text: "Scheduled automation created.",
      });
    } catch (error) {
      setBanner({
        tone: "error",
        text: `Could not create automation: ${String(error)}`,
      });
    }
  };

  const runAutomationNow = async () => {
    if (!session || !selectedScheduledTask) {
      return;
    }
    try {
      await api.runScheduledTaskNow(
        selectedScheduledTask.id,
        session.accessToken,
      );
      const runs = await api.listScheduledTaskRuns(
        selectedScheduledTask.id,
        8,
        session.accessToken,
      );
      setScheduledTaskRuns(runs);
      setBanner({
        tone: "success",
        text: "Automation queued to run now.",
      });
    } catch (error) {
      setBanner({
        tone: "error",
        text: `Could not run automation: ${String(error)}`,
      });
    }
  };

  const runCircleSessionNow = async () => {
    if (!session || !selectedCircleId) {
      return;
    }
    try {
      const created = await api.runRecurringCircleSessionNow(
        selectedCircleId,
        session.accessToken,
      );
      setRecurringSessions((current) => [created, ...current]);
      setBanner({
        tone: "success",
        text: "Circle session opened and queued for matching.",
      });
    } catch (error) {
      setBanner({
        tone: "error",
        text: `Could not open circle session: ${String(error)}`,
      });
    }
  };

  const signOut = () => {
    clearStoredSession();
    setSession(null);
    setStage("auth");
    setBanner({
      tone: "info",
      text: "Signed out.",
    });
  };

  if (isBootstrapping) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-5 bg-black px-6 text-white">
        <div className="rounded-2xl border border-white/20 bg-black/60 p-2 shadow-lg shadow-black/40">
          <img
            alt=""
            className="h-10 w-10"
            height={40}
            src="/brand/logo.svg"
            width={40}
          />
        </div>
        <div
          aria-label="Restoring session"
          className="h-9 w-9 motion-safe:animate-spin rounded-full border-2 border-white/20 border-t-amber-400"
          role="progressbar"
        />
        <p className="text-sm text-white/55">Restoring session…</p>
      </main>
    );
  }

  if (stage === "auth") {
    return (
      <BrandSignInLayout contentClassName="justify-end pb-14 pt-10 sm:justify-center sm:pb-16">
        <div className="flex min-h-[min(100vh,860px)] flex-col">
          <header className="text-center">
            <div className="mx-auto flex w-fit rounded-3xl border border-white/25 bg-black p-3 shadow-lg shadow-black/40">
              <img
                alt="OpenSocial"
                className="h-14 w-14"
                height={56}
                src="/brand/logo.svg"
                width={56}
              />
            </div>
            <p className="mt-4 text-[10px] font-semibold uppercase tracking-[0.22em] text-white/55">
              OpenSocial
            </p>
            <h1 className="mt-6 font-[var(--font-heading)] text-[28px] font-semibold leading-[1.12] tracking-tight text-white sm:text-[30px]">
              Meet through plans
            </h1>
            <p className="mx-auto mt-2.5 max-w-[340px] text-[15px] leading-[22px] text-white/75">
              Real people—not an endless feed.
            </p>
          </header>

          <ul className="mt-8 space-y-3 sm:mt-10">
            {WELCOME_HIGHLIGHTS.map((item) => (
              <li
                className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3.5 backdrop-blur-sm"
                key={item.title}
              >
                <p className="font-[var(--font-heading)] text-[15px] font-semibold text-white/95">
                  {item.title}
                </p>
                <p className="mt-1.5 text-[13px] leading-relaxed text-white/55">
                  {item.body}
                </p>
              </li>
            ))}
          </ul>

          {banner ? (
            <div className="mt-6">
              <InlineNotice text={banner.text} tone={banner.tone} />
            </div>
          ) : null}
          {!netOnline ? (
            <div className="mt-4">
              <InlineNotice text={t("offlineNotice", locale)} tone="info" />
            </div>
          ) : null}

          <div className="mt-auto space-y-3 pt-10">
            <p className="text-center text-[13px] text-white/50">
              Sign in to save your profile and continue on any device.
            </p>
            <button
              className="flex h-12 w-full items-center justify-center gap-3 rounded-full bg-white text-[15px] font-medium text-[#0d0d0d] shadow-md transition hover:bg-white hover:shadow-lg active:scale-[0.99] disabled:opacity-60"
              disabled={authLoading || !netOnline}
              onClick={() => void startGoogleOAuth()}
              type="button"
            >
              {authLoading ? (
                "Redirecting…"
              ) : (
                <>
                  <GoogleMark />
                  Continue with Google
                </>
              )}
            </button>
            <p className="text-center text-[11px] leading-relaxed text-white/55">
              By continuing, Google may share your name and email with
              OpenSocial for account setup.
            </p>
          </div>

          {allowWebDemoAuth ? (
            <details className="mt-8 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-left backdrop-blur-sm">
              <summary className="cursor-pointer text-sm text-white/55">
                Developer: sign in without Google
              </summary>
              <p className="mt-3 text-xs text-white/45">
                Uses the API demo exchange when{" "}
                <code className="text-white/70">demo-web</code> is enabled
                server-side.
              </p>
              <label className="mt-3 block text-[10px] font-semibold uppercase tracking-wider text-white/40">
                Auth code
              </label>
              <input
                className="mt-1.5 w-full rounded-xl border border-white/15 bg-black/40 px-3 py-2.5 text-sm text-white outline-none placeholder:text-white/30 focus:border-white/25"
                onChange={(event) => setAuthCode(event.currentTarget.value)}
                placeholder="demo-web"
                value={authCode}
              />
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  className="rounded-xl bg-white/10 px-3 py-2 text-xs font-medium text-white/85 hover:bg-white/15 disabled:opacity-50"
                  disabled={authLoading}
                  onClick={() => void authenticateWithDemoCode()}
                  type="button"
                >
                  {authLoading ? "Signing in…" : "Sign in with code"}
                </button>
                <button
                  className="rounded-xl border border-white/15 px-3 py-2 text-xs text-white/60 hover:bg-white/5"
                  disabled={authLoading}
                  onClick={() => {
                    setAuthCode("demo-web");
                    void authenticateWithDemoCode();
                  }}
                  type="button"
                >
                  Use demo-web
                </button>
              </div>
            </details>
          ) : null}
        </div>
      </BrandSignInLayout>
    );
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl px-4 py-5 md:px-8 md:py-8">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4 border-b border-amber-400/20 pb-5">
        <div className="flex min-w-0 items-start gap-4">
          <div className="hidden shrink-0 rounded-2xl border border-white/15 bg-black/35 p-2 shadow-inner shadow-black/20 sm:block">
            <img
              alt=""
              className="h-9 w-9"
              height={36}
              src="/brand/logo.svg"
              width={36}
            />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-ash">
              OpenSocial
            </p>
            <h1 className="font-[var(--font-heading)] text-2xl font-semibold tracking-tight text-ink md:text-3xl">
              Where your plans meet the right people
            </h1>
            <p className="mt-1 text-xs text-ash/90">Web</p>
          </div>
        </div>
        <div
          className={`mt-1 h-3 w-3 shrink-0 rounded-full animate-pulseSoft ${
            netOnline ? "bg-emerald-400" : "bg-rose-500"
          }`}
          title={
            netOnline ? "Browser reports online" : "Browser reports offline"
          }
        />
      </div>

      {banner ? (
        <div className="mb-4">
          <InlineNotice text={banner.text} tone={banner.tone} />
        </div>
      ) : null}
      {!netOnline ? (
        <div className="mb-4">
          <InlineNotice text={t("offlineNotice", locale)} tone="info" />
        </div>
      ) : null}

      {stage === "onboarding" ? (
        <section className="animate-rise space-y-4">
          <SurfaceCard>
            <h2 className="font-[var(--font-heading)] text-2xl text-ink">
              Finish your profile
            </h2>
            <p className="mt-1 text-sm text-ash">
              A few details help us suggest better people and plans for you.
            </p>

            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <label className="md:col-span-3">
                <span className="text-xs uppercase tracking-wider text-ash">
                  Bio
                </span>
                <textarea
                  className="mt-1 h-24 w-full rounded-xl border border-slate-700 bg-night px-3 py-2 text-sm text-ink outline-none focus:border-ember"
                  onChange={(event) =>
                    setProfile((current) => ({
                      ...current,
                      bio: event.currentTarget.value,
                    }))
                  }
                  placeholder="I like fast plans and good conversations."
                  value={profile.bio}
                />
              </label>
              <label>
                <span className="text-xs uppercase tracking-wider text-ash">
                  City
                </span>
                <input
                  className="mt-1 w-full rounded-xl border border-slate-700 bg-night px-3 py-2 text-sm text-ink outline-none focus:border-ember"
                  onChange={(event) =>
                    setProfile((current) => ({
                      ...current,
                      city: event.currentTarget.value,
                    }))
                  }
                  value={profile.city}
                />
              </label>
              <label>
                <span className="text-xs uppercase tracking-wider text-ash">
                  Country
                </span>
                <input
                  className="mt-1 w-full rounded-xl border border-slate-700 bg-night px-3 py-2 text-sm text-ink outline-none focus:border-ember"
                  onChange={(event) =>
                    setProfile((current) => ({
                      ...current,
                      country: event.currentTarget.value,
                    }))
                  }
                  value={profile.country}
                />
              </label>
              <label>
                <span className="text-xs uppercase tracking-wider text-ash">
                  Display name
                </span>
                <input
                  className="mt-1 w-full rounded-xl border border-slate-700 bg-night px-3 py-2 text-sm text-ink outline-none focus:border-ember"
                  onChange={(event) =>
                    setDisplayName(event.currentTarget.value)
                  }
                  value={displayName}
                />
              </label>
            </div>

            <div className="mt-4">
              <p className="text-xs uppercase tracking-wider text-ash">
                Interests
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {interestOptions.map((interest) => {
                  const selected = profile.interests.includes(interest);
                  return (
                    <button
                      className={`rounded-full border px-3 py-1 text-xs transition ${
                        selected
                          ? "border-ember bg-ember/20 text-amber-100"
                          : "border-slate-600 text-slate-300 hover:bg-slate-800"
                      }`}
                      key={interest}
                      onClick={() =>
                        setProfile((current) => ({
                          ...current,
                          interests: current.interests.includes(interest)
                            ? current.interests.filter(
                                (value) => value !== interest,
                              )
                            : [...current.interests, interest],
                        }))
                      }
                      type="button"
                    >
                      {interest}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div>
                <p className="text-xs uppercase tracking-wider text-ash">
                  Social mode
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {(["one_to_one", "group", "either"] as SocialMode[]).map(
                    (mode) => (
                      <button
                        className={`rounded-xl border px-3 py-2 text-xs transition ${
                          profile.socialMode === mode
                            ? "border-ember bg-ember/20 text-amber-100"
                            : "border-slate-600 text-slate-300"
                        }`}
                        key={mode}
                        onClick={() =>
                          setProfile((current) => ({
                            ...current,
                            socialMode: mode,
                          }))
                        }
                        type="button"
                      >
                        {mode.replaceAll("_", " ")}
                      </button>
                    ),
                  )}
                </div>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wider text-ash">
                  Notification mode
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {(["live", "digest"] as const).map((mode) => (
                    <button
                      className={`rounded-xl border px-3 py-2 text-xs transition ${
                        profile.notificationMode === mode
                          ? "border-ember bg-ember/20 text-amber-100"
                          : "border-slate-600 text-slate-300"
                      }`}
                      key={mode}
                      onClick={() =>
                        setProfile((current) => ({
                          ...current,
                          notificationMode: mode,
                        }))
                      }
                      type="button"
                    >
                      {mode}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <button
              className="mt-6 rounded-xl bg-ocean px-4 py-3 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-60"
              disabled={onboardingLoading}
              onClick={completeOnboarding}
              type="button"
            >
              {onboardingLoading ? "Saving..." : "Complete onboarding"}
            </button>
          </SurfaceCard>
        </section>
      ) : null}

      {stage === "home" && session ? (
        <section className="animate-rise">
          <div className="grid gap-5 md:grid-cols-[220px_1fr]">
            <aside className="flex gap-2 overflow-x-auto md:block md:space-y-2">
              {(Object.keys(tabLabels) as HomeTab[]).map((tab) => {
                const TabIcon = homeTabIcon[tab];
                return (
                  <button
                    className={`flex w-full min-w-[7.5rem] items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors duration-200 ease-out md:min-w-0 ${
                      activeTab === tab
                        ? "bg-ember text-slate-950 shadow-sm shadow-ember/25"
                        : "border border-slate-700/80 bg-slate-900/90 text-slate-200 hover:border-slate-600 hover:bg-slate-800"
                    }`}
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    type="button"
                  >
                    <TabIcon
                      aria-hidden
                      className="h-4 w-4 shrink-0 opacity-90"
                      strokeWidth={2}
                    />
                    {tabLabels[tab]}
                  </button>
                );
              })}
            </aside>

            <div className="space-y-4">
              <SurfaceCard>
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="font-[var(--font-heading)] text-xl text-ink">
                      {tabLabels[activeTab]}
                    </h2>
                    <p className="text-sm leading-relaxed text-ash">
                      {tabDescriptions[activeTab]}
                    </p>
                  </div>
                </div>
              </SurfaceCard>

              {activeTab === "home" ? (
                <SurfaceCard>
                  <div className="max-h-72 overflow-y-auto pr-2">
                    {agentTimeline.map((message) => (
                      <ChatBubble
                        body={message.body}
                        key={message.id}
                        role={message.role}
                      />
                    ))}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                        agentComposerMode === "chat"
                          ? "bg-ember text-slate-950"
                          : "border border-slate-600 text-slate-200 hover:bg-slate-800"
                      }`}
                      onClick={() => {
                        setAgentComposerMode("chat");
                      }}
                      type="button"
                    >
                      {t("agentComposerModeChat", locale)}
                    </button>
                    <button
                      className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                        agentComposerMode === "intent"
                          ? "bg-ember text-slate-950"
                          : "border border-slate-600 text-slate-200 hover:bg-slate-800"
                      }`}
                      onClick={() => {
                        setAgentComposerMode("intent");
                      }}
                      type="button"
                    >
                      {t("agentComposerModeIntent", locale)}
                    </button>
                  </div>
                  {agentThreadLoading ? (
                    <p className="mt-2 text-xs text-ash">
                      {t("agentHistoryLoading", locale)}
                    </p>
                  ) : null}
                  <p className="mt-2 text-xs text-ash">
                    {agentComposerMode === "chat"
                      ? t("agentComposerHintChat", locale)
                      : t("agentComposerHintIntent", locale)}
                  </p>
                  <textarea
                    className="mt-3 h-24 w-full rounded-xl border border-slate-700 bg-night px-3 py-2 text-sm text-ink outline-none transition-colors duration-200 focus:border-ember disabled:opacity-50"
                    disabled={intentSending}
                    onChange={(event) =>
                      setIntentDraft(event.currentTarget.value)
                    }
                    placeholder="e.g. Find three people to discuss product design this week."
                    value={intentDraft}
                  />
                  {agentComposerMode === "chat" ? (
                    <>
                      <label
                        className="mt-3 block text-xs font-medium text-ash"
                        htmlFor="agent-voice-transcript"
                      >
                        {t("agentVoiceTranscriptOptional", locale)}
                      </label>
                      <textarea
                        className="mt-1 h-16 w-full rounded-xl border border-slate-700 bg-night px-3 py-2 text-sm text-ink outline-none transition-colors duration-200 focus:border-ember disabled:opacity-50"
                        disabled={intentSending}
                        id="agent-voice-transcript"
                        onChange={(event) =>
                          setAgentVoiceDraft(event.currentTarget.value)
                        }
                        placeholder="Paste dictation or ASR output…"
                        value={agentVoiceDraft}
                      />
                      <label
                        className="mt-3 block text-xs font-medium text-ash"
                        htmlFor="agent-image-url"
                      >
                        {t("agentImageUrlOptional", locale)}
                      </label>
                      <input
                        className="mt-1 w-full rounded-xl border border-slate-700 bg-night px-3 py-2 text-sm text-ink outline-none transition-colors duration-200 focus:border-ember disabled:opacity-50"
                        disabled={intentSending}
                        id="agent-image-url"
                        onChange={(event) =>
                          setAgentImageDraft(event.currentTarget.value)
                        }
                        placeholder="https://…"
                        type="url"
                        value={agentImageDraft}
                      />
                    </>
                  ) : (
                    <div className="mt-3 rounded-xl border border-slate-700 bg-night/70 p-3">
                      <label className="flex items-center gap-2 text-xs text-slate-100">
                        <input
                          checked={decomposeIntent}
                          onChange={(event) =>
                            setDecomposeIntent(event.currentTarget.checked)
                          }
                          type="checkbox"
                        />
                        Split a broad message into multiple intents
                      </label>
                      <label
                        className="mt-2 block text-xs font-medium text-ash"
                        htmlFor="intent-max-splits"
                      >
                        Max intents (1-5)
                      </label>
                      <input
                        className="mt-1 w-24 rounded-xl border border-slate-600 bg-night px-3 py-1.5 text-sm text-ink outline-none focus:border-ember"
                        id="intent-max-splits"
                        max={5}
                        min={1}
                        onChange={(event) => {
                          const parsed = Number.parseInt(
                            event.currentTarget.value,
                            10,
                          );
                          if (Number.isFinite(parsed)) {
                            setDecomposeMaxIntents(
                              Math.min(Math.max(parsed, 1), 5),
                            );
                          }
                        }}
                        step={1}
                        type="number"
                        value={decomposeMaxIntents}
                      />
                    </div>
                  )}
                  <button
                    className="mt-3 rounded-xl bg-ocean px-4 py-2 text-sm font-semibold text-white transition-[filter] duration-200 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={
                      intentSending ||
                      intentDraft.trim().length === 0 ||
                      !netOnline
                    }
                    onClick={() => {
                      sendIntent().catch(() => {});
                    }}
                    type="button"
                  >
                    {intentSending
                      ? "Sending…"
                      : agentComposerMode === "chat"
                        ? "Send"
                        : "Send plan"}
                  </button>
                </SurfaceCard>
              ) : null}

              {activeTab === "chats" ? (
                <div className="grid gap-3 lg:grid-cols-[280px_1fr]">
                  <SurfaceCard>
                    <button
                      className="w-full rounded-xl bg-ocean px-3 py-2 text-sm font-semibold text-white"
                      disabled={chatBusy}
                      onClick={() => {
                        createChatSandbox().catch(() => {});
                      }}
                      type="button"
                    >
                      {chatBusy ? "Creating..." : "Create chat sandbox"}
                    </button>
                    <div className="mt-3 space-y-2">
                      {chatThreads.map((thread) => (
                        <button
                          className={`w-full rounded-xl border px-3 py-2 text-left text-sm ${
                            selectedChat?.id === thread.id
                              ? "border-ember bg-ember/10 text-amber-100"
                              : "border-slate-700 text-slate-200"
                          }`}
                          key={thread.id}
                          onClick={() => {
                            openChat(thread.id).catch(() => {});
                          }}
                          type="button"
                        >
                          <p className="font-semibold">{thread.title}</p>
                          <p className="text-xs text-ash">
                            {thread.messages.length} message
                            {thread.messages.length === 1 ? "" : "s"}
                          </p>
                        </button>
                      ))}
                    </div>
                  </SurfaceCard>
                  <SurfaceCard>
                    {!selectedChat ? (
                      <EmptyState
                        description="Create a sandbox and open a chat to test real message persistence."
                        title="No chat selected"
                      />
                    ) : (
                      <>
                        <h3 className="font-semibold text-slate-100">
                          {selectedChat.title}
                        </h3>
                        <div className="mt-3 max-h-72 overflow-y-auto pr-2">
                          {selectedChat.messages.map((message) => (
                            <ChatBubble
                              body={message.body}
                              key={message.id}
                              role={
                                message.senderUserId === session.userId
                                  ? "user"
                                  : "agent"
                              }
                            />
                          ))}
                          {selectedChat.messages.length === 0 ? (
                            <p className="text-sm text-ash">
                              No messages in this thread yet.
                            </p>
                          ) : null}
                        </div>
                        <input
                          className="mt-3 w-full rounded-xl border border-slate-700 bg-night px-3 py-2 text-sm text-ink outline-none focus:border-ember"
                          onChange={(event) =>
                            setChatDraft(event.currentTarget.value)
                          }
                          placeholder="Write a message…"
                          value={chatDraft}
                        />
                        <button
                          className="mt-3 rounded-xl bg-ocean px-3 py-2 text-sm font-semibold text-white"
                          onClick={() => {
                            sendChatMessage().catch(() => {});
                          }}
                          type="button"
                        >
                          Send message
                        </button>
                      </>
                    )}
                  </SurfaceCard>
                </div>
              ) : null}

              {activeTab === "profile" ? (
                <div className="space-y-3">
                  <SurfaceCard>
                    <h3 className="font-semibold text-slate-100">
                      Trust summary
                    </h3>
                    <p className="mt-1 text-sm text-ash">{trustSummary}</p>
                  </SurfaceCard>
                  <SurfaceCard>
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold text-slate-100">
                        Discovery snapshot
                      </h3>
                      <button
                        className="rounded-xl border border-slate-600 px-3 py-1 text-xs font-semibold text-slate-100 disabled:opacity-50"
                        disabled={discoveryBusy}
                        onClick={() => {
                          refreshDiscoverySnapshots().catch(() => {});
                        }}
                        type="button"
                      >
                        {discoveryBusy ? "Refreshing..." : "Refresh"}
                      </button>
                    </div>
                    <p className="mt-2 text-xs text-ash">
                      Tonight:{" "}
                      {passiveDiscovery?.tonight.suggestions.length ?? 0} ·
                      reconnects:{" "}
                      {passiveDiscovery?.reconnects.reconnects.length ?? 0}
                    </p>
                    <div className="mt-2 rounded-xl border border-slate-700 p-2">
                      {passiveDiscovery?.tonight.suggestions.length ? (
                        passiveDiscovery.tonight.suggestions
                          .slice(0, 3)
                          .map((row) => (
                            <p
                              className="mb-1 text-xs text-slate-200"
                              key={row.userId}
                            >
                              {row.displayName} · {Math.round(row.score * 100)}%
                            </p>
                          ))
                      ) : (
                        <p className="text-xs text-ash">
                          No tonight suggestions yet.
                        </p>
                      )}
                    </div>
                    <button
                      className="mt-3 rounded-xl bg-ocean px-3 py-1 text-xs font-semibold text-white"
                      onClick={() => {
                        publishDiscoveryToAgent().catch(() => {});
                      }}
                      type="button"
                    >
                      Publish to agent thread
                    </button>
                  </SurfaceCard>
                  <SurfaceCard>
                    <h3 className="font-semibold text-slate-100">
                      Continuity and reconnect
                    </h3>
                    <p className="mt-1 text-xs text-ash">
                      Pending request suggestions:{" "}
                      {inboxSuggestions?.pendingRequestCount ?? 0}
                    </p>
                    <div className="mt-2 rounded-xl border border-slate-700 p-2">
                      {inboxSuggestions?.suggestions.length ? (
                        inboxSuggestions.suggestions
                          .slice(0, 4)
                          .map((suggestion) => (
                            <p
                              className="mb-1 text-xs text-slate-200"
                              key={`${suggestion.title}-${suggestion.reason}`}
                            >
                              {suggestion.title}
                            </p>
                          ))
                      ) : (
                        <p className="text-xs text-ash">
                          No continuity suggestions yet.
                        </p>
                      )}
                    </div>
                  </SurfaceCard>
                  <SurfaceCard>
                    <h3 className="font-semibold text-slate-100">
                      Why this routing result
                    </h3>
                    {pendingIntentSummary?.intents.length ? (
                      <>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {pendingIntentSummary.intents
                            .slice(0, 5)
                            .map((intent) => (
                              <button
                                className={`rounded-xl border px-3 py-1 text-xs ${
                                  selectedIntentId === intent.intentId
                                    ? "border-ember bg-ember/20 text-amber-100"
                                    : "border-slate-700 text-slate-200"
                                }`}
                                key={intent.intentId}
                                onClick={() => {
                                  setSelectedIntentId(intent.intentId);
                                }}
                                type="button"
                              >
                                {intent.rawText.slice(0, 28)}
                              </button>
                            ))}
                        </div>
                        <p className="mt-2 text-xs text-ash">
                          {userIntentExplanation?.summary ??
                            "Loading explanation..."}
                        </p>
                        {userIntentExplanation?.factors.length ? (
                          <div className="mt-2 rounded-xl border border-slate-700 p-2">
                            {userIntentExplanation.factors.map((factor) => (
                              <p
                                className="mb-1 text-xs text-slate-200"
                                key={factor}
                              >
                                {factor}
                              </p>
                            ))}
                          </div>
                        ) : null}
                      </>
                    ) : (
                      <p className="mt-2 text-xs text-ash">
                        No active intents yet to explain.
                      </p>
                    )}
                  </SurfaceCard>
                  <SurfaceCard>
                    <h3 className="font-semibold text-slate-100">
                      Memory controls
                    </h3>
                    <p className="mt-1 text-xs text-ash">
                      Inspect and reset learned social memory.
                    </p>
                    <div className="mt-2 flex gap-2">
                      <button
                        className="rounded-xl border border-slate-600 px-3 py-1 text-xs font-semibold text-slate-100 disabled:opacity-50"
                        disabled={memoryBusy}
                        onClick={() => {
                          refreshMemorySnapshot().catch(() => {});
                        }}
                        type="button"
                      >
                        {memoryBusy ? "..." : "Refresh memory"}
                      </button>
                      <button
                        className="rounded-xl border border-rose-500/60 px-3 py-1 text-xs font-semibold text-rose-200 disabled:opacity-50"
                        disabled={memoryBusy}
                        onClick={() => {
                          resetLearnedMemory().catch(() => {});
                        }}
                        type="button"
                      >
                        Reset learned memory
                      </button>
                    </div>
                    <div className="mt-2 rounded-xl border border-slate-700 p-2 text-xs text-slate-200">
                      <p>
                        life graph loaded:{" "}
                        {memorySnapshot.lifeGraph ? "yes" : "no"} · retrieval
                        loaded: {memorySnapshot.retrieval ? "yes" : "no"}
                      </p>
                    </div>
                  </SurfaceCard>
                  <SurfaceCard>
                    <h3 className="font-semibold text-slate-100">Search</h3>
                    <p className="mt-1 text-xs text-ash">
                      Find people, topics, active activities, and circles.
                    </p>
                    <div className="mt-2 flex gap-2">
                      <input
                        className="w-full rounded-xl border border-slate-700 bg-night px-3 py-2 text-sm text-ink outline-none focus:border-ember"
                        onChange={(event) =>
                          setSearchQuery(event.currentTarget.value)
                        }
                        placeholder="e.g. tennis, startups, design"
                        value={searchQuery}
                      />
                      <button
                        className="rounded-xl bg-ocean px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                        disabled={searchBusy || searchQuery.trim().length === 0}
                        onClick={() => {
                          runSearch().catch(() => {});
                        }}
                        type="button"
                      >
                        {searchBusy ? "..." : "Search"}
                      </button>
                    </div>
                    {searchSnapshot ? (
                      <div className="mt-2 rounded-xl border border-slate-700 p-2 text-xs text-slate-200">
                        <p>
                          users {searchSnapshot.users.length} · topics{" "}
                          {searchSnapshot.topics.length} · activities{" "}
                          {searchSnapshot.activities.length} · groups{" "}
                          {searchSnapshot.groups.length}
                        </p>
                      </div>
                    ) : null}
                  </SurfaceCard>
                  <SurfaceCard>
                    <h3 className="font-semibold text-slate-100">
                      Automations
                    </h3>
                    <p className="mt-1 text-xs text-ash">
                      Saved searches plus scheduled briefings.
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        className="rounded-xl border border-slate-600 px-3 py-1 text-xs font-semibold text-slate-100 disabled:opacity-50"
                        disabled={automationsBusy}
                        onClick={() => {
                          createSavedSearchQuick().catch(() => {});
                        }}
                        type="button"
                      >
                        New saved search
                      </button>
                      <button
                        className="rounded-xl border border-slate-600 px-3 py-1 text-xs font-semibold text-slate-100 disabled:opacity-50"
                        disabled={automationsBusy}
                        onClick={() => {
                          createAutomationQuick().catch(() => {});
                        }}
                        type="button"
                      >
                        New automation
                      </button>
                      <button
                        className="rounded-xl bg-ocean px-3 py-1 text-xs font-semibold text-white disabled:opacity-50"
                        disabled={!selectedScheduledTask}
                        onClick={() => {
                          runAutomationNow().catch(() => {});
                        }}
                        type="button"
                      >
                        Run now
                      </button>
                    </div>
                    <div className="mt-2 rounded-xl border border-slate-700 p-2 text-xs text-slate-200">
                      <p>
                        saved searches: {savedSearches.length} · tasks:{" "}
                        {scheduledTasks.length}
                      </p>
                    </div>
                    {scheduledTasks.length ? (
                      <div className="mt-2 grid gap-2">
                        {scheduledTasks.slice(0, 4).map((task) => (
                          <button
                            className={`rounded-xl border px-3 py-2 text-left text-xs ${
                              selectedScheduledTaskId === task.id
                                ? "border-ember bg-ember/20 text-amber-100"
                                : "border-slate-700 text-slate-200"
                            }`}
                            key={task.id}
                            onClick={() => {
                              setSelectedScheduledTaskId(task.id);
                            }}
                            type="button"
                          >
                            <p className="font-semibold">{task.title}</p>
                            <p className="text-[11px] text-ash">
                              {task.taskType} · {task.status}
                            </p>
                          </button>
                        ))}
                      </div>
                    ) : null}
                    {selectedScheduledTask ? (
                      <div className="mt-2 rounded-xl border border-slate-700 p-2 text-xs text-slate-200">
                        {scheduledTaskRuns.length === 0 ? (
                          <p>No runs yet.</p>
                        ) : (
                          scheduledTaskRuns.map((run) => (
                            <p className="mb-1" key={run.id}>
                              {new Date(run.triggeredAt).toLocaleString()} ·{" "}
                              {run.status}
                            </p>
                          ))
                        )}
                      </div>
                    ) : null}
                  </SurfaceCard>
                  <SurfaceCard>
                    <h3 className="font-semibold text-slate-100">
                      Social mode
                    </h3>
                    <h4 className="mt-4 text-xs uppercase tracking-wider text-ash">
                      {t("localeLabel", locale)}
                    </h4>
                    <div className="mt-2 flex gap-2">
                      <button
                        className={`rounded-xl border px-3 py-2 text-xs ${
                          locale === "en"
                            ? "border-ember bg-ember/20 text-amber-100"
                            : "border-slate-600 text-slate-200"
                        }`}
                        onClick={() => setLocale("en")}
                        type="button"
                      >
                        {t("localeEnglish", locale)}
                      </button>
                      <button
                        className={`rounded-xl border px-3 py-2 text-xs ${
                          locale === "es"
                            ? "border-ember bg-ember/20 text-amber-100"
                            : "border-slate-600 text-slate-200"
                        }`}
                        onClick={() => setLocale("es")}
                        type="button"
                      >
                        {t("localeSpanish", locale)}
                      </button>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {(["one_to_one", "group", "either"] as SocialMode[]).map(
                        (mode) => (
                          <button
                            className={`rounded-xl border px-3 py-2 text-xs ${
                              profile.socialMode === mode
                                ? "border-ember bg-ember/20 text-amber-100"
                                : "border-slate-600 text-slate-200"
                            }`}
                            key={mode}
                            onClick={() =>
                              setProfile((current) => ({
                                ...current,
                                socialMode: mode,
                              }))
                            }
                            type="button"
                          >
                            {mode.replaceAll("_", " ")}
                          </button>
                        ),
                      )}
                    </div>
                    <h4 className="mt-4 text-xs uppercase tracking-wider text-ash">
                      Notification mode
                    </h4>
                    <div className="mt-2 flex gap-2">
                      {(["live", "digest"] as const).map((mode) => (
                        <button
                          className={`rounded-xl border px-3 py-2 text-xs ${
                            profile.notificationMode === mode
                              ? "border-ember bg-ember/20 text-amber-100"
                              : "border-slate-600 text-slate-200"
                          }`}
                          key={mode}
                          onClick={() =>
                            setProfile((current) => ({
                              ...current,
                              notificationMode: mode,
                            }))
                          }
                          type="button"
                        >
                          {mode}
                        </button>
                      ))}
                    </div>
                  </SurfaceCard>
                  <SurfaceCard>
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold text-slate-100">
                        Recurring circles
                      </h3>
                      <button
                        className="rounded-xl border border-slate-600 px-3 py-1 text-xs font-semibold text-slate-100"
                        onClick={() => {
                          createCircleQuick().catch(() => {});
                        }}
                        type="button"
                      >
                        New circle
                      </button>
                    </div>
                    {circlesBusy ? (
                      <p className="mt-2 text-xs text-ash">Loading circles…</p>
                    ) : recurringCircles.length === 0 ? (
                      <p className="mt-2 text-xs text-ash">
                        No circles yet. Create one to start a recurring social
                        flow.
                      </p>
                    ) : (
                      <div className="mt-2 grid gap-2">
                        {recurringCircles.map((circle) => (
                          <button
                            className={`rounded-xl border px-3 py-2 text-left text-xs ${
                              selectedCircleId === circle.id
                                ? "border-ember bg-ember/20 text-amber-100"
                                : "border-slate-700 text-slate-200"
                            }`}
                            key={circle.id}
                            onClick={() => {
                              setSelectedCircleId(circle.id);
                            }}
                            type="button"
                          >
                            <p className="font-semibold">{circle.title}</p>
                            <p className="text-[11px] text-ash">
                              {circle.status} · next{" "}
                              {circle.nextSessionAt
                                ? new Date(
                                    circle.nextSessionAt,
                                  ).toLocaleString()
                                : "not scheduled"}
                            </p>
                          </button>
                        ))}
                      </div>
                    )}
                    <div className="mt-3 flex items-center justify-between">
                      <p className="text-xs text-ash">
                        {selectedCircle
                          ? `Selected: ${selectedCircle.title}`
                          : "Select a circle"}
                      </p>
                      <button
                        className="rounded-xl bg-ocean px-3 py-1 text-xs font-semibold text-white disabled:opacity-50"
                        disabled={!selectedCircle}
                        onClick={() => {
                          runCircleSessionNow().catch(() => {});
                        }}
                        type="button"
                      >
                        Open session now
                      </button>
                    </div>
                    <div className="mt-2 max-h-32 overflow-y-auto rounded-xl border border-slate-700 p-2">
                      {recurringSessions.length === 0 ? (
                        <p className="text-xs text-ash">
                          No recent sessions for this circle.
                        </p>
                      ) : (
                        recurringSessions.map((sessionItem) => (
                          <p
                            className="mb-1 text-xs text-slate-200"
                            key={sessionItem.id}
                          >
                            {new Date(
                              sessionItem.scheduledFor,
                            ).toLocaleString()}
                            {" · "}
                            {sessionItem.status}
                            {sessionItem.generatedIntentId
                              ? ` · intent ${sessionItem.generatedIntentId.slice(0, 8)}`
                              : ""}
                          </p>
                        ))
                      )}
                    </div>
                  </SurfaceCard>
                  <div className="grid gap-2 sm:grid-cols-3">
                    <button
                      className="rounded-xl bg-ocean px-3 py-2 text-sm font-semibold text-white"
                      onClick={() => {
                        saveProfileSettings().catch(() => {});
                      }}
                      type="button"
                    >
                      Save settings
                    </button>
                    <button
                      className="rounded-xl border border-slate-600 px-3 py-2 text-sm font-semibold text-slate-100"
                      onClick={() => {
                        sendDigestNow().catch(() => {});
                      }}
                      type="button"
                    >
                      Request digest
                    </button>
                    <button
                      className="rounded-xl border border-rose-500/60 px-3 py-2 text-sm font-semibold text-rose-200"
                      onClick={signOut}
                      type="button"
                    >
                      Sign out
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </section>
      ) : null}
    </main>
  );
}

function socialModeToPayload(socialMode: SocialMode) {
  if (socialMode === "one_to_one") {
    return {
      socialMode: "balanced" as const,
      preferOneToOne: true,
      allowGroupInvites: false,
    };
  }

  if (socialMode === "group") {
    return {
      socialMode: "high_energy" as const,
      preferOneToOne: false,
      allowGroupInvites: true,
    };
  }

  return {
    socialMode: "balanced" as const,
    preferOneToOne: false,
    allowGroupInvites: true,
  };
}

export default function Page() {
  if (webDesignMock) {
    return <WebDesignMockApp />;
  }
  return (
    <Suspense fallback={null}>
      <ProductionWebPage />
    </Suspense>
  );
}
