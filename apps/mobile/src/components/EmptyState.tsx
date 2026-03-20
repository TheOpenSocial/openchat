import { Text, View } from "react-native";

interface EmptyStateProps {
  title: string;
  description: string;
}

export function EmptyState({ title, description }: EmptyStateProps) {
  return (
    <View className="items-center rounded-2xl border border-hairline/80 bg-surfaceMuted/55 px-6 py-10">
      <Text className="mb-2.5 text-center text-[17px] font-semibold tracking-tight text-ink">
        {title}
      </Text>
      <Text className="max-w-[280px] text-center text-[13px] leading-[20px] text-muted">
        {description}
      </Text>
    </View>
  );
}
