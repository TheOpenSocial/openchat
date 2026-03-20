import { cva } from "class-variance-authority";
import { Text, View, type ViewProps } from "react-native";

import { cn } from "../../lib/cn";

const alertVariants = cva("rounded-xl border px-3 py-2.5", {
  variants: {
    tone: {
      info: "border-hairline bg-surfaceMuted/90",
      error: "border-rose-500/35 bg-rose-500/10",
      success: "border-accent/35 bg-accentMuted",
    },
  },
  defaultVariants: {
    tone: "info",
  },
});

const alertTextVariants = cva("text-[13px] leading-5", {
  variants: {
    tone: {
      info: "text-ink",
      error: "text-rose-200",
      success: "text-emerald-100",
    },
  },
  defaultVariants: {
    tone: "info",
  },
});

interface AlertProps extends ViewProps {
  text: string;
  tone?: "info" | "error" | "success";
}

export function Alert({
  className,
  text,
  tone = "info",
  ...props
}: AlertProps) {
  return (
    <View className={cn(alertVariants({ tone }), className)} {...props}>
      <Text className={alertTextVariants({ tone })}>{text}</Text>
    </View>
  );
}
