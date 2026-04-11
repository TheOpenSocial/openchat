import Ionicons from "@expo/vector-icons/Ionicons";
import { Text, View } from "react-native";

import type { RecurringCircleSessionItem } from "../domain/recurring-item";

const statusTone: Record<
  string,
  { background: string; text: string; icon: keyof typeof Ionicons.glyphMap }
> = {
  completed: {
    background: "bg-emerald-400/[0.08]",
    icon: "checkmark-circle-outline",
    text: "text-emerald-200",
  },
  failed: {
    background: "bg-rose-400/[0.08]",
    icon: "alert-circle-outline",
    text: "text-rose-200",
  },
  queued: {
    background: "bg-sky-400/[0.08]",
    icon: "time-outline",
    text: "text-sky-200",
  },
  running: {
    background: "bg-amber-400/[0.08]",
    icon: "pulse-outline",
    text: "text-amber-200",
  },
};

export function CircleSessionRow({
  session,
}: {
  session: RecurringCircleSessionItem;
}) {
  const tone = statusTone[session.status] ?? statusTone.queued;

  return (
    <View className="flex-row items-start gap-3 rounded-[22px] border border-white/8 bg-white/[0.02] px-4 py-3">
      <View
        className={`mt-0.5 h-9 w-9 items-center justify-center rounded-full ${tone.background}`}
      >
        <Ionicons color="rgba(255,255,255,0.84)" name={tone.icon} size={16} />
      </View>
      <View className="min-w-0 flex-1 gap-1">
        <View className="flex-row items-center justify-between gap-3">
          <Text className="text-[14px] font-semibold tracking-[-0.02em] text-white/92">
            {session.scheduledForLabel}
          </Text>
          <Text className={`text-[11px] font-semibold uppercase ${tone.text}`}>
            {session.status}
          </Text>
        </View>
        {session.summary ? (
          <Text className="text-[13px] leading-[19px] text-white/58">
            {session.summary}
          </Text>
        ) : (
          <Text className="text-[13px] leading-[19px] text-white/42">
            No session summary yet.
          </Text>
        )}
        {session.generatedIntentId ? (
          <Text className="text-[11px] uppercase tracking-[0.12em] text-white/34">
            Intent {session.generatedIntentId.slice(0, 8)}
          </Text>
        ) : null}
      </View>
    </View>
  );
}
