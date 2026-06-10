import yaml from "js-yaml";
import routingProfileRepository from "../db/routingProfileRepository.js";
import { hydrateRoutingProfileContent, putRoutingProfileContent } from "./r2CacheService.js";

const DEFAULT_GROUP_NAME = "节点选择";
const DEFAULT_AUTO_GROUP_NAME = "自动选择";
const BUILT_IN_POLICIES = new Set(["DIRECT", "REJECT", "REJECT-DROP", "PASS"]);
const GROUP_ALIASES = new Map([
  ["节点列表", DEFAULT_GROUP_NAME],
  ["节点选择", DEFAULT_GROUP_NAME],
]);
const TEMPLATE_PLACEHOLDERS = new Set(["__AUTO__", "__ALL__"]);
const COMPREHENSIVE_MAIN_GROUP = "🚀 节点选择";
const COMPREHENSIVE_AUTO_GROUP = "⚡ 自动选择";
const COMPREHENSIVE_GROUP_NAMES = [
  COMPREHENSIVE_MAIN_GROUP,
  COMPREHENSIVE_AUTO_GROUP,
  "🛑 广告拦截",
  "🤖 AI 服务",
  "📹 油管视频",
  "🔍 谷歌服务",
  "Ⓜ️ 微软服务",
  "🍏 苹果服务",
  "📲 电报消息",
  "🐦 推特/X",
  "📘 Meta 系",
  "🎙️ Discord",
  "💬 其他社交",
  "🎬 奈飞",
  "🏰 迪士尼+",
  "📺 欧美流媒体",
  "🎌 亚洲流媒体",
  "🎮 Steam",
  "🖥️ PC 游戏",
  "🎯 主机游戏",
  "🐱 代码托管",
  "☁️ 云服务",
  "🛠️ 开发工具",
  "💾 网盘存储",
  "💳 支付平台",
  "₿ 加密货币",
  "📚 教育学术",
  "📰 新闻资讯",
  "🛒 海淘购物",
  "🏠 私有网络",
  "🔒 国内服务",
  "🌍 非中国",
  "🐟 漏网之鱼",
];
const COMPREHENSIVE_RULES = [
  ["category-ads-all", "🛑 广告拦截"],
  ["private", "🏠 私有网络"],
  ["private-ip", "🏠 私有网络", "ipcidr", "no-resolve"],
  ["openai", "🤖 AI 服务"],
  ["anthropic", "🤖 AI 服务"],
  ["category-ai-chat-!cn", "🤖 AI 服务"],
  ["geolocation-cn", "🔒 国内服务"],
  ["cn-ip", "🔒 国内服务", "ipcidr", "no-resolve", "cn"],
  ["youtube", "📹 油管视频"],
  ["category-scholar-!cn", "📚 教育学术"],
  ["coursera", "📚 教育学术"],
  ["udemy", "📚 教育学术"],
  ["edx", "📚 教育学术"],
  ["khanacademy", "📚 教育学术"],
  ["wikimedia", "📚 教育学术"],
  ["aws", "☁️ 云服务"],
  ["azure", "☁️ 云服务"],
  ["cloudflare", "☁️ 云服务"],
  ["digitalocean", "☁️ 云服务"],
  ["vercel", "☁️ 云服务"],
  ["netlify", "☁️ 云服务"],
  ["cloudflare-ip", "☁️ 云服务", "ipcidr", "no-resolve", "cloudflare"],
  ["google", "🔍 谷歌服务"],
  ["google-ip", "🔍 谷歌服务", "ipcidr", "no-resolve", "google"],
  ["telegram", "📲 电报消息"],
  ["telegram-ip", "📲 电报消息", "ipcidr", "no-resolve", "telegram"],
  ["github", "🐱 代码托管"],
  ["gitlab", "🐱 代码托管"],
  ["atlassian", "🐱 代码托管"],
  ["microsoft", "Ⓜ️ 微软服务"],
  ["onedrive", "Ⓜ️ 微软服务"],
  ["apple-tvplus", "📺 欧美流媒体"],
  ["apple", "🍏 苹果服务"],
  ["icloud", "🍏 苹果服务"],
  ["twitter", "🐦 推特/X"],
  ["twitter-ip", "🐦 推特/X", "ipcidr", "no-resolve", "twitter"],
  ["facebook", "📘 Meta 系"],
  ["instagram", "📘 Meta 系"],
  ["whatsapp", "📘 Meta 系"],
  ["facebook-ip", "📘 Meta 系", "ipcidr", "no-resolve", "facebook"],
  ["discord", "🎙️ Discord"],
  ["tiktok", "💬 其他社交"],
  ["line", "💬 其他社交"],
  ["reddit", "💬 其他社交"],
  ["linkedin", "💬 其他社交"],
  ["snap", "💬 其他社交"],
  ["pinterest", "💬 其他社交"],
  ["tumblr", "💬 其他社交"],
  ["netflix", "🎬 奈飞"],
  ["netflix-ip", "🎬 奈飞", "ipcidr", "no-resolve", "netflix"],
  ["disney", "🏰 迪士尼+"],
  ["hbo", "📺 欧美流媒体"],
  ["hulu", "📺 欧美流媒体"],
  ["primevideo", "📺 欧美流媒体"],
  ["spotify", "📺 欧美流媒体"],
  ["twitch", "📺 欧美流媒体"],
  ["dazn", "📺 欧美流媒体"],
  ["bahamut", "🎌 亚洲流媒体"],
  ["biliintl", "🎌 亚洲流媒体"],
  ["niconico", "🎌 亚洲流媒体"],
  ["abema", "🎌 亚洲流媒体"],
  ["viu", "🎌 亚洲流媒体"],
  ["kktv", "🎌 亚洲流媒体"],
  ["steam", "🎮 Steam"],
  ["epicgames", "🖥️ PC 游戏"],
  ["ea", "🖥️ PC 游戏"],
  ["ubisoft", "🖥️ PC 游戏"],
  ["blizzard", "🖥️ PC 游戏"],
  ["gog", "🖥️ PC 游戏"],
  ["riot", "🖥️ PC 游戏"],
  ["playstation", "🎯 主机游戏"],
  ["xbox", "🎯 主机游戏"],
  ["nintendo", "🎯 主机游戏"],
  ["docker", "🛠️ 开发工具"],
  ["npmjs", "🛠️ 开发工具"],
  ["jetbrains", "🛠️ 开发工具"],
  ["stackexchange", "🛠️ 开发工具"],
  ["dropbox", "💾 网盘存储"],
  ["notion", "💾 网盘存储"],
  ["paypal", "💳 支付平台"],
  ["stripe", "💳 支付平台"],
  ["wise", "💳 支付平台"],
  ["binance", "₿ 加密货币"],
  ["bbc", "📰 新闻资讯"],
  ["cnn", "📰 新闻资讯"],
  ["nytimes", "📰 新闻资讯"],
  ["wsj", "📰 新闻资讯"],
  ["bloomberg", "📰 新闻资讯"],
  ["amazon", "🛒 海淘购物"],
  ["ebay", "🛒 海淘购物"],
  ["geolocation-!cn", "🌍 非中国"],
  ["cn", "🔒 国内服务"],
];
const SIMPLIFIED_GROUP_NAMES = [
  COMPREHENSIVE_MAIN_GROUP,
  COMPREHENSIVE_AUTO_GROUP,
  "🛑 广告拦截",
  "🏠 私有网络",
  "🔒 国内服务",
  "🌍 非中国",
  "🐟 漏网之鱼",
];
const STANDARD_GROUP_NAMES = [
  COMPREHENSIVE_MAIN_GROUP,
  COMPREHENSIVE_AUTO_GROUP,
  "🛑 广告拦截",
  "🤖 AI 服务",
  "📹 油管视频",
  "🔍 谷歌服务",
  "Ⓜ️ 微软服务",
  "🍏 苹果服务",
  "📲 电报消息",
  "🐱 代码托管",
  "🏠 私有网络",
  "🔒 国内服务",
  "🌍 非中国",
  "🐟 漏网之鱼",
];
const SIMPLIFIED_RULE_NAMES = [
  "category-ads-all",
  "private",
  "private-ip",
  "geolocation-cn",
  "cn-ip",
  "geolocation-!cn",
  "cn",
];
const STANDARD_RULE_NAMES = [
  "category-ads-all",
  "private",
  "private-ip",
  "openai",
  "anthropic",
  "category-ai-chat-!cn",
  "geolocation-cn",
  "cn-ip",
  "youtube",
  "google",
  "google-ip",
  "telegram",
  "telegram-ip",
  "github",
  "gitlab",
  "atlassian",
  "microsoft",
  "onedrive",
  "apple",
  "icloud",
  "geolocation-!cn",
  "cn",
];
const LEGACY_BUILT_IN_PROFILE_NAMES = new Map([
  ["默认分流", "基础分流"],
  ["AI + 流媒体分流", "AI流媒体"],
  ["精简版分流", "轻量分流"],
  ["标准版分流", "常用分流"],
  ["完整版分流", "全能分流"],
  ["综合增强分流", "全能分流"],
  ["全局代理", "全部代理"],
]);

