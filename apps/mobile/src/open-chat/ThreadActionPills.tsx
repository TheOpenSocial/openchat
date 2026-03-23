import { Pressable, ScrollView, Text, View } from "react-native";

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
    <View className="mb-1.5 mt-1">
      <ScrollView
        contentContainerStyle={{ gap: 8, paddingVertical: 2 }}
        horizontal
        showsHorizontalScrollIndicator={false}
      >
        {actions.map((a) => (
          <Pressable
            accessibilityLabel={a.label}
            accessibilityRole="button"
            className="rounded-full border border-white/[0.08] bg-white/[0.03] px-3.5 py-2"
            key={a.id}
            onPress={() => onAction(a.id)}
            style={({ pressed }) => ({
              opacity: 1,
              transform: [{ scale: pressed ? 0.988 : 1 }],
            })}
          >
            <Text className="text-[13px] font-medium text-white/72">
              {a.label}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}
