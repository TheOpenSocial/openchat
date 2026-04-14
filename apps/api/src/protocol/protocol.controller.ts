import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  Param,
  Post,
  Query,
} from "@nestjs/common";
import { timingSafeEqual } from "node:crypto";
import {
  appRegistrationRequestSchema,
  identifierSchema,
  protocolChatSendMessageActionSchema,
  protocolAppScopeGrantCreateSchema,
  protocolAppScopeGrantRevokeSchema,
  protocolIntentCreateActionSchema,
  protocolIntentRequestSendActionSchema,
  protocolRequestDecisionActionSchema,
  protocolReplayCursorSchema,
  protocolWebhookDeliveryRunRequestSchema,
  uuidSchema,
  webhookSubscriptionCreateSchema,
} from "@opensocial/protocol-types";
import { PublicRoute } from "../auth/public-route.decorator.js";
import { ok } from "../common/api-response.js";
import { parseRequestPayload } from "../common/validation.js";
import { ProtocolService } from "./protocol.service.js";

function readProtocolAppToken(
  headers: Record<string, string | string[] | undefined>,
) {
  const header = headers["x-protocol-app-token"];
  if (Array.isArray(header)) {
    return header[0];
  }
  return header;
}

@PublicRoute()
@Controller("protocol")
export class ProtocolController {
  constructor(private readonly protocolService: ProtocolService) {}

  @Get("manifest")
  async getManifest() {
    return ok(this.protocolService.getManifest());
  }

  @Get("discovery")
  async getDiscovery() {
    return ok(this.protocolService.getDiscovery());
  }

  @Get("events")
  async listEvents() {
    return ok(this.protocolService.listEvents());
  }

  @Get("apps")
  async listApps() {
    return ok(await this.protocolService.listApps());
  }

  @Post("apps/register")
  async registerApp(@Body() body: unknown) {
    const payload = parseRequestPayload(appRegistrationRequestSchema, body);
    return ok(await this.protocolService.registerApp(payload));
  }

  @Post("apps/:appId/token/rotate")
  async rotateAppToken(
    @Param("appId") appIdParam: string,
    @Headers() headers: Record<string, string | string[] | undefined>,
  ) {
    const appId = parseRequestPayload(identifierSchema, appIdParam);
    return ok(
      await this.protocolService.rotateAppToken(
        appId,
        readProtocolAppToken(headers) ?? "",
      ),
    );
  }

  @Post("apps/:appId/token/revoke")
  async revokeAppToken(
    @Param("appId") appIdParam: string,
    @Headers() headers: Record<string, string | string[] | undefined>,
  ) {
    const appId = parseRequestPayload(identifierSchema, appIdParam);
    return ok(
      await this.protocolService.revokeAppToken(
        appId,
        readProtocolAppToken(headers) ?? "",
      ),
    );
  }

  @Get("apps/:appId")
  async getApp(@Param("appId") appIdParam: string) {
    const appId = parseRequestPayload(identifierSchema, appIdParam);
    return ok(await this.protocolService.getApp(appId));
  }

  @Get("apps/:appId/grants")
  async listAppGrants(
    @Param("appId") appIdParam: string,
    @Headers() headers: Record<string, string | string[] | undefined>,
  ) {
    const appId = parseRequestPayload(identifierSchema, appIdParam);
    return ok(
      await this.protocolService.listAppGrants(
        appId,
        readProtocolAppToken(headers) ?? "",
      ),
    );
  }

  @Post("apps/:appId/grants")
  async createAppGrant(
    @Param("appId") appIdParam: string,
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Body() body: unknown,
  ) {
    const appId = parseRequestPayload(identifierSchema, appIdParam);
    const payload = parseRequestPayload(
      protocolAppScopeGrantCreateSchema,
      body,
    );
    return ok(
      await this.protocolService.createAppGrant(
        appId,
        readProtocolAppToken(headers) ?? "",
        payload,
      ),
    );
  }

  @Post("apps/:appId/grants/:grantId/revoke")
  async revokeAppGrant(
    @Param("appId") appIdParam: string,
    @Param("grantId") grantIdParam: string,
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Body() body: unknown,
  ) {
    const appId = parseRequestPayload(identifierSchema, appIdParam);
    const payload = parseRequestPayload(
      protocolAppScopeGrantRevokeSchema,
      body,
    );
    return ok(
      await this.protocolService.revokeAppGrant(
        appId,
        parseRequestPayload(identifierSchema, grantIdParam),
        readProtocolAppToken(headers) ?? "",
        payload,
      ),
    );
  }

  @Get("apps/:appId/webhooks")
  async listWebhooks(
    @Param("appId") appIdParam: string,
    @Headers() headers: Record<string, string | string[] | undefined>,
  ) {
    const appId = parseRequestPayload(identifierSchema, appIdParam);
    return ok(
      await this.protocolService.listWebhooks(
        appId,
        readProtocolAppToken(headers) ?? "",
      ),
    );
  }

