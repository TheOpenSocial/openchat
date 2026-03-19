-- CreateTable
CREATE TABLE "user_topics" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "normalized_label" TEXT NOT NULL,
    "weight" DECIMAL(4,2) NOT NULL DEFAULT 1.0,
    "source" TEXT NOT NULL DEFAULT 'user',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_topics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_availability_windows" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "day_of_week" INTEGER NOT NULL,
    "start_minute" INTEGER NOT NULL,
    "end_minute" INTEGER NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'available',
    "timezone" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_availability_windows_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "user_availability_windows_day_of_week_check" CHECK ("day_of_week" BETWEEN 0 AND 6),
    CONSTRAINT "user_availability_windows_start_minute_check" CHECK ("start_minute" BETWEEN 0 AND 1439),
    CONSTRAINT "user_availability_windows_end_minute_check" CHECK ("end_minute" BETWEEN 1 AND 1440),
    CONSTRAINT "user_availability_windows_window_order_check" CHECK ("start_minute" < "end_minute")
);

-- CreateTable
CREATE TABLE "inferred_preferences" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "preference_key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "confidence" DECIMAL(4,3) NOT NULL,
    "source_signal" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inferred_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "explicit_preferences" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "scope" TEXT NOT NULL,
    "preference_key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'user',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "explicit_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "preference_feedback_events" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "preference_key" TEXT NOT NULL,
    "feedback_type" TEXT NOT NULL,
    "signal_strength" DECIMAL(4,3) NOT NULL,
    "context" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "preference_feedback_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_messages_archive" (
    "id" UUID NOT NULL,
    "source_message_id" UUID NOT NULL,
    "chat_id" UUID NOT NULL,
    "sender_user_id" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "moderation_state" "ModerationState" NOT NULL,
    "original_created_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_messages_archive_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs_archive" (
    "id" UUID NOT NULL,
    "source_audit_log_id" UUID NOT NULL,
    "actor_user_id" UUID,
    "actor_type" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" UUID,
    "metadata" JSONB,
    "original_created_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_archive_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_topics_user_id_normalized_label_key" ON "user_topics"("user_id", "normalized_label");

-- CreateIndex
CREATE INDEX "user_topics_user_id_normalized_label_idx" ON "user_topics"("user_id", "normalized_label");

-- CreateIndex
CREATE INDEX "user_availability_windows_user_id_day_of_week_idx" ON "user_availability_windows"("user_id", "day_of_week");

-- CreateIndex
CREATE INDEX "user_availability_windows_user_id_start_minute_end_minute_idx" ON "user_availability_windows"("user_id", "start_minute", "end_minute");

-- CreateIndex
CREATE INDEX "inferred_preferences_user_id_preference_key_idx" ON "inferred_preferences"("user_id", "preference_key");

-- CreateIndex
CREATE INDEX "explicit_preferences_user_id_scope_preference_key_idx" ON "explicit_preferences"("user_id", "scope", "preference_key");

-- CreateIndex
CREATE INDEX "preference_feedback_events_user_id_preference_key_created_at_idx" ON "preference_feedback_events"("user_id", "preference_key", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "chat_messages_archive_source_message_id_key" ON "chat_messages_archive"("source_message_id");

-- CreateIndex
CREATE INDEX "chat_messages_archive_chat_id_original_created_at_idx" ON "chat_messages_archive"("chat_id", "original_created_at");

-- CreateIndex
CREATE INDEX "chat_messages_archive_archived_at_idx" ON "chat_messages_archive"("archived_at");

-- CreateIndex
CREATE UNIQUE INDEX "audit_logs_archive_source_audit_log_id_key" ON "audit_logs_archive"("source_audit_log_id");

-- CreateIndex
CREATE INDEX "audit_logs_archive_entity_type_original_created_at_idx" ON "audit_logs_archive"("entity_type", "original_created_at");

-- CreateIndex
CREATE INDEX "audit_logs_archive_archived_at_idx" ON "audit_logs_archive"("archived_at");

-- CreateIndex
CREATE INDEX "intents_active_workload_idx" ON "intents"("updated_at", "id")
WHERE "status" IN ('draft', 'parsed', 'matching', 'fanout', 'partial');

-- CreateIndex
CREATE INDEX "intent_requests_pending_recipient_expires_idx" ON "intent_requests"("recipient_user_id", "expires_at")
WHERE "status" = 'pending';

-- CreateIndex
CREATE INDEX "intent_requests_pending_intent_sent_idx" ON "intent_requests"("intent_id", "sent_at")
WHERE "status" = 'pending';

-- Create ANN Index
DO $$
BEGIN
  BEGIN
    EXECUTE 'CREATE INDEX IF NOT EXISTS embeddings_vector_hnsw_idx ON "embeddings" USING hnsw ("vector" vector_cosine_ops)';
  EXCEPTION
    WHEN OTHERS THEN
      EXECUTE 'CREATE INDEX IF NOT EXISTS embeddings_vector_ivfflat_idx ON "embeddings" USING ivfflat ("vector" vector_cosine_ops) WITH (lists = 100)';
  END;
END $$;

-- AddForeignKey
ALTER TABLE "user_topics"
ADD CONSTRAINT "user_topics_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user_profiles"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_availability_windows"
ADD CONSTRAINT "user_availability_windows_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user_profiles"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inferred_preferences"
ADD CONSTRAINT "inferred_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "explicit_preferences"
ADD CONSTRAINT "explicit_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "preference_feedback_events"
ADD CONSTRAINT "preference_feedback_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
