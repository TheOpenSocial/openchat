import { Text, View } from "react-native";

import { cn } from "../lib/cn";

interface SectionHeaderProps {
  title: string;
  description?: string;
  className?: string;
}

export function SectionHeader({
  className,
  description,
  title,
}: SectionHeaderProps) {
  return (
    <View className={cn("mb-3", className)}>
      <Text className="text-[17px] font-semibold tracking-tight text-ink">
        {title}
      </Text>
      {description ? (
        <Text className="mt-1 text-[13px] leading-5 text-muted">
          {description}
        </Text>
      ) : null}
    </View>
  );
}
