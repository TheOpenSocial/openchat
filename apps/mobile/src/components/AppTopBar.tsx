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
      className={cn("bg-canvas px-4", compact ? "pb-2 pt-1" : "pb-3.5 pt-2")}
    >
      <View className="flex-row items-start justify-between gap-3">
        <View className="min-w-0 flex-1 flex-row items-start gap-2.5">
          {leading ? <View className="mt-0.5 shrink-0">{leading}</View> : null}
          <View className="min-w-0 flex-1">
            <Text
              className={cn(
                "font-semibold tracking-tight text-ink",
                compact ? "text-[19px]" : "text-[22px]",
              )}
              numberOfLines={1}
            >
              {title}
            </Text>
            {showSubtitle ? (
              <Text
                className="mt-1.5 max-w-[260px] text-[13px] leading-[19px] text-muted/90"
                numberOfLines={2}
              >
                {subtitle}
              </Text>
            ) : null}
          </View>
        </View>
        {trailing ? (
          <View className="max-w-[40%] shrink-0 items-end pt-0.5">
            {trailing}
          </View>
        ) : null}
      </View>
    </View>
  );
}
