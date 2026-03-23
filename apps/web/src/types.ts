export type AppStage = "auth" | "onboarding" | "home";

export type HomeTab = "home" | "chats" | "profile";

export type SocialMode = "one_to_one" | "group" | "either";

export type NotificationMode = "live" | "digest";

export interface WebSession {
  userId: string;
  displayName: string;
  email?: string | null;
  accessToken: string;
  refreshToken: string;
  sessionId: string;
  profileCompleted?: boolean;
  onboardingState?: string | null;
  onboardingCarryoverSeed?: string | null;
}

export interface UserProfileDraft {
  displayName: string;
  bio: string;
  city: string;
  country: string;
  interests: string[];
  socialMode: SocialMode;
  notificationMode: NotificationMode;
}

export interface InboxRequest {
  id: string;
  senderUserId?: string;
  intentId?: string;
  fromName: string;
  summary: string;
  eta: string;
  status: "pending" | "accepted" | "declined";
}
