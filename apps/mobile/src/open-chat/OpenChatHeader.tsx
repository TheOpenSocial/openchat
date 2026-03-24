import { View } from "react-native";

import type { AppLocale } from "../i18n/strings";

type OpenChatHeaderProps = {
  showPresence?: boolean;
  locale: AppLocale;
};

export function OpenChatHeader({
  locale: _locale,
  showPresence,
}: OpenChatHeaderProps) {
  void _locale;
  void showPresence;
  return <View className="h-1 w-full" />;
}
