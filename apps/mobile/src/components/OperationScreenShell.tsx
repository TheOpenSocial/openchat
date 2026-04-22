import Ionicons from "@expo/vector-icons/Ionicons";
import type { ReactNode } from "react";
import {
  Pressable,
  ScrollView,
  Text,
  View,
  type ScrollViewProps,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { appTheme } from "../theme";

type OperationScreenShellProps = {
  children: ReactNode;
  closeAccessibilityLabel: string;
  closeHint?: string;
  closeTestID?: string;
  eyebrow: string;
  onClose: () => void;
  rootTestID?: string;
  scrollContentContainerStyle?: ScrollViewProps["contentContainerStyle"];
  scrollProps?: Omit<ScrollViewProps, "children" | "contentContainerStyle">;
  subtitle: string;
  title: string;
};

export function OperationScreenShell({
  children,
  closeAccessibilityLabel,
  closeHint = "Returns to the previous screen.",
  closeTestID,
  eyebrow,
  onClose,
  rootTestID,
  scrollContentContainerStyle,
  scrollProps,
  subtitle,
  title,
}: OperationScreenShellProps) {
  return (
    <SafeAreaView
      className="flex-1 bg-canvas"
      style={{ flex: 1 }}
      testID={rootTestID}
    >
      <View className="flex-1 bg-canvas" style={{ flex: 1 }}>
        <View className="flex-row items-start justify-between px-5 pb-5 pt-3">
          <View className="max-w-[280px] gap-2">
            <Text className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
              {eyebrow}
            </Text>
            <Text className="text-[34px] font-semibold tracking-[-0.05em] text-ink">
              {title}
            </Text>
            <Text className="text-[14px] leading-[21px] text-muted">
              {subtitle}
            </Text>
          </View>
          <Pressable
            accessibilityHint={closeHint}
            accessibilityLabel={closeAccessibilityLabel}
            accessibilityRole="button"
            className="mt-1 h-11 w-11 items-center justify-center rounded-full border border-hairline bg-surfaceMuted"
            hitSlop={8}
            onPress={onClose}
            style={({ pressed }) => ({
              opacity: pressed ? appTheme.motion.pressOpacity : 1,
            })}
            testID={closeTestID}
          >
            <Ionicons color={appTheme.colors.ink} name="close" size={18} />
          </Pressable>
        </View>

        <ScrollView
          className="flex-1"
          contentContainerStyle={[
            { paddingBottom: 40, paddingHorizontal: 20 },
            scrollContentContainerStyle,
          ]}
          showsVerticalScrollIndicator={false}
          {...scrollProps}
        >
          {children}
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}
