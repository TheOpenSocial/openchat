import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  FlatList,
  type LayoutChangeEvent,
  LayoutAnimation,
  Platform,
  Pressable,
  ScrollView,
  Text,
  UIManager,
  View,
} from "react-native";

import { ChatTranscriptList } from "../components/ChatTranscriptList";
import type {
  ExperienceHomeSummaryResponse,
  PendingIntentsSummaryResponse,
} from "../lib/api";
import { hapticSelection } from "../lib/haptics";
import type { AppLocale } from "../i18n/strings";
import { t } from "../i18n/strings";
import type { TelemetryEventName } from "../lib/telemetry";
import type { AgentTimelineMessage } from "../types";
import type { HomeRuntimeViewModel } from "../screens/home/domain/types";
import { OpenChatComposer } from "./OpenChatComposer";
import { OpenChatHeader } from "./OpenChatHeader";
import { HomeStatusHeader } from "./HomeStatusHeader";
import { HomeSpotlightCards } from "./HomeSpotlightCards";
import { OpenChatWelcomeSheet } from "./OpenChatWelcomeSheet";
import { StarterPrompts } from "./StarterPrompts";
import { ThreadMessage } from "./ThreadMessage";
import { RUNTIME_SYSTEM_MESSAGE_PREFIX } from "./ThreadMessage";
import { ThreadStatusTransition } from "./ThreadStatusTransition";
import { useThreadRuntimePresentation } from "./useThreadRuntimePresentation";
import {
  deriveThreadRuntimeModel,
  hasUserTurn,
  type ThreadRuntimeState,
} from "./thread-types";

export type OpenChatScreenProps = {
  messages: AgentTimelineMessage[];
  draftMessage: string;
  setDraftMessage: (value: string) => void;
  onSend: (messageOverride?: string) => Promise<void>;
  onStop: () => void;
  onRegenerate: () => void;
  canRegenerate: boolean;
  sending: boolean;
  threadLoading: boolean;
  locale: AppLocale;
  composerMode: "chat" | "intent";
  onComposerModeChange: (mode: "chat" | "intent") => void;
  onVoiceTranscript?: (line: string) => void;
  agentImageUrl: string;
  onAgentImageUrlChange: (value: string) => void;
  decomposeIntent: boolean;
  decomposeMaxIntents: number;
  onDecomposeIntentChange: (value: boolean) => void;
  onDecomposeMaxIntentsChange: (value: number) => void;
  pendingIntentSummary: PendingIntentsSummaryResponse | null;
  homeSummary?: ExperienceHomeSummaryResponse | null;
  onPressHomeAction?: (
    action: ExperienceHomeSummaryResponse["status"]["nextAction"]["kind"],
  ) => void;
  onPressActivity?: () => void;
  onPressCoordination?: (targetChatId: string | null) => void;
  onPressLeadIntent?: (intentId: string) => void;
  onPressTopSuggestion?: (userId: string) => void;
  onboardingCarryover?: {
    seed: string;
    state: "processing" | "queued" | "ready";
  } | null;
  onExecuteOnboardingCarryover?: () => void;
  composerBottomOffset?: number;
  onRuntimeTelemetry?: (
    name: TelemetryEventName,
    properties?: Record<string, unknown>,
  ) => void;
  runtimeViewModel?: HomeRuntimeViewModel;
  threadLoadErrorMessage?: string | null;
  threadLoadRetryAttempt?: number;
  threadLoadRetrySeconds?: number | null;
  threadLoadWillAutoRetry?: boolean;
  welcomeSheetVisible?: boolean;
  onDismissWelcomeSheet?: () => void;
};

