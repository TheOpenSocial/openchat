import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { WelcomeBackdrop } from "../components/WelcomeBackdrop";
import { type AppLocale, t } from "../i18n/strings";
import { api } from "../lib/api";
import { showErrorToast } from "../lib/app-toast";
import { appTheme } from "../theme";

import { SignInActions } from "./sign-in/SignInActions";
import { SignInGradientOverlay } from "./sign-in/SignInGradientOverlay";
import { signInTheme } from "./sign-in/sign-in-theme";
import { WELCOME_TITLE_TIMING } from "./sign-in/welcome-title-sequence-timing";
import { WelcomeTitleSequence } from "./sign-in/WelcomeTitleSequence";

interface AuthScreenProps {
  onAuthenticated: (code: string) => Promise<void>;
  onDevBypass?: (() => void | Promise<void>) | null;
  loading: boolean;
  errorMessage: string | null;
  locale?: AppLocale;
}

WebBrowser.maybeCompleteAuthSession();

/**
 * Premium full-screen sign-in / landing: video hero, cinematic scrim, minimal copy and CTA.
 * @alias OpenSocialSignInScreen
 */
export function AuthScreen({
  errorMessage,
  loading,
  locale = "en",
  onAuthenticated,
  onDevBypass = null,
}: AuthScreenProps) {
  const [oauthLoading, setOauthLoading] = useState(false);
  const autoBypassTriggeredRef = useRef(false);
  const mobileRedirectUri = useMemo(() => Linking.createURL("auth/google"), []);
  const footerOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    footerOpacity.setValue(0);
  }, [footerOpacity]);

  const handleWelcomeTitleSequenceComplete = useCallback(() => {
    Animated.timing(footerOpacity, {
      toValue: 1,
      duration: WELCOME_TITLE_TIMING.ctaFadeInMs,
      delay: WELCOME_TITLE_TIMING.ctaRevealDelayMs,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [footerOpacity]);

  useEffect(() => {
    if (!errorMessage) {
      return;
    }
    showErrorToast(errorMessage, { title: t("authSignInFailed", locale) });
  }, [errorMessage, locale]);

  useEffect(() => {
    if (
      !__DEV__ ||
      !onDevBypass ||
      autoBypassTriggeredRef.current ||
      !process.env.EXPO_PUBLIC_E2E_SESSION_B64?.trim()
    ) {
      return;
    }
    autoBypassTriggeredRef.current = true;
    void onDevBypass();
  }, [onDevBypass]);

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
        throw new Error(t("authCouldNotSignIn", locale));
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
        throw new Error(t("authCouldNotSignIn", locale));
      }

      await onAuthenticated(code);
    } catch (error) {
      showErrorToast(String(error), { title: t("authCouldNotSignIn", locale) });
    } finally {
      setOauthLoading(false);
    }
  };

  const subtitle = t("authSubtitle", locale);

  return (
    <View className="flex-1 bg-black" testID="auth-screen">
      <WelcomeBackdrop
        style={StyleSheet.absoluteFillObject}
        testID="auth-welcome-backdrop"
      >
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
              <WelcomeTitleSequence
                subtitle={subtitle}
                onSequenceComplete={handleWelcomeTitleSequenceComplete}
              />
              <View style={styles.flexSpacerLarge} />
            </View>

            <Animated.View style={[styles.footer, { opacity: footerOpacity }]}>
              <SignInActions
                locale={locale}
                loading={loading}
                oauthLoading={oauthLoading}
                onGooglePress={() => {
                  void handleGoogleOAuth();
                }}
              />
              {__DEV__ && onDevBypass ? (
                <Pressable
                  accessibilityLabel="Continue with local test session"
                  accessibilityRole="button"
                  className="mt-3 self-center rounded-full border border-white/25 bg-white/10 px-4 py-2"
                  onPress={() => {
                    void onDevBypass();
                  }}
                  testID="auth-e2e-bypass-button"
                >
                  <Text className="text-[12px] font-semibold tracking-[0.12em] text-white/85">
                    Continue locally
                  </Text>
                </Pressable>
              ) : null}
            </Animated.View>
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
    color: appTheme.colors.muted,
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
