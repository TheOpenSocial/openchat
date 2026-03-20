import { FlashList, type ListRenderItem } from "@shopify/flash-list";
import { useMemo } from "react";
import type { ReactElement } from "react";
import { View } from "react-native";

interface ChatTranscriptListProps<T extends { id: string }> {
  messages: T[];
  renderBubble: (item: T) => ReactElement;
}

export function ChatTranscriptList<T extends { id: string }>({
  messages,
  renderBubble,
}: ChatTranscriptListProps<T>) {
  const data = useMemo(() => [...messages].reverse(), [messages]);

  const renderItem: ListRenderItem<T> = ({ item }) => renderBubble(item);

  return (
    <View className="min-h-[120px] flex-1">
      <FlashList
        data={data}
        drawDistance={250}
        inverted
        keyExtractor={(item) => item.id}
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        renderItem={renderItem}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}
