import { Text, TextInput, type TextInputProps, View } from "react-native";
import { useState } from "react";

import { cn } from "../lib/cn";

const PLACEHOLDER_MUTED = "rgba(255,255,255,0.35)";

interface CalmTextFieldProps extends TextInputProps {
  label?: string;
  helperText?: string;
  multiline?: boolean;
  containerClassName?: string;
  inputClassName?: string;
}

export function CalmTextField({
  containerClassName,
  helperText,
  inputClassName,
  label,
  multiline = false,
  onBlur,
  onFocus,
  placeholderTextColor = PLACEHOLDER_MUTED,
  testID,
  ...props
}: CalmTextFieldProps) {
  const [focused, setFocused] = useState(false);

  return (
    <View className={cn("gap-1.5", containerClassName)}>
      {label ? (
        <Text
          className={cn(
            "text-[12px] font-medium",
            focused ? "text-white/62" : "text-white/45",
          )}
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
          className={cn(
            multiline
              ? "min-h-[104px] text-[15px] leading-[22px] text-white"
              : "text-[15px] leading-[22px] text-white",
            inputClassName,
          )}
          multiline={multiline}
          onBlur={(event) => {
            setFocused(false);
            onBlur?.(event);
          }}
          onFocus={(event) => {
            setFocused(true);
            onFocus?.(event);
          }}
          placeholderTextColor={placeholderTextColor}
          selectionColor="rgba(255,255,255,0.75)"
          testID={testID}
          textAlignVertical={multiline ? "top" : "center"}
          {...props}
        />
      </View>
      {helperText ? (
        <Text className="text-[12px] leading-[18px] text-white/30">
          {helperText}
        </Text>
      ) : null}
    </View>
  );
}
