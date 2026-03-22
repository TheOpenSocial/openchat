import { useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Platform,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { appTheme } from "../../theme";

import { signInTheme } from "./sign-in-theme";

type SignInHeroCopyProps = {
  title: string;
  subtitle: string;
};

export function SignInHeroCopy({ subtitle, title }: SignInHeroCopyProps) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(
    new Animated.Value(signInTheme.enterTranslateY),
  ).current;
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled()
      .then(setReduceMotion)
      .catch(() => {});

    const sub = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      setReduceMotion,
    );
    return () => {
      sub.remove();
    };
  }, []);

  useEffect(() => {
    if (reduceMotion) {
      opacity.setValue(1);
      translateY.setValue(0);
      return;
    }

    opacity.setValue(0);
    translateY.setValue(signInTheme.enterTranslateY);

    const easing = Easing.out(Easing.cubic);
    const duration = signInTheme.enterDurationMs;

    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration,
        easing,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration,
        easing,
        useNativeDriver: true,
      }),
    ]).start();
  }, [opacity, reduceMotion, subtitle, title, translateY]);

  return (
    <View style={styles.wrap} accessibilityRole="header">
      <Animated.View
        style={{ opacity, transform: [{ translateY }] }}
        accessible
        accessibilityLabel={`${title} ${subtitle}`}
      >
        <Text style={styles.title} maxFontSizeMultiplier={1.35}>
          {title}
        </Text>
        <Text style={styles.subtitle} maxFontSizeMultiplier={1.35}>
          {subtitle}
        </Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignSelf: "center",
    maxWidth: signInTheme.heroMaxWidth,
    paddingHorizontal: 4,
  },
  title: {
    color: "rgba(255,255,255,0.96)",
    fontFamily: Platform.select({
      ios: "System",
      android: "sans-serif",
      default: "sans-serif",
    }),
    fontSize: signInTheme.titleSize,
    fontWeight: "700",
    letterSpacing: Platform.OS === "ios" ? -0.6 : -0.3,
    lineHeight: signInTheme.titleSize * 1.08,
    textAlign: "center",
  },
  subtitle: {
    color: "rgba(255,255,255,0.62)",
    fontFamily: appTheme.fonts.body,
    fontSize: signInTheme.subtitleSize,
    fontWeight: "400",
    letterSpacing: 0.15,
    lineHeight: signInTheme.subtitleSize * 1.45,
    marginTop: signInTheme.heroTitleSubtitleGap,
    textAlign: "center",
  },
});
