import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Platform,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { WelcomeBackdrop } from "../components/WelcomeBackdrop";
import { Button } from "../components/ui/button";
import { api } from "../lib/api";
import { showErrorToast } from "../lib/app-toast";
import logoImage from "../../assets/brand/logo.png";
import { DESIGN_MOCK_AUTH_CODE } from "../mocks/design-fixtures";
import { appTheme } from "../theme";

interface AuthScreenProps {
  onAuthenticated: (code: string) => Promise<void>;
  loading: boolean;
  errorMessage: string | null;
  allowE2EBypass?: boolean;
  /** Static preview flow: single CTA, no OAuth (uses `design-mock-preview` code). */
  designPreviewMode?: boolean;
}

WebBrowser.maybeCompleteAuthSession();

export function AuthScreen({
  allowE2EBypass = false,
  designPreviewMode = false,
  errorMessage,
  loading,
  onAuthenticated,
}: AuthScreenProps) {
  const [oauthLoading, setOauthLoading] = useState(false);
  const mobileRedirectUri = useMemo(() => Linking.createURL("auth/google"), []);

  useEffect(() => {
    if (!errorMessage) {
      return;
    }
    showErrorToast(errorMessage, { title: "Sign-in failed" });
  }, [errorMessage]);

  const handleGoogleOAuth = async () => {
    setOauthLoading(true);

    try {
      const { url } = await api.getGoogleAuthUrl(mobileRedirectUri);
      const result = await WebBrowser.openAuthSessionAsync(
        url,
        mobileRedirectUri,
      );

      if (result.type === "cancel" || result.type === "dismiss") {
        return;
      }
      if (result.type !== "success") {
        throw new Error("Google sign-in did not complete.");
      }

      const parsed = Linking.parse(result.url);
      const code = readQueryStringParam(parsed.queryParams?.code);
      const oauthErrorCode = readQueryStringParam(parsed.queryParams?.error);
      const oauthErrorDescription = readQueryStringParam(
        parsed.queryParams?.error_description,
      );

      if (oauthErrorCode) {
        throw new Error(
          oauthErrorDescription ?? `Google sign-in failed (${oauthErrorCode}).`,
        );
      }
      if (!code) {
        throw new Error("Google authorization code missing.");
      }

      await onAuthenticated(code);
    } catch (error) {
      showErrorToast(String(error), { title: "Could not sign in" });
    } finally {
      setOauthLoading(false);
    }
  };

  return (
    <View className="flex-1 bg-black" testID="auth-screen">
      <WelcomeBackdrop style={StyleSheet.absoluteFillObject}>
        <SafeAreaView
          className="flex-1"
          edges={["top", "bottom", "left", "right"]}
          style={styles.authSafeArea}
        >
          <View className="flex-1 px-6 pb-8 pt-3">
            <View className="items-center pt-1">
              <View style={styles.logoHalo}>
                <View style={styles.logoSquircle}>
                  <Image
                    accessibilityIgnoresInvertColors
                    accessibilityLabel="OpenSocial"
                    source={logoImage}
                    style={styles.logoImage}
                  />
                </View>
              </View>
              <Text className="mt-4 text-[10px] font-semibold uppercase tracking-[0.22em] text-white/55">
                OpenSocial
              </Text>
            </View>

            <View className="mt-6 flex-1 justify-end px-1 pb-2">
              <Text
                className="text-center text-[28px] font-semibold leading-[1.14] tracking-tight text-white"
                style={{ fontFamily: appTheme.fonts.heading }}
              >
                {designPreviewMode
                  ? "Stress-test the whole product"
                  : "Agentic social."}
              </Text>
              <Text className="mt-2.5 max-w-[340px] self-center text-center text-[15px] leading-[22px] text-white/78">
                {designPreviewMode
                  ? "Sample people, the agent, every tab. Zero sync, zero account, this device only."
                  : "Say what you want. We find the right people and help you make a plan."}
              </Text>
            </View>

            <View className="mt-6">
              {designPreviewMode ? (
                <Button
                  className="h-12 min-h-[48px] rounded-full border-0 bg-white"
                  disabled={loading}
                  label="Continue with preview profile"
                  labelClassName="text-[15px] font-medium text-[#0d0d0d]"
                  onPress={() => void onAuthenticated(DESIGN_MOCK_AUTH_CODE)}
                  testID="auth-design-preview-button"
                >
                  {loading ? <ActivityIndicator color="#0d0d0d" /> : null}
                </Button>
              ) : (
                <Button
                  className="h-12 min-h-[48px] rounded-full border-0 bg-white"
                  disabled={loading || oauthLoading}
                  label="Continue with Google"
                  labelClassName="text-[15px] font-medium text-[#0d0d0d]"
                  onPress={() => {
                    void handleGoogleOAuth();
                  }}
                  testID="auth-google-button"
                >
                  {loading || oauthLoading ? (
                    <ActivityIndicator color="#0d0d0d" />
                  ) : null}
                </Button>
              )}

              {!designPreviewMode ? (
                <Text className="mt-3 text-center text-[11px] leading-relaxed text-white/55">
                  Google opens in your browser, then you’re back here.
                </Text>
              ) : (
                <Text className="mt-4 text-center text-xs leading-relaxed text-white/55">
                  OAuth is off in this build. Run without design mock to sign in
                  with Google.
                </Text>
              )}

              {!designPreviewMode && allowE2EBypass ? (
                <View className="mt-6">
                  <Button
                    label="E2E bypass sign-in"
                    onPress={() => onAuthenticated("maestro-e2e-auth-code")}
                    testID="auth-e2e-bypass-button"
                    variant="outline"
                  />
                </View>
              ) : null}
            </View>
          </View>
        </SafeAreaView>
      </WelcomeBackdrop>
    </View>
  );
}

const LOGO_SIZE = 56;

const styles = StyleSheet.create({
  authSafeArea: {
    flex: 1,
  },
  logoHalo: {
    borderRadius: 26,
    padding: 2,
    backgroundColor: "rgba(255,255,255,0.14)",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.45,
        shadowRadius: 18,
      },
      android: {
        elevation: 12,
      },
      default: {},
    }),
  },
  logoSquircle: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 24,
    overflow: "hidden",
    padding: 12,
    backgroundColor: "rgba(14,14,16,0.78)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.28)",
  },
  logoImage: {
    width: LOGO_SIZE,
    height: LOGO_SIZE,
  },
});

function readQueryStringParam(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}
