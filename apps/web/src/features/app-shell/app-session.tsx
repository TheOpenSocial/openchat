"use client";

import { useRouter } from "next/navigation";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";

import {
  api,
  configureApiAuthLifecycle,
  getGoogleOAuthStartUrl,
  isOfflineApiError,
  isRetryableApiError,
} from "@/src/lib/api";
import { webEnv } from "@/src/lib/env";
import {
  clearStoredSession,
  loadStoredSession,
  saveStoredSession,
} from "@/src/lib/session";
import {
  WEB_DESIGN_PROFILE,
  WEB_DESIGN_SESSION,
} from "@/src/mocks/web-design-fixtures";
import { supportedLocales, type AppLocale } from "@/src/i18n/strings";
import type { SocialMode, UserProfileDraft, WebSession } from "@/src/types";

type Banner = {
  tone: "info" | "error" | "success";
  text: string;
};

type AppSessionContextValue = {
  allowDemoAuth: boolean;
  authLoading: boolean;
  banner: Banner | null;
  bootstrapping: boolean;
  isDesignMock: boolean;
  isOnline: boolean;
  locale: AppLocale;
  onboardingLoading: boolean;
  profileComplete: boolean;
  profileDraft: UserProfileDraft;
  profilePhotoUrl: string | null;
  session: WebSession | null;
  onboardingCarryoverSeed: string | null;
  setBanner: Dispatch<SetStateAction<Banner | null>>;
  setLocale: Dispatch<SetStateAction<AppLocale>>;
  setProfileDraft: Dispatch<SetStateAction<UserProfileDraft>>;
  completeOnboarding: () => Promise<"/home">;
  restoreProfileData: () => Promise<void>;
  saveProfileSettings: () => Promise<void>;
  consumeOnboardingCarryoverSeed: () => void;
  signInWithDemoCode: (code?: string) => Promise<"/onboarding" | "/home">;
  signInWithPreview: () => Promise<"/onboarding">;
  signOut: () => void;
  startGoogleOAuth: () => Promise<void>;
  uploadProfilePhoto: (file: File) => Promise<void>;
};

const DEFAULT_PROFILE: UserProfileDraft = {
  displayName: "Explorer",
  bio: "",
  city: "",
  country: "",
  interests: ["Football", "AI"],
  socialMode: "one_to_one",
  notificationMode: "live",
};

const LOCALE_KEY = "opensocial.web.locale";

const AppSessionContext = createContext<AppSessionContextValue | null>(null);

