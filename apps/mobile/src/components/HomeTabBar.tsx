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
  const bottomPad = Math.max(insets.bottom, 10);

  return (
    <View
      className="border-t border-hairline/60 bg-surfaceMuted/98"
      style={{
        paddingBottom: bottomPad,
        ...Platform.select({
          ios: {
            shadowColor: "#000",
            shadowOffset: { width: 0, height: -2 },
            shadowOpacity: 0.22,
            shadowRadius: 8,
          },
          android: { elevation: 10 },
        }),
      }}
    >
      <View className="flex-row items-stretch justify-between gap-0.5 px-1 pt-1.5">
        {TAB_ORDER.map((tabKey) => {
          const active = tabKey === activeTab;
          const meta = TAB_META[tabKey];
          const iconName = active ? meta.iconActive : meta.iconIdle;
          const iconColor = active
            ? appTheme.colors.accent
            : appTheme.colors.muted;

          return (
            <Pressable
              accessibilityHint={t(meta.hintKey, locale)}
              accessibilityLabel={t(meta.labelKey, locale)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              android_ripple={
                Platform.OS === "android"
                  ? { color: "rgba(255,255,255,0.08)", borderless: true }
                  : undefined
              }
              className={cn(
                "min-w-0 flex-1 items-center rounded-2xl py-2",
                active ? "bg-surface/90" : "bg-transparent",
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
                testID={`home-tab-${tabKey}`}
              >
                <Ionicons
                  color={iconColor}
                  name={iconName}
                  size={active ? 24 : 22}
                  style={{ marginBottom: 3 }}
                />
                <Text
                  className={cn(
                    "text-[10px] font-semibold tracking-wide",
                    active ? "text-accent" : "text-muted",
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
