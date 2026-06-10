ALTER TABLE sub_users ADD COLUMN access_count INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS subscription_access_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER DEFAULT NULL,
  token VARCHAR(255),
  status VARCHAR(32) NOT NULL,
  code INTEGER NOT NULL,
  message TEXT,
  ip VARCHAR(128),
  user_agent TEXT,
  accessed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_subscription_access_logs_user_id ON subscription_access_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_subscription_access_logs_status ON subscription_access_logs(status);
CREATE INDEX IF NOT EXISTS idx_subscription_access_logs_accessed_at ON subscription_access_logs(accessed_at);