export function AppSessionProvider({ children }: { children: ReactNode }) {
  const [bootstrapping, setBootstrapping] = useState(true);
  const [session, setSession] = useState<WebSession | null>(null);
  const [profileComplete, setProfileComplete] = useState(false);
  const [profileDraft, setProfileDraft] =
    useState<UserProfileDraft>(DEFAULT_PROFILE);
  const [profilePhotoUrl, setProfilePhotoUrl] = useState<string | null>(null);
  const [locale, setLocale] = useState<AppLocale>("en");
  const [banner, setBanner] = useState<Banner | null>(null);
  const [isOnline, setIsOnline] = useState(true);
  const [authLoading, setAuthLoading] = useState(false);
  const [onboardingLoading, setOnboardingLoading] = useState(false);
  const [onboardingCarryoverSeed, setOnboardingCarryoverSeed] = useState<
    string | null
  >(null);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const raw = window.localStorage.getItem(LOCALE_KEY);
    if (raw && (supportedLocales as readonly string[]).includes(raw)) {
      setLocale(raw as AppLocale);
    }
    setIsOnline(window.navigator.onLine);

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem(LOCALE_KEY, locale);
  }, [locale]);

  useEffect(() => {
    configureApiAuthLifecycle({
      onSessionRefreshed: (tokens) => {
        setSession((current) => {
          if (!current) {
            return current;
          }
          const next = { ...current, ...tokens };
          saveStoredSession(next);
          return next;
        });
      },
      onAuthFailure: () => {
        clearStoredSession();
        setSession(null);
        setProfileComplete(false);
        setBanner({ tone: "error", text: "Session expired. Sign in again." });
      },
    });

    return () => {
      configureApiAuthLifecycle({});
    };
  }, []);

  const restoreProfileData = async () => {
    if (!session || webEnv.designMock) {
      if (webEnv.designMock) {
        setProfileDraft({ ...WEB_DESIGN_PROFILE });
      }
      return;
    }

    try {
      const [profile, photo] = await Promise.all([
        api.getProfile(session.userId, session.accessToken),
        api.getPrimaryProfilePhoto(session.userId, session.accessToken),
      ]);

      setProfileDraft((current) => ({
        ...current,
        displayName:
          typeof profile.displayName === "string"
            ? profile.displayName
            : session.displayName,
        bio: typeof profile.bio === "string" ? profile.bio : current.bio,
        city: typeof profile.city === "string" ? profile.city : current.city,
        country:
          typeof profile.country === "string"
            ? profile.country
            : current.country,
      }));
      setProfilePhotoUrl(
        typeof photo?.assetUrl === "string"
          ? photo.assetUrl
          : typeof photo?.url === "string"
            ? photo.url
            : null,
      );
    } catch (error) {
      setBanner({
        tone: "error",
        text: `Could not load profile details: ${String(error)}`,
      });
    }
  };

  useEffect(() => {
    const restore = async () => {
      if (webEnv.designMock) {
        setBootstrapping(false);
        return;
      }

      let stored: WebSession | null = null;
      try {
        stored = loadStoredSession();
        if (!stored) {
          return;
        }

        const completion = await api.getProfileCompletion(
          stored.userId,
          stored.accessToken,
        );
        const cached = stored;
        setSession(stored);
        setOnboardingCarryoverSeed(stored.onboardingCarryoverSeed ?? null);
        setProfileComplete(completion.completed);
        setProfileDraft((current) => ({
          ...current,
          displayName: cached.displayName,
        }));
        saveStoredSession({
          ...cached,
          profileCompleted: completion.completed,
          onboardingState: completion.onboardingState,
        });
      } catch (error) {
        if (
          (isOfflineApiError(error) || isRetryableApiError(error)) &&
          stored
        ) {
          const cached = stored;
          setSession(cached);
          setOnboardingCarryoverSeed(cached.onboardingCarryoverSeed ?? null);
          setProfileComplete(Boolean(cached.profileCompleted));
          setProfileDraft((current) => ({
            ...current,
            displayName: cached.displayName,
          }));
          setBanner({
            tone: "info",
            text: "You’re offline. Restored your last session state and will sync when internet returns.",
          });
        } else {
          clearStoredSession();
        }
      } finally {
        setBootstrapping(false);
      }
    };

    void restore();
  }, []);

  useEffect(() => {
    if (!session) {
      return;
    }
    void restoreProfileData();
  }, [session]);

  const hydrateAuthenticatedState = async (nextSession: WebSession) => {
    saveStoredSession(nextSession);
    setSession(nextSession);
    setProfileDraft((current) => ({
      ...current,
      displayName: nextSession.displayName,
    }));

    if (webEnv.designMock) {
      setProfileDraft({ ...WEB_DESIGN_PROFILE });
      setProfileComplete(false);
      return "/onboarding" as const;
    }

    const completion = await api.getProfileCompletion(
      nextSession.userId,
      nextSession.accessToken,
    );
    saveStoredSession({
      ...nextSession,
      profileCompleted: completion.completed,
      onboardingState: completion.onboardingState,
    });
    setProfileComplete(completion.completed);
    return completion.completed ? ("/home" as const) : ("/onboarding" as const);
  };

  const startGoogleOAuth = async () => {
    setAuthLoading(true);
    setBanner(null);
    try {
      const callbackUrl = `${window.location.origin}/auth/callback`;
      const url = await getGoogleOAuthStartUrl(callbackUrl);
      window.location.assign(url);
    } catch (error) {
      setAuthLoading(false);
      setBanner({
        tone: "error",
        text: `Could not start Google sign-in: ${String(error)}`,
      });
    }
  };

  const signInWithDemoCode = async (code = "demo-web") => {
    setAuthLoading(true);
    setBanner(null);
    try {
      const auth = await api.authGoogleCallback(code.trim() || "demo-web");
      const nextSession: WebSession = {
        userId: auth.user.id,
        displayName: auth.user.displayName,
        email: auth.user.email,
        accessToken: auth.accessToken,
        refreshToken: auth.refreshToken,
        sessionId: auth.sessionId,
      };
      const nextPath = await hydrateAuthenticatedState(nextSession);
      setBanner({
        tone: "success",
        text: "Authenticated and session persisted.",
      });
      return nextPath;
    } finally {
      setAuthLoading(false);
    }
  };

  const signInWithPreview = async () => {
    const nextPath = await hydrateAuthenticatedState({ ...WEB_DESIGN_SESSION });
    setBanner({ tone: "success", text: "Preview session ready." });
    return nextPath === "/home" ? "/onboarding" : nextPath;
  };

  const saveProfile = async () => {
    if (!session) {
      throw new Error("Session missing. Sign in again.");
    }
    if (
      profileDraft.bio.trim().length === 0 ||
      profileDraft.city.trim().length === 0 ||
      profileDraft.country.trim().length === 0 ||
      profileDraft.interests.length === 0
    ) {
      throw new Error(
        "Complete bio, city, country, and at least one interest.",
      );
    }

    if (webEnv.designMock) {
      setProfileComplete(true);
      saveStoredSession({
        ...session,
        displayName: profileDraft.displayName.trim() || session.displayName,
      });
      return;
    }

    await api.updateProfile(
      session.userId,
      {
        bio: profileDraft.bio.trim(),
        city: profileDraft.city.trim(),
        country: profileDraft.country.trim(),
        visibility: "public",
      },
      session.accessToken,
    );
    await Promise.all([
      api.replaceInterests(
        session.userId,
        profileDraft.interests.map((interest) => ({
          kind: "topic",
          label: interest,
        })),
        session.accessToken,
      ),
      api.replaceTopics(
        session.userId,
        profileDraft.interests.map((interest) => ({ label: interest })),
        session.accessToken,
      ),
      api.setSocialMode(
        session.userId,
        socialModeToPayload(profileDraft.socialMode),
        session.accessToken,
      ),
      api.setGlobalRules(
        session.userId,
        {
          whoCanContact: "anyone",
          reachable: "always",
          intentMode:
            profileDraft.socialMode === "one_to_one"
              ? "one_to_one"
              : profileDraft.socialMode === "group"
                ? "group"
                : "balanced",
          modality: "either",
          languagePreferences: ["en", "es"],
          countryPreferences: [],
          requireVerifiedUsers: false,
          notificationMode:
            profileDraft.notificationMode === "digest" ? "digest" : "immediate",
          agentAutonomy: "suggest_only",
          memoryMode: "standard",
        },
        session.accessToken,
      ),
    ]);
    setProfileComplete(true);
  };

  const completeOnboarding = async () => {
    setOnboardingLoading(true);
    setBanner(null);
    try {
      await saveProfile();
      let seed = buildOnboardingCarryoverSeed(profileDraft);
      if (session && !webEnv.designMock) {
        try {
          const activationPlan = await api.createOnboardingActivationPlan(
            session.userId,
            {
              summary: profileDraft.bio.trim() || undefined,
              interests: profileDraft.interests,
              city: profileDraft.city.trim() || undefined,
              country: profileDraft.country.trim() || undefined,
              socialMode: profileDraft.socialMode,
            },
            session.accessToken,
          );
          seed = activationPlan.recommendedAction.text.trim() || seed;
        } catch {
          // Keep deterministic fallback seed when backend activation planning is unavailable.
        }
      }
      if (seed && session) {
        const nextSession = {
          ...session,
          onboardingCarryoverSeed: seed,
        };
        setSession(nextSession);
        setOnboardingCarryoverSeed(seed);
        saveStoredSession(nextSession);
      }
      setBanner({ tone: "success", text: "Onboarding saved." });
      return "/home" as const;
    } finally {
      setOnboardingLoading(false);
    }
  };

  const consumeOnboardingCarryoverSeed = () => {
    setOnboardingCarryoverSeed(null);
    setSession((current) => {
      if (!current) {
        return current;
      }
      const next = {
        ...current,
        onboardingCarryoverSeed: null,
      };
      saveStoredSession(next);
      return next;
    });
  };

  const saveProfileSettings = async () => {
    setOnboardingLoading(true);
    try {
      await saveProfile();
      setBanner({ tone: "success", text: "Profile settings saved." });
    } finally {
      setOnboardingLoading(false);
    }
  };

  const uploadProfilePhoto = async (file: File) => {
    if (!session) {
      throw new Error("Sign in first.");
    }
    if (webEnv.designMock) {
      setProfilePhotoUrl(URL.createObjectURL(file));
      setBanner({ tone: "success", text: "Preview avatar updated." });
      return;
    }

    const mimeType = normalizeMime(file.type, file.name);
    const intent = await api.createProfilePhotoUploadIntent(
      session.userId,
      {
        fileName: file.name || "profile.jpg",
        mimeType,
        byteSize: file.size,
      },
      session.accessToken,
    );
    const putRes = await fetch(intent.uploadUrl, {
      method: "PUT",
      headers: intent.requiredHeaders,
      body: await file.arrayBuffer(),
    });
    if (!putRes.ok) {
      throw new Error("Upload did not complete. Try again.");
    }
    await api.completeProfilePhotoUpload(
      session.userId,
      intent.imageId,
      {
        uploadToken: intent.uploadToken,
        byteSize: file.size,
      },
      session.accessToken,
    );
    await restoreProfileData();
    setBanner({ tone: "success", text: "Profile photo uploaded." });
  };

  const signOut = () => {
    clearStoredSession();
    setSession(null);
    setProfileComplete(false);
    setProfileDraft(DEFAULT_PROFILE);
    setProfilePhotoUrl(null);
    setBanner({ tone: "info", text: "Signed out." });
  };

  const value = useMemo<AppSessionContextValue>(
    () => ({
      allowDemoAuth: webEnv.allowWebDemoAuth,
      authLoading,
      banner,
      bootstrapping,
      isDesignMock: webEnv.designMock,
      isOnline,
      locale,
      onboardingLoading,
      profileComplete,
      profileDraft,
      profilePhotoUrl,
      session,
      onboardingCarryoverSeed,
      setBanner,
      setLocale,
      setProfileDraft,
      completeOnboarding,
      consumeOnboardingCarryoverSeed,
      restoreProfileData,
      saveProfileSettings,
      signInWithDemoCode,
      signInWithPreview,
      signOut,
      startGoogleOAuth,
      uploadProfilePhoto,
    }),
    [
      authLoading,
      banner,
      bootstrapping,
      isOnline,
      locale,
      onboardingLoading,
      profileComplete,
      profileDraft,
      profilePhotoUrl,
      session,
    ],
  );

  return (
    <AppSessionContext.Provider value={value}>
      {children}
    </AppSessionContext.Provider>
  );
}

