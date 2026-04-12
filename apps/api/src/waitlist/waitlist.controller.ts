import { Body, Controller, Headers, Ip, Post } from "@nestjs/common";
import {
  waitlistCreateBodySchema,
  waitlistCreateResponseSchema,
} from "@opensocial/types";
import { ok } from "../common/api-response.js";
import { parseRequestPayload } from "../common/validation.js";
import { PublicRoute } from "../auth/public-route.decorator.js";
import { WaitlistService } from "./waitlist.service.js";

@Controller("waitlist")
export class WaitlistController {
  constructor(private readonly waitlistService: WaitlistService) {}

  @PublicRoute()
  @Post()
  async create(
    @Body() body: unknown,
    @Ip() ipAddress: string,
    @Headers() headers: Record<string, string | string[] | undefined>,
  ) {
    const payload = parseRequestPayload(waitlistCreateBodySchema, body ?? {});
    const result = await this.waitlistService.createOrRefreshEntry({
      email: payload.email,
      source: payload.source,
      ipAddress,
      referer: readHeader(headers.referer),
      userAgent: readHeader(headers["user-agent"]),
    });

    return ok(parseRequestPayload(waitlistCreateResponseSchema, result));
  }
}

function readHeader(header: string | string[] | undefined) {
  if (Array.isArray(header)) {
    return header[0] ?? null;
  }

  return header ?? null;
}
