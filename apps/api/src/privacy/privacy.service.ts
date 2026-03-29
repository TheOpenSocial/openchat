import { Injectable, NotFoundException } from "@nestjs/common";
import { IntentStatus } from "@prisma/client";
import { PrismaService } from "../database/prisma.service.js";

const DEFAULT_CHAT_RETENTION_DAYS = 180;
const DEFAULT_AUDIT_RETENTION_DAYS = 365;
const DEFAULT_NOTIFICATION_RETENTION_DAYS = 90;
const DEFAULT_EXPORT_REQUEST_RETENTION_DAYS = 30;
const EXPORT_LIMIT = 500;

const LEARNED_RETRIEVAL_DOC_TYPES = [
  "profile_summary",
  "preference_memory",
  "interaction_summary",
  "interaction_summary_flagged",
  "relationship_memory",
  "safety_memory",
  "commerce_memory",
] as const;

@Injectable()
export class PrivacyService {
  constructor(private readonly prisma: PrismaService) {}

  getRetentionPolicy() {
    const retention = {
      chatMessagesDays: this.readRetentionDays(
        "PRIVACY_RETENTION_CHAT_MESSAGES_DAYS",
        DEFAULT_CHAT_RETENTION_DAYS,
      ),
      auditLogsDays: this.readRetentionDays(
        "PRIVACY_RETENTION_AUDIT_LOGS_DAYS",
        DEFAULT_AUDIT_RETENTION_DAYS,
      ),
      notificationsDays: this.readRetentionDays(
        "PRIVACY_RETENTION_NOTIFICATIONS_DAYS",
        DEFAULT_NOTIFICATION_RETENTION_DAYS,
      ),
      exportRequestsDays: this.readRetentionDays(
        "PRIVACY_RETENTION_EXPORT_REQUESTS_DAYS",
        DEFAULT_EXPORT_REQUEST_RETENTION_DAYS,
      ),
    };

    return {
      version: 1,
      generatedAt: new Date().toISOString(),
      retention,
      rights: {
        userDataExport: true,
        accountDeletion: "anonymize_and_revoke",
        messageDeletion: "soft_delete_body_rewrite",
        memoryReset: true,
      },
      policyReferences: {
        retentionDoc: "docs/data-retention.md",
      },
    };
  }

