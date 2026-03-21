-- AlterTable
ALTER TABLE "moderation_flags"
  ADD COLUMN IF NOT EXISTS "assignee_user_id" UUID,
  ADD COLUMN IF NOT EXISTS "assignment_note" TEXT,
  ADD COLUMN IF NOT EXISTS "assigned_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "last_decision" TEXT,
  ADD COLUMN IF NOT EXISTS "triage_note" TEXT,
  ADD COLUMN IF NOT EXISTS "triaged_by_admin_user_id" UUID,
  ADD COLUMN IF NOT EXISTS "triaged_at" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "moderation_flags_assignee_user_id_status_idx"
ON "moderation_flags"("assignee_user_id", "status");
