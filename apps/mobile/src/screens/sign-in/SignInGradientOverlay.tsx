import { LinearGradient } from "expo-linear-gradient";
import { StyleSheet, View } from "react-native";

/**
 * Cinematic readability: stronger top and bottom, softer mid so the video stays the hero.
 * Two linear layers max; second is a light horizontal vignette.
 */
export function SignInGradientOverlay() {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
    >
      <LinearGradient
        colors={[
          "rgba(0,0,0,0.5)",
          "rgba(0,0,0,0.1)",
          "rgba(0,0,0,0.14)",
          "rgba(0,0,0,0.68)",
        ]}
        locations={[0, 0.36, 0.55, 1]}
        style={StyleSheet.absoluteFill}
      />
      <LinearGradient
        colors={["rgba(0,0,0,0.22)", "rgba(0,0,0,0)", "rgba(0,0,0,0.22)"]}
        end={{ x: 1, y: 0.5 }}
        locations={[0, 0.5, 1]}
        start={{ x: 0, y: 0.5 }}
        style={[StyleSheet.absoluteFill, { opacity: 0.55 }]}
      />
    </View>
  );
}
