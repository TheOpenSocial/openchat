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
    <View className="mb-2 rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2">
      {label ? (
        <Text className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/40">
          {label}
        </Text>
      ) : null}
      {hint ? (
        <Text
          className={`text-[13px] leading-[18px] text-white/55 ${label ? "mt-1" : ""}`}
          numberOfLines={3}
        >
          {hint}
        </Text>
      ) : null}
    </View>
  );
}
