import Ionicons from "@expo/vector-icons/Ionicons";
import { ActivityIndicator, Pressable, Text, View } from "react-native";

import type { RecurringCircleItem } from "../domain/recurring-item";

const visibilityLabel: Record<RecurringCircleItem["visibility"], string> = {
  discoverable: "Discoverable",
  invite_only: "Invite only",
  private: "Private",
};

export function CircleRow({
  acting,
  item,
  onRunNow,
}: {
  acting: boolean;
  item: RecurringCircleItem;
  onRunNow: (circleId: string) => void;
}) {
  return (
    <View className="rounded-[28px] border border-white/8 bg-white/[0.03] px-4 py-4">
      <View className="flex-row items-start justify-between gap-4">
        <View className="flex-1 gap-1.5">
          <Text className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/34">
            {visibilityLabel[item.visibility]} · {item.status}
          </Text>
          <Text className="text-[18px] font-semibold tracking-[-0.03em] text-white/94">
            {item.title}
          </Text>
          <Text className="text-[14px] leading-[20px] text-white/58">
            {item.description || "No description yet."}
          </Text>
        </View>
        <View className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-2">
          <Ionicons
            color="rgba(255,255,255,0.84)"
            name="refresh-outline"
            size={16}
          />
        </View>
      </View>

      <View className="mt-4 flex-row items-center justify-between">
        <View className="gap-1">
          <Text className="text-[12px] font-semibold uppercase tracking-[0.12em] text-white/34">
            Next session
          </Text>
          <Text className="text-[14px] text-white/82">
            {item.nextSessionLabel}
          </Text>
          <Text className="text-[12px] text-white/42">
            {item.sessionCount} session{item.sessionCount === 1 ? "" : "s"} in
            history
          </Text>
        </View>

        <Pressable
          className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2.5"
          disabled={acting}
          onPress={() => onRunNow(item.id)}
          style={({ pressed }) => ({ opacity: pressed || acting ? 0.88 : 1 })}
        >
          {acting ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text className="text-[12px] font-semibold uppercase tracking-[0.12em] text-white/82">
              Run now
            </Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}
