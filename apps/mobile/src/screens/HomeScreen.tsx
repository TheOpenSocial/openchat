import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  API_BASE_URL,
  api,
  type ChatMessageRecord,
  type ChatMetadataRecord,
  type ExperienceHomeSummaryResponse,
} from "../lib/api";
import { t } from "../i18n/strings";
import { type RealtimeSession } from "../lib/realtime";
import { DevOrb } from "../components/DevOrb";
import { hapticSelection } from "../lib/haptics";
import { loadOfflineOutbox } from "../lib/offline-outbox";
import {
  loadStoredHomeSummary,
  saveStoredHomeSummary,
} from "../lib/experience-storage";
import { useNetworkOnline } from "../lib/use-network-online";
import { usePrimaryAgentThread } from "../lib/use-primary-agent-thread";
import { useKeyboardVisible } from "../hooks/useKeyboardVisible";
import {
  type AgentTimelineMessage,
  MobileSession,
  UserProfileDraft,
} from "../types";
import { HomeScreenLayout } from "./home/HomeScreenLayout";
import { ActivitySurfaceContainer } from "./home/containers/ActivitySurfaceContainer";
import { ChatsSurfaceContainer } from "./home/containers/ChatsSurfaceContainer";
import { HomeSurfaceContainer } from "./home/containers/HomeSurfaceContainer";
import { ProfileSurfaceContainer } from "./home/containers/ProfileSurfaceContainer";
import { mergeChatMessages } from "./home/domain/chat-utils";
import { deriveHomeRuntimeViewModel } from "./home/domain/runtime-model";
import { type LocalChatThread } from "./home/domain/types";
import { useChatSyncController } from "./home/hooks/useChatSyncController";
import { useChatMessagingController } from "./home/hooks/useChatMessagingController";
import { useAgentIntentController } from "./home/hooks/useAgentIntentController";
import { useChatsOperationsController } from "./home/hooks/useChatsOperationsController";
import { useHomeLocale } from "./home/hooks/useHomeLocale";
import { useOnboardingCarryoverPersistence } from "./home/hooks/useOnboardingCarryoverPersistence";
import { useOnboardingCarryoverSeed } from "./home/hooks/useOnboardingCarryoverSeed";
import { usePendingIntentSummary } from "./home/hooks/usePendingIntentSummary";
import { useHomeTelemetry } from "./home/hooks/useHomeTelemetry";
import { useChatsRealtime } from "./home/hooks/useChatsRealtime";
import { useChatsHydration } from "./home/hooks/useChatsHydration";
import { useHomeRecoveryController } from "./home/hooks/useHomeRecoveryController";
import { useHomeWelcomeSheet } from "./home/hooks/useHomeWelcomeSheet";
import { useHomeTransientRoutes } from "./home/hooks/useHomeTransientRoutes";
import {
  usePushLifecycle,
  type PushRouteIntent,
} from "../features/notifications/hooks/usePushLifecycle";
import { useNonChatRealtimeController } from "../features/realtime/hooks/useNonChatRealtimeController";
import { useActivityStore } from "../store/activity-store";
import { useHomeShellStore } from "../store/home-shell-store";
import { useHomeThreadStore } from "../store/home-thread-store";
import { useChatsStore } from "../store/chats-store";