function getArray(value) {
  return Array.isArray(value) ? value : [];
}

function dedupeList(values = []) {
  return [...new Set(values.filter(Boolean))];
}

function parseClientSupport(value) {
  if (Array.isArray(value)) return value.length ? value : ["clash"];
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) && parsed.length ? parsed : ["clash"];
  } catch {
    return ["clash"];
  }
}

function summarizeContent(content = {}) {
  return {
    groupCount: getArray(content.proxyGroups).length,
    ruleCount: getArray(content.rules).length,
    ruleProviderCount: Object.keys(content.ruleProviders || {}).length,
    hasDns: Boolean(content.dns),
  };
}

function normalizeProfile(row) {
  if (!row) return null;
  return {
    ...row,
    clientSupport: parseClientSupport(row.client_support),
    isDefault: Boolean(row.is_default),
    allowUserSelect: Boolean(row.allow_user_select),
  };
}

function cleanProfileContent(content = {}) {
  return {
    version: 1,
    proxyGroups: getArray(content.proxyGroups || content["proxy-groups"]),
    rules: getArray(content.rules || content.route?.rules),
    ruleProviders: content.ruleProviders || content["rule-providers"] || content.route?.rule_set || {},
    dns: content.dns || null,
    metadata: content.metadata || {},
  };
}

