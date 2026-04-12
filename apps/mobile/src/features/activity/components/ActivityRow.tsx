import Ionicons from "@expo/vector-icons/Ionicons";
import { Pressable, Text, View } from "react-native";

import { appTheme } from "../../../theme";
import type { ActivityItem } from "../domain/activity-item";

function iconNameForItem(item: ActivityItem) {
  switch (item.kind) {
    case "request":
      return item.status === "pending"
        ? "mail-unread-outline"
        : "mail-open-outline";
    case "intent":
      return "flash-outline";
    case "discovery":
      return "sparkles-outline";
    case "summary":
      return "pulse-outline";
  }
}

function eyebrowForItem(item: ActivityItem) {
  return item.eyebrow;
}

function appearanceForItem(item: ActivityItem) {
  if (item.kind === "request") {
    if (item.status === "pending") {
      return {
        accentBackground: appTheme.colors.panel,
        accentBorder: appTheme.colors.hairlineStrong,
        iconColor: appTheme.colors.ink,
        eyebrowColor: appTheme.colors.inkSoft,
      };
    }
    return {
      accentBackground: appTheme.colors.panelMuted,
      accentBorder: appTheme.colors.hairline,
      iconColor: appTheme.colors.inkSoft,
      eyebrowColor: appTheme.colors.inkMuted,
    };
  }
  if (item.kind === "intent") {
    return {
      accentBackground: appTheme.colors.panelSoft,
      accentBorder: appTheme.colors.hairline,
      iconColor: appTheme.colors.inkSoft,
      eyebrowColor: appTheme.colors.inkMuted,
    };
  }
  if (item.kind === "discovery") {
    return {
      accentBackground: appTheme.colors.panelSoft,
      accentBorder: appTheme.colors.hairline,
      iconColor: appTheme.colors.info,
      eyebrowColor: appTheme.colors.inkMuted,
    };
  }
  return {
    accentBackground: appTheme.colors.panelSoft,
    accentBorder: appTheme.colors.hairline,
    iconColor: appTheme.colors.inkMuted,
    eyebrowColor: appTheme.colors.inkFaint,
  };
}

export function ActivityRow({
  item,
  onPress,
}: {
  item: ActivityItem;
  onPress?: (item: ActivityItem) => void;
}) {
  const appearance = appearanceForItem(item);
  const accessibilityLabel = `${eyebrowForItem(item)}: ${item.title}`;
  const accessibilityHint =
    item.kind === "request"
      ? "Opens the request details."
      : item.kind === "intent"
        ? "Opens the intent details."
        : item.kind === "discovery"
          ? "Opens the discovery item."
          : "Opens the system update.";

  return (
    <Pressable
      accessibilityHint={accessibilityHint}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      className="flex-row items-start gap-3 rounded-[26px] border bg-surfaceMuted/82 px-4 py-4"
      onPress={() => onPress?.(item)}
      style={({ pressed }) => ({
        borderColor: appTheme.colors.hairline,
        opacity: pressed ? 0.9 : 1,
      })}
    >
      <View
        className="mt-0.5 h-11 w-11 items-center justify-center rounded-full border"
        style={{
          backgroundColor: appearance.accentBackground,
          borderColor: appearance.accentBorder,
        }}
      >
        <Ionicons
          color={appearance.iconColor}
          name={iconNameForItem(item)}
          size={18}
        />
      </View>
      <View className="min-w-0 flex-1 gap-1.5">
        <Text
          className="text-[11px] font-semibold uppercase tracking-[0.14em]"
          style={{ color: appearance.eyebrowColor }}
        >
          {eyebrowForItem(item)}
        </Text>
        <Text className="text-[15px] font-semibold tracking-[-0.028em] text-ink">
          {item.title}
        </Text>
        <Text className="text-[13px] leading-[19px] text-muted">
          {item.body}
        </Text>
      </View>
      <View className="pt-0.5">
        <Ionicons
          color={appTheme.colors.muted}
          name="chevron-forward"
          size={16}
        />
      </View>
    </Pressable>
  );
}
