import "./global.css";

import { StatusBar } from "expo-status-bar";
import {
  lazy,
  type LazyExoticComponent,
  type FC,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { AnimatedScreen } from "./src/components/AnimatedScreen";
import { AppToastHost } from "./src/components/AppToastHost";
import { LoadingState } from "./src/components/LoadingState";
import { api, configureApiAuthLifecycle } from "./src/lib/api";
import {
  clearStoredSession,
  loadStoredSession,
  saveStoredSession,
} from "./src/lib/session-storage";
import { trackTelemetryEvent } from "./src/lib/telemetry";
import { AuthScreen } from "./src/screens/AuthScreen";
import type { HomeScreenProps } from "./src/screens/HomeScreen";
import { OnboardingScreen } from "./src/screens/OnboardingScreen";
import { AppStage, MobileSession, UserProfileDraft } from "./src/types";

const HomeScreen: LazyExoticComponent<FC<HomeScreenProps>> = lazy(() =>
  import("./src/screens/HomeScreen").then((m) => ({ default: m.HomeScreen })),
);

const DesignMockApp: LazyExoticComponent<FC> = lazy(() =>
  import("./src/screens/DesignMockApp").then((m) => ({
    default: m.DesignMockApp,
  })),
);

const designMockApp =
  process.env.EXPO_PUBLIC_DESIGN_MOCK === "1" ||
  process.env.EXPO_PUBLIC_DESIGN_MOCK === "true";

function ProductionApp() {
  const allowE2EBypass = process.env.EXPO_PUBLIC_ENABLE_E2E_AUTH_BYPASS === "1";
  const enableE2ELocalMode =
    process.env.EXPO_PUBLIC_ENABLE_E2E_LOCAL_MODE === "1";
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [stage, setStage] = useState<AppStage>("auth");
  const [authError, setAuthError] = useState<string | null>(null);
  const [onboardingError, setOnboardingError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [onboardingLoading, setOnboardingLoading] = useState(false);
  const [session, setSession] = useState<MobileSession | null>(null);
  const [displayName, setDisplayName] = useState("Explorer");
  const [pendingOnboardingIntent, setPendingOnboardingIntent] = useState<
    string | null
  >(null);
  const [profile, setProfile] = useState<UserProfileDraft>({
    displayName: "Explorer",
    bio: "",
    city: "",
    country: "",
    interests: [],
    socialMode: "either",
    notificationMode: "live",
  });
  const appOpenedTrackedRef = useRef<string | null>(null);

  useEffect(() => {
    configureApiAuthLifecycle({
      onSessionRefreshed: (tokens) => {
        setSession((current) => {
          if (!current) {
            return current;
          }
          const next = {
            ...current,
            ...tokens,
          };
          void saveStoredSession({
            userId: next.userId,
            displayName: next.displayName,
            email: next.email,
            accessToken: next.accessToken,
            refreshToken: next.refreshToken,
            sessionId: next.sessionId,
          }).catch(() => {});
          return next;
        });
      },
      onAuthFailure: () => {
        setSession(null);
        setStage("auth");
        setAuthError("Session expired. Sign in again.");
      },
    });

    return () => {
      configureApiAuthLifecycle({});
    };
  }, []);

  useEffect(() => {
    let mounted = true;

    const restore = async () => {
      try {
        const stored = await loadStoredSession();
        if (!stored) {
          return;
        }

        const completion = await api.getProfileCompletion(
          stored.userId,
          stored.accessToken,
        );
        const restoredSession: MobileSession = {
          userId: stored.userId,
          displayName: stored.displayName,
          email: stored.email ?? null,
          accessToken: stored.accessToken,
          refreshToken: stored.refreshToken,
          sessionId: stored.sessionId,
        };

        if (!mounted) {
          return;
        }

        setSession(restoredSession);
        setDisplayName(stored.displayName);
        setProfile((current) => ({
          ...current,
          displayName: stored.displayName,
        }));
        setStage(completion.completed ? "home" : "onboarding");
        void trackTelemetryEvent(stored.userId, "auth_session_restored", {
          completionState: completion.onboardingState,
          profileCompleted: completion.completed,
        }).catch(() => {});
      } catch {
        await clearStoredSession();
        if (mounted) {
          setStage("auth");
        }
      } finally {
        if (mounted) {
          setIsBootstrapping(false);
        }
      }
    };

    restore().catch(() => {
      setIsBootstrapping(false);
      setStage("auth");
    });

    return () => {
      mounted = false;
    };
  }, []);

  const handleAuthenticate = async (code: string) => {
    setAuthLoading(true);
    setAuthError(null);

    try {
      if (
        allowE2EBypass &&
        enableE2ELocalMode &&
        code === "maestro-e2e-auth-code"
      ) {
        const nextSession: MobileSession = {
          userId: "maestro-e2e-user",
          displayName: "Maestro User",
          email: "maestro-e2e@example.com",
          accessToken: "maestro-e2e-access-token",
          refreshToken: "maestro-e2e-refresh-token",
          sessionId: `maestro-e2e-session-${Date.now().toString(36)}`,
        };

        await saveStoredSession({
          userId: nextSession.userId,
          displayName: nextSession.displayName,
          email: nextSession.email,
          accessToken: nextSession.accessToken,
          refreshToken: nextSession.refreshToken,
          sessionId: nextSession.sessionId,
        });

        setSession(nextSession);
        setDisplayName(nextSession.displayName);
        setProfile((current) => ({
          ...current,
          displayName: nextSession.displayName,
        }));
        setStage("home");
        void trackTelemetryEvent(nextSession.userId, "auth_success", {
          source: "e2e_local_bypass",
        }).catch(() => {});
        return;
      }

      const authResult = await api.authGoogleCallback(code);
      const nextSession: MobileSession = {
        userId: authResult.user.id,
        displayName: authResult.user.displayName,
        email: authResult.user.email,
        accessToken: authResult.accessToken,
        refreshToken: authResult.refreshToken,
        sessionId: authResult.sessionId,
      };

      await saveStoredSession({
        userId: nextSession.userId,
        displayName: nextSession.displayName,
        email: nextSession.email,
        accessToken: nextSession.accessToken,
        refreshToken: nextSession.refreshToken,
        sessionId: nextSession.sessionId,
      });

      const completion = await api.getProfileCompletion(
        nextSession.userId,
        nextSession.accessToken,
      );

      setSession(nextSession);
      setDisplayName(nextSession.displayName);
      setProfile((current) => ({
        ...current,
        displayName: nextSession.displayName,
      }));
      setStage(completion.completed ? "home" : "onboarding");
      void trackTelemetryEvent(nextSession.userId, "auth_success", {
        source: "oauth",
      }).catch(() => {});
    } catch (error) {
      setAuthError(String(error));
    } finally {
      setAuthLoading(false);
    }
  };

  const handleOnboardingComplete = async (draft: UserProfileDraft) => {
    if (!session) {
      setOnboardingError("Missing authenticated session.");
      return;
    }

    setOnboardingLoading(true);
    setOnboardingError(null);

    try {
      await api.updateProfile(
        session.userId,
        {
          displayName: draft.displayName,
          bio: draft.bio || undefined,
          city: draft.city || undefined,
          country: draft.country || undefined,
          visibility: "public",
        },
        session.accessToken,
      );

      const topicLabels = Array.from(
        new Set([...(draft.onboardingGoals ?? []), ...draft.interests]),
      );
      const preferredLocale = (() => {
        try {
          return Intl.DateTimeFormat().resolvedOptions().locale;
        } catch {
          return "en";
        }
      })();

      await Promise.all([
        api.replaceInterests(
          session.userId,
          draft.interests.map((interest) => ({
            kind: "topic",
            label: interest,
          })),
          session.accessToken,
        ),
        api.replaceTopics(
          session.userId,
          topicLabels.map((label) => ({
            label,
          })),
          session.accessToken,
        ),
        api.setSocialMode(
          session.userId,
          draft.socialMode === "one_to_one"
            ? {
                socialMode: "balanced",
                preferOneToOne: true,
                allowGroupInvites: false,
              }
            : draft.socialMode === "group"
              ? {
                  socialMode: "high_energy",
                  preferOneToOne: false,
                  allowGroupInvites: true,
                }
              : {
                  socialMode: "balanced",
                  preferOneToOne: false,
                  allowGroupInvites: true,
                },
          session.accessToken,
        ),
        api.setGlobalRules(
          session.userId,
          {
            whoCanContact: "anyone",
            reachable:
              draft.preferredAvailability === "now"
                ? "available_only"
                : "always",
            intentMode:
              draft.socialMode === "one_to_one"
                ? "one_to_one"
                : draft.socialMode === "group"
                  ? "group"
                  : "balanced",
            modality:
              draft.preferredMode === "online"
                ? "online"
                : draft.preferredMode === "in_person"
                  ? "offline"
                  : "either",
            languagePreferences: [preferredLocale],
            requireVerifiedUsers: false,
            notificationMode: "immediate",
            agentAutonomy: "suggest_only",
            memoryMode: "standard",
            timezone: draft.timezone,
          },
          session.accessToken,
        ),
      ]);

      await saveStoredSession({
        userId: session.userId,
        displayName: draft.displayName,
        email: session.email ?? null,
        accessToken: session.accessToken,
        refreshToken: session.refreshToken,
        sessionId: session.sessionId,
      });

      setSession((current) =>
        current
          ? {
              ...current,
              displayName: draft.displayName,
            }
          : current,
      );
      setDisplayName(draft.displayName);
      setProfile(draft);
      setPendingOnboardingIntent(draft.firstIntentText?.trim() || null);
      setStage("home");
      void trackTelemetryEvent(session.userId, "onboarding_completed", {
        socialMode: draft.socialMode,
        notificationMode: draft.notificationMode,
        interestsCount: draft.interests.length,
      }).catch(() => {});
    } catch (error) {
      setOnboardingError(String(error));
    } finally {
      setOnboardingLoading(false);
    }
  };

  const handleResetSession = async () => {
    await clearStoredSession();
    setSession(null);
    appOpenedTrackedRef.current = null;
    setStage("auth");
    setAuthError(null);
    setOnboardingError(null);
  };

  const stageKey = useMemo(() => stage, [stage]);

  useEffect(() => {
    if (isBootstrapping || !session?.userId) {
      return;
    }

    if (appOpenedTrackedRef.current === session.userId) {
      return;
    }
    appOpenedTrackedRef.current = session.userId;
    void trackTelemetryEvent(session.userId, "app_opened", {
      stage,
    }).catch(() => {});
  }, [isBootstrapping, session?.userId, stage]);

  if (isBootstrapping) {
    return (
      <SafeAreaProvider style={{ flex: 1 }}>
        <StatusBar style="light" />
        <LoadingState label="Restoring session..." />
        <AppToastHost />
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider style={{ flex: 1 }}>
      <StatusBar style="light" />
      {stage === "auth" ? (
        <AuthScreen
          allowE2EBypass={allowE2EBypass}
          errorMessage={authError}
          loading={authLoading}
          onAuthenticated={handleAuthenticate}
        />
      ) : (
        <AnimatedScreen screenKey={stageKey}>
          {stage === "onboarding" ? (
            <OnboardingScreen
              defaultName={displayName}
              errorMessage={onboardingError}
              loading={onboardingLoading}
              onComplete={handleOnboardingComplete}
            />
          ) : null}
          {stage === "home" && session ? (
            <Suspense fallback={<LoadingState label="Loading your space…" />}>
              <HomeScreen
                initialIntentText={pendingOnboardingIntent}
                initialProfile={profile}
                onInitialIntentHandled={() => setPendingOnboardingIntent(null)}
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

export default function App() {
  if (designMockApp) {
    return (
      <Suspense fallback={<LoadingState label="Loading design preview…" />}>
        <DesignMockApp />
      </Suspense>
    );
  }
  return <ProductionApp />;
}
