import type { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";

import { SurfaceCard } from "../components/SurfaceCard";
import type { ExperienceHomeSummaryResponse } from "../lib/api";
import { appTheme } from "../theme";

type HomeSpotlightCardsProps = {
  summary: ExperienceHomeSummaryResponse | null;
  onPressActivity?: () => void;
  onPressCoordination?: (targetChatId: string | null) => void;
  onPressLeadIntent?: (intentId: string) => void;
  onPressTopSuggestion?: (userId: string) => void;
};

function AttentionCard({
  summary,
  onPress,
}: {
  summary: ExperienceHomeSummaryResponse;
  onPress?: () => void;
}) {
  const parts: string[] = [];
  if (summary.counts.pendingRequests > 0) {
    parts.push(
      `${summary.counts.pendingRequests} request${summary.counts.pendingRequests === 1 ? "" : "s"} waiting`,
    );
  }
  if (summary.counts.unreadNotifications > 0) {
    parts.push(
      `${summary.counts.unreadNotifications} update${summary.counts.unreadNotifications === 1 ? "" : "s"} unread`,
    );
  }

  if (parts.length === 0) {
    return null;
  }

  return (
    <Pressable
      accessibilityLabel="Open activity"
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        opacity: pressed ? appTheme.motion.pressOpacity : 1,
      })}
      testID="home-card-attention"
    >
      <SurfaceCard className="min-w-0 flex-1 rounded-[24px] bg-white/[0.03]">
        <Text className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/34">
          Needs attention
        </Text>
        <Text className="mt-2 text-[17px] font-semibold tracking-[-0.03em] text-white/94">
          Keep things moving
        </Text>
        <Text className="mt-3 text-[13px] leading-[20px] text-white/52">
          {parts.join(" · ")}
        </Text>
      </SurfaceCard>
    </Pressable>
  );
}

function RecoveryCard({
  recovery,
  onPress,
}: {
  recovery: NonNullable<ExperienceHomeSummaryResponse["spotlight"]["recovery"]>;
  onPress?: () => void;
}) {
  return (
    <Pressable
      accessibilityLabel={recovery.actionLabel}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        opacity: pressed ? appTheme.motion.pressOpacity : 1,
      })}
      testID="home-card-recovery"
    >
      <SurfaceCard className="min-w-0 flex-1 rounded-[24px] border border-white/[0.12] bg-white/[0.045]">
        <Text className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/34">
          Recovery
        </Text>
        <Text className="mt-2 text-[17px] font-semibold tracking-[-0.03em] text-white/94">
          {recovery.title}
        </Text>
        <Text className="mt-3 text-[13px] leading-[20px] text-white/52">
          {recovery.body}
        </Text>
        {recovery.secondaryLabel ? (
          <Text className="mt-3 text-[12px] leading-[18px] text-white/38">
            {recovery.secondaryLabel}
          </Text>
        ) : null}
        <Text className="mt-3 text-[12px] font-medium text-white/38">
          {recovery.actionLabel}
        </Text>
      </SurfaceCard>
    </Pressable>
  );
}

function CoordinationCard({
  coordination,
  onPress,
}: {
  coordination: NonNullable<
    ExperienceHomeSummaryResponse["spotlight"]["coordination"]
  >;
  onPress?: (targetChatId: string | null) => void;
}) {
  return (
    <Pressable
      accessibilityLabel={coordination.actionLabel}
      accessibilityRole="button"
      onPress={() => onPress?.(coordination.targetChatId)}
      style={({ pressed }) => ({
        opacity: pressed ? appTheme.motion.pressOpacity : 1,
      })}
      testID={
        coordination.variant === "accepted"
          ? "home-card-coordination-accepted"
          : "home-card-coordination-waiting"
      }
    >
      <SurfaceCard className="min-w-0 flex-1 rounded-[24px] bg-white/[0.03]">
        <Text className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/34">
          {coordination.variant === "accepted" ? "Ready now" : "Waiting"}
        </Text>
        <Text className="mt-2 text-[17px] font-semibold tracking-[-0.03em] text-white/94">
          {coordination.title}
        </Text>
        <Text className="mt-3 text-[13px] leading-[20px] text-white/52">
          {coordination.body}
        </Text>
        <Text className="mt-3 text-[12px] font-medium text-white/38">
          {coordination.actionLabel}
        </Text>
      </SurfaceCard>
    </Pressable>
  );
}

