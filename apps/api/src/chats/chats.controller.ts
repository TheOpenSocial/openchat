import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import {
  chatLeaveBodySchema,
  chatSyncQuerySchema,
  createChatBodySchema,
  createChatMessageBodySchema,
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
    return ok(
      await this.chatsService.createMessage(chatId, actorUserId, payload.body, {
        idempotencyKey: payload.clientMessageId,
      }),
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
