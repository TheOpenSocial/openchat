import Ionicons from "@expo/vector-icons/Ionicons";
import { useEffect } from "react";
import type { LayoutChangeEvent } from "react-native";
import { Pressable, Text, View } from "react-native";
import Animated, {
  Easing,
  interpolate,
  type SharedValue,
  useAnimatedKeyboard,
  useDerivedValue,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { THREAD_RUNTIME_MOTION } from "../open-chat/runtime-constants";
import { appTheme } from "../theme";
import type { HomeTab } from "../types";

export type MainAppTab = HomeTab;

interface AppBottomTabsProps {
  activeTab: MainAppTab;
  unreadChats?: number;
  onChange: (tab: MainAppTab) => void;
}

const TAB_ORDER: MainAppTab[] = ["chats", "home", "profile"];

const TAB_META: Record<
  MainAppTab,
  {
    icon: React.ComponentProps<typeof Ionicons>["name"];
    label: string;
    hint: string;
  }
> = {
  chats: {
    icon: "chatbubble-outline",
    label: "Chats",
    hint: "Tab 1 of 3. Shows your conversations.",
  },
  home: {
    icon: "sparkles-outline",
    label: "Home",
    hint: "Tab 2 of 3. Opens the home workspace.",
  },
  profile: {
    icon: "person-outline",
    label: "Profile",
    hint: "Tab 3 of 3. Opens your profile.",
  },
};

function tabIndex(tab: MainAppTab) {
  return TAB_ORDER.indexOf(tab);
}

type TabItemProps = {
  activeIndex: SharedValue<number>;
  badgeCount?: number;
  index: number;
  isActive: boolean;
  tab: MainAppTab;
  onPress: () => void;
};

function TabItem({
  activeIndex,
  badgeCount = 0,
  index,
  isActive,
  onPress,
  tab,
}: TabItemProps) {
  const meta = TAB_META[tab];

  const animatedIconStyle = useAnimatedStyle(() => {
    const distance = Math.abs(activeIndex.value - index);
    const scale = interpolate(distance, [0, 1], [1.02, 0.98]);
    const translateY = interpolate(distance, [0, 1], [-0.5, 0]);

    return {
      transform: [{ translateY }, { scale }],
    };
  }, [index]);

  return (
    <Pressable
      accessibilityHint={meta.hint}
      accessibilityLabel={meta.label}
      accessibilityRole="tab"
      accessibilityState={{ selected: isActive }}
      hitSlop={10}
      onPress={onPress}
      style={({ pressed }) => ({
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        minHeight: 56,
        opacity: pressed ? appTheme.motion.pressOpacity : 1,
        transform: [{ scale: pressed ? 0.988 : 1 }],
      })}
      testID={`app-bottom-tab-${tab}`}
    >
      <Animated.View
        className="h-10 w-10 items-center justify-center"
        style={animatedIconStyle}
      >
        <View className="h-10 w-10 items-center justify-center">
          <Ionicons
            color={isActive ? appTheme.colors.background : appTheme.colors.ink}
            style={{ opacity: isActive ? 1 : 0.62 }}
            name={meta.icon}
            size={20}
          />
          {badgeCount > 0 ? (
            <View className="absolute right-0 top-1 h-1.5 w-1.5 rounded-full bg-ink" />
          ) : null}
        </View>
        <Text
          className={`text-[10px] font-semibold tracking-[0.02em] ${
            isActive ? "text-canvas" : "text-muted"
          }`}
          allowFontScaling
          minimumFontScale={0.8}
          numberOfLines={1}
        >
          {meta.label}
        </Text>
      </Animated.View>
    </Pressable>
  );
}

export function AppBottomTabs({
  activeTab,
  onChange,
  unreadChats = 0,
}: AppBottomTabsProps) {
  const insets = useSafeAreaInsets();
  const keyboard = useAnimatedKeyboard();
  const activeIndex = useSharedValue(tabIndex(activeTab));
  const containerWidth = useSharedValue(288);

  useEffect(() => {
    activeIndex.value = withTiming(tabIndex(activeTab), {
      duration: 280,
      easing: Easing.bezier(0.22, 1, 0.36, 1),
    });
  }, [activeIndex, activeTab]);

  const handleLayout = (event: LayoutChangeEvent) => {
    containerWidth.value = event.nativeEvent.layout.width;
  };

  const indicatorStyle = useAnimatedStyle(() => {
    const slotWidth = containerWidth.value / 3;
    const indicatorWidth = Math.max(slotWidth - 36, 0);
    const centeredOffset = Math.max(0, (slotWidth - indicatorWidth) / 2);

    return {
      opacity: 0.82,
      width: indicatorWidth,
      transform: [
        {
          translateX: slotWidth * activeIndex.value + centeredOffset,
        },
      ],
    };
  });

  const keyboardVisibility = useDerivedValue(() =>
    keyboard.height.value > 0
      ? withTiming(1, {
          duration: THREAD_RUNTIME_MOTION.keyboardTabBar.hideDurationMs,
          easing: Easing.out(Easing.cubic),
        })
      : withTiming(0, {
          duration: THREAD_RUNTIME_MOTION.keyboardTabBar.showDurationMs,
          easing: Easing.out(Easing.cubic),
        }),
  );

  const shellStyle = useAnimatedStyle(() => {
    return {
      opacity: 1 - keyboardVisibility.value,
      transform: [
        {
          translateY: interpolate(
            keyboardVisibility.value,
            [0, 1],
            [0, THREAD_RUNTIME_MOTION.keyboardTabBar.hiddenOffsetY],
          ),
        },
      ],
    };
  }, []);

  return (
    <Animated.View
      className="absolute inset-x-0 bottom-0 z-30"
      pointerEvents="box-none"
      style={shellStyle}
    >
      <View
        accessibilityLabel="Primary navigation tabs"
        accessibilityRole="tablist"
        className="overflow-hidden"
        onLayout={handleLayout}
        style={{
          paddingBottom: Math.max(insets.bottom, 8),
          backgroundColor: appTheme.colors.background,
          borderTopColor: appTheme.colors.hairline,
          borderTopWidth: 1,
          shadowColor: appTheme.colors.background,
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: 0.14,
          shadowRadius: 12,
          width: "100%",
        }}
      >
        <View>
          <View className="overflow-hidden">
            <Animated.View
              className="absolute bottom-[5px] left-0 top-[5px] rounded-full border border-hairline bg-ink"
              style={indicatorStyle}
            />
            <View className="flex-row items-center py-[3px]">
              <TabItem
                activeIndex={activeIndex}
                badgeCount={unreadChats}
                index={0}
                isActive={activeTab === "chats"}
                onPress={() => onChange("chats")}
                tab="chats"
              />
              <TabItem
                activeIndex={activeIndex}
                index={1}
                isActive={activeTab === "home"}
                onPress={() => onChange("home")}
                tab="home"
              />
              <TabItem
                activeIndex={activeIndex}
                index={2}
                isActive={activeTab === "profile"}
                onPress={() => onChange("profile")}
                tab="profile"
              />
            </View>
          </View>
        </View>
      </View>
    </Animated.View>
  );
}
