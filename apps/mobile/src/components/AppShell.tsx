import { ReactNode } from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { MainAppTab } from "./AppBottomTabs";
import { AppShellTopBar } from "./AppShellTopBar";

interface AppShellProps {
  activeTab: MainAppTab;
  children: ReactNode;
  hasNotifications?: boolean;
  title: string;
  subtitle?: string;
  onPressHome: () => void;
  onPressNotifications: () => void;
  onPressProfile: () => void;
}

export function AppShell({
  activeTab,
  children,
  hasNotifications = false,
  onPressHome,
  onPressNotifications,
  onPressProfile,
  subtitle,
  title,
}: AppShellProps) {
  void activeTab;
  const insets = useSafeAreaInsets();
  const headerHeight = insets.top + 46;

  return (
    <View className="flex-1 bg-[#050506]" style={{ flex: 1 }}>
      <View
        className="min-h-0 flex-1"
        style={{ flex: 1, paddingTop: insets.top + 4 }}
      >
        {children}
      </View>
      <View
        pointerEvents="box-none"
        style={{ left: 0, position: "absolute", right: 0, top: 0, zIndex: 20 }}
      >
        <AppShellTopBar
          headerHeight={headerHeight}
          hasNotifications={hasNotifications}
          onPressHome={onPressHome}
          onPressNotifications={onPressNotifications}
          onPressProfile={onPressProfile}
          subtitle={subtitle}
          title={title}
          topInset={insets.top}
        />
      </View>
    </View>
  );
}
