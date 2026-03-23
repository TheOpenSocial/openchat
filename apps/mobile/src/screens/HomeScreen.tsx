import {
  agentThreadMessagesToTranscript,
  extractResponseTokenDelta,
} from "@opensocial/types";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { SafeAreaView } from "react-native-safe-area-context";

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
  isOfflineApiError,
  isRetryableApiError,
} from "../lib/api";
import { openAgentThreadSse } from "../lib/agent-thread-sse";
import {
  type AppLocale,
  supportedLocales,
  t,
  type TranslationKey,
} from "../i18n/strings";
import {
  clearStoredChats,
  loadStoredChats,
  saveStoredChats,
  type StoredChatThread,
} from "../lib/chat-storage";
import {
  clearTelemetryEvents,
  getTelemetrySummary,
  trackTelemetryEvent,
  type TelemetryEventName,
  type TelemetrySummary,
} from "../lib/telemetry";
import {
  createRealtimeSession,
  type RealtimeConnectionState,
  type RealtimeSession,
} from "../lib/realtime";
import { AnimatedScreen } from "../components/AnimatedScreen";
import { AppDrawer } from "../components/AppDrawer";
import { AppTopBar } from "../components/AppTopBar";
import { CalmTextField } from "../components/CalmTextField";
import { ChatBubble } from "../components/ChatBubble";
import { ChatTranscriptList } from "../components/ChatTranscriptList";
import { ChoiceChip } from "../components/ChoiceChip";
import { EmptyState } from "../components/EmptyState";
import { HomeTabBar } from "../components/HomeTabBar";
import { InlineNotice } from "../components/InlineNotice";
import { MessageComposer } from "../components/MessageComposer";
import { PrimaryButton } from "../components/PrimaryButton";
import { SurfaceCard } from "../components/SurfaceCard";
import { hapticImpact, hapticSelection } from "../lib/haptics";
import {
  clearOfflineOutbox,
  loadOfflineOutbox,
  processOfflineOutbox,
  queueOfflineComposerSend,
  queueOfflineProfileSave,
} from "../lib/offline-outbox";
import { useNetworkOnline } from "../lib/use-network-online";
import { usePrimaryAgentThread } from "../lib/use-primary-agent-thread";
import {
  DESIGN_MOCK_AGENT_TIMELINE,
  DESIGN_MOCK_CHATS,
  DESIGN_MOCK_TELEMETRY_SUMMARY,
} from "../mocks/design-fixtures";
import { OpenChatScreen } from "../open-chat/OpenChatScreen";
import { appTheme } from "../theme";
import {
  type AgentTimelineMessage,
  HomeTab,
  MobileSession,
  UserProfileDraft,
} from "../types";

export interface HomeScreenProps {
  session: MobileSession;
  initialProfile: UserProfileDraft;
  onProfileUpdated: (profile: UserProfileDraft) => void;
  onResetSession: () => Promise<void>;
  /** Full UI on local fixtures; skips API, realtime, and chat persistence. */
  designMock?: boolean;
  /** When set, sent as the first agent-thread message once the primary thread is ready (e.g. post-onboarding). */
  initialAgentMessage?: string | null;
  /** Called after the seed message attempt finishes (success or error). */
  onInitialAgentMessageConsumed?: () => void;
}

type IntentSendOutcome = "sent" | "queued" | "failed" | "aborted";

type LocalChatThread = StoredChatThread;

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

