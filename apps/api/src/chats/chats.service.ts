import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import { OpenAIClient } from "@opensocial/openai";
import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { AnalyticsService } from "../analytics/analytics.service.js";
import { PrismaService } from "../database/prisma.service.js";
import { LaunchControlsService } from "../launch-controls/launch-controls.service.js";

const MESSAGE_IDEMPOTENCY_TTL_MS = 60 * 60 * 1000;
const CHAT_SYNC_MAX_LIMIT = 200;
const CHAT_MESSAGE_BLOCKLIST = [
  "kill yourself",
  "i will kill you",
  "sexual assault",
  "terror attack",
  "bomb threat",
];
const CHAT_MESSAGE_REVIEWLIST = [
  "underage",
  "drug deal",
  "send nudes",
  "weapon meetup",
];

type ChatSystemMessageKind =
  | "system"
  | "join"
  | "leave"
  | "archive"
  | "moderation_hidden";

interface TextModerationResult {
  decision: "clean" | "review" | "blocked";
  matchedTerms: string[];
}

@Injectable()
export class ChatsService {
  private readonly logger = new Logger(ChatsService.name);
  private readonly openAIClient: OpenAIClient;
  private readonly openAIModerationEnabled: boolean;
  private readonly messageIdempotencyCache = new Map<
    string,
    { expiresAt: number; message: any }
  >();

  constructor(
    private readonly prisma: PrismaService,
    @Optional()
    private readonly analyticsService?: AnalyticsService,
    @Optional()
    private readonly launchControlsService?: LaunchControlsService,
  ) {
    this.openAIClient = new OpenAIClient({
      apiKey: process.env.OPENAI_API_KEY ?? "",
    });
    this.openAIModerationEnabled = this.readBooleanEnv(
      process.env.OPENAI_MODERATION_ENABLED,
      process.env.NODE_ENV !== "test",
    );
  }

  async createChat(
    connectionId: string,
    type: "dm" | "group",
    actorUserId?: string,
  ) {
    if (actorUserId && this.prisma.connectionParticipant?.findFirst) {
      const participant = await this.prisma.connectionParticipant.findFirst({
        where: {
          connectionId,
          userId: actorUserId,
          leftAt: null,
        },
        select: {
          id: true,
        },
      });
      if (!participant) {
        throw new ForbiddenException(
          "user is not an active participant in this connection",
        );
      }
    }
    return this.prisma.chat.create({ data: { connectionId, type } });
  }

  async createMessage(
    chatId: string,
    senderUserId: string,
    body: string,
    options?: {
      isSystem?: boolean;
      idempotencyKey?: string;
      moderationState?: "clean" | "flagged" | "blocked" | "review";
    },
  ) {
    this.pruneIdempotencyCache();
    const idempotencyCacheKey = options?.idempotencyKey
      ? this.buildIdempotencyCacheKey(
          chatId,
          senderUserId,
          options.idempotencyKey,
        )
      : null;
    if (idempotencyCacheKey) {
      const cached = this.messageIdempotencyCache.get(idempotencyCacheKey);
      if (cached && cached.expiresAt > Date.now()) {
        return cached.message;
      }
    }

    let messageBody = body;
    let moderationState = options?.moderationState;
    let pendingReviewTerms: string[] = [];

    if (!options?.isSystem) {
      await this.assertActiveParticipant(chatId, senderUserId);
      const strictModerationEnabled =
        await this.isModerationStrictnessEnabled();
      const moderation = await this.evaluateMessageModeration(
        body,
        strictModerationEnabled,
      );
      if (moderation.decision === "blocked") {
        await this.recordBlockedMessageModeration(
          chatId,
          senderUserId,
          moderation.matchedTerms,
        );
        throw new ForbiddenException("message blocked by moderation policy");
      }
      if (moderation.decision === "review") {
        messageBody = "[hidden by moderation]";
        moderationState = "review";
        pendingReviewTerms = moderation.matchedTerms;
      }

      const blocked = await this.isBlockedInChat(chatId, senderUserId);
      if (blocked) {
        throw new ForbiddenException("message sending is blocked in this chat");
      }
    }

    const message = await this.prisma.chatMessage.create({
      data: {
        chatId,
        senderUserId,
        body: messageBody,
        ...(moderationState ? { moderationState } : {}),
      },
    });

    if (!options?.isSystem && this.prisma.messageReceipt?.create) {
      await this.prisma.messageReceipt.create({
        data: {
          messageId: message.id,
          userId: senderUserId,
          deliveredAt: new Date(),
          readAt: new Date(),
        },
      });
    }
    if (!options?.isSystem) {
      await this.trackChatMessageAnalyticsSafe(
        chatId,
        senderUserId,
        message.id,
      );
    }

    if (!options?.isSystem && pendingReviewTerms.length > 0) {
      await this.recordPendingReviewMessageModeration(
        chatId,
        message.id,
        senderUserId,
        pendingReviewTerms,
      );
      await this.createSystemMessage(
        chatId,
        senderUserId,
        "moderation_hidden",
        "pending manual review",
        {
          idempotencyKey: `chat-message-review:${message.id}`,
        },
      );
    }

    if (idempotencyCacheKey) {
      this.messageIdempotencyCache.set(idempotencyCacheKey, {
        message,
        expiresAt: Date.now() + MESSAGE_IDEMPOTENCY_TTL_MS,
      });
    }

    return message;
  }

