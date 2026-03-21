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

import { signInTheme } from "./sign-in-theme";

type SignInActionsProps = {
  designPreviewMode: boolean;
  loading: boolean;
  oauthLoading: boolean;
  allowE2EBypass: boolean;
  onGooglePress: () => void;
  onPreviewPress: () => void;
  onE2EBypassPress: () => void;
};

export function SignInActions({
  allowE2EBypass,
  designPreviewMode,
  loading,
  oauthLoading,
  onE2EBypassPress,
  onGooglePress,
  onPreviewPress,
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
      {designPreviewMode ? (
        <PrimaryChromeButton
          disabled={loading}
          label="Continue"
          loading={loading}
          onPress={onPreviewPress}
          testID="auth-design-preview-button"
        />
      ) : (
        <PrimaryChromeButton
          disabled={busy}
          label="Continue with Google"
          loading={busy}
          onPress={onGooglePress}
          testID="auth-google-button"
        />
      )}

      <Text style={styles.footnote}>
        {designPreviewMode
          ? "Preview data only. Nothing syncs."
          : "Opens in your browser, then returns here."}
      </Text>

      {!designPreviewMode && allowE2EBypass ? (
        <Pressable
          accessibilityRole="button"
          hitSlop={12}
          onPress={onE2EBypassPress}
          style={({ pressed }) => [
            styles.ghostWrap,
            pressed && styles.ghostPressed,
          ]}
          testID="auth-e2e-bypass-button"
        >
          <Text style={styles.ghostLabel}>E2E bypass</Text>
        </Pressable>
      ) : null}
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
        <ActivityIndicator color="#0a0a0a" />
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
    color: "#0a0a0a",
    fontSize: 15,
    fontWeight: "500",
    letterSpacing: 0.2,
  },
  footnote: {
    color: "rgba(255,255,255,0.42)",
    fontSize: signInTheme.footnoteSize,
    letterSpacing: 0.15,
    lineHeight: signInTheme.footnoteSize * 1.45,
    marginTop: 14,
    textAlign: "center",
  },
  ghostWrap: {
    alignSelf: "center",
    marginTop: 20,
    paddingVertical: 8,
  },
  ghostPressed: {
    opacity: 0.65,
  },
  ghostLabel: {
    color: "rgba(255,255,255,0.45)",
    fontSize: 13,
    fontWeight: "500",
    letterSpacing: 0.3,
  },
});
