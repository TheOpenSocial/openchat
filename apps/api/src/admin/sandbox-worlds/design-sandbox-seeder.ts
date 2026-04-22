import { type AvailabilityMode, type ModerationState } from "@prisma/client";
import type { PrismaService } from "../../database/prisma.service.js";
import type { AdminRole } from "../admin-audit.service.js";
import {
  buildDesignSandboxWorldSeedPlan,
  designSandboxWorldV1Fixture,
  type SandboxWorldFixture,
} from "./design-sandbox-v1.fixture.js";
import { createHash } from "node:crypto";

export type SandboxWorldSeedActor = {
  adminUserId: string;
  role: AdminRole;
};

export type SandboxWorldSeedResult = {
  worldId: string;
  name: string;
  description: string;
  ownerUserId: string;
  focalUserId: string;
  seededAt: string;
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

export async function seedDesignSandboxWorld(
  prisma: PrismaService,
  actor: SandboxWorldSeedActor,
  input?: Partial<SandboxWorldFixture>,
): Promise<SandboxWorldSeedResult> {
  const plan = buildDesignSandboxWorldSeedPlan({
    ...designSandboxWorldV1Fixture,
    ...input,
  });
  const world = plan.fixture;
  const seededAt = new Date().toISOString();

  await prisma.$transaction(async (tx) => {
    for (const user of world.users) {
      await tx.user.upsert({
        where: { id: user.id },
        update: {
          displayName: user.displayName,
          username: user.username ?? null,
          email: user.email ?? null,
          locale: user.locale,
          timezone: user.timezone,
          status: "active",
        },
        create: {
          id: user.id,
          displayName: user.displayName,
          username: user.username ?? null,
          email: user.email ?? null,
          locale: user.locale,
          timezone: user.timezone,
          status: "active",
        },
      });

      await tx.userProfile.upsert({
        where: { userId: user.id },
        update: {
          bio: user.profile.bio,
          city: user.profile.city,
          country: user.profile.country,
          visibility: user.profile.visibility ?? "public",
          onboardingState: user.profile.onboardingState ?? "complete",
          availabilityMode: (user.profile.availabilityMode ??
            "flexible") as AvailabilityMode,
          trustScore: user.profile.trustScore ?? 0.8,
          moderationState: (user.profile.moderationState ??
            "clean") as ModerationState,
        },
        create: {
          userId: user.id,
          bio: user.profile.bio,
          city: user.profile.city,
          country: user.profile.country,
          visibility: user.profile.visibility ?? "public",
          onboardingState: user.profile.onboardingState ?? "complete",
          availabilityMode: (user.profile.availabilityMode ??
            "flexible") as AvailabilityMode,
          trustScore: user.profile.trustScore ?? 0.8,
          moderationState: (user.profile.moderationState ??
            "clean") as ModerationState,
        },
      });

      for (const [index, topic] of (user.profile.topics ?? []).entries()) {
        await tx.userTopic.upsert({
          where: {
            id: stableUuid(
              `${world.worldId}:topic:${user.id}:${index}:${topic.toLowerCase()}`,
            ),
          },
          update: {
            userId: user.id,
            label: topic,
            normalizedLabel: topic.toLowerCase(),
            source: "seed",
          },
          create: {
            id: stableUuid(
              `${world.worldId}:topic:${user.id}:${index}:${topic.toLowerCase()}`,
            ),
            userId: user.id,
            label: topic,
            normalizedLabel: topic.toLowerCase(),
            source: "seed",
          },
        });
      }

      for (const interest of user.profile.interests ?? []) {
        const id = stableUuid(
          `${world.worldId}:interest:${user.id}:${interest.normalizedLabel.toLowerCase()}`,
        );
        await tx.userInterest.upsert({
          where: { id },
          update: {
            userId: user.id,
            kind: interest.kind,
            label: interest.label,
            normalizedLabel: interest.normalizedLabel,
            weight: interest.weight ?? 1,
            source: interest.source ?? "seed",
          },
          create: {
            id,
            userId: user.id,
            kind: interest.kind,
            label: interest.label,
            normalizedLabel: interest.normalizedLabel,
            weight: interest.weight ?? 1,
            source: interest.source ?? "seed",
          },
        });
      }

      for (const preference of user.profile.preferences ?? []) {
        const id = stableUuid(
          `${world.worldId}:preference:${user.id}:${preference.key}`,
        );
        await tx.userPreference.upsert({
          where: { id },
          update: {
            userId: user.id,
            key: preference.key,
            value: preference.value as never,
          },
          create: {
            id,
            userId: user.id,
            key: preference.key,
            value: preference.value as never,
          },
        });
      }

      for (const window of user.profile.availabilityWindows ?? []) {
        const id = stableUuid(
          `${world.worldId}:availability:${user.id}:${window.dayOfWeek}:${window.startMinute}:${window.endMinute}`,
        );
        await tx.userAvailabilityWindow.upsert({
          where: { id },
          update: {
            userId: user.id,
            dayOfWeek: window.dayOfWeek,
            startMinute: window.startMinute,
            endMinute: window.endMinute,
            mode: window.mode ?? "available",
            timezone: user.timezone,
          },
          create: {
            id,
            userId: user.id,
            dayOfWeek: window.dayOfWeek,
            startMinute: window.startMinute,
            endMinute: window.endMinute,
            mode: window.mode ?? "available",
            timezone: user.timezone,
          },
        });
      }
    }

    for (const thread of world.agentThreads) {
      await tx.agentThread.upsert({
        where: { id: thread.id },
        update: {
          userId: thread.userId,
          title: thread.title,
        },
        create: {
          id: thread.id,
          userId: thread.userId,
          title: thread.title,
        },
      });

      for (const message of thread.messages) {
        await tx.agentMessage.upsert({
          where: { id: message.id },
          update: {
            threadId: thread.id,
            createdByUserId: message.createdByUserId ?? null,
            role: message.role,
            content: message.content,
            metadata: (message.metadata ?? null) as never,
          },
          create: {
            id: message.id,
            threadId: thread.id,
            createdByUserId: message.createdByUserId ?? null,
            role: message.role,
            content: message.content,
            metadata: (message.metadata ?? null) as never,
          },
        });
      }
    }

    for (const connection of world.connections) {
      await tx.connection.upsert({
        where: { id: connection.id },
        update: {
          type: connection.type,
          createdByUserId: connection.createdByUserId,
          originIntentId: connection.originIntentId ?? null,
          status: connection.status ?? "active",
        },
        create: {
          id: connection.id,
          type: connection.type,
          createdByUserId: connection.createdByUserId,
          originIntentId: connection.originIntentId ?? null,
          status: connection.status ?? "active",
        },
      });

      for (const participant of connection.participants) {
        await tx.connectionParticipant.upsert({
          where: { id: participant.id },
          update: {
            connectionId: connection.id,
            userId: participant.userId,
            role: participant.role ?? "member",
          },
          create: {
            id: participant.id,
            connectionId: connection.id,
            userId: participant.userId,
            role: participant.role ?? "member",
          },
        });
      }

      await tx.chat.upsert({
        where: { id: connection.chat.id },
        update: {
          connectionId: connection.id,
          type: connection.chat.type,
        },
        create: {
          id: connection.chat.id,
          connectionId: connection.id,
          type: connection.chat.type,
        },
      });

      for (const message of connection.chat.messages) {
        await tx.chatMessage.upsert({
          where: { id: message.id },
          update: {
            chatId: connection.chat.id,
            senderUserId: message.senderUserId,
            body: message.body,
            moderationState: (message.moderationState ??
              "clean") as ModerationState,
            replyToMessageId: message.replyToMessageId ?? null,
          },
          create: {
            id: message.id,
            chatId: connection.chat.id,
            senderUserId: message.senderUserId,
            body: message.body,
            moderationState: (message.moderationState ??
              "clean") as ModerationState,
            replyToMessageId: message.replyToMessageId ?? null,
          },
        });
      }

      for (const participant of connection.participants) {
        await tx.chatMembership.upsert({
          where: {
            id: stableUuid(
              `${world.worldId}:chat-membership:${connection.chat.id}:${participant.userId}`,
            ),
          },
          update: {
            chatId: connection.chat.id,
            userId: participant.userId,
          },
          create: {
            id: stableUuid(
              `${world.worldId}:chat-membership:${connection.chat.id}:${participant.userId}`,
            ),
            chatId: connection.chat.id,
            userId: participant.userId,
          },
        });
      }
    }

    for (const intent of world.intents) {
      await tx.intent.upsert({
        where: { id: intent.id },
        update: {
          userId: intent.userId,
          rawText: intent.rawText,
          status: intent.status,
          parsedIntent: intent.parsedIntent as never,
          confidence: intent.confidence,
          safetyState: (intent.safetyState ?? "clean") as ModerationState,
        },
        create: {
          id: intent.id,
          userId: intent.userId,
          rawText: intent.rawText,
          status: intent.status,
          parsedIntent: intent.parsedIntent as never,
          confidence: intent.confidence,
          safetyState: (intent.safetyState ?? "clean") as ModerationState,
        },
      });

      for (const candidate of intent.candidates) {
        await tx.intentCandidate.upsert({
          where: { id: candidate.id },
          update: {
            intentId: intent.id,
            candidateUserId: candidate.candidateUserId,
            score: candidate.score,
            rationale: (candidate.rationale ?? null) as never,
          },
          create: {
            id: candidate.id,
            intentId: intent.id,
            candidateUserId: candidate.candidateUserId,
            score: candidate.score,
            rationale: (candidate.rationale ?? null) as never,
          },
        });
      }

      for (const request of intent.requests) {
        await tx.intentRequest.upsert({
          where: { id: request.id },
          update: {
            intentId: intent.id,
            senderUserId: request.senderUserId,
            recipientUserId: request.recipientUserId,
            status: request.status,
            wave: request.wave,
            relevanceFeatures: (request.relevanceFeatures ?? null) as never,
          },
          create: {
            id: request.id,
            intentId: intent.id,
            senderUserId: request.senderUserId,
            recipientUserId: request.recipientUserId,
            status: request.status,
            wave: request.wave,
            relevanceFeatures: (request.relevanceFeatures ?? null) as never,
          },
        });
      }
    }

    for (const notification of world.notifications) {
      await tx.notification.upsert({
        where: { id: notification.id },
        update: {
          recipientUserId: notification.recipientUserId,
          type: notification.type,
          body: notification.body,
          channel: notification.channel ?? "in_app",
          isRead: notification.isRead ?? false,
        },
        create: {
          id: notification.id,
          recipientUserId: notification.recipientUserId,
          type: notification.type,
          body: notification.body,
          channel: notification.channel ?? "in_app",
          isRead: notification.isRead ?? false,
        },
      });
    }
  });

  return {
    worldId: world.worldId,
    name: world.name,
    description: world.description,
    ownerUserId: world.ownerUserId,
    focalUserId: world.focalUserId,
    seededAt,
    summary: plan.summary,
  };
}

function stableUuid(input: string) {
  const hex = createHash("sha256").update(input).digest("hex").slice(0, 32);
  const chars = hex.split("");
  chars[12] = "4";
  const variant = Number.parseInt(chars[16] ?? "8", 16);
  chars[16] = ((variant & 0x3) | 0x8).toString(16);
  return [
    chars.slice(0, 8).join(""),
    chars.slice(8, 12).join(""),
    chars.slice(12, 16).join(""),
    chars.slice(16, 20).join(""),
    chars.slice(20, 32).join(""),
  ].join("-");
}