function LeadIntentCard({
  intent,
  onPress,
}: {
  intent: NonNullable<ExperienceHomeSummaryResponse["spotlight"]["leadIntent"]>;
  onPress?: (intentId: string) => void;
}) {
  const closedCount =
    intent.requests.rejected +
    intent.requests.expired +
    intent.requests.cancelled;

  return (
    <Pressable
      accessibilityLabel={`Open active search ${intent.rawText}`}
      accessibilityRole="button"
      onPress={() => onPress?.(intent.intentId)}
      style={({ pressed }) => ({
        opacity: pressed ? appTheme.motion.pressOpacity : 1,
      })}
      testID="home-card-lead-intent"
    >
      <SurfaceCard className="min-w-0 flex-1 rounded-[24px] bg-white/[0.03]">
        <Text className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/34">
          Active search
        </Text>
        <Text className="mt-2 text-[17px] font-semibold tracking-[-0.03em] text-white/94">
          {intent.rawText}
        </Text>
        <Text className="mt-3 text-[13px] leading-[20px] text-white/52">
          {intent.requests.pending} pending · {intent.requests.accepted}{" "}
          accepted · {closedCount} closed
        </Text>
      </SurfaceCard>
    </Pressable>
  );
}

function TopSuggestionCard({
  suggestion,
  onPress,
}: {
  suggestion: NonNullable<
    ExperienceHomeSummaryResponse["spotlight"]["topSuggestion"]
  >;
  onPress?: (userId: string) => void;
}) {
  return (
    <Pressable
      accessibilityLabel={`Open best lead ${suggestion.displayName}`}
      accessibilityRole="button"
      onPress={() => onPress?.(suggestion.userId)}
      style={({ pressed }) => ({
        opacity: pressed ? appTheme.motion.pressOpacity : 1,
      })}
      testID="home-card-top-suggestion"
    >
      <SurfaceCard className="min-w-0 flex-1 rounded-[24px] bg-white/[0.03]">
        <Text className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/34">
          Best lead
        </Text>
        <Text className="mt-2 text-[17px] font-semibold tracking-[-0.03em] text-white/94">
          {suggestion.displayName}
        </Text>
        <Text className="mt-3 text-[13px] leading-[20px] text-white/52">
          {suggestion.reason}
        </Text>
        <Text className="mt-3 text-[12px] font-medium text-white/38">
          {Math.round(suggestion.score * 100)}% match
        </Text>
      </SurfaceCard>
    </Pressable>
  );
}

export function HomeSpotlightCards({
  summary,
  onPressActivity,
  onPressCoordination,
  onPressLeadIntent,
  onPressTopSuggestion,
}: HomeSpotlightCardsProps) {
  if (!summary) {
    return null;
  }

  const cards: ReactNode[] = [];
  const hasAttentionSignals =
    summary.counts.pendingRequests > 0 ||
    summary.counts.unreadNotifications > 0;
  if (hasAttentionSignals) {
    cards.push(
      <AttentionCard
        key="attention"
        onPress={onPressActivity}
        summary={summary}
      />,
    );
  }

  if (summary.spotlight.coordination) {
    cards.push(
      <CoordinationCard
        key="coordination"
        coordination={summary.spotlight.coordination}
        onPress={onPressCoordination}
      />,
    );
  }

  if (summary.spotlight.recovery) {
    cards.push(
      <RecoveryCard
        key="recovery"
        onPress={() =>
          summary.spotlight.leadIntent
            ? onPressLeadIntent?.(summary.spotlight.leadIntent.intentId)
            : undefined
        }
        recovery={summary.spotlight.recovery}
      />,
    );
  }

  if (summary.spotlight.leadIntent) {
    cards.push(
      <LeadIntentCard
        intent={summary.spotlight.leadIntent}
        onPress={onPressLeadIntent}
        key={`intent:${summary.spotlight.leadIntent.intentId}`}
      />,
    );
  }

  if (summary.spotlight.topSuggestion) {
    cards.push(
      <TopSuggestionCard
        onPress={onPressTopSuggestion}
        suggestion={summary.spotlight.topSuggestion}
        key={`suggestion:${summary.spotlight.topSuggestion.userId}`}
      />,
    );
  }

  if (cards.length === 0) {
    return null;
  }

  return <View className="mb-5 gap-3">{cards}</View>;
}
