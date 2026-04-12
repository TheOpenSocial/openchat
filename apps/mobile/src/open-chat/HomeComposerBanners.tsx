import type { ReactElement } from "react";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Pressable, Text, View } from "react-native";

import type { ExperienceHomeSummaryResponse } from "../lib/api";
import { appTheme } from "../theme";

type HomeComposerBannersProps = {
  summary: ExperienceHomeSummaryResponse | null;
  onPressActivity?: () => void;
  onPressCoordination?: (targetChatId: string | null) => void;
  onPressLeadIntent?: (intentId: string) => void;
  onPressTopSuggestion?: (userId: string) => void;
};

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean).slice(0, 2);
  if (parts.length === 0) {
    return "?";
  }
  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("");
}

function AvatarMark({
  label,
  tone = "human",
}: {
  label: string;
  tone?: "agent" | "human";
}) {
  return (
    <View
      className="h-7 w-7 items-center justify-center rounded-full border"
      style={{
        backgroundColor:
          tone === "agent" ? appTheme.colors.panel : appTheme.colors.panelMuted,
        borderColor:
          tone === "agent"
            ? appTheme.colors.hairlineStrong
            : appTheme.colors.hairline,
      }}
    >
      <Text
        className="text-[10px] font-semibold tracking-[0.01em]"
        style={{ color: appTheme.colors.inkSoft }}
      >
        {label}
      </Text>
    </View>
  );
}

function Banner({
  body,
  kicker,
  onPress,
  primaryAvatar,
  secondaryAvatar,
  testID,
  title,
}: {
  body: string;
  kicker: string;
  onPress?: () => void;
  primaryAvatar: { label: string; tone?: "agent" | "human" };
  secondaryAvatar?: { label: string; tone?: "agent" | "human" };
  testID: string;
  title: string;
}) {
  return (
    <Pressable
      accessibilityLabel={title}
      accessibilityRole="button"
      className="rounded-[16px] border px-3 py-1.5"
      onPress={onPress}
      style={({ pressed }) => ({
        backgroundColor: appTheme.colors.panel,
        borderColor: appTheme.colors.hairline,
        opacity: pressed ? appTheme.motion.pressOpacity : 1,
      })}
      testID={testID}
    >
      <View className="flex-row items-center gap-2.5">
        <View className="w-8">
          <AvatarMark label={primaryAvatar.label} tone={primaryAvatar.tone} />
          {secondaryAvatar ? (
            <View className="-mt-2 ml-4">
              <AvatarMark
                label={secondaryAvatar.label}
                tone={secondaryAvatar.tone}
              />
            </View>
          ) : null}
        </View>
        <View className="min-w-0 flex-1">
          <Text
            className="text-[9px] font-semibold uppercase tracking-[0.14em]"
            style={{ color: appTheme.colors.inkFaint }}
            numberOfLines={1}
          >
            {kicker}
          </Text>
          <Text
            className="text-[12px] font-semibold tracking-[-0.016em]"
            style={{ color: appTheme.colors.ink }}
            numberOfLines={1}
          >
            {title}
          </Text>
          <Text
            className="mt-0.5 text-[10px] leading-[14px]"
            numberOfLines={1}
            style={{ color: appTheme.colors.inkMuted }}
          >
            {body}
          </Text>
        </View>
        <View className="pt-0.5">
          <Ionicons
            color={appTheme.colors.inkFaint}
            name="chevron-forward"
            size={14}
          />
        </View>
      </View>
    </Pressable>
  );
}

export function HomeComposerBanners({
  summary,
  onPressActivity,
  onPressCoordination,
  onPressLeadIntent,
  onPressTopSuggestion,
}: HomeComposerBannersProps) {
  if (!summary) {
    return null;
  }

  let banner: ReactElement | null = null;

  if (
    summary.spotlight.coordination &&
    summary.spotlight.coordination.variant === "waiting"
  ) {
    banner = (
      <Banner
        key="waiting"
        body={summary.spotlight.coordination.body}
        kicker="Live replies"
        onPress={() =>
          onPressCoordination?.(
            summary.spotlight.coordination?.targetChatId ?? null,
          )
        }
        primaryAvatar={{ label: "AI", tone: "agent" }}
        secondaryAvatar={{ label: "…", tone: "human" }}
        testID="home-composer-banner-waiting"
        title="Waiting on replies"
      />
    );
  } else if (summary.spotlight.topSuggestion) {
    banner = (
      <Banner
        key="top-suggestion"
        body={summary.spotlight.topSuggestion.reason}
        kicker="Best human lead"
        onPress={() =>
          onPressTopSuggestion?.(summary.spotlight.topSuggestion?.userId ?? "")
        }
        primaryAvatar={{
          label: initials(summary.spotlight.topSuggestion.displayName),
          tone: "human",
        }}
        secondaryAvatar={{ label: "AI", tone: "agent" }}
        testID="home-composer-banner-top-suggestion"
        title={summary.spotlight.topSuggestion.displayName}
      />
    );
  } else if (
    summary.counts.pendingRequests > 0 ||
    summary.counts.unreadNotifications > 0
  ) {
    banner = (
      <Banner
        key="attention"
        body={
          summary.counts.pendingRequests > 0
            ? `${summary.counts.pendingRequests} request${summary.counts.pendingRequests === 1 ? "" : "s"} need attention`
            : `${summary.counts.unreadNotifications} update${summary.counts.unreadNotifications === 1 ? "" : "s"} unread`
        }
        kicker="Notifications"
        onPress={onPressActivity}
        primaryAvatar={{ label: "AI", tone: "agent" }}
        testID="home-composer-banner-attention"
        title="Keep things moving"
      />
    );
  } else if (summary.spotlight.recovery) {
    banner = (
      <Banner
        key="recovery"
        body={summary.spotlight.recovery.body}
        kicker="Next move"
        onPress={() =>
          summary.spotlight.leadIntent
            ? onPressLeadIntent?.(summary.spotlight.leadIntent.intentId)
            : undefined
        }
        primaryAvatar={{ label: "AI", tone: "agent" }}
        testID="home-composer-banner-recovery"
        title={summary.spotlight.recovery.title}
      />
    );
  }

  if (!banner) {
    return null;
  }

  return <View className="mb-1.5">{banner}</View>;
}