export interface HomeScreenProps {
  session: MobileSession;
  initialProfile: UserProfileDraft;
  onProfileUpdated: (profile: UserProfileDraft) => void;
  onResetSession: () => Promise<void>;
  skipNetwork?: boolean;
  /** When set, sent as the first agent-thread message once the primary thread is ready (e.g. post-onboarding). */
  initialAgentMessage?: string | null;
  /** Called after the seed message attempt finishes (success or error). */
  onInitialAgentMessageConsumed?: () => void;
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

function describePushRouteIntent(intent: PushRouteIntent | null) {
  if (!intent) {
    return "idle";
  }

  switch (intent.kind) {
    case "chat":
      return `chat:${intent.chatId}`;
    case "intent":
      return `intent:${intent.intentId}`;
    case "profile":
      return `profile:${intent.userId}`;
    default:
      return intent.kind;
  }
}

function chatMessageSortKey(message: { createdAt: string; id: string }) {
  return `${message.createdAt}::${message.id}`;
}

function buildReadMessageStatus(): NonNullable<ChatMessageRecord["status"]> {
  return {
    state: "read",
    deliveredCount: 1,
    readCount: 1,
    pendingCount: 0,
  };
}

function buildSeedAgentTimeline(locale: "en" | "es"): AgentTimelineMessage[] {
  return [
    {
      id: "seed_1",
      role: "agent",
      body: t("homeAgentSeedPrompt", locale),
    },
  ];
}

function buildLocalHomeSummary(
  locale: "en" | "es",
): ExperienceHomeSummaryResponse {
  const prompt =
    locale === "es"
      ? "Encontrar gente para jugar o hablar hoy"
      : "Find people to play or talk with today";

  return {
    generatedAt: new Date().toISOString(),
    thread: {
      id: "local-e2e-thread",
      title: locale === "es" ? "Tu hilo principal" : "Your main thread",
      createdAt: new Date().toISOString(),
    },
    status: {
      tone: "active",
      eyebrow: locale === "es" ? "Listo ahora" : "Ready now",
      title:
        locale === "es"
          ? "Buscando una buena opcion para hoy"
          : "Looking for a good option for today",
      body:
        locale === "es"
          ? "El hilo esta listo. Prueba una idea concreta o abre Activity para ver movimiento."
          : "The thread is ready. Try a concrete idea or open Activity to review movement.",
      footnote:
        locale === "es"
          ? "Modo local para validar el loop diario."
          : "Local mode for daily-loop validation.",
      nextAction: {
        kind: "start_intent",
        label: locale === "es" ? "Empezar" : "Start now",
      },
    },
    counts: {
      activeIntents: 1,
      pendingRequests: 1,
      unreadNotifications: 1,
      tonightSuggestions: 2,
      reconnectCandidates: 1,
    },
    spotlight: {
      coordination: {
        variant: "waiting",
        title: locale === "es" ? "Esperando respuestas" : "Waiting on replies",
        body:
          locale === "es"
            ? "Ya hay movimiento. Si quieres, revisa Activity o entra a Chats."
            : "There is already movement. Check Activity or move into Chats.",
        actionLabel: locale === "es" ? "Ver activity" : "Open Activity",
        targetChatId: null,
      },
      recovery: null,
      leadIntent: {
        intentId: "local-e2e-intent",
        rawText: prompt,
        status: "active",
        requests: {
          pending: 1,
          accepted: 0,
          rejected: 0,
          expired: 0,
          cancelled: 0,
        },
      },
      topSuggestion: {
        userId: "local-e2e-suggestion",
        displayName: "Maya",
        score: 0.86,
        reason:
          locale === "es"
            ? "Disponible ahora y compatible con este plan."
            : "Available now and aligned with this plan.",
      },
    },
  };
}

const THREAD_LOAD_RETRY_DELAYS_MS = [1500, 3000, 5000, 8000] as const;

export function HomeScreen({
  initialAgentMessage = null,
  initialProfile,
  onInitialAgentMessageConsumed,
  onProfileUpdated,
  onResetSession,
  session,
  skipNetwork = false,
}: HomeScreenProps) {
  void initialProfile;
  const insets = useSafeAreaInsets();
  const { locale } = useHomeLocale("en");
  const {
    dismiss: dismissWelcomeSheet,
    hydrated: welcomeSheetHydrated,
    visible: welcomeSheetVisible,
  } = useHomeWelcomeSheet({
    userId: session.userId,
  });
  const keyboardVisible = useKeyboardVisible();
  const activeTab = useHomeShellStore((store) => store.activeTab);
  const setActiveTab = useHomeShellStore((store) => store.setActiveTab);
  const agentVoiceTranscriptRef = useRef<string | null>(null);
  const draftIntentText = useHomeThreadStore((store) => store.draftIntentText);
  const setDraftIntentText = useHomeThreadStore(
    (store) => store.setDraftIntentText,
  );
  const agentImageUrlDraft = useHomeThreadStore(
    (store) => store.agentImageUrlDraft,
  );
  const setAgentImageUrlDraft = useHomeThreadStore(
    (store) => store.setAgentImageUrlDraft,
  );
  const onboardingCarryoverSeed = useHomeThreadStore(
    (store) => store.onboardingCarryoverSeed,
  );
  const setOnboardingCarryoverSeed = useHomeThreadStore(
    (store) => store.setOnboardingCarryoverSeed,
  );
  const onboardingCarryoverIdempotencyKey = useHomeThreadStore(
    (store) => store.onboardingCarryoverIdempotencyKey,
  );
  const setOnboardingCarryoverIdempotencyKey = useHomeThreadStore(
    (store) => store.setOnboardingCarryoverIdempotencyKey,
  );
  const onboardingCarryoverState = useHomeThreadStore(
    (store) => store.onboardingCarryoverState,
  );
  const setOnboardingCarryoverState = useHomeThreadStore(
    (store) => store.setOnboardingCarryoverState,
  );
  const sendingIntent = useHomeThreadStore((store) => store.sendingIntent);
  const setSendingIntent = useHomeThreadStore(
    (store) => store.setSendingIntent,
  );
  const decomposeIntent = useHomeThreadStore((store) => store.decomposeIntent);
  const setDecomposeIntent = useHomeThreadStore(
    (store) => store.setDecomposeIntent,
  );
  const decomposeMaxIntents = useHomeThreadStore(
    (store) => store.decomposeMaxIntents,
  );
  const setDecomposeMaxIntents = useHomeThreadStore(
    (store) => store.setDecomposeMaxIntents,
  );
  const agentTimeline = useHomeThreadStore((store) => store.agentTimeline);
  const setAgentTimeline = useHomeThreadStore(
    (store) => store.setAgentTimeline,
  );
  const banner = useHomeShellStore((store) => store.banner);
  const setBanner = useHomeShellStore((store) => store.setBanner);
  const chats = useChatsStore((store) => store.chats);
  const setChats = useChatsStore((store) => store.setChats);
  const selectedChatId = useChatsStore((store) => store.selectedChatId);
  const setSelectedChatId = useChatsStore((store) => store.setSelectedChatId);
  const draftChatMessage = useHomeShellStore((store) => store.draftChatMessage);
  const setDraftChatMessage = useHomeShellStore(
    (store) => store.setDraftChatMessage,
  );
  const sendingChatMessage = useChatsStore((store) => store.sendingChatMessage);
  const setSendingChatMessage = useChatsStore(
    (store) => store.setSendingChatMessage,
  );
  const devOrbOpen = useHomeShellStore((store) => store.devOrbOpen);
  const setDevOrbOpen = useHomeShellStore((store) => store.setDevOrbOpen);
  const devOrbUnlocked = useHomeShellStore((store) => store.devOrbUnlocked);
  const setDevOrbUnlocked = useHomeShellStore(
    (store) => store.setDevOrbUnlocked,
  );
  const homeSummary = useHomeShellStore((store) => store.homeSummary);
  const setHomeSummary = useHomeShellStore((store) => store.setHomeSummary);
  const setBootstrapHydratedAt = useHomeShellStore(
    (store) => store.setBootstrapHydratedAt,
  );
  const syncingChats = useChatsStore((store) => store.syncingChats);
  const setSyncingChats = useChatsStore((store) => store.setSyncingChats);
  const pendingOutboxCount = useChatsStore((store) => store.pendingOutboxCount);
  const setPendingOutboxCount = useChatsStore(
    (store) => store.setPendingOutboxCount,
  );
  const chatStorageReady = useChatsStore((store) => store.chatStorageReady);
  const setChatStorageReady = useChatsStore(
    (store) => store.setChatStorageReady,
  );
  const visibleBanner = banner?.tone === "error" ? null : banner;
  const realtimeState = useChatsStore((store) => store.realtimeState);
  const setRealtimeState = useChatsStore((store) => store.setRealtimeState);
  const typingUsersByChat = useChatsStore((store) => store.typingUsersByChat);
  const setTypingUsersByChat = useChatsStore(
    (store) => store.setTypingUsersByChat,
  );
  const pendingIntentSummary = usePendingIntentSummary({
    activeTab,
    sessionAccessToken: session.accessToken,
    sessionUserId: session.userId,
    skipNetwork,
  });
  const { recordTelemetry } = useHomeTelemetry(session.userId);
  const homeLayoutDebug = false;
  const bottomComposerInset = Math.max(insets.bottom, 12);
  const tabBarHeight = 66 + Math.max(insets.bottom, 8);
  const composerBottomInset = keyboardVisible ? 0 : bottomComposerInset;
  const shellContentBottomInset = keyboardVisible ? 0 : tabBarHeight;
  const unreadChatsCount = useMemo(
    () =>
      chats.reduce((sum, thread) => sum + Math.max(0, thread.unreadCount), 0),
    [chats],
  );
  const showDevOrb = __DEV__ || process.env.EXPO_PUBLIC_ENABLE_DEV_ORB === "1";
  const DEV_ORB_UNLOCK_WINDOW_MS = 10 * 60 * 1000;
  const activityHasUnread = useActivityStore((store) => store.hasUnread);
  const setActivityState = useActivityStore((store) => store.setActivityState);
  const nonChatRealtimeCallbacks = useNonChatRealtimeController({
    setBanner,
  });
  const showPushDebug =
    __DEV__ || process.env.EXPO_PUBLIC_ENABLE_PUSH_DEBUG === "1";
  const { actions: transientRouteActions, transientScreen } =
    useHomeTransientRoutes({
      initialProfile,
      onProfileUpdated,
      session,
      setActiveTab,
      setSelectedChatId,
    });
  const { push, pushDebug } = usePushLifecycle({
    enabled: true,
    onRouteIntent: transientRouteActions.handlePushRouteIntent,
    userId: session.userId,
  });

  useEffect(() => {
    setChatStorageReady(false);
    setRealtimeState("offline");
  }, [setChatStorageReady, setRealtimeState]);

  useEffect(() => {
    if (!devOrbUnlocked) {
      return;
    }
    const timeout = setTimeout(() => {
      setDevOrbUnlocked(false);
      setDevOrbOpen(false);
    }, DEV_ORB_UNLOCK_WINDOW_MS);
    return () => {
      clearTimeout(timeout);
    };
  }, [devOrbUnlocked]);
  const chatsRef = useRef<LocalChatThread[]>([]);
  const selectedChatIdRef = useRef<string | null>(null);
  const realtimeSessionRef = useRef<RealtimeSession | null>(null);
  const localTypingActiveRef = useRef(false);
  const localTypingChatIdRef = useRef<string | null>(null);
  const localTypingStopTimeoutRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  const onboardingSeedHandledRef = useRef(false);

  useOnboardingCarryoverPersistence({
    initialAgentMessage,
    onboardingCarryoverIdempotencyKey,
    onboardingCarryoverSeed,
    onboardingCarryoverState,
    onboardingSeedHandledRef,
    setBanner,
    setOnboardingCarryoverIdempotencyKey,
    setOnboardingCarryoverSeed,
    setOnboardingCarryoverState,
    userId: session.userId,
  });
  useOnboardingCarryoverSeed({
    buildIdempotencyKey: buildOnboardingCarryoverIdempotencyKey,
    initialAgentMessage,
    onInitialAgentMessageConsumed,
    onboardingSeedHandledRef,
    setOnboardingCarryoverIdempotencyKey,
    setOnboardingCarryoverSeed,
    setOnboardingCarryoverState,
    userId: session.userId,
  });
  const [agentComposerMode, setAgentComposerMode] = useState<"chat" | "intent">(
    "chat",
  );
  const netOnline = useNetworkOnline(skipNetwork);
  const refreshPendingOutboxCount = useCallback(async () => {
    if (skipNetwork) {
      setPendingOutboxCount(0);
      return;
    }
    const pending = await loadOfflineOutbox(session.userId);
    setPendingOutboxCount(pending.length);
  }, [session.userId, skipNetwork]);
  const agentThreadSyncEnabled = !skipNetwork;
  const [agentThreadLoadError, setAgentThreadLoadError] = useState<
    string | null
  >(null);
  const [agentThreadRetryAttempt, setAgentThreadRetryAttempt] = useState(0);
  const [agentThreadRetryNextAt, setAgentThreadRetryNextAt] = useState<
    number | null
  >(null);
  const {
    loading: agentThreadLoading,
    reload: reloadPrimaryAgentThread,
    threadId: agentThreadId,
  } = usePrimaryAgentThread({
    accessToken: session.accessToken,
    enabled: agentThreadSyncEnabled,
    onHydrated: (messages) => {
      setAgentThreadLoadError(null);
      setAgentThreadRetryAttempt(0);
      setAgentThreadRetryNextAt(null);
      setAgentTimeline(
        messages.length > 0 ? messages : buildSeedAgentTimeline(locale),
      );
    },
    onLoadError: (error) => {
      const connectionLabel =
        realtimeState === "connected"
          ? "socket connected"
          : realtimeState === "connecting"
            ? "socket connecting"
            : "socket offline";
      const codePart = error.code ? `code=${error.code}` : "code=unknown";
      const statusPart =
        typeof error.statusCode === "number"
          ? `status=${error.statusCode}`
          : "status=n/a";
      const offlinePart = error.offline ? "offline" : "online";
      const transientPart = error.transient ? "retryable" : "non-retryable";
      const diagnosticMessage =
        error.message.trim() || t("homeThreadLoadFailedBody", locale);
      const nextAttempt = agentThreadRetryAttempt + 1;
      const isAbuseThrottle = error.code === "abuse_throttled";
      const canAutoRetry =
        !isAbuseThrottle &&
        (error.offline || error.transient) &&
        nextAttempt <= THREAD_LOAD_RETRY_DELAYS_MS.length;
      const recoveryMessage = error.offline
        ? "I lost your main thread for a moment. I’m reconnecting now."
        : isAbuseThrottle
          ? "Your main thread is rate-limited for a moment. I’m holding here instead of retrying."
          : error.transient
            ? "Your main thread is temporarily unavailable. I’m reconnecting now."
            : "I couldn’t restore your main thread yet.";
      setAgentThreadLoadError(recoveryMessage);
      setAgentThreadRetryAttempt(nextAttempt);
      setAgentThreadRetryNextAt(
        canAutoRetry
          ? Date.now() + THREAD_LOAD_RETRY_DELAYS_MS[nextAttempt - 1]
          : null,
      );
      recordTelemetry("home_thread_load_failed", {
        apiBaseUrl: API_BASE_URL,
        autoRetryScheduled: canAutoRetry,
        code: error.code ?? "unknown",
        message: diagnosticMessage,
        offline: error.offline,
        realtimeState,
        retryAttempt: nextAttempt,
        statusCode: error.statusCode ?? -1,
        transient: error.transient,
      });
      console.warn("[home-thread-load-failed]", {
        apiBaseUrl: API_BASE_URL,
        code: error.code,
        diagnosticLabel: `${codePart} ${statusPart} ${offlinePart} ${transientPart} ${connectionLabel}`,
        message: diagnosticMessage,
        offline: error.offline,
        realtimeState,
        statusCode: error.statusCode,
        transient: error.transient,
      });
    },
  });
  const homeRuntimeViewModel = useMemo(
    () =>
      deriveHomeRuntimeViewModel({
        hasError: Boolean(agentThreadLoadError),
        messages: agentTimeline,
        pending: pendingIntentSummary,
        sending: sendingIntent,
        threadLoading: agentThreadLoading,
        hasDraft: draftIntentText.trim().length > 0,
      }),
    [
      agentThreadLoadError,
      agentThreadLoading,
      agentTimeline,
      draftIntentText,
      pendingIntentSummary,
      sendingIntent,
    ],
  );

  useEffect(() => {
    void refreshPendingOutboxCount().catch(() => {});
  }, [refreshPendingOutboxCount]);

  useEffect(() => {
    let active = true;

    if (skipNetwork) {
      const localSummary = buildLocalHomeSummary(locale);
      setHomeSummary(localSummary);
      setBootstrapHydratedAt(localSummary.generatedAt);
      setActivityState({
        hasUnread: true,
        pendingRequestCount: 1,
        lastHydratedAt: localSummary.generatedAt,
      });
      void saveStoredHomeSummary(session.userId, localSummary).catch(() => {});
      return () => {
        active = false;
      };
    }

    void loadStoredHomeSummary(session.userId).then((storedSummary) => {
      if (!active || !storedSummary) {
        return;
      }
      setHomeSummary(storedSummary);
    });

    void api
      .getExperienceBootstrapSummary(session.userId, session.accessToken)
      .then((summary) => {
        if (!active) {
          return;
        }
        setHomeSummary(summary.home);
        setBootstrapHydratedAt(summary.generatedAt);
        void saveStoredHomeSummary(session.userId, summary.home).catch(
          () => {},
        );
        setActivityState({
          hasUnread:
            summary.activity.counts.unreadNotifications > 0 ||
            summary.activity.counts.pendingRequests > 0,
          pendingRequestCount: summary.activity.counts.pendingRequests,
          lastHydratedAt: summary.generatedAt,
        });
      })
      .catch(() => {
        if (!active) {
          return;
        }
      });

    return () => {
      active = false;
    };
  }, [
    pendingIntentSummary?.activeIntentCount,
    session.accessToken,
    session.userId,
    setBootstrapHydratedAt,
    setActivityState,
    setHomeSummary,
  ]);

  useEffect(() => {
    if (
      agentThreadLoading ||
      agentTimeline.length > 0 ||
      onboardingCarryoverState === "processing"
    ) {
      return;
    }
    setAgentTimeline(buildSeedAgentTimeline(locale));
  }, [
    agentThreadLoading,
    agentTimeline.length,
    locale,
    onboardingCarryoverState,
    setAgentTimeline,
  ]);

  useEffect(() => {
    if (!agentThreadRetryNextAt) {
      return;
    }
    const delayMs = agentThreadRetryNextAt - Date.now();
    if (delayMs <= 0) {
      setAgentThreadRetryNextAt(null);
      reloadPrimaryAgentThread();
      return;
    }
    const timeout = setTimeout(() => {
      setAgentThreadRetryNextAt(null);
      reloadPrimaryAgentThread();
    }, delayMs);
    return () => {
      clearTimeout(timeout);
    };
  }, [agentThreadRetryNextAt, reloadPrimaryAgentThread]);

  const agentThreadRetrySeconds = useMemo(() => {
    if (!agentThreadRetryNextAt) {
      return null;
    }
    return Math.max(1, Math.ceil((agentThreadRetryNextAt - Date.now()) / 1000));
  }, [agentThreadRetryNextAt]);

  const simulateHomeReconnectState = useCallback(() => {
    setActiveTab("home");
    setAgentTimeline([]);
    setAgentThreadLoadError("simulated_home_reconnect");
    setAgentThreadRetryAttempt(1);
    setAgentThreadRetryNextAt(Date.now() + 8000);
    setDevOrbOpen(false);
  }, [setActiveTab, setAgentTimeline, setDevOrbOpen]);

  const selectedChat = useMemo(
    () => chats.find((chat) => chat.id === selectedChatId) ?? null,
    [chats, selectedChatId],
  );
  const [selectedChatMetadata, setSelectedChatMetadata] =
    useState<ChatMetadataRecord | null>(null);
  const typingUsers = useMemo(
    () => (selectedChatId ? (typingUsersByChat[selectedChatId] ?? []) : []),
    [selectedChatId, typingUsersByChat],
  );
  const selectedChatPresence = useMemo(() => {
    if (!selectedChatMetadata || selectedChatMetadata.type !== "dm") {
      return null;
    }
    return (
      selectedChatMetadata.participants.find(
        (participant) => participant.userId !== session.userId,
      )?.presence ?? null
    );
  }, [selectedChatMetadata, session.userId]);
  const readReceiptCursorRef = useRef<Record<string, string>>({});

  useEffect(() => {
    if (!selectedChatId) {
      setSelectedChatMetadata(null);
      return;
    }

    let cancelled = false;
    void api
      .getChatMetadata(selectedChatId, session.accessToken)
      .then((metadata) => {
        if (!cancelled) {
          setSelectedChatMetadata(metadata);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSelectedChatMetadata(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selectedChatId, session.accessToken]);

  const applyRealtimeChatMessage = useCallback(
    (chatId: string, message: ChatMessageRecord) => {
      const normalizedMessage =
        message.senderUserId === session.userId && !message.status
          ? {
              ...message,
              status: buildReadMessageStatus(),
            }
          : message;
      setChats((current) =>
        current.map((thread) => {
          if (thread.id !== chatId) {
            return thread;
          }

          const mergedMessages = mergeChatMessages(thread.messages, [
            normalizedMessage,
          ]);
          const selected = selectedChatIdRef.current === chatId;
          const incrementUnread =
            !selected && normalizedMessage.senderUserId !== session.userId;

          return {
            ...thread,
            messages: mergedMessages,
            highWatermark: normalizedMessage.createdAt,
            unreadCount: incrementUnread
              ? thread.unreadCount + 1
              : thread.unreadCount,
          };
        }),
      );
    },
    [session.userId],
  );

  useEffect(() => {
    if (!selectedChat || !chatStorageReady || skipNetwork) {
      return;
    }

    const previousCursor = readReceiptCursorRef.current[selectedChat.id];
    const latestMessage = selectedChat.messages.at(-1);
    const latestCursor = latestMessage
      ? chatMessageSortKey(latestMessage)
      : previousCursor;

    const unreadMessages = selectedChat.messages.filter((message) => {
      if (message.senderUserId === session.userId) {
        return false;
      }
      if (!previousCursor) {
        return true;
      }
      return chatMessageSortKey(message) > previousCursor;
    });

    if (unreadMessages.length === 0) {
      if (latestCursor) {
        readReceiptCursorRef.current[selectedChat.id] = latestCursor;
      }
      return;
    }

    const markRead = async () => {
      for (const message of unreadMessages) {
        if (realtimeSessionRef.current) {
          realtimeSessionRef.current.publishReadReceipt(
            selectedChat.id,
            message.id,
            session.userId,
          );
          continue;
        }
        await api.markChatMessageRead(
          selectedChat.id,
          message.id,
          session.userId,
          session.accessToken,
        );
      }
      if (latestCursor) {
        readReceiptCursorRef.current[selectedChat.id] = latestCursor;
      }
    };

    void markRead().catch(() => {});
  }, [
    chatStorageReady,
    realtimeSessionRef,
    selectedChat,
    session.accessToken,
    session.userId,
    skipNetwork,
  ]);

  const { syncChatThread, syncChatsNow } = useChatSyncController({
    chatStorageReady,
    chats,
    chatsRef,
    netOnline,
    selectedChatIdRef,
    sessionAccessToken: session.accessToken,
    sessionUserId: session.userId,
    setBanner,
    setChats,
    setSyncingChats,
    skipNetwork,
    trackTelemetry: recordTelemetry,
  });

  useChatsRealtime({
    applyRealtimeChatMessage,
    chatStorageReady,
    chats,
    chatsRef,
    localTypingActiveRef,
    localTypingChatIdRef,
    localTypingStopTimeoutRef,
    realtimeSessionRef,
    realtimeCallbacks: nonChatRealtimeCallbacks,
    selectedChatId,
    selectedChatIdRef,
    sessionAccessToken: session.accessToken,
    sessionUserId: session.userId,
    setChats,
    setRealtimeState,
    setTypingUsersByChat,
    skipNetwork,
  });

  useChatsHydration({
    sessionAccessToken: session.accessToken,
    skipNetwork,
    userId: session.userId,
    setBanner,
    setChatStorageReady,
    setChats,
    setSelectedChatId,
  });

  useHomeRecoveryController({
    agentThreadId,
    chatsRef,
    netOnline,
    refreshPendingOutboxCount,
    sessionAccessToken: session.accessToken,
    sessionUserId: session.userId,
    setAgentTimeline,
    setBanner,
    skipNetwork,
    syncChatThread,
  });

  const resetAgentConversation = useCallback(() => {
    setAgentTimeline([
      {
        id: "seed_1",
        role: "agent",
        body: "What would you like to do today—or who would you like to meet?",
      },
    ]);
    setDraftIntentText("");
  }, [setAgentTimeline, setDraftIntentText]);

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

  const { cancelIntentSend, executeOnboardingCarryover, sendIntent } =
    useAgentIntentController({
      agentComposerMode,
      agentImageUrlDraft,
      agentThreadId,
      agentVoiceTranscriptRef,
      decomposeIntent,
      decomposeMaxIntents,
      draftIntentText,
      locale,
      netOnline,
      onInitialAgentMessageConsumed,
      onboardingCarryoverIdempotencyKey,
      onboardingCarryoverSeed,
      refreshPendingOutboxCount,
      sendingIntent,
      sessionAccessToken: session.accessToken,
      sessionUserId: session.userId,
      setAgentImageUrlDraft,
      setAgentTimeline,
      setBanner,
      setDraftIntentText,
      setOnboardingCarryoverIdempotencyKey,
      setOnboardingCarryoverSeed,
      setOnboardingCarryoverState,
      setSendingIntent,
      skipNetwork,
      trackTelemetry: recordTelemetry,
      userBuildOnboardingKey: buildOnboardingCarryoverIdempotencyKey,
    });

  const { blockUser, createDemoChat, openChat, reportUser } =
    useChatsOperationsController({
      sessionAccessToken: session.accessToken,
      sessionUserId: session.userId,
      setBanner,
      setChats,
      setSelectedChatId,
      syncChatThread,
      trackTelemetry: recordTelemetry,
    });

  const {
    editOwnChatMessage,
    deleteOwnChatMessage,
    handleDraftChatMessageChange,
    reactToChatMessage,
    retryFailedChatMessage,
    sendChatMessage,
  } = useChatMessagingController({
    chatsRef,
    draftChatMessage,
    localTypingActiveRef,
    localTypingStopTimeoutRef,
    netOnline,
    refreshPendingOutboxCount,
    realtimeSessionRef,
    selectedChat,
    selectedChatIdRef,
    sendingChatMessage,
    sessionAccessToken: session.accessToken,
    sessionUserId: session.userId,
    setBanner,
    setChats,
    setDraftChatMessage,
    setSendingChatMessage,
    trackTelemetry: recordTelemetry,
  });

  if (homeLayoutDebug) {
    return <View className="flex-1 bg-red-600" testID="home-layout-debug" />;
  }

  if (transientScreen) {
    return transientScreen;
  }

  return (
    <HomeScreenLayout
      activeTab={activeTab}
      activityContent={
        <ActivitySurfaceContainer
          accessToken={session.accessToken}
          onOpenConnections={() => {
            hapticSelection();
            transientRouteActions.openConnections();
          }}
          onOpenDiscovery={() => {
            hapticSelection();
            transientRouteActions.openDiscovery();
          }}
          onOpenIntentDetail={(intentId) => {
            hapticSelection();
            transientRouteActions.openIntentDetail(intentId);
          }}
          onOpenRecurringCircles={() => {
            hapticSelection();
            transientRouteActions.openRecurringCircles();
          }}
          onOpenSavedSearches={() => {
            hapticSelection();
            transientRouteActions.openSavedSearches();
          }}
          onOpenScheduledTasks={() => {
            hapticSelection();
            transientRouteActions.openScheduledTasks();
          }}
          userId={session.userId}
        />
      }
      chatsContent={
        <ChatsSurfaceContainer
          accessToken={session.accessToken}
          currentUserId={session.userId}
          draftChatMessage={draftChatMessage}
          loadingMessages={
            selectedChatId != null && Boolean(syncingChats[selectedChatId])
          }
          onOpenUserProfile={(input) => {
            hapticSelection();
            transientRouteActions.openProfileFromChat(input);
          }}
          onModerationBlock={async (targetUserId, chatId) => {
            await blockUser(targetUserId, { chatId });
          }}
          onModerationReport={async (targetUserId, chatId) => {
            await reportUser(targetUserId, { chatId });
          }}
          onOpenChat={openChat}
          onDeleteOwnMessage={deleteOwnChatMessage}
          onEditOwnMessage={editOwnChatMessage}
          onReactToMessage={reactToChatMessage}
          onRetryFailedMessage={retryFailedChatMessage}
          onSendMessage={sendChatMessage}
          realtimeState={realtimeState}
          selectedChat={selectedChat}
          selectedChatPresence={selectedChatPresence}
          sendingMessage={sendingChatMessage}
          setDraftChatMessage={handleDraftChatMessageChange}
          threads={chats}
          typingUsers={typingUsers}
        />
      }
      hasNotifications={activityHasUnread || pendingOutboxCount > 0}
      homeContent={
        <HomeSurfaceContainer
          agentImageUrl={agentImageUrlDraft}
          canRegenerate={agentTimeline.some(
            (message) => message.role === "user",
          )}
          composerMode={agentComposerMode}
          composerBottomOffset={keyboardVisible ? 0 : 20}
          decomposeIntent={decomposeIntent}
          decomposeMaxIntents={decomposeMaxIntents}
          draftMessage={draftIntentText}
          locale={locale}
          messages={agentTimeline}
          homeSummary={homeSummary}
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
          onDecomposeIntentChange={setDecomposeIntent}
          onDecomposeMaxIntentsChange={setDecomposeMaxIntents}
          onExecuteOnboardingCarryover={executeOnboardingCarryover}
          onRegenerate={regenerateLastIntent}
          onRuntimeTelemetry={(name, properties) => {
            recordTelemetry(name, properties);
          }}
          onSend={sendIntent}
          onStop={cancelIntentSend}
          onVoiceTranscript={(line) => {
            agentVoiceTranscriptRef.current = line.trim() || null;
          }}
          pendingIntentSummary={pendingIntentSummary}
          runtimeViewModel={homeRuntimeViewModel}
          sending={sendingIntent}
          setDraftMessage={setDraftIntentText}
          threadLoadErrorMessage={agentThreadLoadError}
          threadLoadRetryAttempt={agentThreadRetryAttempt}
          threadLoadRetrySeconds={agentThreadRetrySeconds}
          threadLoadWillAutoRetry={agentThreadRetryNextAt != null}
          threadLoading={agentThreadLoading}
          onDismissWelcomeSheet={dismissWelcomeSheet}
          onPressHomeAction={(action) => {
            hapticSelection();
            switch (action) {
              case "review_requests":
                setActiveTab("activity");
                break;
              case "open_matches":
                transientRouteActions.openDiscovery();
                break;
              case "resume_intent":
                if (homeSummary?.spotlight.leadIntent?.intentId) {
                  transientRouteActions.openIntentDetail(
                    homeSummary.spotlight.leadIntent.intentId,
                  );
                }
                break;
              case "start_intent":
                setActiveTab("home");
                break;
              default:
                break;
            }
          }}
          onPressLeadIntent={(intentId) => {
            hapticSelection();
            transientRouteActions.openIntentDetail(intentId);
          }}
          onPressActivity={() => {
            hapticSelection();
            setActiveTab("activity");
          }}
          onPressCoordination={(targetChatId) => {
            hapticSelection();
            if (targetChatId) {
              setActiveTab("chats");
              setSelectedChatId(targetChatId);
              return;
            }
            if (homeSummary?.spotlight.leadIntent?.intentId) {
              transientRouteActions.openIntentDetail(
                homeSummary.spotlight.leadIntent.intentId,
              );
            }
          }}
          onPressTopSuggestion={(userId) => {
            hapticSelection();
            transientRouteActions.openProfileFromDiscovery(userId);
          }}
          welcomeSheetVisible={
            welcomeSheetHydrated &&
            welcomeSheetVisible &&
            activeTab === "home" &&
            !keyboardVisible
          }
        />
      }
      locale={locale}
      netOnline={netOnline}
      offlineNoticeText={t("offlineNotice", locale)}
      onPressHome={() => {
        hapticSelection();
        setActiveTab("home");
      }}
      onPressNotifications={() => {
        hapticSelection();
        setActiveTab("activity");
      }}
      onTabChange={(tab) => {
        hapticSelection();
        setActiveTab(tab);
      }}
      overlay={
        <>
          {showPushDebug ? (
            <View
              className="absolute left-4 top-4 max-w-[260px] rounded-[18px] border border-white/[0.08] bg-black/55 px-3 py-2.5"
              pointerEvents="none"
              testID="push-debug-overlay"
            >
              <Text className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/45">
                Push
              </Text>
              <Text className="mt-1 text-[11px] leading-[16px] text-white/78">
                {push.enabled
                  ? `enabled • ${push.permissionStatus}`
                  : `disabled • ${push.permissionStatus}`}
              </Text>
              <Text className="mt-0.5 text-[11px] leading-[16px] text-white/58">
                {`listener ${pushDebug.listenerState} • ${describePushRouteIntent(
                  pushDebug.lastRouteIntent,
                )}`}
              </Text>
              <Text className="mt-0.5 text-[11px] leading-[16px] text-white/42">
                {`received ${pushDebug.notificationReceivedCount} • responses ${pushDebug.notificationResponseCount}`}
              </Text>
            </View>
          ) : null}
          <DevOrb
            bottomOffset={composerBottomInset + 14}
            onCreateDmSandbox={async () => {
              await createDemoChat("dm");
            }}
            onCreateGroupSandbox={async () => {
              await createDemoChat("group");
            }}
            onLock={() => {
              setDevOrbUnlocked(false);
              setDevOrbOpen(false);
            }}
            onResetAgent={() => {
              resetAgentConversation();
              setActiveTab("home");
              setDevOrbOpen(false);
            }}
            onSimulateHomeReconnect={() => {
              simulateHomeReconnectState();
            }}
            onSyncChats={() => {
              void syncChatsNow();
            }}
            onToggle={() => {
              setDevOrbOpen(!devOrbOpen);
            }}
            onUnlock={() => {
              setDevOrbUnlocked(true);
              setDevOrbOpen(true);
              setBanner({
                tone: "info",
                text: "Dev tools unlocked for 10 minutes.",
              });
            }}
            open={devOrbOpen}
            unlocked={devOrbUnlocked}
            visible={showDevOrb}
          />
        </>
      }
      profileContent={
        <ProfileSurfaceContainer
          accessToken={session.accessToken}
          displayName={session.displayName}
          email={session.email}
          initialDraft={initialProfile}
          onProfileUpdated={onProfileUpdated}
          onResetSession={onResetSession}
          userId={session.userId}
        />
      }
      shellContentBottomInset={shellContentBottomInset}
      skipNetwork={skipNetwork}
      title={
        activeTab === "home"
          ? "OpenSocial"
          : activeTab === "chats"
            ? "Chats"
            : activeTab === "activity"
              ? "Activity"
              : "Profile"
      }
      unreadChatsCount={unreadChatsCount}
      visibleBanner={visibleBanner}
      onPressSettings={() => {
        hapticSelection();
        transientRouteActions.openSettings();
      }}
    />
  );
}
