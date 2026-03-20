import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const adapter = new PrismaPg({
  connectionString:
    process.env.DATABASE_URL ??
    "postgresql://postgres:postgres@localhost:5432/opensocial",
});

const prisma = new PrismaClient({
  adapter,
});
const now = new Date();
const oneDayFromNow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

const demoUsers = [
  {
    email: "seed.sender@opensocial.local",
    displayName: "Seed Sender",
    bio: "Looking for activity partners this week.",
    city: "San Francisco",
    country: "US",
    interests: ["tennis", "hiking"],
    topics: ["sports", "wellness"],
  },
  {
    email: "seed.recipient.a@opensocial.local",
    displayName: "Seed Recipient A",
    bio: "Open to quick after-work chats and plans.",
    city: "San Francisco",
    country: "US",
    interests: ["tennis", "coffee"],
    topics: ["sports", "social"],
  },
  {
    email: "seed.recipient.b@opensocial.local",
    displayName: "Seed Recipient B",
    bio: "Prefers group activities and weekend plans.",
    city: "Oakland",
    country: "US",
    interests: ["hiking", "board games"],
    topics: ["outdoors", "games"],
  },
];

function normalizeLabel(value) {
  return value.trim().toLowerCase();
}

async function upsertDemoUser(user) {
  const createdUser = await prisma.user.upsert({
    where: { email: user.email },
    update: {
      displayName: user.displayName,
      locale: "en",
      timezone: "America/Los_Angeles",
    },
    create: {
      email: user.email,
      displayName: user.displayName,
      locale: "en",
      timezone: "America/Los_Angeles",
    },
  });

  await prisma.userProfile.upsert({
    where: { userId: createdUser.id },
    update: {
      bio: user.bio,
      city: user.city,
      country: user.country,
      onboardingState: "complete",
      availabilityMode: "now",
      visibility: "public",
    },
    create: {
      userId: createdUser.id,
      bio: user.bio,
      city: user.city,
      country: user.country,
      onboardingState: "complete",
      availabilityMode: "now",
      visibility: "public",
    },
  });

  await prisma.userInterest.deleteMany({ where: { userId: createdUser.id } });
  await prisma.userInterest.createMany({
    data: user.interests.map((label) => ({
      userId: createdUser.id,
      kind: "activity",
      label,
      normalizedLabel: normalizeLabel(label),
      source: "seed",
    })),
    skipDuplicates: true,
  });

  await prisma.userTopic.deleteMany({ where: { userId: createdUser.id } });
  await prisma.userTopic.createMany({
    data: user.topics.map((label) => ({
      userId: createdUser.id,
      label,
      normalizedLabel: normalizeLabel(label),
      source: "seed",
    })),
    skipDuplicates: true,
  });

  return createdUser;
}

