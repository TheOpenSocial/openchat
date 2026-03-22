CREATE TABLE "client_mutations" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "scope" TEXT NOT NULL,
  "idempotency_key" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'processing',
  "response_body" JSONB,
  "error_code" TEXT,
  "error_message" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "client_mutations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "client_mutations_user_id_scope_idempotency_key_key"
  ON "client_mutations"("user_id", "scope", "idempotency_key");

CREATE INDEX "client_mutations_status_updated_at_idx"
  ON "client_mutations"("status", "updated_at");
