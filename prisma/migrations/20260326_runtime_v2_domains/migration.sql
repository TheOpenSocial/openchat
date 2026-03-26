-- Runtime v2 domain-complete persistence models:
-- dating consent artifacts + commerce listing/offer/escrow/dispute lifecycle
-- + workflow-domain intent ledger.

DO $$ BEGIN
  CREATE TYPE "DatingConsentStatus" AS ENUM ('pending', 'granted', 'revoked');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "DatingVerificationStatus" AS ENUM ('unverified', 'verified', 'rejected');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "CommerceListingStatus" AS ENUM ('active', 'paused', 'removed', 'fulfilled');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "CommerceOfferStatus" AS ENUM (
    'proposed',
    'countered',
    'accepted',
    'rejected',
    'expired',
    'cancelled',
    'escrowed',
    'fulfilled',
    'disputed'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "CommerceEscrowStatus" AS ENUM (
    'not_started',
    'pending_funding',
    'funded',
    'released',
    'refunded',
    'frozen'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "CommerceDisputeStatus" AS ENUM (
    'open',
    'under_review',
    'resolved_refund',
    'resolved_release',
    'rejected'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "workflow_domain_intents" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "domain" TEXT NOT NULL,
  "raw_text" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "workflow_run_id" TEXT NOT NULL,
  "trace_id" TEXT NOT NULL,
  "metadata" JSONB,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "workflow_domain_intents_user_domain_created_at_idx"
  ON "workflow_domain_intents"("user_id", "domain", "created_at");
CREATE INDEX IF NOT EXISTS "workflow_domain_intents_workflow_run_id_idx"
  ON "workflow_domain_intents"("workflow_run_id");

CREATE TABLE IF NOT EXISTS "dating_consent_artifacts" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "target_user_id" UUID NOT NULL,
  "scope" TEXT NOT NULL,
  "consent_status" "DatingConsentStatus" NOT NULL DEFAULT 'pending',
  "verification_status" "DatingVerificationStatus" NOT NULL DEFAULT 'unverified',
  "reason" TEXT,
  "expires_at" TIMESTAMPTZ,
  "workflow_run_id" TEXT NOT NULL,
  "trace_id" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "dating_consent_artifacts_user_target_status_idx"
  ON "dating_consent_artifacts"("user_id", "target_user_id", "consent_status");
CREATE INDEX IF NOT EXISTS "dating_consent_artifacts_workflow_run_id_idx"
  ON "dating_consent_artifacts"("workflow_run_id");

CREATE TABLE IF NOT EXISTS "commerce_listings" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "seller_user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "category" TEXT NOT NULL,
  "price" DECIMAL(12, 2) NOT NULL,
  "currency" TEXT NOT NULL,
  "quantity" INTEGER,
  "status" "CommerceListingStatus" NOT NULL DEFAULT 'active',
  "metadata" JSONB,
  "workflow_run_id" TEXT NOT NULL,
  "trace_id" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "commerce_listings_seller_status_created_at_idx"
  ON "commerce_listings"("seller_user_id", "status", "created_at");
CREATE INDEX IF NOT EXISTS "commerce_listings_workflow_run_id_idx"
  ON "commerce_listings"("workflow_run_id");

CREATE TABLE IF NOT EXISTS "commerce_offers" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "listing_id" UUID NOT NULL REFERENCES "commerce_listings"("id") ON DELETE CASCADE,
  "buyer_user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "seller_user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "offer_price" DECIMAL(12, 2) NOT NULL,
  "currency" TEXT NOT NULL,
  "message" TEXT,
  "status" "CommerceOfferStatus" NOT NULL DEFAULT 'proposed',
  "metadata" JSONB,
  "workflow_run_id" TEXT NOT NULL,
  "trace_id" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "commerce_offers_listing_status_created_at_idx"
  ON "commerce_offers"("listing_id", "status", "created_at");
CREATE INDEX IF NOT EXISTS "commerce_offers_buyer_status_created_at_idx"
  ON "commerce_offers"("buyer_user_id", "status", "created_at");
CREATE INDEX IF NOT EXISTS "commerce_offers_seller_status_created_at_idx"
  ON "commerce_offers"("seller_user_id", "status", "created_at");
CREATE INDEX IF NOT EXISTS "commerce_offers_workflow_run_id_idx"
  ON "commerce_offers"("workflow_run_id");

CREATE TABLE IF NOT EXISTS "commerce_escrows" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "offer_id" UUID NOT NULL UNIQUE REFERENCES "commerce_offers"("id") ON DELETE CASCADE,
  "status" "CommerceEscrowStatus" NOT NULL DEFAULT 'not_started',
  "amount" DECIMAL(12, 2) NOT NULL,
  "currency" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "provider_ref" TEXT,
  "freeze_reason" TEXT,
  "released_at" TIMESTAMPTZ,
  "refunded_at" TIMESTAMPTZ,
  "workflow_run_id" TEXT NOT NULL,
  "trace_id" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "commerce_escrows_status_updated_at_idx"
  ON "commerce_escrows"("status", "updated_at");
CREATE INDEX IF NOT EXISTS "commerce_escrows_workflow_run_id_idx"
  ON "commerce_escrows"("workflow_run_id");

CREATE TABLE IF NOT EXISTS "commerce_disputes" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "offer_id" UUID NOT NULL REFERENCES "commerce_offers"("id") ON DELETE CASCADE,
  "opened_by_user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "reason" TEXT NOT NULL,
  "status" "CommerceDisputeStatus" NOT NULL DEFAULT 'open',
  "resolution_note" TEXT,
  "workflow_run_id" TEXT NOT NULL,
  "trace_id" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "commerce_disputes_offer_status_created_at_idx"
  ON "commerce_disputes"("offer_id", "status", "created_at");
CREATE INDEX IF NOT EXISTS "commerce_disputes_opened_by_created_at_idx"
  ON "commerce_disputes"("opened_by_user_id", "created_at");
CREATE INDEX IF NOT EXISTS "commerce_disputes_workflow_run_id_idx"
  ON "commerce_disputes"("workflow_run_id");
