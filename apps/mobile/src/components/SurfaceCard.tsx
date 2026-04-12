import { PropsWithChildren } from "react";
import type { ViewStyle } from "react-native";

import { Card } from "./ui/card";

interface SurfaceCardProps extends PropsWithChildren {
  className?: string;
  style?: ViewStyle;
}

export function SurfaceCard({
  children,
  className = "",
  style,
}: SurfaceCardProps) {
  return (
    <Card className={`px-4 py-4 ${className}`} style={style}>
      {children}
    </Card>
  );
}
