import type { StoredChatThread } from "../lib/chat-storage";
import type {
  DiscoveryInboxSuggestionsResponse,
  PassiveDiscoveryResponse,
} from "../lib/api";
import type { TelemetrySummary } from "../lib/telemetry";
import type {
  AgentTimelineMessage,
  InboxRequest,
  MobileSession,
  UserProfileDraft,
} from "../types";

export const DESIGN_MOCK_AUTH_CODE = "design-mock-preview";

export const DESIGN_MOCK_SESSION: MobileSession = {
  userId: "design-mock-user",
  displayName: "Alex Rivera",
  email: "alex.preview@example.com",
  accessToken: "design-mock-access-token",
  refreshToken: "design-mock-refresh-token",
  sessionId: "design-mock-session",
};

export const DESIGN_MOCK_PROFILE: UserProfileDraft = {
  displayName: "Alex Rivera",
  bio: "Product designer · SF · weekend hikes and live jazz",
  city: "San Francisco",
  country: "US",
  interests: ["Design", "AI", "Cycling", "Jazz"],
  socialMode: "either",
  notificationMode: "live",
};

const now = new Date();
const iso = (minsAgo: number) =>
  new Date(now.getTime() - minsAgo * 60_000).toISOString();

export const DESIGN_MOCK_PASSIVE_DISCOVERY: PassiveDiscoveryResponse = {
  userId: DESIGN_MOCK_SESSION.userId,
  generatedAt: now.toISOString(),
  tonight: {
    suggestions: [
      {
        userId: "usr_maya_k",
        displayName: "Maya K.",
        score: 0.92,
        reason: "Both interested in design sprints and SF coffee spots.",
      },
      {
        userId: "usr_jordan",
        displayName: "Jordan Lee",
        score: 0.86,
        reason: "Overlapping jazz nights + cycling weekends.",
      },
      {
        userId: "usr_sam",
        displayName: "Sam Ortiz",
        score: 0.81,
        reason: "Active on group intents similar to yours this week.",
      },
    ],
    seedTopics: ["Sunset ride", "Museum Thursday", "Co-working afternoon"],
  },
  activeIntentsOrUsers: {
    items: [
      { label: "Find a climbing partner", kind: "intent" },
      { label: "Low-key dinner in Mission", kind: "intent" },
    ],
  },
  groups: {
    groups: [
      {
        title: "Weekend gravel loop",
        topic: "Cycling · ~35mi · Saturday AM",
        participantUserIds: [
          "usr_maya_k",
          "usr_jordan",
          DESIGN_MOCK_SESSION.userId,
        ],
        score: 0.88,
      },
      {
        title: "Design critique circle",
        topic: "Portfolio swaps · virtual · 1h",
        participantUserIds: ["usr_sam", DESIGN_MOCK_SESSION.userId],
        score: 0.79,
      },
    ],
  },
  reconnects: {
    reconnects: [
      {
        userId: "usr_eli",
        displayName: "Eli Nguyen",
        interactionCount: 12,
        lastInteractionAt: iso(60 * 24 * 4),
        score: 0.74,
      },
    ],
  },
};

export const DESIGN_MOCK_INBOX_SUGGESTIONS: DiscoveryInboxSuggestionsResponse =
  {
    userId: DESIGN_MOCK_SESSION.userId,
    generatedAt: now.toISOString(),
    pendingRequestCount: 2,
    suggestions: [
      {
        title: "Reply to Maya before the thread cools off",
        reason: "She accepted a similar intent within 20 minutes last time.",
        score: 0.9,
      },
      {
        title: "Bundle your two pending intros",
        reason: "Both contacts are free Saturday afternoon.",
        score: 0.72,
      },
      {
        title: "Try a small group for jazz night",
        reason: "Three mutuals matched on music + location.",
        score: 0.68,
      },
    ],
  };

export const DESIGN_MOCK_DISCOVERY_SNAPSHOT = {
  passive: DESIGN_MOCK_PASSIVE_DISCOVERY,
  inboxSuggestions: DESIGN_MOCK_INBOX_SUGGESTIONS,
};

export const DESIGN_MOCK_INBOX: InboxRequest[] = [
  {
    id: "req_preview_1",
    senderUserId: "usr_maya_k",
    intentId: "intent_preview_hike",
    fromName: "Maya K.",
    summary: "Wants to join a Saturday morning hike near the coast.",
    eta: "12m ago",
    status: "pending",
  },
  {
    id: "req_preview_2",
    senderUserId: "usr_jordan",
    intentId: "intent_preview_jazz",
    fromName: "Jordan Lee",
    summary:
      "Matched on your jazz + cycling interests — open to a show this week.",
    eta: "1h ago",
    status: "pending",
  },
  {
    id: "req_preview_3",
    senderUserId: "usr_sam",
    intentId: "intent_preview_old",
    fromName: "Sam Ortiz",
    summary: "Earlier intro — you accepted last Tuesday.",
    eta: "3d ago",
    status: "accepted",
  },
];

