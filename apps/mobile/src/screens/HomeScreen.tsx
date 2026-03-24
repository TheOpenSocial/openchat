import {
  agentThreadMessagesToTranscript,
  extractResponseTokenDelta,
} from "@opensocial/types";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Keyboard, KeyboardAvoidingView, Platform, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";

import {
  api,
  buildAgentThreadStreamUrl,
  ChatMessageRecord,
  PendingIntentsSummaryResponse,
  isOfflineApiError,
  isRetryableApiError,
} from "../lib/api";
import { openAgentThreadSse } from "../lib/agent-thread-sse";
import { type AppLocale, supportedLocales, t } from "../i18n/strings";
import {
  loadStoredChats,
  saveStoredChats,
  type StoredChatThread,
} from "../lib/chat-storage";
import { trackTelemetryEvent, type TelemetryEventName } from "../lib/telemetry";
import { createRealtimeSession, type RealtimeSession } from "../lib/realtime";
import { AnimatedScreen } from "../components/AnimatedScreen";
import { AppShell } from "../components/AppShell";
import { DevOrb } from "../components/DevOrb";
import { InlineNotice } from "../components/InlineNotice";
import { hapticImpact, hapticSelection } from "../lib/haptics";
import {
  loadOfflineOutbox,
  processOfflineOutbox,
  queueOfflineComposerSend,
} from "../lib/offline-outbox";
import { useNetworkOnline } from "../lib/use-network-online";
import { usePrimaryAgentThread } from "../lib/use-primary-agent-thread";
import {
  DESIGN_MOCK_AGENT_TIMELINE,
  DESIGN_MOCK_CHATS,
} from "../mocks/design-fixtures";
import { MobileSession, UserProfileDraft } from "../types";
import { HomeAgentThreadScreen } from "./HomeAgentThreadScreen";
import { ProfileScreen } from "./ProfileScreen";
import { ChatsListScreen } from "./ChatsListScreen";
import { useHomeShellStore } from "../store/home-shell-store";
import { useHomeThreadStore } from "../store/home-thread-store";
import { useChatsStore } from "../store/chats-store";

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

type LocalDeliveryStatus = "sending" | "queued" | "failed";

type LocalChatMessageRecord = ChatMessageRecord & {
  deliveryStatus?: LocalDeliveryStatus;
};

