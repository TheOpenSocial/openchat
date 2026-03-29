import { useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  ActivityIndicator,
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
} from "react-native";

import { type AppLocale, t } from "../../i18n/strings";
import { appTheme } from "../../theme";
import { signInTheme } from "./sign-in-theme";

type SignInActionsProps = {
  locale: AppLocale;
  loading: boolean;
  oauthLoading: boolean;
  onGooglePress: () => void;
};

export function SignInActions({
  locale,
  loading,
  oauthLoading,
  onGooglePress,
}: SignInActionsProps) {
  const fade = useRef(new Animated.Value(0)).current;
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled()
      .then(setReduceMotion)
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      setReduceMotion,
    );
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (reduceMotion) {
      fade.setValue(1);
      return;
    }
    fade.setValue(0);
    Animated.timing(fade, {
      toValue: 1,
      duration: signInTheme.enterDurationMs + 120,
      delay: 120,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [fade, reduceMotion]);

  const busy = loading || oauthLoading;

  return (
    <Animated.View style={[styles.column, { opacity: fade }]}>
      <PrimaryChromeButton
        disabled={busy}
        label={t("authContinueWithGoogle", locale)}
        loading={busy}
        onPress={onGooglePress}
        testID="auth-google-button"
      />

      <Text style={styles.footnote}>{t("authBrowserFootnote", locale)}</Text>
    </Animated.View>
  );
}

function PrimaryChromeButton({
  disabled,
  label,
  loading,
  onPress,
  testID,
}: {
  disabled?: boolean;
  label: string;
  loading: boolean;
  onPress: () => void;
  testID?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(disabled) }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.primary,
        disabled && styles.primaryDisabled,
        pressed && !disabled && styles.primaryPressed,
      ]}
      testID={testID}
    >
      {loading ? (
        <ActivityIndicator color={appTheme.colors.background} />
      ) : (
        <Text style={styles.primaryLabel}>{label}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  column: {
    alignSelf: "center",
    maxWidth: signInTheme.ctaMaxWidth,
    width: "100%",
  },
  primary: {
    alignItems: "center",
    backgroundColor: "rgba(250,250,250,0.94)",
    borderRadius: 999,
    height: 48,
    justifyContent: "center",
    maxWidth: signInTheme.ctaMaxWidth,
    paddingHorizontal: 22,
  },
  primaryDisabled: {
    opacity: 0.55,
  },
  primaryPressed: {
    opacity: 0.88,
  },
  primaryLabel: {
    color: appTheme.colors.background,
    fontSize: 15,
    fontWeight: "500",
    letterSpacing: 0.2,
  },
  footnote: {
    color: appTheme.colors.muted,
    fontSize: signInTheme.footnoteSize,
    letterSpacing: 0.15,
    lineHeight: signInTheme.footnoteSize * 1.45,
    marginTop: 14,
    textAlign: "center",
  },
});
