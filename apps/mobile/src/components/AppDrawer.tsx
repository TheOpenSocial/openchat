import Ionicons from "@expo/vector-icons/Ionicons";
import type { ComponentProps } from "react";
import { Modal, Platform, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { appTheme } from "../theme";
import type { HomeTab } from "../types";

interface AppDrawerProps {
  visible: boolean;
  onClose: () => void;
  displayName: string;
  onNavigate: (tab: HomeTab) => void;
  onNewAgentConversation: () => void;
}

type IonName = ComponentProps<typeof Ionicons>["name"];

const ROWS: Array<{ tab: HomeTab; label: string; icon: IonName }> = [
  { tab: "home", label: "Home", icon: "sparkles-outline" },
  { tab: "chats", label: "Chats", icon: "chatbubble-outline" },
  { tab: "profile", label: "Profile", icon: "person-circle-outline" },
];

export function AppDrawer({
  displayName,
  onClose,
  onNavigate,
  onNewAgentConversation,
  visible,
}: AppDrawerProps) {
  const insets = useSafeAreaInsets();

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
              accessibilityLabel="Close menu"
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
              New conversation
            </Text>
            <Text className="mt-1 text-[12px] leading-[17px] text-muted">
              Clear this conversation and start fresh on this device.
            </Text>
          </Pressable>

          <Text className="mb-2 px-4 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
            Navigate
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
                {row.label}
              </Text>
            </Pressable>
          ))}
        </View>
        <Pressable
          accessibilityLabel="Dismiss menu"
          accessibilityRole="button"
          className="flex-1 bg-black/50"
          onPress={onClose}
          testID="home-drawer-scrim"
        />
      </View>
    </Modal>
  );
}
