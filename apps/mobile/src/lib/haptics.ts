import * as Haptics from "expo-haptics";
import { AccessibilityInfo } from "react-native";

let reduceMotionEnabled = false;
let reduceMotionSubscription: { remove(): void } | null = null;

function ensureReduceMotionTracking(): void {
  if (reduceMotionSubscription) {
    return;
  }
  reduceMotionSubscription = AccessibilityInfo.addEventListener(
    "reduceMotionChanged",
    (value) => {
      reduceMotionEnabled = value;
    },
  );
  void AccessibilityInfo.isReduceMotionEnabled()
    .then((value) => {
      reduceMotionEnabled = value;
    })
    .catch(() => {});
}

export function hapticImpact(
  style: Haptics.ImpactFeedbackStyle = Haptics.ImpactFeedbackStyle.Light,
) {
  ensureReduceMotionTracking();
  if (reduceMotionEnabled) {
    return;
  }
  void Haptics.impactAsync(style).catch(() => {});
}

export function hapticSelection() {
  ensureReduceMotionTracking();
  if (reduceMotionEnabled) {
    return;
  }
  void Haptics.selectionAsync().catch(() => {});
}
