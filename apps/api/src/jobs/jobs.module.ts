import { BullModule } from "@nestjs/bullmq";
import { Module, forwardRef } from "@nestjs/common";
import { AgentModule } from "../agent/agent.module.js";
import { ChatsModule } from "../chats/chats.module.js";
import { ConnectionsModule } from "../connections/connections.module.js";
import { ExecutionReconciliationModule } from "../execution-reconciliation/execution-reconciliation.module.js";
import { IntentsModule } from "../intents/intents.module.js";
import { ModerationModule } from "../moderation/moderation.module.js";
import { NotificationsModule } from "../notifications/notifications.module.js";
import { ProfilesModule } from "../profiles/profiles.module.js";
import { ProtocolModule } from "../protocol/protocol.module.js";
import { ScheduledTasksModule } from "../scheduled-tasks/scheduled-tasks.module.js";
import { VideoTranscriptsModule } from "../video-transcripts/video-transcripts.module.js";
import { DeadLetterService } from "./dead-letter.service.js";
import { OutboxRelayService } from "./outbox-relay.service.js";
import { AdminMaintenanceConsumer } from "./processors/admin-maintenance.consumer.js";
import { AsyncAgentFollowupConsumer } from "./processors/async-agent-followup.consumer.js";
import { CleanupConsumer } from "./processors/cleanup.consumer.js";
import { ConnectionSetupConsumer } from "./processors/connection-setup.consumer.js";
import { IntentProcessingConsumer } from "./processors/intent-processing.consumer.js";
import { MediaProcessingConsumer } from "./processors/media-processing.consumer.js";
import { ModerationConsumer } from "./processors/moderation.consumer.js";
import { ProtocolWebhookDeliveryConsumer } from "./processors/protocol-webhook-delivery.consumer.js";
import { ScheduledTasksConsumer } from "./processors/scheduled-tasks.consumer.js";

export const JOB_QUEUE_NAMES = [
  "intent-processing",
  "embedding",
  "matching",
  "request-fanout",
  "notification",
  "connection-setup",
  "moderation",
  "media-processing",
  "cleanup",
  "digests",
  "admin-maintenance",
  "scheduled-tasks",
  "protocol-webhooks",
];

@Module({
  imports: [
    BullModule.registerQueue(...JOB_QUEUE_NAMES.map((name) => ({ name }))),
    IntentsModule,
    ConnectionsModule,
    ChatsModule,
    ExecutionReconciliationModule,
    ProfilesModule,
    forwardRef(() => AgentModule),
    ModerationModule,
    NotificationsModule,
    ProtocolModule,
    ScheduledTasksModule,
    VideoTranscriptsModule,
  ],
  providers: [
    DeadLetterService,
    OutboxRelayService,
    IntentProcessingConsumer,
    ConnectionSetupConsumer,
    CleanupConsumer,
    ModerationConsumer,
    MediaProcessingConsumer,
    AsyncAgentFollowupConsumer,
    AdminMaintenanceConsumer,
    ProtocolWebhookDeliveryConsumer,
    ScheduledTasksConsumer,
  ],
  exports: [BullModule, DeadLetterService, OutboxRelayService],
})
export class JobsModule {}
