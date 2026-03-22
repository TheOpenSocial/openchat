import type {
  AgentTranscriptBubbleRole,
  AgentTranscriptRow,
} from "@opensocial/types";

export type AppStage = "auth" | "onboarding" | "home";

export type HomeTab = "home" | "chats" | "profile";

export type SocialMode = "one_to_one" | "group" | "either";

export type NotificationMode = "live" | "digest";

export type OnboardingAvailability =
  | "now"
  | "evenings"
  | "weekends"
  | "flexible";

export type OnboardingFormat = "one_to_one" | "small_groups" | "both";

export type OnboardingMode = "online" | "in_person" | "both";

export type OnboardingStyle = "chill" | "spontaneous" | "planned" | "focused";

export interface ProfilePhotoDraft {
  uri: string;
  fileName: string;
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  byteSize: number;
  width?: number;
  height?: number;
}

/** Renders in `ChatBubble` (agent thread + human chat). */
export type ChatBubbleRole = AgentTranscriptBubbleRole;

/** Agent home transcript row; aligned with `agentThreadMessagesToTranscript` in `@opensocial/types`. */
export type AgentTimelineMessage = AgentTranscriptRow;

export interface MobileSession {
  userId: string;
  displayName: string;
  email?: string | null;
  accessToken: string;
  refreshToken: string;
  sessionId: string;
}

export interface UserProfileDraft {
  displayName: string;
  bio: string;
  city: string;
  country: string;
  interests: string[];
  socialMode: SocialMode;
  notificationMode: NotificationMode;
  onboardingGoals?: string[];
  preferredAvailability?: OnboardingAvailability;
  preferredFormat?: OnboardingFormat;
  preferredMode?: OnboardingMode;
  preferredStyle?: OnboardingStyle;
  firstIntentText?: string | null;
  timezone?: string;
  profilePhoto?: ProfilePhotoDraft | null;
}

export interface InboxRequest {
  id: string;
  fromName: string;
  summary: string;
  eta: string;
  status: "pending" | "accepted" | "declined";
  senderUserId?: string;
  intentId?: string;
}
