CREATE TABLE IF NOT EXISTS clash_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name VARCHAR(255) NOT NULL UNIQUE,
  description TEXT,
  yaml_content TEXT NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT 0,
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS subscription_plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name VARCHAR(255) NOT NULL UNIQUE,
  duration_days INTEGER NOT NULL,
  template_id INTEGER DEFAULT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  sort_order INTEGER NOT NULL DEFAULT 0,
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE redeem_codes ADD COLUMN plan_id INTEGER DEFAULT NULL;
ALTER TABLE sub_users ADD COLUMN plan_id INTEGER DEFAULT NULL;
ALTER TABLE sub_users ADD COLUMN template_id INTEGER DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_subscription_plans_status ON subscription_plans(status);
CREATE INDEX IF NOT EXISTS idx_clash_templates_status ON clash_templates(status);
CREATE INDEX IF NOT EXISTS idx_redeem_codes_plan_id ON redeem_codes(plan_id);
CREATE INDEX IF NOT EXISTS idx_sub_users_plan_id ON sub_users(plan_id);

INSERT INTO clash_templates (name, description, yaml_content, is_default, status, created_at, updated_at)
SELECT
  '默认模板',
  '系统默认 Clash 模板。未配置自定义模板时使用通用配置、分组和规则生成订阅。',
  'mixed-port: 7890
allow-lan: false
bind-address: "*"
mode: rule
log-level: info
external-controller: 127.0.0.1:9090
unified-delay: true
tcp-concurrent: true
dns:
  enable: true
  ipv6: false
  default-nameserver:
    - 223.5.5.5
    - 119.29.29.29
  enhanced-mode: fake-ip
  fake-ip-range: 198.18.0.1/16
  use-hosts: true
  nameserver:
    - https://dns.alidns.com/dns-query
    - https://doh.pub/dns-query
  fallback:
    - https://dns.alidns.com/dns-query
    - https://doh.pub/dns-query
  fallback-filter:
    geoip: true
    ipcidr:
      - 240.0.0.0/4
      - 0.0.0.0/32
',
  1,
  'active',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM clash_templates);

INSERT INTO subscription_plans (name, duration_days, template_id, status, sort_order, description, created_at, updated_at)
SELECT '月卡', 30, (SELECT id FROM clash_templates WHERE is_default = 1 LIMIT 1), 'active', 10, '30 天订阅套餐', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM subscription_plans WHERE name = '月卡');

INSERT INTO subscription_plans (name, duration_days, template_id, status, sort_order, description, created_at, updated_at)
SELECT '季卡', 90, (SELECT id FROM clash_templates WHERE is_default = 1 LIMIT 1), 'active', 20, '90 天订阅套餐', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM subscription_plans WHERE name = '季卡');

INSERT INTO subscription_plans (name, duration_days, template_id, status, sort_order, description, created_at, updated_at)
SELECT '半年卡', 180, (SELECT id FROM clash_templates WHERE is_default = 1 LIMIT 1), 'active', 30, '180 天订阅套餐', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM subscription_plans WHERE name = '半年卡');

INSERT INTO subscription_plans (name, duration_days, template_id, status, sort_order, description, created_at, updated_at)
SELECT '年卡', 365, (SELECT id FROM clash_templates WHERE is_default = 1 LIMIT 1), 'active', 40, '365 天订阅套餐', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM subscription_plans WHERE name = '年卡');
