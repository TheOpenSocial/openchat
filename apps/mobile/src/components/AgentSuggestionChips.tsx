import { Pressable, ScrollView, Text } from "react-native";

import { appTheme } from "../theme";

const STARTERS: Array<{ label: string; body: string }> = [
  {
    label: "Reflect",
    body: "I’d like to talk through something that happened today.",
  },
  {
    label: "Tonight",
    body: "Looking for something low-key to do with people tonight.",
  },
  {
    label: "Connect",
    body: "I want to meet others who care about the same things I do.",
  },
];

interface AgentSuggestionChipsProps {
  onSelect: (text: string) => void;
  visible: boolean;
}

export function AgentSuggestionChips({
  onSelect,
  visible,
}: AgentSuggestionChipsProps) {
  if (!visible) {
    return null;
  }

  return (
    <ScrollView
      className="mb-2 max-h-28"
      contentContainerStyle={{
        alignItems: "stretch",
        gap: 8,
        paddingVertical: 4,
      }}
      horizontal
      showsHorizontalScrollIndicator={false}
    >
      {STARTERS.map((row) => (
        <Pressable
          accessibilityHint="Fills the message field with this suggestion"
          accessibilityLabel={`Suggestion: ${row.label}`}
          accessibilityRole="button"
          className="max-w-[220px] rounded-2xl border border-hairline/90 bg-surfaceMuted/75 px-3.5 py-2.5"
          key={row.body}
          onPress={() => onSelect(row.body)}
          style={({ pressed }) => ({
            opacity: pressed ? appTheme.motion.pressOpacity : 1,
          })}
        >
          <Text className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">
            {row.label}
          </Text>
          <Text
            className="mt-1 text-[13px] leading-[18px] text-ink"
            numberOfLines={3}
          >
            {row.body}
          </Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}
