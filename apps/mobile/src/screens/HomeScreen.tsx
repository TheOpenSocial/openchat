import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  api,
  type ChatMessageRecord,
  type ChatMetadataRecord,
  type PendingIntentsSummaryResponse,
} from "../lib/api";
import { t } from "../i18n/strings";
import { type RealtimeSession } from "../lib/realtime";
import { DevOrb } from "../components/DevOrb";
import { hapticSelection } from "../lib/haptics";
import {
  loadStoredActivitySummary,
  loadStoredHomeSummary,
  saveStoredHomeSummary,
} from "../lib/experience-storage";
import { loadOfflineOutbox } from "../lib/offline-outbox";
import { clearStoredChats } from "../lib/chat-storage";
import { useNetworkOnline } from "../lib/use-network-online";
import { usePrimaryAgentThread } from "../lib/use-primary-agent-thread";
import { useKeyboardVisible } from "../hooks/useKeyboardVisible";
import {
  AgentTimelineMessage,
  HomeTab,
  MobileSession,
  UserProfileDraft,
} from "../types";
import { HomeAgentThreadScreen } from "./HomeAgentThreadScreen";
import { ActivityScreen } from "./ActivityScreen";
import { ChatsListScreen } from "./ChatsListScreen";
import { ProfileScreen } from "./ProfileScreen";
import { HomeScreenLayout } from "./home/HomeScreenLayout";
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
import { E2ENavRail } from "../features/debug/components/E2ENavRail";

export interface HomeScreenProps {
  session: MobileSession;
  initialProfile: UserProfileDraft;
  onProfileUpdated: (profile: UserProfileDraft) => void;
  onResetSession: () => Promise<void>;
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

function getE2EScreenTestID(activeTab: HomeTab, routeKind: string | null) {
  switch (routeKind) {
    case "activity":
      return "activity-screen";
    case "connections":
      return "connections-screen";
    case "discovery":
      return "discovery-screen";
    case "inbox":
      return "inbox-screen";
    case "intent":
      return "intent-detail-screen";
    case "otherProfile":
      return "other-profile-screen";
    case "recurringCircles":
      return "recurring-circles-screen";
    case "savedSearches":
      return "saved-searches-screen";
    case "scheduledTasks":
      return "scheduled-tasks-screen";
    case "settings":
      return "settings-screen";
    default:
      break;
  }

  switch (activeTab) {
    case "activity":
      return "activity-screen";
    case "chats":
      return "chats-screen";
    case "profile":
      return "profile-screen";
    case "home":
    default:
      return "home-screen";
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
      id: "seed_primary_agent_prompt",
      role: "agent",
      body: t("homeAgentSeedPrompt", locale),
    },
  ];
}

function shouldShowSeedPrompt(
  pendingIntentSummary: PendingIntentsSummaryResponse | null,
) {
  if (!pendingIntentSummary) {
    return true;
  }
  if (pendingIntentSummary.activeIntentCount > 0) {
    return false;
  }
  if (pendingIntentSummary.summaryText.trim().length > 0) {
    return false;
  }
  return !pendingIntentSummary.intents.some(
    (intent) =>
      intent.requests.pending > 0 ||
      intent.requests.accepted > 0 ||
      intent.requests.rejected > 0 ||
      intent.requests.expired > 0 ||
      intent.requests.cancelled > 0,
  );
}

