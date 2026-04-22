export type SandboxWorldProfileFixture = {
  bio: string;
  city: string;
  country: string;
  visibility?: string;
  onboardingState?: string;
  availabilityMode?: string;
  trustScore?: number;
  moderationState?: string;
  topics?: string[];
  interests?: Array<{
    kind: string;
    label: string;
    normalizedLabel: string;
    weight?: number;
    source?: string;
  }>;
  preferences?: Array<{
    key: string;
    value: unknown;
  }>;
  availabilityWindows?: Array<{
    dayOfWeek: number;
    startMinute: number;
    endMinute: number;
    mode?: string;
  }>;
};

export type SandboxWorldUserFixture = {
  id: string;
  displayName: string;
  username?: string;
  email?: string;
  locale?: string;
  timezone?: string;
  profile: SandboxWorldProfileFixture;
};

export type SandboxWorldMessageFixture = {
  id: string;
  senderUserId: string;
  body: string;
  moderationState?: string;
  replyToMessageId?: string | null;
};

export type SandboxWorldConnectionFixture = {
  id: string;
  type: "dm" | "group";
  createdByUserId: string;
  originIntentId?: string | null;
  status?: string;
  participants: Array<{
    id: string;
    userId: string;
    role?: string;
  }>;
  chat: {
    id: string;
    type: "dm" | "group";
    messages: SandboxWorldMessageFixture[];
  };
};

export type SandboxWorldIntentFixture = {
  id: string;
  userId: string;
  rawText: string;
  status:
    | "draft"
    | "parsed"
    | "matching"
    | "fanout"
    | "partial"
    | "connected"
    | "expired"
    | "cancelled";
  parsedIntent: Record<string, unknown>;
  confidence: number;
  safetyState?: string;
  candidates: Array<{
    id: string;
    candidateUserId: string;
    score: number;
    rationale?: Record<string, unknown> | null;
  }>;
  requests: Array<{
    id: string;
    senderUserId: string;
    recipientUserId: string;
    status: "pending" | "accepted" | "rejected" | "expired" | "cancelled";
    wave: number;
    relevanceFeatures?: Record<string, unknown> | null;
  }>;
};

export type SandboxWorldAgentThreadFixture = {
  id: string;
  userId: string;
  title: string;
  messages: Array<{
    id: string;
    role: "user" | "agent" | "system" | "workflow";
    content: string;
    createdByUserId?: string | null;
    metadata?: Record<string, unknown> | null;
  }>;
};

export type SandboxWorldNotificationFixture = {
  id: string;
  recipientUserId: string;
  type: string;
  body: string;
  channel?: string;
  isRead?: boolean;
};

export type SandboxWorldFixture = {
  version: 1;
  worldId: string;
  name: string;
  description: string;
  ownerUserId: string;
  focalUserId: string;
  users: SandboxWorldUserFixture[];
  agentThreads: SandboxWorldAgentThreadFixture[];
  connections: SandboxWorldConnectionFixture[];
  intents: SandboxWorldIntentFixture[];
  notifications: SandboxWorldNotificationFixture[];
};

export type NormalizedSandboxWorldFixture = SandboxWorldFixture;

export type SandboxWorldSeedPlan = {
  fixture: NormalizedSandboxWorldFixture;
  summary: {
    userCount: number;
    profileCount: number;
    connectionCount: number;
    chatCount: number;
    messageCount: number;
    intentCount: number;
    requestCount: number;
    notificationCount: number;
    agentThreadCount: number;
  };
};

