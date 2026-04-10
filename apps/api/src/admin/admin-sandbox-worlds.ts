export type SandboxPersona = {
  id: string;
  displayName: string;
  bio: string;
  city: string;
  country: string;
  interests: string[];
  topics: string[];
};

export type SandboxDirectChatSeed = {
  id: string;
  connectionId: string;
  participantUserId: string;
  messages: Array<{
    id: string;
    senderUserId: string;
    body: string;
  }>;
};

export type SandboxGroupChatSeed = {
  id: string;
  connectionId: string;
  participantUserIds: string[];
  title: string;
  messages: Array<{
    id: string;
    senderUserId: string;
    body: string;
  }>;
};

export type SandboxWorldDefinition = {
  id: "design-sandbox-v1";
  label: string;
  notes: string[];
  focalThreadId: string;
  syntheticUsers: SandboxPersona[];
  directChats: SandboxDirectChatSeed[];
  groupChats: SandboxGroupChatSeed[];
  focalNotifications: Array<{
    id: string;
    type:
      | "agent_update"
      | "request_received"
      | "request_accepted"
      | "group_formed"
      | "reminder";
    body: string;
  }>;
  tick: {
    messageId: string;
    notificationId: string;
  };
  focalAgentThread: Array<{
    id: string;
    role: "user" | "agent" | "system";
    content: string;
  }>;
  focalIntent: {
    id: string;
    rawText: string;
    parsedIntent: Record<string, unknown>;
    requestIds: string[];
  };
};

const syntheticUsers: SandboxPersona[] = [
  {
    id: "a1111111-1111-4111-8111-111111111111",
    displayName: "Maya Torres",
    bio: "Product designer who likes dinner salons, city walks, and intentional small groups.",
    city: "Buenos Aires",
    country: "AR",
    interests: ["design", "community", "dinners"],
    topics: ["product design", "creative direction", "small gatherings"],
  },
  {
    id: "a2222222-2222-4222-8222-222222222222",
    displayName: "Nico Alvarez",
    bio: "Founder-minded operator who prefers low-noise meetups and quick 1:1 follow-through.",
    city: "Buenos Aires",
    country: "AR",
    interests: ["founders", "operators", "coffee"],
    topics: ["startups", "ops", "city coffee"],
  },
  {
    id: "a3333333-3333-4333-8333-333333333333",
    displayName: "Sofia Kim",
    bio: "Researcher balancing online and in-person communities around design systems and AI products.",
    city: "Buenos Aires",
    country: "AR",
    interests: ["ai", "research", "systems"],
    topics: ["ai products", "design systems", "research circles"],
  },
  {
    id: "a4444444-4444-4444-8444-444444444444",
    displayName: "Tom Bennett",
    bio: "Visiting builder who likes compact group dinners and straightforward intros.",
    city: "Buenos Aires",
    country: "AR",
    interests: ["builders", "dinners", "networking"],
    topics: ["founder dinners", "visiting tech", "compact groups"],
  },
  {
    id: "a5555555-5555-4555-8555-555555555555",
    displayName: "Lucia Romero",
    bio: "Community host who can convene a room quickly when the mix feels right.",
    city: "Buenos Aires",
    country: "AR",
    interests: ["hosting", "community", "events"],
    topics: ["community dinners", "hosts", "salons"],
  },
  {
    id: "a6666666-6666-4666-8666-666666666666",
    displayName: "Ethan Park",
    bio: "Engineer who prefers structured online sessions before moving to in-person plans.",
    city: "Buenos Aires",
    country: "AR",
    interests: ["engineering", "remote", "deep work"],
    topics: ["technical meetups", "online sessions", "small teams"],
  },
];

export const SANDBOX_WORLD_DEFINITIONS: Record<
  SandboxWorldDefinition["id"],
  SandboxWorldDefinition
