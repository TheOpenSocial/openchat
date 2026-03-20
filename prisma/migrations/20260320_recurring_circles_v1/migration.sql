CREATE TABLE "recurring_circles" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "owner_user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "status" TEXT NOT NULL DEFAULT 'active',
  "visibility" TEXT NOT NULL DEFAULT 'invite_only',
  "topic_tags" JSONB,
  "target_size" INTEGER,
  "cadence_type" TEXT NOT NULL,
  "cadence_config" JSONB NOT NULL,
  "kickoff_prompt" TEXT,
  "last_session_at" TIMESTAMPTZ,
  "next_session_at" TIMESTAMPTZ,
  "last_failure_at" TIMESTAMPTZ,
  "last_failure_reason" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX "recurring_circles_owner_user_id_status_idx"
  ON "recurring_circles" ("owner_user_id", "status");

CREATE INDEX "recurring_circles_status_next_session_at_idx"
  ON "recurring_circles" ("status", "next_session_at");

CREATE TABLE "recurring_circle_members" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "circle_id" UUID NOT NULL REFERENCES "recurring_circles"("id") ON DELETE CASCADE,
  "user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "role" TEXT NOT NULL DEFAULT 'member',
  "status" TEXT NOT NULL DEFAULT 'active',
  "invited_by_user_id" UUID,
  "joined_at" TIMESTAMPTZ,
  "left_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "recurring_circle_members_circle_id_user_id_key" UNIQUE ("circle_id", "user_id")
);

CREATE INDEX "recurring_circle_members_user_id_status_idx"
  ON "recurring_circle_members" ("user_id", "status");

CREATE INDEX "recurring_circle_members_circle_id_status_idx"
  ON "recurring_circle_members" ("circle_id", "status");

CREATE TABLE "recurring_circle_sessions" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "circle_id" UUID NOT NULL REFERENCES "recurring_circles"("id") ON DELETE CASCADE,
  "scheduled_for" TIMESTAMPTZ NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'scheduled',
  "generated_intent_id" UUID,
  "summary" TEXT,
  "started_at" TIMESTAMPTZ,
  "ended_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX "recurring_circle_sessions_circle_id_scheduled_for_idx"
  ON "recurring_circle_sessions" ("circle_id", "scheduled_for");

CREATE INDEX "recurring_circle_sessions_status_scheduled_for_idx"
  ON "recurring_circle_sessions" ("status", "scheduled_for");
