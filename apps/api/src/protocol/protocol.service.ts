import { Injectable } from "@nestjs/common";
import { buildProtocolManifest } from "@opensocial/protocol-server";

@Injectable()
export class ProtocolService {
  getManifest() {
    return buildProtocolManifest({
      appId: "opensocial-api",
      version: "0.1.0",
      homepageUrl: process.env.APP_BASE_URL?.trim() || undefined,
      metadata: {
        environment: process.env.NODE_ENV ?? "development",
      },
    });
  }
}