  async listMessages(
    chatId: string,
    limit = 50,
    before?: string,
    viewerUserId?: string,
  ) {
    if (viewerUserId) {
      await this.assertActiveParticipant(chatId, viewerUserId);
    }
    const messages = await this.prisma.chatMessage.findMany({
      where: {
        chatId,
        ...(before ? { createdAt: { lt: new Date(before) } } : {}),
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: Math.min(Math.max(limit, 1), 100),
    });

    const uniqueMessages = this.dedupeMessages(messages);
    const statusByMessageId = await this.buildMessageStatusMap(
      chatId,
      uniqueMessages.map((message) => message.id),
    );

    return uniqueMessages.map((message) => ({
      ...message,
      status: statusByMessageId.get(message.id) ?? {
        state: "sent",
        deliveredCount: 0,
        readCount: 0,
        pendingCount: 0,
      },
    }));
  }

  async getChatMetadata(chatId: string, viewerUserId?: string) {
    if (viewerUserId) {
      await this.assertActiveParticipant(chatId, viewerUserId);
    }
    if (!this.prisma.chat?.findUnique) {
      throw new NotFoundException("chat not found");
    }

    const chat = await this.prisma.chat.findUnique({
      where: { id: chatId },
      select: {
        id: true,
        type: true,
        connectionId: true,
        createdAt: true,
        connection: {
          select: {
            id: true,
            type: true,
            status: true,
            createdByUserId: true,
            participants: {
              where: { leftAt: null },
              select: {
                userId: true,
                role: true,
                joinedAt: true,
              },
              orderBy: [{ role: "asc" }, { joinedAt: "asc" }],
            },
          },
        },
      },
    });
    if (!chat) {
      throw new NotFoundException("chat not found");
    }

    const participants = chat.connection.participants.map((participant) => ({
      userId: participant.userId,
      role: participant.role,
      joinedAt: participant.joinedAt,
    }));

    return {
      chatId: chat.id,
      type: chat.type,
      connectionId: chat.connectionId,
      createdAt: chat.createdAt,
      connectionType: chat.connection.type,
      connectionStatus: chat.connection.status,
      ownerUserId: chat.connection.createdByUserId,
      participantCount: participants.length,
      participants,
      archived: chat.connection.status === "archived",
    };
  }

  async leaveChat(chatId: string, userId: string) {
    if (
      !this.prisma.chat?.findUnique ||
      !this.prisma.connectionParticipant?.updateMany ||
      !this.prisma.connectionParticipant?.count ||
      !this.prisma.connection?.update
    ) {
      throw new NotFoundException("chat not found");
    }

    const chat = await this.prisma.chat.findUnique({
      where: { id: chatId },
      select: {
        id: true,
        connectionId: true,
        connection: {
          select: {
            type: true,
            status: true,
          },
        },
      },
    });
    if (!chat) {
      throw new NotFoundException("chat not found");
    }

    const result = await this.prisma.connectionParticipant.updateMany({
      where: {
        connectionId: chat.connectionId,
        userId,
        leftAt: null,
      },
      data: {
        leftAt: new Date(),
      },
    });

    if (result.count === 0) {
      return {
        status: "already_left",
        archived: chat.connection.status === "archived",
      } as const;
    }

    await this.createSystemMessage(chatId, userId, "leave", undefined, {
      idempotencyKey: `chat-membership-leave:${chatId}:${userId}`,
    });
    await this.writeAuditRecord(
      "chat.membership_left",
      "chat",
      chatId,
      userId,
      {
        chatId,
        userId,
      },
    );

    const activeParticipantCount =
      await this.prisma.connectionParticipant.count({
        where: {
          connectionId: chat.connectionId,
          leftAt: null,
        },
      });
    const shouldArchive =
      chat.connection.type === "group"
        ? activeParticipantCount < 2
        : activeParticipantCount === 0;
    if (shouldArchive && chat.connection.status !== "archived") {
      await this.prisma.connection.update({
        where: { id: chat.connectionId },
        data: { status: "archived" },
      });

      await this.createSystemMessage(chatId, userId, "archive", undefined, {
        idempotencyKey: `chat-archive:${chatId}`,
      });
      await this.writeAuditRecord("chat.archived", "chat", chatId, userId, {
        chatId,
        reason: "participant_threshold",
        activeParticipantCount,
      });
    }

    return {
      status: shouldArchive ? "archived" : "left",
      archived: shouldArchive,
      participantCount: activeParticipantCount,
    } as const;
  }

  async hideMessageForModeration(
    chatId: string,
    messageId: string,
    moderatorUserId: string,
    reason?: string,
  ) {
    if (
      !this.prisma.chatMessage?.findFirst ||
      !this.prisma.chatMessage?.update
    ) {
      throw new NotFoundException("message not found");
    }

    const message = await this.prisma.chatMessage.findFirst({
      where: {
        id: messageId,
        chatId,
      },
      select: {
        id: true,
        body: true,
      },
    });
    if (!message) {
      throw new NotFoundException("message not found");
    }

    const hiddenBody = "[hidden by moderation]";
    const hiddenMessage =
      message.body === hiddenBody
        ? message
        : await this.prisma.chatMessage.update({
            where: { id: message.id },
            data: {
              body: hiddenBody,
              moderationState: "blocked",
            },
          });

    await this.writeAuditRecord(
      "chat.message_hidden",
      "chat_message",
      messageId,
      moderatorUserId,
      {
        chatId,
        reason: reason ?? null,
      },
    );
    await this.createSystemMessage(
      chatId,
      moderatorUserId,
      "moderation_hidden",
      reason,
      {
        idempotencyKey: `chat-message-hidden:${chatId}:${messageId}`,
      },
    );

    return hiddenMessage;
  }

  async listMessagesForSync(
    chatId: string,
    userId: string,
    limit = 100,
    after?: string,
  ) {
    await this.assertActiveParticipant(chatId, userId);

    const cappedLimit = Math.min(Math.max(limit, 1), CHAT_SYNC_MAX_LIMIT);
    const messages = await this.prisma.chatMessage.findMany({
      where: {
        chatId,
        ...(after ? { createdAt: { gt: new Date(after) } } : {}),
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: cappedLimit,
    });
    const uniqueMessages = this.dedupeMessages(messages);
    const statusByMessageId = await this.buildMessageStatusMap(
      chatId,
      uniqueMessages.map((message) => message.id),
    );

    const unreadCount = this.prisma.chatMessage?.count
      ? await this.prisma.chatMessage.count({
          where: {
            chatId,
            senderUserId: {
              not: userId,
            },
            receipts: {
              none: {
                userId,
                readAt: { not: null },
              },
            },
          },
        })
      : 0;

    return {
      messages: uniqueMessages.map((message) => ({
        ...message,
        status: statusByMessageId.get(message.id) ?? {
          state: "sent",
          deliveredCount: 0,
          readCount: 0,
          pendingCount: 0,
        },
      })),
      unreadCount,
      highWatermark:
        uniqueMessages.at(-1)?.createdAt.toISOString() ?? after ?? null,
      hasMore: uniqueMessages.length >= cappedLimit,
      deduped: uniqueMessages.length !== messages.length,
    };
  }

  async markReadReceipt(chatId: string, messageId: string, userId: string) {
    await this.assertActiveParticipant(chatId, userId);
    const message = await this.prisma.chatMessage.findFirst({
      where: { id: messageId, chatId },
    });
    if (!message) {
      throw new NotFoundException("message not found");
    }

    const existing = await this.prisma.messageReceipt.findFirst({
      where: { messageId, userId },
    });
    if (existing) {
      return this.prisma.messageReceipt.update({
        where: { id: existing.id },
        data: {
          deliveredAt: existing.deliveredAt ?? new Date(),
          readAt: new Date(),
        },
      });
    }

    return this.prisma.messageReceipt.create({
      data: {
        messageId,
        userId,
        deliveredAt: new Date(),
        readAt: new Date(),
      },
    });
  }

  async softDeleteMessage(chatId: string, messageId: string, userId: string) {
    await this.assertActiveParticipant(chatId, userId);
    const message = await this.prisma.chatMessage.findFirst({
      where: { id: messageId, chatId },
      select: {
        id: true,
        senderUserId: true,
      },
    });
    if (!message) {
      throw new NotFoundException("message not found");
    }
    if (message.senderUserId !== userId) {
      throw new ForbiddenException("message cannot be deleted by this user");
    }

    return this.prisma.chatMessage.update({
      where: { id: message.id },
      data: {
        body: "[deleted]",
      },
    });
  }

  createSystemMessage(
    chatId: string,
    actorUserId: string,
    kind: ChatSystemMessageKind,
    details?: string,
    options?: { idempotencyKey?: string },
  ) {
    const body = this.buildSystemMessageBody(kind, actorUserId, details);
    return this.createMessage(chatId, actorUserId, body, {
      isSystem: true,
      moderationState: kind === "moderation_hidden" ? "review" : "clean",
      idempotencyKey:
        options?.idempotencyKey ??
        `chat-system:${kind}:${chatId}:${actorUserId}:${body}`,
    });
  }

  async assertChatParticipant(chatId: string, userId: string) {
    await this.assertActiveParticipant(chatId, userId);
  }

  async assertMessageExistsForSender(
    chatId: string,
    messageId: string,
    senderUserId: string,
  ) {
    if (!this.prisma.chatMessage?.findFirst) {
      return;
    }
    const message = await this.prisma.chatMessage.findFirst({
      where: {
        id: messageId,
        chatId,
        senderUserId,
      },
      select: {
        id: true,
      },
    });
    if (!message) {
      throw new NotFoundException("message not found");
    }
  }

  private async assertActiveParticipant(chatId: string, userId: string) {
    if (!this.prisma.chat?.findUnique) {
      return;
    }
    const chat = await this.prisma.chat.findUnique({
      where: { id: chatId },
      select: { connectionId: true },
    });
    if (!chat) {
      throw new NotFoundException("chat not found");
    }
    if (!this.prisma.connectionParticipant?.findFirst) {
      return;
    }

    const participant = await this.prisma.connectionParticipant.findFirst({
      where: {
        connectionId: chat.connectionId,
        userId,
        leftAt: null,
      },
      select: {
        id: true,
      },
    });
    if (!participant) {
      throw new ForbiddenException(
        "user is not an active participant in this chat",
      );
    }
  }

  private dedupeMessages<
    TMessage extends {
      id: string;
    },
  >(messages: TMessage[]) {
    const dedupedMessages = new Map<string, TMessage>();
    for (const message of messages) {
      if (!dedupedMessages.has(message.id)) {
        dedupedMessages.set(message.id, message);
      }
    }
    return Array.from(dedupedMessages.values());
  }

  private async buildMessageStatusMap(chatId: string, messageIds: string[]) {
    if (
      messageIds.length === 0 ||
      !this.prisma.messageReceipt?.findMany ||
      !this.prisma.chat?.findUnique ||
      !this.prisma.connectionParticipant?.count
    ) {
      return new Map<
        string,
        {
          state: "sent" | "delivered" | "read";
          deliveredCount: number;
          readCount: number;
          pendingCount: number;
        }
      >();
    }

    const [receipts, chat] = await Promise.all([
      this.prisma.messageReceipt.findMany({
        where: {
          messageId: { in: messageIds },
        },
        select: {
          messageId: true,
          deliveredAt: true,
          readAt: true,
        },
      }),
      this.prisma.chat.findUnique({
        where: { id: chatId },
        select: { connectionId: true },
      }),
    ]);
    if (!chat) {
      return new Map();
    }

    const activeParticipantCount =
      await this.prisma.connectionParticipant.count({
        where: {
          connectionId: chat.connectionId,
          leftAt: null,
        },
      });

    const byMessage = new Map<
      string,
      {
        deliveredCount: number;
        readCount: number;
      }
    >();
    for (const receipt of receipts) {
      const current = byMessage.get(receipt.messageId) ?? {
        deliveredCount: 0,
        readCount: 0,
      };
      if (receipt.deliveredAt) {
        current.deliveredCount += 1;
      }
      if (receipt.readAt) {
        current.readCount += 1;
      }
      byMessage.set(receipt.messageId, current);
    }

    const statuses = new Map<
      string,
      {
        state: "sent" | "delivered" | "read";
        deliveredCount: number;
        readCount: number;
        pendingCount: number;
      }
    >();
    for (const messageId of messageIds) {
      const counts = byMessage.get(messageId) ?? {
        deliveredCount: 0,
        readCount: 0,
      };
      const pendingCount = Math.max(
        0,
        Math.max(activeParticipantCount - 1, 0) - counts.deliveredCount,
      );
      const state =
        counts.readCount > 0
          ? "read"
          : counts.deliveredCount > 0
            ? "delivered"
            : "sent";
      statuses.set(messageId, {
        state,
        deliveredCount: counts.deliveredCount,
        readCount: counts.readCount,
        pendingCount,
      });
    }

    return statuses;
  }

  private buildIdempotencyCacheKey(
    chatId: string,
    senderUserId: string,
    idempotencyKey: string,
  ) {
    return `${chatId}:${senderUserId}:${idempotencyKey}`;
  }

  private pruneIdempotencyCache() {
    const now = Date.now();
    for (const [cacheKey, value] of this.messageIdempotencyCache.entries()) {
      if (value.expiresAt <= now) {
        this.messageIdempotencyCache.delete(cacheKey);
      }
    }
  }

  private buildSystemMessageBody(
    kind: ChatSystemMessageKind,
    actorUserId: string,
    details?: string,
  ) {
    switch (kind) {
      case "join":
        return `System: ${actorUserId} joined the chat.`;
      case "leave":
        return `System: ${actorUserId} left the chat.`;
      case "archive":
        return "System: Chat archived because active participants dropped below minimum.";
      case "moderation_hidden":
        return details
          ? `System: A message was hidden by moderation (${details}).`
          : "System: A message was hidden by moderation.";
      case "system":
      default:
        return details ? `System: ${details}` : "System: Chat updated.";
    }
  }

  private evaluateTextModeration(
    text: string,
    strictModerationEnabled = false,
  ): TextModerationResult {
    const normalized = text.toLowerCase();
    const blockedTerms = CHAT_MESSAGE_BLOCKLIST.filter((term) =>
      normalized.includes(term),
    );
    if (blockedTerms.length > 0) {
      return {
        decision: "blocked",
        matchedTerms: blockedTerms,
      };
    }

    const reviewTerms = CHAT_MESSAGE_REVIEWLIST.filter((term) =>
      normalized.includes(term),
    );
    if (reviewTerms.length > 0) {
      if (strictModerationEnabled) {
        return {
          decision: "blocked",
          matchedTerms: reviewTerms,
        };
      }
      return {
        decision: "review",
        matchedTerms: reviewTerms,
      };
    }

    return {
      decision: "clean",
      matchedTerms: [],
    };
  }

  private async evaluateMessageModeration(
    text: string,
    strictModerationEnabled = false,
  ): Promise<TextModerationResult> {
    const deterministic = this.evaluateTextModeration(text, false);
    if (!this.shouldUseOpenAIModeration()) {
      if (strictModerationEnabled && deterministic.decision === "review") {
        return {
          decision: "blocked",
          matchedTerms: deterministic.matchedTerms,
        };
      }
      return deterministic;
    }

    try {
      const assisted = await this.openAIClient.assistModeration(
        {
          content: text,
          context: "chat_message",
        },
        randomUUID(),
      );
      const normalizedReason = this.normalizeReasonToken(assisted.reason);
      const matchedTerms = Array.from(
        new Set([
          ...deterministic.matchedTerms,
          ...(assisted.decision !== "clean"
            ? [`openai_decision:${assisted.decision}`]
            : []),
          ...(normalizedReason ? [`openai_reason:${normalizedReason}`] : []),
        ]),
      );
      const blocked =
        deterministic.decision === "blocked" || assisted.decision === "blocked";
      const review =
        deterministic.decision === "review" || assisted.decision === "review";
      if (blocked) {
        return {
          decision: "blocked",
          matchedTerms:
            matchedTerms.length > 0
              ? matchedTerms
              : ["risk_assessment_blocked"],
        };
      }
      if (review) {
        if (strictModerationEnabled) {
          return {
            decision: "blocked",
            matchedTerms:
              matchedTerms.length > 0
                ? matchedTerms
                : ["risk_assessment_review"],
          };
        }
        return {
          decision: "review",
          matchedTerms:
            matchedTerms.length > 0 ? matchedTerms : ["risk_assessment_review"],
        };
      }
      return {
        decision: "clean",
        matchedTerms: [],
      };
    } catch (error) {
      this.logger.warn(
        `chat OpenAI moderation failed; using deterministic fallback: ${String(error)}`,
      );
      if (strictModerationEnabled && deterministic.decision === "review") {
        return {
          decision: "blocked",
          matchedTerms: deterministic.matchedTerms,
        };
      }
      return deterministic;
    }
  }

  private shouldUseOpenAIModeration() {
    if (!this.openAIModerationEnabled) {
      return false;
    }
    return Boolean(process.env.OPENAI_API_KEY);
  }

  private normalizeReasonToken(value?: string) {
    if (!value) {
      return null;
    }
    const normalized = value
      .toLowerCase()
      .replace(/[^a-z0-9:_\-\s]/g, "")
      .trim()
      .replace(/\s+/g, "_")
      .slice(0, 100);
    return normalized.length > 0 ? normalized : null;
  }

  private readBooleanEnv(rawValue: string | undefined, fallback: boolean) {
    if (!rawValue) {
      return fallback;
    }
    const normalized = rawValue.toLowerCase().trim();
    if (["1", "true", "yes", "on"].includes(normalized)) {
      return true;
    }
    if (["0", "false", "no", "off"].includes(normalized)) {
      return false;
    }
    return fallback;
  }

  private async isModerationStrictnessEnabled() {
    if (!this.launchControlsService) {
      return false;
    }
    const snapshot = await this.launchControlsService.getSnapshot();
    return !snapshot.globalKillSwitch && snapshot.enableModerationStrictness;
  }

  private async recordBlockedMessageModeration(
    chatId: string,
    senderUserId: string,
    matchedTerms: string[],
  ) {
    if (this.prisma.moderationFlag?.create) {
      await this.prisma.moderationFlag.create({
        data: {
          entityType: "chat",
          entityId: chatId,
          reason: `chat_message_blocked:${matchedTerms.join(",")}`,
          status: "open",
        },
      });
    }
    await this.writeAuditRecord(
      "chat.message_blocked",
      "chat",
      chatId,
      senderUserId,
      {
        chatId,
        matchedTerms,
      },
    );
  }

  private async recordPendingReviewMessageModeration(
    chatId: string,
    messageId: string,
    senderUserId: string,
    matchedTerms: string[],
  ) {
    if (this.prisma.moderationFlag?.create) {
      await this.prisma.moderationFlag.create({
        data: {
          entityType: "chat_message",
          entityId: messageId,
          reason: `chat_message_review:${matchedTerms.join(",")}`,
          status: "open",
        },
      });
    }
    await this.writeAuditRecord(
      "chat.message_reviewed",
      "chat_message",
      messageId,
      senderUserId,
      {
        chatId,
        matchedTerms,
      },
    );
  }

  private async writeAuditRecord(
    action: string,
    entityType: string,
    entityId: string,
    actorUserId: string,
    metadata: Record<string, unknown>,
  ) {
    if (!this.prisma.auditLog?.create) {
      return;
    }
    try {
      await this.prisma.auditLog.create({
        data: {
          actorUserId,
          actorType: "user",
          action,
          entityType,
          entityId,
          metadata: metadata as Prisma.InputJsonValue,
        },
      });
    } catch (error) {
      this.logger.warn(`failed to persist chat audit record: ${String(error)}`);
    }
  }

  private async isBlockedInChat(chatId: string, senderUserId: string) {
    if (
      !this.prisma.chat?.findUnique ||
      !this.prisma.connectionParticipant?.findMany ||
      !this.prisma.block?.findMany
    ) {
      return false;
    }

    const chat = await this.prisma.chat.findUnique({
      where: { id: chatId },
      select: {
        connectionId: true,
      },
    });
    if (!chat) {
      throw new NotFoundException("chat not found");
    }

    const participants = await this.prisma.connectionParticipant.findMany({
      where: {
        connectionId: chat.connectionId,
        leftAt: null,
      },
      select: {
        userId: true,
      },
    });
    const otherUserIds = participants
      .map((participant) => participant.userId)
      .filter((userId) => userId !== senderUserId);
    if (otherUserIds.length === 0) {
      return false;
    }

    const blocks = await this.prisma.block.findMany({
      where: {
        OR: [
          {
            blockerUserId: senderUserId,
            blockedUserId: { in: otherUserIds },
          },
          {
            blockerUserId: { in: otherUserIds },
            blockedUserId: senderUserId,
          },
        ],
      },
      select: {
        id: true,
      },
      take: 1,
    });
    return blocks.length > 0;
  }

  private async trackChatMessageAnalyticsSafe(
    chatId: string,
    senderUserId: string,
    messageId: string,
  ) {
    let eventType = "message_replied";
    if (this.prisma.messageReceipt?.count) {
      try {
        const userMessageCount = await this.prisma.messageReceipt.count({
          where: {
            message: {
              chatId,
            },
          },
        });
        if (userMessageCount <= 1) {
          eventType = "first_message_sent";
        }
      } catch (error) {
        this.logger.warn(
          `failed to compute first-message metric for chat ${chatId}: ${String(error)}`,
        );
      }
    }

    await this.trackAnalyticsEventSafe({
      eventType,
      actorUserId: senderUserId,
      entityType: "chat_message",
      entityId: messageId,
      properties: {
        chatId,
      },
    });
  }

  private async trackAnalyticsEventSafe(input: {
    eventType: string;
    actorUserId?: string;
    entityType?: string;
    entityId?: string;
    properties?: Record<string, unknown>;
  }) {
    if (!this.analyticsService) {
      return;
    }
    try {
      await this.analyticsService.trackEvent(input);
    } catch (error) {
      this.logger.warn(
        `failed to record analytics event ${input.eventType}: ${String(error)}`,
      );
    }
  }
}
