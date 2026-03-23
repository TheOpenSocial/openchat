import { Pressable, Text, View } from "react-native";

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
    <View className="gap-2.5">
      {STARTERS.map((row) => (
        <Pressable
          accessibilityHint="Uses this as your first message"
          accessibilityLabel={row.label}
          accessibilityRole="button"
          className="rounded-[22px] border border-white/[0.06] bg-white/[0.02] px-4 py-3.5"
          key={row.label}
          onPress={() => onPick(row.body)}
          style={({ pressed }) => ({
            opacity: 1,
            transform: [{ scale: pressed ? 0.988 : 1 }],
          })}
        >
          <Text className="text-[15px] font-medium text-white/88">
            {row.label}
          </Text>
          <Text
            className="mt-1.5 text-[13px] leading-[19px] text-white/38"
            numberOfLines={2}
          >
            {row.body}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