function buildOnboardingCarryoverSeed(profile: UserProfileDraft) {
  const interests = profile.interests
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 3);
  const where = [profile.city.trim(), profile.country.trim()]
    .filter(Boolean)
    .join(", ");
  const interestsText =
    interests.length > 0 ? interests.join(", ") : "meaningful social plans";
  if (where) {
    return `I just finished onboarding. Help me find my best first social step around ${interestsText} in ${where}.`;
  }
  return `I just finished onboarding. Help me find my best first social step around ${interestsText}.`;
}

export function useAppSession() {
  const context = useContext(AppSessionContext);
  if (!context) {
    throw new Error("useAppSession must be used inside AppSessionProvider");
  }
  return context;
}

export function useRedirectAfterAction(path: string | null) {
  const router = useRouter();
  useEffect(() => {
    if (!path) {
      return;
    }
    router.replace(path);
  }, [path, router]);
}

function socialModeToPayload(socialMode: SocialMode) {
  if (socialMode === "one_to_one") {
    return {
      socialMode: "balanced" as const,
      preferOneToOne: true,
      allowGroupInvites: false,
    };
  }

  if (socialMode === "group") {
    return {
      socialMode: "high_energy" as const,
      preferOneToOne: false,
      allowGroupInvites: true,
    };
  }

  return {
    socialMode: "balanced" as const,
    preferOneToOne: false,
    allowGroupInvites: true,
  };
}

function normalizeMime(
  mime: string | null | undefined,
  fileName: string,
): "image/jpeg" | "image/png" | "image/webp" {
  if (mime === "image/jpeg" || mime === "image/png" || mime === "image/webp") {
    return mime;
  }
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  return "image/jpeg";
}