export function OpenChatScreen({
  agentImageUrl,
  canRegenerate,
  composerMode,
  decomposeIntent,
  decomposeMaxIntents,
  draftMessage,
  locale,
  messages,
  onAgentImageUrlChange,
  onComposerModeChange,
  onDecomposeIntentChange,
  onDecomposeMaxIntentsChange,
  onRegenerate,
  onSend,
  onStop,
  onVoiceTranscript,
  pendingIntentSummary,
  homeSummary = null,
  onPressHomeAction,
  onPressActivity,
  onPressCoordination,
  onPressLeadIntent,
  onPressTopSuggestion,
  sending,
  setDraftMessage,
  threadLoading,
  onboardingCarryover = null,
  onExecuteOnboardingCarryover,
  composerBottomOffset = 0,
  onRuntimeTelemetry,
  runtimeViewModel,
  threadLoadErrorMessage = null,
  threadLoadRetryAttempt = 0,
  threadLoadRetrySeconds = null,
  threadLoadWillAutoRetry = false,
  welcomeSheetVisible = false,
  onDismissWelcomeSheet,
}: OpenChatScreenProps) {
  void agentImageUrl;
  void canRegenerate;
  void composerMode;
  void decomposeIntent;
  void decomposeMaxIntents;
  void onAgentImageUrlChange;
  void onComposerModeChange;
  void onDecomposeIntentChange;
  void onDecomposeMaxIntentsChange;
  void onRegenerate;
  void onStop;
  const transcriptRef = useRef<FlatList<AgentTimelineMessage> | null>(null);
  const lastTranscriptLengthRef = useRef(0);
  const userActive = hasUserTurn(messages);
  const filteredMessages = useMemo(() => {
    const DEBUG_PATTERNS = [
      /planning agentic response/i,
      /risk check before tools/i,
      /simple-turn fast path selected/i,
      /synthesizing final response/i,
      /agentic turn completed/i,
    ];
    const LOW_SIGNAL_AGENT_PATTERNS = [
      /^got it\.?\s*i['’]?m finding people who fit this\.?$/i,
      /^got it\.?\s*i['’]?m looking for people who fit this\.?$/i,
      /^i['’]?m still looking\.?$/i,
      /^quick update:\s*/i,
    ];

    const nextMessages = messages.filter((m) => {
      if (m.role === "workflow") {
        return false;
      }
      const body = m.body?.trim() ?? "";
      if (!body) return false;
      if (DEBUG_PATTERNS.some((pattern) => pattern.test(body))) {
        return false;
      }
      if (
        m.role === "agent" &&
        LOW_SIGNAL_AGENT_PATTERNS.some((pattern) => pattern.test(body))
      ) {
        return false;
      }
      return true;
    });

    return nextMessages.filter((message, index) => {
      const previous = nextMessages[index - 1];
      if (!previous || previous.role !== message.role) {
        return true;
      }
      return previous.body.trim() !== message.body.trim();
    });
  }, [messages]);
  const hasTranscriptMessages = filteredMessages.length > 0;

  const rawRuntime = useMemo(() => {
    const derived = deriveThreadRuntimeModel(
      filteredMessages,
      pendingIntentSummary,
      sending,
      threadLoading,
    );
    if (!runtimeViewModel) {
      return derived;
    }
    const nextState: ThreadRuntimeState =
      runtimeViewModel.state === "error" ? "idle" : runtimeViewModel.state;
    return {
      ...derived,
      state: nextState,
      contextLabel: runtimeViewModel.contextLabel,
      hint: runtimeViewModel.hint,
      thinkingLabel: runtimeViewModel.thinkingLabel,
    };
  }, [
    filteredMessages,
    pendingIntentSummary,
    runtimeViewModel,
    sending,
    threadLoading,
  ]);

  const runtime = useThreadRuntimePresentation({
    onRuntimeTelemetry,
    rawRuntime,
  });

  const phase = runtime.phase;
  const transcriptMessages = useMemo(() => {
    const shouldShowRuntimeSystem =
      hasUserTurn(filteredMessages) &&
      (runtime.state === "matching" ||
        runtime.state === "sending" ||
        runtime.state === "loading");
    if (!shouldShowRuntimeSystem) {
      return filteredMessages;
    }
    const label = runtime.thinkingLabel?.trim() || "Working on it…";
    const runtimeMessage: AgentTimelineMessage = {
      id: "__runtime_system_status__",
      role: "system",
      body: `${RUNTIME_SYSTEM_MESSAGE_PREFIX}${label}`,
    };
    return [...filteredMessages, runtimeMessage];
  }, [filteredMessages, runtime.state, runtime.thinkingLabel]);

  useEffect(() => {
    if (Platform.OS === "android") {
      UIManager.setLayoutAnimationEnabledExperimental?.(true);
    }
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
  }, [filteredMessages.length]);

  const canSend =
    runtimeViewModel?.canSend ?? (draftMessage.trim().length > 0 && !sending);
  const showOnboardingCarryover =
    onboardingCarryover != null &&
    (phase === "empty" || phase === "active" || !userActive);
  const carryoverProcessing =
    showOnboardingCarryover && onboardingCarryover?.state === "processing";
  const showThreadLoadingState =
    threadLoading && !hasTranscriptMessages && !showOnboardingCarryover;
  const [composerOverlayHeight, setComposerOverlayHeight] = useState(154);
  const [atBottom, setAtBottom] = useState(true);
  const [pendingUpdates, setPendingUpdates] = useState(0);
  const welcomeOpacity = useRef(new Animated.Value(0)).current;
  const welcomeTranslateY = useRef(new Animated.Value(10)).current;
  const starterOpacity = useRef(new Animated.Value(0)).current;
  const starterTranslateY = useRef(new Animated.Value(14)).current;

  const composerInsetBottom = composerBottomOffset + 10;
  const transcriptBottomPadding =
    composerOverlayHeight + composerInsetBottom + 24;

  useEffect(() => {
    const previousLength = lastTranscriptLengthRef.current;
    const nextLength = transcriptMessages.length;
    lastTranscriptLengthRef.current = nextLength;

    if (nextLength <= previousLength) {
      return;
    }

    if (previousLength === 0) {
      return;
    }

    if (atBottom) {
      setPendingUpdates(0);
      requestAnimationFrame(() => {
        transcriptRef.current?.scrollToEnd({ animated: true });
      });
      return;
    }

    setPendingUpdates((current) => current + 1);
  }, [atBottom, transcriptMessages.length]);

  useEffect(() => {
    if (Platform.OS === "android") {
      UIManager.setLayoutAnimationEnabledExperimental?.(true);
    }
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
  }, [showOnboardingCarryover, onboardingCarryover?.state]);

  useEffect(() => {
    if (
      hasTranscriptMessages ||
      carryoverProcessing ||
      showOnboardingCarryover
    ) {
      welcomeOpacity.setValue(0);
      welcomeTranslateY.setValue(10);
      starterOpacity.setValue(0);
      starterTranslateY.setValue(14);
      return;
    }

    Animated.parallel([
      Animated.timing(welcomeOpacity, {
        duration: 240,
        toValue: 1,
        useNativeDriver: true,
      }),
      Animated.timing(welcomeTranslateY, {
        duration: 260,
        toValue: 0,
        useNativeDriver: true,
      }),
    ]).start();

    Animated.parallel([
      Animated.timing(starterOpacity, {
        delay: 70,
        duration: 240,
        toValue: 1,
        useNativeDriver: true,
      }),
      Animated.timing(starterTranslateY, {
        delay: 70,
        duration: 280,
        toValue: 0,
        useNativeDriver: true,
      }),
    ]).start();
  }, [
    carryoverProcessing,
    filteredMessages,
    hasTranscriptMessages,
    showOnboardingCarryover,
    starterOpacity,
    starterTranslateY,
    welcomeOpacity,
    welcomeTranslateY,
  ]);

  const onComposerLayout = (event: LayoutChangeEvent) => {
    const nextHeight = Math.ceil(event.nativeEvent.layout.height);
    if (Math.abs(nextHeight - composerOverlayHeight) > 2) {
      setComposerOverlayHeight(nextHeight);
    }
  };

  return (
    <View className="min-h-0 flex-1 bg-[#050506] px-5 pt-3">
      <OpenChatHeader locale={locale} showPresence={!userActive} />
      <HomeStatusHeader
        onPressAction={onPressHomeAction}
        summary={homeSummary}
      />
      <HomeSpotlightCards
        onPressActivity={onPressActivity}
        onPressCoordination={onPressCoordination}
        onPressLeadIntent={onPressLeadIntent}
        onPressTopSuggestion={onPressTopSuggestion}
        summary={homeSummary}
      />
      <ThreadStatusTransition
        contextLabel={null}
        hint={null}
        showThinking={false}
        thinkingLabel={runtime.thinkingLabel}
      />

      {showOnboardingCarryover ? (
        <View className="mb-4 mt-1 border-l border-white/[0.08] pl-4">
          <Text className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/28">
            Resume
          </Text>
          <Text className="mt-2 text-[16px] leading-[24px] text-white/78">
            "{onboardingCarryover.seed}"
          </Text>
          <Text className="mt-2 text-[13px] leading-[20px] text-white/38">
            {onboardingCarryover.state === "processing"
              ? t("openChatOnboardingCarryoverProcessing", locale)
              : onboardingCarryover.state === "queued"
                ? t("openChatOnboardingCarryoverQueued", locale)
                : t("openChatOnboardingCarryoverReady", locale)}
          </Text>
          <View className="mt-3 min-h-[34px] flex-row items-center">
            {onboardingCarryover.state === "processing" ? (
              <View className="flex-row items-center gap-2">
                <ActivityIndicator
                  color="rgba(255,255,255,0.72)"
                  size="small"
                />
                <Text className="text-[12px] font-medium text-white/70">
                  {t("openChatOnboardingCarryoverProcessingInline", locale)}
                </Text>
              </View>
            ) : null}
            {onboardingCarryover.state === "ready" ? (
              <Pressable
                className="self-start rounded-full border border-white/12 bg-white/[0.045] px-3.5 py-2 active:opacity-80"
                disabled={sending}
                onPress={onExecuteOnboardingCarryover}
              >
                <Text className="text-[12px] font-semibold tracking-[0.01em] text-white/92">
                  {t("openChatOnboardingCarryoverStartNow", locale)}
                </Text>
              </Pressable>
            ) : null}
            {onboardingCarryover.state === "queued" ? (
              <Pressable
                className="self-start rounded-full border border-white/12 bg-white/[0.045] px-3.5 py-2 active:opacity-80"
                disabled={sending}
                onPress={onExecuteOnboardingCarryover}
              >
                <Text className="text-[12px] font-semibold tracking-[0.01em] text-white/92">
                  {t("openChatOnboardingCarryoverRetry", locale)}
                </Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      ) : null}

      {hasTranscriptMessages ? (
        <View className="-mx-5 min-h-0 flex-1">
          <View className="px-5 pb-2">
            <Text className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/28">
              Conversation
            </Text>
          </View>
          <ChatTranscriptList
            contentPaddingBottom={transcriptBottomPadding}
            contentPaddingTop={16}
            listRef={transcriptRef}
            messages={transcriptMessages}
            onAtBottomChange={setAtBottom}
            renderBubble={(message) => (
              <View className="px-5">
                <ThreadMessage body={message.body} role={message.role} />
              </View>
            )}
          />
        </View>
      ) : showThreadLoadingState ? (
        <View className="min-h-0 flex-1 items-center justify-center py-8">
          <ActivityIndicator color="rgba(255,255,255,0.72)" size="small" />
          <Text className="mt-4 text-center text-[14px] leading-[21px] text-white/56">
            {t("agentHistoryLoading", locale)}
          </Text>
        </View>
      ) : threadLoadErrorMessage ? (
        <View className="min-h-0 flex-1 items-center justify-center px-8 py-8">
          <View className="items-center">
            <View className="rounded-full border border-white/[0.08] bg-white/[0.04] px-4 py-2">
              <Text className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/42">
                {t("homeThreadRecoveryKicker", locale)}
              </Text>
            </View>
            <View className="mt-6 h-12 w-12 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.03]">
              <ActivityIndicator color="rgba(255,255,255,0.72)" size="small" />
            </View>
            <Text className="mt-5 text-center text-[24px] font-semibold tracking-[-0.03em] text-white/92">
              {threadLoadWillAutoRetry
                ? t("homeThreadRecoveryTitle", locale)
                : t("homeThreadRecoveryWaitingTitle", locale)}
            </Text>
            <Text className="mt-3 max-w-[280px] text-center text-[14px] leading-[22px] text-white/48">
              {threadLoadWillAutoRetry
                ? t("homeThreadRecoveryBody", locale)
                : t("homeThreadRecoveryWaitingBody", locale)}
            </Text>
            {threadLoadWillAutoRetry ? (
              <Text className="mt-4 text-center text-[12px] font-medium text-white/58">
                {t("homeThreadRetryingCountdown", locale, {
                  attempt: threadLoadRetryAttempt,
                  seconds: String(Math.max(1, threadLoadRetrySeconds ?? 1)),
                })}
              </Text>
            ) : null}
          </View>
        </View>
      ) : carryoverProcessing ? (
        <View className="min-h-0 flex-1 items-center justify-center py-8">
          <Text className="text-center text-[22px] font-semibold tracking-tight text-white/92">
            OpenChat
          </Text>
          <Text className="mt-3 max-w-[280px] text-center text-[14px] leading-[21px] text-white/42">
            Processing your first intent.
          </Text>
        </View>
      ) : (
        <ScrollView
          className="-mx-5 min-h-0 flex-1"
          contentContainerStyle={{
            minHeight: "100%",
            paddingBottom: transcriptBottomPadding + 16,
            paddingHorizontal: 20,
            paddingTop: 72,
          }}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Animated.View
            style={{
              opacity: welcomeOpacity,
              transform: [{ translateY: welcomeTranslateY }],
            }}
          >
            <Text className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/34">
              Welcome
            </Text>
            <Text className="mt-4 text-[36px] font-semibold tracking-[-0.035em] text-white">
              {t("openChatEmptyTitle", locale)}
            </Text>
            <Text className="mt-3 max-w-[320px] text-[15px] leading-[23px] text-white/44">
              {t("openChatEmptySubtitle", locale)}
            </Text>
          </Animated.View>

          <Animated.View
            className="mt-10"
            style={{
              opacity: starterOpacity,
              transform: [{ translateY: starterTranslateY }],
            }}
          >
            <Text className="mb-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-white/32">
              Try one
            </Text>
            <StarterPrompts
              onPick={(text) => {
                setDraftMessage(text);
              }}
            />
          </Animated.View>
        </ScrollView>
      )}

      {!atBottom && pendingUpdates > 0 ? (
        <View
          className="absolute self-center"
          style={{ bottom: composerBottomOffset + 122 }}
        >
          <Pressable
            accessibilityLabel="Jump to latest update"
            accessibilityRole="button"
            className="rounded-full border border-white/[0.1] bg-white/[0.08] px-3.5 py-2"
            onPress={() => {
              hapticSelection();
              transcriptRef.current?.scrollToEnd({ animated: true });
              setPendingUpdates(0);
            }}
          >
            <Text className="text-[12px] font-medium text-white/90">
              {pendingUpdates > 1 ? `${pendingUpdates} updates` : "New update"}
            </Text>
          </Pressable>
        </View>
      ) : null}

      <View
        className="absolute"
        onLayout={onComposerLayout}
        pointerEvents="box-none"
        style={{ bottom: composerInsetBottom, left: 5, right: 5 }}
      >
        <OpenChatComposer
          canSend={canSend}
          inputTestID="agent-intent-input"
          maxLength={2000}
          onChangeText={setDraftMessage}
          locale={locale}
          onSend={() => void onSend()}
          onVoiceTranscript={onVoiceTranscript}
          sendTestID="agent-send-intent-button"
          sending={sending}
          value={draftMessage}
        />
      </View>
      <OpenChatWelcomeSheet
        locale={locale}
        onClose={() => {
          onDismissWelcomeSheet?.();
        }}
        onPickExample={(text) => {
          setDraftMessage(text);
          onDismissWelcomeSheet?.();
        }}
        visible={welcomeSheetVisible}
      />
    </View>
  );
}
