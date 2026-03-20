import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";
import { AgentModule } from "../agent/agent.module.js";
import { ConnectionsModule } from "../connections/connections.module.js";
import { IntentsModule } from "../intents/intents.module.js";
import { NotificationsModule } from "../notifications/notifications.module.js";
import { ProfilesModule } from "../profiles/profiles.module.js";
import { ScheduledTasksModule } from "../scheduled-tasks/scheduled-tasks.module.js";
import { DeadLetterService } from "./dead-letter.service.js";
import { OutboxRelayService } from "./outbox-relay.service.js";
import { AdminMaintenanceConsumer } from "./processors/admin-maintenance.consumer.js";
import { AsyncAgentFollowupConsumer } from "./processors/async-agent-followup.consumer.js";
import { ConnectionSetupConsumer } from "./processors/connection-setup.consumer.js";
import { IntentProcessingConsumer } from "./processors/intent-processing.consumer.js";
import { MediaProcessingConsumer } from "./processors/media-processing.consumer.js";
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
];

@Module({
  imports: [
    BullModule.registerQueue(...JOB_QUEUE_NAMES.map((name) => ({ name }))),
    IntentsModule,
    ConnectionsModule,
    ProfilesModule,
    AgentModule,
    NotificationsModule,
    ScheduledTasksModule,
  ],
  providers: [
    DeadLetterService,
    OutboxRelayService,
    IntentProcessingConsumer,
    ConnectionSetupConsumer,
    MediaProcessingConsumer,
    AsyncAgentFollowupConsumer,
    AdminMaintenanceConsumer,
    ScheduledTasksConsumer,
  ],
  exports: [BullModule, DeadLetterService, OutboxRelayService],
})
export class JobsModule {}
