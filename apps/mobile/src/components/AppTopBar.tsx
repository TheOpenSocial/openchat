import { type ReactNode } from "react";
import { Text, View } from "react-native";

import { cn } from "../lib/cn";

interface AppTopBarProps {
  title: string;
  subtitle?: string;
  trailing?: ReactNode;
  /** e.g. hamburger menu (ChatGPT-style). */
  leading?: ReactNode;
  /** Tighter title row; subtitle hidden. */
  compact?: boolean;
}

export function AppTopBar({
  compact = false,
  leading,
  subtitle,
  title,
  trailing,
}: AppTopBarProps) {
  const showSubtitle = Boolean(subtitle) && !compact;

  return (
    <View
      className={cn(
        "border-b border-hairline/70 bg-canvas px-4",
        compact ? "pb-2.5 pt-1" : "pb-4 pt-2",
      )}
    >
      <View className="flex-row items-start justify-between gap-2">
        <View className="min-w-0 flex-1 flex-row items-start gap-2">
          {leading ? <View className="mt-0.5 shrink-0">{leading}</View> : null}
          <View className="min-w-0 flex-1">
            <Text
              className={cn(
                "font-semibold tracking-tight text-ink",
                compact ? "text-[17px]" : "text-[20px]",
              )}
              numberOfLines={1}
            >
              {title}
            </Text>
            {showSubtitle ? (
              <Text
                className="mt-1.5 text-[13px] leading-[20px] text-muted"
                numberOfLines={2}
              >
                {subtitle}
              </Text>
            ) : null}
          </View>
        </View>
        {trailing ? (
          <View className="max-w-[40%] shrink-0 items-end">{trailing}</View>
        ) : null}
      </View>
    </View>
  );
}