function sanitizeTemplateProxyGroups(groups = [], upstreamProxyNames = []) {
  const groupNames = new Set(groups.map((group) => group?.name).filter(Boolean));
  const upstreamNames = new Set(upstreamProxyNames);
  return getArray(groups).map((group) => {
    if (!group || typeof group !== "object") return group;
    const next = { ...group };
    if (!Array.isArray(next.proxies)) return next;

    let insertedAuto = false;
    const proxies = [];
    for (const item of next.proxies) {
      const name = String(item || "").trim();
      if (!name) continue;
      const allowed = BUILT_IN_POLICIES.has(name)
        || TEMPLATE_PLACEHOLDERS.has(name)
        || groupNames.has(name)
        || name.startsWith("__REGION:");
      if (allowed) {
        proxies.push(name);
        continue;
      }
      if ((upstreamNames.size && upstreamNames.has(name)) || !upstreamNames.size) {
        if (!insertedAuto) {
          proxies.push("__AUTO__");
          insertedAuto = true;
        }
      }
    }

    next.proxies = dedupeList(proxies.length ? proxies : ["__AUTO__"]);
    return next;
  });
}

export function profileContentToYaml(content = {}) {
  const clean = cleanProfileContent(content);
  const output = {};
  if (clean.proxyGroups.length) output["proxy-groups"] = clean.proxyGroups;
  if (clean.rules.length) output.rules = clean.rules;
  if (Object.keys(clean.ruleProviders || {}).length) output["rule-providers"] = clean.ruleProviders;
  if (clean.dns) output.dns = clean.dns;
  return yaml.dump(output, { lineWidth: 120, noRefs: true, sortKeys: false });
}

function builtInProfileSignature(content) {
  return profileContentToYaml(content).trim();
}