  @Post("apps/:appId/webhooks")
  async createWebhook(
    @Param("appId") appIdParam: string,
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Body() body: unknown,
  ) {
    const appId = parseRequestPayload(identifierSchema, appIdParam);
    const payload = parseRequestPayload(webhookSubscriptionCreateSchema, body);
    return ok(
      await this.protocolService.createWebhook(
        appId,
        readProtocolAppToken(headers) ?? "",
        payload,
      ),
    );
  }

  @Get("apps/:appId/webhooks/:subscriptionId/deliveries")
  async listWebhookDeliveries(
    @Param("appId") appIdParam: string,
    @Param("subscriptionId") subscriptionIdParam: string,
    @Headers() headers: Record<string, string | string[] | undefined>,
  ) {
    const appId = parseRequestPayload(identifierSchema, appIdParam);
    const subscriptionId = parseRequestPayload(
      identifierSchema,
      subscriptionIdParam,
    );
    return ok(
      this.protocolService.listWebhookDeliveries(
        appId,
        readProtocolAppToken(headers) ?? "",
        subscriptionId,
      ),
    );
  }

  @Get("apps/:appId/deliveries/:deliveryId/attempts")
  async listWebhookDeliveryAttempts(
    @Param("appId") appIdParam: string,
    @Param("deliveryId") deliveryIdParam: string,
    @Headers() headers: Record<string, string | string[] | undefined>,
  ) {
    const appId = parseRequestPayload(identifierSchema, appIdParam);
    const deliveryId = parseRequestPayload(uuidSchema, deliveryIdParam);
    return ok(
      await this.protocolService.listWebhookDeliveryAttempts(
        appId,
        readProtocolAppToken(headers) ?? "",
        deliveryId,
      ),
    );
  }

  @Post("apps/:appId/deliveries/:deliveryId/replay")
  async replayWebhookDelivery(
    @Param("appId") appIdParam: string,
    @Param("deliveryId") deliveryIdParam: string,
    @Headers() headers: Record<string, string | string[] | undefined>,
  ) {
    const appId = parseRequestPayload(identifierSchema, appIdParam);
    const deliveryId = parseRequestPayload(uuidSchema, deliveryIdParam);
    return ok(
      await this.protocolService.replayWebhookDelivery(
        appId,
        readProtocolAppToken(headers) ?? "",
        deliveryId,
      ),
    );
  }

  @Get("apps/:appId/delivery-queue")
  async inspectDeliveryQueue(
    @Param("appId") appIdParam: string,
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Query("cursor") cursor?: string,
  ) {
    const appId = parseRequestPayload(identifierSchema, appIdParam);
    return ok(
      await this.protocolService.inspectDeliveryQueue(
        appId,
        readProtocolAppToken(headers) ?? "",
        cursor,
      ),
    );
  }

  @Get("apps/:appId/usage")
  async getAppUsageSummary(
    @Param("appId") appIdParam: string,
    @Headers() headers: Record<string, string | string[] | undefined>,
  ) {
    const appId = parseRequestPayload(identifierSchema, appIdParam);
    return ok(
      await this.protocolService.getAppUsageSummary(
        appId,
        readProtocolAppToken(headers) ?? "",
      ),
    );
  }

  @Post("delivery-queue/dispatch-due")
  async dispatchGlobalDueWebhookDeliveries(
    @Headers("x-cron-key") cronKeyHeader?: string | string[],
    @Body() body?: unknown,
  ) {
    this.assertCronAccessAllowed(cronKeyHeader);
    const payload = parseRequestPayload(
      protocolWebhookDeliveryRunRequestSchema,
      body ?? {},
    );
    return ok(
      await this.protocolService.dispatchGlobalDueWebhookDeliveries({
        limit: payload.limit,
        source: "cron",
      }),
    );
  }

  @Post("apps/:appId/delivery-queue/run")
  async runDueWebhookDeliveries(
    @Param("appId") appIdParam: string,
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Body() body: unknown,
  ) {
    const appId = parseRequestPayload(identifierSchema, appIdParam);
    const payload = parseRequestPayload(
      protocolWebhookDeliveryRunRequestSchema,
      body ?? {},
    );
    return ok(
      await this.protocolService.runDueWebhookDeliveries(
        appId,
        readProtocolAppToken(headers) ?? "",
        payload,
      ),
    );
  }

  @Post("apps/:appId/delivery-queue/dispatch")
  async dispatchDueWebhookDeliveries(
    @Param("appId") appIdParam: string,
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Body() body: unknown,
  ) {
    const appId = parseRequestPayload(identifierSchema, appIdParam);
    const payload = parseRequestPayload(
      protocolWebhookDeliveryRunRequestSchema,
      body ?? {},
    );
    return ok(
      await this.protocolService.dispatchDueWebhookDeliveries(
        appId,
        readProtocolAppToken(headers) ?? "",
        payload,
      ),
    );
  }

