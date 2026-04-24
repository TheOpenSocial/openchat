import {
  GoogleSansFlex_400Regular,
  GoogleSansFlex_600SemiBold,
  useFonts,
} from "@expo-google-fonts/google-sans-flex";
import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  AccessibilityInfo,
  Platform,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";

import { appTheme } from "../../theme";

import { signInTheme } from "./sign-in-theme";
import {
  WELCOME_TITLE_SOLO_WORDS,
  WELCOME_TITLE_TIMING,
  WELCOME_TITLE_TYPOGRAPHY,
} from "./welcome-title-sequence-timing";

const easeSlide = Easing.inOut(Easing.sin);
const easeSuffix = Easing.bezier(0.25, 0.1, 0.25, 1);
const easeSubtitle = Easing.out(Easing.sin);

const GOOGLE_SANS_FLEX_SEMIBOLD = "GoogleSansFlex_600SemiBold" as const;
const GOOGLE_SANS_FLEX_REGULAR = "GoogleSansFlex_400Regular" as const;

export type WelcomeTitleSequenceProps = {
  subtitle: string;
  onSequenceComplete?: () => void;
};

function applyFinalState(
  opWord1: SharedValue<number>,
  opWord2: SharedValue<number>,
  opWord3: SharedValue<number>,
  opOpenRow: SharedValue<number>,
  opSuffix: SharedValue<number>,
  opSubtitle: SharedValue<number>,
  txWord1: SharedValue<number>,
  txWord2: SharedValue<number>,
  txWord3: SharedValue<number>,
  txOpen: SharedValue<number>,
  txSuffix: SharedValue<number>,
) {
  opWord1.value = 0;
  opWord2.value = 0;
  opWord3.value = 0;
  opOpenRow.value = 1;
  opSuffix.value = 1;
  opSubtitle.value = 1;
  txWord1.value = 0;
  txWord2.value = 0;
  txWord3.value = 0;
  txOpen.value = 0;
  txSuffix.value = 0;
}

/** One solo line: enter from +right (initial shared value), hold, exit to −left. Fully sequential. */
function soloSlideSequence(
  delayBeforeMs: number,
  enterMs: number,
  holdMs: number,
  exitMs: number,
  exitLeftPx: number,
) {
  const enter = { duration: enterMs, easing: easeSlide };
  const exit = { duration: exitMs, easing: easeSlide };
  return {
    opacity: withDelay(
      delayBeforeMs,
      withSequence(
        withTiming(1, enter),
        withDelay(holdMs, withTiming(0, exit)),
      ),
    ),
    translateX: withDelay(
      delayBeforeMs,
      withSequence(
        withTiming(0, enter),
        withDelay(holdMs, withTiming(-exitLeftPx, exit)),
      ),
    ),
  };
}