type LocalChatThread = Omit<StoredChatThread, "messages"> & {
  messages: LocalChatMessageRecord[];
};

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
  void initialProfile;
  void onProfileUpdated;
  void onResetSession;
  const insets = useSafeAreaInsets();
  const [locale, setLocale] = useState<AppLocale>("en");
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const enableE2ELocalMode =
    process.env.EXPO_PUBLIC_ENABLE_E2E_LOCAL_MODE === "1";
  const skipNetwork = designMock;
  const activeTab = useHomeShellStore((store) => store.activeTab);
  const setActiveTab = useHomeShellStore((store) => store.setActiveTab);
  const intentAbortRef = useRef<AbortController | null>(null);
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
  const newChatType = useChatsStore((store) => store.newChatType);
  const setNewChatType = useChatsStore((store) => store.setNewChatType);
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
  const [pendingIntentSummary, setPendingIntentSummary] =
    useState<PendingIntentsSummaryResponse | null>(null);
  const [, setSelectedExplainedIntentId] = useState<string | null>(null);
  const homeLayoutDebug = false;
  const bottomComposerInset = Math.max(insets.bottom, 12);
  const composerBottomInset = keyboardVisible ? 0 : bottomComposerInset;
  const shellContentBottomInset =
    activeTab === "profile" ? composerBottomInset : 0;
  const showDevOrb = __DEV__ || process.env.EXPO_PUBLIC_ENABLE_DEV_ORB === "1";
  const DEV_ORB_UNLOCK_WINDOW_MS = 10 * 60 * 1000;

  useEffect(() => {
    setAgentTimeline(
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
    setChats(designMock ? [...DESIGN_MOCK_CHATS] : []);
    setSelectedChatId(
      designMock && DESIGN_MOCK_CHATS[0] ? DESIGN_MOCK_CHATS[0].id : null,
    );
    setChatStorageReady(designMock);
    setRealtimeState(designMock ? "connected" : "offline");
  }, [
    designMock,
    setAgentTimeline,
    setChatStorageReady,
    setChats,
    setRealtimeState,
    setSelectedChatId,
  ]);

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

  const recordTelemetry = useCallback(
    (name: TelemetryEventName, properties?: Record<string, unknown>) => {
      void trackTelemetryEvent(session.userId, name, properties).catch(
        () => {},
      );
    },
    [session.userId],
  );

  useEffect(() => {
    chatsRef.current = chats;
  }, [chats]);

  useEffect(() => {
    selectedChatIdRef.current = selectedChatId;
  }, [selectedChatId]);

  useEffect(() => {
    const showEvent =
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent =
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const onShow = Keyboard.addListener(showEvent, () => {
      setKeyboardVisible(true);
    });
    const onHide = Keyboard.addListener(hideEvent, () => {
      setKeyboardVisible(false);
    });
    return () => {
      onShow.remove();
      onHide.remove();
    };
  }, []);

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
      const knownChatIds = new Set(chatsRef.current.map((thread) => thread.id));
      for (const chatId of result.sentThreadIds) {
        if (!knownChatIds.has(chatId)) {
          continue;
        }
        await syncChatThread(chatId, { quiet: true });
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
    syncChatThread,
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
    let failures = 0;
    for (const chatId of chatIds) {
      const ok = await syncChatThread(chatId, { quiet: true });
      if (!ok) {
        failures += 1;
      }
    }

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
    const chatId = selectedChat.id;
    const hadMessages = selectedChat.messages.length > 0;
    const hasCounterpartyMessage = selectedChat.messages.some(
      (message) => message.senderUserId !== session.userId,
    );
    const optimisticMessageId = `message_local_${Date.now().toString(36)}`;
    const optimisticMessage: LocalChatMessageRecord = {
      id: optimisticMessageId,
      chatId,
      senderUserId: session.userId,
      body: messageBody,
      createdAt: new Date().toISOString(),
      deliveryStatus: "sending",
    };

    setSendingChatMessage(true);
    setDraftChatMessage("");
    setChats((current) =>
      current.map((thread) =>
        thread.id === chatId
          ? {
              ...thread,
              messages: mergeChatMessages(thread.messages, [optimisticMessage]),
              highWatermark: optimisticMessage.createdAt,
              unreadCount: 0,
            }
          : thread,
      ),
    );
    if (localTypingStopTimeoutRef.current) {
      clearTimeout(localTypingStopTimeoutRef.current);
      localTypingStopTimeoutRef.current = null;
    }
    if (localTypingActiveRef.current) {
      realtimeSessionRef.current?.publishTyping(chatId, session.userId, false);
      localTypingActiveRef.current = false;
    }
    try {
      if (enableE2ELocalMode || designMock) {
        if (!hadMessages) {
          recordTelemetry("first_message_sent", {
            chatId,
            bodyLength: messageBody.length,
          });
        } else if (hasCounterpartyMessage) {
          recordTelemetry("message_replied", {
            chatId,
            bodyLength: messageBody.length,
          });
        }
        hapticImpact();
        return;
      }

      if (!netOnline) {
        throw new Error("offline");
      }

      const message = await api.createChatMessage(
        chatId,
        session.userId,
        messageBody,
        session.accessToken,
        {
          clientMessageId: createClientMessageId(),
        },
      );
      setChats((current) =>
        current.map((thread) =>
          thread.id === chatId
            ? {
                ...thread,
                messages: mergeChatMessages(
                  thread.messages.filter(
                    (item) => item.id !== optimisticMessageId,
                  ),
                  [message],
                ),
                highWatermark: message.createdAt,
                unreadCount: 0,
              }
            : thread,
        ),
      );
      realtimeSessionRef.current?.publishChatMessage(chatId, message);
      if (!hadMessages) {
        recordTelemetry("first_message_sent", {
          chatId,
          bodyLength: messageBody.length,
        });
      } else if (hasCounterpartyMessage) {
        recordTelemetry("message_replied", {
          chatId,
          bodyLength: messageBody.length,
        });
      }
      hapticImpact();
    } catch (error) {
      if (
        isOfflineApiError(error) ||
        isRetryableApiError(error) ||
        !netOnline
      ) {
        await queueOfflineComposerSend({
          userId: session.userId,
          mode: "chat",
          threadId: chatId,
          text: messageBody,
          idempotencyKey: createClientMessageId(),
        });
        await refreshPendingOutboxCount().catch(() => {});
        setChats((current) =>
          current.map((thread) =>
            thread.id === chatId
              ? {
                  ...thread,
                  messages: thread.messages.map((message) =>
                    message.id === optimisticMessageId
                      ? { ...message, deliveryStatus: "queued" }
                      : message,
                  ),
                }
              : thread,
          ),
        );
        setBanner({
          tone: "info",
          text: "Message queued. It will send automatically when network is back.",
        });
        return;
      }
      setChats((current) =>
        current.map((thread) =>
          thread.id === chatId
            ? {
                ...thread,
                messages: thread.messages.map((message) =>
                  message.id === optimisticMessageId
                    ? { ...message, deliveryStatus: "failed" }
                    : message,
                ),
              }
            : thread,
        ),
      );
      setBanner({
        tone: "error",
        text: `Failed to send message: ${String(error)}`,
      });
    } finally {
      setSendingChatMessage(false);
    }
  };

  const retryFailedChatMessage = useCallback(
    async (chatId: string, messageId: string) => {
      const thread = chatsRef.current.find((item) => item.id === chatId);
      const failedMessage = thread?.messages.find(
        (item) =>
          item.id === messageId &&
          item.senderUserId === session.userId &&
          item.deliveryStatus === "failed",
      );
      if (!failedMessage) {
        return;
      }

      setChats((current) =>
        current.map((item) =>
          item.id === chatId
            ? {
                ...item,
                messages: item.messages.map((message) =>
                  message.id === messageId
                    ? { ...message, deliveryStatus: "sending" }
                    : message,
                ),
              }
            : item,
        ),
      );

      try {
        if (!netOnline) {
          throw new Error("offline");
        }
        const sent = await api.createChatMessage(
          chatId,
          session.userId,
          failedMessage.body,
          session.accessToken,
          {
            clientMessageId: createClientMessageId(),
          },
        );
        setChats((current) =>
          current.map((item) =>
            item.id === chatId
              ? {
                  ...item,
                  messages: mergeChatMessages(
                    item.messages.filter((message) => message.id !== messageId),
                    [sent],
                  ),
                  highWatermark: sent.createdAt,
                }
              : item,
          ),
        );
        realtimeSessionRef.current?.publishChatMessage(chatId, sent);
      } catch (error) {
        if (
          isOfflineApiError(error) ||
          isRetryableApiError(error) ||
          !netOnline
        ) {
          await queueOfflineComposerSend({
            userId: session.userId,
            mode: "chat",
            threadId: chatId,
            text: failedMessage.body,
            idempotencyKey: createClientMessageId(),
          });
          await refreshPendingOutboxCount().catch(() => {});
          setChats((current) =>
            current.map((item) =>
              item.id === chatId
                ? {
                    ...item,
                    messages: item.messages.map((message) =>
                      message.id === messageId
                        ? { ...message, deliveryStatus: "queued" }
                        : message,
                    ),
                  }
                : item,
            ),
          );
          setBanner({
            tone: "info",
            text: "Message queued. It will retry automatically when network is back.",
          });
          return;
        }
        setChats((current) =>
          current.map((item) =>
            item.id === chatId
              ? {
                  ...item,
                  messages: item.messages.map((message) =>
                    message.id === messageId
                      ? { ...message, deliveryStatus: "failed" }
                      : message,
                  ),
                }
              : item,
          ),
        );
        setBanner({
          tone: "error",
          text: `Retry failed: ${String(error)}`,
        });
      }
    },
    [netOnline, refreshPendingOutboxCount, session.accessToken, session.userId],
  );

  if (homeLayoutDebug) {
    return <View className="flex-1 bg-red-600" testID="home-layout-debug" />;
  }

  return (
    <SafeAreaView
      className="flex-1 bg-canvas"
      edges={[]}
      style={{ flex: 1, backgroundColor: "#050506" }}
      testID="home-screen"
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        className="flex-1"
        keyboardVerticalOffset={0}
        style={{ flex: 1 }}
      >
        <View
          className="flex-1"
          style={{ flex: 1, backgroundColor: "#050506" }}
        >
          {visibleBanner && activeTab !== "home" ? (
            <View className="px-5 pt-3">
              <InlineNotice
                text={visibleBanner.text}
                tone={visibleBanner.tone}
              />
            </View>
          ) : null}
          {!skipNetwork && !netOnline && activeTab !== "home" ? (
            <View className="px-5 pt-3">
              <InlineNotice text={t("offlineNotice", locale)} tone="info" />
            </View>
          ) : null}

          <AppShell
            activeTab={activeTab}
            hasNotifications={pendingOutboxCount > 0}
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
            title={
              activeTab === "home"
                ? "OpenSocial"
                : activeTab === "chats"
                  ? "Chats"
                  : "Profile"
            }
          >
            <View
              className="min-h-0 flex-1"
              style={{ paddingBottom: shellContentBottomInset, paddingTop: 14 }}
            >
              <AnimatedScreen screenKey={activeTab}>
                {activeTab === "home" ? (
                  <HomeAgentThreadScreen
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
                    onDecomposeIntentChange={setDecomposeIntent}
                    onDecomposeMaxIntentsChange={setDecomposeMaxIntents}
                    onExecuteOnboardingCarryover={executeOnboardingCarryover}
                    onOpenChatsTab={() => {
                      hapticSelection();
                      setActiveTab("chats");
                    }}
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
                  <ChatsListScreen
                    currentUserId={session.userId}
                    draftChatMessage={draftChatMessage}
                    e2eSubmitOnReturn={enableE2ELocalMode}
                    loadingMessages={
                      selectedChatId != null &&
                      Boolean(syncingChats[selectedChatId])
                    }
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
                ) : null}
                {activeTab === "profile" ? (
                  <ProfileScreen
                    displayName={session.displayName}
                    email={session.email}
                  />
                ) : null}
              </AnimatedScreen>
            </View>
          </AppShell>
          <DevOrb
            bottomOffset={composerBottomInset + 14}
            onCreateDmSandbox={async () => {
              setNewChatType("dm");
              await createDemoChat();
            }}
            onCreateGroupSandbox={async () => {
              setNewChatType("group");
              await createDemoChat();
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
              if (devOrbUnlocked) {
                setDevOrbOpen(!devOrbOpen);
              }
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
            visible={showDevOrb && activeTab !== "home"}
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function mergeChatMessages(
  existing: LocalChatMessageRecord[],
  incoming: ChatMessageRecord[],
) {
  const dedupedById = new Map<string, LocalChatMessageRecord>();
  for (const message of [...existing, ...incoming]) {
    dedupedById.set(message.id, message);
  }

  const sorted = Array.from(dedupedById.values()).sort((left, right) => {
    const leftTimestamp = Date.parse(left.createdAt);
    const rightTimestamp = Date.parse(right.createdAt);
    const leftTime = Number.isFinite(leftTimestamp) ? leftTimestamp : 0;
    const rightTime = Number.isFinite(rightTimestamp) ? rightTimestamp : 0;
    if (leftTime !== rightTime) {
      return leftTime - rightTime;
    }
    return left.id.localeCompare(right.id);
  });

  const remoteFingerprintSet = new Set(
    sorted
      .filter((message) => message.deliveryStatus == null)
      .map((message) => fingerprintMessage(message)),
  );

  return sorted.filter((message) => {
    if (message.deliveryStatus == null) {
      return true;
    }
    return !remoteFingerprintSet.has(fingerprintMessage(message));
  });
}

function fingerprintMessage(message: {
  chatId: string;
  senderUserId: string;
  body: string;
}) {
  return [
    message.chatId,
    message.senderUserId,
    message.body.trim().toLowerCase(),
  ].join("::");
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
