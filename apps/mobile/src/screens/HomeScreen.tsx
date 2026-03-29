import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Text, View } from "react-native";
import Animated, { FadeInRight } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ChatMessageRecord } from "../lib/api";
import { t } from "../i18n/strings";
import { type RealtimeSession } from "../lib/realtime";
import { DevOrb } from "../components/DevOrb";
import { hapticSelection } from "../lib/haptics";
import { loadOfflineOutbox } from "../lib/offline-outbox";
import { useNetworkOnline } from "../lib/use-network-online";
import { usePrimaryAgentThread } from "../lib/use-primary-agent-thread";
import { useKeyboardVisible } from "../hooks/useKeyboardVisible";
import { MobileSession, UserProfileDraft } from "../types";
import { HomeAgentThreadScreen } from "./HomeAgentThreadScreen";
import { ActivityScreen } from "./ActivityScreen";
import { ConnectionsScreen } from "./ConnectionsScreen";
import { DiscoveryScreen } from "./DiscoveryScreen";
import { InboxScreen } from "./InboxScreen";
import { IntentDetailScreen } from "./IntentDetailScreen";
import { RecurringCirclesScreen } from "./RecurringCirclesScreen";
import { SavedSearchesScreen } from "./SavedSearchesScreen";
import { ScheduledTasksScreen } from "./ScheduledTasksScreen";
import {
  OtherUserProfileScreen,
  type OtherProfileContext,
} from "./OtherUserProfileScreen";
import { ProfileScreen } from "./ProfileScreen";
import { SettingsScreen } from "./SettingsScreen";
import { ChatsListScreen } from "./ChatsListScreen";
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
import { useActivityIndicator } from "../features/activity/hooks/useActivityIndicator";
import {
  usePushLifecycle,
  type PushRouteIntent,
} from "../features/notifications/hooks/usePushLifecycle";
import { useNonChatRealtimeController } from "../features/realtime/hooks/useNonChatRealtimeController";
import { useActivityStore } from "../store/activity-store";
import { useHomeShellStore } from "../store/home-shell-store";
import { useHomeThreadStore } from "../store/home-thread-store";
import { useChatsStore } from "../store/chats-store";

const HOME_SHELL_BACKGROUND_COLOR = "#212121";
const HOME_SHELL_CONTAINER_STYLE = {
  flex: 1,
  backgroundColor: HOME_SHELL_BACKGROUND_COLOR,
} as const;
const FULL_SCREEN_STYLE = { flex: 1 } as const;

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

