import { BlurView } from "expo-blur";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { appTheme } from "../theme";

interface AppShellTopBarProps {
  headerHeight: number;
  topInset: number;
  title: string;
  subtitle?: string;
  hasNotifications?: boolean;
  onPressHome: () => void;
  onPressNotifications: () => void;
  onPressProfile: () => void;
}

export function AppShellTopBar({
  headerHeight,
  hasNotifications = false,
  onPressHome,
  onPressNotifications,
  onPressProfile,
  subtitle,
  topInset,
  title,
}: AppShellTopBarProps) {
  return (
    <View
      className="px-5"
      style={{
        height: headerHeight,
        paddingTop: topInset,
        paddingBottom: 4,
        backgroundColor: "rgba(5,5,6,0.12)",
        overflow: "hidden",
      }}
    >
      <BlurView
        intensity={36}
        style={StyleSheet.absoluteFillObject}
        tint="dark"
      />
      <View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFillObject,
          { backgroundColor: "rgba(5,5,6,0.22)" },
        ]}
      />
      <View className="flex-row items-center justify-between gap-4">
        <Pressable
          accessibilityLabel="Go to Home"
          accessibilityRole="button"
          className="min-w-0 flex-1"
          hitSlop={8}
          onPress={onPressHome}
          style={({ pressed }) => ({
            opacity: pressed ? appTheme.motion.pressOpacity : 1,
          })}
          testID="app-shell-home"
        >
          <Text
            className="text-[20px] font-semibold tracking-[-0.02em] text-white"
            numberOfLines={1}
          >
            {title}
          </Text>
          {subtitle ? (
            <Text
              className="mt-1 text-[12px] leading-[18px] text-white/38"
              numberOfLines={1}
            >
              {subtitle}
            </Text>
          ) : null}
        </Pressable>

        <View className="flex-row items-center gap-3">
          <Pressable
            accessibilityLabel="Notifications"
            accessibilityRole="button"
            className="h-9 w-9 items-center justify-center"
            hitSlop={8}
            onPress={onPressNotifications}
            style={({ pressed }) => ({
              opacity: pressed ? appTheme.motion.pressOpacity : 1,
            })}
            testID="app-shell-notifications"
          >
            <View>
              <Ionicons
                color="rgba(255,255,255,0.78)"
                name="notifications-outline"
                size={19}
              />
              {hasNotifications ? (
                <View className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-white" />
              ) : null}
            </View>
          </Pressable>
          <Pressable
            accessibilityLabel="Profile"
            accessibilityRole="button"
            className="h-9 w-9 items-center justify-center"
            hitSlop={8}
            onPress={onPressProfile}
            style={({ pressed }) => ({
              opacity: pressed ? appTheme.motion.pressOpacity : 1,
            })}
            testID="app-shell-profile"
          >
            <Ionicons
              color="rgba(255,255,255,0.72)"
              name="person-outline"
              size={19}
            />
          </Pressable>
        </View>
      </View>
    </View>
  );
}
