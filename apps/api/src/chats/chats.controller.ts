import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import {
  createChatBodySchema,
  createChatMessageBodySchema,
  listChatMessagesQuerySchema,
  readReceiptBodySchema,
  uuidSchema,
} from "@opensocial/types";
import { ok } from "../common/api-response.js";
import { parseRequestPayload } from "../common/validation.js";
import { ChatsService } from "./chats.service.js";

@Controller("chats")
export class ChatsController {
  constructor(private readonly chatsService: ChatsService) {}

  @Post()
  async createChat(@Body() body: unknown) {
    const payload = parseRequestPayload(createChatBodySchema, body);
    return ok(
      await this.chatsService.createChat(payload.connectionId, payload.type),
    );
  }

  @Get(":chatId/messages")
  async listMessages(
    @Param("chatId") chatIdParam: string,
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
      ),
    );
  }

  @Post(":chatId/messages")
  async createMessage(
    @Param("chatId") chatIdParam: string,
    @Body() body: unknown,
  ) {
    const chatId = parseRequestPayload(uuidSchema, chatIdParam);
    const payload = parseRequestPayload(createChatMessageBodySchema, body);
    return ok(
      await this.chatsService.createMessage(
        chatId,
        payload.senderUserId,
        payload.body,
      ),
    );
  }

  @Post(":chatId/messages/:messageId/read")
  async markRead(
    @Param("chatId") chatIdParam: string,
    @Param("messageId") messageIdParam: string,
    @Body() body: unknown,
  ) {
    const chatId = parseRequestPayload(uuidSchema, chatIdParam);
    const messageId = parseRequestPayload(uuidSchema, messageIdParam);
    const payload = parseRequestPayload(readReceiptBodySchema, body);
    return ok(
      await this.chatsService.markReadReceipt(
        chatId,
        messageId,
        payload.userId,
      ),
    );
  }
}