export function HomeScreen({
  initialAgentMessage = null,
  initialProfile,
  onInitialAgentMessageConsumed,
  onProfileUpdated,
  onResetSession,
  session,
}: HomeScreenProps) {
  const showE2ENavRail =
    __DEV__ || Boolean(process.env.EXPO_PUBLIC_E2E_SESSION_B64?.trim());
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
  const skipNetwork = false;
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
  const resetHomeThread = useHomeThreadStore((store) => store.resetHomeThread);
  const banner = useHomeShellStore((store) => store.banner);
  const setBanner = useHomeShellStore((store) => store.setBanner);
  const homeSummary = useHomeShellStore((store) => store.homeSummary);
  const setHomeSummary = useHomeShellStore((store) => store.setHomeSummary);
  const setBootstrapHydratedAt = useHomeShellStore(
    (store) => store.setBootstrapHydratedAt,
  );
  const resetShell = useHomeShellStore((store) => store.resetShell);
  const setActivityState = useActivityStore((store) => store.setActivityState);
  const resetActivity = useActivityStore((store) => store.resetActivity);
  const chats = useChatsStore((store) => store.chats);
  const setChats = useChatsStore((store) => store.setChats);
  const resetChats = useChatsStore((store) => store.resetChats);
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
  const showDevOrb =
    !showE2ENavRail &&
    (__DEV__ || process.env.EXPO_PUBLIC_ENABLE_DEV_ORB === "1");
  const DEV_ORB_UNLOCK_WINDOW_MS = 10 * 60 * 1000;
  const activityHasUnread = useActivityStore((store) => store.hasUnread);
  const shellUnreadNotifications = Math.max(
    0,
    homeSummary?.counts.unreadNotifications ?? 0,
  );
  const nonChatRealtimeCallbacks = useNonChatRealtimeController({
    setBanner,
  });
  const showPushDebug =
    __DEV__ || process.env.EXPO_PUBLIC_ENABLE_PUSH_DEBUG === "1";
  const {
    actions: transientRouteActions,
    routeKind: transientRouteKind,
    transientScreen,
  } = useHomeTransientRoutes({
    initialProfile,
    onProfileUpdated,
    session,
    setActiveTab,
    setSelectedChatId,
  });
  const currentE2EScreenTestID = getE2EScreenTestID(
    activeTab,
    transientRouteKind,
  );
  const { push, pushDebug } = usePushLifecycle({
    enabled: true,
    onRouteIntent: transientRouteActions.handlePushRouteIntent,
    userId: session.userId,
  });

  useEffect(() => {
    let active = true;

    void loadStoredHomeSummary(session.userId)
      .then((stored) => {
        if (active && stored) {
          setHomeSummary(stored);
        }
      })
      .catch(() => {});

    void loadStoredActivitySummary(session.userId)
      .then((stored) => {
        if (!active || !stored) {
          return;
        }
        setActivityState({
          hasUnread:
            stored.counts.pendingRequests > 0 ||
            stored.counts.unreadNotifications > 0,
          lastHydratedAt: stored.generatedAt,
          pendingRequestCount: stored.counts.pendingRequests,
          unreadNotificationCount: stored.counts.unreadNotifications,
        });
      })
      .catch(() => {});

    if (skipNetwork) {
      return () => {
        active = false;
      };
    }

    void api
      .getExperienceBootstrapSummary(session.userId, session.accessToken)
      .then((bootstrap) => {
        if (!active) {
          return;
        }
        setHomeSummary(bootstrap.home);
        setActivityState({
          hasUnread:
            bootstrap.activity.counts.pendingRequests > 0 ||
            bootstrap.activity.counts.unreadNotifications > 0,
          lastHydratedAt: bootstrap.generatedAt,
          pendingRequestCount: bootstrap.activity.counts.pendingRequests,
          unreadNotificationCount:
            bootstrap.activity.counts.unreadNotifications,
        });
        setBootstrapHydratedAt(bootstrap.generatedAt);
        void saveStoredHomeSummary(session.userId, bootstrap.home).catch(
          () => {},
        );
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, [
    session.accessToken,
    session.userId,
    setActivityState,
    setBootstrapHydratedAt,
    setHomeSummary,
    skipNetwork,
  ]);

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
  const sessionFingerprintRef = useRef<string | null>(null);

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
  const [agentThreadLoadError, setAgentThreadLoadError] = useState<
    string | null
  >(null);
  const netOnline = useNetworkOnline(skipNetwork);
  const canSeedPrimaryPrompt = useMemo(
    () => shouldShowSeedPrompt(pendingIntentSummary),
    [pendingIntentSummary],
  );

  useEffect(() => {
    const nextFingerprint = `${session.userId}:${session.sessionId}`;
    if (sessionFingerprintRef.current === nextFingerprint) {
      return;
    }
    sessionFingerprintRef.current = nextFingerprint;
    resetShell();
    resetActivity();
    resetHomeThread();
    resetChats();
    void clearStoredChats(session.userId).catch(() => {});
  }, [
    resetChats,
    resetActivity,
    resetHomeThread,
    resetShell,
    session.sessionId,
    session.userId,
  ]);

  const refreshPendingOutboxCount = useCallback(async () => {
    if (skipNetwork) {
      setPendingOutboxCount(0);
      return;
    }
    const pending = await loadOfflineOutbox(session.userId);
    setPendingOutboxCount(pending.length);
  }, [session.userId, skipNetwork]);
  const agentThreadSyncEnabled = !skipNetwork;
  const {
    loading: agentThreadLoading,
    threadId: agentThreadId,
    reload: reloadPrimaryAgentThread,
  } = usePrimaryAgentThread({
    accessToken: session.accessToken,
    enabled: agentThreadSyncEnabled,
    preferredThreadId: null,
    onHydrated: (messages) => {
      setAgentThreadLoadError(null);
      if (messages.length > 0) {
        setAgentTimeline(messages);
        return;
      }
      setAgentTimeline(
        canSeedPrimaryPrompt ? buildSeedAgentTimeline(locale) : [],
      );
    },
    onLoadError: () => {
      setAgentThreadLoadError(t("homeThreadLoadFailedTitle", locale));
      setBanner({
        tone: "error",
        text: t("homeThreadLoadFailedTitle", locale),
      });
    },
  });
  const homeRuntimeViewModel = useMemo(
    () =>
      deriveHomeRuntimeViewModel({
        messages: agentTimeline,
        pending: pendingIntentSummary,
        sending: sendingIntent,
        threadLoading: agentThreadLoading,
        hasDraft: draftIntentText.trim().length > 0,
        hasError: Boolean(agentThreadLoadError),
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
    if (
      agentThreadLoading ||
      agentTimeline.length > 0 ||
      onboardingCarryoverState === "processing" ||
      !canSeedPrimaryPrompt
    ) {
      return;
    }
    setAgentTimeline(buildSeedAgentTimeline(locale));
  }, [
    agentThreadLoading,
    agentTimeline.length,
    canSeedPrimaryPrompt,
    locale,
    onboardingCarryoverState,
    setAgentTimeline,
  ]);

  const retryPrimaryAgentConversation = useCallback(() => {
    setAgentThreadLoadError(null);
    reloadPrimaryAgentThread();
  }, [reloadPrimaryAgentThread]);

  useEffect(() => {
    void refreshPendingOutboxCount().catch(() => {});
  }, [refreshPendingOutboxCount]);

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
    accessToken: session.accessToken,
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
    return (
      <View className="flex-1">
        {transientScreen}
        <E2ENavRail
          currentScreenTestID={currentE2EScreenTestID}
          onOpenActivity={() => {
            hapticSelection();
            transientRouteActions.closeAll();
            setActiveTab("activity");
          }}
          onOpenChats={() => {
            hapticSelection();
            transientRouteActions.closeAll();
            setActiveTab("chats");
          }}
          onOpenConnections={() => {
            hapticSelection();
            transientRouteActions.openConnections();
          }}
          onOpenDiscovery={() => {
            hapticSelection();
            transientRouteActions.openDiscovery();
          }}
          onOpenHome={() => {
            hapticSelection();
            transientRouteActions.closeAll();
            setActiveTab("home");
          }}
          onOpenInbox={() => {
            hapticSelection();
            transientRouteActions.openInbox();
          }}
          onOpenPeerProfile={() => {
            hapticSelection();
            transientRouteActions.openProfileFromDiscovery("e2e-peer-user");
          }}
          onOpenProfile={() => {
            hapticSelection();
            transientRouteActions.closeAll();
            setActiveTab("profile");
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
          onOpenSettings={() => {
            hapticSelection();
            transientRouteActions.openSettings();
          }}
          visible={showE2ENavRail}
        />
      </View>
    );
  }

  return (
    <HomeScreenLayout
      activeTab={activeTab}
      chatsContent={
        <ChatsListScreen
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
      activityContent={
        <ActivityScreen
          accessToken={session.accessToken}
          onClose={() => {
            hapticSelection();
            setActiveTab("home");
          }}
          onOpenConnections={transientRouteActions.openConnections}
          onOpenDiscovery={transientRouteActions.openDiscovery}
          onOpenInbox={transientRouteActions.openInbox}
          onOpenIntentDetail={transientRouteActions.openIntentDetail}
          onOpenRecurringCircles={transientRouteActions.openRecurringCircles}
          onOpenSavedSearches={transientRouteActions.openSavedSearches}
          onOpenScheduledTasks={transientRouteActions.openScheduledTasks}
          userId={session.userId}
        />
      }
      hasNotifications={
        activityHasUnread ||
        Boolean(agentThreadLoadError) ||
        pendingOutboxCount > 0 ||
        shellUnreadNotifications > 0
      }
      homeContent={
        <HomeAgentThreadScreen
          agentImageUrl={agentImageUrlDraft}
          canRegenerate={agentTimeline.some(
            (message) => message.role === "user",
          )}
          composerMode={agentComposerMode}
          composerBottomOffset={keyboardVisible ? 0 : tabBarHeight - 4}
          decomposeIntent={decomposeIntent}
          decomposeMaxIntents={decomposeMaxIntents}
          draftMessage={draftIntentText}
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
          threadLoading={agentThreadLoading}
          threadLoadErrorMessage={agentThreadLoadError}
          onRetryThreadLoad={retryPrimaryAgentConversation}
          onDismissWelcomeSheet={dismissWelcomeSheet}
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
        transientRouteActions.closeAll();
        setActiveTab("activity");
      }}
      onTabChange={(tab) => {
        hapticSelection();
        setActiveTab(tab);
      }}
      overlay={
        <>
          <E2ENavRail
            currentScreenTestID={currentE2EScreenTestID}
            onOpenActivity={() => {
              hapticSelection();
              transientRouteActions.closeAll();
              setActiveTab("activity");
            }}
            onOpenChats={() => {
              hapticSelection();
              transientRouteActions.closeAll();
              setActiveTab("chats");
            }}
            onOpenConnections={() => {
              hapticSelection();
              transientRouteActions.openConnections();
            }}
            onOpenDiscovery={() => {
              hapticSelection();
              transientRouteActions.openDiscovery();
            }}
            onOpenHome={() => {
              hapticSelection();
              transientRouteActions.closeAll();
              setActiveTab("home");
            }}
            onOpenInbox={() => {
              hapticSelection();
              transientRouteActions.openInbox();
            }}
            onOpenPeerProfile={() => {
              hapticSelection();
              transientRouteActions.openProfileFromDiscovery("e2e-peer-user");
            }}
            onOpenProfile={() => {
              hapticSelection();
              transientRouteActions.closeAll();
              setActiveTab("profile");
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
            onOpenSettings={() => {
              hapticSelection();
              transientRouteActions.openSettings();
            }}
            visible={showE2ENavRail}
          />
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
        <ProfileScreen
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
