ALTER TABLE IF EXISTS "users"
ADD COLUMN IF NOT EXISTS "username" TEXT;

ALTER TABLE IF EXISTS "user_profiles"
ADD COLUMN IF NOT EXISTS "onboarding_state" TEXT NOT NULL DEFAULT 'not_started';

DO $$
BEGIN
  IF to_regclass('public.users') IS NOT NULL
     AND to_regclass('public.user_sessions') IS NULL THEN
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

        CONSTRAINT "user_sessions_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "user_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
    );
  END IF;
END
$$;

DO $$
BEGIN
  IF to_regclass('public.users') IS NOT NULL THEN
    EXECUTE 'CREATE UNIQUE INDEX IF NOT EXISTS "users_username_key" ON "users"("username")';
  END IF;
END
$$;

DO $$
BEGIN
  IF to_regclass('public.user_sessions') IS NOT NULL THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS "user_sessions_user_id_status_last_used_at_idx" ON "user_sessions"("user_id", "status", "last_used_at")';
    EXECUTE 'CREATE INDEX IF NOT EXISTS "user_sessions_expires_at_status_idx" ON "user_sessions"("expires_at", "status")';
  END IF;
END
$$;