  private assertCronAccessAllowed(cronKeyHeader?: string | string[]) {
    const requiredCronKey = process.env.PROTOCOL_DELIVERY_CRON_KEY?.trim();
    const environment = (process.env.NODE_ENV ?? "").trim().toLowerCase();
    if (!requiredCronKey) {
      if (environment === "production") {
        throw new ForbiddenException(
          "protocol delivery dispatch endpoint is disabled without PROTOCOL_DELIVERY_CRON_KEY",
        );
      }
      return;
    }
    const providedCronKey = Array.isArray(cronKeyHeader)
      ? cronKeyHeader[0]
      : cronKeyHeader;
    if (
      !this.constantTimeEqual(providedCronKey?.trim() ?? "", requiredCronKey)
    ) {
      throw new ForbiddenException("invalid cron key");
    }
  }

  private constantTimeEqual(left: string, right: string) {
    const leftBuffer = Buffer.from(left);
    const rightBuffer = Buffer.from(right);
    if (leftBuffer.length !== rightBuffer.length) {
      return false;
    }
    return timingSafeEqual(leftBuffer, rightBuffer);
  }

  @Post("apps/:appId/actions/intents")
  async createIntentAction(
    @Param("appId") appIdParam: string,
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Body() body: unknown,
  ) {
    const appId = parseRequestPayload(identifierSchema, appIdParam);
    const payload = parseRequestPayload(protocolIntentCreateActionSchema, body);
    return ok(
      await this.protocolService.createIntentAction(
        appId,
        readProtocolAppToken(headers) ?? "",
        payload,
      ),
    );
  }

  @Post("apps/:appId/actions/requests")
  async sendRequestAction(
    @Param("appId") appIdParam: string,
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Body() body: unknown,
  ) {
    const appId = parseRequestPayload(identifierSchema, appIdParam);
    const payload = parseRequestPayload(
      protocolIntentRequestSendActionSchema,
      body,
    );
    return ok(
      await this.protocolService.sendRequestAction(
        appId,
        readProtocolAppToken(headers) ?? "",
        payload,
      ),
    );
  }

  @Post("apps/:appId/actions/requests/:requestId/accept")
  async acceptRequestAction(
    @Param("appId") appIdParam: string,
    @Param("requestId") requestIdParam: string,
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Body() body: unknown,
  ) {
    const appId = parseRequestPayload(identifierSchema, appIdParam);
    const requestId = parseRequestPayload(uuidSchema, requestIdParam);
    const payload = parseRequestPayload(
      protocolRequestDecisionActionSchema,
      body,
    );
    return ok(
      await this.protocolService.acceptRequestAction(
        appId,
        readProtocolAppToken(headers) ?? "",
        requestId,
        payload,
      ),
    );
  }

  @Post("apps/:appId/actions/requests/:requestId/reject")
  async rejectRequestAction(
    @Param("appId") appIdParam: string,
    @Param("requestId") requestIdParam: string,
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Body() body: unknown,
  ) {
    const appId = parseRequestPayload(identifierSchema, appIdParam);
    const requestId = parseRequestPayload(uuidSchema, requestIdParam);
    const payload = parseRequestPayload(
      protocolRequestDecisionActionSchema,
      body,
    );
    return ok(
      await this.protocolService.rejectRequestAction(
        appId,
        readProtocolAppToken(headers) ?? "",
        requestId,
        payload,
      ),
    );
  }

  @Post("apps/:appId/actions/chats/:chatId/messages")
  async sendChatMessageAction(
    @Param("appId") appIdParam: string,
    @Param("chatId") chatIdParam: string,
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Body() body: unknown,
  ) {
    const appId = parseRequestPayload(identifierSchema, appIdParam);
    const chatId = parseRequestPayload(uuidSchema, chatIdParam);
    const payload = parseRequestPayload(
      protocolChatSendMessageActionSchema,
      body,
    );
    return ok(
      await this.protocolService.sendChatMessageAction(
        appId,
        readProtocolAppToken(headers) ?? "",
        chatId,
        payload,
      ),
    );
  }

  @Get("apps/:appId/events/replay")
  async replayEvents(
    @Param("appId") appIdParam: string,
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Query("cursor") cursor?: string,
  ) {
    const appId = parseRequestPayload(identifierSchema, appIdParam);
    return ok(
      await this.protocolService.replayEvents(
        appId,
        readProtocolAppToken(headers) ?? "",
        cursor,
      ),
    );
  }

  @Get("apps/:appId/events/cursor")
  async getReplayCursor(
    @Param("appId") appIdParam: string,
    @Headers() headers: Record<string, string | string[] | undefined>,
  ) {
    const appId = parseRequestPayload(identifierSchema, appIdParam);
    return ok(
      this.protocolService.getReplayCursor(
        appId,
        readProtocolAppToken(headers) ?? "",
      ),
    );
  }

  @Post("apps/:appId/events/cursor")
  async saveReplayCursor(
    @Param("appId") appIdParam: string,
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Body() body: unknown,
  ) {
    const appId = parseRequestPayload(identifierSchema, appIdParam);
    const payload = parseRequestPayload(
      protocolReplayCursorSchema.pick({ cursor: true }).extend({}),
      body,
    );
    return ok(
      this.protocolService.saveReplayCursor(
        appId,
        readProtocolAppToken(headers) ?? "",
        payload.cursor,
      ),
    );
  }
}
