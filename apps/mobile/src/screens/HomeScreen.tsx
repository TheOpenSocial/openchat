import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View } from "react-native";
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
import {
  OtherUserProfileScreen,
  type OtherProfileContext,
} from "./OtherUserProfileScreen";
import { ProfileScreen } from "./ProfileScreen";
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
import { useHomeShellStore } from "../store/home-shell-store";
import { useHomeThreadStore } from "../store/home-thread-store";
import { useChatsStore } from "../store/chats-store";

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
      hasNotifications={pendingOutboxCount > 0}
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
        setBanner({
          tone: "info",
          text: "No new notifications right now.",
        });
      }}
      onPressProfile={() => {
        hapticSelection();
        setActiveTab("profile");
      }}
      onTabChange={(tab) => {
        hapticSelection();
        setActiveTab(tab);
      }}
      overlay={
        <>
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
