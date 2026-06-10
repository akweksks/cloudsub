CREATE TABLE IF NOT EXISTS sub_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token VARCHAR(255) NOT NULL UNIQUE,
  remark VARCHAR(255),
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  plan_name VARCHAR(255) NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_access_at TIMESTAMP DEFAULT NULL
);

CREATE TABLE IF NOT EXISTS redeem_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code VARCHAR(255) NOT NULL UNIQUE,
  plan_name VARCHAR(255) NOT NULL,
  duration_days INTEGER NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'unused',
  used_by_user_id INTEGER DEFAULT NULL,
  used_at TIMESTAMP DEFAULT NULL,
  expires_at TIMESTAMP DEFAULT NULL,
  remark VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sub_users_token ON sub_users(token);
CREATE INDEX IF NOT EXISTS idx_sub_users_status ON sub_users(status);
CREATE INDEX IF NOT EXISTS idx_redeem_codes_code ON redeem_codes(code);
CREATE INDEX IF NOT EXISTS idx_redeem_codes_status ON redeem_codes(status);