export function parseRoutingProfileContent(rawText = "", sourceType = "paste") {
  const text = String(rawText || "").trim();
  if (!text) throw new Error("分流规则内容不能为空");

  let parsed;
  try {
    parsed = yaml.load(text);
  } catch (error) {
    throw new Error(`YAML 解析失败：${error.message}`);
  }

  if (!parsed || typeof parsed !== "object") {
    throw new Error("分流规则必须是 YAML 对象或 YAML 数组");
  }

  const content = Array.isArray(parsed)
    ? cleanProfileContent({ rules: parsed })
    : cleanProfileContent({
      "proxy-groups": sanitizeTemplateProxyGroups(
        parsed["proxy-groups"] || parsed.proxyGroups || [],
        getArray(parsed.proxies).map((proxy) => proxy?.name).filter(Boolean),
      ),
      rules: parsed.rules || parsed.route?.rules || [],
      "rule-providers": parsed["rule-providers"] || parsed.ruleProviders || parsed.route?.rule_set || {},
      dns: parsed.dns || null,
      metadata: {
        sourceType,
        detectedFormat: "yaml",
        importedAt: new Date().toISOString(),
        ignoredProxyCount: getArray(parsed.proxies).length,
        ignoredProxyProviderCount: Object.keys(parsed["proxy-providers"] || {}).length,
      },
    });

  if (!content.proxyGroups.length && !content.rules.length && !content.dns && !Object.keys(content.ruleProviders).length) {
    throw new Error("YAML 中没有可用的 proxy-groups、rules、rule-providers 或 dns");
  }

  return content;
}

function buildRuleProvider(name, behavior = "domain", sourceName = name) {
  const geoType = behavior === "ipcidr" ? "geoip" : "geosite";
  return {
    type: "http",
    behavior,
    url: `https://github.com/MetaCubeX/meta-rules-dat/raw/refs/heads/meta/geo/${geoType}/${sourceName}.mrs`,
    path: `./ruleset/${name}.mrs`,
    interval: 86400,
    format: "mrs",
  };
}

function comprehensiveDns() {
  return {
    enable: true,
    listen: "127.0.0.1:5335",
    "use-system-hosts": false,
    "enhanced-mode": "fake-ip",
    "fake-ip-range": "198.18.0.1/16",
    "default-nameserver": ["180.76.76.76", "182.254.118.118", "8.8.8.8", "180.184.2.2"],
    nameserver: [
      "180.76.76.76",
      "119.29.29.29",
      "180.184.1.1",
      "223.5.5.5",
      "8.8.8.8",
      "https://223.6.6.6/dns-query#h3=true",
      "https://dns.alidns.com/dns-query",
      "https://cloudflare-dns.com/dns-query",
      "https://doh.pub/dns-query",
    ],
    fallback: [
      "https://000000.dns.nextdns.io/dns-query#h3=true",
      "https://dns.alidns.com/dns-query",
      "https://doh.pub/dns-query",
      "https://public.dns.iij.jp/dns-query",
      "https://101.101.101.101/dns-query",
      "https://208.67.220.220/dns-query",
      "tls://8.8.4.4",
      "tls://1.0.0.1:853",
      "https://cloudflare-dns.com/dns-query",
      "https://dns.google/dns-query",
    ],
    "fallback-filter": {
      geoip: true,
      ipcidr: ["240.0.0.0/4", "0.0.0.0/32", "127.0.0.1/32"],
      domain: [
        "+.google.com",
        "+.facebook.com",
        "+.twitter.com",
        "+.youtube.com",
        "+.xn--ngstr-lra8j.com",
        "+.google.cn",
        "+.googleapis.cn",
        "+.googleapis.com",
        "+.gvt1.com",
      ],
    },
  };
}

function buildPresetProfileContent(groupNames, ruleNames) {
  const selectedRuleNames = new Set(ruleNames);
  const ruleDefs = COMPREHENSIVE_RULES.filter(([name]) => selectedRuleNames.has(name));
  const proxyGroups = groupNames.map((name) => {
    if (name === COMPREHENSIVE_MAIN_GROUP) {
      return { name, type: "select", proxies: [COMPREHENSIVE_AUTO_GROUP, "DIRECT", "REJECT", "__AUTO__"] };
    }
    if (name === COMPREHENSIVE_AUTO_GROUP) {
      return {
        name,
        type: "url-test",
        proxies: ["__AUTO__"],
        url: "https://www.gstatic.com/generate_204",
        interval: 300,
        lazy: false,
      };
    }
    if (name === "🛑 广告拦截") {
      return { name, type: "select", proxies: ["REJECT", "DIRECT", COMPREHENSIVE_MAIN_GROUP] };
    }
    if (name === "🏠 私有网络" || name === "🔒 国内服务") {
      return { name, type: "select", proxies: ["DIRECT", "REJECT", COMPREHENSIVE_MAIN_GROUP, COMPREHENSIVE_AUTO_GROUP, "__AUTO__"] };
    }
    return { name, type: "select", proxies: [COMPREHENSIVE_MAIN_GROUP, COMPREHENSIVE_AUTO_GROUP, "DIRECT", "REJECT", "__AUTO__"] };
  });
  const ruleProviders = Object.fromEntries(
    ruleDefs.map(([name, , behavior = "domain", , sourceName = name]) => [name, buildRuleProvider(name, behavior, sourceName)]),
  );
  const rules = [
    ...ruleDefs.map(([name, policy, , option]) => `RULE-SET,${name},${policy}${option ? `,${option}` : ""}`),
    "MATCH,🐟 漏网之鱼",
  ];
  return cleanProfileContent({
    proxyGroups,
    rules,
    ruleProviders,
    dns: comprehensiveDns(),
    metadata: {
      sourceType: "built_in",
      detectedFormat: "yaml",
      ignoredProxyCount: 83,
    },
  });
}

