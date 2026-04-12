import { type PropsWithChildren } from "react";
import { View, type ViewStyle } from "react-native";

import { cn } from "../../lib/cn";

interface CardProps extends PropsWithChildren {
  className?: string;
  style?: ViewStyle;
}

export function Card({ children, className, style }: CardProps) {
  return (
    <View
      className={cn(
        "rounded-2xl border border-hairline bg-surface/95 shadow-sm shadow-black/20",
        className,
      )}
      style={style}
    >
      {children}
    </View>
  );
}
