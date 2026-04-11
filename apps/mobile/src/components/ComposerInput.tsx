import {
  TextInput,
  type TextInputProps,
  type StyleProp,
  type ViewStyle,
  View,
} from "react-native";

import { appTheme } from "../theme";
import { cn } from "../lib/cn";

const PLACEHOLDER_MUTED = appTheme.colors.muted;

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
        allowFontScaling
        placeholderTextColor={placeholderTextColor}
        testID={testID}
        textAlignVertical="top"
        underlineColorAndroid="transparent"
        {...props}
      />
    </View>
  );
}
