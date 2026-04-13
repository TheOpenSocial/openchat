import { Module } from "@nestjs/common";
import { ProtocolController } from "./protocol.controller.js";
import { ProtocolService } from "./protocol.service.js";
import { ProtocolWebhookDeliveryWorkerService } from "./protocol-webhook-delivery-worker.service.js";

@Module({
  controllers: [ProtocolController],
  providers: [ProtocolService, ProtocolWebhookDeliveryWorkerService],
  exports: [ProtocolService, ProtocolWebhookDeliveryWorkerService],
})
export class ProtocolModule {}
