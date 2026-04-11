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

export function ActivityRow({
  item,
  onPress,
}: {
  item: ActivityItem;
  onPress?: (item: ActivityItem) => void;
}) {
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
      className="flex-row items-start gap-3 rounded-[28px] border border-hairline bg-surfaceMuted/85 px-4 py-4"
      onPress={() => onPress?.(item)}
      style={({ pressed }) => ({ opacity: pressed ? 0.9 : 1 })}
    >
      <View className="mt-0.5 h-10 w-10 items-center justify-center rounded-full bg-surface/80">
        <Ionicons
          color={appTheme.colors.ink}
          name={iconNameForItem(item)}
          size={18}
        />
      </View>
      <View className="min-w-0 flex-1 gap-1">
        <Text className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
          {eyebrowForItem(item)}
        </Text>
        <Text className="text-[16px] font-semibold tracking-[-0.03em] text-ink">
          {item.title}
        </Text>
        <Text className="text-[14px] leading-[20px] text-muted">
          {item.body}
        </Text>
      </View>
    </Pressable>
  );
}
