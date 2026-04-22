import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import {
  chatLeaveBodySchema,
  editChatMessageBodySchema,
  chatSyncQuerySchema,
  createChatBodySchema,
  createChatMessageBodySchema,
  createChatMessageReactionBodySchema,
  hideChatMessageBodySchema,
  listChatMessagesQuerySchema,
  readReceiptBodySchema,
  softDeleteChatMessageBodySchema,
  uuidSchema,
} from "@opensocial/types";
import { ok } from "../common/api-response.js";
import { ActorUserId } from "../common/actor-user-id.decorator.js";
import { assertActorOwnsUser } from "../common/auth-context.js";
import { parseRequestPayload } from "../common/validation.js";
import { ChatsService } from "./chats.service.js";

@Controller("chats")
export class ChatsController {
  constructor(private readonly chatsService: ChatsService) {}

  @Get()
  async listChats(@ActorUserId() actorUserId: string) {
    return ok(await this.chatsService.listChatsForUser(actorUserId));
  }

  @Post()
  async createChat(@Body() body: unknown, @ActorUserId() actorUserId: string) {
    const payload = parseRequestPayload(createChatBodySchema, body);
    return ok(
      await this.chatsService.createChat(
        payload.connectionId,
        payload.type,
        actorUserId,
      ),
    );
  }

  @Get(":chatId/messages")
  async listMessages(
    @Param("chatId") chatIdParam: string,
    @ActorUserId() actorUserId: string,
    @Query("limit") limit?: string,
    @Query("before") before?: string,
  ) {
    const chatId = parseRequestPayload(uuidSchema, chatIdParam);
    const query = parseRequestPayload(listChatMessagesQuerySchema, {
      limit,
      before,
    });
    return ok(
      await this.chatsService.listMessages(
        chatId,
        query.limit ?? 50,
        query.before,
        actorUserId,
      ),
    );
  }

  @Get(":chatId/metadata")
  async getMetadata(
    @Param("chatId") chatIdParam: string,
    @ActorUserId() actorUserId: string,
  ) {
    const chatId = parseRequestPayload(uuidSchema, chatIdParam);
    return ok(await this.chatsService.getChatMetadata(chatId, actorUserId));
  }

  @Get(":chatId/threads")
  async listThreads(
    @Param("chatId") chatIdParam: string,
    @ActorUserId() actorUserId: string,
  ) {
    const chatId = parseRequestPayload(uuidSchema, chatIdParam);
    return ok(await this.chatsService.listThreads(chatId, actorUserId));
  }

  @Get(":chatId/threads/:rootMessageId")
  async getThread(
    @Param("chatId") chatIdParam: string,
    @Param("rootMessageId") rootMessageIdParam: string,
    @ActorUserId() actorUserId: string,
  ) {
    const chatId = parseRequestPayload(uuidSchema, chatIdParam);
    const rootMessageId = parseRequestPayload(uuidSchema, rootMessageIdParam);
    return ok(
      await this.chatsService.getThread(chatId, rootMessageId, actorUserId),
    );
  }

  @Get(":chatId/sync")
  async syncMessages(
    @Param("chatId") chatIdParam: string,
    @ActorUserId() actorUserId: string,
    @Query("userId") userId: string,
    @Query("limit") limit?: string,
    @Query("after") after?: string,
  ) {
    const chatId = parseRequestPayload(uuidSchema, chatIdParam);
    const query = parseRequestPayload(chatSyncQuerySchema, {
      userId,
      limit,
      after,
    });
    assertActorOwnsUser(
      actorUserId,
      query.userId,
      "sync user does not match authenticated user",
    );
    return ok(
      await this.chatsService.listMessagesForSync(
        chatId,
        actorUserId,
        query.limit ?? 100,
        query.after,
      ),
    );
  }

  @Post(":chatId/messages")
  async createMessage(
    @Param("chatId") chatIdParam: string,
    @Body() body: unknown,
    @ActorUserId() actorUserId: string,
  ) {
    const chatId = parseRequestPayload(uuidSchema, chatIdParam);
    const payload = parseRequestPayload(createChatMessageBodySchema, body);
    assertActorOwnsUser(
      actorUserId,
      payload.senderUserId,
      "chat sender does not match authenticated user",
    );
    const firstPartySendResult =
      await this.chatsService.sendFirstPartyChatMessageAction(
        chatId,
        actorUserId,
        payload.body,
        {
          idempotencyKey: payload.clientMessageId,
          replyToMessageId: payload.replyToMessageId,
        },
      );
    return ok(
      await this.chatsService.getPersistedMessage(
        chatId,
        firstPartySendResult.messageId,
        actorUserId,
      ),
    );
  }

