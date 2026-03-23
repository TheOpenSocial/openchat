import { Text, View } from "react-native";

import { type AppLocale, t } from "../i18n/strings";

type OpenChatHeaderProps = {
  /** Soft framing before the first user message (app bar already shows the product name). */
  showPresence?: boolean;
  locale: AppLocale;
};

export function OpenChatHeader({ locale, showPresence }: OpenChatHeaderProps) {
  if (!showPresence) {
    return <View className="mb-1 h-px w-full bg-white/[0.04]" />;
  }
  return (
    <View className="pb-2 pt-1">
      <Text className="text-[11px] font-medium uppercase tracking-[0.16em] text-white/26">
        {t("openChatPresenceTitle", locale)}
      </Text>
      <Text className="mt-2 max-w-[220px] text-[13px] leading-[19px] text-white/40">
        {t("openChatPresenceSubtitle", locale)}
      </Text>
    </View>
  );
}
