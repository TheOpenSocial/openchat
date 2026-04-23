import "./global.css";

import AsyncStorage from "@react-native-async-storage/async-storage";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { AnimatedScreen } from "./src/components/AnimatedScreen";
import { AppToastHost } from "./src/components/AppToastHost";
import { LoadingState } from "./src/components/LoadingState";
import { PremiumSplashOverlay } from "./src/components/PremiumSplashOverlay";
import { StageCurtain } from "./src/components/StageCurtain";
import { type AppLocale, supportedLocales, t } from "./src/i18n/strings";
import { showErrorToast } from "./src/lib/app-toast";
import {
  api,
  configureApiAuthLifecycle,
  isOfflineApiError,
  isRetryableApiError,
} from "./src/lib/api";
import { queueOfflineProfileSave } from "./src/lib/offline-outbox";
import { uploadProfilePhotoFromPickerAsset } from "./src/lib/profile-photo-upload";
import {
  clearStoredSession,
  loadStoredSession,
  saveStoredSession,
  type StoredSession,
} from "./src/lib/session-storage";
import { trackTelemetryEvent } from "./src/lib/telemetry";
import {
  draftStateToUserProfileDraft,
  globalRulesPayload,
  socialModePayload,
  type OnboardingDraftState,
} from "./src/onboarding/onboarding-model";
import { clearOnboardingDraft } from "./src/onboarding/onboarding-storage";
import { OnboardingFlow } from "./src/onboarding/OnboardingFlow";
import { AuthScreen } from "./src/screens/AuthScreen";
import { AppStage, MobileSession, UserProfileDraft } from "./src/types";
const MOBILE_LOCALE_STORAGE_KEY = "opensocial.mobile.locale.v1";
const INJECTED_E2E_SESSION_B64 =
  process.env.EXPO_PUBLIC_E2E_SESSION_B64?.trim() || null;
const ENABLE_E2E_LOCAL_MODE =
  process.env.EXPO_PUBLIC_ENABLE_E2E_LOCAL_MODE === "1" ||
  process.env.EXPO_PUBLIC_ENABLE_E2E_LOCAL_MODE === "true";

function decodeBase64Json(input: string) {
  const decode =
    typeof globalThis.atob === "function"
      ? globalThis.atob.bind(globalThis)
      : null;
  if (!decode) {
    return null;
  }

  try {
    return decode(input);
  } catch {
    return null;
  }
}

function loadInjectedSession(): StoredSession | null {
  if (!INJECTED_E2E_SESSION_B64) {
    return null;
  }

  const decoded = decodeBase64Json(INJECTED_E2E_SESSION_B64);
  if (!decoded) {
    return null;
  }

  try {
    const parsed = JSON.parse(decoded) as StoredSession;
    if (
      !parsed?.userId ||
      !parsed?.accessToken ||
      !parsed?.refreshToken ||
      !parsed?.sessionId
    ) {
      return null;
    }
    return {
      ...parsed,
      profileCompleted: parsed.profileCompleted ?? true,
      onboardingState: parsed.onboardingState ?? "complete",
    };
  } catch {
    return null;
  }
}

function isLocalE2ESession(session: Pick<MobileSession, "accessToken">) {
  return (
    __DEV__ && (ENABLE_E2E_LOCAL_MODE || session.accessToken.startsWith("e2e-"))
  );
}

