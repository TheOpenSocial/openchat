import { ActivityIndicator, Text, View } from "react-native";

import { appTheme } from "../theme";

interface LoadingStateProps {
  label: string;
}

export function LoadingState({ label }: LoadingStateProps) {
  return (
    <View className="flex-1 items-center justify-center bg-canvas">
      <ActivityIndicator color={appTheme.colors.accent} />
      <Text className="mt-4 text-[14px] leading-5 text-muted">{label}</Text>
    </View>
  );
}
