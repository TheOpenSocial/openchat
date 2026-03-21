import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { WelcomeBackdrop } from "../components/WelcomeBackdrop";
import { api } from "../lib/api";
import { showErrorToast } from "../lib/app-toast";
import { DESIGN_MOCK_AUTH_CODE } from "../mocks/design-fixtures";

import { SignInActions } from "./sign-in/SignInActions";
import { SignInGradientOverlay } from "./sign-in/SignInGradientOverlay";
import { SignInHeroCopy } from "./sign-in/SignInHeroCopy";
import { signInTheme } from "./sign-in/sign-in-theme";

interface AuthScreenProps {
  onAuthenticated: (code: string) => Promise<void>;
  loading: boolean;
  errorMessage: string | null;
  allowE2EBypass?: boolean;
  /** Static preview flow: single CTA, no OAuth (uses `design-mock-preview` code). */
  designPreviewMode?: boolean;
}

WebBrowser.maybeCompleteAuthSession();

/**
 * Premium full-screen sign-in / landing: video hero, cinematic scrim, minimal copy and CTA.
 * @alias OpenSocialSignInScreen
 */
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

  const title = designPreviewMode ? "Preview" : "Agentic social.";
  const subtitle = designPreviewMode
    ? "Sample flows and data. Stays on this device."
    : "Start with intent. We find your people.";

  return (
    <View className="flex-1 bg-black" testID="auth-screen">
      <WelcomeBackdrop style={StyleSheet.absoluteFillObject}>
        <SignInGradientOverlay />
        <SafeAreaView
          edges={["top", "bottom", "left", "right"]}
          style={styles.safeArea}
        >
          <View style={styles.shell}>
            <Text accessibilityElementsHidden style={styles.wordmark}>
              OPENSOCIAL
            </Text>

            <View style={styles.middle}>
              <View style={styles.flexSpacer} />
              <SignInHeroCopy subtitle={subtitle} title={title} />
              <View style={styles.flexSpacerLarge} />
            </View>

            <View style={styles.footer}>
              <SignInActions
                allowE2EBypass={allowE2EBypass}
                designPreviewMode={designPreviewMode}
                loading={loading}
                oauthLoading={oauthLoading}
                onE2EBypassPress={() =>
                  void onAuthenticated("maestro-e2e-auth-code")
                }
                onGooglePress={() => {
                  void handleGoogleOAuth();
                }}
                onPreviewPress={() =>
                  void onAuthenticated(DESIGN_MOCK_AUTH_CODE)
                }
              />
            </View>
          </View>
        </SafeAreaView>
      </WelcomeBackdrop>
    </View>
  );
}

/** Same screen as {@link AuthScreen}; use either name in imports. */
export const OpenSocialSignInScreen = AuthScreen;

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  shell: {
    flex: 1,
    paddingHorizontal: signInTheme.contentPaddingH,
    paddingTop: 8,
  },
  wordmark: {
    alignSelf: "center",
    color: "rgba(255,255,255,0.36)",
    fontSize: signInTheme.wordmarkSize,
    fontWeight: "600",
    letterSpacing: signInTheme.wordmarkSize * 0.22,
    marginBottom: 4,
  },
  middle: {
    flex: 1,
    justifyContent: "center",
    minHeight: 0,
  },
  flexSpacer: {
    flex: 1.05,
    minHeight: 0,
  },
  flexSpacerLarge: {
    flex: 1.35,
    minHeight: 0,
  },
  footer: {
    paddingBottom: 10,
  },
});

function readQueryStringParam(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}