function ProductionApp() {
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [splashLayerVisible, setSplashLayerVisible] = useState(true);
  const [stage, setStage] = useState<AppStage>("auth");
  const [authError, setAuthError] = useState<string | null>(null);
  const [onboardingError, setOnboardingError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [onboardingLoading, setOnboardingLoading] = useState(false);
  const [stageCurtainVisible, setStageCurtainVisible] = useState(false);
  const [locale, setLocale] = useState<AppLocale>("en");
  const [session, setSession] = useState<MobileSession | null>(null);
  const [profile, setProfile] = useState<UserProfileDraft>({
    displayName: "Explorer",
    bio: "",
    city: "",
    country: "",
    interests: ["Football", "AI"],
    socialMode: "one_to_one",
    notificationMode: "live",
  });
  const [homeAgentSeedMessage, setHomeAgentSeedMessage] = useState<
    string | null
  >(null);
  const appOpenedTrackedRef = useRef<string | null>(null);

  const mobileSessionFromStored = useCallback(
    (
      stored: NonNullable<Awaited<ReturnType<typeof loadStoredSession>>>,
    ): MobileSession => ({
      userId: stored.userId,
      displayName: stored.displayName,
      email: stored.email ?? null,
      accessToken: stored.accessToken,
      refreshToken: stored.refreshToken,
      sessionId: stored.sessionId,
    }),
    [],
  );

  useEffect(() => {
    AsyncStorage.getItem(MOBILE_LOCALE_STORAGE_KEY)
      .then((stored) => {
        if (stored && supportedLocales.includes(stored as AppLocale)) {
          setLocale(stored as AppLocale);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    AsyncStorage.setItem(MOBILE_LOCALE_STORAGE_KEY, locale).catch(() => {});
  }, [locale]);

  const transitionToStage = useCallback(
    async (nextStage: AppStage, options?: { delayMs?: number }) => {
      const coverDelayMs = options?.delayMs ?? 260;
      setStageCurtainVisible(true);
      await new Promise((resolve) => setTimeout(resolve, coverDelayMs));
      setStage(nextStage);
      await new Promise((resolve) =>
        requestAnimationFrame(() => resolve(null)),
      );
      await new Promise((resolve) =>
        requestAnimationFrame(() => resolve(null)),
      );
      await new Promise((resolve) => setTimeout(resolve, 120));
      setStageCurtainVisible(false);
    },
    [],
  );

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
        const nextMessage =
          stage === "onboarding"
            ? t("authSessionExpiredContinueOnboarding", locale)
            : t("authSessionExpired", locale);
        setAuthError(nextMessage);
        if (stage === "auth") {
          setStage("auth");
          return;
        }
        void transitionToStage("auth", { delayMs: 180 });
      },
    });

    return () => {
      configureApiAuthLifecycle({});
    };
  }, [locale, stage, transitionToStage]);

  useEffect(() => {
    let mounted = true;

    const restore = async () => {
      let stored = null as Awaited<ReturnType<typeof loadStoredSession>>;
      try {
        const injected = loadInjectedSession();
        if (injected) {
          await saveStoredSession(injected);
        }
        stored = await loadStoredSession();
        if (!stored) {
          return;
        }

        if (
          injected &&
          __DEV__ &&
          injected.profileCompleted === false &&
          injected.onboardingState !== "complete"
        ) {
          const restoredSession = mobileSessionFromStored(stored);
          if (!mounted) {
            return;
          }
          setSession(restoredSession);
          setProfile((current) => ({
            ...current,
            displayName: stored.displayName,
          }));
          setStage("onboarding");
          return;
        }

        const completion = await api.getProfileCompletion(
          stored.userId,
          stored.accessToken,
        );
        const latestStored = (await loadStoredSession()) ?? stored;
        const restoredSession = mobileSessionFromStored(latestStored);

        if (!mounted) {
          return;
        }

        const cached = latestStored;
        setSession(restoredSession);
        setProfile((current) => ({
          ...current,
          displayName: cached.displayName,
        }));
        setStage(completion.completed ? "home" : "onboarding");
        void saveStoredSession({
          ...cached,
          profileCompleted: completion.completed,
          onboardingState: completion.onboardingState,
        }).catch(() => {});
        void trackTelemetryEvent(cached.userId, "auth_session_restored", {
          completionState: completion.onboardingState,
          profileCompleted: completion.completed,
        }).catch(() => {});
      } catch (error) {
        const canUseCached =
          isOfflineApiError(error) || isRetryableApiError(error);
        if (canUseCached && stored) {
          const cached = stored;
          if (!mounted) {
            return;
          }
          setSession({
            userId: cached.userId,
            displayName: cached.displayName,
            email: cached.email ?? null,
            accessToken: cached.accessToken,
            refreshToken: cached.refreshToken,
            sessionId: cached.sessionId,
          });
          setProfile((current) => ({
            ...current,
            displayName: cached.displayName,
          }));
          setStage(cached.profileCompleted ? "home" : "onboarding");
          setAuthError(t("authOfflineRestored", locale));
        } else {
          await clearStoredSession();
          if (mounted) {
            setStage("auth");
          }
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
  }, [locale, mobileSessionFromStored]);

  const handleAuthenticate = async (code: string) => {
    setAuthLoading(true);
    setAuthError(null);

    try {
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

      const latestStored = (await loadStoredSession()) ?? {
        userId: nextSession.userId,
        displayName: nextSession.displayName,
        email: nextSession.email,
        accessToken: nextSession.accessToken,
        refreshToken: nextSession.refreshToken,
        sessionId: nextSession.sessionId,
      };
      const hydratedSession = mobileSessionFromStored(latestStored);

      setSession(hydratedSession);
      setProfile((current) => ({
        ...current,
        displayName: hydratedSession.displayName,
      }));
      await transitionToStage(completion.completed ? "home" : "onboarding", {
        delayMs: 260,
      });
      await saveStoredSession({
        userId: hydratedSession.userId,
        displayName: hydratedSession.displayName,
        email: hydratedSession.email,
        accessToken: hydratedSession.accessToken,
        refreshToken: hydratedSession.refreshToken,
        sessionId: hydratedSession.sessionId,
        profileCompleted: completion.completed,
        onboardingState: completion.onboardingState,
      });
      void trackTelemetryEvent(nextSession.userId, "auth_success", {
        source: "oauth",
      }).catch(() => {});
    } catch (error) {
      setAuthError(String(error));
    } finally {
      setAuthLoading(false);
    }
  };

  const handleDevBypass = useCallback(async () => {
    const nextSession: MobileSession = {
      userId: "e2e-user",
      displayName: "Maestro User",
      email: "maestro@example.com",
      accessToken: "e2e-access-token",
      refreshToken: "e2e-refresh-token",
      sessionId: "e2e-session",
    };

    setAuthError(null);
    setSession(nextSession);
    setProfile((current) => ({
      ...current,
      displayName: nextSession.displayName,
    }));
    setStage("home");
    void saveStoredSession({
      userId: nextSession.userId,
      displayName: nextSession.displayName,
      email: nextSession.email,
      accessToken: nextSession.accessToken,
      refreshToken: nextSession.refreshToken,
      sessionId: nextSession.sessionId,
      profileCompleted: true,
      onboardingState: "complete",
    }).catch(() => {});
  }, []);

  const handleOnboardingComplete = async (
    state: OnboardingDraftState,
    meta: { firstIntentText: string | null },
  ) => {
    if (!session) {
      setOnboardingError(t("onboardingMissingSession", locale));
      return;
    }

    setOnboardingLoading(true);
    setOnboardingError(null);

    const draft = draftStateToUserProfileDraft(state);
    const nextDisplayName = draft.displayName.trim() || session.displayName;

    const finalizeLocally = async (queued: boolean) => {
      await saveStoredSession({
        userId: session.userId,
        displayName: nextDisplayName,
        email: session.email,
        accessToken: session.accessToken,
        refreshToken: session.refreshToken,
        sessionId: session.sessionId,
        profileCompleted: true,
        onboardingState: "complete",
      });
      setSession((prev) =>
        prev
          ? {
              ...prev,
              displayName: nextDisplayName,
            }
          : prev,
      );
      setProfile(draft);
      setHomeAgentSeedMessage(meta.firstIntentText?.trim() || null);
      await clearOnboardingDraft(session.userId);
      await transitionToStage("home", { delayMs: 220 });
      if (queued) {
        setOnboardingError(t("onboardingSavedLocally", locale));
      }
      void trackTelemetryEvent(session.userId, "onboarding_completed", {
        socialMode: draft.socialMode,
        notificationMode: draft.notificationMode,
        interestsCount: draft.interests.length,
        goalsCount: state.onboardingGoals.length,
        hadFirstIntent: Boolean(meta.firstIntentText?.trim()),
      }).catch(() => {});
      if (meta.firstIntentText?.trim()) {
        void trackTelemetryEvent(
          session.userId,
          "onboarding_activation_ready",
          {
            source: "onboarding_complete",
            seedLength: meta.firstIntentText.trim().length,
          },
        ).catch(() => {});
      }
    };

    try {
      if (isLocalE2ESession(session)) {
        await finalizeLocally(false);
        return;
      }

      await api.updateProfile(
        session.userId,
        {
          bio: draft.bio,
          city: draft.city,
          country: draft.country,
          visibility: "public",
        },
        session.accessToken,
      );

      if (state.profilePhotoUri) {
        try {
          await uploadProfilePhotoFromPickerAsset(
            session.userId,
            session.accessToken,
            {
              uri: state.profilePhotoUri,
              mimeType: state.profilePhotoMimeType,
              fileSize: state.profilePhotoFileSize,
            },
          );
        } catch (photoErr) {
          showErrorToast(String(photoErr), {
            title: t("onboardingPhotoUploadFailed", locale),
          });
        }
      }

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
          draft.interests.map((interest) => ({
            label: interest,
          })),
          session.accessToken,
        ),
        api.setSocialMode(
          session.userId,
          socialModePayload(state),
          session.accessToken,
        ),
        api.setGlobalRules(
          session.userId,
          globalRulesPayload(state),
          session.accessToken,
        ),
      ]);
      await finalizeLocally(false);
    } catch (error) {
      if (isOfflineApiError(error) || isRetryableApiError(error)) {
        await queueOfflineProfileSave({
          userId: session.userId,
          displayName: nextDisplayName,
          bio: draft.bio,
          city: draft.city,
          country: draft.country,
          visibility: "public",
          interests: draft.interests,
          socialMode: socialModePayload(state),
          globalRules: globalRulesPayload(state),
          ...(state.profilePhotoUri
            ? {
                profilePhoto: {
                  uri: state.profilePhotoUri,
                  ...(state.profilePhotoMimeType
                    ? { mimeType: state.profilePhotoMimeType }
                    : {}),
                  ...(typeof state.profilePhotoFileSize === "number"
                    ? { fileSize: state.profilePhotoFileSize }
                    : {}),
                },
              }
            : {}),
        });
        await finalizeLocally(true);
      } else {
        setOnboardingError(String(error));
      }
    } finally {
      setOnboardingLoading(false);
    }
  };

  const handleInitialAgentSeedConsumed = useCallback(() => {
    setHomeAgentSeedMessage(null);
  }, []);

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

  const handleSplashExitComplete = useCallback(() => {
    setSplashLayerVisible(false);
  }, []);

  const bootstrapReady = !isBootstrapping;

  return (
    <SafeAreaProvider style={{ flex: 1 }}>
      <StatusBar style="light" />
      {bootstrapReady ? (
        <AnimatedScreen routeKey={stageKey}>
          {stage === "auth" ? (
            <AuthScreen
              errorMessage={authError}
              locale={locale}
              loading={authLoading}
              onAuthenticated={handleAuthenticate}
              onDevBypass={handleDevBypass}
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
          {stage === "home" && session
            ? (() => {
                try {
                  const { HomeScreen } =
                    // eslint-disable-next-line @typescript-eslint/no-require-imports
                    require("./src/screens/HomeScreen") as typeof import("./src/screens/HomeScreen");
                  return (
                    <HomeScreen
                      initialAgentMessage={homeAgentSeedMessage}
                      initialProfile={profile}
                      onInitialAgentMessageConsumed={
                        handleInitialAgentSeedConsumed
                      }
                      onProfileUpdated={setProfile}
                      onResetSession={handleResetSession}
                      session={session}
                    />
                  );
                } catch {
                  return <LoadingState label={t("loadingYourSpace", locale)} />;
                }
              })()
            : null}
        </AnimatedScreen>
      ) : null}
      <StageCurtain visible={stageCurtainVisible} />
      {splashLayerVisible ? (
        <PremiumSplashOverlay
          onExitComplete={handleSplashExitComplete}
          requestExit={bootstrapReady}
        />
      ) : null}
      <AppToastHost />
    </SafeAreaProvider>
  );
}

export default function App() {
  const rootLayoutDebug = false;
  if (rootLayoutDebug) {
    return (
      <SafeAreaProvider style={{ flex: 1 }}>
        <StatusBar style="light" />
      </SafeAreaProvider>
    );
  }
  return <ProductionApp />;
}
