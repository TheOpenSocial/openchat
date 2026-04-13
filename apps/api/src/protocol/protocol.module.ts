import { Module } from "@nestjs/common";
import { ProtocolController } from "./protocol.controller.js";
import { ProtocolService } from "./protocol.service.js";

@Module({
  controllers: [ProtocolController],
  providers: [ProtocolService],
  exports: [ProtocolService],
})
export class ProtocolModule {}
