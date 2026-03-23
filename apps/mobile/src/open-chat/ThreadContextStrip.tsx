import { Text, View } from "react-native";

import type { ThreadPhase } from "./thread-types";

type ThreadContextStripProps = {
  phase: ThreadPhase;
  hint: string | null;
};

const PHASE_LABEL: Record<ThreadPhase, string | null> = {
  empty: null,
  active: "Working on it",
  partial: "In progress",
  ready: "Ready",
  no_match: "No match yet",
  follow_up: null,
};

/**
 * Lightweight status line — calm, system-level (not a notification).
 */
export function ThreadContextStrip({ hint, phase }: ThreadContextStripProps) {
  const label = PHASE_LABEL[phase];
  if (!label && !hint) {
    return null;
  }

  return (
    <View className="mb-2 mt-1 flex-row items-center gap-2 px-1">
      {label ? (
        <View className="rounded-full border border-white/[0.08] bg-white/[0.03] px-2.5 py-1">
          <Text className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/34">
            {label}
          </Text>
        </View>
      ) : null}
      {hint ? (
        <Text
          className="min-w-0 flex-1 text-[12px] leading-[18px] text-white/38"
          numberOfLines={2}
        >
          {hint}
        </Text>
      ) : null}
    </View>
  );
}