function simplifiedProfileContent() {
  return buildPresetProfileContent(SIMPLIFIED_GROUP_NAMES, SIMPLIFIED_RULE_NAMES);
}

function standardProfileContent() {
  return buildPresetProfileContent(STANDARD_GROUP_NAMES, STANDARD_RULE_NAMES);
}

function comprehensiveProfileContent() {
  return buildPresetProfileContent(COMPREHENSIVE_GROUP_NAMES, COMPREHENSIVE_RULES.map(([name]) => name));
}

function defaultProxyGroups(proxyNames = []) {
  return [
    { name: DEFAULT_GROUP_NAME, type: "select", proxies: [DEFAULT_AUTO_GROUP_NAME, ...proxyNames, "DIRECT"] },
    { name: DEFAULT_AUTO_GROUP_NAME, type: "url-test", proxies: proxyNames, url: "https://www.gstatic.com/generate_204", interval: 300 },
  ];
}

function normalizeGroup(group, proxyNames = []) {
  if (!group || typeof group !== "object") return group;
  const next = { ...group };
  const proxies = getArray(next.proxies);
  const includeAll = next["include-all-proxies"] === true || next.includeAllProxies === true;
  const filter = next.filter ? new RegExp(String(next.filter), "i") : null;
  const filteredProxyNames = filter ? proxyNames.filter((name) => filter.test(name)) : proxyNames;

  if (includeAll) {
    next.proxies = filteredProxyNames.length ? filteredProxyNames : proxyNames;
    return next;
  }

  if (!proxies.length || proxies.includes("__AUTO__")) {
    next.proxies = proxies.length
      ? proxies.flatMap((name) => name === "__AUTO__" ? filteredProxyNames : [name])
      : [...filteredProxyNames];
  } else {
    next.proxies = proxies.flatMap((name) => {
      if (name === "__ALL__") return filteredProxyNames;
      if (String(name).startsWith("__REGION:")) {
        const region = String(name).slice("__REGION:".length);
        const matched = proxyNames.filter((proxyName) => proxyName.includes(region));
        return matched.length ? matched : filteredProxyNames;
      }
      return [name];
    });
  }
  return next;
}

function extractRulePolicy(rule) {
  if (typeof rule !== "string") return "";
  const parts = rule.split(",").map((part) => part.trim());
  if (parts.length < 2) return "";
  const index = getRulePolicyIndex(parts);
  return index >= 0 ? (parts[index] || "") : "";
}

function rewriteRulePolicy(rule, nextPolicy) {
  if (typeof rule !== "string" || !nextPolicy) return rule;
  const parts = rule.split(",");
  if (parts.length < 2) return rule;
  const index = getRulePolicyIndex(parts.map((part) => part.trim()));
  if (index < 0) return rule;
  parts[index] = nextPolicy;
  return parts.join(",");
}

function getRulePolicyIndex(parts = []) {
  const type = parts[0]?.trim().toUpperCase();
  if (type === "MATCH") return 1;
  if (["RULE-SET", "IP-CIDR", "IP-CIDR6", "GEOIP", "SRC-IP-CIDR", "SRC-IP-CIDR6"].includes(type)) return parts.length >= 3 ? 2 : -1;
  return parts.length - 1;
}

