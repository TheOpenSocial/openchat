import { Module } from "@nestjs/common";
import { ProtocolController } from "./protocol.controller.js";
import { ProtocolService } from "./protocol.service.js";
import { ProtocolWebhookDeliveryRunnerService } from "./protocol-webhook-delivery-runner.service.js";
import { ProtocolWebhookDeliveryWorkerService } from "./protocol-webhook-delivery-worker.service.js";

@Module({
  controllers: [ProtocolController],
  providers: [
    ProtocolService,
    ProtocolWebhookDeliveryWorkerService,
    ProtocolWebhookDeliveryRunnerService,
  ],
  exports: [
    ProtocolService,
    ProtocolWebhookDeliveryWorkerService,
    ProtocolWebhookDeliveryRunnerService,
  ],
})
export class ProtocolModule {}
