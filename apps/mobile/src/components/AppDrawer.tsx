import Ionicons from "@expo/vector-icons/Ionicons";
import type { ComponentProps } from "react";
import { Modal, Platform, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { type AppLocale, t } from "../i18n/strings";
import { appTheme } from "../theme";
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

  return (
    <Modal
      animationType="fade"
      onRequestClose={onClose}
      transparent
      visible={visible}
    >
      <View className="flex-1 flex-row" testID="home-drawer-sheet">
        <View
          className="h-full w-[82%] max-w-[320px] border-r border-hairline bg-canvas"
          style={{ paddingTop: Math.max(insets.top, 16) }}
        >
          <View className="mb-6 flex-row items-center justify-between px-4">
            <View className="min-w-0 flex-1 pr-2">
              <Text className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
                OpenSocial
              </Text>
              <Text
                className="mt-1.5 text-[18px] font-semibold tracking-tight text-ink"
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
              <Ionicons color={appTheme.colors.muted} name="close" size={24} />
            </Pressable>
          </View>

          <Pressable
            accessibilityRole="button"
            android_ripple={
              Platform.OS === "android"
                ? { color: "rgba(255,255,255,0.08)", borderless: false }
                : undefined
            }
            className="mx-3 mb-4 rounded-2xl border border-hairline/90 bg-surface px-4 py-3.5"
            onPress={() => {
              onNewAgentConversation();
              onClose();
            }}
            style={({ pressed }) => ({ opacity: pressed ? 0.92 : 1 })}
            testID="home-drawer-new-conversation"
          >
            <Text className="text-[15px] font-semibold text-accent">
              {t("homeDrawerNewConversation", locale)}
            </Text>
            <Text className="mt-1 text-[12px] leading-[17px] text-muted">
              {t("homeDrawerNewConversationBody", locale)}
            </Text>
          </Pressable>

          <Text className="mb-2 px-4 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
            {t("homeDrawerNavigate", locale)}
          </Text>
          {ROWS.map((row) => (
            <Pressable
              accessibilityRole="button"
              android_ripple={
                Platform.OS === "android"
                  ? { color: "rgba(255,255,255,0.08)", borderless: false }
                  : undefined
              }
              className="flex-row items-center gap-3 px-4 py-3.5 active:bg-surfaceMuted/80"
              key={row.tab}
              onPress={() => {
                onNavigate(row.tab);
                onClose();
              }}
              style={({ pressed }) => ({
                opacity: pressed ? 0.92 : 1,
              })}
              testID={`home-drawer-tab-${row.tab}`}
            >
              <Ionicons color={appTheme.colors.ink} name={row.icon} size={22} />
              <Text className="text-[16px] font-medium text-ink">
                {labels[row.labelKey]}
              </Text>
            </Pressable>
          ))}
        </View>
        <Pressable
          accessibilityLabel={t("homeDrawerDismissMenu", locale)}
          accessibilityRole="button"
          className="flex-1 bg-black/50"
          onPress={onClose}
          testID="home-drawer-scrim"
        />
      </View>
    </Modal>
  );
}
