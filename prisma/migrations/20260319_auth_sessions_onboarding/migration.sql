-- AlterTable
ALTER TABLE "users"
ADD COLUMN "username" TEXT;

-- AlterTable
ALTER TABLE "user_profiles"
ADD COLUMN "onboarding_state" TEXT NOT NULL DEFAULT 'not_started';

-- CreateTable
CREATE TABLE "user_sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "device_id" TEXT,
    "device_name" TEXT,
    "user_agent" TEXT,
    "ip_address" TEXT,
    "refresh_token_hash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "expires_at" TIMESTAMP(3) NOT NULL,
    "last_used_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE INDEX "user_sessions_user_id_status_last_used_at_idx" ON "user_sessions"("user_id", "status", "last_used_at");

-- CreateIndex
CREATE INDEX "user_sessions_expires_at_status_idx" ON "user_sessions"("expires_at", "status");

-- AddForeignKey
ALTER TABLE "user_sessions"
ADD CONSTRAINT "user_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
