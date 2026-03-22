import * as SplashScreen from "expo-splash-screen";
import { LinearGradient } from "expo-linear-gradient";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Image,
  Platform,
  StyleSheet,
  View,
} from "react-native";

/** Bundled monochrome mark (transparent PNG on gradient). */
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset
const BRAND_LOGO = require("../../assets/brand/logo.png") as number;

const MIN_VISIBLE_MS = 580;
const INTRO_MS = 480;
const EXIT_MS = 420;

type PremiumSplashOverlayProps = {
  /** When true, begin exit after {@link MIN_VISIBLE_MS} has elapsed (smooth handoff to sign-in / home). */
  requestExit: boolean;
  /** Fired after the overlay has fully faded out; parent should unmount this component. */
  onExitComplete: () => void;
};

/**
 * First JS-frame splash: calm, minimal, system-level — bridges native splash → app shell.
 * No copy, no chrome; optional motion only (opacity + microscopic scale).
 */
export function PremiumSplashOverlay({
  requestExit,
  onExitComplete,
}: PremiumSplashOverlayProps) {
  const [minHoldSatisfied, setMinHoldSatisfied] = useState(false);
  const exitStartedRef = useRef(false);
  const nativeHiddenRef = useRef(false);

  const shellOpacity = useRef(new Animated.Value(1)).current;
  const logoOpacity = useRef(new Animated.Value(0.88)).current;
  const logoScale = useRef(new Animated.Value(0.988)).current;

  const runExit = useCallback(() => {
    if (exitStartedRef.current) return;
    exitStartedRef.current = true;
    Animated.timing(shellOpacity, {
      toValue: 0,
      duration: EXIT_MS,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
        onExitComplete();
      }
    });
  }, [onExitComplete, shellOpacity]);

  useEffect(() => {
    const t = setTimeout(() => setMinHoldSatisfied(true), MIN_VISIBLE_MS);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(logoOpacity, {
        toValue: 1,
        duration: INTRO_MS,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(logoScale, {
        toValue: 1,
        duration: INTRO_MS,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [logoOpacity, logoScale]);

  useEffect(() => {
    if (nativeHiddenRef.current) return;
    nativeHiddenRef.current = true;
    let cancelled = false;
    const frame = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!cancelled) {
          void SplashScreen.hideAsync();
        }
      });
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, []);

  useEffect(() => {
    if (!requestExit || !minHoldSatisfied) return;
    runExit();
  }, [requestExit, minHoldSatisfied, runExit]);

  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={[styles.shell, { opacity: shellOpacity }]}
      testID="premium-splash"
    >
      <LinearGradient
        colors={["#0d0d10", "#050506", "#000000"]}
        end={{ x: 0.5, y: 1 }}
        locations={[0, 0.45, 1]}
        start={{ x: 0.5, y: 0 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.center}>
        <Animated.View
          style={{
            opacity: logoOpacity,
            transform: [{ scale: logoScale }],
          }}
        >
          <Image
            accessibilityIgnoresInvertColors
            accessibilityLabel="OpenSocial"
            accessible
            resizeMode="contain"
            source={BRAND_LOGO}
            style={styles.logo}
          />
        </Animated.View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  shell: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#000000",
    zIndex: 100000,
    ...Platform.select({
      android: { elevation: 32 },
      default: {},
    }),
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  logo: {
    width: 96,
    height: 96,
  },
});