export function HomeScreen({
  initialAgentMessage = null,
  initialProfile,
  onInitialAgentMessageConsumed,
  onProfileUpdated,
  onResetSession,
  session,
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
  const [otherProfileTarget, setOtherProfileTarget] = useState<{
    userId: string;
    context: OtherProfileContext;
  } | null>(null);
  const [activityOpen, setActivityOpen] = useState(false);
  const [inboxOpen, setInboxOpen] = useState(false);
  const [connectionsOpen, setConnectionsOpen] = useState(false);
  const [discoveryOpen, setDiscoveryOpen] = useState(false);
  const [recurringCirclesOpen, setRecurringCirclesOpen] = useState(false);
  const [savedSearchesOpen, setSavedSearchesOpen] = useState(false);
  const [scheduledTasksOpen, setScheduledTasksOpen] = useState(false);
  const [intentDetailIntentId, setIntentDetailIntentId] = useState<
    string | null
  >(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const activityHasUnread = useActivityStore((store) => store.hasUnread);
  const nonChatRealtimeCallbacks = useNonChatRealtimeController({
    setBanner,
  });
  const showPushDebug =
    __DEV__ || process.env.EXPO_PUBLIC_ENABLE_PUSH_DEBUG === "1";

  const renderTransientScreen = useCallback(
    (screen: React.ReactNode, options?: { animated?: boolean }) => {
      if (options?.animated === false) {
        return screen;
      }

      return (
        <View className="flex-1 bg-canvas" style={HOME_SHELL_CONTAINER_STYLE}>
          <Animated.View
            entering={FadeInRight.duration(220)}
            style={FULL_SCREEN_STYLE}
          >
            {screen}
          </Animated.View>
        </View>
      );
    },
    [],
  );

  const closeTransientRoutes = useCallback(() => {
    setActivityOpen(false);
    setConnectionsOpen(false);
    setDiscoveryOpen(false);
    setInboxOpen(false);
    setRecurringCirclesOpen(false);
    setSavedSearchesOpen(false);
    setScheduledTasksOpen(false);
    setIntentDetailIntentId(null);
    setSettingsOpen(false);
    setOtherProfileTarget(null);
  }, []);

  const handlePushRouteIntent = useCallback(
    (intent: PushRouteIntent) => {
      closeTransientRoutes();

      switch (intent.kind) {
        case "activity":
          setActivityOpen(true);
          break;
        case "connections":
          setConnectionsOpen(true);
          break;
        case "discovery":
          setDiscoveryOpen(true);
          break;
        case "home":
          setActiveTab("home");
          break;
        case "inbox":
          setInboxOpen(true);
          break;
        case "intent":
          setIntentDetailIntentId(intent.intentId);
          break;
        case "profile":
          if (intent.userId === session.userId) {
            setActiveTab("profile");
            break;
          }
          setOtherProfileTarget({
            userId: intent.userId,
            context: {
              source: "chat",
              reason: "Opened from a notification.",
            },
          });
          break;
        case "recurringCircles":
          setRecurringCirclesOpen(true);
          break;
        case "savedSearches":
          setSavedSearchesOpen(true);
          break;
        case "scheduledTasks":
          setScheduledTasksOpen(true);
          break;
        case "settings":
          setSettingsOpen(true);
          break;
        case "chat":
          setActiveTab("chats");
          setSelectedChatId(intent.chatId);
          break;
        default:
          break;
      }
    },
    [closeTransientRoutes, session.userId, setActiveTab, setSelectedChatId],
  );
  const { push, pushDebug } = usePushLifecycle({
    enabled: true,
    onRouteIntent: handlePushRouteIntent,
    userId: session.userId,
  });

  useActivityIndicator({
    accessToken: session.accessToken,
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
  const homeRuntimeViewModel = useMemo(
    () =>
      deriveHomeRuntimeViewModel({
        messages: agentTimeline,
        pending: pendingIntentSummary,
        sending: sendingIntent,
        threadLoading: agentThreadLoading,
        hasDraft: draftIntentText.trim().length > 0,
      }),
    [
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

  const selectedChat = useMemo(
    () => chats.find((chat) => chat.id === selectedChatId) ?? null,
    [chats, selectedChatId],
  );
  const typingUsers = useMemo(
    () => (selectedChatId ? (typingUsersByChat[selectedChatId] ?? []) : []),
    [selectedChatId, typingUsersByChat],
  );

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
    handleDraftChatMessageChange,
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

  if (settingsOpen) {
    return renderTransientScreen(
      <SettingsScreen
        accessToken={session.accessToken}
        displayName={session.displayName}
        email={session.email}
        initialDraft={initialProfile}
        onClose={() => {
          setSettingsOpen(false);
        }}
        onProfileUpdated={onProfileUpdated}
        userId={session.userId}
      />,
    );
  }

  if (activityOpen) {
    return renderTransientScreen(
      <ActivityScreen
        accessToken={session.accessToken}
        onClose={() => {
          setActivityOpen(false);
        }}
        onOpenConnections={() => {
          setActivityOpen(false);
          setConnectionsOpen(true);
        }}
        onOpenDiscovery={() => {
          setActivityOpen(false);
          setDiscoveryOpen(true);
        }}
        onOpenInbox={() => {
          setActivityOpen(false);
          setInboxOpen(true);
        }}
        onOpenIntentDetail={(intentId) => {
          setActivityOpen(false);
          setIntentDetailIntentId(intentId);
        }}
        onOpenRecurringCircles={() => {
          setActivityOpen(false);
          setRecurringCirclesOpen(true);
        }}
        onOpenSavedSearches={() => {
          setActivityOpen(false);
          setSavedSearchesOpen(true);
        }}
        onOpenScheduledTasks={() => {
          setActivityOpen(false);
          setScheduledTasksOpen(true);
        }}
        userId={session.userId}
      />,
    );
  }

  if (connectionsOpen) {
    return renderTransientScreen(
      <ConnectionsScreen
        accessToken={session.accessToken}
        onClose={() => {
          setConnectionsOpen(false);
        }}
        onOpenChat={(chatId) => {
          setConnectionsOpen(false);
          setActiveTab("chats");
          setSelectedChatId(chatId);
        }}
        onOpenProfile={(targetUserId) => {
          setConnectionsOpen(false);
          setOtherProfileTarget({
            userId: targetUserId,
            context: {
              source: "chat",
              reason: "You are connected through an existing direct chat.",
            },
          });
        }}
        userId={session.userId}
      />,
    );
  }

  if (discoveryOpen) {
    return renderTransientScreen(
      <DiscoveryScreen
        accessToken={session.accessToken}
        onClose={() => {
          setDiscoveryOpen(false);
        }}
        onOpenProfile={(targetUserId) => {
          setDiscoveryOpen(false);
          setOtherProfileTarget({
            userId: targetUserId,
            context: {
              source: "request",
              reason:
                "Suggested from discovery as a strong match for your current intent.",
            },
          });
        }}
        userId={session.userId}
      />,
      { animated: false },
    );
  }

  if (recurringCirclesOpen) {
    return renderTransientScreen(
      <RecurringCirclesScreen
        accessToken={session.accessToken}
        onClose={() => {
          setRecurringCirclesOpen(false);
        }}
        userId={session.userId}
      />,
    );
  }

  if (savedSearchesOpen) {
    return renderTransientScreen(
      <SavedSearchesScreen
        accessToken={session.accessToken}
        onClose={() => {
          setSavedSearchesOpen(false);
        }}
        userId={session.userId}
      />,
    );
  }

  if (scheduledTasksOpen) {
    return renderTransientScreen(
      <ScheduledTasksScreen
        accessToken={session.accessToken}
        onClose={() => {
          setScheduledTasksOpen(false);
        }}
        userId={session.userId}
      />,
    );
  }

  if (intentDetailIntentId) {
    return renderTransientScreen(
      <IntentDetailScreen
        accessToken={session.accessToken}
        intentId={intentDetailIntentId}
        onClose={() => {
          setIntentDetailIntentId(null);
        }}
        userId={session.userId}
      />,
    );
  }

  if (inboxOpen) {
    return renderTransientScreen(
      <InboxScreen
        accessToken={session.accessToken}
        onClose={() => {
          setInboxOpen(false);
        }}
        onOpenIntentDetail={(intentId) => {
          setInboxOpen(false);
          setIntentDetailIntentId(intentId);
        }}
        onOpenProfile={(targetUserId) => {
          setInboxOpen(false);
          setOtherProfileTarget({
            userId: targetUserId,
            context: {
              source: "request",
              reason: "This person sent you a connection request.",
            },
          });
        }}
        userId={session.userId}
      />,
    );
  }

  return (
    <HomeScreenLayout
      activeTab={activeTab}
      chatsContent={
        <ChatsListScreen
          currentUserId={session.userId}
          draftChatMessage={draftChatMessage}
          loadingMessages={
            selectedChatId != null && Boolean(syncingChats[selectedChatId])
          }
          onOpenUserProfile={(input) => {
            hapticSelection();
            setOtherProfileTarget(input);
          }}
          onModerationBlock={async (targetUserId, chatId) => {
            await blockUser(targetUserId, { chatId });
          }}
          onModerationReport={async (targetUserId, chatId) => {
            await reportUser(targetUserId, { chatId });
          }}
          onOpenChat={openChat}
          onRetryFailedMessage={retryFailedChatMessage}
          onSendMessage={sendChatMessage}
          realtimeState={realtimeState}
          selectedChat={selectedChat}
          sendingMessage={sendingChatMessage}
          setDraftChatMessage={handleDraftChatMessageChange}
          threads={chats}
          typingUsers={typingUsers}
        />
      }
      hasNotifications={activityHasUnread || pendingOutboxCount > 0}
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
        setActivityOpen(true);
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
          {otherProfileTarget ? (
            <OtherUserProfileScreen
              accessToken={session.accessToken}
              context={otherProfileTarget.context}
              currentUserId={session.userId}
              onClose={() => {
                setOtherProfileTarget(null);
              }}
              onStartConversation={() => {
                setActiveTab("chats");
              }}
              targetUserId={otherProfileTarget.userId}
            />
          ) : null}
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
      onPressSettings={() => {
        hapticSelection();
        setSettingsOpen(true);
      }}
      shellContentBottomInset={shellContentBottomInset}
      skipNetwork={skipNetwork}
      title={
        activeTab === "home"
          ? "OpenSocial"
          : activeTab === "chats"
            ? "Chats"
            : "Profile"
      }
      unreadChatsCount={unreadChatsCount}
      visibleBanner={visibleBanner}
    />
  );
}