const DEFAULT_FIXTURE: SandboxWorldFixture = {
  version: 1,
  worldId: "design-sandbox-v1",
  name: "Design Sandbox v1",
  description:
    "A concrete staging sandbox world for testing matching, notifications, chats, and main-thread behavior.",
  ownerUserId: "11111111-1111-4111-8111-111111111111",
  focalUserId: "11111111-1111-4111-8111-111111111111",
  users: [
    {
      id: "11111111-1111-4111-8111-111111111111",
      displayName: "Avery Park",
      username: "avery",
      email: "avery.design-sandbox@example.com",
      locale: "en",
      timezone: "America/Argentina/Buenos_Aires",
      profile: {
        bio: "Product designer who wants to test the full OpenSocial staging world.",
        city: "Buenos Aires",
        country: "AR",
        visibility: "public",
        onboardingState: "complete",
        availabilityMode: "flexible",
        trustScore: 0.92,
        moderationState: "clean",
        topics: ["design systems", "social product", "staging testing"],
        interests: [
          {
            kind: "work",
            label: "design systems",
            normalizedLabel: "design systems",
            weight: 0.95,
            source: "seed",
          },
          {
            kind: "interest",
            label: "community products",
            normalizedLabel: "community products",
            weight: 0.9,
            source: "seed",
          },
        ],
        preferences: [
          {
            key: "global_rules_notification_mode",
            value: "immediate",
          },
          {
            key: "global_rules_timezone",
            value: "America/Argentina/Buenos_Aires",
          },
        ],
        availabilityWindows: [
          {
            dayOfWeek: 1,
            startMinute: 9 * 60,
            endMinute: 12 * 60,
            mode: "available",
          },
          {
            dayOfWeek: 3,
            startMinute: 13 * 60,
            endMinute: 17 * 60,
            mode: "available",
          },
        ],
      },
    },
    {
      id: "22222222-2222-4222-8222-222222222222",
      displayName: "Mina Chen",
      username: "mina",
      email: "mina.design-sandbox@example.com",
      locale: "en",
      timezone: "America/Los_Angeles",
      profile: {
        bio: "Organizer who likes small in-person groups and structured chats.",
        city: "San Francisco",
        country: "US",
        visibility: "public",
        onboardingState: "complete",
        availabilityMode: "later_today",
        trustScore: 0.88,
        moderationState: "clean",
        topics: ["product design", "hiking", "coffee chats"],
        interests: [
          {
            kind: "social",
            label: "small groups",
            normalizedLabel: "small groups",
            weight: 0.95,
            source: "seed",
          },
        ],
      },
    },
    {
      id: "33333333-3333-4333-8333-333333333333",
      displayName: "Leo Alvarez",
      username: "leo",
      email: "leo.design-sandbox@example.com",
      locale: "en",
      timezone: "America/Mexico_City",
      profile: {
        bio: "Connector who keeps the group invite flow moving.",
        city: "Mexico City",
        country: "MX",
        visibility: "public",
        onboardingState: "complete",
        availabilityMode: "now",
        trustScore: 0.9,
        moderationState: "clean",
        topics: ["community", "events", "design"],
      },
    },
    {
      id: "44444444-4444-4444-8444-444444444444",
      displayName: "Sofia Martin",
      username: "sofia",
      email: "sofia.design-sandbox@example.com",
      locale: "en",
      timezone: "Europe/Madrid",
      profile: {
        bio: "Quiet collaborator who responds well to direct asks.",
        city: "Madrid",
        country: "ES",
        visibility: "public",
        onboardingState: "complete",
        availabilityMode: "flexible",
        trustScore: 0.81,
        moderationState: "clean",
        topics: ["UX writing", "espresso", "weekend plans"],
      },
    },
    {
      id: "55555555-5555-4555-8555-555555555555",
      displayName: "Nina Patel",
      username: "nina",
      email: "nina.design-sandbox@example.com",
      locale: "en",
      timezone: "Asia/Kolkata",
      profile: {
        bio: "Careful observer who notices when the app gets noisy.",
        city: "Bengaluru",
        country: "IN",
        visibility: "public",
        onboardingState: "complete",
        availabilityMode: "later_today",
        trustScore: 0.84,
        moderationState: "clean",
        topics: ["mobile UX", "notifications", "conversation design"],
      },
    },
    {
      id: "66666666-6666-4666-8666-666666666666",
      displayName: "Jon Okafor",
      username: "jon",
      email: "jon.design-sandbox@example.com",
      locale: "en",
      timezone: "Africa/Lagos",
      profile: {
        bio: "Group moderator and reliable fallback for empty matches.",
        city: "Lagos",
        country: "NG",
        visibility: "public",
        onboardingState: "complete",
        availabilityMode: "now",
        trustScore: 0.79,
        moderationState: "clean",
        topics: ["moderation", "community operations", "group logistics"],
      },
    },
  ],
  agentThreads: [
    {
      id: "77777777-7777-4777-8777-777777777777",
      userId: "11111111-1111-4111-8111-111111111111",
      title: "Design sandbox main thread",
      messages: [
        {
          id: "77777777-7777-4777-8777-777777777778",
          role: "system",
          content:
            "Design sandbox ready. Use this thread to test matching, notifications, and first-load behavior.",
          metadata: {
            stage: "seed",
            sandboxWorldId: "design-sandbox-v1",
          },
        },
        {
          id: "77777777-7777-4777-8777-777777777779",
          role: "agent",
          content:
            "I’m keeping the world organized and ready for your next move.",
        },
      ],
    },
  ],
  connections: [
    {
      id: "88888888-8888-4888-8888-888888888881",
      type: "dm",
      createdByUserId: "11111111-1111-4111-8111-111111111111",
      originIntentId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
      status: "active",
      participants: [
        {
          id: "88888888-8888-4888-8888-888888888891",
          userId: "11111111-1111-4111-8111-111111111111",
          role: "member",
        },
        {
          id: "88888888-8888-4888-8888-888888888892",
          userId: "22222222-2222-4222-8222-222222222222",
          role: "member",
        },
      ],
      chat: {
        id: "88888888-8888-4888-8888-888888888893",
        type: "dm",
        messages: [
          {
            id: "88888888-8888-4888-8888-888888888894",
            senderUserId: "11111111-1111-4111-8111-111111111111",
            body: "Hey Mina, I’m testing the staging sandbox and want to see how the app feels with real people and groups.",
          },
          {
            id: "88888888-8888-4888-8888-888888888895",
            senderUserId: "22222222-2222-4222-8222-222222222222",
            body: "Perfect. I’ll stay available for matching and notification tests.",
          },
        ],
      },
    },
    {
      id: "99999999-9999-4999-8999-999999999991",
      type: "group",
      createdByUserId: "33333333-3333-4333-8333-333333333333",
      originIntentId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2",
      status: "active",
      participants: [
        {
          id: "99999999-9999-4999-8999-999999999992",
          userId: "11111111-1111-4111-8111-111111111111",
          role: "member",
        },
        {
          id: "99999999-9999-4999-8999-999999999993",
          userId: "33333333-3333-4333-8333-333333333333",
          role: "member",
        },
        {
          id: "99999999-9999-4999-8999-999999999994",
          userId: "44444444-4444-4444-8444-444444444444",
          role: "member",
        },
        {
          id: "99999999-9999-4999-8999-999999999995",
          userId: "55555555-5555-4555-8555-555555555555",
          role: "member",
        },
      ],
      chat: {
        id: "99999999-9999-4999-8999-999999999996",
        type: "group",
        messages: [
          {
            id: "99999999-9999-4999-8999-999999999997",
            senderUserId: "33333333-3333-4333-8333-333333333333",
            body: "Design sandbox group is live. We can test invites, nudges, and response timing here.",
          },
          {
            id: "99999999-9999-4999-8999-999999999998",
            senderUserId: "44444444-4444-4444-8444-444444444444",
            body: "I’m in. Keep the thread concise so we can see message density clearly.",
          },
          {
            id: "99999999-9999-4999-8999-999999999999",
            senderUserId: "55555555-5555-4555-8555-555555555555",
            body: "Good. I want to test the no-match recovery path and notification behavior too.",
          },
        ],
      },
    },
  ],
  intents: [
    {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
      userId: "11111111-1111-4111-8111-111111111111",
      rawText:
        "I want to test matching, group invites, and notifications in a realistic staging world.",
      status: "matching",
      parsedIntent: {
        version: 1,
        rawText:
          "I want to test matching, group invites, and notifications in a realistic staging world.",
        intentType: "group",
        urgency: "tonight",
        modality: "either",
        topics: ["design systems", "notifications", "testing"],
        activities: ["review", "feedback"],
        groupSizeTarget: 3,
        timingConstraints: ["tonight"],
        skillConstraints: ["product design"],
        vibeConstraints: ["calm", "practical"],
        confidence: 0.92,
      },
      confidence: 0.92,
      safetyState: "clean",
      candidates: [
        {
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3",
          candidateUserId: "33333333-3333-4333-8333-333333333333",
          score: 0.96,
          rationale: {
            overlap: ["design", "community"],
            reason: "Organizes reliable group conversations.",
          },
        },
        {
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4",
          candidateUserId: "44444444-4444-4444-8444-444444444444",
          score: 0.84,
          rationale: {
            overlap: ["UX writing", "weekend plans"],
            reason: "Likely to respond in a concrete, design-friendly way.",
          },
        },
      ],
      requests: [
        {
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5",
          senderUserId: "11111111-1111-4111-8111-111111111111",
          recipientUserId: "33333333-3333-4333-8333-333333333333",
          status: "pending",
          wave: 1,
          relevanceFeatures: {
            reason: "good design and community overlap",
          },
        },
      ],
    },
    {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2",
      userId: "33333333-3333-4333-8333-333333333333",
      rawText:
        "Invite a small group of product people for a focused design review.",
      status: "partial",
      parsedIntent: {
        version: 1,
        rawText:
          "Invite a small group of product people for a focused design review.",
        intentType: "group",
        urgency: "today",
        modality: "online",
        topics: ["product", "design", "review"],
        activities: ["group chat", "planning"],
        groupSizeTarget: 4,
        timingConstraints: ["today"],
        skillConstraints: ["product design"],
        vibeConstraints: ["focused", "friendly"],
        confidence: 0.87,
      },
      confidence: 0.87,
      safetyState: "clean",
      candidates: [
        {
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa6",
          candidateUserId: "11111111-1111-4111-8111-111111111111",
          score: 0.91,
          rationale: {
            overlap: ["design", "testing"],
            reason: "Design sandbox focal user.",
          },
        },
      ],
      requests: [],
    },
  ],
  notifications: [
    {
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1",
      recipientUserId: "11111111-1111-4111-8111-111111111111",
      type: "request_received",
      body: "Mina is ready to join your design sandbox test flow.",
      channel: "in_app",
      isRead: false,
    },
    {
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2",
      recipientUserId: "11111111-1111-4111-8111-111111111111",
      type: "group_formed",
      body: "The design sandbox group is ready for your testing session.",
      channel: "in_app",
      isRead: false,
    },
    {
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3",
      recipientUserId: "55555555-5555-4555-8555-555555555555",
      type: "agent_update",
      body: "Design sandbox notifications are active and ready to observe.",
      channel: "in_app",
      isRead: true,
    },
  ],
};

