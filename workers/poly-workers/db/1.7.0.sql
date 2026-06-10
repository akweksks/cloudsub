CREATE TABLE IF NOT EXISTS routing_profiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name VARCHAR(255) NOT NULL UNIQUE,
  description TEXT,
  source_type VARCHAR(32) NOT NULL DEFAULT 'custom',
  content_ref TEXT NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  is_default BOOLEAN NOT NULL DEFAULT 0,
  allow_user_select BOOLEAN NOT NULL DEFAULT 1,
  client_support TEXT NOT NULL DEFAULT '["clash"]',
  usage_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE sub_users ADD COLUMN routing_profile_id INTEGER DEFAULT NULL;
ALTER TABLE subscription_plans ADD COLUMN routing_profile_id INTEGER DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_routing_profiles_status ON routing_profiles(status);
CREATE INDEX IF NOT EXISTS idx_routing_profiles_default ON routing_profiles(is_default);
CREATE INDEX IF NOT EXISTS idx_sub_users_routing_profile_id ON sub_users(routing_profile_id);
CREATE INDEX IF NOT EXISTS idx_subscription_plans_routing_profile_id ON subscription_plans(routing_profile_id);
