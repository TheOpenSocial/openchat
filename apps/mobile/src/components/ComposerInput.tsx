import { TextInput, type TextInputProps, View } from "react-native";

import { cn } from "../lib/cn";

/** Slightly brighter than hairline for legibility on `surface` */
const PLACEHOLDER_MUTED = "#949494";

interface ComposerInputProps extends TextInputProps {
  containerClassName?: string;
}

export function ComposerInput({
  className,
  containerClassName,
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
    >
      <TextInput
        className={cn(
          "max-h-36 min-h-[22px] text-[15px] leading-[22px] text-ink",
          className,
        )}
        placeholderTextColor={placeholderTextColor}
        testID={testID}
        textAlignVertical="top"
        {...props}
      />
    </View>
  );
}