function trimText(value: string | undefined, fallback = "") {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : fallback;
}

function uniqueBy<T>(items: T[], key: (item: T) => string) {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const item of items) {
    const itemKey = key(item);
    if (seen.has(itemKey)) {
      continue;
    }
    seen.add(itemKey);
    result.push(item);
  }
  return result;
}

function normalizeOptionalList(value: string[] | undefined) {
  return uniqueBy(
    (value ?? []).map((item) => item.trim()).filter((item) => item.length > 0),
    (item) => item.toLowerCase(),
  );
}

function normalizeProfile(profile: SandboxWorldProfileFixture) {
  return {
    bio: trimText(profile.bio),
    city: trimText(profile.city),
    country: trimText(profile.country),
    visibility: trimText(profile.visibility, "public"),
    onboardingState: trimText(profile.onboardingState, "complete"),
    availabilityMode: trimText(profile.availabilityMode, "flexible"),
    trustScore: profile.trustScore ?? 0.8,
    moderationState: trimText(profile.moderationState, "clean"),
    topics: normalizeOptionalList(profile.topics),
    interests: uniqueBy(
      (profile.interests ?? []).map((interest) => ({
        kind: trimText(interest.kind, "interest"),
        label: trimText(interest.label),
        normalizedLabel: trimText(
          interest.normalizedLabel,
          trimText(interest.label).toLowerCase(),
        ),
        weight: interest.weight ?? 1,
        source: trimText(interest.source, "seed"),
      })),
      (item) => item.normalizedLabel.toLowerCase(),
    ),
    preferences: uniqueBy(
      (profile.preferences ?? []).map((preference) => ({
        key: trimText(preference.key),
        value: preference.value,
      })),
      (item) => item.key,
    ),
    availabilityWindows: uniqueBy(
      (profile.availabilityWindows ?? []).map((window) => ({
        dayOfWeek: window.dayOfWeek,
        startMinute: window.startMinute,
        endMinute: window.endMinute,
        mode: trimText(window.mode, "available"),
      })),
      (item) => `${item.dayOfWeek}:${item.startMinute}:${item.endMinute}`,
    ),
  };
}

