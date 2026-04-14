CREATE TABLE IF NOT EXISTS protocol_webhook_delivery_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id TEXT NOT NULL,
  app_id TEXT NOT NULL,
  subscription_id TEXT NOT NULL,
  attempt_number INTEGER NOT NULL,
  outcome TEXT NOT NULL,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  response_status_code INTEGER,
  error_code TEXT,
  error_message TEXT,
  duration_ms INTEGER,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS protocol_webhook_delivery_attempts_delivery_attempted_idx
  ON protocol_webhook_delivery_attempts (delivery_id, attempted_at DESC);

CREATE INDEX IF NOT EXISTS protocol_webhook_delivery_attempts_app_subscription_attempted_idx
  ON protocol_webhook_delivery_attempts (app_id, subscription_id, attempted_at DESC);
