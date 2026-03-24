import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  type LayoutChangeEvent,
  LayoutAnimation,
  Platform,
  Pressable,
  Text,
  UIManager,
  View,
} from "react-native";

import { ChatTranscriptList } from "../components/ChatTranscriptList";
import type { PendingIntentsSummaryResponse } from "../lib/api";
import { hapticSelection } from "../lib/haptics";
import type { AppLocale } from "../i18n/strings";
import { t } from "../i18n/strings";
import type { AgentTimelineMessage } from "../types";
import { OpenChatComposer } from "./OpenChatComposer";
import { OpenChatHeader } from "./OpenChatHeader";
import { StarterPrompts } from "./StarterPrompts";
import { ThreadActionPills, type ThreadActionSpec } from "./ThreadActionPills";
import { ThreadContextStrip } from "./ThreadContextStrip";
import { ThreadMessage } from "./ThreadMessage";
import {
  compactProgressHint,
  deriveThreadPhase,
  hasUserTurn,
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
  onOpenChatsTab: () => void;
  e2eSubmitOnReturn?: boolean;
  onboardingCarryover?: {
    seed: string;
    state: "processing" | "queued" | "ready";
  } | null;
  onExecuteOnboardingCarryover?: () => void;
};

export function OpenChatScreen({
  agentImageUrl,
  canRegenerate,
  composerMode,
  decomposeIntent,
  decomposeMaxIntents,
  draftMessage,
  e2eSubmitOnReturn = false,
  locale,
  messages,
  onAgentImageUrlChange,
  onComposerModeChange,
  onDecomposeIntentChange,
  onDecomposeMaxIntentsChange,
  onOpenChatsTab,
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
  const inlineChips = useMemo(
    () => [
      {
        label: "Talk about something",
        body: "I want to talk about something on my mind.",
      },
      {
        label: "Find people for tonight",
        body: "Find people who are free tonight.",
      },
      {
        label: "Meet someone new",
        body: "I want to meet someone new around a shared interest.",
      },
      {
        label: "Start a group",
        body: "I want to start a small group around something I care about.",
      },
    ],
    [],
  );
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

  const latestUserIntent = useMemo(() => {
    for (let i = filteredMessages.length - 1; i >= 0; i -= 1) {
      const row = filteredMessages[i];
      if (row.role === "user" && row.body.trim().length > 0) {
        return row.body.trim();
      }
    }
    return null;
  }, [filteredMessages]);

  const progressHint = useMemo(
    () => compactProgressHint(pendingIntentSummary),
    [pendingIntentSummary],
  );

  const phase = deriveThreadPhase(
    filteredMessages,
    pendingIntentSummary,
    sending,
    threadLoading,
  );

  const threadActions = useMemo((): ThreadActionSpec[] => {
    const seen = new Set<string>();
    const out: ThreadActionSpec[] = [];
    const push = (a: ThreadActionSpec) => {
      if (seen.has(a.id)) return;
      seen.add(a.id);
      out.push(a);
    };

    let accepted = 0;
    for (const row of pendingIntentSummary?.intents ?? []) {
      accepted += row.requests.accepted;
    }

    if (accepted >= 1) {
      push({ id: "open_chats", label: t("openChatActionOpenChats", locale) });
    }
    if (phase === "active" || phase === "partial" || phase === "no_match") {
      push({ id: "widen", label: t("openChatActionWiden", locale) });
      push({ id: "one_to_one", label: t("openChatActionOneToOne", locale) });
      push({ id: "groups_ok", label: t("openChatActionGroupsOk", locale) });
    }
    return out;
  }, [locale, pendingIntentSummary, phase]);

  useEffect(() => {
    if (Platform.OS === "android") {
      UIManager.setLayoutAnimationEnabledExperimental?.(true);
    }
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
  }, [filteredMessages.length]);

  const intentLen = draftMessage.trim().length;
  const canSend = intentLen > 0 && !sending;
  const showOnboardingCarryover =
    onboardingCarryover != null &&
    (phase === "empty" || phase === "active" || !userActive);
  const carryoverProcessing =
    showOnboardingCarryover && onboardingCarryover?.state === "processing";
  const [composerOverlayHeight, setComposerOverlayHeight] = useState(154);
  const [atBottom, setAtBottom] = useState(true);
  const [pendingUpdates, setPendingUpdates] = useState(0);

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

  const onThreadAction = (id: string) => {
    hapticSelection();
    switch (id) {
      case "open_chats":
        onOpenChatsTab();
        return;
      case "widen":
        void onSend("Widen the search for my latest intent.");
        return;
      case "one_to_one":
        void onSend("Keep matching 1:1 only for this.");
        return;
      case "groups_ok":
        void onSend("Open this to small groups, not only 1:1.");
        return;
      default:
        return;
    }
  };

  const onComposerLayout = (event: LayoutChangeEvent) => {
    const nextHeight = Math.ceil(event.nativeEvent.layout.height);
    if (Math.abs(nextHeight - composerOverlayHeight) > 2) {
      setComposerOverlayHeight(nextHeight);
    }
  };

  return (
    <View className="min-h-0 flex-1 bg-[#050506] px-5 pt-3">
      <OpenChatHeader locale={locale} showPresence={!userActive} />
      {latestUserIntent ? (
        <View className="mb-2 mt-1 rounded-2xl border border-white/[0.06] bg-white/[0.03] px-3 py-2.5">
          <Text className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/36">
            Current intent
          </Text>
          <Text
            className="mt-1 text-[14px] leading-[20px] text-white/78"
            numberOfLines={2}
          >
            {latestUserIntent}
          </Text>
        </View>
      ) : null}
      <ThreadContextStrip hint={progressHint} phase={phase} />

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
            messages={filteredMessages}
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
        <View className="min-h-0 flex-1 justify-center py-8">
          <Text className="text-center text-[34px] font-semibold tracking-[-0.03em] text-white">
            What do you want to do?
          </Text>
          <Text className="mt-3 max-w-[260px] self-center text-center text-[15px] leading-[22px] text-white/42">
            Start with anything.
          </Text>
          <View className="mt-10">
            <StarterPrompts
              onPick={(text) => {
                setDraftMessage(text);
              }}
            />
          </View>
        </View>
      )}

      {hasUserTurn(filteredMessages) && filteredMessages.length <= 6 ? (
        <View className="mb-3 mt-1">
          <Text className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/24">
            Suggestions
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {inlineChips.map((c) => (
              <Pressable
                className="rounded-full border border-white/[0.07] bg-white/[0.025] px-3 py-1.5"
                key={c.label}
                onPress={() => setDraftMessage(c.body)}
              >
                <Text className="text-[12px] font-medium text-white/56">
                  {c.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}

      <ThreadActionPills actions={threadActions} onAction={onThreadAction} />
      {!atBottom && pendingUpdates > 0 ? (
        <View className="absolute bottom-[192px] self-center">
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
        style={{ bottom: 30, left: 5, right: 5 }}
      >
        <OpenChatComposer
          canSend={canSend}
          e2eSubmitOnReturn={e2eSubmitOnReturn}
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
    </View>
  );
}
