import { ActivityIndicator } from "react-native";

import { appTheme } from "../theme";
import { Button } from "./ui/button";

type ButtonVariant = "primary" | "secondary" | "ghost";

interface PrimaryButtonProps {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: ButtonVariant;
  testID?: string;
}

const variantMap: Record<ButtonVariant, "default" | "secondary" | "outline"> = {
  primary: "default",
  secondary: "secondary",
  ghost: "outline",
};

export function PrimaryButton({
  label,
  onPress,
  disabled = false,
  loading = false,
  variant = "primary",
  testID,
}: PrimaryButtonProps) {
  if (loading) {
    return (
      <Button
        label=""
        disabled
        onPress={onPress}
        testID={testID}
        variant={variantMap[variant]}
      >
        <ActivityIndicator
          color={variant === "primary" ? "#ffffff" : appTheme.colors.ink}
        />
      </Button>
    );
  }

  return (
    <Button
      disabled={disabled}
      label={label}
      onPress={onPress}
      testID={testID}
      variant={variantMap[variant]}
    />
  );
}
