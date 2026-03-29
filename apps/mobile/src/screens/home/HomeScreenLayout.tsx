import type { ReactNode } from "react";
import { KeyboardAvoidingView, Platform, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AnimatedScreen } from "../../components/AnimatedScreen";
import { AppBottomTabs } from "../../components/AppBottomTabs";
import { AppShell } from "../../components/AppShell";
import { InlineNotice } from "../../components/InlineNotice";
import type { AppLocale } from "../../i18n/strings";
import type { HomeTab } from "../../types";

type BannerTone = "error" | "info" | "success";
const HOME_SHELL_BACKGROUND_COLOR = "#050506";
const HOME_SHELL_STYLE = {
  flex: 1,
  backgroundColor: HOME_SHELL_BACKGROUND_COLOR,
} as const;

type HomeScreenLayoutProps = {
  activeTab: HomeTab;
  hasNotifications: boolean;
  locale: AppLocale;
  netOnline: boolean;
  offlineNoticeText: string;
  shellContentBottomInset: number;
  skipNetwork: boolean;
  title: string;
  visibleBanner: { text: string; tone: BannerTone } | null;
  onPressHome: () => void;
  onPressNotifications: () => void;
  onPressSettings: () => void;
  onTabChange: (tab: HomeTab) => void;
  unreadChatsCount: number;
  homeContent: ReactNode;
  chatsContent: ReactNode;
  profileContent: ReactNode;
  overlay?: ReactNode;
};

export function HomeScreenLayout({
  activeTab,
  chatsContent,
  hasNotifications,
  homeContent,
  locale: _locale,
  netOnline,
  offlineNoticeText,
  onPressHome,
  onPressNotifications,
  onPressSettings,
  onTabChange,
  overlay,
  profileContent,
  shellContentBottomInset,
  skipNetwork,
  title,
  unreadChatsCount,
  visibleBanner,
}: HomeScreenLayoutProps) {
  void _locale;
  const shouldShowInlineNotices = activeTab !== "home";

  return (
    <SafeAreaView
      className="flex-1 bg-canvas"
      edges={[]}
      style={HOME_SHELL_STYLE}
      testID="home-screen"
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        className="flex-1"
        keyboardVerticalOffset={0}
        style={{ flex: 1 }}
      >
        <View className="flex-1" style={HOME_SHELL_STYLE}>
          {visibleBanner && shouldShowInlineNotices ? (
            <View className="px-5 pt-3">
              <InlineNotice
                text={visibleBanner.text}
                tone={visibleBanner.tone}
              />
            </View>
          ) : null}
          {!skipNetwork && !netOnline && shouldShowInlineNotices ? (
            <View className="px-5 pt-3">
              <InlineNotice text={offlineNoticeText} tone="info" />
            </View>
          ) : null}

          <AppShell
            activeTab={activeTab}
            hasNotifications={hasNotifications}
            onPressHome={onPressHome}
            onPressNotifications={onPressNotifications}
            onPressSettings={onPressSettings}
            title={title}
          >
            <View
              className="min-h-0 flex-1"
              style={{ paddingBottom: shellContentBottomInset, paddingTop: 14 }}
            >
              <AnimatedScreen screenKey={activeTab}>
                {activeTab === "home" ? homeContent : null}
                {activeTab === "chats" ? chatsContent : null}
                {activeTab === "profile" ? profileContent : null}
              </AnimatedScreen>
            </View>
          </AppShell>

          <AppBottomTabs
            activeTab={activeTab}
            onChange={onTabChange}
            unreadChats={unreadChatsCount}
          />
          {overlay}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