export function WelcomeTitleSequence({
  onSequenceComplete,
  subtitle,
}: WelcomeTitleSequenceProps) {
  const [fontsLoaded] = useFonts({
    GoogleSansFlex_600SemiBold,
    GoogleSansFlex_400Regular,
  });

  const reduceMotionRef = useRef(false);

  const opWord1 = useSharedValue(0);
  const opWord2 = useSharedValue(0);
  const opWord3 = useSharedValue(0);
  const opOpenRow = useSharedValue(0);
  const opSuffix = useSharedValue(0);
  const opSubtitle = useSharedValue(0);

  const txWord1 = useSharedValue<number>(WELCOME_TITLE_TIMING.slideFromRightPx);
  const txWord2 = useSharedValue<number>(WELCOME_TITLE_TIMING.slideFromRightPx);
  const txWord3 = useSharedValue<number>(WELCOME_TITLE_TIMING.slideFromRightPx);
  const txOpen = useSharedValue<number>(WELCOME_TITLE_TIMING.slideFromRightPx);
  const txSuffix = useSharedValue<number>(
    WELCOME_TITLE_TIMING.suffixSlideFromPx,
  );

  const finishRef = useRef(onSequenceComplete);
  finishRef.current = onSequenceComplete;

  const completeOnceRef = useRef(false);
  const fireSequenceCompleteOnce = useCallback(() => {
    if (completeOnceRef.current) {
      return;
    }
    completeOnceRef.current = true;
    finishRef.current?.();
  }, []);

  useEffect(() => {
    let cancelled = false;
    completeOnceRef.current = false;
    let fallbackCompleteId: ReturnType<typeof setTimeout> | undefined;

    const start = () => {
      if (cancelled) return;

      if (reduceMotionRef.current) {
        applyFinalState(
          opWord1,
          opWord2,
          opWord3,
          opOpenRow,
          opSuffix,
          opSubtitle,
          txWord1,
          txWord2,
          txWord3,
          txOpen,
          txSuffix,
        );
        fireSequenceCompleteOnce();
        return;
      }

      const t = WELCOME_TITLE_TIMING;
      const enter = t.slideEnterMs;
      const exit = t.slideExitMs;
      const hold = t.holdMs;
      const exitL = t.slideExitLeftPx;

      const soloSegmentMs = enter + hold + exit;
      const tOpenStart = soloSegmentMs * WELCOME_TITLE_SOLO_WORDS.length;
      const tSuffixStart = tOpenStart + enter + t.holdOpenMs;

      const sequenceSettleMs = tSuffixStart + t.suffixInMs + t.holdFinalMs;

      fallbackCompleteId = setTimeout(() => {
        if (cancelled) {
          return;
        }
        fireSequenceCompleteOnce();
      }, sequenceSettleMs + 800);

      const w1 = soloSlideSequence(0, enter, hold, exit, exitL);
      opWord1.value = w1.opacity;
      txWord1.value = w1.translateX;

      const w2 = soloSlideSequence(soloSegmentMs, enter, hold, exit, exitL);
      opWord2.value = w2.opacity;
      txWord2.value = w2.translateX;

      const w3 = soloSlideSequence(2 * soloSegmentMs, enter, hold, exit, exitL);
      opWord3.value = w3.opacity;
      txWord3.value = w3.translateX;

      const slideOpen = { duration: enter, easing: easeSlide };
      opOpenRow.value = withDelay(tOpenStart, withTiming(1, slideOpen));
      txOpen.value = withDelay(tOpenStart, withTiming(0, slideOpen));

      opSuffix.value = withDelay(
        tSuffixStart,
        withSequence(
          withTiming(1, { duration: t.suffixInMs, easing: easeSuffix }),
          withDelay(
            t.holdFinalMs,
            withTiming(
              1,
              { duration: 120, easing: Easing.linear },
              (finished) => {
                if (finished) {
                  runOnJS(fireSequenceCompleteOnce)();
                }
              },
            ),
          ),
        ),
      );
      txSuffix.value = withDelay(
        tSuffixStart,
        withTiming(0, { duration: t.suffixInMs, easing: easeSuffix }),
      );

      opSubtitle.value = withDelay(
        tSuffixStart + t.suffixInMs + t.subtitleDelayMs,
        withTiming(1, { duration: t.subtitleFadeMs, easing: easeSubtitle }),
      );
    };

    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        reduceMotionRef.current = enabled;
        start();
      })
      .catch(() => {
        start();
      });

    const reduceMotionSub = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      (enabled) => {
        reduceMotionRef.current = enabled;
      },
    );

    return () => {
      cancelled = true;
      if (fallbackCompleteId !== undefined) {
        clearTimeout(fallbackCompleteId);
      }
      reduceMotionSub.remove();
      cancelAnimation(opWord1);
      cancelAnimation(opWord2);
      cancelAnimation(opWord3);
      cancelAnimation(opOpenRow);
      cancelAnimation(opSuffix);
      cancelAnimation(opSubtitle);
      cancelAnimation(txWord1);
      cancelAnimation(txWord2);
      cancelAnimation(txWord3);
      cancelAnimation(txOpen);
      cancelAnimation(txSuffix);
    };
  }, []);

  const sWord1 = useAnimatedStyle(() => ({
    opacity: opWord1.value,
    transform: [{ translateX: txWord1.value }],
  }));
  const sWord2 = useAnimatedStyle(() => ({
    opacity: opWord2.value,
    transform: [{ translateX: txWord2.value }],
  }));
  const sWord3 = useAnimatedStyle(() => ({
    opacity: opWord3.value,
    transform: [{ translateX: txWord3.value }],
  }));
  const soloLineStyles = [sWord1, sWord2, sWord3] as const;
  const sOpenRow = useAnimatedStyle(() => ({
    opacity: opOpenRow.value,
    transform: [{ translateX: txOpen.value }],
  }));
  const sSuffix = useAnimatedStyle(() => ({
    opacity: opSuffix.value,
    transform: [{ translateX: txSuffix.value }],
  }));
  const sSubtitle = useAnimatedStyle(() => ({
    opacity: opSubtitle.value,
    transform: [{ translateY: (1 - opSubtitle.value) * 3 }],
  }));

  const titleStyle = useMemo(
    () => [
      styles.titleBase,
      fontsLoaded
        ? {
            fontFamily: GOOGLE_SANS_FLEX_SEMIBOLD,
            fontWeight: "400" as const,
          }
        : {
            fontFamily: Platform.select({
              ios: "System",
              android: "sans-serif",
              default: "sans-serif",
            }),
            fontWeight: "600" as const,
          },
    ],
    [fontsLoaded],
  );

  const subtitleTypography = useMemo(
    () =>
      fontsLoaded
        ? {
            fontFamily: GOOGLE_SANS_FLEX_REGULAR,
            fontWeight: "400" as const,
            letterSpacing: Platform.OS === "ios" ? -0.08 : 0.02,
          }
        : {
            fontFamily: appTheme.fonts.body,
            fontWeight: "400" as const,
            letterSpacing: 0.15,
          },
    [fontsLoaded],
  );

  const a11yLabel = `${WELCOME_TITLE_SOLO_WORDS.join(" ")} Open Social. ${subtitle}`;

  return (
    <View
      accessibilityRole="header"
      style={styles.wrap}
      accessibilityLabel={a11yLabel}
      testID="auth-welcome-title-sequence"
    >
      <View style={styles.anchor}>
        {WELCOME_TITLE_SOLO_WORDS.map((word, index) => (
          <Animated.View
            key={word}
            accessibilityElementsHidden
            importantForAccessibility="no"
            pointerEvents="none"
            style={[styles.absoluteCenter, soloLineStyles[index]]}
            testID={`auth-welcome-cycling-word-${index + 1}`}
          >
            <Text style={titleStyle} maxFontSizeMultiplier={1.35}>
              {word}
            </Text>
          </Animated.View>
        ))}
        <Animated.View
          pointerEvents="none"
          style={[styles.openRow, styles.absoluteCenter, sOpenRow]}
          testID="auth-welcome-final-title"
        >
          <Text style={titleStyle} maxFontSizeMultiplier={1.35}>
            Open
          </Text>
          <Animated.View style={sSuffix}>
            <Text style={titleStyle} maxFontSizeMultiplier={1.35}>
              {" Social."}
            </Text>
          </Animated.View>
        </Animated.View>
      </View>

      <Animated.Text
        style={[styles.subtitle, subtitleTypography, sSubtitle]}
        maxFontSizeMultiplier={1.35}
        testID="auth-welcome-subtitle"
      >
        {subtitle}
      </Animated.Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignSelf: "center",
    width: "100%",
    maxWidth: signInTheme.heroMaxWidth + 24,
    paddingHorizontal: 4,
  },
  anchor: {
    minHeight: WELCOME_TITLE_TYPOGRAPHY.titleSize * 1.25,
    width: "100%",
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
    overflow: "visible",
  },
  absoluteCenter: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  openRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "center",
  },
  titleBase: {
    color: "rgba(255,255,255,0.96)",
    fontSize: WELCOME_TITLE_TYPOGRAPHY.titleSize,
    letterSpacing:
      Platform.OS === "ios"
        ? WELCOME_TITLE_TYPOGRAPHY.letterSpacingIos
        : WELCOME_TITLE_TYPOGRAPHY.letterSpacingAndroid,
    lineHeight: WELCOME_TITLE_TYPOGRAPHY.titleSize * 1.08,
    textAlign: "center",
  },
  subtitle: {
    alignSelf: "center",
    color: "rgba(255,255,255,0.66)",
    fontSize: signInTheme.subtitleSize,
    lineHeight: signInTheme.subtitleSize * 1.5,
    marginTop: signInTheme.heroTitleSubtitleGap,
    maxWidth: signInTheme.heroMaxWidth,
    textAlign: "center",
  },
});
