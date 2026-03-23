import Ionicons from "@expo/vector-icons/Ionicons";
import type { ComponentProps } from "react";
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Modal,
  Platform,
  Pressable,
  Text,
  View,
} from "react-native";
import { useEffect, useRef, useState } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { type AppLocale, t } from "../i18n/strings";
import type { HomeTab } from "../types";

interface AppDrawerProps {
  visible: boolean;
  onClose: () => void;
  displayName: string;
  onNavigate: (tab: HomeTab) => void;
  onNewAgentConversation: () => void;
  locale: AppLocale;
}

type IonName = ComponentProps<typeof Ionicons>["name"];

const ROWS: Array<{
  tab: HomeTab;
  labelKey: keyof ReturnType<typeof buildLabels>;
  icon: IonName;
}> = [
  { tab: "home", labelKey: "home", icon: "sparkles-outline" },
  { tab: "chats", labelKey: "chats", icon: "chatbubble-outline" },
  { tab: "profile", labelKey: "profile", icon: "person-circle-outline" },
];

function buildLabels(locale: AppLocale) {
  return {
    home: t("homeTabHome", locale),
    chats: t("homeTabChats", locale),
    profile: t("homeTabProfile", locale),
  };
}

export function AppDrawer({
  displayName,
  locale,
  onClose,
  onNavigate,
  onNewAgentConversation,
  visible,
}: AppDrawerProps) {
  const insets = useSafeAreaInsets();
  const labels = buildLabels(locale);
  const [mounted, setMounted] = useState(visible);
  const [reduceMotion, setReduceMotion] = useState(false);
  const progress = useRef(new Animated.Value(visible ? 1 : 0)).current;

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled()
      .then(setReduceMotion)
      .catch(() => {});

    const subscription = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      setReduceMotion,
    );

    return () => {
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    if (visible) {
      setMounted(true);
    }

    if (reduceMotion) {
      progress.setValue(visible ? 1 : 0);
      if (!visible) {
        setMounted(false);
      }
      return;
    }

    Animated.timing(progress, {
      toValue: visible ? 1 : 0,
      duration: visible ? 220 : 180,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished && !visible) {
        setMounted(false);
      }
    });
  }, [progress, reduceMotion, visible]);

  if (!mounted) {
    return null;
  }

  return (
    <Modal
      animationType="none"
      onRequestClose={onClose}
      transparent
      visible={mounted}
    >
      <View className="flex-1 flex-row" testID="home-drawer-sheet">
        <Animated.View
          className="h-full w-[84%] max-w-[336px] bg-[#070708]"
          style={{
            paddingTop: Math.max(insets.top, 18),
            transform: [
              {
                translateX: progress.interpolate({
                  inputRange: [0, 1],
                  outputRange: [-28, 0],
                }),
              },
              {
                scale: progress.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.985, 1],
                }),
              },
            ],
            opacity: progress.interpolate({
              inputRange: [0, 1],
              outputRange: [0.82, 1],
            }),
          }}
        >
          <View className="mb-8 flex-row items-center justify-between px-5">
            <View className="min-w-0 flex-1 pr-2">
              <Text className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/28">
                OpenSocial
              </Text>
              <Text
                className="mt-2 text-[21px] font-semibold tracking-tight text-white"
                numberOfLines={1}
              >
                {displayName}
              </Text>
            </View>
            <Pressable
              accessibilityLabel={t("homeDrawerCloseMenu", locale)}
              accessibilityRole="button"
              android_ripple={
                Platform.OS === "android"
                  ? { color: "rgba(255,255,255,0.12)", borderless: true }
                  : undefined
              }
              className="rounded-full p-2"
              hitSlop={12}
              onPress={onClose}
              style={({ pressed }) => ({ opacity: pressed ? 0.75 : 1 })}
              testID="home-drawer-close"
            >
              <Ionicons color="rgba(255,255,255,0.46)" name="close" size={24} />
            </Pressable>
          </View>

          <Pressable
            accessibilityRole="button"
            android_ripple={
              Platform.OS === "android"
                ? { color: "rgba(255,255,255,0.06)", borderless: false }
                : undefined
            }
            className="mx-4 mb-6 rounded-[24px] border border-white/[0.08] bg-white px-4 py-4"
            onPress={() => {
              onNewAgentConversation();
              onClose();
            }}
            style={({ pressed }) => ({
              opacity: 1,
              transform: [{ scale: pressed ? 0.985 : 1 }],
            })}
            testID="home-drawer-new-conversation"
          >
            <Text className="text-[15px] font-semibold text-[#0d0d0d]">
              {t("homeDrawerNewConversation", locale)}
            </Text>
            <Text className="mt-1.5 text-[12px] leading-[18px] text-[#0d0d0d]/55">
              {t("homeDrawerNewConversationBody", locale)}
            </Text>
          </Pressable>

          <Text className="mb-3 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/28">
            {t("homeDrawerNavigate", locale)}
          </Text>
          <View className="mx-3 gap-1">
            {ROWS.map((row) => (
              <Pressable
                accessibilityRole="button"
                android_ripple={
                  Platform.OS === "android"
                    ? { color: "rgba(255,255,255,0.06)", borderless: false }
                    : undefined
                }
                className="flex-row items-center gap-3 rounded-[18px] px-4 py-3.5"
                key={row.tab}
                onPress={() => {
                  onNavigate(row.tab);
                  onClose();
                }}
                style={({ pressed }) => ({
                  backgroundColor: pressed
                    ? "rgba(255,255,255,0.05)"
                    : "transparent",
                })}
                testID={`home-drawer-tab-${row.tab}`}
              >
                <View className="h-9 w-9 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.03]">
                  <Ionicons
                    color="rgba(255,255,255,0.76)"
                    name={row.icon}
                    size={20}
                  />
                </View>
                <Text className="text-[16px] font-medium text-white/82">
                  {labels[row.labelKey]}
                </Text>
              </Pressable>
            ))}
          </View>
        </Animated.View>
        <Animated.View
          className="flex-1"
          pointerEvents={visible ? "auto" : "none"}
          style={{
            backgroundColor: progress.interpolate({
              inputRange: [0, 1],
              outputRange: ["rgba(0,0,0,0)", "rgba(0,0,0,0.58)"],
            }),
          }}
        >
          <Pressable
          accessibilityLabel={t("homeDrawerDismissMenu", locale)}
          accessibilityRole="button"
          className="flex-1"
          onPress={onClose}
          testID="home-drawer-scrim"
        />
        </Animated.View>
      </View>
    </Modal>
  );
}
