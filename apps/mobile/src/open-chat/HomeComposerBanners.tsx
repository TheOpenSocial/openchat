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

function notificationBrief(summary: ExperienceHomeSummaryResponse) {
  if (summary.counts.pendingRequests > 0) {
    if (summary.counts.pendingRequests === 1) {
      return {
        body: "One person is waiting on you. A quick reply keeps the momentum up.",
        kicker: "Agent brief",
        title: "You have one decision to make",
      };
    }

    return {
      body: `${summary.counts.pendingRequests} people are waiting. I would clear those replies before checking lighter updates.`,
      kicker: "Agent brief",
      title: `${summary.counts.pendingRequests} replies need your attention`,
    };
  }

  if (summary.counts.unreadNotifications > 0) {
    return {
      body: `${summary.counts.unreadNotifications} update${summary.counts.unreadNotifications === 1 ? "" : "s"} came in while you were away. Start there before opening a new thread.`,
      kicker: "Agent brief",
      title: "There is fresh movement to review",
    };
  }

  return null;
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
        body={`Someone is still deciding. ${summary.spotlight.coordination.body}`}
        kicker="Agent brief"
        onPress={() =>
          onPressCoordination?.(
            summary.spotlight.coordination?.targetChatId ?? null,
          )
        }
        primaryAvatar={{ label: "AI", tone: "agent" }}
        secondaryAvatar={{ label: "…", tone: "human" }}
        testID="home-composer-banner-waiting"
        title="A conversation is waiting on the next reply"
      />
    );
  } else if (summary.spotlight.topSuggestion) {
    banner = (
      <Banner
        key="top-suggestion"
        body={`This is the strongest match on the board right now. ${summary.spotlight.topSuggestion.reason}`}
        kicker="Agent brief"
        onPress={() =>
          onPressTopSuggestion?.(summary.spotlight.topSuggestion?.userId ?? "")
        }
        primaryAvatar={{
          label: initials(summary.spotlight.topSuggestion.displayName),
          tone: "human",
        }}
        secondaryAvatar={{ label: "AI", tone: "agent" }}
        testID="home-composer-banner-top-suggestion"
        title={`Talk to ${summary.spotlight.topSuggestion.displayName} next`}
      />
    );
  } else if (
    summary.counts.pendingRequests > 0 ||
    summary.counts.unreadNotifications > 0
  ) {
    const brief = notificationBrief(summary);
    banner = (
      <Banner
        key="attention"
        body={brief?.body ?? "There is new activity to review."}
        kicker={brief?.kicker ?? "Agent brief"}
        onPress={onPressActivity}
        primaryAvatar={{ label: "AI", tone: "agent" }}
        testID="home-composer-banner-attention"
        title={brief?.title ?? "Keep things moving"}
      />
    );
  } else if (summary.spotlight.recovery) {
    banner = (
      <Banner
        key="recovery"
        body={`Here is the best next move I can see right now. ${summary.spotlight.recovery.body}`}
        kicker="Agent brief"
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