function normalizeRules(rules = [], groups = [], proxyNames = []) {
  const groupNames = new Set(groups.map((group) => group?.name).filter(Boolean));
  const proxyNameSet = new Set(proxyNames);
  const fallbackGroupName = groupNames.has(DEFAULT_GROUP_NAME)
    ? DEFAULT_GROUP_NAME
    : (groups[0]?.name || DEFAULT_GROUP_NAME);

  return getArray(rules).map((rule) => {
    const policy = extractRulePolicy(rule);
    if (!policy || BUILT_IN_POLICIES.has(policy) || groupNames.has(policy) || proxyNameSet.has(policy)) return rule;
    const alias = GROUP_ALIASES.get(policy);
    if (alias && groupNames.has(alias)) return rewriteRulePolicy(rule, alias);
    return rewriteRulePolicy(rule, fallbackGroupName);
  });
}

export function applyRoutingProfileToClashConfig(config, profile) {
  const content = profile?.content;
  if (!content) return config;
  const proxyNames = getArray(config.proxies).map((proxy) => proxy.name).filter(Boolean);
  const groups = getArray(content.proxyGroups);
  const rules = getArray(content.rules);
  const ruleProviders = content.ruleProviders || {};
  const proxyGroups = groups.length ? groups.map((group) => normalizeGroup(group, proxyNames)) : defaultProxyGroups(proxyNames);
  const normalizedRules = rules.length ? normalizeRules(rules, proxyGroups, proxyNames) : [`MATCH,${DEFAULT_GROUP_NAME}`];
  return {
    ...config,
    dns: content.dns || config.dns,
    "rule-providers": Object.keys(ruleProviders).length ? ruleProviders : config["rule-providers"],
    "proxy-groups": proxyGroups,
    rules: normalizedRules,
  };
}

function defaultProfiles() {
  const profiles = [
    {
      name: "基础分流",
      description: "国内直连，其他流量走节点选择，适合大多数用户。",
      sourceType: "built_in",
      isDefault: true,
      allowUserSelect: true,
      clientSupport: ["clash"],
      content: cleanProfileContent({
        proxyGroups: [
          { name: DEFAULT_GROUP_NAME, type: "select", proxies: [DEFAULT_AUTO_GROUP_NAME, "__AUTO__", "DIRECT"] },
          { name: DEFAULT_AUTO_GROUP_NAME, type: "url-test", proxies: ["__AUTO__"], url: "https://www.gstatic.com/generate_204", interval: 300 },
        ],
        rules: [
          "GEOIP,LAN,DIRECT",
          "GEOIP,CN,DIRECT",
          `MATCH,${DEFAULT_GROUP_NAME}`,
        ],
      }),
    },
    {
      name: "AI流媒体",
      description: "常见 AI、流媒体和海外服务走代理，国内流量直连。",
      sourceType: "built_in",
      isDefault: false,
      allowUserSelect: true,
      clientSupport: ["clash"],
      content: cleanProfileContent({
        proxyGroups: [
          { name: DEFAULT_GROUP_NAME, type: "select", proxies: [DEFAULT_AUTO_GROUP_NAME, "__AUTO__", "DIRECT"] },
          { name: DEFAULT_AUTO_GROUP_NAME, type: "url-test", proxies: ["__AUTO__"], url: "https://www.gstatic.com/generate_204", interval: 300 },
          { name: "AI", type: "select", "include-all-proxies": true, filter: "美|日|新|台|港" },
          { name: "流媒体", type: "select", "include-all-proxies": true, filter: "港|日|新|台" },
        ],
        rules: [
          "DOMAIN-SUFFIX,openai.com,AI",
          "DOMAIN-SUFFIX,chatgpt.com,AI",
          "DOMAIN-SUFFIX,anthropic.com,AI",
          "DOMAIN-SUFFIX,netflix.com,流媒体",
          "DOMAIN-SUFFIX,youtube.com,流媒体",
          "DOMAIN-SUFFIX,googlevideo.com,流媒体",
          "GEOIP,CN,DIRECT",
          `MATCH,${DEFAULT_GROUP_NAME}`,
        ],
      }),
    },
    {
      name: "轻量分流",
      description: "轻量基础规则，只保留广告拦截、私有网络、国内直连、非中国和兜底规则；已剔除上游节点信息。",
      sourceType: "built_in",
      isDefault: false,
      allowUserSelect: true,
      clientSupport: ["clash"],
      content: simplifiedProfileContent(),
    },
    {
      name: "常用分流",
      description: "标准规则集，覆盖广告、AI、YouTube、Google、Telegram、代码托管、微软、苹果和国内直连；已剔除上游节点信息。",
      sourceType: "built_in",
      isDefault: false,
      allowUserSelect: true,
      clientSupport: ["clash"],
      content: standardProfileContent(),
    },
    {
      name: "全能分流",
      description: "完整规则集，覆盖广告、AI、社交、流媒体、游戏、开发、支付、学术、新闻和国内直连；已剔除上游节点信息。",
      sourceType: "built_in",
      isDefault: false,
      allowUserSelect: true,
      clientSupport: ["clash"],
      content: comprehensiveProfileContent(),
    },
    {
      name: "全部代理",
      description: "除局域网外全部流量走代理。",
      sourceType: "built_in",
      isDefault: false,
      allowUserSelect: true,
      clientSupport: ["clash"],
      content: cleanProfileContent({
        proxyGroups: [
          { name: DEFAULT_GROUP_NAME, type: "select", proxies: [DEFAULT_AUTO_GROUP_NAME, "__AUTO__", "DIRECT"] },
          { name: DEFAULT_AUTO_GROUP_NAME, type: "url-test", proxies: ["__AUTO__"], url: "https://www.gstatic.com/generate_204", interval: 300 },
        ],
        rules: [
          "GEOIP,LAN,DIRECT",
          `MATCH,${DEFAULT_GROUP_NAME}`,
        ],
      }),
    },
  ];
  const seen = new Set();
  return profiles.filter((profile) => {
    const signature = builtInProfileSignature(profile.content);
    if (seen.has(signature)) return false;
    seen.add(signature);
    return true;
  });
}