function normalizeMessage(message: SandboxWorldMessageFixture) {
  return {
    id: trimText(message.id),
    senderUserId: trimText(message.senderUserId),
    body: trimText(message.body),
    moderationState: trimText(message.moderationState, "clean"),
    replyToMessageId: message.replyToMessageId?.trim() || null,
  };
}

function normalizeConnection(connection: SandboxWorldConnectionFixture) {
  return {
    id: trimText(connection.id),
    type: connection.type,
    createdByUserId: trimText(connection.createdByUserId),
    originIntentId: connection.originIntentId?.trim() || null,
    status: trimText(connection.status, "active"),
    participants: uniqueBy(
      connection.participants.map((participant) => ({
        id: trimText(participant.id),
        userId: trimText(participant.userId),
        role: trimText(participant.role, "member"),
      })),
      (participant) => participant.id,
    ),
    chat: {
      id: trimText(connection.chat.id),
      type: connection.chat.type,
      messages: uniqueBy(
        connection.chat.messages.map(normalizeMessage),
        (message) => message.id,
      ),
    },
  };
}

function normalizeIntent(intent: SandboxWorldIntentFixture) {
  return {
    id: trimText(intent.id),
    userId: trimText(intent.userId),
    rawText: trimText(intent.rawText),
    status: intent.status,
    parsedIntent: intent.parsedIntent,
    confidence: intent.confidence,
    safetyState: trimText(intent.safetyState, "clean"),
    candidates: uniqueBy(
      intent.candidates.map((candidate) => ({
        id: trimText(candidate.id),
        candidateUserId: trimText(candidate.candidateUserId),
        score: candidate.score,
        rationale: candidate.rationale ?? null,
      })),
      (candidate) => candidate.id,
    ),
    requests: uniqueBy(
      intent.requests.map((request) => ({
        id: trimText(request.id),
        senderUserId: trimText(request.senderUserId),
        recipientUserId: trimText(request.recipientUserId),
        status: request.status,
        wave: request.wave,
        relevanceFeatures: request.relevanceFeatures ?? null,
      })),
      (request) => request.id,
    ),
  };
}

