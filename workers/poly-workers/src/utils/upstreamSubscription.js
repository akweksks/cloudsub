import yaml from "js-yaml";
import Sub2Clash from "./Sub2Clash.js";

const FETCH_PROFILES = [
  {
    name: "v2rayN",
    flag: "v2ray",
    userAgent: "v2rayN/6.60",
    accept: "text/plain,*/*",
  },
  {
    name: "v2rayNG",
    flag: "v2ray",
    userAgent: "v2rayNG/1.8.19",
    accept: "text/plain,*/*",
  },
  {
    name: "Clash Verge",
    flag: "clashVerge",
    userAgent: "clash-verge/v2.0.0",
    accept: "application/yaml,text/yaml,text/plain,*/*",
  },
  {
    name: "Mihomo",
    flag: "meta",
    userAgent: "mihomo/1.18.0",
    accept: "application/yaml,text/yaml,text/plain,*/*",
  },
  {
    name: "Clash",
    flag: "clash",
    userAgent: "ClashforWindows/0.20.39",
    accept: "application/yaml,text/yaml,text/plain,*/*",
  },
  {
    name: "Desktop Browser",
    flag: "clashVerge",
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
    accept: "text/html,application/xhtml+xml,application/xml;q=0.9,text/yaml,application/yaml,*/*;q=0.8",
    browserLike: true,
  },
];

export function ensureFlagInUrl(urlString, flag = "clashVerge") {
  try {
    const url = new URL(urlString);
    if (!url.searchParams.has("flag")) {
      url.searchParams.set("flag", flag);
    }
    return url.toString();
  } catch {
    return urlString;
  }
}

function buildHeaders(url, profile) {
  const host = new URL(url).host;
  const headers = {
    Host: host,
    accept: profile.accept,
    "accept-encoding": "gzip, deflate, br",
    "accept-language": "zh-CN,zh;q=0.9,en;q=0.8",
    "cache-control": "no-cache",
    pragma: "no-cache",
    "user-agent": profile.userAgent,
  };

  if (profile.browserLike) {
    Object.assign(headers, {
      "sec-ch-ua": '"Google Chrome";v="137", "Chromium";v="137", "Not/A)Brand";v="24"',
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-platform": '"Windows"',
      "sec-fetch-dest": "document",
      "sec-fetch-mode": "navigate",
      "sec-fetch-site": "none",
      "upgrade-insecure-requests": "1",
    });
  }

  return headers;
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 12000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchOnce(rawUrl, profile, timeoutMs) {
  const url = ensureFlagInUrl(rawUrl, profile.flag);
  const response = await fetchWithTimeout(url, { headers: buildHeaders(url, profile) }, timeoutMs);
  const text = await response.text();
  return {
    ok: response.ok,
    status: response.status,
    url,
    profile: profile.name,
    text,
    subscriptionInfo: response.headers.get("subscription-userinfo") || "",
  };
}

function safeBase64Decode(text) {
  const normalized = text.trim().replace(/-/g, "+").replace(/_/g, "/");
  if (!/^[A-Za-z0-9+/=\r\n]+$/.test(normalized)) return "";

  try {
    const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
    return atob(padded);
  } catch {
    return "";
  }
}

function protocolFromLink(link) {
  const protocol = link.split("://")[0].toLowerCase();
  return ["vmess", "vless", "trojan", "ss", "ssr", "hysteria", "hysteria2", "anytls"].includes(protocol)
    ? protocol
    : "";
}

function normalizeProxy(proxy) {
  if (!proxy || typeof proxy !== "object") return proxy;
  const normalized = { ...proxy };
  if (String(normalized.type || "").toLowerCase() === "anytls") {
    normalized.type = "anytls";
  }
  return normalized;
}

export function parseSubscriptionText(text) {
  const parsedYaml = yaml.load(text);
  if (parsedYaml && typeof parsedYaml === "object" && Array.isArray(parsedYaml.proxies)) {
    return {
      ...parsedYaml,
      proxies: parsedYaml.proxies.map(normalizeProxy),
    };
  }

  const decoded = safeBase64Decode(text);
  const lines = (decoded || text)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const proxies = [];
  for (const line of lines) {
    const protocol = protocolFromLink(line);
    if (!protocol) continue;

    try {
      proxies.push(Sub2Clash.convert(protocol, line));
    } catch (error) {
      console.warn(`Skip unsupported upstream node: ${error.message}`);
    }
  }

  return {
    proxies,
    "proxy-groups": [],
    rules: [],
  };
}

export async function fetchUpstreamSubscription(rawUrl, options = {}) {
  const timeoutMs = options.timeoutMs || 12000;
  const profiles = options.profiles || FETCH_PROFILES;
  const failures = [];

  for (const profile of profiles) {
    try {
      const result = await fetchOnce(rawUrl, profile, timeoutMs);
      if (!result.ok) {
        failures.push(`${result.profile}: HTTP ${result.status}`);
        continue;
      }

      const jsonData = parseSubscriptionText(result.text);
      return {
        ...result,
        jsonData,
        failures,
      };
    } catch (error) {
      failures.push(`${profile.name}: ${error.name === "AbortError" ? "timeout" : error.message}`);
    }
  }

  return {
    ok: false,
    status: 0,
    jsonData: null,
    subscriptionInfo: "",
    profile: "",
    failures,
    error: failures.join("; ") || "上游订阅拉取失败",
  };
}

export default {
  ensureFlagInUrl,
  parseSubscriptionText,
  fetchUpstreamSubscription,
};