  @Patch(":chatId/messages/:messageId")
  async editMessage(
    @Param("chatId") chatIdParam: string,
    @Param("messageId") messageIdParam: string,
    @Body() body: unknown,
    @ActorUserId() actorUserId: string,
  ) {
    const chatId = parseRequestPayload(uuidSchema, chatIdParam);
    const messageId = parseRequestPayload(uuidSchema, messageIdParam);
    const payload = parseRequestPayload(editChatMessageBodySchema, body);
    assertActorOwnsUser(
      actorUserId,
      payload.userId,
      "edit user does not match authenticated user",
    );
    return ok(
      await this.chatsService.editMessage(
        chatId,
        messageId,
        actorUserId,
        payload.body,
      ),
    );
  }

  @Post(":chatId/messages/:messageId/reactions")
  async createReaction(
    @Param("chatId") chatIdParam: string,
    @Param("messageId") messageIdParam: string,
    @Body() body: unknown,
    @ActorUserId() actorUserId: string,
  ) {
    const chatId = parseRequestPayload(uuidSchema, chatIdParam);
    const messageId = parseRequestPayload(uuidSchema, messageIdParam);
    const payload = parseRequestPayload(
      createChatMessageReactionBodySchema,
      body,
    );
    assertActorOwnsUser(
      actorUserId,
      payload.userId,
      "reaction user does not match authenticated user",
    );
    return ok(
      await this.chatsService.createMessageReaction(
        chatId,
        messageId,
        actorUserId,
        payload.emoji,
      ),
    );
  }

  @Get(":chatId/messages/:messageId/reactions")
  async listReactions(
    @Param("chatId") chatIdParam: string,
    @Param("messageId") messageIdParam: string,
    @ActorUserId() actorUserId: string,
  ) {
    const chatId = parseRequestPayload(uuidSchema, chatIdParam);
    const messageId = parseRequestPayload(uuidSchema, messageIdParam);
    return ok(
      await this.chatsService.listMessageReactions(
        chatId,
        messageId,
        actorUserId,
      ),
    );
  }

  @Post(":chatId/messages/:messageId/read")
  async markRead(
    @Param("chatId") chatIdParam: string,
    @Param("messageId") messageIdParam: string,
    @Body() body: unknown,
    @ActorUserId() actorUserId: string,
  ) {
    const chatId = parseRequestPayload(uuidSchema, chatIdParam);
    const messageId = parseRequestPayload(uuidSchema, messageIdParam);
    const payload = parseRequestPayload(readReceiptBodySchema, body);
    assertActorOwnsUser(
      actorUserId,
      payload.userId,
      "read-receipt user does not match authenticated user",
    );
    return ok(
      await this.chatsService.markReadReceipt(chatId, messageId, actorUserId),
    );
  }

  @Post(":chatId/messages/:messageId/soft-delete")
  async softDeleteMessage(
    @Param("chatId") chatIdParam: string,
    @Param("messageId") messageIdParam: string,
    @Body() body: unknown,
    @ActorUserId() actorUserId: string,
  ) {
    const chatId = parseRequestPayload(uuidSchema, chatIdParam);
    const messageId = parseRequestPayload(uuidSchema, messageIdParam);
    const payload = parseRequestPayload(softDeleteChatMessageBodySchema, body);
    assertActorOwnsUser(
      actorUserId,
      payload.userId,
      "delete user does not match authenticated user",
    );
    return ok(
      await this.chatsService.softDeleteMessage(chatId, messageId, actorUserId),
    );
  }

  @Post(":chatId/leave")
  async leaveChat(
    @Param("chatId") chatIdParam: string,
    @Body() body: unknown,
    @ActorUserId() actorUserId: string,
  ) {
    const chatId = parseRequestPayload(uuidSchema, chatIdParam);
    const payload = parseRequestPayload(chatLeaveBodySchema, body);
    assertActorOwnsUser(
      actorUserId,
      payload.userId,
      "leave user does not match authenticated user",
    );
    return ok(await this.chatsService.leaveChat(chatId, actorUserId));
  }

  @Post(":chatId/messages/:messageId/hide")
  async hideMessage(
    @Param("chatId") chatIdParam: string,
    @Param("messageId") messageIdParam: string,
    @Body() body: unknown,
    @ActorUserId() actorUserId: string,
  ) {
    const chatId = parseRequestPayload(uuidSchema, chatIdParam);
    const messageId = parseRequestPayload(uuidSchema, messageIdParam);
    const payload = parseRequestPayload(hideChatMessageBodySchema, body);
    assertActorOwnsUser(
      actorUserId,
      payload.moderatorUserId,
      "moderator user does not match authenticated user",
    );
    return ok(
      await this.chatsService.hideMessageForModeration(
        chatId,
        messageId,
        actorUserId,
        payload.reason,
      ),
    );
  }
}
