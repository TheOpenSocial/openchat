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
import type { PendingIntentsSummaryResponse } from "../lib/api";
import { hapticSelection } from "../lib/haptics";
import type { AppLocale } from "../i18n/strings";
import { t } from "../i18n/strings";
import type { TelemetryEventName } from "../lib/telemetry";
import type { AgentTimelineMessage } from "../types";
import type { HomeRuntimeViewModel } from "../screens/home/domain/types";
import { OpenChatComposer } from "./OpenChatComposer";
import { OpenChatHeader } from "./OpenChatHeader";
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
  sending,
  setDraftMessage,
  threadLoading,
  onboardingCarryover = null,
  onExecuteOnboardingCarryover,
  composerBottomOffset = 0,
  onRuntimeTelemetry,
  runtimeViewModel,
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
  const userActive = hasUserTurn(messages);
  const filteredMessages = useMemo(() => {
    const DEBUG_PATTERNS = [
      /planning agentic response/i,
      /risk check before tools/i,
      /simple-turn fast path selected/i,
      /synthesizing final response/i,
      /agentic turn completed/i,
    ];
    return messages.filter((m) => {
      const body = m.body?.trim() ?? "";
      if (!body) return false;
      return !DEBUG_PATTERNS.some((pattern) => pattern.test(body));
    });
  }, [messages]);

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
  const [composerOverlayHeight, setComposerOverlayHeight] = useState(154);
  const [atBottom, setAtBottom] = useState(true);
  const [pendingUpdates, setPendingUpdates] = useState(0);
  const welcomeOpacity = useRef(new Animated.Value(0)).current;
  const welcomeTranslateY = useRef(new Animated.Value(10)).current;
  const starterOpacity = useRef(new Animated.Value(0)).current;
  const starterTranslateY = useRef(new Animated.Value(14)).current;

  useEffect(() => {
    if (atBottom) {
      setPendingUpdates(0);
      transcriptRef.current?.scrollToEnd({ animated: true });
      return;
    }
    setPendingUpdates((current) => current + 1);
  }, [atBottom, filteredMessages.length]);

  useEffect(() => {
    if (Platform.OS === "android") {
      UIManager.setLayoutAnimationEnabledExperimental?.(true);
    }
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
  }, [showOnboardingCarryover, onboardingCarryover?.state]);

  useEffect(() => {
    if (
      hasUserTurn(filteredMessages) ||
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

      {hasUserTurn(filteredMessages) ? (
        <View className="-mx-5 min-h-0 flex-1">
          <ChatTranscriptList
            contentPaddingBottom={composerOverlayHeight + 18}
            contentPaddingTop={14}
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
            paddingBottom: composerOverlayHeight + 40,
            paddingHorizontal: 20,
            paddingTop: 58,
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
        style={{ bottom: 10, left: 5, right: 5 }}
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
