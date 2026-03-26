import {
  TextInput,
  type TextInputProps,
  type StyleProp,
  type ViewStyle,
  View,
} from "react-native";

import { cn } from "../lib/cn";

/** Slightly brighter than hairline for legibility on `surface` */
const PLACEHOLDER_MUTED = "#949494";

interface ComposerInputProps extends TextInputProps {
  containerClassName?: string;
  containerStyle?: StyleProp<ViewStyle>;
}

export function ComposerInput({
  className,
  containerClassName,
  containerStyle,
  placeholderTextColor = PLACEHOLDER_MUTED,
  testID,
  ...props
}: ComposerInputProps) {
  return (
    <View
      className={cn(
        "rounded-[26px] border border-hairline bg-surface px-4 py-2.5",
        containerClassName,
      )}
      collapsable={false}
      style={containerStyle}
    >
      <TextInput
        className={cn("text-[15px] leading-[25px] text-ink", className)}
        placeholderTextColor={placeholderTextColor}
        testID={testID}
        textAlignVertical="top"
        underlineColorAndroid="transparent"
        {...props}
      />
    </View>
  );
}