async function ensureAgentThread(userId) {
  const existing = await prisma.agentThread.findFirst({
    where: {
      userId,
      title: "Seed Demo Thread",
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  if (existing) {
    return existing;
  }

  const thread = await prisma.agentThread.create({
    data: {
      userId,
      title: "Seed Demo Thread",
    },
  });

  await prisma.agentMessage.createMany({
    data: [
      {
        threadId: thread.id,
        createdByUserId: userId,
        role: "user",
        content: "I want to find someone for tennis tonight.",
      },
      {
        threadId: thread.id,
        role: "agent",
        content: "Great, I will start matching now.",
      },
    ],
  });

  return thread;
}

async function ensureDemoIntent(senderId) {
  const existing = await prisma.intent.findFirst({
    where: {
      userId: senderId,
      rawText: "Seed demo intent: find tennis partners tonight",
    },
    orderBy: { createdAt: "desc" },
  });
  if (existing) {
    return existing;
  }

  return prisma.intent.create({
    data: {
      userId: senderId,
      rawText: "Seed demo intent: find tennis partners tonight",
      status: "partial",
      parsedIntent: {
        intentType: "activity",
        modality: "either",
        urgency: "tonight",
        topics: ["sports", "tennis"],
        activities: ["tennis"],
        confidence: 0.82,
      },
      confidence: 0.82,
    },
  });
}

async function ensureIntentRequest(
  intentId,
  senderUserId,
  recipientUserId,
  data,
) {
  const existing = await prisma.intentRequest.findFirst({
    where: {
      intentId,
      senderUserId,
      recipientUserId,
    },
    orderBy: { sentAt: "desc" },
  });

  if (existing) {
    return existing;
  }

  return prisma.intentRequest.create({
    data: {
      intentId,
      senderUserId,
      recipientUserId,
      status: data.status,
      respondedAt: data.respondedAt,
      expiresAt: data.expiresAt,
      wave: data.wave ?? 1,
      relevanceFeatures: data.relevanceFeatures ?? {},
    },
  });
}

async function ensureDemoConnection(intentId, senderId, recipientId) {
  let connection = await prisma.connection.findFirst({
    where: {
      originIntentId: intentId,
      type: "dm",
    },
    orderBy: { createdAt: "desc" },
  });

  if (!connection) {
    connection = await prisma.connection.create({
      data: {
        type: "dm",
        originIntentId: intentId,
        createdByUserId: senderId,
      },
    });
  }

  for (const userId of [senderId, recipientId]) {
    const existingParticipant = await prisma.connectionParticipant.findFirst({
      where: {
        connectionId: connection.id,
        userId,
        leftAt: null,
      },
    });
    if (!existingParticipant) {
      await prisma.connectionParticipant.create({
        data: {
          connectionId: connection.id,
          userId,
          role: userId === senderId ? "creator" : "member",
        },
      });
    }
  }

  let chat = await prisma.chat.findFirst({
    where: {
      connectionId: connection.id,
    },
    orderBy: { createdAt: "desc" },
  });
  if (!chat) {
    chat = await prisma.chat.create({
      data: {
        connectionId: connection.id,
        type: "dm",
      },
    });
  }

  const existingMessage = await prisma.chatMessage.findFirst({
    where: {
      chatId: chat.id,
      senderUserId: senderId,
      body: "Seed demo message: hey, want to play tennis tonight?",
    },
  });
  if (!existingMessage) {
    await prisma.chatMessage.create({
      data: {
        chatId: chat.id,
        senderUserId: senderId,
        body: "Seed demo message: hey, want to play tennis tonight?",
      },
    });
  }

  return { connection, chat };
}

async function main() {
  const [sender, recipientA, recipientB] = await Promise.all(
    demoUsers.map((user) => upsertDemoUser(user)),
  );

  const thread = await ensureAgentThread(sender.id);
  const intent = await ensureDemoIntent(sender.id);

  const acceptedRequest = await ensureIntentRequest(
    intent.id,
    sender.id,
    recipientA.id,
    {
      status: "accepted",
      respondedAt: now,
      expiresAt: oneDayFromNow,
      relevanceFeatures: {
        score: 0.91,
        reason: "seed_high_overlap",
      },
    },
  );
  const pendingRequest = await ensureIntentRequest(
    intent.id,
    sender.id,
    recipientB.id,
    {
      status: "pending",
      respondedAt: null,
      expiresAt: oneDayFromNow,
      relevanceFeatures: {
        score: 0.74,
        reason: "seed_secondary_overlap",
      },
    },
  );

  const { connection, chat } = await ensureDemoConnection(
    intent.id,
    sender.id,
    recipientA.id,
  );

  console.log("Seed complete:", {
    users: {
      sender: sender.id,
      recipientA: recipientA.id,
      recipientB: recipientB.id,
    },
    threadId: thread.id,
    intentId: intent.id,
    acceptedRequestId: acceptedRequest.id,
    pendingRequestId: pendingRequest.id,
    connectionId: connection.id,
    chatId: chat.id,
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
