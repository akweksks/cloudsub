const DEFAULT_ADMIN_PASSWORD = "admin235";

const baseStatements = [
  `CREATE TABLE IF NOT EXISTS airports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name VARCHAR(255) NOT NULL,
    subscription_url VARCHAR(255) NOT NULL,
    remarks TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_enabled BOOLEAN DEFAULT 1
  )`,
  `CREATE TABLE IF NOT EXISTS airport_nodes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    airport_id INTEGER NOT NULL,
    node_name TEXT NOT NULL,
    node_type VARCHAR(32),
    server VARCHAR(255),
    port INTEGER,
    source_profile TEXT,
    fetched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    rule_type VARCHAR(255) NOT NULL,
    rule_param VARCHAR(255) NOT NULL,
    rule_config VARCHAR(255) NOT NULL,
    resolve_dns BOOLEAN DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS groups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    group_name VARCHAR(255) NOT NULL,
    group_type VARCHAR(255) NOT NULL,
    group_regex VARCHAR(255) DEFAULT NULL,
    url VARCHAR(255),
    interval INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS common (
    type VARCHAR(255) PRIMARY KEY,
    json TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS self_node (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    link TEXT NOT NULL,
    convert BOOLEAN DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS clash_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    yaml_content TEXT NOT NULL,
    is_default BOOLEAN DEFAULT 0,
    status VARCHAR(32) DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS routing_profiles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    source_type VARCHAR(32) DEFAULT 'custom',
    content_ref TEXT NOT NULL,
    status VARCHAR(32) DEFAULT 'active',
    is_default BOOLEAN DEFAULT 0,
    allow_user_select BOOLEAN DEFAULT 1,
    client_support TEXT DEFAULT '["clash"]',
    usage_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS subscription_plans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name VARCHAR(255) NOT NULL,
    duration_days INTEGER NOT NULL,
    template_id INTEGER DEFAULT NULL,
    routing_profile_id INTEGER DEFAULT NULL,
    status VARCHAR(32) DEFAULT 'active',
    sort_order INTEGER DEFAULT 0,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS sub_users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    token VARCHAR(255) UNIQUE NOT NULL,
    remark TEXT,
    status VARCHAR(32) DEFAULT 'active',
    plan_id INTEGER DEFAULT NULL,
    plan_name VARCHAR(255) NOT NULL,
    template_id INTEGER DEFAULT NULL,
    routing_profile_id INTEGER DEFAULT NULL,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_access_at TIMESTAMP DEFAULT NULL,
    access_count INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS redeem_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code VARCHAR(255) UNIQUE NOT NULL,
    plan_id INTEGER DEFAULT NULL,
    plan_name VARCHAR(255) NOT NULL,
    duration_days INTEGER NOT NULL,
    status VARCHAR(32) DEFAULT 'unused',
    used_by_user_id INTEGER DEFAULT NULL,
    used_at TIMESTAMP DEFAULT NULL,
    expires_at TIMESTAMP DEFAULT NULL,
    subscription_expires_at TIMESTAMP DEFAULT NULL,
    remark TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS subscription_access_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER DEFAULT NULL,
    token VARCHAR(255) NOT NULL,
    status VARCHAR(32) NOT NULL,
    code VARCHAR(32) DEFAULT '',
    message TEXT,
    ip VARCHAR(255),
    user_agent TEXT,
    accessed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,
];

const additiveColumns = [
  ["airports", "health_status", "VARCHAR(32) DEFAULT 'unknown'"],
  ["airports", "health_node_count", "INTEGER DEFAULT 0"],
  ["airports", "health_userinfo", "TEXT DEFAULT NULL"],
  ["airports", "health_upload", "INTEGER DEFAULT NULL"],
  ["airports", "health_download", "INTEGER DEFAULT NULL"],
  ["airports", "health_total", "INTEGER DEFAULT NULL"],
  ["airports", "health_expire_at", "TIMESTAMP DEFAULT NULL"],
  ["airports", "health_error", "TEXT DEFAULT NULL"],
  ["airports", "last_checked_at", "TIMESTAMP DEFAULT NULL"],
  ["airports", "health_runtime", "VARCHAR(32) DEFAULT 'unknown'"],
  ["airports", "health_colo", "VARCHAR(32) DEFAULT NULL"],
  ["airports", "health_country", "VARCHAR(32) DEFAULT NULL"],
  ["groups", "group_regex", "VARCHAR(255) DEFAULT NULL"],
  ["sub_users", "plan_id", "INTEGER DEFAULT NULL"],
  ["sub_users", "template_id", "INTEGER DEFAULT NULL"],
  ["sub_users", "routing_profile_id", "INTEGER DEFAULT NULL"],
  ["sub_users", "access_count", "INTEGER NOT NULL DEFAULT 0"],
  ["sub_users", "last_access_at", "TIMESTAMP DEFAULT NULL"],
  ["subscription_plans", "template_id", "INTEGER DEFAULT NULL"],
  ["subscription_plans", "routing_profile_id", "INTEGER DEFAULT NULL"],
  ["redeem_codes", "plan_id", "INTEGER DEFAULT NULL"],
  ["redeem_codes", "subscription_expires_at", "TIMESTAMP DEFAULT NULL"],
];

const indexes = [
  "CREATE INDEX IF NOT EXISTS idx_airport_nodes_airport_id ON airport_nodes (airport_id)",
  "CREATE INDEX IF NOT EXISTS idx_sub_users_token ON sub_users (token)",
  "CREATE INDEX IF NOT EXISTS idx_sub_users_status ON sub_users (status)",
  "CREATE INDEX IF NOT EXISTS idx_redeem_codes_code ON redeem_codes (code)",
  "CREATE INDEX IF NOT EXISTS idx_redeem_codes_status ON redeem_codes (status)",
  "CREATE INDEX IF NOT EXISTS idx_subscription_logs_token_time ON subscription_access_logs (token, accessed_at)",
  "CREATE INDEX IF NOT EXISTS idx_subscription_logs_status_time ON subscription_access_logs (status, accessed_at)",
  "CREATE INDEX IF NOT EXISTS idx_routing_profiles_default ON routing_profiles (is_default, status)",
];

const defaultConfig = {
  "mixed-port": 7893,
  "allow-lan": false,
  mode: "rule",
  "log-level": "info",
  "external-controller": "127.0.0.1:9090",
  cloudsub: {
    upstreamRefreshIntervalHours: 6,
    distributionDomains: [],
    adminSessionTtlHours: 12,
    adminIpWhitelist: [],
    nodeBlockKeywords: ["ad", "official", "website", "traffic", "expire", "subscription"],
    nodeRenameRules: [],
    nodeNaming: {
      mode: "keep",
      fallbackName: "Node",
      appendNumber: true,
      regionRules: [],
    },
  },
  dns: {
    enable: true,
    ipv6: false,
    "enhanced-mode": "fake-ip",
    "fake-ip-range": "198.18.0.1/16",
    nameserver: ["https://dns.alidns.com/dns-query", "https://doh.pub/dns-query"],
  },
};

const defaultTemplate = `mixed-port: 7890
allow-lan: false
mode: rule
log-level: info
proxies: []
proxy-groups:
  - name: Proxy
    type: select
    proxies:
      - DIRECT
rules:
  - MATCH,Proxy
`;

const defaultRouting = `proxy-groups:
  - name: Proxy
    type: select
    include-all-proxies: true
rules:
  - MATCH,Proxy
`;

let schemaPromise;

async function run(env, sql, binds = []) {
  return await env.DB.prepare(sql).bind(...binds).run();
}

async function runOptional(env, sql) {
  try {
    await run(env, sql);
  } catch (error) {
    if (!/duplicate column name|already exists/i.test(error?.message || "")) {
      throw error;
    }
  }
}

async function seedDefaults(env) {
  const now = new Date().toISOString();
  await run(env, `
    INSERT INTO common (type, json, created_at)
    SELECT 'token', ?, ?
    WHERE NOT EXISTS (SELECT 1 FROM common WHERE type = 'token')
  `, [JSON.stringify({ token: DEFAULT_ADMIN_PASSWORD }), now]);
  await run(env, `
    INSERT INTO common (type, json, created_at)
    SELECT 'config', ?, ?
    WHERE NOT EXISTS (SELECT 1 FROM common WHERE type = 'config')
  `, [JSON.stringify(defaultConfig), now]);
  await run(env, `
    INSERT INTO clash_templates (name, description, yaml_content, is_default, status, created_at, updated_at)
    SELECT ?, ?, ?, 1, 'active', ?, ?
    WHERE NOT EXISTS (SELECT 1 FROM clash_templates)
  `, ["Default Template", "Default Clash YAML template", defaultTemplate, now, now]);
  await run(env, `
    INSERT INTO routing_profiles (name, description, source_type, content_ref, status, is_default, allow_user_select, client_support, usage_count, created_at, updated_at)
    SELECT ?, ?, 'builtin', ?, 'active', 1, 1, '["clash"]', 0, ?, ?
    WHERE NOT EXISTS (SELECT 1 FROM routing_profiles)
  `, ["Default Routing", "Default routing profile", defaultRouting, now, now]);
  await run(env, `
    INSERT INTO subscription_plans (name, duration_days, template_id, routing_profile_id, status, sort_order, description, created_at, updated_at)
    SELECT ?, 30,
           (SELECT id FROM clash_templates WHERE status = 'active' ORDER BY is_default DESC, id DESC LIMIT 1),
           (SELECT id FROM routing_profiles WHERE status = 'active' ORDER BY is_default DESC, id DESC LIMIT 1),
           'active', 10, ?, ?, ?
    WHERE NOT EXISTS (SELECT 1 FROM subscription_plans)
  `, ["Basic Plan", "Default 30 day plan", now, now]);
}

async function ensureSchemaNow(env) {
  if (!env?.DB) return;
  for (const statement of baseStatements) {
    await run(env, statement);
  }
  for (const [table, column, definition] of additiveColumns) {
    await runOptional(env, `ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
  for (const statement of indexes) {
    await run(env, statement);
  }
  await seedDefaults(env);
}

export async function ensureRuntimeSchema(env) {
  if (!schemaPromise) {
    schemaPromise = ensureSchemaNow(env).catch((error) => {
      schemaPromise = null;
      throw error;
    });
  }
  return await schemaPromise;
}
