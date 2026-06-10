ALTER TABLE redeem_codes ADD COLUMN subscription_expires_at TIMESTAMP DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_redeem_codes_subscription_expires_at
ON redeem_codes(subscription_expires_at);
