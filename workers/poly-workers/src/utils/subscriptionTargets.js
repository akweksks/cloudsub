import yaml from "js-yaml";

const TARGET_ALIASES = {
  clash: "clash",
  mihomo: "clash",
  meta: "clash",
  "clash-meta": "clash",
  stash: "clash",
  v2ray: "v2ray",
  v2rayn: "v2ray",
  v2rayng: "v2ray",
  raw: "v2ray",
  singbox: "sing-box",
  "sing-box": "sing-box",
  sfa: "sing-box",
};

function encodeBase64(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function decodeMaybe(value) {
  try {
    return decodeURIComponent(String(value || ""));
  } catch {
    return String(value || "");
  }
}

function getNodeName(proxy) {
  return String(proxy?.name || "CloudSub Node");
}

function bool(value) {
  return value === true || value === "true" || value === 1 || value === "1";
}

function normalizeVmessCipher(value) {
  const cipher = String(value || "").trim().toLowerCase();
  return ["auto", "aes-128-gcm", "chacha20-poly1305", "none", "zero"].includes(cipher) ? cipher : "auto";
}

function normalizeProxyForTarget(proxy = {}) {
  const type = String(proxy.type || "").toLowerCase();
  if (type !== "vmess") return proxy;
  return {
    ...proxy,
    type: "vmess",
    cipher: normalizeVmessCipher(proxy.cipher || proxy.security),
  };
}

function uniq(items = []) {
  return [...new Set(items.filter(Boolean))];
}

function normalizeClashProxyGroups(groups = [], proxyNames = []) {
  const proxyNameSet = new Set(proxyNames);
  const groupNames = new Set(groups.map((group) => group?.name).filter(Boolean));
  const virtualNames = new Set(["DIRECT", "REJECT", "REJECT-DROP", "PASS"]);
  const validSelectTargets = new Set([...proxyNames, ...groupNames, ...virtualNames]);
  const needsProxyList = new Set(["select", "url-test", "fallback", "load-balance", "relay"]);

  return groups
    .filter((group) => group && typeof group === "object" && group.name)
    .map((group) => {
      const type = String(group.type || "select").toLowerCase();
      const next = { ...group, type };
      const rawProxies = Array.isArray(next.proxies) ? next.proxies : [];
      const expanded = rawProxies.flatMap((name) => name === "__AUTO__" ? proxyNames : [name]);
      const validTargets = type === "select"
        ? expanded.filter((name) => validSelectTargets.has(name))
        : expanded.filter((name) => proxyNameSet.has(name));

      if (needsProxyList.has(type)) {
        const useList = Array.isArray(next.use) ? next.use.filter(Boolean) : [];
        const proxies = uniq(validTargets);
        if (proxies.length) {
          next.proxies = proxies;
        } else if (!useList.length && proxyNames.length) {
          next.proxies = [...proxyNames];
        } else if (!useList.length) {
          next.proxies = ["DIRECT"];
        }
      }

      return next;
    });
}

function normalizeClashConfig(config = {}) {
  const proxies = Array.isArray(config.proxies) ? config.proxies.map(normalizeProxyForTarget) : [];
  const proxyNames = proxies.map((proxy) => proxy.name).filter(Boolean);
  const proxyGroups = normalizeClashProxyGroups(Array.isArray(config["proxy-groups"]) ? config["proxy-groups"] : [], proxyNames);
  return {
    ...config,
    proxies,
    "proxy-groups": proxyGroups.length
      ? proxyGroups
      : [{ name: "节点选择", type: "select", proxies: proxyNames.length ? [...proxyNames, "DIRECT"] : ["DIRECT"] }],
  };
}

export function resolveSubscriptionTarget({ explicitTarget = "", userAgent = "", accept = "", flag = "" } = {}) {
  const explicit = TARGET_ALIASES[String(explicitTarget || "").trim().toLowerCase()];
  if (explicit) return explicit;
  const flagTarget = TARGET_ALIASES[String(flag || "").trim().toLowerCase()];
  if (flagTarget) return flagTarget;

  const ua = String(userAgent || "").toLowerCase();
  if (ua.includes("sing-box") || ua.includes("singbox") || ua.includes("sfa/")) return "sing-box";
  if (
    ua.includes("v2ray")
    || ua.includes("v2rayn")
    || ua.includes("v2rayng")
    || ua.includes("shadowrocket")
    || ua.includes("nekoray")
    || ua.includes("nekobox")
  ) return "v2ray";
  if (
    ua.includes("clash")
    || ua.includes("mihomo")
    || ua.includes("stash")
    || ua.includes("verge")
    || ua.includes("flclash")
  ) return "clash";

  const accepted = String(accept || "").toLowerCase();
  if (accepted.includes("application/json")) return "sing-box";
  return "clash";
}

function proxyToRawLink(proxy) {
  const name = encodeURIComponent(getNodeName(proxy));
  const server = proxy.server;
  const port = proxy.port || 443;
  if (!server) return "";

  switch (String(proxy.type || "").toLowerCase()) {
    case "vmess": {
      const payload = {
        v: "2",
        ps: getNodeName(proxy),
        add: server,
        port: String(port),
        id: proxy.uuid,
        aid: String(proxy.alterId ?? proxy["alter-id"] ?? 0),
        scy: proxy.cipher || "auto",
        net: proxy.network || "tcp",
        type: "none",
        host: proxy["ws-opts"]?.headers?.Host || "",
        path: proxy["ws-opts"]?.path || "",
        tls: proxy.tls ? "tls" : "",
        sni: proxy.servername || proxy.sni || "",
      };
      return `vmess://${encodeBase64(JSON.stringify(payload))}`;
    }
    case "vless": {
      const params = new URLSearchParams();
      params.set("type", proxy.network || "tcp");
      params.set("security", proxy.reality ? "reality" : (proxy.tls ? "tls" : "none"));
      if (proxy.flow) params.set("flow", proxy.flow);
      if (proxy.servername) params.set("sni", proxy.servername);
      if (proxy["client-fingerprint"]) params.set("fp", proxy["client-fingerprint"]);
      if (proxy["skip-cert-verify"]) params.set("allowInsecure", "1");
      if (proxy["ws-opts"]?.path) params.set("path", proxy["ws-opts"].path);
      if (proxy["ws-opts"]?.headers?.Host) params.set("host", proxy["ws-opts"].headers.Host);
      if (proxy["reality-opts"]?.["public-key"]) params.set("pbk", proxy["reality-opts"]["public-key"]);
      if (proxy["reality-opts"]?.["short-id"]) params.set("sid", proxy["reality-opts"]["short-id"]);
      return `vless://${proxy.uuid}@${server}:${port}?${params.toString()}#${name}`;
    }
    case "trojan": {
      const params = new URLSearchParams();
      if (proxy.sni) params.set("sni", proxy.sni);
      if (proxy["skip-cert-verify"]) params.set("allowInsecure", "1");
      if (Array.isArray(proxy.alpn)) params.set("alpn", proxy.alpn.join(","));
      return `trojan://${encodeURIComponent(proxy.password || "")}@${server}:${port}?${params.toString()}#${name}`;
    }
    case "ss": {
      const userInfo = encodeBase64(`${proxy.cipher || proxy.method}:${proxy.password || ""}`);
      return `ss://${userInfo}@${server}:${port}#${name}`;
    }
    case "hysteria2": {
      const params = new URLSearchParams();
      if (proxy.sni) params.set("sni", proxy.sni);
      if (proxy["skip-cert-verify"]) params.set("insecure", "1");
      if (proxy.obfs) params.set("obfs", proxy.obfs);
      if (proxy["obfs-password"]) params.set("obfs-password", proxy["obfs-password"]);
      return `hysteria2://${encodeURIComponent(proxy.password || "")}@${server}:${port}?${params.toString()}#${name}`;
    }
    case "anytls": {
      const params = new URLSearchParams();
      if (proxy.sni) params.set("sni", proxy.sni);
      if (proxy["client-fingerprint"]) params.set("fp", proxy["client-fingerprint"]);
      if (proxy["skip-cert-verify"]) params.set("insecure", "1");
      if (Array.isArray(proxy.alpn)) params.set("alpn", proxy.alpn.join(","));
      return `anytls://${encodeURIComponent(proxy.password || "")}@${server}:${port}?${params.toString()}#${name}`;
    }
    default:
      return "";
  }
}

export function renderV2raySubscription(proxies = []) {
  const links = proxies.map(normalizeProxyForTarget).map(proxyToRawLink).filter(Boolean);
  return encodeBase64(links.join("\n"));
}

function withTls(proxy) {
  const enabled = bool(proxy.tls) || Boolean(proxy.sni || proxy.servername);
  if (!enabled) return undefined;
  return {
    enabled: true,
    server_name: proxy.servername || proxy.sni || proxy.server,
    insecure: bool(proxy["skip-cert-verify"]),
    alpn: Array.isArray(proxy.alpn) ? proxy.alpn : undefined,
  };
}

function withTransport(proxy) {
  if (proxy.network === "ws") {
    return {
      type: "ws",
      path: proxy["ws-opts"]?.path || "/",
      headers: proxy["ws-opts"]?.headers || undefined,
    };
  }
  if (proxy.network === "grpc") {
    return {
      type: "grpc",
      service_name: proxy["grpc-opts"]?.["grpc-service-name"] || "",
    };
  }
  return undefined;
}

function proxyToSingBoxOutbound(proxy) {
  const type = String(proxy.type || "").toLowerCase();
  const base = {
    type,
    tag: getNodeName(proxy),
    server: proxy.server,
    server_port: Number(proxy.port || 443),
  };
  if (!base.server) return null;

  if (type === "vmess") {
    return {
      ...base,
      uuid: proxy.uuid,
      security: proxy.cipher || "auto",
      alter_id: Number(proxy.alterId ?? proxy["alter-id"] ?? 0),
      tls: withTls(proxy),
      transport: withTransport(proxy),
    };
  }
  if (type === "vless") {
    return {
      ...base,
      uuid: proxy.uuid,
      flow: proxy.flow || undefined,
      tls: withTls(proxy),
      transport: withTransport(proxy),
    };
  }
  if (type === "trojan") {
    return { ...base, password: proxy.password, tls: withTls(proxy) || { enabled: true, server_name: proxy.sni || proxy.server } };
  }
  if (type === "ss") {
    return { ...base, method: proxy.cipher || proxy.method, password: proxy.password };
  }
  if (type === "hysteria2") {
    return {
      ...base,
      type: "hysteria2",
      password: proxy.password,
      tls: withTls(proxy) || { enabled: true, server_name: proxy.sni || proxy.server, insecure: bool(proxy["skip-cert-verify"]) },
    };
  }
  if (type === "anytls") {
    return {
      ...base,
      type: "anytls",
      password: proxy.password,
      tls: withTls(proxy) || { enabled: true, server_name: proxy.sni || proxy.server, insecure: bool(proxy["skip-cert-verify"]) },
    };
  }
  return null;
}

export function renderSingBoxSubscription(proxies = []) {
  const outbounds = proxies.map(normalizeProxyForTarget).map(proxyToSingBoxOutbound).filter(Boolean);
  const tags = outbounds.map((outbound) => outbound.tag);
  const config = {
    log: { level: "info" },
    outbounds: [
      { type: "selector", tag: "Proxy", outbounds: tags.length ? tags : ["direct"] },
      { type: "direct", tag: "direct" },
      ...outbounds,
    ],
    route: { final: "Proxy" },
  };
  return JSON.stringify(config, null, 2);
}

export function renderSubscription(config, target) {
  const clashConfig = normalizeClashConfig(config);
  return {
    body: yaml.dump(clashConfig),
    contentType: "text/yaml; charset=utf-8",
    filename: "CloudSub.yaml",
  };
}
