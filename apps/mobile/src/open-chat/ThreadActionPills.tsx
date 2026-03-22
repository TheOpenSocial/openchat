import { Pressable, ScrollView, Text, View } from "react-native";

import { appTheme } from "../theme";

export type ThreadActionSpec = { id: string; label: string };

type ThreadActionPillsProps = {
  actions: ThreadActionSpec[];
  onAction: (id: string) => void;
};

export function ThreadActionPills({
  actions,
  onAction,
}: ThreadActionPillsProps) {
  if (!actions.length) return null;

  return (
    <View className="mb-2">
      <ScrollView
        contentContainerStyle={{ gap: 8, paddingVertical: 2 }}
        horizontal
        showsHorizontalScrollIndicator={false}
      >
        {actions.map((a) => (
          <Pressable
            accessibilityLabel={a.label}
            accessibilityRole="button"
            className="rounded-full border border-white/14 bg-white/[0.06] px-3.5 py-2"
            key={a.id}
            onPress={() => onAction(a.id)}
            style={({ pressed }) => ({
              opacity: pressed ? appTheme.motion.pressOpacity : 1,
            })}
          >
            <Text className="text-[13px] font-medium text-white/80">
              {a.label}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}
