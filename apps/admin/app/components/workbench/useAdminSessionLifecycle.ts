import { useCallback, useEffect, useState } from "react";
import {
  clearAdminSession,
  clearLegacyAdminApiKeyStorage,
  loadAdminSession,
  type AdminSession,
} from "../../lib/admin-session";
import {
  configureAdminApiAuthLifecycle,
  fetchGoogleOAuthStartUrl,
} from "../../lib/api";

type UseAdminSessionLifecycleInput = {
  defaultAdminUserId: string;
  setAdminUserId: (value: string) => void;
};

export function useAdminSessionLifecycle({
  defaultAdminUserId,
  setAdminUserId,
}: UseAdminSessionLifecycleInput) {
  const [sessionHydrated, setSessionHydrated] = useState(false);
  const [signedInSession, setSignedInSession] = useState<AdminSession | null>(
    null,
  );
  const [signInError, setSignInError] = useState<string | null>(null);

  useEffect(() => {
    configureAdminApiAuthLifecycle({
      onSessionRefreshed: (tokens) => {
        setSignedInSession((current) => {
          if (!current) {
            return current;
          }
          return {
            ...current,
            ...tokens,
          };
        });
      },
      onAuthFailure: () => {
        clearAdminSession();
        setSignedInSession(null);
        setAdminUserId(defaultAdminUserId);
        setSignInError("Session expired. Sign in again.");
      },
    });

    return () => {
      configureAdminApiAuthLifecycle({});
    };
  }, [defaultAdminUserId, setAdminUserId]);

  useEffect(() => {
    clearLegacyAdminApiKeyStorage();
    const session = loadAdminSession();
    setSignedInSession(session);
    if (session) {
      setAdminUserId(session.userId);
    }
    setSessionHydrated(true);
  }, [setAdminUserId]);

  const signOut = useCallback(() => {
    clearAdminSession();
    setSignedInSession(null);
    setAdminUserId(defaultAdminUserId);
  }, [defaultAdminUserId, setAdminUserId]);

  const startGoogleSignIn = useCallback(async () => {
    setSignInError(null);
    const url = await fetchGoogleOAuthStartUrl(
      `${window.location.origin}/auth/callback`,
    );
    window.location.assign(url);
  }, []);

  return {
    sessionHydrated,
    signedInSession,
    signInError,
    setSignInError,
    signOut,
    startGoogleSignIn,
  };
}
