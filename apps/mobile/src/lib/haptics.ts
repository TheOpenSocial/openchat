import * as Haptics from "expo-haptics";
import { AccessibilityInfo } from "react-native";

let reduceMotionEnabled = false;

void AccessibilityInfo.isReduceMotionEnabled()
  .then((value) => {
    reduceMotionEnabled = value;
  })
  .catch(() => {});

AccessibilityInfo.addEventListener("reduceMotionChanged", (value) => {
  reduceMotionEnabled = value;
});

export function hapticImpact(
  style: Haptics.ImpactFeedbackStyle = Haptics.ImpactFeedbackStyle.Light,
) {
  if (reduceMotionEnabled) {
    return;
  }
  void Haptics.impactAsync(style).catch(() => {});
}

export function hapticSelection() {
  if (reduceMotionEnabled) {
    return;
  }
  void Haptics.selectionAsync().catch(() => {});
}
