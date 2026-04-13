import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
} from "@nestjs/common";
import {
  appRegistrationRequestSchema,
  identifierSchema,
  protocolReplayCursorSchema,
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
