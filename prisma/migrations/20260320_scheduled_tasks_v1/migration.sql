-- Scheduled tasks, runs, and saved searches (UQ-05 v1)

CREATE TABLE IF NOT EXISTS "scheduled_tasks" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "task_type" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'active',
  "schedule_type" TEXT NOT NULL,
  "schedule_config" JSONB NOT NULL,
  "task_config" JSONB NOT NULL,
  "last_run_at" TIMESTAMPTZ,
  "next_run_at" TIMESTAMPTZ,
  "last_success_at" TIMESTAMPTZ,
  "last_failure_at" TIMESTAMPTZ,
  "last_failure_reason" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "scheduled_tasks_user_id_status_idx"
  ON "scheduled_tasks" ("user_id", "status");

CREATE INDEX IF NOT EXISTS "scheduled_tasks_status_next_run_at_idx"
  ON "scheduled_tasks" ("status", "next_run_at");

CREATE TABLE IF NOT EXISTS "scheduled_task_runs" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "scheduled_task_id" UUID NOT NULL REFERENCES "scheduled_tasks"("id") ON DELETE CASCADE,
  "user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "status" TEXT NOT NULL,
  "triggered_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "started_at" TIMESTAMPTZ,
  "finished_at" TIMESTAMPTZ,
  "trace_id" UUID,
  "result_summary" TEXT,
  "result_payload" JSONB,
  "skip_reason" TEXT,
  "failure_reason" TEXT,
  "created_notification_id" UUID,
  "created_agent_message_id" UUID,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "scheduled_task_runs_task_triggered_at_idx"
  ON "scheduled_task_runs" ("scheduled_task_id", "triggered_at");

CREATE INDEX IF NOT EXISTS "scheduled_task_runs_user_triggered_at_idx"
  ON "scheduled_task_runs" ("user_id", "triggered_at");

CREATE TABLE IF NOT EXISTS "saved_searches" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "title" TEXT NOT NULL,
  "search_type" TEXT NOT NULL,
  "query_config" JSONB NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "saved_searches_user_type_idx"
  ON "saved_searches" ("user_id", "search_type");
