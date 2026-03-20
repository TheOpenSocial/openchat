import type { ChatMessageRecord } from "../lib/api";
import type { UserProfileDraft, WebSession } from "../types";

export const WEB_DESIGN_SESSION: WebSession = {
  userId: "web-design-mock-user",
  displayName: "Alex Rivera",
  email: "alex.preview@example.com",
  accessToken: "web-design-mock-token",
  refreshToken: "web-design-mock-refresh",
  sessionId: "web-design-mock-session",
};

export const WEB_DESIGN_PROFILE: UserProfileDraft = {
  displayName: "Alex Rivera",
  bio: "Product designer · SF · weekend hikes and live jazz",
  city: "San Francisco",
  country: "US",
  interests: ["Design", "AI", "Cycling", "Jazz"],
  socialMode: "either",
  notificationMode: "live",
};

export type WebAgentTimelineRole =
  | "user"
  | "agent"
  | "workflow"
  | "system"
  | "error";

export interface WebAgentTimelineMessage {
  id: string;
  role: WebAgentTimelineRole;
  body: string;
}

export interface WebDesignChatThread {
  id: string;
  connectionId: string;
  title: string;
  messages: ChatMessageRecord[];
}

const now = Date.now();

export const WEB_DESIGN_AGENT_TIMELINE: WebAgentTimelineMessage[] = [
  {
    id: "w1",
    role: "agent",
    body: "Good afternoon, Alex. Your preferences are saved—what would you like to do, or who would you like to meet?",
  },
  {
    id: "w2",
    role: "user",
    body: "Find someone to try the new omakase spot in Japantown this week.",
  },
  {
    id: "w3",
    role: "workflow",
    body: "Parsed intent · cuisine + scheduling · ranking nearby matches.",
  },
  {
    id: "w4",
    role: "agent",
    body: "Here are 3 people with strong taste overlap who are free Thursday or Friday evening. We’ll update this thread as things firm up.",
  },
  {
    id: "w5",
    role: "system",
    body: "Tip: Ask follow-ups anytime—we’ll refine matches and summarize next steps here.",
  },
];

export const WEB_DESIGN_CHATS: WebDesignChatThread[] = [
  {
    id: "wchat_dm",
    connectionId: "wconn_dm",
    title: "Maya K.",
    messages: [
      {
        id: "wm1",
        chatId: "wchat_dm",
        senderUserId: "usr_maya",
        body: "Still on for Saturday? I can bring the blanket.",
        createdAt: new Date(now - 120 * 60_000).toISOString(),
      },
      {
        id: "wu1",
        chatId: "wchat_dm",
        senderUserId: WEB_DESIGN_SESSION.userId,
        body: "Yes — 10a at Dolores. I’ll grab pastries.",
        createdAt: new Date(now - 90 * 60_000).toISOString(),
      },
    ],
  },
  {
    id: "wchat_group",
    connectionId: "wconn_g",
    title: "Weekend ride",
    messages: [
      {
        id: "wg1",
        chatId: "wchat_group",
        senderUserId: "usr_jordan",
        body: "Route draft: 38mi, 1.8k ft — link in sheet.",
        createdAt: new Date(now - 40 * 60_000).toISOString(),
      },
    ],
  },
];

export const WEB_DESIGN_TRUST =
  "badge: verified · reputation: strong (preview)";
