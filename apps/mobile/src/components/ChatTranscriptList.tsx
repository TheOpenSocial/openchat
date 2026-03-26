import { useMemo, useRef, type RefObject } from "react";
import type { ReactElement } from "react";
import {
  FlatList,
  Keyboard,
  type ListRenderItem,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  View,
} from "react-native";

interface ChatTranscriptListProps<T extends { id: string }> {
  messages: T[];
  renderBubble: (item: T) => ReactElement;
  contentPaddingBottom?: number;
  contentPaddingTop?: number;
  onAtBottomChange?: (atBottom: boolean) => void;
  listRef?: RefObject<FlatList<T> | null>;
}

export function ChatTranscriptList<T extends { id: string }>({
  contentPaddingBottom = 0,
  contentPaddingTop = 0,
  messages,
  onAtBottomChange,
  renderBubble,
  listRef,
}: ChatTranscriptListProps<T>) {
  const data = useMemo(() => [...messages], [messages]);
  const fallbackListRef = useRef<FlatList<T>>(null);
  const scrollRef = listRef ?? fallbackListRef;

  const renderItem: ListRenderItem<T> = ({ item }) => renderBubble(item);
  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!onAtBottomChange) return;
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const distanceFromBottom =
      contentSize.height - (contentOffset.y + layoutMeasurement.height);
    onAtBottomChange(distanceFromBottom <= 28);
  };

  return (
    <View className="min-h-[120px] flex-1">
      <FlatList
        className="flex-1"
        contentContainerStyle={{
          flexGrow: 1,
          paddingBottom: contentPaddingBottom,
          paddingTop: contentPaddingTop,
        }}
        data={data}
        keyExtractor={(item) => item.id}
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="never"
        onScrollBeginDrag={() => {
          Keyboard.dismiss();
        }}
        onScroll={onAtBottomChange ? handleScroll : undefined}
        ref={scrollRef}
        renderItem={renderItem}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        style={{ flex: 1 }}
      />
    </View>
  );
}
