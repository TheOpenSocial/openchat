import { type ReactNode } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Platform, Pressable, Text, type PressableProps } from "react-native";

import { appTheme } from "../../theme";

import { cn } from "../../lib/cn";

const buttonVariants = cva("items-center justify-center rounded-2xl px-4", {
  variants: {
    variant: {
      default: "border border-white/90 bg-white",
      secondary: "border border-hairline bg-surface",
      outline: "border border-hairline bg-surfaceMuted/80",
    },
    size: {
      default: "h-12 min-h-[48px]",
      sm: "h-10 min-h-[40px] rounded-xl px-3",
    },
    disabled: {
      true: "opacity-60",
    },
  },
  defaultVariants: {
    variant: "default",
    size: "default",
  },
});

const buttonTextVariants = cva("font-semibold", {
  variants: {
    variant: {
      default: "text-[#0d0d0d]",
      secondary: "text-ink",
      outline: "text-ink",
    },
    size: {
      default: "text-[15px]",
      sm: "text-sm",
    },
  },
  defaultVariants: {
    variant: "default",
    size: "default",
  },
});

type ButtonVariantProps = VariantProps<typeof buttonVariants>;

interface ButtonProps extends PressableProps {
  label: string;
  children?: ReactNode;
  className?: string;
  labelClassName?: string;
  variant?: ButtonVariantProps["variant"];
  size?: ButtonVariantProps["size"];
}

export function Button({
  children,
  className,
  disabled,
  label,
  labelClassName,
  size,
  variant,
  ...props
}: ButtonProps) {
  const isDisabled = Boolean(disabled);

  const ripple =
    Platform.OS === "android" && !isDisabled
      ? {
          color:
            variant === "default"
              ? "rgba(13,13,13,0.12)"
              : "rgba(255,255,255,0.08)",
          borderless: false,
        }
      : undefined;

  return (
    <Pressable
      accessibilityRole="button"
      android_ripple={ripple}
      className={cn(
        buttonVariants({
          disabled: isDisabled ? true : undefined,
          size,
          variant,
        }),
        className,
      )}
      disabled={isDisabled}
      style={({ pressed }) => ({
        opacity: pressed && !isDisabled ? appTheme.motion.pressOpacity : 1,
      })}
      {...props}
    >
      {children ?? (
        <Text
          className={cn(buttonTextVariants({ size, variant }), labelClassName)}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}
