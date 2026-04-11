import Ionicons from "@expo/vector-icons/Ionicons";
import { Pressable, Text, View } from "react-native";

import type { DiscoveryItem } from "../domain/discovery-item";

function iconNameForKind(kind: DiscoveryItem["kind"]) {
  switch (kind) {
    case "briefing":
      return "sparkles-outline";
    case "tonight":
      return "moon-outline";
    case "group":
      return "people-outline";
    case "reconnect":
      return "refresh-outline";
    case "inbox":
      return "mail-outline";
  }
}

export function DiscoveryRow({
  item,
  onPress,
}: {
  item: DiscoveryItem;
  onPress?: (item: DiscoveryItem) => void;
}) {
  return (
    <Pressable
      className="flex-row items-start gap-3 rounded-[28px] border border-white/8 bg-white/[0.03] px-4 py-4"
      onPress={() => onPress?.(item)}
      style={({ pressed }) => ({ opacity: pressed ? 0.9 : 1 })}
    >
      <View className="mt-0.5 h-10 w-10 items-center justify-center rounded-full bg-white/[0.06]">
        <Ionicons
          color="rgba(255,255,255,0.82)"
          name={iconNameForKind(item.kind)}
          size={18}
        />
      </View>
      <View className="min-w-0 flex-1 gap-1">
        <Text className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/34">
          {item.meta}
        </Text>
        <Text className="text-[16px] font-semibold tracking-[-0.03em] text-white/94">
          {item.title}
        </Text>
        <Text className="text-[14px] leading-[20px] text-white/58">
          {item.body}
        </Text>
      </View>
    </Pressable>
  );
}
