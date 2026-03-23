import Ionicons from "@expo/vector-icons/Ionicons";
import type { ComponentProps } from "react";
import { Platform, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { type AppLocale, t } from "../i18n/strings";
import { cn } from "../lib/cn";
import { appTheme } from "../theme";
import type { HomeTab } from "../types";

const TAB_ORDER: HomeTab[] = ["home", "chats", "profile"];

type IonName = ComponentProps<typeof Ionicons>["name"];

const TAB_META: Record<
  HomeTab,
  {
    labelKey: "homeTabHome" | "homeTabChats" | "homeTabProfile";
    hintKey: "homeTabHomeHint" | "homeTabChatsHint" | "homeTabProfileHint";
    iconActive: IonName;
    iconIdle: IonName;
  }
> = {
  home: {
    labelKey: "homeTabHome",
    hintKey: "homeTabHomeHint",
    iconActive: "sparkles",
    iconIdle: "sparkles-outline",
  },
  chats: {
    labelKey: "homeTabChats",
    hintKey: "homeTabChatsHint",
    iconActive: "chatbubbles",
    iconIdle: "chatbubble-outline",
  },
  profile: {
    labelKey: "homeTabProfile",
    hintKey: "homeTabProfileHint",
    iconActive: "person-circle",
    iconIdle: "person-circle-outline",
  },
};

interface HomeTabBarProps {
  activeTab: HomeTab;
  onChange: (tab: HomeTab) => void;
  locale: AppLocale;
}

export function HomeTabBar({ activeTab, locale, onChange }: HomeTabBarProps) {
  const insets = useSafeAreaInsets();
  const bottomPad = Math.max(insets.bottom, 12);

  return (
    <View
      className="border-t border-white/[0.06] bg-[#070708]"
      style={{
        paddingBottom: bottomPad,
        ...Platform.select({
          ios: {
            shadowColor: "#000",
            shadowOffset: { width: 0, height: -2 },
            shadowOpacity: 0.16,
            shadowRadius: 12,
          },
          android: { elevation: 8 },
        }),
      }}
    >
      <View className="flex-row items-stretch justify-between gap-1 px-2 pt-2">
        {TAB_ORDER.map((tabKey) => {
          const active = tabKey === activeTab;
          const meta = TAB_META[tabKey];
          const iconName = active ? meta.iconActive : meta.iconIdle;
          const iconColor = active
            ? appTheme.colors.ink
            : "rgba(255,255,255,0.34)";

          return (
            <Pressable
              accessibilityHint={t(meta.hintKey, locale)}
              accessibilityLabel={t(meta.labelKey, locale)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              android_ripple={
                Platform.OS === "android"
                  ? { color: "rgba(255,255,255,0.06)", borderless: true }
                  : undefined
              }
              className={cn(
                "min-w-0 flex-1 items-center rounded-[18px] py-2.5",
                active ? "bg-white" : "bg-transparent",
              )}
              key={tabKey}
              onPress={() => onChange(tabKey)}
              style={({ pressed }) => ({
                opacity: pressed ? appTheme.motion.pressOpacity : 1,
              })}
            >
              <View
                collapsable={false}
                pointerEvents="none"
                className="items-center"
                testID={`home-tab-${tabKey}`}
              >
                <Ionicons
                  color={iconColor}
                  name={iconName}
                  size={active ? 22 : 21}
                  style={{ marginBottom: 4 }}
                />
                <Text
                  className={cn(
                    "text-[10px] font-semibold tracking-[0.02em]",
                    active ? "text-[#0d0d0d]" : "text-white/36",
                  )}
                  numberOfLines={1}
                >
                  {t(meta.labelKey, locale)}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
