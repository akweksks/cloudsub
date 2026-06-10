import { spawnSync } from "node:child_process";
import { readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "jsonc-parser";

const projectName = "cloudsub";
const databaseName = projectName;
const bucketName = projectName;
const generatedConfig = resolve("wrangler.deploy.json");
const wranglerCommand = process.platform === "win32" ? "npx.cmd" : "npx";

const defaultConfig = {
  port: 7890,
  "socks-port": 7891,
  "redir-port": 7892,
  "mixed-port": 7893,
  "allow-lan": false,
  mode: "rule",
  "log-level": "info",
  "external-controller": "127.0.0.1:9090",
  cloudsub: {
    upstreamRefreshIntervalHours: 6,
    distributionDomains: [],
    defaultDistributionDomain: "",
    adminSessionTtlHours: 12,
    adminIpWhitelist: [],
    nodeBlockKeywords: [
      "广告",
      "官网",
      "网址",
      "导航",
      "订阅",
      "剩余流量",
      "重置剩余",
      "套餐到期",
      "到期",
    ],
    nodeNaming: {
      mode: "region-auto",
      fallbackName: "节点",
      appendNumber: true,
      regionRules: [
        { keyword: "香港|hk|hong kong|hongkong", name: "香港" },
        { keyword: "台湾|tw|taiwan", name: "台湾" },
        { keyword: "日本|jp|japan|tokyo|osaka", name: "日本" },
        { keyword: "新加坡|sg|singapore", name: "新加坡" },
        { keyword: "美国|us|usa|america|united states|los angeles|san jose", name: "美国" },
        { keyword: "韩国|kr|korea|seoul", name: "韩国" },
        { keyword: "英国|uk|gb|england|london", name: "英国" },
        { keyword: "德国|de|germany|frankfurt", name: "德国" },
        { keyword: "法国|fr|france|paris", name: "法国" },
        { keyword: "加拿大|ca|canada", name: "加拿大" },
        { keyword: "澳大利亚|au|australia|sydney", name: "澳大利亚" },
        { keyword: "印度|in|india", name: "印度" },
        { keyword: "俄罗斯|ru|russia", name: "俄罗斯" },
        { keyword: "土耳其|tr|turkey", name: "土耳其" },
        { keyword: "巴西|br|brazil", name: "巴西" },
      ],
    },
    nodeRenameRules: [],
    subscriptionRateLimit: {
      maxRequestsPerMinute: 30,
      maxRequestsPerHour: 300,
      suspiciousIpCountPerHour: 8,
      suspiciousUserAgentCountPerHour: 10,
    },
  },
  dns: {
    enable: true,
    ipv6: false,
    listen: "0.0.0.0:53",
    "enhanced-mode": "fake-ip",
    "fake-ip-range": "198.18.0.1/16",
    nameserver: ["https://doh.pub/dns-query", "https://dns.alidns.com/dns-query"],
    fallback: ["https://1.1.1.1/dns-query", "https://8.8.8.8/dns-query"],
  },
};

const defaultClashTemplate = `mixed-port: 7890
allow-lan: false
mode: rule
log-level: info
external-controller: 127.0.0.1:9090
dns:
  enable: true
  ipv6: false
  listen: 0.0.0.0:53
  enhanced-mode: fake-ip
  fake-ip-range: 198.18.0.1/16
  nameserver:
    - https://doh.pub/dns-query
    - https://dns.alidns.com/dns-query
  fallback:
    - https://1.1.1.1/dns-query
    - https://8.8.8.8/dns-query
proxies: []
proxy-groups:
  - name: 节点选择
    type: select
    proxies:
      - DIRECT
rules:
  - MATCH,节点选择
`;

const defaultRoutingContent = `proxy-groups:
  - name: 节点选择
    type: select
    include-all-proxies: true
rules:
  - MATCH,节点选择
`;

const baseSchemaStatements = [
  `CREATE TABLE IF NOT EXISTS airports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name VARCHAR(255) NOT NULL,
    subscription_url VARCHAR(255) NOT NULL,
    remarks TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_enabled BOOLEAN DEFAULT 1
  );`,
  `CREATE TABLE IF NOT EXISTS airport_nodes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    airport_id INTEGER NOT NULL,
    node_name TEXT NOT NULL,
    node_type VARCHAR(32),
    server VARCHAR(255),
    port INTEGER,
    source_profile TEXT,
    fetched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );`,
  `CREATE TABLE IF NOT EXISTS rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    rule_type VARCHAR(255) NOT NULL,
    rule_param VARCHAR(255) NOT NULL,
    rule_config VARCHAR(255) NOT NULL,
    resolve_dns BOOLEAN DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );`,
  `CREATE TABLE IF NOT EXISTS groups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    group_name VARCHAR(255) NOT NULL,
    group_type VARCHAR(255) NOT NULL,
    group_regex VARCHAR(255) DEFAULT NULL,
    url VARCHAR(255),
    interval INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );`,
  `CREATE TABLE IF NOT EXISTS common (
    type VARCHAR(255) PRIMARY KEY,
    json TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );`,
  `CREATE TABLE IF NOT EXISTS self_node (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    link TEXT NOT NULL,
    convert BOOLEAN DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );`,
  `CREATE TABLE IF NOT EXISTS clash_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    yaml_content TEXT NOT NULL,
    is_default BOOLEAN DEFAULT 0,
    status VARCHAR(32) DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );`,
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
  );`,
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
  );`,
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
  );`,
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
  );`,
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
  );`,
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
  "CREATE INDEX IF NOT EXISTS idx_airport_nodes_airport_id ON airport_nodes (airport_id);",
  "CREATE INDEX IF NOT EXISTS idx_sub_users_token ON sub_users (token);",
  "CREATE INDEX IF NOT EXISTS idx_sub_users_status ON sub_users (status);",
  "CREATE INDEX IF NOT EXISTS idx_redeem_codes_code ON redeem_codes (code);",
  "CREATE INDEX IF NOT EXISTS idx_redeem_codes_status ON redeem_codes (status);",
  "CREATE INDEX IF NOT EXISTS idx_subscription_logs_token_time ON subscription_access_logs (token, accessed_at);",
  "CREATE INDEX IF NOT EXISTS idx_subscription_logs_status_time ON subscription_access_logs (status, accessed_at);",
  "CREATE INDEX IF NOT EXISTS idx_routing_profiles_default ON routing_profiles (is_default, status);",
];

function sqlQuote(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function runWrangler(args, { capture = false } = {}) {
  const result = spawnSync(wranglerCommand, ["wrangler", ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: capture ? "pipe" : "inherit",
  });

  if (result.status !== 0) {
    const detail = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
    throw new Error(detail || `wrangler ${args.join(" ")} failed`);
  }

  return result;
}

function runWranglerMaybe(args) {
  return spawnSync(wranglerCommand, ["wrangler", ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: "pipe",
  });
}

function parseJsonOutput(output) {
  const start = output.indexOf("[");
  const end = output.lastIndexOf("]");
  if (start < 0 || end < start) {
    throw new Error("Unable to parse Wrangler JSON output.");
  }
  return JSON.parse(output.slice(start, end + 1));
}

function findDatabase() {
  const result = runWrangler(["d1", "list", "--json"], { capture: true });
  return parseJsonOutput(result.stdout).find((database) => database.name === databaseName) || null;
}

function ensureDatabase() {
  const existing = findDatabase();
  if (existing) {
    assertProjectDatabase(existing);
    return { database: existing, created: false };
  }

  console.log(`Creating D1 database "${databaseName}"...`);
  runWrangler(["d1", "create", databaseName]);
  const created = findDatabase();
  if (!created) {
    throw new Error(`D1 database "${databaseName}" was created but could not be resolved.`);
  }
  assertProjectDatabase(created);
  return { database: created, created: true };
}

function assertProjectDatabase(database) {
  if (!database || database.name !== databaseName) {
    throw new Error(`Refusing to use unrelated D1 database. Expected "${databaseName}".`);
  }
}

function ensureBucket() {
  const list = runWrangler(["r2", "bucket", "list"], { capture: true });
  if (!bucketExistsInOutput(list.stdout, bucketName)) {
    console.log(`Creating R2 bucket "${bucketName}"...`);
    runWrangler(["r2", "bucket", "create", bucketName]);
  }
}

function bucketExistsInOutput(output, name) {
  try {
    const parsed = JSON.parse(output);
    if (Array.isArray(parsed)) {
      return parsed.some((bucket) => bucket.name === name);
    }
  } catch {
    // Wrangler may print a table depending on version and flags.
  }
  return output.split(/\r?\n/).some((line) => line.trim() === name || line.includes(` ${name} `));
}

function executeD1(sql, { ignoreDuplicateColumn = false } = {}) {
  const result = runWranglerMaybe(["d1", "execute", databaseName, "--remote", "--json", `--command=${sql}`]);
  if (result.status === 0) {
    return result;
  }

  const detail = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
  if (ignoreDuplicateColumn && /duplicate column name|already exists/i.test(detail)) {
    return result;
  }

  throw new Error(detail || `D1 schema statement failed: ${sql}`);
}

function ensureDatabaseSchema() {
  console.log(`Ensuring D1 schema for "${databaseName}" only...`);
  for (const statement of baseSchemaStatements) {
    executeD1(statement);
  }
  for (const [table, column, definition] of additiveColumns) {
    executeD1(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition};`, { ignoreDuplicateColumn: true });
  }
  for (const statement of indexes) {
    executeD1(statement);
  }

  const now = new Date().toISOString();
  executeD1(`
    INSERT INTO common (type, json, created_at)
    SELECT 'config', ${sqlQuote(JSON.stringify(defaultConfig))}, ${sqlQuote(now)}
    WHERE NOT EXISTS (SELECT 1 FROM common WHERE type = 'config');
  `);
  executeD1(`
    INSERT INTO common (type, json, created_at)
    SELECT 'token', ${sqlQuote("{}")}, ${sqlQuote(now)}
    WHERE NOT EXISTS (SELECT 1 FROM common WHERE type = 'token');
  `);
  executeD1(`
    INSERT INTO clash_templates (name, description, yaml_content, is_default, status, created_at, updated_at)
    SELECT '默认模板', '系统默认 Clash / Mihomo YAML 模板', ${sqlQuote(defaultClashTemplate)}, 1, 'active', ${sqlQuote(now)}, ${sqlQuote(now)}
    WHERE NOT EXISTS (SELECT 1 FROM clash_templates);
  `);
  executeD1(`
    INSERT INTO routing_profiles (name, description, source_type, content_ref, status, is_default, allow_user_select, client_support, usage_count, created_at, updated_at)
    SELECT '系统默认规则', '默认直连与代理分流规则，可在后台修改。', 'builtin', ${sqlQuote(defaultRoutingContent)}, 'active', 1, 1, '["clash"]', 0, ${sqlQuote(now)}, ${sqlQuote(now)}
    WHERE NOT EXISTS (SELECT 1 FROM routing_profiles);
  `);
  executeD1(`
    INSERT INTO subscription_plans (name, duration_days, template_id, routing_profile_id, status, sort_order, description, created_at, updated_at)
    SELECT '基础订阅', 30,
           (SELECT id FROM clash_templates WHERE status = 'active' ORDER BY is_default DESC, id DESC LIMIT 1),
           (SELECT id FROM routing_profiles WHERE status = 'active' ORDER BY is_default DESC, id DESC LIMIT 1),
           'active', 10, '默认 30 天订阅套餐', ${sqlQuote(now)}, ${sqlQuote(now)}
    WHERE NOT EXISTS (SELECT 1 FROM subscription_plans);
  `);
}

function writeDeployConfig(database) {
  const errors = [];
  const config = parse(readFileSync(resolve("wrangler.jsonc"), "utf8"), errors, {
    allowTrailingComma: true,
  });
  if (errors.length > 0 || !config) {
    throw new Error("Unable to parse wrangler.jsonc.");
  }

  config.d1_databases = [
    {
      binding: "DB",
      database_name: databaseName,
      database_id: database.uuid || database.id,
    },
  ];
  writeFileSync(generatedConfig, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

try {
  const { database } = ensureDatabase();
  ensureBucket();
  ensureDatabaseSchema();
  writeDeployConfig(database);
  runWrangler(["deploy", "--config", generatedConfig]);
} finally {
  try {
    unlinkSync(generatedConfig);
  } catch {
    // Provisioning may fail before a generated config exists.
  }
}
