import { Text, View } from "react-native";

import { type AppLocale, t } from "../i18n/strings";

type OpenChatHeaderProps = {
  /** Soft framing before the first user message (app bar already shows the product name). */
  showPresence?: boolean;
  locale: AppLocale;
};

export function OpenChatHeader({ locale, showPresence }: OpenChatHeaderProps) {
  if (!showPresence) {
    return <View className="h-px w-full bg-white/[0.04]" />;
  }
  return (
    <View className="border-b border-white/[0.05] pb-3 pt-0">
      <Text className="text-[12px] font-medium uppercase tracking-[0.14em] text-white/32">
        {t("openChatPresenceTitle", locale)}
      </Text>
      <Text className="mt-2 text-[14px] leading-[20px] text-white/45">
        {t("openChatPresenceSubtitle", locale)}
      </Text>
    </View>
  );
}
