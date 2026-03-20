import { useMemo, useState } from "react";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { AnimatedScreen } from "../components/AnimatedScreen";
import {
  DESIGN_MOCK_AUTH_CODE,
  DESIGN_MOCK_PROFILE,
  DESIGN_MOCK_SESSION,
} from "../mocks/design-fixtures";
import { MobileSession, UserProfileDraft } from "../types";
import { AuthScreen } from "./AuthScreen";
import { HomeScreen } from "./HomeScreen";
import { OnboardingScreen } from "./OnboardingScreen";
import { WelcomeScreen } from "./WelcomeScreen";

type DesignMockStage = "welcome" | "auth" | "onboarding" | "home";

export function DesignMockApp() {
  const [stage, setStage] = useState<DesignMockStage>("welcome");
  const [authError, setAuthError] = useState<string | null>(null);
  const [onboardingError, setOnboardingError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [onboardingLoading, setOnboardingLoading] = useState(false);
  const [session, setSession] = useState<MobileSession | null>(null);
  const [displayName, setDisplayName] = useState(
    DESIGN_MOCK_PROFILE.displayName,
  );
  const [profile, setProfile] = useState<UserProfileDraft>(DESIGN_MOCK_PROFILE);

  const stageKey = useMemo(() => stage, [stage]);

  const handleAuthenticate = async (code: string) => {
    setAuthLoading(true);
    setAuthError(null);
    try {
      if (code === DESIGN_MOCK_AUTH_CODE) {
        setSession({ ...DESIGN_MOCK_SESSION });
        setDisplayName(DESIGN_MOCK_SESSION.displayName);
        setProfile({ ...DESIGN_MOCK_PROFILE });
        setStage("onboarding");
        return;
      }
      setAuthError(
        "In design preview, use “Continue with preview profile” on the sign-in screen.",
      );
    } finally {
      setAuthLoading(false);
    }
  };

  const handleOnboardingComplete = async (draft: UserProfileDraft) => {
    if (!session) {
      setOnboardingError("Missing preview session.");
      return;
    }
    setOnboardingLoading(true);
    setOnboardingError(null);
    try {
      setProfile(draft);
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
    <SafeAreaProvider>
      <StatusBar style="light" />
      <AnimatedScreen screenKey={stageKey}>
        {stage === "welcome" ? (
          <WelcomeScreen onContinue={() => setStage("auth")} />
        ) : null}
        {stage === "auth" ? (
          <AuthScreen
            designPreviewMode
            errorMessage={authError}
            loading={authLoading}
            onAuthenticated={handleAuthenticate}
          />
        ) : null}
        {stage === "onboarding" && session ? (
          <OnboardingScreen
            defaultName={displayName}
            errorMessage={onboardingError}
            loading={onboardingLoading}
            onComplete={handleOnboardingComplete}
          />
        ) : null}
        {stage === "home" && session ? (
          <HomeScreen
            designMock
            initialProfile={profile}
            onProfileUpdated={setProfile}
            onResetSession={handleResetSession}
            session={session}
          />
        ) : null}
      </AnimatedScreen>
    </SafeAreaProvider>
  );
}
