import { type PropsWithChildren } from "react";
import { View } from "react-native";

import { cn } from "../../lib/cn";

interface CardProps extends PropsWithChildren {
  className?: string;
}

export function Card({ children, className }: CardProps) {
  return (
    <View
      className={cn(
        "rounded-2xl border border-hairline bg-surface/95 shadow-sm shadow-black/20",
        className,
      )}
    >
      {children}
    </View>
  );
}
