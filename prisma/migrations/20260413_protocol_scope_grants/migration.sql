CREATE TABLE "protocol_app_scope_grants" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "app_id" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "capabilities" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "subject_type" TEXT NOT NULL DEFAULT 'app',
    "subject_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "granted_by_user_id" UUID,
    "granted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMP(3),
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "protocol_app_scope_grants_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "protocol_app_scope_grants_app_id_scope_subject_type_subject_id_key"
ON "protocol_app_scope_grants"("app_id", "scope", "subject_type", "subject_id");

CREATE INDEX "protocol_app_scope_grants_app_id_status_created_at_idx"
ON "protocol_app_scope_grants"("app_id", "status", "created_at");
