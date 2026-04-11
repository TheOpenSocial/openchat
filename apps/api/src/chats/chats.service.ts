import { InjectQueue } from "@nestjs/bullmq";
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import { OpenAIClient } from "@opensocial/openai";
import { Prisma } from "@prisma/client";
import { formatChatReplyBody, parseChatMessageBody } from "@opensocial/types";
import { Queue } from "bullmq";
import { randomUUID } from "node:crypto";
import { AnalyticsService } from "../analytics/analytics.service.js";
import { PrismaService } from "../database/prisma.service.js";
import { LaunchControlsService } from "../launch-controls/launch-controls.service.js";
import { ModerationService } from "../moderation/moderation.service.js";
import { PersonalizationService } from "../personalization/personalization.service.js";
import { RealtimeEventsService } from "../realtime/realtime-events.service.js";
import { PresenceService } from "../realtime/presence.service.js";

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
const MUTE_USER_IDS_PREFERENCE_KEY = "global_rules_muted_user_ids";

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

type StructuredMemoryCandidate = {
  class:
    | "stable_preference"
    | "profile_memory"
    | "relationship_history"
    | "safety_memory"
    | "commerce_memory";
  governanceTier: "explicit_only" | "inferable";
  key: string;
  value: string;
  confidence: number;
  contradictionPolicy:
    | "keep_latest"
    | "append_conflict_note"
    | "suppress_conflict";
  summary: string;
};

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
    @InjectQueue("moderation")
    private readonly moderationQueue?: Queue,
    @Optional()
    private readonly analyticsService?: AnalyticsService,
    @Optional()
    private readonly launchControlsService?: LaunchControlsService,
    @Optional()
    private readonly moderationService?: ModerationService,
    @Optional()
    private readonly personalizationService?: PersonalizationService,
    @Optional()
    private readonly realtimeEventsService?: RealtimeEventsService,
    @Optional()
    private readonly presenceService?: PresenceService,
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
      replyToMessageId?: string;
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

    const parsedBody = parseChatMessageBody(body);
    let messageBody = parsedBody.body;
    let moderationState = options?.moderationState;
    let pendingReviewTerms: string[] = [];
    const replyToMessageId =
      options?.replyToMessageId ?? parsedBody.reply?.messageId ?? null;

    if (!options?.isSystem) {
      await this.assertActiveParticipant(chatId, senderUserId);
      if (replyToMessageId) {
        if (!this.prisma.chatMessage?.findFirst) {
          throw new NotFoundException("reply target not found");
        }
        const replyTarget = await this.prisma.chatMessage.findFirst({
          where: {
            id: replyToMessageId,
            chatId,
          },
          select: {
            id: true,
          },
        });
        if (!replyTarget) {
          throw new NotFoundException("reply target not found");
        }
      }
      const strictModerationEnabled =
        await this.isModerationStrictnessEnabled();
      const moderationSurfaceEnabled =
        await this.isMessageModerationSurfaceEnabled();
      const prefilterModeration = this.evaluateTextModeration(
        messageBody,
        false,
      );
      if (prefilterModeration.decision === "blocked") {
        await this.recordBlockedMessageModeration(
          chatId,
          senderUserId,
          prefilterModeration.matchedTerms,
        );
        throw new ForbiddenException("message blocked by moderation policy");
      }
      if (moderationSurfaceEnabled && strictModerationEnabled) {
        moderationState = "review";
      } else {
        const moderation = await this.evaluateMessageModeration(
          messageBody,
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
      }

      const blocked = await this.isBlockedInChat(chatId, senderUserId);
      if (blocked) {
        throw new ForbiddenException("message sending is blocked in this chat");
      }
      const mutedOrReported = await this.isMutedOrReportedInChat(
        chatId,
        senderUserId,
      );
      if (mutedOrReported) {
        throw new ForbiddenException(
          "message sending is suppressed in this chat",
        );
      }
    }

    const message = await this.prisma.chatMessage.create({
      data: {
        chatId,
        senderUserId,
        body: messageBody,
        ...(replyToMessageId ? { replyToMessageId } : {}),
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
      if (
        (await this.isModerationStrictnessEnabled()) &&
        (await this.isMessageModerationSurfaceEnabled())
      ) {
        await this.enqueueMessageModeration(
          message.id,
          chatId,
          senderUserId,
          body,
        );
      } else {
        await this.deliverMessageToRecipients(chatId, message.id, senderUserId);
      }
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

    if (!options?.isSystem) {
      await this.ingestMessageMemorySafe({
        chatId,
        senderUserId,
        messageId: message.id,
        body: messageBody,
        moderationState:
          moderationState === "review"
            ? "review"
            : moderationState === "blocked"
              ? "blocked"
              : "clean",
        moderationReasonTokens: pendingReviewTerms,
      });
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
    const reactionsByMessageId = await this.buildMessageReactionMap(
      uniqueMessages.map((message) => message.id),
    );

    const visibleMessages = uniqueMessages.filter((message) =>
      this.isMessageVisibleToViewer(message, viewerUserId),
    );

    return visibleMessages.map((message) => ({
      ...message,
      reactions: reactionsByMessageId.get(message.id) ?? [],
      status: statusByMessageId.get(message.id) ?? {
        state: "sent",
        deliveredCount: 0,
        readCount: 0,
        pendingCount: 0,
      },
    }));
  }

  async listThreads(chatId: string, viewerUserId?: string) {
    if (viewerUserId) {
      await this.assertActiveParticipant(chatId, viewerUserId);
    }
    if (!this.prisma.chatMessage?.findMany) {
      throw new NotFoundException("chat not found");
    }

    const messages = await this.prisma.chatMessage.findMany({
      where: {
        chatId,
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    const uniqueMessages = this.dedupeMessages(messages);
    const visibleMessages = uniqueMessages.filter((message) =>
      this.isMessageVisibleToViewer(message, viewerUserId),
    );
    if (visibleMessages.length === 0) {
      return {
        chatId,
        threads: [],
      };
    }

    const parentByMessageId = new Map(
      uniqueMessages.map((message) => [
        message.id,
        message.replyToMessageId ?? null,
      ]),
    );
    const rootIdByMessageId = new Map<string, string>();
    for (const message of uniqueMessages) {
      rootIdByMessageId.set(
        message.id,
        this.resolveThreadRootMessageId(message.id, parentByMessageId),
      );
    }

    const hydratedMessages = await this.hydrateMessagesForThreadResponse(
      chatId,
      visibleMessages,
    );
    const hydratedById = new Map(
      hydratedMessages.map((message) => [message.id, message] as const),
    );
    const threadsByRootId = new Map<
      string,
      {
        rootMessage: (typeof hydratedMessages)[number];
        messages: (typeof hydratedMessages)[number][];
      }
    >();

    for (const message of hydratedMessages) {
      const rootId = rootIdByMessageId.get(message.id);
      if (!rootId) {
        continue;
      }
      const rootMessage = hydratedById.get(rootId);
      if (!rootMessage) {
        continue;
      }
      const existing = threadsByRootId.get(rootId);
      if (existing) {
        if (
          !existing.messages.some(
            (threadMessage) => threadMessage.id === message.id,
          )
        ) {
          existing.messages.push(message);
        }
        continue;
      }
      threadsByRootId.set(rootId, {
        rootMessage,
        messages: [rootMessage, ...(message.id === rootId ? [] : [message])],
      });
    }

    const threads = Array.from(threadsByRootId.values())
      .map((thread) =>
        this.buildThreadSummary(thread.rootMessage, thread.messages),
      )
      .filter((thread) => thread.replyCount > 0)
      .sort((left, right) => {
        if (left.lastActivityAt === right.lastActivityAt) {
          return (
            right.rootMessage.createdAt.getTime() -
            left.rootMessage.createdAt.getTime()
          );
        }
        return right.lastActivityAt.localeCompare(left.lastActivityAt);
      });

    return {
      chatId,
      threads,
    };
  }

  async getThread(
    chatId: string,
    rootMessageId: string,
    viewerUserId?: string,
  ) {
    if (viewerUserId) {
      await this.assertActiveParticipant(chatId, viewerUserId);
    }
    if (!this.prisma.chatMessage?.findMany) {
      throw new NotFoundException("thread not found");
    }

    const messages = await this.prisma.chatMessage.findMany({
      where: {
        chatId,
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    const uniqueMessages = this.dedupeMessages(messages);
    const targetMessage = uniqueMessages.find(
      (message) => message.id === rootMessageId,
    );
    if (!targetMessage) {
      throw new NotFoundException("thread not found");
    }

    const parentByMessageId = new Map(
      uniqueMessages.map((message) => [
        message.id,
        message.replyToMessageId ?? null,
      ]),
    );
    const resolvedRootMessageId = this.resolveThreadRootMessageId(
      targetMessage.id,
      parentByMessageId,
    );
    const rootMessage = uniqueMessages.find(
      (message) => message.id === resolvedRootMessageId,
    );
    if (!rootMessage) {
      throw new NotFoundException("thread not found");
    }

    const visibleMessages = uniqueMessages.filter((message) =>
      this.isMessageVisibleToViewer(message, viewerUserId),
    );
    const visibleRootMessage = visibleMessages.find(
      (message) => message.id === rootMessage.id,
    );
    if (!visibleRootMessage) {
      throw new NotFoundException("thread not found");
    }

    const threadMessages = visibleMessages.filter(
      (message) =>
        this.resolveThreadRootMessageId(message.id, parentByMessageId) ===
        rootMessage.id,
    );
    const hydratedMessages = await this.hydrateMessagesForThreadResponse(
      chatId,
      threadMessages,
    );
    const hydratedRootMessage = hydratedMessages.find(
      (message) => message.id === rootMessage.id,
    );
    if (!hydratedRootMessage) {
      throw new NotFoundException("thread not found");
    }

    const thread = this.buildThreadSummary(
      hydratedRootMessage,
      hydratedMessages,
    );
    const entries = this.buildThreadEntries(
      hydratedMessages,
      hydratedRootMessage.id,
    );

    return {
      chatId,
      thread,
      entries,
    };
  }

  private async ingestMessageMemorySafe(input: {
    chatId: string;
    senderUserId: string;
    messageId: string;
    body: string;
    moderationState: "clean" | "review" | "blocked";
    moderationReasonTokens: string[];
  }) {
    if (!this.personalizationService) {
      return;
    }

    const chat = await this.prisma.chat.findUnique({
      where: { id: input.chatId },
      select: {
        id: true,
        type: true,
        connectionId: true,
      },
    });
    if (!chat) {
      return;
    }

    const participants = this.prisma.connectionParticipant?.findMany
      ? await this.prisma.connectionParticipant.findMany({
          where: {
            connectionId: chat.connectionId,
            leftAt: null,
          },
          select: {
            userId: true,
          },
        })
      : [];
    const actorUserIds = Array.from(
      new Set(
        [
          input.senderUserId,
          ...participants.map((participant) => participant.userId),
        ].filter(Boolean),
      ),
    );

    const summary = this.buildMemorySummaryFromMessage(input.body);
    if (!summary) {
      return;
    }

    const extractedMemories = this.extractStructuredMemoriesFromMessage(
      input.body,
    );

    try {
      await this.personalizationService.storeInteractionSummary(
        input.senderUserId,
        {
          summary,
          safe: input.moderationState === "clean",
          context: {
            source: "chat_message",
            sourceSurface: chat.type === "group" ? "group_chat" : "dm_chat",
            sourceEntityId: chat.id,
            messageId: input.messageId,
            chatId: chat.id,
            actorUserIds,
            moderationDecision: input.moderationState,
            moderationReasonTokens: input.moderationReasonTokens,
          },
          memory: {
            class: "interaction_summary",
            governanceTier: "inferable",
            confidence: 0.45,
            moderation: {
              decision: input.moderationState,
              reasonTokens: input.moderationReasonTokens,
            },
            provenance: {
              sourceType: "interaction_observation",
              sourceSurface: chat.type === "group" ? "group_chat" : "dm_chat",
              messageId: input.messageId,
              chatId: chat.id,
              sourceEntityId: chat.id,
              actorUserIds,
            },
          },
        },
      );

      for (const extractedMemory of extractedMemories.slice(0, 3)) {
        await this.personalizationService.storeInteractionSummary(
          input.senderUserId,
          {
            summary: extractedMemory.summary,
            safe: input.moderationState === "clean",
            context: {
              source: "chat_message",
              sourceSurface: chat.type === "group" ? "group_chat" : "dm_chat",
              sourceEntityId: chat.id,
              messageId: input.messageId,
              chatId: chat.id,
              actorUserIds,
              moderationDecision: input.moderationState,
              moderationReasonTokens: input.moderationReasonTokens,
              sourceText: input.body.slice(0, 500),
            },
            memory: {
              class: extractedMemory.class,
              governanceTier: extractedMemory.governanceTier,
              key: extractedMemory.key,
              value: extractedMemory.value,
              confidence: extractedMemory.confidence,
              safeWritePolicy: "strict",
              contradictionPolicy: extractedMemory.contradictionPolicy,
              consent: {
                basis: "explicit_user_message",
                explicit: true,
                sourceText: input.body.slice(0, 500),
              },
              moderation: {
                decision: input.moderationState,
                reasonTokens: input.moderationReasonTokens,
              },
              provenance: {
                sourceType: "explicit_user_input",
                sourceSurface: chat.type === "group" ? "group_chat" : "dm_chat",
                messageId: input.messageId,
                chatId: chat.id,
                sourceEntityId: chat.id,
                actorUserIds,
              },
            },
          },
        );
      }
    } catch (error) {
      this.logger.warn(
        `chat memory ingestion failed for chat ${input.chatId}: ${String(error)}`,
      );
    }
  }

  private buildMemorySummaryFromMessage(body: string) {
    const normalized = body.replace(/\s+/g, " ").trim();
    if (normalized.length < 12) {
      return "";
    }
    return normalized.length <= 280
      ? normalized
      : `${normalized.slice(0, 277).trimEnd()}...`;
  }

  private extractStructuredMemoriesFromMessage(body: string) {
    const normalized = this.normalizeMemoryExtractionInput(body);
    if (normalized.length < 12) {
      return [];
    }

    const clauses = this.splitMemoryClauses(normalized);

    const memories = [
      ...this.extractPreferenceMemories(clauses),
      ...this.extractLocationMemories(clauses),
      ...this.extractLanguageMemories(clauses),
      ...this.extractRelationshipMemories(clauses),
      ...this.extractCommerceMemories(clauses),
      ...this.extractSafetyMemories(clauses),
    ];

    return this.rankAndDeduplicateStructuredMemories(memories).slice(0, 4);
  }

  private normalizeMemoryExtractionInput(body: string) {
    return body.replace(/\s+/g, " ").trim();
  }

  private splitMemoryClauses(body: string) {
    return body
      .split(
        /(?<=[.!?])\s+|;\s+|,\s+(?=(?:(?:and|but|so)\s+)?(?:i|my|we|please|don't|do not|i'm|i am)\b)/i,
      )
      .map((clause) => clause.replace(/^(?:and|but|so)\s+/i, "").trim())
      .filter(Boolean);
  }

  private extractPreferenceMemories(clauses: string[]) {
    const memories: StructuredMemoryCandidate[] = [];
    const preferencePatterns = [
      {
        regex:
          /^(?:i like|i love|i enjoy|i prefer|my favorite is|i'm into|i am into)\s+(.+)$/i,
        key: "conversation.preference.likes",
        summaryVerb: "likes",
      },
      {
        regex:
          /^(?:i dislike|i don't like|i do not like|i hate|i'm not into|i am not into)\s+(.+)$/i,
        key: "conversation.preference.avoids",
        summaryVerb: "avoids",
      },
    ] as const;

    for (const clause of clauses) {
      for (const pattern of preferencePatterns) {
        const match = clause.match(pattern.regex);
        if (!match) {
          continue;
        }
        const value = this.normalizePreferenceValue(match[1]);
        if (!value || this.isGenericMemoryValue(value)) {
          continue;
        }
        const confidence = this.scorePreferenceConfidence(value, clause);
        if (confidence < 0.84) {
          continue;
        }
        memories.push({
          class: "stable_preference",
          governanceTier: "explicit_only",
          key: pattern.key,
          value,
          confidence,
          contradictionPolicy: "keep_latest",
          summary: `Explicitly stated preference: ${pattern.summaryVerb} ${value}.`,
        });
      }
    }

    return memories;
  }

  private extractLocationMemories(clauses: string[]) {
    const memories: StructuredMemoryCandidate[] = [];
    for (const clause of clauses) {
      const match = clause.match(
        /^(?:i live in|i'm in|i am in|i'm based in|i am based in|i'm from|i am from|i live near)\s+(.+)$/i,
      );
      if (!match) {
        continue;
      }
      const value = this.normalizeLocationValue(match[1]);
      if (!value || this.isGenericLocationValue(value)) {
        continue;
      }
      memories.push({
        class: "profile_memory",
        governanceTier: "explicit_only",
        key: "profile.location",
        value,
        confidence: this.scoreLocationConfidence(value),
        contradictionPolicy: "keep_latest",
        summary: `Explicitly stated profile fact: location ${value}.`,
      });
    }
    return memories;
  }

  private extractLanguageMemories(clauses: string[]) {
    const memories: StructuredMemoryCandidate[] = [];
    for (const clause of clauses) {
      const match = clause.match(
        /^(?:i speak|i can speak|i'm fluent in|i am fluent in|my languages are)\s+(.+)$/i,
      );
      if (!match) {
        continue;
      }
      const value = this.normalizeLanguageValue(match[1]);
      if (!value || this.isGenericMemoryValue(value)) {
        continue;
      }
      memories.push({
        class: "profile_memory",
        governanceTier: "explicit_only",
        key: "profile.languages",
        value,
        confidence: this.scoreLanguageConfidence(value),
        contradictionPolicy: "keep_latest",
        summary: `Explicitly stated profile fact: languages ${value}.`,
      });
    }
    return memories;
  }

  private extractRelationshipMemories(clauses: string[]) {
    const memories: StructuredMemoryCandidate[] = [];
    for (const clause of clauses) {
      const match = clause.match(
        /^(?:i know|i already know|we met|i met|i work with|i've worked with|i work with)\s+(.+)$/i,
      );
      if (!match) {
        continue;
      }
      const [personPart, contextPart] = this.extractRelationshipParts(match[1]);
      const person = this.normalizeExtractedValue(personPart);
      const context = this.normalizeExtractedValue(contextPart);
      if (!person || this.isGenericMemoryValue(person)) {
        continue;
      }
      const value = context ? `${person} via ${context}` : person;
      memories.push({
        class: "relationship_history",
        governanceTier: "inferable",
        key: "relationship.prior_context",
        value,
        confidence: context ? 0.8 : 0.72,
        contradictionPolicy: "append_conflict_note",
        summary: context
          ? `Relationship context: already knows ${person} via ${context}.`
          : `Relationship context: already knows ${person}.`,
      });
    }
    return memories;
  }

  private extractCommerceMemories(clauses: string[]) {
    const memories: StructuredMemoryCandidate[] = [];
    for (const clause of clauses) {
      const match = clause.match(
        /^(?:my budget is|i can spend|budget around|up to)\s+\$?([0-9]{2,6})(?:\s*(usd|eur|ars|gbp))?/i,
      );
      if (!match) {
        continue;
      }
      const amount = this.normalizeExtractedValue(match[1] ?? "");
      const currency = this.normalizeExtractedValue(
        match[2] ?? "",
      ).toUpperCase();
      if (!amount) {
        continue;
      }
      memories.push({
        class: "commerce_memory",
        governanceTier: "inferable",
        key: "commerce.budget",
        value: `${amount} ${currency || "USD"}`.trim(),
        confidence: 0.84,
        contradictionPolicy: "keep_latest",
        summary: `Commerce context: budget ${amount} ${currency || "USD"}.`,
      });
    }
    return memories;
  }

  private extractSafetyMemories(clauses: string[]) {
    const memories: StructuredMemoryCandidate[] = [];
    for (const clause of clauses) {
      const match = clause.match(
        /^(?:please avoid|don't match me with|do not match me with|i am not comfortable with|i'm not comfortable with|i do not want)\s+(.+)$/i,
      );
      if (!match) {
        continue;
      }
      const value = this.normalizeSafetyValue(match[1]);
      if (!value || this.isGenericMemoryValue(value)) {
        continue;
      }
      memories.push({
        class: "safety_memory",
        governanceTier: "explicit_only",
        key: "safety.boundary",
        value,
        confidence: 0.96,
        contradictionPolicy: "suppress_conflict",
        summary: `Explicit safety boundary: avoid ${value}.`,
      });
    }
    return memories;
  }

  private rankAndDeduplicateStructuredMemories(
    memories: StructuredMemoryCandidate[],
  ) {
    const deduped = new Map<string, StructuredMemoryCandidate>();
    for (const memory of memories) {
      const signature = [
        memory.class,
        memory.key,
        memory.value.trim().toLowerCase(),
      ].join("|");
      const existing = deduped.get(signature);
      if (!existing || existing.confidence < memory.confidence) {
        deduped.set(signature, memory);
      }
    }

    const confidenceThresholdByGovernance: Record<
      StructuredMemoryCandidate["governanceTier"],
      number
    > = {
      explicit_only: 0.84,
      inferable: 0.72,
    };

    return Array.from(deduped.values())
      .filter(
        (memory) =>
          memory.confidence >=
          confidenceThresholdByGovernance[memory.governanceTier],
      )
      .sort((left, right) => {
        if (right.confidence !== left.confidence) {
          return right.confidence - left.confidence;
        }
        const priority = {
          safety_memory: 0,
          profile_memory: 1,
          stable_preference: 2,
          relationship_history: 3,
          commerce_memory: 4,
        } as const;
        return priority[left.class] - priority[right.class];
      });
  }

  private normalizeExtractedValue(value: string) {
    return value
      .replace(/\s+/g, " ")
      .replace(
        /\b(a lot|very much|right now|today|tonight|currently|for now|at the moment|really|kind of|sort of|please|just)\b/gi,
        "",
      )
      .replace(/^[,;:\-\s]+|[,;:\-\s]+$/g, "")
      .trim();
  }

  private normalizePreferenceValue(value: string) {
    return this.normalizeStructuredListValue(value);
  }

  private normalizeLocationValue(value: string) {
    return this.normalizeExtractedValue(value);
  }

  private normalizeLanguageValue(value: string) {
    return this.normalizeStructuredListValue(value);
  }

  private normalizeSafetyValue(value: string) {
    return this.normalizeExtractedValue(value);
  }

  private normalizeStructuredListValue(value: string) {
    const normalized = this.normalizeExtractedValue(value);
    if (!normalized) {
      return "";
    }

    const parts = normalized
      .replace(/\s+(?:&|\/)\s+/g, ", ")
      .replace(/\s+\band\b\s+/gi, ", ")
      .replace(/\s+\bor\b\s+/gi, ", ")
      .split(",")
      .map((part) => this.normalizeExtractedValue(part))
      .filter(Boolean)
      .filter((part) => !this.isGenericMemoryValue(part));

    if (parts.length === 0) {
      return "";
    }

    const uniqueParts: string[] = [];
    const seen = new Set<string>();
    for (const part of parts) {
      const signature = part.toLowerCase();
      if (seen.has(signature)) {
        continue;
      }
      seen.add(signature);
      uniqueParts.push(part);
    }

    return uniqueParts.join(", ");
  }

  private extractRelationshipParts(value: string) {
    const match = value.match(/^(.+?)(?:\s+(?:from|at|through|via)\s+(.+))?$/i);
    return [match?.[1] ?? value, match?.[2] ?? ""] as const;
  }

  private scorePreferenceConfidence(value: string, clause: string) {
    const normalized = clause.toLowerCase();
    const words = value.split(/\s+/).filter(Boolean).length;
    const directSignal =
      /\b(?:i like|i love|i enjoy|i prefer|my favorite is|i'm into|i am into)\b/i.test(
        clause,
      );
    const multiValueBonus = value.includes(",") ? 0.03 : 0;
    const fillerPenalty =
      /\b(a lot|kind of|sort of|maybe|probably|somewhat|a bit|a little)\b/i.test(
        normalized,
      )
        ? 0.03
        : 0;
    return Math.max(
      0.72,
      Math.min(
        0.96,
        (directSignal ? 0.9 : 0.82) +
          Math.min(words * 0.015, 0.05) +
          multiValueBonus -
          fillerPenalty,
      ),
    );
  }

  private scoreLocationConfidence(value: string) {
    const words = value.split(/\s+/).filter(Boolean).length;
    const specificityBonus = /[A-Z]/.test(value) ? 0.02 : 0;
    return Math.max(
      0.84,
      Math.min(0.96, 0.88 + Math.min(words * 0.015, 0.04) + specificityBonus),
    );
  }

  private scoreLanguageConfidence(value: string) {
    const words = value.split(/\s+/).filter(Boolean).length;
    const listBonus = value.includes(",") ? 0.02 : 0;
    return Math.max(
      0.84,
      Math.min(0.96, 0.87 + Math.min(words * 0.01, 0.04) + listBonus),
    );
  }

  private isGenericMemoryValue(value: string) {
    const normalized = value.toLowerCase();
    return [
      "people",
      "social plans",
      "new connections",
      "stuff",
      "things",
      "anything",
      "everything",
      "somewhere",
      "here",
      "there",
      "a lot",
    ].some(
      (fragment) => normalized === fragment || normalized.includes(fragment),
    );
  }

  private isGenericLocationValue(value: string) {
    const normalized = value.toLowerCase();
    return ["here", "there", "somewhere", "anywhere"].includes(normalized);
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

    const participants = chat.connection.participants.map((participant) => {
      const snapshot = this.presenceService?.getPresenceSnapshot(
        participant.userId,
      );
      return {
        userId: participant.userId,
        role: participant.role,
        joinedAt: participant.joinedAt,
        ...(snapshot
          ? {
              presence: {
                online: snapshot.online,
                state: snapshot.state,
                lastSeenAt: snapshot.lastSeenAt,
              },
            }
          : {}),
      };
    });

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
    const uniqueMessages = this.dedupeMessages(messages).filter((message) =>
      this.isMessageVisibleToViewer(message, userId),
    );
    const statusByMessageId = await this.buildMessageStatusMap(
      chatId,
      uniqueMessages.map((message) => message.id),
    );
    const reactionsByMessageId = await this.buildMessageReactionMap(
      uniqueMessages.map((message) => message.id),
    );

    const unreadCount = this.prisma.chatMessage?.count
      ? await this.prisma.chatMessage.count({
          where: {
            chatId,
            senderUserId: {
              not: userId,
            },
            moderationState: {
              not: "review",
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
        reactions: reactionsByMessageId.get(message.id) ?? [],
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

  private async hydrateMessagesForThreadResponse(
    chatId: string,
    messages: Array<{
      id: string;
      senderUserId: string;
      body: string;
      moderationState: "clean" | "flagged" | "blocked" | "review";
      createdAt: Date;
      editedAt?: Date | null;
      replyToMessageId?: string | null;
    }>,
  ) {
    const statusByMessageId = await this.buildMessageStatusMap(
      chatId,
      messages.map((message) => message.id),
    );
    const reactionsByMessageId = await this.buildMessageReactionMap(
      messages.map((message) => message.id),
    );

    return messages.map((message) => ({
      ...message,
      reactions: reactionsByMessageId.get(message.id) ?? [],
      status: statusByMessageId.get(message.id) ?? {
        state: "sent" as const,
        deliveredCount: 0,
        readCount: 0,
        pendingCount: 0,
      },
    }));
  }

  private resolveThreadRootMessageId(
    messageId: string,
    parentByMessageId: Map<string, string | null>,
  ) {
    const visited = new Set<string>();
    let currentMessageId = messageId;
    while (!visited.has(currentMessageId)) {
      visited.add(currentMessageId);
      const parentMessageId = parentByMessageId.get(currentMessageId);
      if (!parentMessageId) {
        return currentMessageId;
      }
      currentMessageId = parentMessageId;
    }
    return currentMessageId;
  }

  private buildThreadSummary<
    TMessage extends {
      id: string;
      senderUserId: string;
      createdAt: Date;
    },
  >(rootMessage: TMessage, messages: TMessage[]) {
    const sortedMessages = [...messages].sort((left, right) => {
      const leftTime = left.createdAt.getTime();
      const rightTime = right.createdAt.getTime();
      if (leftTime === rightTime) {
        return left.id.localeCompare(right.id);
      }
      return leftTime - rightTime;
    });
    const replyMessages = sortedMessages.filter(
      (message) => message.id !== rootMessage.id,
    );
    const lastActivityAt =
      sortedMessages.at(-1)?.createdAt.toISOString() ??
      rootMessage.createdAt.toISOString();
    const lastReplyAt = replyMessages.at(-1)?.createdAt.toISOString() ?? null;

    return {
      rootMessage,
      replyCount: replyMessages.length,
      messageCount: sortedMessages.length,
      participantCount: new Set(
        sortedMessages.map((message) => message.senderUserId),
      ).size,
      lastReplyAt,
      lastActivityAt,
    };
  }

  private buildThreadEntries<
    TMessage extends {
      id: string;
      createdAt: Date;
      replyToMessageId?: string | null;
    },
  >(messages: TMessage[], rootMessageId: string) {
    const messageById = new Map(
      messages.map((message) => [message.id, message]),
    );
    const childrenByParentId = new Map<string, TMessage[]>();

    for (const message of messages) {
      if (!message.replyToMessageId) {
        continue;
      }
      const current = childrenByParentId.get(message.replyToMessageId) ?? [];
      current.push(message);
      childrenByParentId.set(message.replyToMessageId, current);
    }

    for (const [parentId, childMessages] of childrenByParentId.entries()) {
      childMessages.sort((left, right) => {
        const leftTime = left.createdAt.getTime();
        const rightTime = right.createdAt.getTime();
        if (leftTime === rightTime) {
          return left.id.localeCompare(right.id);
        }
        return leftTime - rightTime;
      });
      childrenByParentId.set(parentId, childMessages);
    }

    const rootMessage = messageById.get(rootMessageId);
    if (!rootMessage) {
      return [];
    }

    const queue: Array<{ depth: number; message: TMessage }> = [
      { depth: 0, message: rootMessage },
    ];
    const entries: Array<{ depth: number; message: TMessage }> = [];
    const visited = new Set<string>();

    while (queue.length > 0) {
      const current = queue.shift();
      if (!current || visited.has(current.message.id)) {
        continue;
      }
      visited.add(current.message.id);
      entries.push(current);
      const children = childrenByParentId.get(current.message.id) ?? [];
      for (const child of children) {
        queue.push({
          depth: current.depth + 1,
          message: child,
        });
      }
    }

    return entries;
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

  async editMessage(
    chatId: string,
    messageId: string,
    userId: string,
    body: string,
  ) {
    await this.assertActiveParticipant(chatId, userId);
    const existingMessage = await this.prisma.chatMessage.findFirst({
      where: { id: messageId, chatId },
      select: {
        id: true,
        senderUserId: true,
        body: true,
      },
    });
    if (!existingMessage) {
      throw new NotFoundException("message not found");
    }
    if (existingMessage.senderUserId !== userId) {
      throw new ForbiddenException("message cannot be edited by this user");
    }
    if (existingMessage.body.trim() === "[deleted]") {
      throw new BadRequestException("deleted messages cannot be edited");
    }

    const parsedBody = parseChatMessageBody(body);
    const editedText = parsedBody.body.trim();
    if (!editedText) {
      throw new BadRequestException("message body is required");
    }
    let editedBody = body.trim();

    const strictModerationEnabled = await this.isModerationStrictnessEnabled();
    const moderationSurfaceEnabled =
      await this.isMessageModerationSurfaceEnabled();
    const prefilterModeration = this.evaluateTextModeration(editedText, false);
    if (prefilterModeration.decision === "blocked") {
      await this.recordBlockedMessageModeration(
        chatId,
        userId,
        prefilterModeration.matchedTerms,
      );
      throw new ForbiddenException("message blocked by moderation policy");
    }

    let moderationState: "clean" | "review" = "clean";
    let pendingReviewTerms: string[] = [];
    if (moderationSurfaceEnabled && strictModerationEnabled) {
      moderationState = "review";
    } else {
      const moderation = await this.evaluateMessageModeration(
        editedText,
        strictModerationEnabled,
      );
      if (moderation.decision === "blocked") {
        await this.recordBlockedMessageModeration(
          chatId,
          userId,
          moderation.matchedTerms,
        );
        throw new ForbiddenException("message blocked by moderation policy");
      }
      if (moderation.decision === "review") {
        editedBody = parsedBody.reply
          ? formatChatReplyBody("[hidden by moderation]", parsedBody.reply)
          : "[hidden by moderation]";
        moderationState = "review";
        pendingReviewTerms = moderation.matchedTerms;
      }
    }

    const updatedMessage = await this.prisma.chatMessage.update({
      where: { id: existingMessage.id },
      data: {
        body: editedBody,
        editedAt: new Date(),
        moderationState,
      },
    });

    if (strictModerationEnabled && moderationSurfaceEnabled) {
      await this.enqueueMessageModeration(
        updatedMessage.id,
        chatId,
        userId,
        editedText,
      );
    } else if (pendingReviewTerms.length > 0) {
      await this.recordPendingReviewMessageModeration(
        chatId,
        updatedMessage.id,
        userId,
        pendingReviewTerms,
      );
    }

    const statusByMessageId = await this.buildMessageStatusMap(chatId, [
      updatedMessage.id,
    ]);
    const reactionsByMessageId = await this.buildMessageReactionMap([
      updatedMessage.id,
    ]);
    const hydratedMessage = {
      ...updatedMessage,
      reactions: reactionsByMessageId.get(updatedMessage.id) ?? [],
      status: statusByMessageId.get(updatedMessage.id) ?? {
        state: "sent" as const,
        deliveredCount: 0,
        readCount: 0,
        pendingCount: 0,
      },
    };

    await this.writeAuditRecord(
      "chat.message_edited",
      "chat_message",
      updatedMessage.id,
      userId,
      {
        chatId,
        editedAt:
          hydratedMessage.editedAt instanceof Date
            ? hydratedMessage.editedAt.toISOString()
            : hydratedMessage.editedAt,
      },
    );

    const realtimeMessage = {
      ...hydratedMessage,
      createdAt: hydratedMessage.createdAt.toISOString(),
      editedAt: hydratedMessage.editedAt?.toISOString() ?? null,
      reactions: hydratedMessage.reactions.map((reaction) => ({
        ...reaction,
        createdAt: reaction.createdAt.toISOString(),
      })),
    };
    this.realtimeEventsService?.emitChatMessageUpdated(chatId, {
      roomId: chatId,
      message: realtimeMessage,
    });

    return hydratedMessage;
  }

  async createMessageReaction(
    chatId: string,
    messageId: string,
    userId: string,
    emoji: string,
  ) {
    await this.assertActiveParticipant(chatId, userId);
    if (
      !this.prisma.chatMessage?.findFirst ||
      !this.prisma.chatMessageReaction?.findFirst ||
      !this.prisma.chatMessageReaction?.create
    ) {
      throw new NotFoundException("reaction not found");
    }

    const message = await this.prisma.chatMessage.findFirst({
      where: {
        id: messageId,
        chatId,
      },
      select: {
        id: true,
      },
    });
    if (!message) {
      throw new NotFoundException("message not found");
    }

    const normalizedEmoji = emoji.trim();
    if (!normalizedEmoji) {
      throw new BadRequestException("reaction emoji is required");
    }

    const existing = await this.prisma.chatMessageReaction.findFirst({
      where: {
        messageId,
        userId,
        emoji: normalizedEmoji,
      },
      select: {
        id: true,
        messageId: true,
        userId: true,
        emoji: true,
        createdAt: true,
      },
    });
    if (existing) {
      return existing;
    }

    return this.prisma.chatMessageReaction.create({
      data: {
        messageId,
        userId,
        emoji: normalizedEmoji,
      },
    });
  }

  async listMessageReactions(
    chatId: string,
    messageId: string,
    userId: string,
  ) {
    await this.assertActiveParticipant(chatId, userId);
    if (
      !this.prisma.chatMessage?.findFirst ||
      !this.prisma.chatMessageReaction?.findMany
    ) {
      throw new NotFoundException("reaction not found");
    }

    const message = await this.prisma.chatMessage.findFirst({
      where: {
        id: messageId,
        chatId,
      },
      select: {
        id: true,
      },
    });
    if (!message) {
      throw new NotFoundException("message not found");
    }

    const reactions = await this.prisma.chatMessageReaction.findMany({
      where: {
        messageId,
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    return {
      reactions,
    };
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

  async processQueuedMessageModeration(
    messageId: string,
    chatId: string,
    senderUserId: string,
    body: string,
  ) {
    if (!this.moderationService || !this.prisma.chatMessage?.update) {
      return null;
    }

    const strictModerationEnabled = await this.isModerationStrictnessEnabled();
    const decision = await this.moderationService.submitForModeration({
      contentRef: messageId,
      contentType: "chat_message",
      actorUserId: senderUserId,
      surface: "chat_message",
      content: body,
      strictMode: strictModerationEnabled,
      idempotencyKey: `chat_message:${messageId}`,
      evidenceRefs: [messageId],
      metadata: {
        chatId,
      },
    });

    if (decision.riskLevel === "allow") {
      const updated = await this.prisma.chatMessage.update({
        where: { id: messageId },
        data: {
          moderationState: "clean",
        },
      });
      await this.deliverMessageToRecipients(chatId, messageId, senderUserId);
      return updated;
    }

    if (decision.riskLevel === "block") {
      const updated = await this.prisma.chatMessage.update({
        where: { id: messageId },
        data: {
          body: "[hidden by moderation]",
          moderationState: "blocked",
        },
      });
      await this.createSystemMessage(
        chatId,
        senderUserId,
        "moderation_hidden",
        "blocked by moderation policy",
        {
          idempotencyKey: `chat-message-blocked:${messageId}`,
        },
      );
      return updated;
    }

    const updated = await this.prisma.chatMessage.update({
      where: { id: messageId },
      data: {
        moderationState: "review",
      },
    });
    await this.createSystemMessage(
      chatId,
      senderUserId,
      "moderation_hidden",
      "pending manual review",
      {
        idempotencyKey: `chat-message-review:${messageId}`,
      },
    );
    return updated;
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

  private isMessageVisibleToViewer(
    message: {
      senderUserId?: string;
      moderationState?: "clean" | "flagged" | "blocked" | "review";
    },
    viewerUserId?: string,
  ) {
    if (!viewerUserId) {
      return true;
    }
    if (message.moderationState !== "review") {
      return true;
    }
    return message.senderUserId === viewerUserId;
  }

  private async enqueueMessageModeration(
    messageId: string,
    chatId: string,
    senderUserId: string,
    body: string,
  ) {
    const idempotencyKey = `chat-message-moderation:${messageId}`;
    if (!this.moderationQueue) {
      return;
    }
    await this.moderationQueue.add(
      "ChatMessageModerationRequested",
      {
        version: 1,
        traceId: randomUUID(),
        idempotencyKey,
        timestamp: new Date().toISOString(),
        type: "ChatMessageModerationRequested",
        payload: {
          messageId,
          chatId,
          senderUserId,
          body,
        },
      },
      {
        jobId: idempotencyKey,
        attempts: 3,
        removeOnComplete: 500,
        backoff: {
          type: "exponential",
          delay: 1000,
        },
      },
    );
  }

  private async deliverMessageToRecipients(
    chatId: string,
    messageId: string,
    senderUserId: string,
  ) {
    if (
      !this.prisma.chat?.findUnique ||
      !this.prisma.connectionParticipant?.findMany ||
      !this.prisma.messageReceipt?.createMany
    ) {
      return;
    }
    const chat = await this.prisma.chat.findUnique({
      where: { id: chatId },
      select: { connectionId: true },
    });
    if (!chat) {
      return;
    }
    const participants = await this.prisma.connectionParticipant.findMany({
      where: {
        connectionId: chat.connectionId,
        leftAt: null,
        userId: {
          not: senderUserId,
        },
      },
      select: { userId: true },
    });
    if (participants.length === 0) {
      return;
    }

    const existingReceipts = this.prisma.messageReceipt?.findMany
      ? await this.prisma.messageReceipt.findMany({
          where: {
            messageId,
            userId: {
              in: participants.map((participant) => participant.userId),
            },
          },
          select: {
            userId: true,
          },
        })
      : [];
    const existingUserIds = new Set(
      existingReceipts.map((item) => item.userId),
    );
    const pendingParticipants = participants.filter(
      (participant) => !existingUserIds.has(participant.userId),
    );
    if (pendingParticipants.length === 0) {
      return;
    }

    const now = new Date();
    await this.prisma.messageReceipt.createMany({
      data: pendingParticipants.map((participant) => ({
        messageId,
        userId: participant.userId,
        deliveredAt: now,
      })),
    });
  }

  private async buildMessageReactionMap(messageIds: string[]) {
    if (messageIds.length === 0 || !this.prisma.chatMessageReaction?.findMany) {
      return new Map<
        string,
        Array<{
          id: string;
          messageId: string;
          userId: string;
          emoji: string;
          createdAt: Date;
        }>
      >();
    }

    const reactions = await this.prisma.chatMessageReaction.findMany({
      where: {
        messageId: {
          in: messageIds,
        },
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: {
        id: true,
        messageId: true,
        userId: true,
        emoji: true,
        createdAt: true,
      },
    });

    const byMessageId = new Map<
      string,
      Array<{
        id: string;
        messageId: string;
        userId: string;
        emoji: string;
        createdAt: Date;
      }>
    >();
    for (const reaction of reactions) {
      const current = byMessageId.get(reaction.messageId) ?? [];
      current.push(reaction);
      byMessageId.set(reaction.messageId, current);
    }

    return byMessageId;
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

  private async isMessageModerationSurfaceEnabled() {
    if (!this.launchControlsService) {
      return true;
    }
    const snapshot = await this.launchControlsService.getSnapshot();
    return (
      !snapshot.globalKillSwitch && (snapshot.enableModerationMessages ?? true)
    );
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
      !this.prisma.connectionParticipant?.findMany ||
      !this.prisma.block?.findMany
    ) {
      return false;
    }
    const otherUserIds = await this.getOtherParticipantUserIds(
      chatId,
      senderUserId,
    );
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

  private async isMutedOrReportedInChat(chatId: string, senderUserId: string) {
    const otherUserIds = await this.getOtherParticipantUserIds(
      chatId,
      senderUserId,
    );
    if (otherUserIds.length === 0) {
      return false;
    }

    const [muteRows, reportRows] = await Promise.all([
      this.prisma.userPreference?.findMany
        ? this.prisma.userPreference.findMany({
            where: {
              userId: {
                in: [senderUserId, ...otherUserIds],
              },
              key: MUTE_USER_IDS_PREFERENCE_KEY,
            },
            select: {
              userId: true,
              value: true,
            },
          })
        : Promise.resolve([] as Array<{ userId: string; value: unknown }>),
      this.prisma.userReport?.findMany
        ? this.prisma.userReport.findMany({
            where: {
              status: "open",
              OR: [
                {
                  reporterUserId: senderUserId,
                  targetUserId: {
                    in: otherUserIds,
                  },
                },
                {
                  reporterUserId: {
                    in: otherUserIds,
                  },
                  targetUserId: senderUserId,
                },
              ],
            },
            select: {
              id: true,
            },
            take: 1,
          })
        : Promise.resolve([] as Array<{ id: string }>),
    ]);

    if (reportRows.length > 0) {
      return true;
    }

    const mutedByUser = new Map<string, Set<string>>();
    for (const row of muteRows) {
      const mutedUserIds = this.readNormalizedUserIds(row.value);
      if (mutedUserIds.length === 0) {
        continue;
      }
      mutedByUser.set(row.userId, new Set(mutedUserIds));
    }

    const normalizedSenderUserId = senderUserId.toLowerCase();
    const senderMutedUsers = mutedByUser.get(senderUserId) ?? new Set<string>();
    return otherUserIds.some((otherUserId) => {
      const normalizedOtherUserId = otherUserId.toLowerCase();
      return (
        senderMutedUsers.has(normalizedOtherUserId) ||
        (mutedByUser.get(otherUserId)?.has(normalizedSenderUserId) ?? false)
      );
    });
  }

  private async getOtherParticipantUserIds(
    chatId: string,
    senderUserId: string,
  ) {
    if (
      !this.prisma.chat?.findUnique ||
      !this.prisma.connectionParticipant?.findMany
    ) {
      return [] as string[];
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
    return participants
      .map((participant) => participant.userId)
      .filter((userId) => userId !== senderUserId);
  }

  private readNormalizedUserIds(value: unknown) {
    if (!Array.isArray(value)) {
      return [];
    }
    return value
      .map((item) =>
        typeof item === "string" ? item.trim().toLowerCase() : "",
      )
      .filter((item) => item.length > 0);
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