export function getDefaultRoutingProfiles() {
  return defaultProfiles();
}

async function storeContent(env, id, content, metadata = {}) {
  return await putRoutingProfileContent(env, id, profileContentToYaml(content), metadata);
}

async function createBuiltInProfile(env, item, now = new Date().toISOString()) {
  const created = await routingProfileRepository.create(env, {
    name: item.name,
    description: item.description,
    sourceType: item.sourceType,
    contentRef: profileContentToYaml(item.content),
    status: "active",
    isDefault: item.isDefault,
    allowUserSelect: item.allowUserSelect,
    clientSupport: item.clientSupport,
    createdAt: now,
    updatedAt: now,
  });
  const pointer = await storeContent(env, created.id, item.content, { name: item.name });
  if (pointer) await routingProfileRepository.update(env, created.id, { content_ref: pointer, updated_at: now });
  return created;
}

export default {
  async ensureBuiltIns(env) {
    const rows = await routingProfileRepository.getProfiles(env);
    const existing = rows.results || [];
    const existingNames = new Set(existing.map((row) => row.name));
    const now = new Date().toISOString();
    for (const row of existing) {
      if (row.source_type !== "built_in") continue;
      const nextName = LEGACY_BUILT_IN_PROFILE_NAMES.get(row.name);
      if (!nextName || row.name === nextName) continue;
      if (existingNames.has(nextName)) {
        await routingProfileRepository.update(env, row.id, {
          allow_user_select: false,
          updated_at: now,
        });
        continue;
      }
      await routingProfileRepository.update(env, row.id, {
        name: nextName,
        updated_at: now,
      });
      existingNames.delete(row.name);
      existingNames.add(nextName);
      row.name = nextName;
    }
    const existingBySignature = new Map();
    for (const row of existing) {
      try {
        const hydrated = await hydrateRoutingProfileContent(env, row);
        const signature = builtInProfileSignature(cleanProfileContent(hydrated?.content || {}));
        if (signature) existingBySignature.set(signature, row);
      } catch {
        // Ignore unreadable legacy rows and keep adding missing built-ins by name.
      }
    }
    for (const item of defaultProfiles()) {
      if (existingNames.has(item.name)) continue;
      const signature = builtInProfileSignature(item.content);
      const duplicated = existingBySignature.get(signature);
      if (duplicated?.source_type === "built_in") {
        if (!existingNames.has(item.name)) {
          await routingProfileRepository.update(env, duplicated.id, {
            name: item.name,
            description: item.description,
            source_type: item.sourceType,
            status: "active",
            allow_user_select: item.allowUserSelect,
            client_support: JSON.stringify(item.clientSupport),
            updated_at: now,
          });
          existingNames.add(item.name);
          duplicated.name = item.name;
        }
        continue;
      }
      const created = await createBuiltInProfile(env, item, now);
      existingNames.add(item.name);
      existingBySignature.set(signature, created);
    }
    return await routingProfileRepository.getProfiles(env);
  },

  async list(env, { hydrate = false } = {}) {
    await this.ensureBuiltIns(env);
    const rows = await routingProfileRepository.getProfiles(env);
    const results = (rows.results || []).map(normalizeProfile);
    return {
      ...rows,
      results: hydrate ? await Promise.all(results.map((row) => this.hydrate(env, row))) : results,
    };
  },

  async listSelectable(env) {
    await this.ensureBuiltIns(env);
    const rows = await routingProfileRepository.getSelectableProfiles(env);
    return {
      ...rows,
      results: (rows.results || []).map(normalizeProfile),
    };
  },

  async hydrate(env, row) {
    const hydrated = await hydrateRoutingProfileContent(env, row);
    const content = cleanProfileContent(hydrated?.content || {});
    return {
      ...normalizeProfile(hydrated),
      content,
      rawContent: profileContentToYaml(content),
      summary: summarizeContent(content),
    };
  },

  async findForSubscription(env, id) {
    await this.ensureBuiltIns(env);
    const row = id ? await routingProfileRepository.findById(env, id) : null;
    const target = row?.status === "active" ? row : await routingProfileRepository.findDefault(env);
    return await this.hydrate(env, target);
  },

  async create(env, input) {
    const now = new Date().toISOString();
    const content = cleanProfileContent(input.content || parseRoutingProfileContent(input.rawContent || "", input.sourceType || "custom"));
    if (input.isDefault) await routingProfileRepository.clearDefault(env);
    const row = await routingProfileRepository.create(env, {
      name: input.name,
      description: input.description,
      sourceType: input.sourceType || "custom",
      contentRef: profileContentToYaml(content),
      status: input.status || "active",
      isDefault: Boolean(input.isDefault),
      allowUserSelect: input.allowUserSelect !== false,
      clientSupport: ["clash"],
      createdAt: now,
      updatedAt: now,
    });
    const pointer = await storeContent(env, row.id, content, { name: input.name, sourceType: input.sourceType || "custom" });
    if (pointer) await routingProfileRepository.update(env, row.id, { content_ref: pointer, updated_at: now });
    return await this.hydrate(env, await routingProfileRepository.findById(env, row.id));
  },

  async update(env, id, input) {
    const current = await routingProfileRepository.findById(env, id);
    if (!current) return null;
    const now = new Date().toISOString();
    const currentHydrated = await this.hydrate(env, current);
    const content = input.content
      ? cleanProfileContent(input.content)
      : (input.rawContent !== undefined ? parseRoutingProfileContent(input.rawContent, input.sourceType || current.source_type) : currentHydrated.content);
    if (input.isDefault) await routingProfileRepository.clearDefault(env);
    const pointer = await storeContent(env, id, content, { name: input.name ?? current.name });
    await routingProfileRepository.update(env, id, {
      name: input.name ?? current.name,
      description: input.description ?? current.description,
      source_type: input.sourceType ?? current.source_type,
      content_ref: pointer || current.content_ref,
      status: input.status ?? current.status,
      is_default: input.isDefault !== undefined ? Boolean(input.isDefault) : Boolean(current.is_default),
      allow_user_select: input.allowUserSelect !== undefined ? Boolean(input.allowUserSelect) : Boolean(current.allow_user_select),
      client_support: JSON.stringify(["clash"]),
      updated_at: now,
    });
    return await this.hydrate(env, await routingProfileRepository.findById(env, id));
  },

  async delete(env, id) {
    const current = await routingProfileRepository.findById(env, id);
    if (!current) return null;
    if (current.is_default) throw new Error("默认分流方案不能删除");
    await routingProfileRepository.delete(env, id);
    return current;
  },

  importPreview(rawContent, sourceType = "upload") {
    const content = parseRoutingProfileContent(rawContent, sourceType);
    return {
      content,
      rawContent: profileContentToYaml(content),
      summary: summarizeContent(content),
    };
  },

  async incrementUsage(env, id) {
    return await routingProfileRepository.incrementUsage(env, id);
  },
};
