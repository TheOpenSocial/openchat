import Ionicons from "@expo/vector-icons/Ionicons";
import { Pressable, Text, View } from "react-native";

import type { ConnectionItem } from "../domain/connection-item";

const typeLabel: Record<ConnectionItem["type"], string> = {
  dm: "Direct",
  group: "Group",
};

export function ConnectionRow({
  item,
  onOpenProfile,
  onPress,
}: {
  item: ConnectionItem;
  onOpenProfile?: (item: ConnectionItem) => void;
  onPress?: (item: ConnectionItem) => void;
}) {
  return (
    <Pressable
      className="flex-row items-start gap-3 rounded-[28px] border border-white/8 bg-white/[0.03] px-4 py-4"
      onPress={() => onPress?.(item)}
      style={({ pressed }) => ({ opacity: pressed ? 0.9 : 1 })}
    >
      <View className="mt-0.5 h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/[0.05]">
        <Ionicons
          color="rgba(255,255,255,0.8)"
          name="people-outline"
          size={18}
        />
      </View>
      <View className="min-w-0 flex-1 gap-1">
        <View className="flex-row items-center gap-2">
          <Text className="text-[16px] font-semibold tracking-[-0.03em] text-white/94">
            {item.title}
          </Text>
          {item.unreadCount > 0 ? (
            <View className="rounded-full bg-white px-2 py-0.5">
              <Text className="text-[10px] font-semibold text-[#050506]">
                {item.unreadCount > 9 ? "9+" : item.unreadCount}
              </Text>
            </View>
          ) : null}
        </View>
        <Text className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/34">
          {typeLabel[item.type]} · {item.connectionStatus}
        </Text>
        <Text className="text-[14px] leading-[20px] text-white/58">
          {item.subtitle}
        </Text>
        {item.type === "dm" && item.targetUserId ? (
          <Pressable
            className="mt-2 self-start rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5"
            onPress={() => onOpenProfile?.(item)}
            style={({ pressed }) => ({ opacity: pressed ? 0.88 : 1 })}
          >
            <Text className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/72">
              View profile
            </Text>
          </Pressable>
        ) : null}
      </View>
    </Pressable>
  );
}
