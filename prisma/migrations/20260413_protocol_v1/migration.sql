-- CreateTable
CREATE TABLE "protocol_apps" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "app_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "registration_json" JSONB NOT NULL,
    "manifest_json" JSONB NOT NULL,
    "issued_scopes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "issued_capabilities" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "app_token_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "protocol_apps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "protocol_webhook_subscriptions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "subscription_id" TEXT NOT NULL,
    "app_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "target_url" TEXT NOT NULL,
    "event_names" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "resource_names" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "delivery_mode" TEXT NOT NULL DEFAULT 'json',
    "retry_policy" JSONB NOT NULL,
    "secret_ref" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "protocol_webhook_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "protocol_webhook_deliveries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "delivery_id" TEXT NOT NULL,
    "subscription_id" TEXT NOT NULL,
    "app_id" TEXT NOT NULL,
    "event_cursor" BIGINT,
    "event_name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" TIMESTAMP(3),
    "last_attempt_at" TIMESTAMP(3),
    "delivered_at" TIMESTAMP(3),
    "response_status_code" INTEGER,
    "error_message" TEXT,
    "signature" TEXT,
    "payload" JSONB NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "protocol_webhook_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "protocol_event_log" (
    "cursor" BIGSERIAL NOT NULL,
    "event_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "actor_app_id" TEXT,
    "event_name" TEXT NOT NULL,
    "resource" TEXT,
    "payload" JSONB NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "protocol_event_log_pkey" PRIMARY KEY ("cursor")
);

-- CreateTable
CREATE TABLE "protocol_event_cursors" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "app_id" TEXT NOT NULL,
    "cursor" BIGINT NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "protocol_event_cursors_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "protocol_apps_app_id_key" ON "protocol_apps"("app_id");

-- CreateIndex
CREATE INDEX "protocol_apps_status_created_at_idx" ON "protocol_apps"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "protocol_webhook_subscriptions_subscription_id_key" ON "protocol_webhook_subscriptions"("subscription_id");

-- CreateIndex
CREATE INDEX "protocol_webhook_subscriptions_app_id_status_created_at_idx" ON "protocol_webhook_subscriptions"("app_id", "status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "protocol_webhook_deliveries_delivery_id_key" ON "protocol_webhook_deliveries"("delivery_id");

-- CreateIndex
CREATE INDEX "protocol_webhook_deliveries_subscription_id_status_created_at_idx" ON "protocol_webhook_deliveries"("subscription_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "protocol_webhook_deliveries_app_id_event_name_created_at_idx" ON "protocol_webhook_deliveries"("app_id", "event_name", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "protocol_event_log_event_id_key" ON "protocol_event_log"("event_id");

-- CreateIndex
CREATE INDEX "protocol_event_log_actor_app_id_cursor_idx" ON "protocol_event_log"("actor_app_id", "cursor");

-- CreateIndex
CREATE INDEX "protocol_event_log_event_name_cursor_idx" ON "protocol_event_log"("event_name", "cursor");

-- CreateIndex
CREATE UNIQUE INDEX "protocol_event_cursors_app_id_key" ON "protocol_event_cursors"("app_id");
