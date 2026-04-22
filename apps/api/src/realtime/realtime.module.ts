import { Module, forwardRef } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { ChatsModule } from "../chats/chats.module.js";
import { RealtimeEventsService } from "./realtime-events.service.js";
import { RealtimeGateway } from "./realtime.gateway.js";
import { PresenceService } from "./presence.service.js";

@Module({
  imports: [forwardRef(() => ChatsModule), AuthModule],
  providers: [RealtimeGateway, RealtimeEventsService, PresenceService],
  exports: [RealtimeEventsService, RealtimeGateway, PresenceService],
})
export class RealtimeModule {}
