import { BaseToast } from "react-native-toast-message";
import Toast from "react-native-toast-message";
import { Platform, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { appTheme } from "../theme";

/**
 * Mount once inside `SafeAreaProvider` (typically at app root). Pairs with `showErrorToast` from `../lib/app-toast`.
 * Renders in an absolute overlay with high z-index so native layers (e.g. expo-video) and full-screen siblings
 * do not paint over toasts.
 */
export function AppToastHost() {
  const insets = useSafeAreaInsets();

  return (
    <View collapsable={false} pointerEvents="box-none" style={styles.overlay}>
      <Toast
        bottomOffset={insets.bottom + 16}
        config={{
          appError: (props) => (
            <BaseToast
              {...props}
              contentContainerStyle={{
                paddingHorizontal: 14,
                paddingVertical: 4,
              }}
              style={{
                backgroundColor: "rgba(28,28,30,0.96)",
                borderLeftWidth: 0,
                height: undefined,
                minHeight: 64,
              }}
              text1NumberOfLines={2}
              text1Style={{
                color: appTheme.colors.ink,
                fontSize: 15,
                fontWeight: "600",
              }}
              text2NumberOfLines={6}
              text2Style={{
                color: appTheme.colors.muted,
                fontSize: 13,
                lineHeight: 18,
              }}
            />
          ),
        }}
        topOffset={Math.max(insets.top + 8, 12)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 200000,
    ...Platform.select({
      android: { elevation: 24 },
      default: {},
    }),
  },
});