> = {
  "design-sandbox-v1": {
    id: "design-sandbox-v1",
    label: "Design Sandbox v1",
    focalThreadId: "e0000000-0000-4000-8000-000000000001",
    notes: [
      "Focused on home-thread clarity, live chats, notifications, and match coordination.",
      "Uses a small synthetic social graph that is stable enough for UI design passes.",
    ],
    syntheticUsers,
    directChats: [
      {
        id: "b1111111-1111-4111-8111-111111111111",
        connectionId: "c1111111-1111-4111-8111-111111111111",
        participantUserId: syntheticUsers[0].id,
        messages: [
          {
            id: "d1111111-1111-4111-8111-111111111111",
            senderUserId: syntheticUsers[0].id,
            body: "I’m open to a quiet dinner this week if the group stays small.",
          },
          {
            id: "d1111111-1111-4111-8111-111111111112",
            senderUserId: syntheticUsers[0].id,
            body: "Thursday evening in Palermo would work for me.",
          },
        ],
      },
      {
        id: "b2222222-2222-4222-8222-222222222222",
        connectionId: "c2222222-2222-4222-8222-222222222222",
        participantUserId: syntheticUsers[1].id,
        messages: [
          {
            id: "d2222222-2222-4222-8222-222222222221",
            senderUserId: syntheticUsers[1].id,
            body: "I can do a short coffee first if you want to keep it low-pressure.",
          },
        ],
      },
    ],
    groupChats: [
      {
        id: "b3333333-3333-4333-8333-333333333333",
        connectionId: "c3333333-3333-4333-8333-333333333333",
        title: "Design Dinner Circle",
        participantUserIds: [
          syntheticUsers[2].id,
          syntheticUsers[3].id,
          syntheticUsers[4].id,
        ],
        messages: [
          {
            id: "d3333333-3333-4333-8333-333333333331",
            senderUserId: syntheticUsers[4].id,
            body: "I can host if we keep it to four people and confirm by tomorrow.",
          },
          {
            id: "d3333333-3333-4333-8333-333333333332",
            senderUserId: syntheticUsers[2].id,
            body: "Online first also works if anyone wants a quick intro before dinner.",
          },
        ],
      },
    ],
    focalNotifications: [
      {
        id: "f4111111-1111-4111-8111-111111111111",
        type: "agent_update",
        body: "I found two people and one small group that fit your pace.",
      },
      {
        id: "f4222222-2222-4222-8222-222222222222",
        type: "request_received",
        body: "Maya is open to a small dinner this week.",
      },
      {
        id: "f4333333-3333-4333-8333-333333333333",
        type: "group_formed",
        body: "A design dinner circle is forming for Thursday evening.",
      },
    ],
    tick: {
      messageId: "d4444444-4444-4444-8444-444444444444",
      notificationId: "f4444444-4444-4444-8444-444444444444",
    },
    focalAgentThread: [
      {
        id: "e1111111-1111-4111-8111-111111111111",
        role: "user",
        content:
          "I want to meet a few thoughtful product and design people in Buenos Aires this week.",
      },
      {
        id: "e1111111-1111-4111-8111-111111111112",
        role: "agent",
        content:
          "I found two strong 1:1 options and one small dinner circle. If you want, I can start with the calmer path first.",
      },
    ],
    focalIntent: {
      id: "f1111111-1111-4111-8111-111111111111",
      rawText:
        "Meet thoughtful product and design people in Buenos Aires this week.",
      parsedIntent: {
        intentType: "social",
        topics: ["product design", "design systems", "founders"],
        modality: "either",
        timingConstraints: ["this week"],
        groupSizeTarget: 4,
      },
      requestIds: [
        "f2111111-1111-4111-8111-111111111111",
        "f3111111-1111-4111-8111-111111111111",
      ],
    },
  },
};

export function getSandboxWorldDefinition(worldId: string) {
  if (worldId !== "design-sandbox-v1") {
    throw new Error(`Unknown sandbox world: ${worldId}`);
  }
  return SANDBOX_WORLD_DEFINITIONS[worldId];
}
