CREATE TABLE "agent_plan_checkpoints" (
  "id" UUID NOT NULL,
  "thread_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "trace_id" TEXT NOT NULL,
  "requested_by_role" TEXT NOT NULL,
  "tool" TEXT NOT NULL,
  "action_type" TEXT NOT NULL,
  "risk_level" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "request_metadata" JSONB,
  "decision_reason" TEXT,
  "resolved_by_user_id" UUID,
  "resolved_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "agent_plan_checkpoints_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "agent_plan_checkpoints_thread_id_status_created_at_idx"
  ON "agent_plan_checkpoints"("thread_id", "status", "created_at");

CREATE INDEX "agent_plan_checkpoints_user_id_status_created_at_idx"
  ON "agent_plan_checkpoints"("user_id", "status", "created_at");

ALTER TABLE "agent_plan_checkpoints"
  ADD CONSTRAINT "agent_plan_checkpoints_thread_id_fkey"
  FOREIGN KEY ("thread_id") REFERENCES "agent_threads"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "agent_plan_checkpoints"
  ADD CONSTRAINT "agent_plan_checkpoints_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