function normalizeAgentThread(thread: SandboxWorldAgentThreadFixture) {
  return {
    id: trimText(thread.id),
    userId: trimText(thread.userId),
    title: trimText(thread.title),
    messages: uniqueBy(
      thread.messages.map((message) => ({
        id: trimText(message.id),
        role: trimText(message.role, "system") as
          | "user"
          | "agent"
          | "system"
          | "workflow",
        content: trimText(message.content),
        createdByUserId: message.createdByUserId?.trim() || null,
        metadata: message.metadata ?? null,
      })),
      (message) => message.id,
    ),
  };
}

function normalizeNotification(notification: SandboxWorldNotificationFixture) {
  return {
    id: trimText(notification.id),
    recipientUserId: trimText(notification.recipientUserId),
    type: trimText(notification.type),
    body: trimText(notification.body),
    channel: trimText(notification.channel, "in_app"),
    isRead: notification.isRead ?? false,
  };
}

export function normalizeDesignSandboxWorldFixture(
  input: SandboxWorldFixture = DEFAULT_FIXTURE,
): NormalizedSandboxWorldFixture {
  return {
    version: 1,
    worldId: trimText(input.worldId, DEFAULT_FIXTURE.worldId),
    name: trimText(input.name, DEFAULT_FIXTURE.name),
    description: trimText(input.description, DEFAULT_FIXTURE.description),
    ownerUserId: trimText(input.ownerUserId, DEFAULT_FIXTURE.ownerUserId),
    focalUserId: trimText(input.focalUserId, DEFAULT_FIXTURE.focalUserId),
    users: uniqueBy(
      (input.users ?? DEFAULT_FIXTURE.users).map((user) => ({
        id: trimText(user.id),
        displayName: trimText(user.displayName),
        username: user.username?.trim() || undefined,
        email: user.email?.trim() || undefined,
        locale: trimText(user.locale, "en"),
        timezone: trimText(user.timezone, "UTC"),
        profile: normalizeProfile(user.profile),
      })),
      (user) => user.id,
    ),
    agentThreads: uniqueBy(
      (input.agentThreads ?? DEFAULT_FIXTURE.agentThreads).map((thread) =>
        normalizeAgentThread(thread),
      ),
      (thread) => thread.id,
    ),
    connections: uniqueBy(
      (input.connections ?? DEFAULT_FIXTURE.connections).map((connection) =>
        normalizeConnection(connection),
      ),
      (connection) => connection.id,
    ),
    intents: uniqueBy(
      (input.intents ?? DEFAULT_FIXTURE.intents).map((intent) =>
        normalizeIntent(intent),
      ),
      (intent) => intent.id,
    ),
    notifications: uniqueBy(
      (input.notifications ?? DEFAULT_FIXTURE.notifications).map(
        (notification) => normalizeNotification(notification),
      ),
      (notification) => notification.id,
    ),
  };
}

export function buildDesignSandboxWorldSeedPlan(
  fixture: SandboxWorldFixture = DEFAULT_FIXTURE,
): SandboxWorldSeedPlan {
  const normalized = normalizeDesignSandboxWorldFixture(fixture);
  const profileCount = normalized.users.length;
  const connectionCount = normalized.connections.length;
  const chatCount = normalized.connections.length;
  const messageCount =
    normalized.connections.reduce(
      (total, connection) => total + connection.chat.messages.length,
      0,
    ) +
    normalized.agentThreads.reduce(
      (total, thread) => total + thread.messages.length,
      0,
    );
  const intentCount = normalized.intents.length;
  const requestCount = normalized.intents.reduce(
    (total, intent) => total + intent.requests.length,
    0,
  );
  const notificationCount = normalized.notifications.length;
  const agentThreadCount = normalized.agentThreads.length;

  return {
    fixture: normalized,
    summary: {
      userCount: normalized.users.length,
      profileCount,
      connectionCount,
      chatCount,
      messageCount,
      intentCount,
      requestCount,
      notificationCount,
      agentThreadCount,
    },
  };
}

export const designSandboxWorldV1Fixture = DEFAULT_FIXTURE;
