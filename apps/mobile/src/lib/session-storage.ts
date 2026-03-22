import AsyncStorage from "@react-native-async-storage/async-storage";

export interface StoredSession {
  userId: string;
  displayName: string;
  email?: string | null;
  accessToken: string;
  refreshToken: string;
  sessionId: string;
  profileCompleted?: boolean;
  onboardingState?: string | null;
}

const SESSION_KEY = "opensocial.mobile.session.v1";

export async function loadStoredSession(): Promise<StoredSession | null> {
  const raw = await AsyncStorage.getItem(SESSION_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as StoredSession;
    if (!parsed.userId || !parsed.accessToken || !parsed.refreshToken) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function saveStoredSession(session: StoredSession): Promise<void> {
  await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export async function clearStoredSession(): Promise<void> {
  await AsyncStorage.removeItem(SESSION_KEY);
}
