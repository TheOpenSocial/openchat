import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { InlineNotice } from "../components/InlineNotice";
import { PrimaryButton } from "../components/PrimaryButton";
import { api } from "../lib/api";
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
  const [oauthError, setOauthError] = useState<string | null>(null);
  const [oauthLoading, setOauthLoading] = useState(false);
  const pulse = useRef(new Animated.Value(0.45)).current;
  const mobileRedirectUri = useMemo(() => Linking.createURL("auth/google"), []);

  useEffect(() => {
    const breathe = Easing.inOut(Easing.sin);
    const pulseAnimation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 1400,
          easing: breathe,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0.42,
          duration: 1400,
          easing: breathe,
          useNativeDriver: true,
        }),
      ]),
    );

    pulseAnimation.start();

    return () => {
      pulseAnimation.stop();
    };
  }, [pulse]);

  const handleGoogleOAuth = async () => {
    setOauthError(null);
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
      setOauthError(String(error));
    } finally {
      setOauthLoading(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-canvas px-6 py-4" testID="auth-screen">
      <View className="mb-8 flex-row items-center justify-between">
        <View className="rounded-full border border-hairline bg-surfaceMuted/80 px-3 py-1">
          <Text className="text-[11px] font-semibold uppercase tracking-widest text-muted">
            OpenSocial
          </Text>
        </View>
        <Animated.View
          className="h-2.5 w-2.5 rounded-full bg-accent"
          style={{ opacity: pulse }}
        />
      </View>

      <View className="rounded-3xl border border-hairline bg-surface px-5 py-6 shadow-lg shadow-black/25">
        <Text
          className="mb-2 text-[30px] font-semibold tracking-tight text-ink"
          style={{
            fontFamily: appTheme.fonts.heading,
          }}
        >
          Start with intent
        </Text>
        <Text className="mb-6 text-[15px] leading-[23px] text-muted">
          {designPreviewMode
            ? "Preview mode: walk through onboarding and the home, chats, and profile tabs with sample data."
            : "Sign in to sync your agent thread, chats, and profile across devices."}
        </Text>

        {oauthError ? (
          <View className="mb-4">
            <InlineNotice text={oauthError} tone="error" />
          </View>
        ) : null}

        {errorMessage ? (
          <View className="mb-4">
            <InlineNotice text={errorMessage} tone="error" />
          </View>
        ) : null}

        <View className="mb-3">
          {designPreviewMode ? (
            <PrimaryButton
              label="Continue with preview profile"
              loading={loading}
              onPress={() => void onAuthenticated(DESIGN_MOCK_AUTH_CODE)}
              testID="auth-design-preview-button"
            />
          ) : (
            <PrimaryButton
              label="Continue with Google"
              loading={loading || oauthLoading}
              onPress={handleGoogleOAuth}
              testID="auth-google-button"
            />
          )}
        </View>
        {!designPreviewMode && allowE2EBypass ? (
          <View className="mb-3">
            <PrimaryButton
              label="E2E Bypass Sign In"
              loading={loading}
              onPress={() => onAuthenticated("maestro-e2e-auth-code")}
              testID="auth-e2e-bypass-button"
              variant="ghost"
            />
          </View>
        ) : null}
        {!designPreviewMode ? (
          <Text className="mb-3 text-[12px] leading-[18px] text-muted">
            You’ll finish sign-in in your browser, then return here
            automatically.
          </Text>
        ) : (
          <Text className="mb-3 text-[12px] leading-[18px] text-muted">
            OAuth is off in this build. Run without design mock to sign in with
            Google.
          </Text>
        )}
      </View>

      <View className="mt-6 rounded-2xl border border-hairline/90 bg-surfaceMuted/70 px-4 py-3">
        <Text className="text-[13px] leading-[20px] text-muted">
          No infinite feed—just clear intent, thoughtful matches, and real
          conversations.
        </Text>
      </View>
    </SafeAreaView>
  );
}

function readQueryStringParam(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}
