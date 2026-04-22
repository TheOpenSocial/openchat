import { forwardRef, useState } from "react";
import { Text, TextInput, type TextInputProps, View } from "react-native";

import { appTheme } from "../theme";
import { cn } from "../lib/cn";

const PLACEHOLDER_MUTED = appTheme.colors.muted;

interface CalmTextFieldProps extends TextInputProps {
  label?: string;
  helperText?: string;
  multiline?: boolean;
  containerClassName?: string;
  inputClassName?: string;
}

export const CalmTextField = forwardRef<TextInput, CalmTextFieldProps>(
  function CalmTextField(
    {
      containerClassName,
      helperText,
      inputClassName,
      label,
      multiline = false,
      onBlur,
      onFocus,
      placeholderTextColor = PLACEHOLDER_MUTED,
      testID,
      accessibilityLabel,
      accessibilityHint,
      blurOnSubmit,
      ...props
    },
    ref,
  ) {
    const [focused, setFocused] = useState(false);
    const resolvedAccessibilityLabel = accessibilityLabel ?? label;
    const resolvedAccessibilityHint =
      accessibilityHint ?? helperText ?? undefined;
    const shouldBlurOnSubmit = blurOnSubmit ?? props.returnKeyType !== "next";

    return (
      <View className={cn("gap-1.5", containerClassName)}>
        {label ? (
          <Text
            className={cn(
              "text-[13px] font-semibold",
              focused ? "text-ink/88" : "text-muted",
            )}
            allowFontScaling
            minimumFontScale={0.85}
          >
            {label}
          </Text>
        ) : null}
        <View
          className={cn(
            "overflow-hidden rounded-[22px] border px-4",
            focused
              ? "border-white/18 bg-white/[0.085]"
              : "border-white/10 bg-white/[0.06]",
            multiline ? "py-3.5" : "py-3",
          )}
        >
          <TextInput
            ref={ref}
            accessibilityHint={resolvedAccessibilityHint}
            accessibilityLabel={resolvedAccessibilityLabel}
            blurOnSubmit={shouldBlurOnSubmit}
            className={cn(
              multiline
                ? "min-h-[104px] text-[15px] leading-[22px] text-white"
                : "text-[15px] leading-[22px] text-white",
              inputClassName,
            )}
            multiline={multiline}
            allowFontScaling
            onBlur={(event) => {
              setFocused(false);
              onBlur?.(event);
            }}
            onFocus={(event) => {
              setFocused(true);
              onFocus?.(event);
            }}
            placeholderTextColor={placeholderTextColor}
            selectionColor={appTheme.colors.ink}
            testID={testID}
            textAlignVertical={multiline ? "top" : "center"}
            {...props}
          />
        </View>
        {helperText ? (
          <Text
            className="text-[12px] leading-[18px] text-muted"
            allowFontScaling
            minimumFontScale={0.85}
          >
            {helperText}
          </Text>
        ) : null}
      </View>
    );
  },
);
