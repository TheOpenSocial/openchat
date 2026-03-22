import { StatusBar } from "expo-status-bar";
import {
  lazy,
  type LazyExoticComponent,
  type FC,
  Suspense,
  useMemo,
  useState,
} from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { AnimatedScreen } from "../components/AnimatedScreen";
import { AppToastHost } from "../components/AppToastHost";
import { LoadingState } from "../components/LoadingState";
import { type AppLocale, t } from "../i18n/strings";
import {
  DESIGN_MOCK_AUTH_CODE,
  DESIGN_MOCK_PROFILE,
  DESIGN_MOCK_SESSION,
} from "../mocks/design-fixtures";
import {
  draftStateToUserProfileDraft,
  type OnboardingDraftState,
} from "../onboarding/onboarding-model";
import { OnboardingFlow } from "../onboarding/OnboardingFlow";
import { MobileSession, UserProfileDraft } from "../types";
import { AuthScreen } from "./AuthScreen";
import type { HomeScreenProps } from "./HomeScreen";
import { WelcomeScreen } from "./WelcomeScreen";

const HomeScreen: LazyExoticComponent<FC<HomeScreenProps>> = lazy(() =>
  import("./HomeScreen").then((m) => ({ default: m.HomeScreen })),
);

type DesignMockStage = "welcome" | "auth" | "onboarding" | "home";

export function DesignMockApp() {
  const [stage, setStage] = useState<DesignMockStage>("welcome");
  const [locale] = useState<AppLocale>("en");
  const [authError, setAuthError] = useState<string | null>(null);
  const [onboardingError, setOnboardingError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [onboardingLoading, setOnboardingLoading] = useState(false);
  const [session, setSession] = useState<MobileSession | null>(null);
  const [profile, setProfile] = useState<UserProfileDraft>(DESIGN_MOCK_PROFILE);
  const [homeAgentSeedMessage, setHomeAgentSeedMessage] = useState<
    string | null
  >(null);

  const stageKey = useMemo(() => stage, [stage]);

  const handleAuthenticate = async (code: string) => {
    setAuthLoading(true);
    setAuthError(null);
    try {
      if (code === DESIGN_MOCK_AUTH_CODE) {
        setSession({ ...DESIGN_MOCK_SESSION });
        setProfile({ ...DESIGN_MOCK_PROFILE });
        setStage("onboarding");
        return;
      }
      setAuthError(t("designPreviewUsePreviewProfile", locale));
    } finally {
      setAuthLoading(false);
    }
  };

  const handleOnboardingComplete = async (
    state: OnboardingDraftState,
    meta: { firstIntentText: string | null },
  ) => {
    if (!session) {
      setOnboardingError(t("designPreviewMissingSession", locale));
      return;
    }
    setOnboardingLoading(true);
    setOnboardingError(null);
    try {
      const draft = draftStateToUserProfileDraft(state);
      setProfile(draft);
      setHomeAgentSeedMessage(meta.firstIntentText?.trim() || null);
      setStage("home");
    } finally {
      setOnboardingLoading(false);
    }
  };

  const handleResetSession = async () => {
    setSession(null);
    setStage("auth");
    setAuthError(null);
    setOnboardingError(null);
  };

  return (
    <SafeAreaProvider style={{ flex: 1 }}>
      <StatusBar style="light" />
      {stage === "auth" ? (
        <AuthScreen
          designPreviewMode
          errorMessage={authError}
          locale={locale}
          loading={authLoading}
          onAuthenticated={handleAuthenticate}
        />
      ) : (
        <AnimatedScreen screenKey={stageKey}>
          {stage === "welcome" ? (
            <WelcomeScreen
              locale={locale}
              onContinue={() => setStage("auth")}
            />
          ) : null}
          {stage === "onboarding" && session ? (
            <OnboardingFlow
              errorMessage={onboardingError}
              locale={locale}
              loading={onboardingLoading}
              onSubmit={handleOnboardingComplete}
              session={session}
            />
          ) : null}
          {stage === "home" && session ? (
            <Suspense
              fallback={<LoadingState label={t("loadingYourSpace", locale)} />}
            >
              <HomeScreen
                designMock
                initialAgentMessage={homeAgentSeedMessage}
                initialProfile={profile}
                onInitialAgentMessageConsumed={() =>
                  setHomeAgentSeedMessage(null)
                }
                onProfileUpdated={setProfile}
                onResetSession={handleResetSession}
                session={session}
              />
            </Suspense>
          ) : null}
        </AnimatedScreen>
      )}
      <AppToastHost />
    </SafeAreaProvider>
  );
}
