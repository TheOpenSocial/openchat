import { Pressable, Text, View } from "react-native";

import type { ExperienceHomeSummaryResponse } from "../lib/api";
import { appTheme } from "../theme";

type HomeStatusHeaderProps = {
  summary: ExperienceHomeSummaryResponse | null;
  onPressAction?: (
    action: ExperienceHomeSummaryResponse["status"]["nextAction"]["kind"],
  ) => void;
};

function toneClasses(tone: ExperienceHomeSummaryResponse["status"]["tone"]) {
  switch (tone) {
    case "waiting":
      return {
        buttonBackground: appTheme.colors.panelSoft,
        buttonBorder: appTheme.colors.hairlineStrong,
        buttonText: appTheme.colors.inkSoft,
        titleColor: appTheme.colors.ink,
      };
    case "active":
      return {
        buttonBackground: appTheme.colors.panel,
        buttonBorder: appTheme.colors.hairlineStrong,
        buttonText: appTheme.colors.ink,
        titleColor: appTheme.colors.ink,
      };
    case "recovery":
      return {
        buttonBackground: appTheme.colors.panelMuted,
        buttonBorder: appTheme.colors.hairlineStrong,
        buttonText: appTheme.colors.inkSoft,
        titleColor: appTheme.colors.inkSoft,
      };
    default:
      return {
        buttonBackground: appTheme.colors.panelSoft,
        buttonBorder: appTheme.colors.hairline,
        buttonText: appTheme.colors.inkMuted,
        titleColor: appTheme.colors.inkSoft,
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

  const tone = toneClasses(summary.status.tone);
  const compactEyebrow =
    summary.status.tone === "recovery"
      ? "Agent"
      : summary.status.tone === "waiting"
        ? "Agent"
        : "Agent";

  return (
    <View
      className="mb-1.5 mt-0.5 border-b px-1 pb-2"
      style={{ borderColor: appTheme.colors.hairline }}
      testID="home-status-header"
    >
      <View className="flex-row items-center justify-between gap-3">
        <View className="min-w-0 flex-1 flex-row items-center gap-2.5">
          <Text
            className="text-[8px] font-semibold uppercase tracking-[0.12em]"
            style={{ color: appTheme.colors.inkFaint }}
            numberOfLines={1}
          >
            {compactEyebrow}
          </Text>
          <Text
            className="min-w-0 flex-1 text-[13px] font-semibold tracking-[-0.014em]"
            style={{ color: tone.titleColor }}
            numberOfLines={1}
          >
            {summary.status.title}
          </Text>
        </View>
        {summary.counts.pendingRequests === 0 &&
        summary.counts.unreadNotifications === 0 ? (
          <Pressable
            accessibilityLabel={summary.status.nextAction.label}
            accessibilityRole="button"
            className="min-h-8 self-start rounded-full border px-3 py-1"
            disabled={!onPressAction}
            onPress={() => onPressAction?.(summary.status.nextAction.kind)}
            style={({ pressed }) => ({
              backgroundColor: tone.buttonBackground,
              borderColor: tone.buttonBorder,
              opacity: pressed ? appTheme.motion.pressOpacity : 1,
            })}
            testID="home-status-action"
          >
            <Text
              className="text-[10px] font-semibold tracking-[0.01em]"
              style={{ color: tone.buttonText }}
              numberOfLines={1}
            >
              {summary.status.nextAction.label}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}