export const DESIGN_MOCK_AGENT_TIMELINE: AgentTimelineMessage[] = [
  {
    id: "mock_agent_1",
    role: "agent",
    body: "Good afternoon, Alex. Your preferences are saved—what would you like to do, or who would you like to meet?",
  },
  {
    id: "mock_user_1",
    role: "user",
    body: "Find someone to try the new omakase spot in Japantown this week.",
  },
  {
    id: "mock_wf_1",
    role: "workflow",
    body: "Parsed intent · cuisine + scheduling · ranking nearby matches.",
  },
  {
    id: "mock_agent_2",
    role: "agent",
    body: "Here are 3 people with strong taste overlap who are free Thursday or Friday evening. We’ll update this thread as things firm up.",
  },
  {
    id: "mock_sys_1",
    role: "system",
    body: "Tip: Ask follow-ups anytime—we’ll refine matches and summarize next steps here.",
  },
];

export const DESIGN_MOCK_CHATS: StoredChatThread[] = [
  {
    id: "chat_preview_dm",
    connectionId: "conn_preview_dm",
    title: "Maya K.",
    type: "dm",
    highWatermark: iso(25),
    unreadCount: 1,
    participantCount: 2,
    connectionStatus: "active",
    messages: [
      {
        id: "msg_m1",
        chatId: "chat_preview_dm",
        senderUserId: "usr_maya_k",
        body: "Still on for Saturday? I can bring the blanket if we do Dolores.",
        createdAt: iso(120),
      },
      {
        id: "msg_u1",
        chatId: "chat_preview_dm",
        senderUserId: DESIGN_MOCK_SESSION.userId,
        body: "Yes — let’s aim for 10a. I’ll grab pastries.",
        createdAt: iso(90),
      },
      {
        id: "msg_m2",
        chatId: "chat_preview_dm",
        senderUserId: "usr_maya_k",
        body: "Perfect. I’ll ping you Friday night to confirm weather.",
        createdAt: iso(25),
      },
    ],
  },
  {
    id: "chat_preview_group",
    connectionId: "conn_preview_group",
    title: "Weekend ride",
    type: "group",
    highWatermark: iso(8),
    unreadCount: 0,
    participantCount: 4,
    connectionStatus: "active",
    messages: [
      {
        id: "msg_g1",
        chatId: "chat_preview_group",
        senderUserId: "usr_jordan",
        body: "Route draft is in the sheet — 38mi, 1.8k ft.",
        createdAt: iso(45),
      },
      {
        id: "msg_g2",
        chatId: "chat_preview_group",
        senderUserId: DESIGN_MOCK_SESSION.userId,
        body: "Looks good. Can we add a coffee stop around mile 20?",
        createdAt: iso(30),
      },
      {
        id: "msg_g3",
        chatId: "chat_preview_group",
        senderUserId: "usr_maya_k",
        body: "There’s a good spot in Fairfax — ~5 min off route.",
        createdAt: iso(8),
      },
    ],
  },
];

export const DESIGN_MOCK_TELEMETRY_SUMMARY: TelemetrySummary = {
  totalEvents: 48,
  lastEventAt: now.toISOString(),
  counters: {
    authEvents: 1,
    onboardingCompleted: 1,
    onboardingActivationReady: 1,
    onboardingActivationStarted: 1,
    onboardingActivationSucceeded: 1,
    onboardingActivationQueued: 0,
    onboardingActivationFailed: 0,
    intentsCreated: 6,
    agentTurnsCompleted: 2,
    requestsSent: 5,
    requestsReceived: 4,
    requestsResponded: 3,
    reportsSubmitted: 0,
    usersBlocked: 0,
    connectionsCreated: 3,
    groupConnectionsCreated: 1,
    chatsStarted: 3,
    groupChatsReady: 1,
    firstMessagesSent: 4,
    messageReplies: 11,
    personalizationChanges: 2,
    notificationsFired: 3,
    notificationsOpened: 2,
    syncRuns: 9,
    syncFailures: 0,
  },
  metrics: {
    avgIntentToFirstAcceptanceSeconds: 420,
    avgIntentToFirstMessageSeconds: 890,
    connectionSuccessRate: 0.82,
    groupFormationCompletionRate: 0.61,
    notificationToOpenRate: 0.55,
    moderationIncidentRate: 0.01,
    repeatConnectionRate: 0.34,
    syncFailureRate: 0,
    activationSuccessRate: 1,
    activationQueuedRate: 0,
    activationFailureRate: 0,
    avgActivationCompletionSeconds: 3,
  },
};