function stableHash36(input: string) {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function buildOnboardingCarryoverIdempotencyKey(userId: string, seed: string) {
  const normalized = seed.trim().toLowerCase().replace(/\s+/g, " ");
  return `onboarding-carryover:${userId}:${stableHash36(normalized)}`;
}

const tabLabels: Record<HomeTab, TranslationKey> = {
  home: "homeTabHome",
  chats: "homeTabChats",
  profile: "homeTabProfile",
};

const tabDescriptions: Record<HomeTab, TranslationKey> = {
  home: "homeTabHomeDescription",
  chats: "homeTabChatsDescription",
  profile: "homeTabProfileDescription",
};
const MOBILE_LOCALE_STORAGE_KEY = "opensocial.mobile.locale.v1";
const ONBOARDING_CARRYOVER_STORAGE_KEY_PREFIX =
  "opensocial.mobile.onboarding.carryover.v1";

function onboardingCarryoverStorageKey(userId: string) {
  return `${ONBOARDING_CARRYOVER_STORAGE_KEY_PREFIX}.${userId}`;
}

export function HomeScreen({
  designMock = false,
  initialAgentMessage = null,
  initialProfile,
  onInitialAgentMessageConsumed,
  onProfileUpdated,
  onResetSession,
  session,
}: HomeScreenProps) {
  type OnboardingCarryoverState = "processing" | "queued" | "ready" | null;
  const [locale, setLocale] = useState<AppLocale>("en");
  const enableE2ELocalMode =
    process.env.EXPO_PUBLIC_ENABLE_E2E_LOCAL_MODE === "1";
  const enablePushNotifications =
    process.env.EXPO_PUBLIC_ENABLE_PUSH_NOTIFICATIONS === "1";
  const skipNetwork = designMock;
  const [activeTab, setActiveTab] = useState<HomeTab>("home");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const intentAbortRef = useRef<AbortController | null>(null);
  const agentVoiceTranscriptRef = useRef<string | null>(null);
  const [draftIntentText, setDraftIntentText] = useState("");
  const [agentImageUrlDraft, setAgentImageUrlDraft] = useState("");
  const [onboardingCarryoverSeed, setOnboardingCarryoverSeed] = useState("");
  const [
    onboardingCarryoverIdempotencyKey,
    setOnboardingCarryoverIdempotencyKey,
  ] = useState<string | null>(null);
  const [onboardingCarryoverState, setOnboardingCarryoverState] =
    useState<OnboardingCarryoverState>(null);
  const [sendingIntent, setSendingIntent] = useState(false);
  const [decomposeIntent, setDecomposeIntent] = useState(true);
  const [decomposeMaxIntents, setDecomposeMaxIntents] = useState(3);
  const [agentTimeline, setAgentTimeline] = useState<AgentTimelineMessage[]>(
    () =>
      designMock
        ? [...DESIGN_MOCK_AGENT_TIMELINE]
        : [
            {
              id: "seed_1",
              role: "agent",
              body: t("homeAgentSeedPrompt", "en"),
            },
          ],
  );
  const [banner, setBanner] = useState<{
    tone: "info" | "error" | "success";
    text: string;
  } | null>(null);
  const [chats, setChats] = useState<LocalChatThread[]>(() =>
    designMock ? [...DESIGN_MOCK_CHATS] : [],
  );
  const [selectedChatId, setSelectedChatId] = useState<string | null>(() =>
    designMock && DESIGN_MOCK_CHATS[0] ? DESIGN_MOCK_CHATS[0].id : null,
  );
  const [draftChatMessage, setDraftChatMessage] = useState("");
  const [sendingChatMessage, setSendingChatMessage] = useState(false);
  const [newChatType, setNewChatType] = useState<"dm" | "group">("dm");
  const [creatingChat, setCreatingChat] = useState(false);
  const [syncingChats, setSyncingChats] = useState<Record<string, boolean>>({});
  const [syncingAllChats, setSyncingAllChats] = useState(false);
  const [pendingOutboxCount, setPendingOutboxCount] = useState(0);
  const [chatStorageReady, setChatStorageReady] = useState(() => designMock);
  const [realtimeState, setRealtimeState] = useState<RealtimeConnectionState>(
    () => (designMock ? "connected" : "offline"),
  );
  const [typingUsersByChat, setTypingUsersByChat] = useState<
    Record<string, string[]>
  >({});
  const [profileDraft, setProfileDraft] =
    useState<UserProfileDraft>(initialProfile);
  const [pushToken, setPushToken] = useState<string | null>(null);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [profileLoading, setProfileLoading] = useState(false);
  const [recurringCircles, setRecurringCircles] = useState<
    RecurringCircleRecord[]
  >([]);
  const [selectedCircleId, setSelectedCircleId] = useState<string | null>(null);
  const [recurringSessions, setRecurringSessions] = useState<
    RecurringCircleSessionRecord[]
  >([]);
  const [recurringBusy, setRecurringBusy] = useState(false);
  const [passiveDiscovery, setPassiveDiscovery] =
    useState<PassiveDiscoveryResponse | null>(null);
  const [inboxSuggestions, setInboxSuggestions] =
    useState<DiscoveryInboxSuggestionsResponse | null>(null);
  const [pendingIntentSummary, setPendingIntentSummary] =
    useState<PendingIntentsSummaryResponse | null>(null);
  const [selectedExplainedIntentId, setSelectedExplainedIntentId] = useState<
    string | null
  >(null);
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
  const [trustSummary, setTrustSummary] = useState(() =>
    designMock
      ? "badge: verified · reputation: strong"
      : "trust baseline not loaded",
  );
  const [telemetrySummary, setTelemetrySummary] =
    useState<TelemetrySummary | null>(() =>
      designMock ? DESIGN_MOCK_TELEMETRY_SUMMARY : null,
    );
  const chatsRef = useRef<LocalChatThread[]>([]);
  const selectedChatIdRef = useRef<string | null>(null);
  const realtimeSessionRef = useRef<RealtimeSession | null>(null);
  const localTypingActiveRef = useRef(false);
  const localTypingChatIdRef = useRef<string | null>(null);
  const localTypingStopTimeoutRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  const onboardingSeedHandledRef = useRef(false);
  const typingClearTimersRef = useRef<
    Map<string, ReturnType<typeof setTimeout>>
  >(new Map());

  useEffect(() => {
    let mounted = true;
    AsyncStorage.getItem(MOBILE_LOCALE_STORAGE_KEY)
      .then((stored: string | null) => {
        if (
          mounted &&
          stored &&
          supportedLocales.includes(stored as AppLocale)
        ) {
          setLocale(stored as AppLocale);
        }
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    AsyncStorage.setItem(MOBILE_LOCALE_STORAGE_KEY, locale).catch(() => {});
  }, [locale]);

  useEffect(() => {
    if (designMock || enableE2ELocalMode) {
      return;
    }
    if (initialAgentMessage?.trim()) {
      return;
    }
    let mounted = true;
    AsyncStorage.getItem(onboardingCarryoverStorageKey(session.userId))
      .then((raw) => {
        if (!mounted || !raw || onboardingSeedHandledRef.current) {
          return;
        }
        try {
          const parsed = JSON.parse(raw) as {
            seed?: string;
            state?: "processing" | "queued" | "ready";
            idempotencyKey?: string;
          };
          const seed = parsed.seed?.trim();
          const idempotencyKey = parsed.idempotencyKey?.trim();
          if (!seed || !idempotencyKey) {
            return;
          }
          onboardingSeedHandledRef.current = true;
          setOnboardingCarryoverSeed(seed);
          setOnboardingCarryoverIdempotencyKey(idempotencyKey);
          if (parsed.state === "queued") {
            setOnboardingCarryoverState("queued");
            return;
          }
          setOnboardingCarryoverState("ready");
          if (parsed.state === "processing") {
            setBanner({
              tone: "info",
              text: "We restored your first activation step. Tap to resume.",
            });
          }
        } catch {
          // Ignore malformed persisted carryover payloads.
        }
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, [designMock, enableE2ELocalMode, initialAgentMessage, session.userId]);

  useEffect(() => {
    const seed = onboardingCarryoverSeed.trim();
    const idempotencyKey = onboardingCarryoverIdempotencyKey?.trim();
    if (!seed || !onboardingCarryoverState || !idempotencyKey) {
      AsyncStorage.removeItem(
        onboardingCarryoverStorageKey(session.userId),
      ).catch(() => {});
      return;
    }
    const persistedState =
      onboardingCarryoverState === "processing"
        ? "ready"
        : onboardingCarryoverState;
    AsyncStorage.setItem(
      onboardingCarryoverStorageKey(session.userId),
      JSON.stringify({
        seed,
        state: persistedState,
        idempotencyKey,
        updatedAt: new Date().toISOString(),
      }),
    ).catch(() => {});
  }, [
    onboardingCarryoverIdempotencyKey,
    onboardingCarryoverSeed,
    onboardingCarryoverState,
    session.userId,
  ]);
  const trackedRequestSentIntentsRef = useRef<Set<string>>(new Set());
  const [agentComposerMode, setAgentComposerMode] = useState<"chat" | "intent">(
    "chat",
  );
  const netOnline = useNetworkOnline(skipNetwork);
  const refreshPendingOutboxCount = useCallback(async () => {
    if (designMock || enableE2ELocalMode || skipNetwork) {
      setPendingOutboxCount(0);
      return;
    }
    const pending = await loadOfflineOutbox(session.userId);
    setPendingOutboxCount(pending.length);
  }, [designMock, enableE2ELocalMode, session.userId, skipNetwork]);
  const agentThreadSyncEnabled =
    !skipNetwork && !enableE2ELocalMode && !designMock;
  const { loading: agentThreadLoading, threadId: agentThreadId } =
    usePrimaryAgentThread({
      accessToken: session.accessToken,
      enabled: agentThreadSyncEnabled,
      onHydrated: setAgentTimeline,
      onLoadError: () =>
        setBanner({
          tone: "error",
          text: "Could not load your conversation.",
        }),
    });

  useEffect(() => {
    void refreshPendingOutboxCount().catch(() => {});
  }, [refreshPendingOutboxCount]);

  const selectedChat = useMemo(
    () => chats.find((chat) => chat.id === selectedChatId) ?? null,
    [chats, selectedChatId],
  );
  const typingUsers = useMemo(
    () => (selectedChatId ? (typingUsersByChat[selectedChatId] ?? []) : []),
    [selectedChatId, typingUsersByChat],
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

  const clearTypingUser = useCallback((chatId: string, userId: string) => {
    setTypingUsersByChat((current) => {
      const users = current[chatId];
      if (!users || users.length === 0) {
        return current;
      }
      const nextUsers = users.filter((candidate) => candidate !== userId);
      if (nextUsers.length === users.length) {
        return current;
      }
      if (nextUsers.length === 0) {
        const next = { ...current };
        delete next[chatId];
        return next;
      }
      return {
        ...current,
        [chatId]: nextUsers,
      };
    });
  }, []);

  const applyRealtimeChatMessage = useCallback(
    (chatId: string, message: ChatMessageRecord) => {
      setChats((current) =>
        current.map((thread) => {
          if (thread.id !== chatId) {
            return thread;
          }

          const mergedMessages = mergeChatMessages(thread.messages, [message]);
          const selected = selectedChatIdRef.current === chatId;
          const incrementUnread =
            !selected && message.senderUserId !== session.userId;

          return {
            ...thread,
            messages: mergedMessages,
            highWatermark: message.createdAt,
            unreadCount: incrementUnread
              ? thread.unreadCount + 1
              : thread.unreadCount,
          };
        }),
      );
    },
    [session.userId],
  );

  const refreshTelemetry = useCallback(async () => {
    if (skipNetwork) {
      setTelemetrySummary(DESIGN_MOCK_TELEMETRY_SUMMARY);
      return;
    }
    try {
      const summary = await getTelemetrySummary(session.userId);
      setTelemetrySummary(summary);
    } catch {
      // Ignore telemetry refresh failures to avoid interrupting core UX flows.
    }
  }, [session.userId, skipNetwork]);

  const recordTelemetry = useCallback(
    (name: TelemetryEventName, properties?: Record<string, unknown>) => {
      void trackTelemetryEvent(session.userId, name, properties)
        .then(() => refreshTelemetry())
        .catch(() => {});
    },
    [refreshTelemetry, session.userId],
  );

  useEffect(() => {
    chatsRef.current = chats;
  }, [chats]);

  useEffect(() => {
    selectedChatIdRef.current = selectedChatId;
  }, [selectedChatId]);

  useEffect(() => {
    refreshTelemetry().catch(() => {});
  }, [refreshTelemetry]);

  useEffect(() => {
    if (skipNetwork) {
      return;
    }
    let mounted = true;

    const bootstrap = async () => {
      setProfileLoading(true);
      try {
        const [globalRules, trust] = await Promise.all([
          api.getGlobalRules(session.userId, session.accessToken),
          api.getTrustProfile(session.userId, session.accessToken),
        ]);

        const notificationMode =
          globalRules.notificationMode === "digest" ? "digest" : "live";
        const nextProfile: UserProfileDraft = {
          ...profileDraft,
          notificationMode,
        };

        if (mounted) {
          setProfileDraft(nextProfile);
          setTrustSummary(
            `badge: ${String(trust.verificationBadge ?? "unknown")} · reputation: ${String(
              trust.reputationScore ?? "n/a",
            )}`,
          );
        }
      } catch (error) {
        if (mounted) {
          setBanner({
            tone: "error",
            text: `Failed to bootstrap profile data: ${String(error)}`,
          });
        }
      } finally {
        if (mounted) {
          setProfileLoading(false);
        }
      }
    };

    bootstrap().catch(() => {});
    return () => {
      mounted = false;
    };
  }, [session.accessToken, session.userId, skipNetwork]);

  useEffect(() => {
    if (skipNetwork || activeTab !== "profile") {
      return;
    }
    let mounted = true;
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
        if (!mounted) {
          return;
        }
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
        if (!mounted) {
          return;
        }
        setBanner({
          tone: "error",
          text: `Could not load automations: ${String(error)}`,
        });
      })
      .finally(() => {
        if (mounted) {
          setAutomationsBusy(false);
        }
      });
    return () => {
      mounted = false;
    };
  }, [activeTab, session.accessToken, session.userId, skipNetwork]);

  useEffect(() => {
    if (skipNetwork || activeTab !== "profile" || !selectedScheduledTaskId) {
      setScheduledTaskRuns([]);
      return;
    }
    let mounted = true;
    api
      .listScheduledTaskRuns(selectedScheduledTaskId, 8, session.accessToken)
      .then((runs) => {
        if (!mounted) {
          return;
        }
        setScheduledTaskRuns(runs);
      })
      .catch((error) => {
        if (!mounted) {
          return;
        }
        setBanner({
          tone: "error",
          text: `Could not load task runs: ${String(error)}`,
        });
      });
    return () => {
      mounted = false;
    };
  }, [activeTab, selectedScheduledTaskId, session.accessToken, skipNetwork]);

  useEffect(() => {
    if (skipNetwork || activeTab !== "profile") {
      return;
    }
    let mounted = true;
    setRecurringBusy(true);
    api
      .listRecurringCircles(session.userId, session.accessToken)
      .then((circles) => {
        if (!mounted) {
          return;
        }
        setRecurringCircles(circles);
        setSelectedCircleId((current) => {
          if (current && circles.some((circle) => circle.id === current)) {
            return current;
          }
          return circles[0]?.id ?? null;
        });
      })
      .catch((error) => {
        if (!mounted) {
          return;
        }
        setBanner({
          tone: "error",
          text: `Could not load circles: ${String(error)}`,
        });
      })
      .finally(() => {
        if (mounted) {
          setRecurringBusy(false);
        }
      });
    return () => {
      mounted = false;
    };
  }, [activeTab, session.accessToken, session.userId, skipNetwork]);

  useEffect(() => {
    if (skipNetwork || activeTab !== "profile" || !selectedCircleId) {
      setRecurringSessions([]);
      return;
    }
    let mounted = true;
    api
      .listRecurringCircleSessions(selectedCircleId, session.accessToken)
      .then((sessions) => {
        if (!mounted) {
          return;
        }
        setRecurringSessions(sessions);
      })
      .catch((error) => {
        if (!mounted) {
          return;
        }
        setBanner({
          tone: "error",
          text: `Could not load circle sessions: ${String(error)}`,
        });
      });
    return () => {
      mounted = false;
    };
  }, [activeTab, selectedCircleId, session.accessToken, skipNetwork]);

  useEffect(() => {
    if (skipNetwork || activeTab !== "profile") {
      return;
    }
    let mounted = true;
    setDiscoveryBusy(true);
    Promise.all([
      api.getPassiveDiscovery(session.userId, 3, session.accessToken),
      api.getDiscoveryInboxSuggestions(session.userId, 4, session.accessToken),
      api.summarizePendingIntents(session.userId, 8, session.accessToken),
    ])
      .then(([passive, inbox, pending]) => {
        if (!mounted) {
          return;
        }
        setPassiveDiscovery(passive);
        setInboxSuggestions(inbox);
        setPendingIntentSummary(pending);
        setSelectedExplainedIntentId((current) => {
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
        if (!mounted) {
          return;
        }
        setBanner({
          tone: "error",
          text: `Could not load discovery snapshots: ${String(error)}`,
        });
      })
      .finally(() => {
        if (mounted) {
          setDiscoveryBusy(false);
        }
      });
    return () => {
      mounted = false;
    };
  }, [activeTab, session.accessToken, session.userId, skipNetwork]);

  useEffect(() => {
    if (skipNetwork || designMock || activeTab !== "home") {
      return;
    }
    let cancelled = false;
    const refreshPending = () => {
      void api
        .summarizePendingIntents(session.userId, 8, session.accessToken)
        .then((pending) => {
          if (!cancelled) {
            setPendingIntentSummary(pending);
          }
        })
        .catch(() => {});
    };
    refreshPending();
    const interval = setInterval(refreshPending, 30_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [activeTab, designMock, session.accessToken, session.userId, skipNetwork]);

  useEffect(() => {
    if (
      skipNetwork ||
      activeTab !== "profile" ||
      selectedExplainedIntentId == null
    ) {
      setUserIntentExplanation(null);
      return;
    }
    let mounted = true;
    api
      .getUserIntentExplanation(selectedExplainedIntentId, session.accessToken)
      .then((explanation) => {
        if (!mounted) {
          return;
        }
        setUserIntentExplanation(explanation);
      })
      .catch((error) => {
        if (!mounted) {
          return;
        }
        setBanner({
          tone: "error",
          text: `Could not load routing explanation: ${String(error)}`,
        });
      });
    return () => {
      mounted = false;
    };
  }, [activeTab, selectedExplainedIntentId, session.accessToken, skipNetwork]);

  useEffect(() => {
    if (skipNetwork || !enablePushNotifications) {
      return;
    }
    let mounted = true;
    void import("../lib/notifications")
      .then((notifications) =>
        notifications.registerForPushNotificationsAsync(),
      )
      .then((result) => {
        if (!mounted) {
          return;
        }
        setPushEnabled(result.enabled);
        setPushToken(result.token);
      })
      .catch(() => {
        if (!mounted) {
          return;
        }
        setPushEnabled(false);
        setPushToken(null);
      });

    return () => {
      mounted = false;
    };
  }, [enablePushNotifications, skipNetwork]);

  useEffect(() => {
    if (skipNetwork) {
      return;
    }
    let mounted = true;
    setChatStorageReady(false);
    setChats([]);
    setSelectedChatId(null);
    trackedRequestSentIntentsRef.current.clear();

    loadStoredChats(session.userId)
      .then((storedThreads) => {
        if (!mounted) {
          return;
        }
        setChats(storedThreads);
        if (storedThreads.length > 0) {
          setSelectedChatId(storedThreads[0].id);
        }
      })
      .catch((error) => {
        if (!mounted) {
          return;
        }
        setBanner({
          tone: "error",
          text: `Failed to restore chats: ${String(error)}`,
        });
      })
      .finally(() => {
        if (mounted) {
          setChatStorageReady(true);
        }
      });

    return () => {
      mounted = false;
    };
  }, [session.userId, skipNetwork]);

  useEffect(() => {
    if (skipNetwork) {
      return;
    }
    if (!chatStorageReady) {
      return;
    }

    const replaySince = new Date(Date.now() - 5 * 60_000).toISOString();
    const realtimeSession = createRealtimeSession({
      userId: session.userId,
      accessToken: session.accessToken,
      roomIds: chatsRef.current.map((thread) => thread.id),
      replaySince,
      callbacks: {
        onConnectionStateChange: setRealtimeState,
        onChatMessageCreated: (chatId, message) => {
          applyRealtimeChatMessage(chatId, message);
        },
        onChatReplay: (chatId, messages) => {
          if (messages.length === 0) {
            return;
          }
          setChats((current) =>
            current.map((thread) => {
              if (thread.id !== chatId) {
                return thread;
              }
              const mergedMessages = mergeChatMessages(
                thread.messages,
                messages,
              );
              return {
                ...thread,
                messages: mergedMessages,
                highWatermark:
                  mergedMessages.at(-1)?.createdAt ?? thread.highWatermark,
              };
            }),
          );
        },
        onTyping: ({ roomId, userId, isTyping }) => {
          if (userId === session.userId) {
            return;
          }

          const timerKey = `${roomId}:${userId}`;
          const currentTimer = typingClearTimersRef.current.get(timerKey);
          if (currentTimer) {
            clearTimeout(currentTimer);
            typingClearTimersRef.current.delete(timerKey);
          }

          if (!isTyping) {
            clearTypingUser(roomId, userId);
            return;
          }

          setTypingUsersByChat((current) => {
            const currentUsers = current[roomId] ?? [];
            if (currentUsers.includes(userId)) {
              return current;
            }
            return {
              ...current,
              [roomId]: [...currentUsers, userId],
            };
          });

          const clearTimer = setTimeout(() => {
            clearTypingUser(roomId, userId);
            typingClearTimersRef.current.delete(timerKey);
          }, 3_000);
          typingClearTimersRef.current.set(timerKey, clearTimer);
        },
      },
    });

    realtimeSessionRef.current = realtimeSession;

    return () => {
      for (const timer of typingClearTimersRef.current.values()) {
        clearTimeout(timer);
      }
      typingClearTimersRef.current.clear();
      if (localTypingStopTimeoutRef.current) {
        clearTimeout(localTypingStopTimeoutRef.current);
        localTypingStopTimeoutRef.current = null;
      }
      localTypingActiveRef.current = false;
      localTypingChatIdRef.current = null;
      setTypingUsersByChat({});
      realtimeSession.disconnect();
      realtimeSessionRef.current = null;
    };
  }, [
    applyRealtimeChatMessage,
    chatStorageReady,
    clearTypingUser,
    session.userId,
    skipNetwork,
  ]);

  useEffect(() => {
    if (skipNetwork) {
      return;
    }
    realtimeSessionRef.current?.updateRooms(chats.map((thread) => thread.id));
  }, [chats, skipNetwork]);

  useEffect(() => {
    const previousChatId = localTypingChatIdRef.current;
    if (
      previousChatId &&
      previousChatId !== selectedChatId &&
      localTypingActiveRef.current
    ) {
      realtimeSessionRef.current?.publishTyping(
        previousChatId,
        session.userId,
        false,
      );
      localTypingActiveRef.current = false;
    }
    localTypingChatIdRef.current = selectedChatId;
  }, [selectedChatId, session.userId]);

  useEffect(() => {
    if (skipNetwork) {
      return;
    }
    if (!chatStorageReady) {
      return;
    }

    saveStoredChats(session.userId, chats).catch((error) => {
      setBanner({
        tone: "error",
        text: `Failed to persist chats: ${String(error)}`,
      });
    });
  }, [chatStorageReady, chats, session.userId, skipNetwork]);

  const setChatSyncingState = useCallback(
    (chatId: string, syncing: boolean) => {
      setSyncingChats((current) => {
        if (syncing) {
          if (current[chatId]) {
            return current;
          }
          return { ...current, [chatId]: true };
        }

        if (!current[chatId]) {
          return current;
        }

        const next = { ...current };
        delete next[chatId];
        return next;
      });
    },
    [],
  );

  const syncChatThread = useCallback(
    async (
      chatId: string,
      options?: {
        force?: boolean;
        quiet?: boolean;
      },
    ) => {
      if (enableE2ELocalMode || designMock) {
        return true;
      }

      const currentThread = chatsRef.current.find(
        (thread) => thread.id === chatId,
      );
      const after = options?.force
        ? undefined
        : (currentThread?.highWatermark ?? undefined);

      setChatSyncingState(chatId, true);
      try {
        const [syncResult, metadata] = await Promise.all([
          api.syncChatMessages(
            chatId,
            session.userId,
            { after, limit: 100 },
            session.accessToken,
          ),
          api.getChatMetadata(chatId, session.accessToken).catch(() => null),
        ]);

        setChats((current) =>
          current.map((thread) => {
            if (thread.id !== chatId) {
              return thread;
            }

            const mergedMessages = mergeChatMessages(
              thread.messages,
              syncResult.messages,
            );
            const selected = selectedChatIdRef.current === chatId;

            return {
              ...thread,
              messages: mergedMessages,
              highWatermark:
                syncResult.highWatermark ??
                mergedMessages.at(-1)?.createdAt ??
                thread.highWatermark,
              unreadCount: selected ? 0 : Math.max(syncResult.unreadCount, 0),
              participantCount:
                typeof metadata?.participantCount === "number"
                  ? metadata.participantCount
                  : thread.participantCount,
              connectionStatus:
                typeof metadata?.connectionStatus === "string"
                  ? metadata.connectionStatus
                  : thread.connectionStatus,
            };
          }),
        );
        return true;
      } catch (error) {
        if (!options?.quiet) {
          setBanner({
            tone: "error",
            text: `Failed to sync chat: ${String(error)}`,
          });
        }
        return false;
      } finally {
        setChatSyncingState(chatId, false);
      }
    },
    [
      designMock,
      enableE2ELocalMode,
      session.accessToken,
      session.userId,
      setChatSyncingState,
    ],
  );

  useEffect(() => {
    if (skipNetwork) {
      return;
    }
    if (!netOnline) {
      return;
    }
    if (!chatStorageReady || chats.length === 0) {
      return;
    }

    let cancelled = false;
    const syncAll = async () => {
      const chatIds = chatsRef.current.map((thread) => thread.id);
      for (const chatId of chatIds) {
        if (cancelled) {
          return;
        }
        await syncChatThread(chatId, { quiet: true });
      }
    };

    syncAll().catch(() => {});
    const interval = setInterval(() => {
      syncAll().catch(() => {});
    }, 30_000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [chatStorageReady, chats.length, netOnline, skipNetwork, syncChatThread]);

  useEffect(() => {
    if (skipNetwork || designMock || enableE2ELocalMode || !netOnline) {
      return;
    }

    let cancelled = false;
    void (async () => {
      const result = await processOfflineOutbox({
        userId: session.userId,
        accessToken: session.accessToken,
      }).catch(() => null);
      if (cancelled || !result) {
        return;
      }
      await refreshPendingOutboxCount().catch(() => {});
      if (result.sentThreadIds.includes(agentThreadId ?? "")) {
        const messages = agentThreadId
          ? await api
              .listAgentThreadMessages(agentThreadId, session.accessToken)
              .catch(() => null)
          : null;
        if (messages) {
          setAgentTimeline(agentThreadMessagesToTranscript(messages));
        }
      }
      if (result.processed > 0) {
        setBanner({
          tone: "success",
          text:
            result.remaining > 0
              ? `Synced ${result.processed} queued action${result.processed === 1 ? "" : "s"}. ${result.remaining} still waiting.`
              : `Synced ${result.processed} queued action${result.processed === 1 ? "" : "s"}.`,
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    agentThreadId,
    designMock,
    enableE2ELocalMode,
    netOnline,
    refreshPendingOutboxCount,
    session.accessToken,
    session.userId,
    skipNetwork,
  ]);

  useEffect(() => {
    if (
      skipNetwork ||
      designMock ||
      enableE2ELocalMode ||
      !netOnline ||
      !agentThreadId
    ) {
      return;
    }
    let cancelled = false;
    void api
      .listAgentThreadMessages(agentThreadId, session.accessToken)
      .then((messages) => {
        if (!cancelled) {
          setAgentTimeline(agentThreadMessagesToTranscript(messages));
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [
    agentThreadId,
    designMock,
    enableE2ELocalMode,
    netOnline,
    session.accessToken,
    skipNetwork,
  ]);

  const syncChatsNow = async () => {
    const chatIds = chatsRef.current.map((thread) => thread.id);
    if (chatIds.length === 0) {
      return;
    }

    if (designMock) {
      setBanner({
        tone: "success",
        text: "Chats up to date (preview).",
      });
      return;
    }

    recordTelemetry("chat_sync_manual", {
      threads: chatIds.length,
    });
    setSyncingAllChats(true);
    let failures = 0;
    for (const chatId of chatIds) {
      const ok = await syncChatThread(chatId, { quiet: true });
      if (!ok) {
        failures += 1;
      }
    }
    setSyncingAllChats(false);

    if (failures === 0) {
      setBanner({
        tone: "success",
        text: "Chats synced.",
      });
      return;
    }

    setBanner({
      tone: "error",
      text: `Chat sync completed with ${failures} failure${failures === 1 ? "" : "s"}.`,
    });
    recordTelemetry("chat_sync_failed", {
      failures,
      total: chatIds.length,
    });
  };

  const resetAgentConversation = useCallback(() => {
    setAgentTimeline(
      designMock
        ? [...DESIGN_MOCK_AGENT_TIMELINE]
        : [
            {
              id: "seed_1",
              role: "agent",
              body: "What would you like to do today—or who would you like to meet?",
            },
          ],
    );
    setDraftIntentText("");
  }, [designMock]);

  const regenerateLastIntent = useCallback(() => {
    setAgentTimeline((current) => {
      let lastUserIndex = -1;
      for (let index = current.length - 1; index >= 0; index -= 1) {
        if (current[index].role === "user") {
          lastUserIndex = index;
          break;
        }
      }
      if (lastUserIndex < 0) {
        return current;
      }
      const text = current[lastUserIndex].body;
      requestAnimationFrame(() => {
        setDraftIntentText(text);
      });
      return current.slice(0, lastUserIndex);
    });
  }, []);

  const cancelIntentSend = useCallback(() => {
    intentAbortRef.current?.abort();
  }, []);

  const trackRequestSentForIntent = useCallback(
    async (intentId: string) => {
      if (trackedRequestSentIntentsRef.current.has(intentId)) {
        return;
      }
      if (designMock) {
        return;
      }

      for (let attempt = 0; attempt < 4; attempt += 1) {
        try {
          const summary = await api.summarizePendingIntents(
            session.userId,
            8,
            session.accessToken,
          );
          const matchedIntent = summary.intents.find(
            (intent) => intent.intentId === intentId,
          );
          if (!matchedIntent) {
            return;
          }

          const requestCount =
            matchedIntent.requests.pending +
            matchedIntent.requests.accepted +
            matchedIntent.requests.rejected +
            matchedIntent.requests.expired +
            matchedIntent.requests.cancelled;

          if (requestCount > 0) {
            trackedRequestSentIntentsRef.current.add(intentId);
            recordTelemetry("request_sent", {
              intentId,
              requestCount,
              pending: matchedIntent.requests.pending,
              accepted: matchedIntent.requests.accepted,
              rejected: matchedIntent.requests.rejected,
              expired: matchedIntent.requests.expired,
              cancelled: matchedIntent.requests.cancelled,
              attempt: attempt + 1,
            });
            return;
          }
        } catch {
          // Ignore transient summary polling errors; this is best-effort telemetry.
        }

        await sleep(2_000 * (attempt + 1));
      }
    },
    [designMock, recordTelemetry, session.accessToken, session.userId],
  );

  const sendIntent = async (
    messageOverride?: string,
    options?: {
      idempotencyKey?: string;
      onOutcome?: (outcome: IntentSendOutcome) => void;
    },
  ) => {
    const rawText = (messageOverride ?? draftIntentText).trim();
    if (!rawText || sendingIntent) {
      return;
    }

    const imageExtras = parseOptionalImageAttachmentUrl(agentImageUrlDraft);
    setSendingIntent(true);
    if (messageOverride == null) {
      setDraftIntentText("");
      setAgentImageUrlDraft("");
    }
    const timelineIdBase = Date.now().toString(36);
    const requestIdempotencyKey =
      options?.idempotencyKey ??
      `composer-send:${session.userId}:${timelineIdBase}`;
    const workflowMessageId = `workflow_${timelineIdBase}`;
    const useAgentChat =
      agentComposerMode === "chat" &&
      Boolean(agentThreadId) &&
      !enableE2ELocalMode &&
      !designMock;
    const useIntentAgentEndpoint =
      agentComposerMode === "intent" &&
      Boolean(agentThreadId) &&
      !enableE2ELocalMode &&
      !designMock;
    const workflowBody = useAgentChat
      ? t("agentWorkflowThinking", locale)
      : t("agentWorkflowRouting", locale);

    setAgentTimeline((current) => [
      ...current,
      {
        id: `user_${timelineIdBase}`,
        role: "user",
        body: rawText,
      },
      {
        id: workflowMessageId,
        role: "workflow",
        body: workflowBody,
      },
      ...(useAgentChat
        ? [
            {
              id: `agent_stream_${timelineIdBase}`,
              role: "agent" as const,
              body: "",
            },
          ]
        : []),
    ]);

    if (!skipNetwork && !designMock && !enableE2ELocalMode && !netOnline) {
      await queueOfflineComposerSend({
        userId: session.userId,
        mode: agentComposerMode,
        threadId: agentThreadId ?? null,
        text: rawText,
        idempotencyKey: requestIdempotencyKey,
        ...(agentVoiceTranscriptRef.current?.trim()
          ? { voiceTranscript: agentVoiceTranscriptRef.current.trim() }
          : {}),
        ...(imageExtras?.length ? { attachments: imageExtras } : {}),
        ...(agentComposerMode === "intent"
          ? {
              allowDecomposition: decomposeIntent,
              maxIntents: decomposeMaxIntents,
            }
          : {}),
      });
      agentVoiceTranscriptRef.current = null;
      await refreshPendingOutboxCount().catch(() => {});
      setAgentTimeline((current) => [
        ...current,
        {
          id: `agent_queue_${timelineIdBase}`,
          role: "agent",
          body: "Queued offline. I’ll send this as soon as you’re back online.",
        },
      ]);
      setBanner({
        tone: "info",
        text: "Queued offline. We’ll send it automatically when internet returns.",
      });
      setSendingIntent(false);
      options?.onOutcome?.("queued");
      return;
    }

    try {
      if (enableE2ELocalMode || designMock) {
        const localIntentId = enableE2ELocalMode
          ? `intent_local_${timelineIdBase}`
          : `intent_preview_${timelineIdBase}`;
        const agentBody = designMock
          ? `Intent queued (${localIntentId}). In production this fans out to matching, inbox, and chats.`
          : `Intent captured (${localIntentId}) in local E2E mode.`;
        setAgentTimeline((current) => [
          ...current,
          {
            id: `agent_${timelineIdBase}`,
            role: "agent",
            body: agentBody,
          },
        ]);
        recordTelemetry("intent_created", {
          intentId: localIntentId,
          textLength: rawText.length,
        });
        hapticImpact();
        options?.onOutcome?.("sent");
        return;
      }

      const controller = new AbortController();
      intentAbortRef.current = controller;

      if (useAgentChat && agentThreadId) {
        const streamingId = `agent_stream_${timelineIdBase}`;
        const traceId =
          globalThis.crypto?.randomUUID?.() ??
          `trace-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
        const voiceLine = agentVoiceTranscriptRef.current?.trim();

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
            rawText,
            session.accessToken,
            {
              signal: controller.signal,
              traceId,
              idempotencyKey: requestIdempotencyKey,
              ...(voiceLine ? { voiceTranscript: voiceLine } : {}),
              ...(imageExtras?.length ? { attachments: imageExtras } : {}),
            },
          );
        } finally {
          sse.close();
        }
        agentVoiceTranscriptRef.current = null;
        const messages = await api.listAgentThreadMessages(
          agentThreadId,
          session.accessToken,
        );
        setAgentTimeline(agentThreadMessagesToTranscript(messages));
        intentAbortRef.current = null;
        hapticImpact();
        recordTelemetry("agent_turn_completed", {
          textLength: rawText.length,
        });
        options?.onOutcome?.("sent");
        return;
      }

      if (useIntentAgentEndpoint && agentThreadId) {
        const intentResult = await api.createIntentFromAgentMessage(
          agentThreadId,
          session.userId,
          rawText,
          session.accessToken,
          {
            allowDecomposition: decomposeIntent,
            maxIntents: decomposeMaxIntents,
            idempotencyKey: requestIdempotencyKey,
          },
        );
        const primaryIntentId =
          intentResult.intentIds[0] ?? intentResult.intentId;
        setAgentTimeline((current) => [
          ...current,
          {
            id: `agent_${timelineIdBase}`,
            role: "agent",
            body:
              intentResult.intentCount > 1
                ? `Split into ${intentResult.intentCount} intents and started matching.`
                : `Intent captured (${primaryIntentId.slice(0, 8)}) and sent to matching.`,
          },
        ]);
        recordTelemetry("intent_created", {
          intentId: primaryIntentId,
          textLength: rawText.length,
          decomposed: intentResult.intentCount > 1,
          intentCount: intentResult.intentCount,
        });
        if (primaryIntentId) {
          setSelectedExplainedIntentId(primaryIntentId);
          void trackRequestSentForIntent(primaryIntentId);
        }
        hapticImpact();
        options?.onOutcome?.("sent");
        return;
      }

      const intent = await api.createIntent(
        session.userId,
        rawText,
        session.accessToken,
        {
          signal: controller.signal,
          agentThreadId: agentThreadId ?? undefined,
          idempotencyKey: requestIdempotencyKey,
        },
      );

      intentAbortRef.current = null;
      hapticImpact();

      setAgentTimeline((current) => [
        ...current,
        {
          id: `agent_${timelineIdBase}`,
          role: "agent",
          body: `Intent captured (${String(intent.id ?? "new")}) and sent to matching.`,
        },
      ]);
      const intentId = typeof intent.id === "string" ? intent.id : null;
      recordTelemetry("intent_created", {
        intentId: intentId ?? "",
        textLength: rawText.length,
      });
      if (intentId) {
        void trackRequestSentForIntent(intentId);
      }
      options?.onOutcome?.("sent");
    } catch (error) {
      const aborted = error instanceof Error && error.name === "AbortError";
      if (aborted) {
        setAgentTimeline((current) =>
          current
            .filter((message) => message.id !== workflowMessageId)
            .concat({
              id: `workflow_stop_${timelineIdBase}`,
              role: "workflow",
              body: "Stopped.",
            }),
        );
        options?.onOutcome?.("aborted");
        return;
      }

      if (isOfflineApiError(error) || isRetryableApiError(error)) {
        await queueOfflineComposerSend({
          userId: session.userId,
          mode: agentComposerMode,
          threadId: agentThreadId ?? null,
          text: rawText,
          idempotencyKey: requestIdempotencyKey,
          ...(agentVoiceTranscriptRef.current?.trim()
            ? { voiceTranscript: agentVoiceTranscriptRef.current.trim() }
            : {}),
          ...(imageExtras?.length ? { attachments: imageExtras } : {}),
          ...(agentComposerMode === "intent"
            ? {
                allowDecomposition: decomposeIntent,
                maxIntents: decomposeMaxIntents,
              }
            : {}),
        });
        agentVoiceTranscriptRef.current = null;
        await refreshPendingOutboxCount().catch(() => {});
        setAgentTimeline((current) => [
          ...current,
          {
            id: `agent_queue_${timelineIdBase}`,
            role: "agent",
            body: "Network dropped, so I queued this and will retry automatically.",
          },
        ]);
        setBanner({
          tone: "info",
          text: "Network issue detected. Your message is queued and will retry automatically.",
        });
        options?.onOutcome?.("queued");
        return;
      }

      setAgentTimeline((current) => [
        ...current,
        {
          id: `agent_error_${timelineIdBase}`,
          role: "error",
          body: `I could not submit that intent right now. ${String(error)}`,
        },
      ]);
      options?.onOutcome?.("failed");
    } finally {
      intentAbortRef.current = null;
      setSendingIntent(false);
    }
  };

  useEffect(() => {
    const seed = initialAgentMessage?.trim();
    if (!seed || !onInitialAgentMessageConsumed) {
      return;
    }
    if (onboardingSeedHandledRef.current) {
      return;
    }
    onboardingSeedHandledRef.current = true;
    setOnboardingCarryoverSeed(seed);
    setOnboardingCarryoverIdempotencyKey(
      buildOnboardingCarryoverIdempotencyKey(session.userId, seed),
    );
    setOnboardingCarryoverState("ready");
  }, [initialAgentMessage, onInitialAgentMessageConsumed, session.userId]);

  const executeOnboardingCarryover = async () => {
    const seed = onboardingCarryoverSeed.trim();
    const idempotencyKey =
      onboardingCarryoverIdempotencyKey ??
      buildOnboardingCarryoverIdempotencyKey(session.userId, seed);
    if (!seed || sendingIntent) {
      return;
    }

    const startedAt = Date.now();
    void trackTelemetryEvent(session.userId, "onboarding_activation_started", {
      source: "home_carryover",
      seedLength: seed.length,
    }).catch(() => {});

    setOnboardingCarryoverState("processing");
    await sendIntent(seed, {
      idempotencyKey,
      onOutcome: (outcome) => {
        const elapsedMs = Math.max(0, Date.now() - startedAt);
        if (outcome === "sent") {
          void trackTelemetryEvent(
            session.userId,
            "onboarding_activation_succeeded",
            {
              source: "home_carryover",
              elapsedMs,
            },
          ).catch(() => {});
          setOnboardingCarryoverSeed("");
          setOnboardingCarryoverIdempotencyKey(null);
          setOnboardingCarryoverState(null);
          onInitialAgentMessageConsumed?.();
          return;
        }
        if (outcome === "queued") {
          void trackTelemetryEvent(
            session.userId,
            "onboarding_activation_queued",
            {
              source: "home_carryover",
              elapsedMs,
            },
          ).catch(() => {});
          setOnboardingCarryoverState("queued");
          onInitialAgentMessageConsumed?.();
          return;
        }
        if (outcome === "aborted") {
          void trackTelemetryEvent(
            session.userId,
            "onboarding_activation_failed",
            {
              source: "home_carryover",
              reason: "aborted",
              elapsedMs,
            },
          ).catch(() => {});
          setOnboardingCarryoverState("ready");
          return;
        }
        void trackTelemetryEvent(
          session.userId,
          "onboarding_activation_failed",
          {
            source: "home_carryover",
            reason: "send_failed",
            elapsedMs,
          },
        ).catch(() => {});
        setOnboardingCarryoverState("ready");
      },
    });
  };

  const reportUser = async (
    targetUserId: string,
    context: { chatId: string },
  ) => {
    try {
      if (designMock) {
        setBanner({
          tone: "success",
          text: "Report recorded (preview — no server).",
        });
        recordTelemetry("report_submitted", {
          source: "chat",
          targetUserId,
          chatId: context.chatId,
        });
        return;
      }
      await api.createReport(
        {
          reporterUserId: session.userId,
          targetUserId,
          reason: "chat_message_safety_concern",
          details: `Reported from chat ${context.chatId}.`,
        },
        session.accessToken,
      );
      setBanner({
        tone: "success",
        text: "Report submitted. Our moderation pipeline will review it.",
      });
      recordTelemetry("report_submitted", {
        source: "chat",
        targetUserId,
        chatId: context.chatId,
      });
    } catch (error) {
      setBanner({
        tone: "error",
        text: `Could not submit report: ${String(error)}`,
      });
    }
  };

  const blockUser = async (
    blockedUserId: string,
    context: { chatId: string },
  ) => {
    try {
      if (designMock) {
        setBanner({
          tone: "success",
          text: "User blocked (preview — local UI only).",
        });
        recordTelemetry("user_blocked", {
          source: "chat",
          blockedUserId,
          chatId: context.chatId,
        });
        return;
      }
      await api.blockUser(
        {
          blockerUserId: session.userId,
          blockedUserId,
        },
        session.accessToken,
      );
      setBanner({
        tone: "success",
        text: "User blocked. You should no longer receive future contact from this account.",
      });
      recordTelemetry("user_blocked", {
        source: "chat",
        blockedUserId,
        chatId: context.chatId,
      });
    } catch (error) {
      setBanner({
        tone: "error",
        text: `Could not block user: ${String(error)}`,
      });
    }
  };

  const createDemoChat = async () => {
    setCreatingChat(true);
    try {
      if (enableE2ELocalMode || designMock) {
        const now = Date.now().toString(36);
        const localChatId = `chat_local_${now}`;
        const localConnectionId = `connection_local_${now}`;
        const nextThread: LocalChatThread = {
          id: localChatId,
          connectionId: localConnectionId,
          title: formatChatTitle(localChatId, newChatType),
          type: newChatType,
          messages: [],
          highWatermark: null,
          unreadCount: 0,
          participantCount: newChatType === "group" ? 3 : 2,
          connectionStatus: "active",
        };
        setChats((current) => [nextThread, ...current]);
        setSelectedChatId(nextThread.id);
        setBanner({
          tone: "success",
          text:
            newChatType === "group"
              ? designMock
                ? "Group thread added to your preview."
                : "Group chat sandbox created in local E2E mode."
              : designMock
                ? "Direct thread added to your preview."
                : "Chat sandbox created in local E2E mode.",
        });
        recordTelemetry("connection_created", {
          connectionId: localConnectionId,
          chatId: localChatId,
          type: newChatType,
        });
        recordTelemetry("chat_started", {
          chatId: localChatId,
          type: newChatType,
          participantCount: nextThread.participantCount,
        });
        return;
      }

      const connection = await api.createConnection(
        session.userId,
        newChatType,
        session.accessToken,
      );
      const connectionId = String(connection.id);
      const chat = await api.createChat(
        connectionId,
        newChatType,
        session.accessToken,
      );
      const metadata = await api
        .getChatMetadata(chat.id, session.accessToken)
        .catch(() => null);
      const nextThread: LocalChatThread = {
        id: chat.id,
        connectionId,
        title: formatChatTitle(chat.id, newChatType),
        type: newChatType,
        messages: [],
        highWatermark: null,
        unreadCount: 0,
        participantCount:
          typeof metadata?.participantCount === "number"
            ? metadata.participantCount
            : null,
        connectionStatus:
          typeof metadata?.connectionStatus === "string"
            ? metadata.connectionStatus
            : null,
      };
      setChats((current) => [nextThread, ...current]);
      setSelectedChatId(nextThread.id);
      setBanner({
        tone: "success",
        text:
          newChatType === "group"
            ? "Group chat sandbox created via live API endpoints."
            : "Chat sandbox created via live API endpoints.",
      });
      recordTelemetry("connection_created", {
        connectionId,
        chatId: chat.id,
        type: newChatType,
      });
      recordTelemetry("chat_started", {
        chatId: chat.id,
        type: newChatType,
        participantCount:
          typeof metadata?.participantCount === "number"
            ? metadata.participantCount
            : null,
      });
      await syncChatThread(nextThread.id, { quiet: true });
    } catch (error) {
      setBanner({
        tone: "error",
        text: `Failed to create chat sandbox: ${String(error)}`,
      });
    } finally {
      setCreatingChat(false);
    }
  };

  const openChat = async (chatId: string) => {
    setSelectedChatId(chatId);
    setChats((current) =>
      current.map((thread) =>
        thread.id === chatId ? { ...thread, unreadCount: 0 } : thread,
      ),
    );
    await syncChatThread(chatId);
  };

  const handleDraftChatMessageChange = (value: string) => {
    setDraftChatMessage(value);
    const chatId = selectedChatIdRef.current;
    if (!chatId || !realtimeSessionRef.current) {
      return;
    }

    const hasText = value.trim().length > 0;
    if (hasText && !localTypingActiveRef.current) {
      realtimeSessionRef.current.publishTyping(chatId, session.userId, true);
      localTypingActiveRef.current = true;
    }

    if (!hasText && localTypingActiveRef.current) {
      realtimeSessionRef.current.publishTyping(chatId, session.userId, false);
      localTypingActiveRef.current = false;
    }

    if (localTypingStopTimeoutRef.current) {
      clearTimeout(localTypingStopTimeoutRef.current);
      localTypingStopTimeoutRef.current = null;
    }

    if (hasText) {
      localTypingStopTimeoutRef.current = setTimeout(() => {
        if (!localTypingActiveRef.current) {
          return;
        }
        const activeChatId = selectedChatIdRef.current;
        if (!activeChatId) {
          return;
        }
        realtimeSessionRef.current?.publishTyping(
          activeChatId,
          session.userId,
          false,
        );
        localTypingActiveRef.current = false;
      }, 1_500);
    }
  };

  const sendChatMessage = async () => {
    const messageBody = draftChatMessage.trim();
    if (!selectedChat || messageBody.length === 0 || sendingChatMessage) {
      return;
    }
    const hadMessages = selectedChat.messages.length > 0;
    const hasCounterpartyMessage = selectedChat.messages.some(
      (message) => message.senderUserId !== session.userId,
    );

    setSendingChatMessage(true);
    try {
      if (enableE2ELocalMode || designMock) {
        const localMessage: ChatMessageRecord = {
          id: `message_local_${Date.now().toString(36)}`,
          chatId: selectedChat.id,
          senderUserId: session.userId,
          body: messageBody,
          createdAt: new Date().toISOString(),
        };
        setDraftChatMessage("");
        setChats((current) =>
          current.map((thread) =>
            thread.id === selectedChat.id
              ? {
                  ...thread,
                  messages: mergeChatMessages(thread.messages, [localMessage]),
                  highWatermark: localMessage.createdAt,
                  unreadCount: 0,
                }
              : thread,
          ),
        );
        if (!hadMessages) {
          recordTelemetry("first_message_sent", {
            chatId: selectedChat.id,
            bodyLength: messageBody.length,
          });
        } else if (hasCounterpartyMessage) {
          recordTelemetry("message_replied", {
            chatId: selectedChat.id,
            bodyLength: messageBody.length,
          });
        }
        hapticImpact();
        return;
      }

      const message = await api.createChatMessage(
        selectedChat.id,
        session.userId,
        messageBody,
        session.accessToken,
        {
          clientMessageId: createClientMessageId(),
        },
      );
      setDraftChatMessage("");
      if (localTypingStopTimeoutRef.current) {
        clearTimeout(localTypingStopTimeoutRef.current);
        localTypingStopTimeoutRef.current = null;
      }
      if (localTypingActiveRef.current) {
        realtimeSessionRef.current?.publishTyping(
          selectedChat.id,
          session.userId,
          false,
        );
        localTypingActiveRef.current = false;
      }
      setChats((current) =>
        current.map((thread) =>
          thread.id === selectedChat.id
            ? {
                ...thread,
                messages: mergeChatMessages(thread.messages, [message]),
                highWatermark: message.createdAt,
                unreadCount: 0,
              }
            : thread,
        ),
      );
      realtimeSessionRef.current?.publishChatMessage(selectedChat.id, message);
      if (!hadMessages) {
        recordTelemetry("first_message_sent", {
          chatId: selectedChat.id,
          bodyLength: messageBody.length,
        });
      } else if (hasCounterpartyMessage) {
        recordTelemetry("message_replied", {
          chatId: selectedChat.id,
          bodyLength: messageBody.length,
        });
      }
      hapticImpact();
    } catch (error) {
      setBanner({
        tone: "error",
        text: `Failed to send message: ${String(error)}`,
      });
    } finally {
      setSendingChatMessage(false);
    }
  };

  const signOut = async () => {
    if (!designMock) {
      await clearStoredChats(session.userId).catch(() => {});
      await clearTelemetryEvents(session.userId).catch(() => {});
      await clearOfflineOutbox(session.userId).catch(() => {});
    }
    setTelemetrySummary(null);
    await onResetSession();
  };

  const saveSettings = async () => {
    const socialModePayloadValue =
      profileDraft.socialMode === "one_to_one"
        ? {
            socialMode: "balanced" as const,
            preferOneToOne: true,
            allowGroupInvites: false,
          }
        : profileDraft.socialMode === "group"
          ? {
              socialMode: "high_energy" as const,
              preferOneToOne: false,
              allowGroupInvites: true,
            }
          : {
              socialMode: "balanced" as const,
              preferOneToOne: false,
              allowGroupInvites: true,
            };
    const globalRulesPayloadValue = {
      whoCanContact: "anyone" as const,
      reachable: "always" as const,
      intentMode:
        profileDraft.socialMode === "one_to_one"
          ? ("one_to_one" as const)
          : profileDraft.socialMode === "group"
            ? ("group" as const)
            : ("balanced" as const),
      modality: "either" as const,
      languagePreferences: ["en", "es"],
      countryPreferences: [],
      requireVerifiedUsers: false,
      notificationMode:
        profileDraft.notificationMode === "digest"
          ? ("digest" as const)
          : ("immediate" as const),
      agentAutonomy: "suggest_only" as const,
      memoryMode: "standard" as const,
    };
    try {
      if (designMock) {
        onProfileUpdated(profileDraft);
        setBanner({
          tone: "success",
          text: "Saved for this preview session.",
        });
        recordTelemetry("personalization_changed", {
          socialMode: profileDraft.socialMode,
          notificationMode: profileDraft.notificationMode,
        });
        return;
      }
      if (!netOnline) {
        await queueOfflineProfileSave({
          userId: session.userId,
          displayName: profileDraft.displayName,
          bio: profileDraft.bio,
          city: profileDraft.city,
          country: profileDraft.country,
          visibility: "public",
          interests: profileDraft.interests,
          socialMode: socialModePayloadValue,
          globalRules: globalRulesPayloadValue,
        });
        await refreshPendingOutboxCount().catch(() => {});
        onProfileUpdated(profileDraft);
        setBanner({
          tone: "info",
          text: "Settings saved locally and queued for sync.",
        });
        return;
      }
      await Promise.all([
        api.setSocialMode(
          session.userId,
          socialModePayloadValue,
          session.accessToken,
        ),
        api.setGlobalRules(
          session.userId,
          globalRulesPayloadValue,
          session.accessToken,
        ),
      ]);

      onProfileUpdated(profileDraft);
      setBanner({
        tone: "success",
        text: "Profile and rule settings saved.",
      });
      recordTelemetry("personalization_changed", {
        socialMode: profileDraft.socialMode,
        notificationMode: profileDraft.notificationMode,
      });
    } catch (error) {
      if (isOfflineApiError(error) || isRetryableApiError(error)) {
        await queueOfflineProfileSave({
          userId: session.userId,
          displayName: profileDraft.displayName,
          bio: profileDraft.bio,
          city: profileDraft.city,
          country: profileDraft.country,
          visibility: "public",
          interests: profileDraft.interests,
          socialMode: socialModePayloadValue,
          globalRules: globalRulesPayloadValue,
        });
        await refreshPendingOutboxCount().catch(() => {});
        onProfileUpdated(profileDraft);
        setBanner({
          tone: "info",
          text: "Network issue detected. Settings are queued and will sync automatically.",
        });
        return;
      }
      setBanner({
        tone: "error",
        text: `Could not save settings: ${String(error)}`,
      });
    }
  };

  const sendDigestNow = async () => {
    try {
      if (designMock) {
        setBanner({
          tone: "success",
          text: "Digest queued (preview — no push).",
        });
        recordTelemetry("digest_requested");
        return;
      }
      await api.sendDigest(session.userId, session.accessToken);
      if (enablePushNotifications) {
        const notifications = await import("../lib/notifications");
        await notifications.fireLocalNotification(
          "Digest queued",
          "A digest notification was created for your account.",
        );
      }
      recordTelemetry("digest_requested");
      if (enablePushNotifications) {
        recordTelemetry("notification_local_fired", {
          type: "digest_requested",
        });
      }
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

  const createCircleQuick = async () => {
    if (skipNetwork) {
      return;
    }
    try {
      const created = await api.createRecurringCircle(
        session.userId,
        {
          title: "Weekly open circle",
          visibility: "invite_only",
          topicTags: profileDraft.interests.slice(0, 3),
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
      setBanner({ tone: "success", text: "Recurring circle created." });
    } catch (error) {
      setBanner({
        tone: "error",
        text: `Could not create recurring circle: ${String(error)}`,
      });
    }
  };

  const runCircleSessionNow = async () => {
    if (skipNetwork || !selectedCircleId) {
      return;
    }
    try {
      const opened = await api.runRecurringCircleSessionNow(
        selectedCircleId,
        session.accessToken,
      );
      setRecurringSessions((current) => [opened, ...current]);
      setBanner({
        tone: "success",
        text: "Circle session opened and matching started.",
      });
    } catch (error) {
      setBanner({
        tone: "error",
        text: `Could not open circle session: ${String(error)}`,
      });
    }
  };

  const refreshDiscoverySnapshots = async () => {
    if (skipNetwork) {
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
      setSelectedExplainedIntentId((current) => {
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
        text: "Discovery snapshots refreshed.",
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
    if (skipNetwork) {
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
          ? "Recommendations posted to your agent thread."
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
    if (skipNetwork || searchQuery.trim().length === 0) {
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
    if (skipNetwork) {
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
    if (skipNetwork) {
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

  const createSavedSearchQuick = async () => {
    if (skipNetwork) {
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
    if (skipNetwork) {
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
    if (skipNetwork || !selectedScheduledTask) {
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

  return (
    <SafeAreaView className="flex-1 bg-canvas" testID="home-screen">
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="flex-1"
      >
        <AppTopBar
          compact={activeTab === "home"}
          leading={
            <Pressable
              accessibilityLabel="Open menu"
              accessibilityRole="button"
              className="-ml-0.5 rounded-xl p-1.5"
              hitSlop={10}
              onPress={() => setDrawerOpen(true)}
              style={({ pressed }) => ({
                opacity: pressed ? appTheme.motion.pressOpacity : 1,
              })}
              testID="home-drawer-open-button"
            >
              <Ionicons
                color={appTheme.colors.ink}
                name="menu-outline"
                size={26}
              />
            </Pressable>
          }
          subtitle={
            activeTab === "home"
              ? undefined
              : t(tabDescriptions[activeTab], locale)
          }
          title={
            activeTab === "home"
              ? "OpenSocial"
              : t(tabLabels[activeTab], locale)
          }
        />

        {banner ? (
          <View className="px-5 pt-3">
            <InlineNotice text={banner.text} tone={banner.tone} />
          </View>
        ) : null}
        {!skipNetwork && !netOnline ? (
          <View className="px-5 pt-3">
            <InlineNotice text={t("offlineNotice", locale)} tone="info" />
          </View>
        ) : null}
        {!skipNetwork && pendingOutboxCount > 0 ? (
          <View className="px-5 pt-3">
            <InlineNotice
              text={t("homeQueuedActions", locale, {
                count: pendingOutboxCount,
                plural: pendingOutboxCount === 1 ? "" : "s",
              })}
              tone="info"
            />
          </View>
        ) : null}

        <AnimatedScreen screenKey={activeTab}>
          {activeTab === "home" ? (
            <OpenChatScreen
              agentImageUrl={agentImageUrlDraft}
              canRegenerate={agentTimeline.some(
                (message) => message.role === "user",
              )}
              composerMode={agentComposerMode}
              decomposeIntent={decomposeIntent}
              decomposeMaxIntents={decomposeMaxIntents}
              draftMessage={draftIntentText}
              e2eSubmitOnReturn={enableE2ELocalMode}
              locale={locale}
              messages={agentTimeline}
              onboardingCarryover={
                onboardingCarryoverSeed && onboardingCarryoverState
                  ? {
                      seed: onboardingCarryoverSeed,
                      state: onboardingCarryoverState,
                    }
                  : null
              }
              onAgentImageUrlChange={setAgentImageUrlDraft}
              onComposerModeChange={setAgentComposerMode}
              onExecuteOnboardingCarryover={executeOnboardingCarryover}
              onDecomposeIntentChange={setDecomposeIntent}
              onDecomposeMaxIntentsChange={setDecomposeMaxIntents}
              onOpenChatsTab={() => setActiveTab("chats")}
              onRegenerate={regenerateLastIntent}
              onSend={sendIntent}
              onStop={cancelIntentSend}
              onVoiceTranscript={(line) => {
                agentVoiceTranscriptRef.current = line.trim() || null;
              }}
              pendingIntentSummary={pendingIntentSummary}
              sending={sendingIntent}
              setDraftMessage={setDraftIntentText}
              threadLoading={agentThreadLoading}
            />
          ) : null}
          {activeTab === "chats" ? (
            <ChatsTab
              chatCreationType={newChatType}
              creatingChat={creatingChat}
              currentUserId={session.userId}
              e2eSubmitOnReturn={enableE2ELocalMode}
              draftChatMessage={draftChatMessage}
              loadingMessages={
                selectedChatId != null && Boolean(syncingChats[selectedChatId])
              }
              locale={locale}
              onChatTypeChange={setNewChatType}
              onCreateChat={createDemoChat}
              onModerationBlock={async (targetUserId, chatId) => {
                await blockUser(targetUserId, { chatId });
              }}
              onModerationReport={async (targetUserId, chatId) => {
                await reportUser(targetUserId, { chatId });
              }}
              onOpenChat={openChat}
              onSendMessage={sendChatMessage}
              onSyncNow={syncChatsNow}
              selectedChat={selectedChat}
              sendingMessage={sendingChatMessage}
              setDraftChatMessage={handleDraftChatMessageChange}
              syncingNow={syncingAllChats}
              realtimeState={realtimeState}
              threads={chats}
              typingUsers={typingUsers}
            />
          ) : null}
          {activeTab === "profile" ? (
            <ProfileTab
              loading={profileLoading}
              profile={profileDraft}
              pushEnabled={pushEnabled}
              pushToken={pushToken}
              telemetrySummary={telemetrySummary}
              trustSummary={trustSummary}
              onNotificationModeChange={(value) =>
                setProfileDraft((current) => ({
                  ...current,
                  notificationMode: value,
                }))
              }
              onSendDigestNow={sendDigestNow}
              onSignOut={signOut}
              onSocialModeChange={(value) =>
                setProfileDraft((current) => ({
                  ...current,
                  socialMode: value,
                }))
              }
              onSaveSettings={saveSettings}
              circles={recurringCircles}
              circlesBusy={recurringBusy}
              selectedCircleId={selectedCircleId}
              selectedCircleTitle={selectedCircle?.title ?? null}
              circleSessions={recurringSessions}
              onCreateCircle={createCircleQuick}
              onSelectCircle={setSelectedCircleId}
              onRunCircleSessionNow={runCircleSessionNow}
              passiveDiscovery={passiveDiscovery}
              inboxSuggestions={inboxSuggestions}
              pendingIntentSummary={pendingIntentSummary}
              selectedExplainedIntentId={selectedExplainedIntentId}
              userIntentExplanation={userIntentExplanation}
              discoveryBusy={discoveryBusy}
              onRefreshDiscovery={refreshDiscoverySnapshots}
              onPublishDiscoveryToAgent={publishDiscoveryToAgent}
              onSelectExplainedIntent={setSelectedExplainedIntentId}
              searchQuery={searchQuery}
              searchSnapshot={searchSnapshot}
              searchBusy={searchBusy}
              onSearchQueryChange={setSearchQuery}
              onRunSearch={runSearch}
              memorySnapshot={memorySnapshot}
              memoryBusy={memoryBusy}
              locale={locale}
              onRefreshMemory={refreshMemorySnapshot}
              onResetLearnedMemory={resetLearnedMemory}
              onLocaleChange={setLocale}
              savedSearches={savedSearches}
              scheduledTasks={scheduledTasks}
              selectedScheduledTaskId={selectedScheduledTaskId}
              scheduledTaskRuns={scheduledTaskRuns}
              automationsBusy={automationsBusy}
              onSelectScheduledTask={setSelectedScheduledTaskId}
              onCreateSavedSearch={createSavedSearchQuick}
              onCreateAutomation={createAutomationQuick}
              onRunAutomationNow={runAutomationNow}
            />
          ) : null}
        </AnimatedScreen>

        <HomeTabBar
          activeTab={activeTab}
          locale={locale}
          onChange={(tab) => {
            hapticSelection();
            setActiveTab(tab);
          }}
        />
      </KeyboardAvoidingView>

      <AppDrawer
        displayName={session.displayName}
        locale={locale}
        onClose={() => setDrawerOpen(false)}
        onNavigate={setActiveTab}
        onNewAgentConversation={() => {
          resetAgentConversation();
          setActiveTab("home");
        }}
        visible={drawerOpen}
      />
    </SafeAreaView>
  );
}

interface ChatsTabProps {
  locale: AppLocale;
  e2eSubmitOnReturn?: boolean;
  currentUserId: string;
  chatCreationType: "dm" | "group";
  threads: LocalChatThread[];
  selectedChat: LocalChatThread | null;
  typingUsers: string[];
  realtimeState: RealtimeConnectionState;
  draftChatMessage: string;
  setDraftChatMessage: (value: string) => void;
  onChatTypeChange: (value: "dm" | "group") => void;
  onCreateChat: () => Promise<void>;
  onOpenChat: (chatId: string) => Promise<void>;
  onSendMessage: () => Promise<void>;
  onSyncNow: () => Promise<void>;
  onModerationReport: (targetUserId: string, chatId: string) => Promise<void>;
  onModerationBlock: (targetUserId: string, chatId: string) => Promise<void>;
  creatingChat: boolean;
  sendingMessage: boolean;
  syncingNow: boolean;
  loadingMessages: boolean;
}

function ChatsTab({
  chatCreationType,
  creatingChat,
  currentUserId,
  draftChatMessage,
  e2eSubmitOnReturn = false,
  loadingMessages,
  locale,
  onChatTypeChange,
  onCreateChat,
  onModerationBlock,
  onModerationReport,
  onOpenChat,
  onSendMessage,
  onSyncNow,
  realtimeState,
  selectedChat,
  sendingMessage,
  setDraftChatMessage,
  syncingNow,
  threads,
  typingUsers,
}: ChatsTabProps) {
  const moderationTargetUserId =
    selectedChat?.messages.find(
      (message) => message.senderUserId !== currentUserId,
    )?.senderUserId ?? null;
  const chatMessageLength = draftChatMessage.trim().length;
  const canSendMessage = chatMessageLength > 0 && !sendingMessage;

  return (
    <View className="min-h-0 flex-1 px-5 py-4">
      <View className="mb-3 flex-row items-center gap-2 px-1">
        <View className="rounded-full border border-white/[0.08] bg-white/[0.03] px-2.5 py-1">
          <Text
            className={`text-[10px] font-semibold uppercase tracking-[0.14em] ${
              realtimeState === "connected"
                ? "text-white/62"
                : realtimeState === "connecting"
                  ? "text-white/46"
                  : "text-white/34"
            }`}
          >
            {realtimeState === "connected"
              ? t("chatsRealtimeLive", locale)
              : realtimeState === "connecting"
                ? t("chatsRealtimeConnecting", locale)
                : t("chatsRealtimeOffline", locale)}
          </Text>
        </View>
        <Text
          className="text-[12px] leading-[18px] text-white/34"
          numberOfLines={2}
        >
          {selectedChat
            ? formatThreadSummary(selectedChat)
            : t("chatsEmptyDescription", locale)}
        </Text>
      </View>
      <View className="mb-4 gap-3">
        <View className="flex-row gap-2">
          <ChoiceChip
            label={t("chatsDm", locale)}
            onPress={() => onChatTypeChange("dm")}
            selected={chatCreationType === "dm"}
            testID="chat-type-dm-chip"
          />
          <ChoiceChip
            label={t("chatsGroup", locale)}
            onPress={() => onChatTypeChange("group")}
            selected={chatCreationType === "group"}
            testID="chat-type-group-chip"
          />
        </View>
        <View className="flex-row gap-2">
          <View className="flex-1">
            <PrimaryButton
              label={
                chatCreationType === "group"
                  ? t("chatsCreateGroupSandbox", locale)
                  : t("chatsCreateChatSandbox", locale)
              }
              loading={creatingChat}
              onPress={onCreateChat}
              testID="chat-create-button"
              variant="secondary"
            />
          </View>
          <View className="flex-1">
            <PrimaryButton
              label={
                syncingNow
                  ? t("chatsSyncingNow", locale)
                  : t("chatsSyncNow", locale)
              }
              loading={syncingNow}
              onPress={onSyncNow}
              testID="chat-sync-button"
              variant="ghost"
            />
          </View>
        </View>
      </View>

      {threads.length === 0 ? (
        <EmptyState
          title={t("chatsEmptyTitle", locale)}
          description={t("chatsEmptyDescription", locale)}
        />
      ) : (
        <ScrollView className="mb-4 max-h-44">
          {threads.map((thread, index) => (
            <Pressable
              className={`mb-2 rounded-[22px] border px-4 py-3.5 ${
                selectedChat?.id === thread.id
                  ? "border-white/[0.14] bg-white/[0.08]"
                  : "border-white/[0.06] bg-white/[0.03]"
              }`}
              key={thread.id}
              onPress={() => onOpenChat(thread.id)}
              testID={
                index === 0 ? "chat-thread-latest" : `chat-thread-${thread.id}`
              }
            >
              <Text className="text-[14px] font-semibold text-white/88">
                {thread.title}
              </Text>
              <View className="mt-1 flex-row items-center justify-between">
                <Text className="text-[11px] text-white/34">
                  {thread.messages.length} message
                  {thread.messages.length === 1 ? "" : "s"} ·{" "}
                  {formatThreadSummary(thread)}
                </Text>
                {thread.unreadCount > 0 ? (
                  <View className="rounded-full border border-white/[0.08] bg-white px-2 py-1">
                    <Text className="text-[10px] font-semibold text-[#0d0d0d]">
                      {t("chatsUnread", locale, { count: thread.unreadCount })}
                    </Text>
                  </View>
                ) : null}
              </View>
            </Pressable>
          ))}
        </ScrollView>
      )}

      {selectedChat ? (
        <SurfaceCard className="min-h-0 flex-1 p-4">
          <Text className="mb-1 flex-shrink-0 text-[17px] font-semibold text-ink">
            {selectedChat.title}
          </Text>
          <Text className="mb-3 text-[11px] text-muted">
            {formatThreadSummary(selectedChat)}
          </Text>
          {moderationTargetUserId ? (
            <View className="mb-3 flex-row gap-2">
              <View className="flex-1">
                <PrimaryButton
                  label={t("chatsReportUser", locale)}
                  onPress={() =>
                    onModerationReport(moderationTargetUserId, selectedChat.id)
                  }
                  variant="ghost"
                />
              </View>
              <View className="flex-1">
                <PrimaryButton
                  label={t("chatsBlockUser", locale)}
                  onPress={() =>
                    onModerationBlock(moderationTargetUserId, selectedChat.id)
                  }
                  variant="ghost"
                />
              </View>
            </View>
          ) : null}
          {selectedChat.messages.length === 0 && !loadingMessages ? (
            <Text className="mb-3 text-[13px] text-muted">
              {t("chatsNoMessages", locale)}
            </Text>
          ) : null}
          {selectedChat.messages.length > 0 ? (
            <View className="min-h-0 flex-1">
              <ChatTranscriptList
                messages={selectedChat.messages}
                renderBubble={(message) => (
                  <ChatBubble
                    body={message.body}
                    role={
                      message.senderUserId === currentUserId ? "user" : "agent"
                    }
                    testID={
                      message.senderUserId === currentUserId
                        ? "chat-user-message"
                        : "chat-peer-message"
                    }
                  />
                )}
              />
            </View>
          ) : null}
          {loadingMessages ? (
            <Text className="mb-2 text-[11px] text-accent">
              {t("chatsSyncingLatest", locale)}
            </Text>
          ) : null}
          {typingUsers.length > 0 ? (
            <Text className="mb-2 text-[11px] text-muted">
              {typingUsers.length === 1
                ? t("chatsSomeoneTyping", locale)
                : t("chatsPeopleTyping", locale, { count: typingUsers.length })}
            </Text>
          ) : null}
          <View className="flex-shrink-0">
            <MessageComposer
              canSend={canSendMessage}
              e2eSubmitOnReturn={e2eSubmitOnReturn}
              inputTestID="chat-message-input"
              maxLength={1000}
              multiline
              onChangeText={setDraftChatMessage}
              onSend={onSendMessage}
              placeholder={t("chatsMessagePlaceholder", locale)}
              sendAccessibilityLabel={t("chatsSendMessage", locale)}
              sendTestID="chat-send-button"
              sending={sendingMessage}
              value={draftChatMessage}
            />
            <Text className="mt-1.5 text-[11px] text-muted">
              {chatMessageLength}/1000
            </Text>
          </View>
        </SurfaceCard>
      ) : null}
    </View>
  );
}

interface ProfileTabProps {
  profile: UserProfileDraft;
  trustSummary: string;
  telemetrySummary: TelemetrySummary | null;
  pushEnabled: boolean;
  pushToken: string | null;
  circles: RecurringCircleRecord[];
  circlesBusy: boolean;
  selectedCircleId: string | null;
  selectedCircleTitle: string | null;
  circleSessions: RecurringCircleSessionRecord[];
  passiveDiscovery: PassiveDiscoveryResponse | null;
  inboxSuggestions: DiscoveryInboxSuggestionsResponse | null;
  pendingIntentSummary: PendingIntentsSummaryResponse | null;
  selectedExplainedIntentId: string | null;
  userIntentExplanation: UserIntentExplanation | null;
  discoveryBusy: boolean;
  searchQuery: string;
  searchSnapshot: SearchSnapshotResponse | null;
  searchBusy: boolean;
  memorySnapshot: {
    lifeGraph: Record<string, unknown> | null;
    retrieval: Record<string, unknown> | null;
  };
  memoryBusy: boolean;
  locale: AppLocale;
  savedSearches: SavedSearchRecord[];
  scheduledTasks: ScheduledTaskRecord[];
  selectedScheduledTaskId: string | null;
  scheduledTaskRuns: ScheduledTaskRunRecord[];
  automationsBusy: boolean;
  onSocialModeChange: (value: UserProfileDraft["socialMode"]) => void;
  onNotificationModeChange: (
    value: UserProfileDraft["notificationMode"],
  ) => void;
  onCreateCircle: () => Promise<void>;
  onSelectCircle: (circleId: string) => void;
  onRunCircleSessionNow: () => Promise<void>;
  onRefreshDiscovery: () => Promise<void>;
  onPublishDiscoveryToAgent: () => Promise<void>;
  onSelectExplainedIntent: (intentId: string) => void;
  onSearchQueryChange: (value: string) => void;
  onRunSearch: () => Promise<void>;
  onRefreshMemory: () => Promise<void>;
  onResetLearnedMemory: () => Promise<void>;
  onLocaleChange: (value: AppLocale) => void;
  onSelectScheduledTask: (taskId: string) => void;
  onCreateSavedSearch: () => Promise<void>;
  onCreateAutomation: () => Promise<void>;
  onRunAutomationNow: () => Promise<void>;
  onSaveSettings: () => Promise<void>;
  onSendDigestNow: () => Promise<void>;
  onSignOut: () => Promise<void>;
  loading: boolean;
}

function ProfileTab({
  loading,
  onNotificationModeChange,
  onSaveSettings,
  onSendDigestNow,
  onSignOut,
  onSocialModeChange,
  profile,
  pushEnabled,
  pushToken,
  circles,
  circlesBusy,
  selectedCircleId,
  selectedCircleTitle,
  circleSessions,
  passiveDiscovery,
  inboxSuggestions,
  pendingIntentSummary,
  selectedExplainedIntentId,
  userIntentExplanation,
  discoveryBusy,
  searchQuery,
  searchSnapshot,
  searchBusy,
  memorySnapshot,
  memoryBusy,
  locale,
  savedSearches,
  scheduledTasks,
  selectedScheduledTaskId,
  scheduledTaskRuns,
  automationsBusy,
  telemetrySummary,
  trustSummary,
  onCreateCircle,
  onSelectCircle,
  onRunCircleSessionNow,
  onRefreshDiscovery,
  onPublishDiscoveryToAgent,
  onSelectExplainedIntent,
  onSearchQueryChange,
  onRunSearch,
  onRefreshMemory,
  onResetLearnedMemory,
  onLocaleChange,
  onSelectScheduledTask,
  onCreateSavedSearch,
  onCreateAutomation,
  onRunAutomationNow,
}: ProfileTabProps) {
  return (
    <ScrollView
      contentContainerStyle={{
        paddingHorizontal: 20,
        paddingVertical: 16,
        gap: 14,
      }}
    >
      <SurfaceCard>
        <Text className="mb-1 text-[18px] font-semibold tracking-tight text-ink">
          {t("profileInterests", locale)}
        </Text>
        <Text className="mb-3 text-[12px] leading-[18px] text-muted">
          Interests shape who the system prioritizes around you.
        </Text>
        <View className="flex-row flex-wrap gap-2">
          {profile.interests.map((interest) => (
            <View className="rounded-full bg-surface px-3 py-2" key={interest}>
              <Text className="text-xs text-ink">{interest}</Text>
            </View>
          ))}
        </View>
      </SurfaceCard>

      <SurfaceCard>
        <Text className="mb-1 text-[18px] font-semibold tracking-tight text-ink">
          {t("localeLabel", locale)}
        </Text>
        <Text className="mb-3 text-[12px] leading-[18px] text-muted">
          Choose how the app speaks to you.
        </Text>
        <View className="flex-row flex-wrap gap-2">
          <ChoiceChip
            label={t("localeEnglish", locale)}
            onPress={() => onLocaleChange("en")}
            selected={locale === "en"}
          />
          <ChoiceChip
            label={t("localeSpanish", locale)}
            onPress={() => onLocaleChange("es")}
            selected={locale === "es"}
          />
        </View>
      </SurfaceCard>

      <SurfaceCard>
        <Text className="mb-1 text-[18px] font-semibold tracking-tight text-ink">
          {t("profileDefaultSocialMode", locale)}
        </Text>
        <Text className="mb-3 text-[12px] leading-[18px] text-muted">
          This sets the default tone for new agent matching.
        </Text>
        <View className="flex-row flex-wrap gap-2">
          <ChoiceChip
            label="1:1"
            onPress={() => onSocialModeChange("one_to_one")}
            selected={profile.socialMode === "one_to_one"}
          />
          <ChoiceChip
            label={t("profileModeGroup", locale)}
            onPress={() => onSocialModeChange("group")}
            selected={profile.socialMode === "group"}
          />
          <ChoiceChip
            label={t("profileModeFlexible", locale)}
            onPress={() => onSocialModeChange("either")}
            selected={profile.socialMode === "either"}
          />
        </View>
      </SurfaceCard>

      <SurfaceCard>
        <Text className="mb-1 text-[18px] font-semibold tracking-tight text-ink">
          {t("profileNotifications", locale)}
        </Text>
        <Text className="mb-3 text-[12px] leading-[18px] text-muted">
          Control how quickly OpenSocial reaches back out.
        </Text>
        <View className="mb-3 flex-row flex-wrap gap-2">
          <ChoiceChip
            label={t("profileLiveAlerts", locale)}
            onPress={() => onNotificationModeChange("live")}
            selected={profile.notificationMode === "live"}
          />
          <ChoiceChip
            label={t("profileDigestMode", locale)}
            onPress={() => onNotificationModeChange("digest")}
            selected={profile.notificationMode === "digest"}
          />
        </View>
        <Text className="text-xs text-muted">
          {t("profilePushStatus", locale, {
            status: pushEnabled
              ? t("profileEnabled", locale)
              : t("profileDisabled", locale),
          })}
        </Text>
        <Text className="mt-1 text-xs text-muted">
          {t("profileTokenStatus", locale, {
            status: pushToken
              ? `${pushToken.slice(0, 18)}...`
              : t("profileNotRegistered", locale),
          })}
        </Text>
      </SurfaceCard>

      <SurfaceCard>
        <Text className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">
          {t("profileTrustSummary", locale)}
        </Text>
        <Text className="mt-2 text-[14px] leading-[21px] text-ink">
          {trustSummary}
        </Text>
      </SurfaceCard>

      <SurfaceCard className="gap-5">
        <View>
          <View className="mb-2 flex-row items-center justify-between">
            <Text className="text-[18px] font-semibold tracking-tight text-ink">
              {t("profileDiscoverySnapshot", locale)}
            </Text>
            <PrimaryButton
              label={
                discoveryBusy
                  ? t("profileRefreshing", locale)
                  : t("commonRefresh", locale)
              }
              onPress={onRefreshDiscovery}
              variant="ghost"
            />
          </View>
          <Text className="text-xs text-muted">
            {t("profileTonightReconnects", locale, {
              tonight: passiveDiscovery?.tonight.suggestions.length ?? 0,
              reconnects: passiveDiscovery?.reconnects.reconnects.length ?? 0,
            })}
          </Text>
          <View className="mt-2 rounded-xl border border-border bg-surface p-2">
            {passiveDiscovery?.tonight.suggestions.length ? (
              passiveDiscovery.tonight.suggestions
                .slice(0, 3)
                .map((suggestion) => (
                  <Text
                    className="mb-1 text-xs text-ink"
                    key={suggestion.userId}
                  >
                    {suggestion.displayName} ·{" "}
                    {Math.round(suggestion.score * 100)}%
                  </Text>
                ))
            ) : (
              <Text className="text-xs text-muted">
                {t("profileNoTonightSuggestions", locale)}
              </Text>
            )}
          </View>
          <View className="mt-2">
            <PrimaryButton
              label={t("profilePublishToAgent", locale)}
              onPress={onPublishDiscoveryToAgent}
              variant="secondary"
            />
          </View>
        </View>

        <View className="h-px bg-border" />

        <View>
          <Text className="mb-2 text-[18px] font-semibold tracking-tight text-ink">
            {t("profileContinuityReconnect", locale)}
          </Text>
          <Text className="text-xs text-muted">
            {t("profilePendingRequestSuggestions", locale, {
              count: inboxSuggestions?.pendingRequestCount ?? 0,
            })}
          </Text>
          <View className="mt-2 rounded-xl border border-border bg-surface p-2">
            {inboxSuggestions?.suggestions.length ? (
              inboxSuggestions.suggestions.slice(0, 4).map((suggestion) => (
                <Text
                  className="mb-1 text-xs text-ink"
                  key={`${suggestion.title}-${suggestion.reason}`}
                >
                  {suggestion.title}
                </Text>
              ))
            ) : (
              <Text className="text-xs text-muted">
                {t("profileNoReconnectSuggestions", locale)}
              </Text>
            )}
          </View>
        </View>

        <View className="h-px bg-border" />

        <View>
          <Text className="mb-2 text-[18px] font-semibold tracking-tight text-ink">
            {t("profileWhyThisRoutingResult", locale)}
          </Text>
          {pendingIntentSummary?.intents.length ? (
            <>
              <View className="mb-2 flex-row flex-wrap gap-2">
                {pendingIntentSummary.intents.slice(0, 5).map((intent) => (
                  <ChoiceChip
                    key={intent.intentId}
                    label={intent.rawText.slice(0, 18)}
                    onPress={() => onSelectExplainedIntent(intent.intentId)}
                    selected={selectedExplainedIntentId === intent.intentId}
                  />
                ))}
              </View>
              <Text className="text-xs text-muted">
                {userIntentExplanation?.summary ??
                  t("profileLoadingExplanation", locale)}
              </Text>
              {userIntentExplanation?.factors.length ? (
                <View className="mt-2 rounded-xl border border-border bg-surface p-2">
                  {userIntentExplanation.factors.map((factor) => (
                    <Text className="mb-1 text-xs text-ink" key={factor}>
                      {factor}
                    </Text>
                  ))}
                </View>
              ) : null}
            </>
          ) : (
            <Text className="text-xs text-muted">
              {t("profileNoIntentsToExplain", locale)}
            </Text>
          )}
        </View>
      </SurfaceCard>

      <SurfaceCard className="gap-5">
        <View>
          <Text className="mb-2 text-[18px] font-semibold tracking-tight text-ink">
            {t("commonSearch", locale)}
          </Text>
          <CalmTextField
            autoCapitalize="none"
            autoCorrect={false}
            containerClassName="mb-2"
            inputClassName="text-[14px]"
            onChangeText={onSearchQueryChange}
            placeholder={t("profileSearchPlaceholder", locale)}
            value={searchQuery}
          />
          <PrimaryButton
            label={
              searchBusy
                ? t("profileSearching", locale)
                : t("commonSearch", locale)
            }
            onPress={onRunSearch}
            variant="secondary"
          />
          {searchSnapshot ? (
            <Text className="mt-2 text-xs text-muted">
              {t("profileSearchCounts", locale, {
                users: searchSnapshot.users.length,
                topics: searchSnapshot.topics.length,
                activities: searchSnapshot.activities.length,
                groups: searchSnapshot.groups.length,
              })}
            </Text>
          ) : null}
        </View>

        <View className="h-px bg-border" />

        <View>
          <Text className="mb-2 text-[18px] font-semibold tracking-tight text-ink">
            {t("profileMemoryControls", locale)}
          </Text>
          <PrimaryButton
            label={
              memoryBusy
                ? t("profileRefreshing", locale)
                : t("profileRefreshMemorySnapshot", locale)
            }
            onPress={onRefreshMemory}
            variant="secondary"
          />
          <View className="mt-2">
            <PrimaryButton
              label={t("profileResetLearnedMemory", locale)}
              onPress={onResetLearnedMemory}
              variant="ghost"
            />
          </View>
          <Text className="mt-2 text-xs text-muted">
            {t("profileMemoryLoaded", locale, {
              lifeGraph: memorySnapshot.lifeGraph
                ? t("profileYes", locale)
                : t("profileNo", locale),
              retrieval: memorySnapshot.retrieval
                ? t("profileYes", locale)
                : t("profileNo", locale),
            })}
          </Text>
        </View>
      </SurfaceCard>

      <SurfaceCard className="gap-5">
        <View>
          <Text className="mb-2 text-[18px] font-semibold tracking-tight text-ink">
            {t("profileAutomations", locale)}
          </Text>
          <Text className="text-xs text-muted">
            {t("profileAutomationsBody", locale)}
          </Text>
          <View className="mt-2 flex-row flex-wrap gap-2">
            <PrimaryButton
              label={t("profileNewSavedSearch", locale)}
              onPress={onCreateSavedSearch}
              variant="ghost"
              disabled={automationsBusy}
            />
            <PrimaryButton
              label={t("profileNewAutomation", locale)}
              onPress={onCreateAutomation}
              variant="ghost"
              disabled={automationsBusy}
            />
            <PrimaryButton
              label={t("profileRunNow", locale)}
              onPress={onRunAutomationNow}
              variant="secondary"
              disabled={!selectedScheduledTaskId}
            />
          </View>
          <Text className="mt-2 text-xs text-muted">
            {t("profileSavedSearchesTasks", locale, {
              searches: savedSearches.length,
              tasks: scheduledTasks.length,
            })}
          </Text>
          {scheduledTasks.length ? (
            <View className="mt-2 gap-2">
              {scheduledTasks.slice(0, 4).map((task) => (
                <Pressable
                  className={`rounded-xl border px-3 py-2 ${
                    selectedScheduledTaskId === task.id
                      ? "border-primary bg-primary/10"
                      : "border-border bg-surface"
                  }`}
                  key={task.id}
                  onPress={() => onSelectScheduledTask(task.id)}
                >
                  <Text className="text-xs font-semibold text-ink">
                    {task.title}
                  </Text>
                  <Text className="mt-1 text-[11px] text-muted">
                    {task.taskType} · {task.status}
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : null}
          {selectedScheduledTaskId ? (
            <View className="mt-2 rounded-xl border border-border bg-surface p-2">
              {scheduledTaskRuns.length === 0 ? (
                <Text className="text-xs text-muted">
                  {t("profileNoRunsYet", locale)}
                </Text>
              ) : (
                scheduledTaskRuns.map((run) => (
                  <Text className="mb-1 text-xs text-ink" key={run.id}>
                    {formatRelativeTime(run.triggeredAt)} · {run.status}
                  </Text>
                ))
              )}
            </View>
          ) : null}
        </View>

        <View className="h-px bg-border" />

        <View>
          <View className="mb-2 flex-row items-center justify-between">
            <Text className="text-[18px] font-semibold tracking-tight text-ink">
              {t("profileRecurringCircles", locale)}
            </Text>
            <PrimaryButton
              label={t("profileNew", locale)}
              onPress={onCreateCircle}
              variant="ghost"
            />
          </View>
          {circlesBusy ? (
            <Text className="text-xs text-muted">
              {t("profileLoadingCircles", locale)}
            </Text>
          ) : circles.length === 0 ? (
            <Text className="text-xs text-muted">
              {t("profileNoCircles", locale)}
            </Text>
          ) : (
            <View className="gap-2">
              {circles.map((circle) => (
                <Pressable
                  className={`rounded-xl border px-3 py-2 ${
                    selectedCircleId === circle.id
                      ? "border-primary bg-primary/10"
                      : "border-border bg-surface"
                  }`}
                  key={circle.id}
                  onPress={() => onSelectCircle(circle.id)}
                >
                  <Text className="text-xs font-semibold text-ink">
                    {circle.title}
                  </Text>
                  <Text className="mt-1 text-[11px] text-muted">
                    {circle.status} · next{" "}
                    {circle.nextSessionAt
                      ? formatRelativeTime(circle.nextSessionAt)
                      : t("profileNextScheduled", locale)}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}
          <View className="mt-3 flex-row items-center justify-between">
            <Text className="text-xs text-muted">
              {selectedCircleTitle ?? t("profileSelectCircle", locale)}
            </Text>
            <PrimaryButton
              label={t("profileOpenNow", locale)}
              onPress={onRunCircleSessionNow}
              variant="secondary"
              disabled={!selectedCircleId}
            />
          </View>
          <View className="mt-2 rounded-xl border border-border bg-surface p-2">
            {circleSessions.length === 0 ? (
              <Text className="text-xs text-muted">
                {t("profileNoRecentSessions", locale)}
              </Text>
            ) : (
              circleSessions.map((sessionItem) => (
                <Text className="mb-1 text-xs text-ink" key={sessionItem.id}>
                  {formatRelativeTime(sessionItem.scheduledFor)} ·{" "}
                  {sessionItem.status}
                </Text>
              ))
            )}
          </View>
        </View>
      </SurfaceCard>

      <SurfaceCard>
        <Text className="mb-2 text-base font-semibold text-ink">
          {t("profileLocalTelemetry", locale)}
        </Text>
        <Text className="text-xs text-muted">
          {t("profileEvents", locale, {
            count: telemetrySummary?.totalEvents ?? 0,
          })}
        </Text>
        <Text className="text-xs text-muted">
          {t("profileLast", locale, {
            value: telemetrySummary?.lastEventAt
              ? formatRelativeTime(telemetrySummary.lastEventAt)
              : t("profileNa", locale),
          })}
        </Text>
        <Text className="mt-2 text-xs text-muted">
          {t("profileTelemetryIntents", locale, {
            intents: telemetrySummary?.counters.intentsCreated ?? 0,
            sent: telemetrySummary?.counters.requestsSent ?? 0,
            responded: telemetrySummary?.counters.requestsResponded ?? 0,
          })}
        </Text>
        <Text className="text-xs text-muted">
          {t("profileTelemetryChats", locale, {
            started: telemetrySummary?.counters.chatsStarted ?? 0,
            messages: telemetrySummary?.counters.firstMessagesSent ?? 0,
          })}
        </Text>
        <Text className="text-xs text-muted">
          {t("profileTelemetryModeration", locale, {
            reports: telemetrySummary?.counters.reportsSubmitted ?? 0,
            blocked: telemetrySummary?.counters.usersBlocked ?? 0,
          })}
        </Text>
        <Text className="text-xs text-muted">
          {t("profileTelemetryIntentMetrics", locale, {
            accept: formatMetricSeconds(
              telemetrySummary?.metrics.avgIntentToFirstAcceptanceSeconds ??
                null,
            ),
            firstMessage: formatMetricSeconds(
              telemetrySummary?.metrics.avgIntentToFirstMessageSeconds ?? null,
            ),
          })}
        </Text>
        <Text className="text-xs text-muted">
          {t("profileTelemetryConnectionMetrics", locale, {
            success: formatMetricRate(
              telemetrySummary?.metrics.connectionSuccessRate ?? null,
            ),
            completion: formatMetricRate(
              telemetrySummary?.metrics.groupFormationCompletionRate ?? null,
            ),
          })}
        </Text>
        <Text className="text-xs text-muted">
          {t("profileTelemetryNotificationMetrics", locale, {
            open: formatMetricRate(
              telemetrySummary?.metrics.notificationToOpenRate ?? null,
            ),
            incidence: formatMetricRate(
              telemetrySummary?.metrics.moderationIncidentRate ?? null,
            ),
          })}
        </Text>
        <Text className="text-xs text-muted">
          {t("profileTelemetrySyncMetrics", locale, {
            failure: formatMetricRate(
              telemetrySummary?.metrics.syncFailureRate ?? null,
            ),
            repeat: formatMetricRate(
              telemetrySummary?.metrics.repeatConnectionRate ?? null,
            ),
          })}
        </Text>
        <Text className="text-xs text-muted">
          {t("profileTelemetryActivationMetrics", locale, {
            ready: telemetrySummary?.counters.onboardingActivationReady ?? 0,
            started:
              telemetrySummary?.counters.onboardingActivationStarted ?? 0,
            success:
              telemetrySummary?.counters.onboardingActivationSucceeded ?? 0,
            queued: telemetrySummary?.counters.onboardingActivationQueued ?? 0,
            failed: telemetrySummary?.counters.onboardingActivationFailed ?? 0,
            avg: formatMetricSeconds(
              telemetrySummary?.metrics.avgActivationCompletionSeconds ?? null,
            ),
            successRate: formatMetricRate(
              telemetrySummary?.metrics.activationSuccessRate ?? null,
            ),
          })}
        </Text>
      </SurfaceCard>

      <PrimaryButton
        label={
          loading
            ? t("commonLoading", locale)
            : t("profileSaveSettings", locale)
        }
        loading={loading}
        onPress={onSaveSettings}
        variant="secondary"
      />
      <PrimaryButton
        label={t("profileRequestDigestNow", locale)}
        onPress={onSendDigestNow}
        variant="ghost"
      />
      <PrimaryButton
        label={t("profileSignOut", locale)}
        onPress={onSignOut}
        variant="ghost"
      />
    </ScrollView>
  );
}

function mergeChatMessages(
  existing: ChatMessageRecord[],
  incoming: ChatMessageRecord[],
) {
  const dedupedById = new Map<string, ChatMessageRecord>();
  for (const message of [...existing, ...incoming]) {
    dedupedById.set(message.id, message);
  }

  return Array.from(dedupedById.values()).sort((left, right) => {
    const leftTimestamp = Date.parse(left.createdAt);
    const rightTimestamp = Date.parse(right.createdAt);
    const leftTime = Number.isFinite(leftTimestamp) ? leftTimestamp : 0;
    const rightTime = Number.isFinite(rightTimestamp) ? rightTimestamp : 0;
    if (leftTime !== rightTime) {
      return leftTime - rightTime;
    }
    return left.id.localeCompare(right.id);
  });
}

function formatThreadSummary(thread: LocalChatThread) {
  const typeLabel = thread.type === "group" ? "group" : "dm";
  const participants =
    thread.participantCount == null
      ? "participants n/a"
      : `${thread.participantCount} participant${thread.participantCount === 1 ? "" : "s"}`;
  const status = thread.connectionStatus ?? "status n/a";
  const syncedAt = thread.highWatermark
    ? `synced ${formatRelativeTime(thread.highWatermark)}`
    : "not synced";
  return `${typeLabel} · ${participants} · ${status} · ${syncedAt}`;
}

function formatChatTitle(chatId: string, type: "dm" | "group") {
  const prefix = type === "group" ? "Group" : "Thread";
  return `${prefix} ${chatId.slice(0, 6)}`;
}

function createClientMessageId() {
  return `${randomHex(8)}-${randomHex(4)}-4${randomHex(3)}-${randomVariantHex()}${randomHex(3)}-${randomHex(12)}`;
}

function randomHex(length: number) {
  let output = "";
  for (let index = 0; index < length; index += 1) {
    output += Math.floor(Math.random() * 16).toString(16);
  }
  return output;
}

function randomVariantHex() {
  const variants = ["8", "9", "a", "b"];
  return variants[Math.floor(Math.random() * variants.length)] ?? "8";
}

function sleep(milliseconds: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

function formatMetricSeconds(seconds: number | null) {
  if (seconds == null) {
    return "n/a";
  }
  if (seconds < 60) {
    return `${seconds}s`;
  }
  if (seconds < 3600) {
    return `${Math.round(seconds / 60)}m`;
  }
  return `${Math.round(seconds / 3600)}h`;
}

function formatMetricRate(value: number | null) {
  if (value == null) {
    return "n/a";
  }
  return `${Math.round(value * 100)}%`;
}

function formatRelativeTime(input: string) {
  const createdAt = new Date(input);
  const deltaSeconds = Math.max(
    Math.floor((Date.now() - createdAt.getTime()) / 1000),
    0,
  );
  if (deltaSeconds < 60) {
    return `${deltaSeconds}s ago`;
  }
  if (deltaSeconds < 3600) {
    return `${Math.floor(deltaSeconds / 60)}m ago`;
  }
  return `${Math.floor(deltaSeconds / 3600)}h ago`;
}
