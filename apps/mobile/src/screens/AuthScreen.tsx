import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { useMemo, useState } from "react";
import { ActivityIndicator, Image, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button } from "../components/ui/button";
import { InlineNotice } from "../components/InlineNotice";
import { api } from "../lib/api";
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

const WELCOME_HIGHLIGHTS = [
  {
    title: "Plans, not endless feeds",
    body: "Say what you want to do or who you’d like to meet—we surface people and paths that fit.",
  },
  {
    title: "One thread, clear next steps",
    body: "Plan, chat, and follow progress in one place so you always know what’s next.",
  },
  {
    title: "Private when it matters",
    body: "Chats and your profile stay between you and the people you choose.",
  },
] as const;

export function AuthScreen({
  allowE2EBypass = false,
  designPreviewMode = false,
  errorMessage,
  loading,
  onAuthenticated,
}: AuthScreenProps) {
  const [oauthError, setOauthError] = useState<string | null>(null);
  const [oauthLoading, setOauthLoading] = useState(false);
  const mobileRedirectUri = useMemo(() => Linking.createURL("auth/google"), []);

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
    <SafeAreaView className="flex-1 bg-canvas" testID="auth-screen">
      <ScrollView
        className="flex-1 px-6"
        contentContainerStyle={{
          flexGrow: 1,
          paddingBottom: 32,
          paddingTop: 8,
        }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text className="text-center text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
          OpenSocial
        </Text>
        <View className="mt-4 items-center">
          <View className="mb-5 h-16 w-16 items-center justify-center overflow-hidden rounded-2xl ring-1 ring-hairline">
            <Image
              accessibilityIgnoresInvertColors
              source={logoImage}
              style={{ width: 64, height: 64 }}
            />
          </View>
          <Text
            className="text-center text-[30px] font-semibold leading-tight tracking-tight text-ink"
            style={{ fontFamily: appTheme.fonts.heading }}
          >
            {designPreviewMode ? "Preview" : "Welcome"}
          </Text>
          <Text className="mt-3 max-w-[340px] text-center text-[15px] leading-[23px] text-muted">
            {designPreviewMode
              ? "Explore the full app with sample data—no account required."
              : "Where your plans meet the right people—social that starts with what you actually want to do."}
          </Text>
        </View>

        {!designPreviewMode ? (
          <View className="mt-8 gap-3">
            {WELCOME_HIGHLIGHTS.map((item) => (
              <View
                className="rounded-2xl border border-hairline bg-surfaceMuted/40 px-4 py-3.5"
                key={item.title}
              >
                <Text
                  className="text-[15px] font-semibold text-ink"
                  style={{ fontFamily: appTheme.fonts.heading }}
                >
                  {item.title}
                </Text>
                <Text className="mt-1.5 text-[13px] leading-[20px] text-muted">
                  {item.body}
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        <View className="mt-10">
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

          {!designPreviewMode ? (
            <Text className="mb-3 text-center text-[13px] leading-[20px] text-muted">
              Ready when you are—sign in to save your profile and pick up on any
              device.
            </Text>
          ) : null}

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
              onPress={handleGoogleOAuth}
              testID="auth-google-button"
            >
              {loading || oauthLoading ? (
                <ActivityIndicator color="#0d0d0d" />
              ) : null}
            </Button>
          )}

          {!designPreviewMode ? (
            <Text className="mt-4 text-center text-xs leading-relaxed text-muted">
              You’ll finish sign-in in your browser, then return here
              automatically.
            </Text>
          ) : (
            <Text className="mt-4 text-center text-xs leading-relaxed text-muted">
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
      </ScrollView>
    </SafeAreaView>
  );
}

function readQueryStringParam(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}
