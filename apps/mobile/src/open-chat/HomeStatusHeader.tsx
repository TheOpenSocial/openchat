import { Pressable, Text, View } from "react-native";

import type { ExperienceHomeSummaryResponse } from "../lib/api";
import { appTheme } from "../theme";

type HomeStatusHeaderProps = {
  summary: ExperienceHomeSummaryResponse | null;
  onPressAction?: (
    action: ExperienceHomeSummaryResponse["status"]["nextAction"]["kind"],
  ) => void;
};

function countsLine(summary: ExperienceHomeSummaryResponse) {
  const parts: string[] = [];
  if (summary.counts.pendingRequests > 0) {
    parts.push(
      `${summary.counts.pendingRequests} request${summary.counts.pendingRequests === 1 ? "" : "s"}`,
    );
  }
  if (summary.counts.activeIntents > 0) {
    parts.push(
      `${summary.counts.activeIntents} active intent${summary.counts.activeIntents === 1 ? "" : "s"}`,
    );
  }
  if (summary.counts.tonightSuggestions > 0) {
    parts.push(
      `${summary.counts.tonightSuggestions} suggestion${summary.counts.tonightSuggestions === 1 ? "" : "s"}`,
    );
  }
  return parts.join(" · ");
}

function toneClasses(tone: ExperienceHomeSummaryResponse["status"]["tone"]) {
  switch (tone) {
    case "waiting":
      return {
        chip: "bg-white/[0.08] border-white/[0.12] text-white/76",
        title: "text-white/94",
      };
    case "active":
      return {
        chip: "bg-white/[0.09] border-white/[0.14] text-white/82",
        title: "text-white",
      };
    case "recovery":
      return {
        chip: "bg-white/[0.08] border-white/[0.12] text-white/72",
        title: "text-white/92",
      };
    default:
      return {
        chip: "bg-white/[0.05] border-white/[0.08] text-white/62",
        title: "text-white/88",
      };
  }
}

export function HomeStatusHeader({
  summary,
  onPressAction,
}: HomeStatusHeaderProps) {
  if (!summary) {
    return null;
  }

  const counts = countsLine(summary);
  const tone = toneClasses(summary.status.tone);

  return (
    <View className="mb-4 mt-1 rounded-[28px] border border-white/[0.08] bg-white/[0.035] px-4 py-4">
      <View className="flex-row items-start justify-between gap-3">
        <View className="min-w-0 flex-1">
          <Text className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/34">
            {summary.status.eyebrow}
          </Text>
          <Text
            className={`mt-2 text-[22px] font-semibold tracking-[-0.035em] ${tone.title}`}
          >
            {summary.status.title}
          </Text>
          <Text className="mt-2 text-[14px] leading-[21px] text-white/56">
            {summary.status.body}
          </Text>
          {counts ? (
            <Text className="mt-3 text-[12px] leading-[18px] text-white/38">
              {counts}
            </Text>
          ) : null}
          {summary.status.footnote ? (
            <Text className="mt-3 text-[12px] leading-[18px] text-white/34">
              {summary.status.footnote}
            </Text>
          ) : null}
        </View>
        <Pressable
          accessibilityLabel={summary.status.nextAction.label}
          accessibilityRole="button"
          className={`rounded-full border px-3 py-2 ${tone.chip}`}
          disabled={!onPressAction}
          onPress={() => onPressAction?.(summary.status.nextAction.kind)}
          style={({ pressed }) => ({
            opacity: pressed ? appTheme.motion.pressOpacity : 1,
          })}
        >
          <Text className="text-[11px] font-semibold tracking-[0.01em]">
            {summary.status.nextAction.label}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
