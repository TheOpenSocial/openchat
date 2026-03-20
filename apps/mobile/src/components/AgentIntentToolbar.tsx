import { Pressable, Text, View } from "react-native";

import { appTheme } from "../theme";

interface AgentIntentToolbarProps {
  loading: boolean;
  canRegenerate: boolean;
  onStop: () => void;
  onRegenerate: () => void;
}

export function AgentIntentToolbar({
  canRegenerate,
  loading,
  onRegenerate,
  onStop,
}: AgentIntentToolbarProps) {
  if (!loading && !canRegenerate) {
    return null;
  }

  return (
    <View className="mb-2 flex-row flex-wrap gap-2">
      {loading ? (
        <Pressable
          accessibilityLabel="Stop sending"
          accessibilityRole="button"
          className="rounded-full border border-hairline bg-surface px-3.5 py-2"
          onPress={onStop}
          style={({ pressed }) => ({
            opacity: pressed ? appTheme.motion.pressOpacity : 1,
          })}
          testID="agent-stop-button"
        >
          <Text className="text-[13px] font-semibold text-ink">Stop</Text>
        </Pressable>
      ) : null}
      {canRegenerate && !loading ? (
        <Pressable
          accessibilityLabel="Regenerate last message"
          accessibilityRole="button"
          className="rounded-full border border-hairline bg-surfaceMuted px-3.5 py-2"
          onPress={onRegenerate}
          style={({ pressed }) => ({
            opacity: pressed ? appTheme.motion.pressOpacity : 1,
          })}
          testID="agent-regenerate-button"
        >
          <Text className="text-[13px] font-semibold text-ink">Regenerate</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
