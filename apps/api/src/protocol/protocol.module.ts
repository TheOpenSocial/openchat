import { BullModule } from "@nestjs/bullmq";
import { Module, forwardRef } from "@nestjs/common";
import { ChatsModule } from "../chats/chats.module.js";
import { InboxModule } from "../inbox/inbox.module.js";
import { IntentsModule } from "../intents/intents.module.js";
import { ProtocolController } from "./protocol.controller.js";
import { ProtocolService } from "./protocol.service.js";
import { ProtocolWebhookDeliveryRunnerService } from "./protocol-webhook-delivery-runner.service.js";
import { ProtocolWebhookDeliveryWorkerService } from "./protocol-webhook-delivery-worker.service.js";

@Module({
  imports: [
    BullModule.registerQueue({ name: "protocol-webhooks" }),
    IntentsModule,
    InboxModule,
    forwardRef(() => ChatsModule),
  ],
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
