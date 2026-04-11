import { cva } from "class-variance-authority";
import { Platform, Pressable, Text, type PressableProps } from "react-native";

import { cn } from "../../lib/cn";
import { appTheme } from "../../theme";

const chipVariants = cva(
  "min-h-[44px] flex-row items-center justify-center rounded-full border px-3.5 py-2",
  {
    variants: {
      selected: {
        true: "border-accent/50 bg-accentMuted",
        false: "border-hairline bg-surfaceMuted/90",
      },
    },
    defaultVariants: {
      selected: false,
    },
  },
);

const chipTextVariants = cva("text-[13px] font-medium", {
  variants: {
    selected: {
      true: "text-accent",
      false: "text-ink",
    },
  },
  defaultVariants: {
    selected: false,
  },
});

interface ChipProps extends PressableProps {
  label: string;
  selected?: boolean;
}

export function Chip({ label, selected = false, ...props }: ChipProps) {
  return (
    <Pressable
      accessibilityRole="button"
      android_ripple={
        Platform.OS === "android"
          ? { color: "rgba(255,255,255,0.12)", borderless: false }
          : undefined
      }
      className={chipVariants({ selected })}
      style={({ pressed }) => ({
        opacity: pressed ? appTheme.motion.pressOpacity : 1,
      })}
      {...props}
    >
      <Text className={cn(chipTextVariants({ selected }))}>{label}</Text>
    </Pressable>
  );
}
