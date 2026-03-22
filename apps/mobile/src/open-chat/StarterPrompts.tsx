import { Pressable, Text, View } from "react-native";

import { appTheme } from "../theme";

const STARTERS: Array<{ label: string; body: string }> = [
  {
    label: "Talk about something",
    body: "I want to talk about something on my mind.",
  },
  {
    label: "Find people for tonight",
    body: "Find people who are free to hang out tonight.",
  },
  {
    label: "Meet someone new",
    body: "I want to meet someone new around a shared interest.",
  },
  {
    label: "Start with a small group",
    body: "I’m open to a small group around a topic I care about.",
  },
  {
    label: "Explore what’s happening",
    body: "What’s happening near me that fits my interests?",
  },
];

type StarterPromptsProps = {
  onPick: (text: string) => void;
};

export function StarterPrompts({ onPick }: StarterPromptsProps) {
  return (
    <View className="gap-3">
      {STARTERS.map((row) => (
        <Pressable
          accessibilityHint="Uses this as your first message"
          accessibilityLabel={row.label}
          accessibilityRole="button"
          className="rounded-2xl border border-white/[0.08] bg-white/[0.04] px-4 py-3.5 active:bg-white/[0.07]"
          key={row.label}
          onPress={() => onPick(row.body)}
          style={({ pressed }) => ({
            opacity: pressed ? appTheme.motion.pressOpacity : 1,
          })}
        >
          <Text className="text-[15px] font-medium text-white/92">
            {row.label}
          </Text>
          <Text
            className="mt-1 text-[13px] leading-[18px] text-white/42"
            numberOfLines={2}
          >
            {row.body}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
