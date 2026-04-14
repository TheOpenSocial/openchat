-- CreateEnum
CREATE TYPE "ProtocolConsentRequestStatus" AS ENUM (
  'pending',
  'approved',
  'rejected',
  'cancelled',
  'expired'
);

-- CreateTable
CREATE TABLE "protocol_app_consent_requests" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "app_id" TEXT NOT NULL,
  "scope" TEXT NOT NULL,
  "capabilities" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "subject_type" TEXT NOT NULL DEFAULT 'app',
  "subject_id" TEXT,
  "status" "ProtocolConsentRequestStatus" NOT NULL DEFAULT 'pending',
  "requested_by_user_id" UUID,
  "approved_by_user_id" UUID,
  "rejected_by_user_id" UUID,
  "approved_grant_id" UUID,
  "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "approved_at" TIMESTAMP(3),
  "rejected_at" TIMESTAMP(3),
  "cancelled_at" TIMESTAMP(3),
  "expired_at" TIMESTAMP(3),
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "protocol_app_consent_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "protocol_app_consent_requests_app_id_status_created_at_idx"
ON "protocol_app_consent_requests"("app_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "protocol_app_consent_requests_approved_grant_id_idx"
ON "protocol_app_consent_requests"("approved_grant_id");

-- AddForeignKey
ALTER TABLE "protocol_app_consent_requests"
ADD CONSTRAINT "protocol_app_consent_requests_app_id_fkey"
FOREIGN KEY ("app_id") REFERENCES "protocol_apps"("app_id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "protocol_app_consent_requests"
ADD CONSTRAINT "protocol_app_consent_requests_approved_grant_id_fkey"
FOREIGN KEY ("approved_grant_id") REFERENCES "protocol_app_scope_grants"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
