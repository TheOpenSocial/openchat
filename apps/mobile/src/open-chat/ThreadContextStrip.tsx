import { Text, View } from "react-native";

type ThreadContextStripProps = {
  label: string | null;
  hint: string | null;
};

/**
 * Lightweight status line — calm, system-level (not a notification).
 */
export function ThreadContextStrip({ hint, label }: ThreadContextStripProps) {
  if (!label && !hint) {
    return null;
  }

  return (
    <View className="mb-3 mt-1 flex-row items-center gap-2 px-0.5">
      {label ? (
        <View className="rounded-full border border-white/[0.07] bg-white/[0.025] px-2.5 py-1">
          <Text className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/32">
            {label}
          </Text>
        </View>
      ) : null}
      {hint ? (
        <Text
          className="min-w-0 flex-1 text-[12px] leading-[18px] text-white/34"
          numberOfLines={2}
        >
          {hint}
        </Text>
      ) : null}
    </View>
  );
}
