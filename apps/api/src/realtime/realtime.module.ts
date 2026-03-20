import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { ChatsModule } from "../chats/chats.module.js";
import { RealtimeEventsService } from "./realtime-events.service.js";
import { RealtimeGateway } from "./realtime.gateway.js";

@Module({
  imports: [ChatsModule, AuthModule],
  providers: [RealtimeGateway, RealtimeEventsService],
  exports: [RealtimeEventsService, RealtimeGateway],
})
export class RealtimeModule {}
