import Ionicons from "@expo/vector-icons/Ionicons";
import { Keyboard, Pressable, Text, View } from "react-native";

import { appTheme } from "../theme";

interface AppShellTopBarProps {
  headerHeight: number;
  topInset: number;
  title: string;
  subtitle?: string;
  hasNotifications?: boolean;
  onPressHome: () => void;
  onPressNotifications: () => void;
  onPressSettings: () => void;
}

export function AppShellTopBar({
  headerHeight,
  hasNotifications = false,
  onPressHome,
  onPressNotifications,
  onPressSettings,
  subtitle,
  topInset,
  title,
}: AppShellTopBarProps) {
  const dismissAnd = (handler: () => void) => {
    Keyboard.dismiss();
    handler();
  };

  const iconButtonClassName = "h-11 w-11 items-center justify-center";

  return (
    <View
      className="border-b border-hairline bg-canvas px-5"
      style={{
        height: headerHeight,
        paddingTop: topInset,
        paddingBottom: 4,
        backgroundColor: appTheme.colors.background,
        overflow: "hidden",
      }}
    >
      <View className="flex-row items-center justify-between gap-4">
        <Pressable
          accessibilityHint="Dismisses the current screen and returns to the Home tab."
          accessibilityLabel="Home"
          accessibilityRole="button"
          className="min-w-0 flex-1"
          hitSlop={8}
          onPress={() => dismissAnd(onPressHome)}
          style={({ pressed }) => ({
            opacity: pressed ? appTheme.motion.pressOpacity : 1,
          })}
          testID="app-shell-home"
        >
          <Text
            className="text-[20px] font-semibold tracking-[-0.02em] text-ink"
            allowFontScaling
            adjustsFontSizeToFit
            minimumFontScale={0.82}
            numberOfLines={1}
          >
            {title}
          </Text>
          {subtitle ? (
            <Text
              className="mt-1 text-[12px] leading-[18px] text-muted"
              allowFontScaling
              adjustsFontSizeToFit
              minimumFontScale={0.85}
              numberOfLines={1}
            >
              {subtitle}
            </Text>
          ) : null}
        </Pressable>

        <View className="flex-row items-center gap-3">
          <Pressable
            accessibilityHint="Opens settings."
            accessibilityLabel="Settings"
            accessibilityRole="button"
            className={iconButtonClassName}
            hitSlop={10}
            onPress={() => dismissAnd(onPressSettings)}
            style={({ pressed }) => ({
              opacity: pressed ? appTheme.motion.pressOpacity : 1,
            })}
            testID="app-shell-settings"
          >
            <Ionicons
              color={appTheme.colors.ink}
              name="settings-outline"
              size={19}
            />
          </Pressable>
          <Pressable
            accessibilityHint="Opens notifications."
            accessibilityLabel="Notifications"
            accessibilityRole="button"
            className={iconButtonClassName}
            hitSlop={10}
            onPress={() => dismissAnd(onPressNotifications)}
            style={({ pressed }) => ({
              opacity: pressed ? appTheme.motion.pressOpacity : 1,
            })}
            testID="app-shell-notifications"
          >
            <View>
              <Ionicons
                color={appTheme.colors.ink}
                name="notifications-outline"
                size={19}
              />
              {hasNotifications ? (
                <View
                  className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: appTheme.colors.ink }}
                  testID="app-shell-notifications-unread-indicator"
                />
              ) : null}
            </View>
          </Pressable>
        </View>
      </View>
    </View>
  );
}