  async exportUserData(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        profile: true,
      },
    });
    if (!user) {
      throw new NotFoundException("User not found");
    }

    const [
      sessions,
      interests,
      topics,
      availabilityWindows,
      rules,
      preferences,
      explicitPreferences,
      inferredPreferences,
      intents,
      requestsSent,
      requestsReceived,
      connectionMemberships,
      chatMemberships,
      sentMessages,
      notifications,
      reportsFiled,
      reportsReceived,
      blocksCreated,
      blocksReceived,
      agentThreads,
      retrievalDocuments,
    ] = await Promise.all([
      this.prisma.userSession.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: EXPORT_LIMIT,
      }),
      this.prisma.userInterest.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: EXPORT_LIMIT,
      }),
      this.prisma.userTopic.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: EXPORT_LIMIT,
      }),
      this.prisma.userAvailabilityWindow.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: EXPORT_LIMIT,
      }),
      this.prisma.userRule.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: EXPORT_LIMIT,
      }),
      this.prisma.userPreference.findMany({
        where: { userId },
        orderBy: { updatedAt: "desc" },
        take: EXPORT_LIMIT,
      }),
      this.prisma.explicitPreference.findMany({
        where: { userId },
        orderBy: { updatedAt: "desc" },
        take: EXPORT_LIMIT,
      }),
      this.prisma.inferredPreference.findMany({
        where: { userId },
        orderBy: { updatedAt: "desc" },
        take: EXPORT_LIMIT,
      }),
      this.prisma.intent.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: EXPORT_LIMIT,
      }),
      this.prisma.intentRequest.findMany({
        where: { senderUserId: userId },
        orderBy: { sentAt: "desc" },
        take: EXPORT_LIMIT,
      }),
      this.prisma.intentRequest.findMany({
        where: { recipientUserId: userId },
        orderBy: { sentAt: "desc" },
        take: EXPORT_LIMIT,
      }),
      this.prisma.connectionParticipant.findMany({
        where: { userId },
        include: { connection: true },
        orderBy: { joinedAt: "desc" },
        take: EXPORT_LIMIT,
      }),
      this.prisma.chatMembership.findMany({
        where: { userId },
        orderBy: { joinedAt: "desc" },
        take: EXPORT_LIMIT,
      }),
      this.prisma.chatMessage.findMany({
        where: { senderUserId: userId },
        orderBy: { createdAt: "desc" },
        take: EXPORT_LIMIT,
      }),
      this.prisma.notification.findMany({
        where: { recipientUserId: userId },
        orderBy: { createdAt: "desc" },
        take: EXPORT_LIMIT,
      }),
      this.prisma.userReport.findMany({
        where: { reporterUserId: userId },
        orderBy: { createdAt: "desc" },
        take: EXPORT_LIMIT,
      }),
      this.prisma.userReport.findMany({
        where: { targetUserId: userId },
        orderBy: { createdAt: "desc" },
        take: EXPORT_LIMIT,
      }),
      this.prisma.block.findMany({
        where: { blockerUserId: userId },
        orderBy: { createdAt: "desc" },
        take: EXPORT_LIMIT,
      }),
      this.prisma.block.findMany({
        where: { blockedUserId: userId },
        orderBy: { createdAt: "desc" },
        take: EXPORT_LIMIT,
      }),
      this.prisma.agentThread.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: EXPORT_LIMIT,
      }),
      this.prisma.retrievalDocument.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: EXPORT_LIMIT,
      }),
    ]);

    const threadIds = agentThreads.map((thread) => thread.id);
    const retrievalDocumentIds = retrievalDocuments.map(
      (document) => document.id,
    );

    const [agentMessages, retrievalChunks] = await Promise.all([
      threadIds.length === 0
        ? []
        : this.prisma.agentMessage.findMany({
            where: { threadId: { in: threadIds } },
            orderBy: { createdAt: "desc" },
            take: EXPORT_LIMIT,
          }),
      retrievalDocumentIds.length === 0
        ? []
        : this.prisma.retrievalChunk.findMany({
            where: { documentId: { in: retrievalDocumentIds } },
            orderBy: { createdAt: "desc" },
            take: EXPORT_LIMIT,
          }),
    ]);

    return {
      exportVersion: 1,
      exportedAt: new Date().toISOString(),
      retentionPolicy: this.getRetentionPolicy(),
      user,
      sessions,
      profile: {
        interests,
        topics,
        availabilityWindows,
      },
      intents: {
        created: intents,
        requestsSent,
        requestsReceived,
      },
      social: {
        connectionMemberships,
        chatMemberships,
        sentMessages,
      },
      notifications,
      moderation: {
        reportsFiled,
        reportsReceived,
        blocksCreated,
        blocksReceived,
      },
      personalization: {
        rules,
        preferences,
        explicitPreferences,
        inferredPreferences,
        retrievalDocuments,
        retrievalChunks,
      },
      agent: {
        threads: agentThreads,
        messages: agentMessages,
      },
      exportTruncation: {
        perCollectionLimit: EXPORT_LIMIT,
      },
    };
  }

  async deleteAllSentMessages(
    userId: string,
    input: { actorUserId?: string; reason?: string },
  ) {
    await this.ensureUserExists(userId);

    const result = await this.prisma.chatMessage.updateMany({
      where: { senderUserId: userId },
      data: { body: "[deleted]" },
    });

    await this.prisma.auditLog.create({
      data: {
        actorUserId: input.actorUserId ?? userId,
        actorType: "user",
        action: "privacy.messages_deleted",
        entityType: "user",
        entityId: userId,
        metadata: {
          updatedMessages: result.count,
          reason: input.reason ?? null,
        },
      },
    });

    return {
      userId,
      updatedMessages: result.count,
    };
  }

  async resetUserMemory(
    userId: string,
    input: {
      mode:
        | "learned_memory"
        | "all_personalization"
        | "domain_memory"
        | "surface_memory";
      actorUserId?: string;
      reason?: string;
      domains?: string[];
      surfaces?: Array<
        | "agent_chat"
        | "dm_chat"
        | "group_chat"
        | "workflow_event"
        | "system_event"
        | "profile_edit"
      >;
    },
  ) {
    await this.ensureUserExists(userId);

    return this.prisma.$transaction(async (tx) => {
      const retrievalDocuments = await tx.retrievalDocument.findMany({
        where: {
          userId,
          docType: { in: [...LEARNED_RETRIEVAL_DOC_TYPES] },
        },
        select: { id: true, content: true, docType: true },
      });
      const retrievalDocumentIds = this.filterResettableMemoryDocuments(
        retrievalDocuments,
        input,
      ).map((item) => item.id);

      const deleteLearnedStructures =
        input.mode === "learned_memory" || input.mode === "all_personalization";
      const inferredPreferences = deleteLearnedStructures
        ? await tx.inferredPreference.deleteMany({
            where: { userId },
          })
        : { count: 0 };
      const feedbackEvents = deleteLearnedStructures
        ? await tx.preferenceFeedbackEvent.deleteMany({
            where: { userId },
          })
        : { count: 0 };
      const lifeGraphEdges = deleteLearnedStructures
        ? await tx.lifeGraphEdge.deleteMany({
            where: { userId },
          })
        : { count: 0 };
      const lifeGraphNodes = deleteLearnedStructures
        ? await tx.lifeGraphNode.deleteMany({
            where: { userId },
          })
        : { count: 0 };
      const retrievalChunks =
        retrievalDocumentIds.length === 0
          ? { count: 0 }
          : await tx.retrievalChunk.deleteMany({
              where: { documentId: { in: retrievalDocumentIds } },
            });
      const retrievalDocs = await tx.retrievalDocument.deleteMany({
        where: {
          id: { in: retrievalDocumentIds },
        },
      });

      let explicitPreferences = { count: 0 };
      if (input.mode === "all_personalization") {
        explicitPreferences = await tx.explicitPreference.deleteMany({
          where: { userId },
        });
      }

      const embeddings = await tx.embedding.deleteMany({
        where: {
          OR: [
            { ownerId: userId },
            ...(retrievalDocumentIds.length > 0
              ? [{ ownerId: { in: retrievalDocumentIds } }]
              : []),
          ],
        },
      });

      await tx.auditLog.create({
        data: {
          actorUserId: input.actorUserId ?? userId,
          actorType: "user",
          action: "privacy.memory_reset",
          entityType: "user",
          entityId: userId,
          metadata: {
            mode: input.mode,
            reason: input.reason ?? null,
            domains: input.domains ?? [],
            surfaces: input.surfaces ?? [],
            deleted: {
              inferredPreferences: inferredPreferences.count,
              explicitPreferences: explicitPreferences.count,
              preferenceFeedbackEvents: feedbackEvents.count,
              lifeGraphEdges: lifeGraphEdges.count,
              lifeGraphNodes: lifeGraphNodes.count,
              retrievalDocuments: retrievalDocs.count,
              retrievalChunks: retrievalChunks.count,
              embeddings: embeddings.count,
            },
          },
        },
      });

      return {
        userId,
        mode: input.mode,
        deleted: {
          inferredPreferences: inferredPreferences.count,
          explicitPreferences: explicitPreferences.count,
          preferenceFeedbackEvents: feedbackEvents.count,
          lifeGraphEdges: lifeGraphEdges.count,
          lifeGraphNodes: lifeGraphNodes.count,
          retrievalDocuments: retrievalDocs.count,
          retrievalChunks: retrievalChunks.count,
          embeddings: embeddings.count,
        },
      };
    });
  }

  private filterResettableMemoryDocuments(
    documents: Array<{ id: string; content: string; docType: string }>,
    input: {
      mode:
        | "learned_memory"
        | "all_personalization"
        | "domain_memory"
        | "surface_memory";
      domains?: string[];
      surfaces?: string[];
    },
  ) {
    if (
      input.mode === "learned_memory" ||
      input.mode === "all_personalization"
    ) {
      return documents;
    }
    return documents.filter((document) => {
      const memory = this.readMemoryEnvelope(document);
      if (!memory) {
        return false;
      }
      if (input.mode === "domain_memory") {
        return (
          Array.isArray(input.domains) &&
          input.domains.length > 0 &&
          input.domains.includes(memory.class)
        );
      }
      if (input.mode === "surface_memory") {
        return (
          Array.isArray(input.surfaces) &&
          input.surfaces.length > 0 &&
          input.surfaces.includes(memory.sourceSurface)
        );
      }
      return false;
    });
  }

  private readMemoryEnvelope(document: { content: string; docType: string }) {
    const contextLine = document.content
      .split("\n")
      .find((line) => line.startsWith("context: "));
    if (!contextLine) {
      return null;
    }
    try {
      const parsed = JSON.parse(contextLine.slice("context: ".length).trim());
      const memory =
        parsed && typeof parsed.memory === "object" && parsed.memory
          ? (parsed.memory as Record<string, unknown>)
          : null;
      if (!memory) {
        return null;
      }
      return {
        class:
          typeof memory.class === "string" ? memory.class : document.docType,
        sourceSurface:
          memory.provenance &&
          typeof memory.provenance === "object" &&
          typeof (memory.provenance as Record<string, unknown>)
            .sourceSurface === "string"
            ? ((memory.provenance as Record<string, unknown>)
                .sourceSurface as string)
            : "system_event",
      };
    } catch {
      return null;
    }
  }

  async deleteAccount(
    userId: string,
    input: { actorUserId?: string; reason?: string },
  ) {
    const user = await this.ensureUserExists(userId);
    if (user.status === "deleted") {
      return {
        userId,
        alreadyDeleted: true,
      };
    }

    return this.prisma.$transaction(async (tx) => {
      const retrievalDocuments = await tx.retrievalDocument.findMany({
        where: { userId },
        select: { id: true },
      });
      const retrievalDocumentIds = retrievalDocuments.map((item) => item.id);

      const agentThreads = await tx.agentThread.findMany({
        where: { userId },
        select: { id: true },
      });
      const agentThreadIds = agentThreads.map((item) => item.id);

      const revokedSessions = await tx.userSession.updateMany({
        where: { userId, revokedAt: null },
        data: {
          status: "revoked",
          revokedAt: new Date(),
        },
      });
      const profileImages = await tx.userProfileImage.deleteMany({
        where: { userId },
      });
      const interests = await tx.userInterest.deleteMany({ where: { userId } });
      const topics = await tx.userTopic.deleteMany({ where: { userId } });
      const availabilityWindows = await tx.userAvailabilityWindow.deleteMany({
        where: { userId },
      });
      const rules = await tx.userRule.deleteMany({ where: { userId } });
      const preferences = await tx.userPreference.deleteMany({
        where: { userId },
      });
      const inferredPreferences = await tx.inferredPreference.deleteMany({
        where: { userId },
      });
      const explicitPreferences = await tx.explicitPreference.deleteMany({
        where: { userId },
      });
      const feedbackEvents = await tx.preferenceFeedbackEvent.deleteMany({
        where: { userId },
      });
      const lifeGraphEdges = await tx.lifeGraphEdge.deleteMany({
        where: { userId },
      });
      const lifeGraphNodes = await tx.lifeGraphNode.deleteMany({
        where: { userId },
      });
      const retrievalChunks =
        retrievalDocumentIds.length === 0
          ? { count: 0 }
          : await tx.retrievalChunk.deleteMany({
              where: { documentId: { in: retrievalDocumentIds } },
            });
      const retrievalDocs = await tx.retrievalDocument.deleteMany({
        where: { userId },
      });
      const embeddings = await tx.embedding.deleteMany({
        where: {
          OR: [
            { ownerId: userId },
            ...(retrievalDocumentIds.length > 0
              ? [{ ownerId: { in: retrievalDocumentIds } }]
              : []),
          ],
        },
      });
      const agentMessages = await tx.agentMessage.deleteMany({
        where: {
          OR: [
            { createdByUserId: userId },
            ...(agentThreadIds.length > 0
              ? [{ threadId: { in: agentThreadIds } }]
              : []),
          ],
        },
      });
      const deletedThreads = await tx.agentThread.deleteMany({
        where: { userId },
      });
      const messages = await tx.chatMessage.updateMany({
        where: { senderUserId: userId },
        data: { body: "[deleted]" },
      });
      const intents = await tx.intent.updateMany({
        where: {
          userId,
          status: {
            in: [
              IntentStatus.draft,
              IntentStatus.parsed,
              IntentStatus.matching,
              IntentStatus.fanout,
              IntentStatus.partial,
            ],
          },
        },
        data: { status: IntentStatus.cancelled },
      });
      const notifications = await tx.notification.deleteMany({
        where: { recipientUserId: userId },
      });
      const blocks = await tx.block.deleteMany({
        where: {
          OR: [{ blockerUserId: userId }, { blockedUserId: userId }],
        },
      });

      await tx.userProfile.updateMany({
        where: { userId },
        data: {
          bio: null,
          city: null,
          country: null,
          visibility: "private",
          onboardingState: "deleted",
          availabilityMode: "away",
          trustScore: 0,
          moderationState: "clean",
          lastActiveAt: null,
        },
      });
      await tx.user.update({
        where: { id: userId },
        data: {
          status: "deleted",
          email: null,
          googleSubjectId: null,
          username: null,
          displayName: this.buildDeletedDisplayName(userId),
        },
      });

      await tx.auditLog.create({
        data: {
          actorUserId: input.actorUserId ?? userId,
          actorType: "user",
          action: "privacy.account_deleted",
          entityType: "user",
          entityId: userId,
          metadata: {
            reason: input.reason ?? null,
            deleted: {
              sessionsRevoked: revokedSessions.count,
              profileImages: profileImages.count,
              interests: interests.count,
              topics: topics.count,
              availabilityWindows: availabilityWindows.count,
              rules: rules.count,
              preferences: preferences.count,
              inferredPreferences: inferredPreferences.count,
              explicitPreferences: explicitPreferences.count,
              preferenceFeedbackEvents: feedbackEvents.count,
              lifeGraphEdges: lifeGraphEdges.count,
              lifeGraphNodes: lifeGraphNodes.count,
              retrievalDocuments: retrievalDocs.count,
              retrievalChunks: retrievalChunks.count,
              embeddings: embeddings.count,
              agentMessages: agentMessages.count,
              agentThreads: deletedThreads.count,
              messagesUpdated: messages.count,
              intentsCancelled: intents.count,
              notifications: notifications.count,
              blocks: blocks.count,
            },
          },
        },
      });

      return {
        userId,
        alreadyDeleted: false,
        deleted: {
          sessionsRevoked: revokedSessions.count,
          profileImages: profileImages.count,
          interests: interests.count,
          topics: topics.count,
          availabilityWindows: availabilityWindows.count,
          rules: rules.count,
          preferences: preferences.count,
          inferredPreferences: inferredPreferences.count,
          explicitPreferences: explicitPreferences.count,
          preferenceFeedbackEvents: feedbackEvents.count,
          lifeGraphEdges: lifeGraphEdges.count,
          lifeGraphNodes: lifeGraphNodes.count,
          retrievalDocuments: retrievalDocs.count,
          retrievalChunks: retrievalChunks.count,
          embeddings: embeddings.count,
          agentMessages: agentMessages.count,
          agentThreads: deletedThreads.count,
          messagesUpdated: messages.count,
          intentsCancelled: intents.count,
          notifications: notifications.count,
          blocks: blocks.count,
        },
      };
    });
  }

  private async ensureUserExists(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, status: true },
    });
    if (!user) {
      throw new NotFoundException("User not found");
    }
    return user;
  }

  private readRetentionDays(name: string, fallback: number) {
    const value = Number(process.env[name]);
    if (!Number.isFinite(value) || value < 1) {
      return fallback;
    }
    return Math.trunc(value);
  }

  private buildDeletedDisplayName(userId: string) {
    return `Deleted User ${userId.slice(0, 8)}`;
  }
}
