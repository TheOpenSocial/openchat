import { useEffect, useMemo, useState } from "react";
import {
  LayoutAnimation,
  Platform,
  Pressable,
  Text,
  TextInput,
  UIManager,
  View,
} from "react-native";

import { AgentIntentToolbar } from "../components/AgentIntentToolbar";
import { ChatTranscriptList } from "../components/ChatTranscriptList";
import { ChoiceChip } from "../components/ChoiceChip";
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
}: OpenChatScreenProps) {
  const [toolsOpen, setToolsOpen] = useState(false);
  const inlineChips = useMemo(
    () => [
      {
        label: t("openChatInlineFootball", locale),
        body: t("openChatInlineFootballBody", locale),
      },
      {
        label: t("openChatInlineTonight", locale),
        body: t("openChatInlineTonightBody", locale),
      },
      {
        label: t("openChatInlineMeet", locale),
        body: t("openChatInlineMeetBody", locale),
      },
      {
        label: t("openChatInlineGroup", locale),
        body: t("openChatInlineGroupBody", locale),
      },
      {
        label: t("openChatInlineExplore", locale),
        body: t("openChatInlineExploreBody", locale),
      },
    ],
    [locale],
  );
  const userActive = hasUserTurn(messages);
  const phase = deriveThreadPhase(
    messages,
    pendingIntentSummary,
    sending,
    threadLoading,
  );
  const progressHint = compactProgressHint(pendingIntentSummary);

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
  }, [messages.length]);

  const intentLen = draftMessage.trim().length;
  const canSend = intentLen > 0 && !sending;
  const showOnboardingCarryover =
    onboardingCarryover != null &&
    (phase === "empty" || phase === "active" || !userActive);

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

  return (
    <View className="min-h-0 flex-1 bg-[#060607] px-4 pb-1 pt-2">
      <OpenChatHeader locale={locale} showPresence={!userActive} />

      <ThreadContextStrip hint={progressHint} phase={phase} />

      {showOnboardingCarryover ? (
        <View className="mb-3 mt-2 rounded-[22px] border border-white/[0.06] bg-white/[0.025] px-4 py-4">
          <Text className="text-[11px] font-medium uppercase tracking-[0.14em] text-white/30">
            {t("openChatOnboardingCarryoverTitle", locale)}
          </Text>
          <Text className="mt-2 text-[15px] leading-[23px] text-white/78">
            "{onboardingCarryover.seed}"
          </Text>
          <Text className="mt-2 text-[13px] leading-[20px] text-white/42">
            {onboardingCarryover.state === "processing"
              ? t("openChatOnboardingCarryoverProcessing", locale)
              : onboardingCarryover.state === "queued"
                ? t("openChatOnboardingCarryoverQueued", locale)
                : t("openChatOnboardingCarryoverReady", locale)}
          </Text>
        </View>
      ) : null}

      {userActive ? (
        <View className="min-h-0 flex-1">
          <ChatTranscriptList
            messages={messages}
            renderBubble={(message) => (
              <ThreadMessage body={message.body} role={message.role} />
            )}
          />
        </View>
      ) : (
        <View className="min-h-0 flex-1 justify-center py-8">
          <Text className="text-center text-[28px] font-semibold tracking-tight text-white">
            {t("openChatEmptyTitle", locale)}
          </Text>
          <Text className="mt-3 max-w-[280px] self-center text-center text-[15px] leading-[22px] text-white/44">
            {t("openChatEmptySubtitle", locale)}
          </Text>
          <View className="mt-9">
            <StarterPrompts
              onPick={(text) => {
                setDraftMessage(text);
              }}
            />
          </View>
        </View>
      )}

      {userActive && messages.length <= 6 ? (
        <View className="mb-2 mt-2">
          <Text className="mb-2 text-[11px] font-medium uppercase tracking-[0.14em] text-white/28">
            {t("openChatSuggestions", locale)}
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {inlineChips.map((c) => (
              <Pressable
                className="rounded-full border border-white/[0.07] bg-white/[0.025] px-3 py-1.5"
                key={c.label}
                onPress={() => setDraftMessage(c.body)}
              >
                <Text className="text-[12px] font-medium text-white/50">
                  {c.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}

      <ThreadActionPills actions={threadActions} onAction={onThreadAction} />

      <View className="flex-shrink-0 border-t border-white/[0.06] pt-3">
        <AgentIntentToolbar
          canRegenerate={canRegenerate}
          loading={sending}
          onRegenerate={onRegenerate}
          onStop={onStop}
        />

        <Pressable
          className="mb-2 mt-1 self-start py-1"
          onPress={() => setToolsOpen((o) => !o)}
        >
          <Text className="text-[12px] text-white/28">
            {toolsOpen
              ? t("openChatHideOptions", locale)
              : t("openChatMoreOptions", locale)}
          </Text>
        </Pressable>

        {toolsOpen ? (
          <View className="mb-3 gap-2">
            <View className="flex-row flex-wrap gap-2">
              <ChoiceChip
                label={t("agentComposerModeChat", locale)}
                onPress={() => {
                  onComposerModeChange("chat");
                }}
                selected={composerMode === "chat"}
                testID="agent-mode-chat"
              />
              <ChoiceChip
                label={t("agentComposerModeIntent", locale)}
                onPress={() => {
                  onComposerModeChange("intent");
                }}
                selected={composerMode === "intent"}
                testID="agent-mode-intent"
              />
            </View>
            {threadLoading ? (
              <Text className="text-[12px] text-white/40">
                {t("agentHistoryLoading", locale)}
              </Text>
            ) : null}
            <Text className="text-[12px] text-white/40">
              {composerMode === "chat"
                ? t("agentComposerHintChat", locale)
                : t("agentComposerHintIntent", locale)}
            </Text>
            {composerMode === "intent" ? (
              <View className="rounded-[22px] border border-white/[0.08] bg-white/[0.025] px-3 py-2.5">
                <Pressable
                  className="mb-2 flex-row items-center justify-between"
                  onPress={() => onDecomposeIntentChange(!decomposeIntent)}
                >
                  <Text className="text-[12px] text-white/75">
                    {t("openChatSplitIntent", locale)}
                  </Text>
                  <Text className="text-[12px] font-semibold text-teal-300/90">
                    {decomposeIntent
                      ? t("openChatOn", locale)
                      : t("openChatOff", locale)}
                  </Text>
                </Pressable>
                <Text className="mb-1 text-[11px] text-white/38">
                  {t("openChatMaxIntents", locale)}
                </Text>
                <View className="flex-row flex-wrap gap-2">
                  {[1, 2, 3, 4, 5].map((value) => (
                    <ChoiceChip
                      key={`max-intents-${value}`}
                      label={String(value)}
                      onPress={() => onDecomposeMaxIntentsChange(value)}
                      selected={decomposeMaxIntents === value}
                    />
                  ))}
                </View>
              </View>
            ) : null}
            {composerMode === "chat" ? (
              <View>
                <Text className="mb-1 text-[11px] text-white/38">
                  {t("agentImageUrlOptional", locale)}
                </Text>
                <TextInput
                  autoCapitalize="none"
                  autoCorrect={false}
                  className="min-h-[44px] rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2.5 text-[14px] text-white"
                  keyboardType="url"
                  onChangeText={onAgentImageUrlChange}
                  placeholder="https://…"
                  placeholderTextColor="rgba(255,255,255,0.28)"
                  value={agentImageUrl}
                />
              </View>
            ) : null}
          </View>
        ) : null}

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
        <Text className="mt-1.5 text-right text-[11px] text-white/24">
          {intentLen}/2000
        </Text>
      </View>
    </View>
  );
}
