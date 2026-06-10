import airportRepository from "../db/airportRepository.js";
import commonRepository from "../db/commonRepository.js";
import selfNodeRepository from "../db/selfNodeRepository.js";
import { getAirportSnapshot, getNodePoolSnapshot, putNodePoolSnapshot, resolveConfigDocument } from "./r2CacheService.js";
import { getNodeBlockKeywords, getProxyBlockReason } from "../utils/nodeFilter.js";
import { getNodeRenameRules, renameProxyForDistribution } from "../utils/nodeRename.js";

const SUPPORTED_TYPES = new Set([
  "ss",
  "ssr",
  "vmess",
  "vless",
  "trojan",
  "hysteria",
  "hysteria2",
  "anytls",
]);

function createEmptySnapshot() {
  return {
    source: "empty",
    updatedAt: null,
    entries: [],
    rawEntries: [],
    filteredEntries: [],
    invalidEntries: [],
    duplicateEntries: [],
    subscriptionInfos: [],
    validCount: 0,
    filteredCount: 0,
    invalidCount: 0,
    duplicateCount: 0,
    changeSummary: {
      addedCount: 0,
      removedCount: 0,
    },
  };
}

function normalizeType(type) {
  return String(type || "").trim().toLowerCase();
}

function normalizePort(port) {
  const value = Number(port);
  return Number.isInteger(value) && value > 0 && value <= 65535 ? value : null;
}

function normalizeVmessCipher(value) {
  const cipher = String(value || "").trim().toLowerCase();
  return ["auto", "aes-128-gcm", "chacha20-poly1305", "none", "zero"].includes(cipher) ? cipher : "auto";
}

function normalizeProxy(proxy = {}) {
  const type = normalizeType(proxy?.type);
  if (type !== "vmess") return { ...proxy, type };
  return {
    ...proxy,
    type,
    cipher: normalizeVmessCipher(proxy.cipher || proxy.security),
  };
}

function getProxyName(proxy) {
  return String(proxy?.name || "").trim();
}

function normalizeKeywordList(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || "").trim()).filter(Boolean);
  }
  return String(value || "")
    .split(/[,?\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function getNodeNamingConfig(config = {}) {
  const naming = config?.cloudsub?.nodeNaming || {};
  return {
    mode: ["keep", "rules", "region_sequence"].includes(naming.mode) ? naming.mode : "keep",
    fallbackName: String(naming.fallbackName || "\u8282\u70b9").trim() || "\u8282\u70b9",
    appendNumber: naming.appendNumber !== false,
    regionRules: Array.isArray(naming.regionRules)
      ? naming.regionRules
          .map((rule) => ({
            name: String(rule?.name || "").trim(),
            keywords: normalizeKeywordList(rule?.keywords),
          }))
          .filter((rule) => rule.name && rule.keywords.length)
      : [],
  };
}

function detectRegionName(proxy, namingConfig) {
  const source = [
    proxy?.name,
    proxy?.server,
    proxy?.country,
    proxy?.region,
  ].filter(Boolean).join(" ").toLowerCase();

  for (const rule of namingConfig.regionRules) {
    if (rule.keywords.some((keyword) => source.includes(keyword.toLowerCase()))) {
      return rule.name;
    }
  }

  return namingConfig.fallbackName;
}

export function applyConfiguredNodeNames(entries = [], config = {}) {
  const renameRules = getNodeRenameRules(config);
  const namingConfig = getNodeNamingConfig(config);
  const baseEntries = entries.map((entry) => ({
    ...entry,
    originalName: entry.originalName || entry.proxy?.name || "",
  }));

  if (namingConfig.mode === "keep") {
    return baseEntries;
  }

  const renamedEntries = baseEntries.map((entry) => ({
    ...entry,
    proxy: renameProxyForDistribution(entry.proxy, renameRules),
  }));

  if (namingConfig.mode !== "region_sequence") {
    return renamedEntries;
  }

  const counters = new Map();
  return renamedEntries.map((entry) => {
    const region = detectRegionName(entry.proxy, namingConfig);
    const nextIndex = (counters.get(region) || 0) + 1;
    counters.set(region, nextIndex);
    return {
      ...entry,
      proxy: {
        ...entry.proxy,
        name: namingConfig.appendNumber ? `${region}${nextIndex}` : region,
      },
    };
  });
}

export function validateProxy(proxy) {
  const normalizedProxy = normalizeProxy(proxy);
  const type = normalizeType(normalizedProxy?.type);
  const server = String(normalizedProxy?.server || "").trim();
  const port = normalizePort(normalizedProxy?.port);
  const reasons = [];

  if (!getProxyName(normalizedProxy)) reasons.push("missing-name");
  if (!SUPPORTED_TYPES.has(type)) reasons.push("unsupported-type");
  if (!server) reasons.push("missing-server");
  if (!port) reasons.push("invalid-port");

  if ((type === "vmess" || type === "vless") && !normalizedProxy?.uuid) reasons.push("missing-uuid");
  if ((type === "trojan" || type === "anytls" || type === "hysteria" || type === "hysteria2") && !normalizedProxy?.password) reasons.push("missing-password");
  if (type === "ss" && (!normalizedProxy?.cipher || !normalizedProxy?.password)) reasons.push("missing-ss-auth");

  return {
    valid: reasons.length === 0,
    reasons,
    normalized: {
      ...normalizedProxy,
      type,
      server,
      port: port || normalizedProxy?.port,
    },
  };
}

export function proxyFingerprint(proxy) {
  const type = normalizeType(proxy?.type);
  const server = String(proxy?.server || "").trim().toLowerCase();
  const port = normalizePort(proxy?.port) || "";
  const auth = proxy?.uuid || proxy?.password || proxy?.cipher || "";
  return [type, server, port, auth].join("|");
}

function entryKey(entry) {
  return entry?.duplicateKey || proxyFingerprint(entry?.proxy || {});
}

export function summarizeChanges(previousSnapshot = {}, currentSnapshot = {}) {
  const previousKeys = new Set((previousSnapshot.entries || []).map(entryKey).filter(Boolean));
  const currentKeys = new Set((currentSnapshot.entries || []).map(entryKey).filter(Boolean));
  let addedCount = 0;
  let unchangedCount = 0;

  for (const key of currentKeys) {
    if (previousKeys.has(key)) {
      unchangedCount += 1;
    } else {
      addedCount += 1;
    }
  }

  let removedCount = 0;
  for (const key of previousKeys) {
    if (!currentKeys.has(key)) removedCount += 1;
  }

  return {
    addedCount,
    removedCount,
    unchangedCount,
    previousValidCount: previousKeys.size,
    currentValidCount: currentKeys.size,
  };
}

export function processProxyEntries(entries = [], options = {}) {
  const config = options.config || {};
  const validEntries = [];
  const invalidEntries = [];
  const filteredEntries = [];
  const duplicateEntries = [];
  const rawEntries = entries.map((entry, index) => ({
    ...entry,
    rawIndex: index,
    originalName: entry.proxy?.name || "",
  }));
  const statusByRawIndex = new Map();
  const seen = new Set();
  const blockKeywords = getNodeBlockKeywords(config);

  entries.forEach((entry, index) => {
    const validation = validateProxy(entry.proxy);
    const normalizedEntry = {
      ...entry,
      rawIndex: index,
      originalName: entry.proxy?.name || "",
      proxy: validation.normalized,
    };

    if (!validation.valid) {
      invalidEntries.push({
        ...normalizedEntry,
        invalidReasons: validation.reasons,
      });
      statusByRawIndex.set(index, {
        distributionStatus: "invalid",
        distributionReason: validation.reasons[0] || "invalid",
      });
      return;
    }

    const blockReason = getProxyBlockReason(validation.normalized, blockKeywords);
    if (blockReason) {
      filteredEntries.push({
        ...normalizedEntry,
        filterReason: blockReason,
        invalidReasons: [blockReason],
      });
      statusByRawIndex.set(index, {
        distributionStatus: "filtered",
        distributionReason: blockReason,
      });
      return;
    }

    const fingerprint = proxyFingerprint(validation.normalized);
    if (seen.has(fingerprint)) {
      duplicateEntries.push({
        ...normalizedEntry,
        duplicateKey: fingerprint,
      });
      statusByRawIndex.set(index, {
        distributionStatus: "duplicate",
        distributionReason: "duplicate",
      });
      return;
    }

    seen.add(fingerprint);
    validEntries.push({
      ...normalizedEntry,
      duplicateKey: fingerprint,
    });
    statusByRawIndex.set(index, {
      distributionStatus: "distributed",
      distributionReason: "",
    });
  });

  const finalEntries = applyConfiguredNodeNames(validEntries, config);
  const finalNameByRawIndex = new Map(
    finalEntries.map((entry) => [entry.rawIndex, entry.proxy?.name || ""]).filter(([, name]) => name)
  );
  const rawEntriesWithFinalNames = rawEntries.map((entry) => ({
    ...entry,
    ...(statusByRawIndex.get(entry.rawIndex) || {
      distributionStatus: "skipped",
      distributionReason: "skipped",
    }),
    finalName: finalNameByRawIndex.get(entry.rawIndex) || "",
  }));

  return {
    entries: finalEntries,
    rawEntries: rawEntriesWithFinalNames,
    invalidEntries,
    filteredEntries,
    duplicateEntries,
    validCount: finalEntries.length,
    invalidCount: invalidEntries.length,
    filteredCount: filteredEntries.length,
    duplicateCount: duplicateEntries.length,
  };
}

async function loadCommonConfig(env) {
  const config = await commonRepository.getInfoByType(env, "config");
  if (!config) return {};
  return await resolveConfigDocument(env, config.json) || {};
}

async function collectAirportEntries(env) {
  const airports = await airportRepository.getAllOpenAirports(env);
  const entries = [];
  const subscriptionInfos = [];

  for (const airport of airports.results || []) {
    const snapshot = await getAirportSnapshot(env, airport.id);
    if (!snapshot?.proxies) continue;
    if (snapshot.subscriptionInfo) subscriptionInfos.push(snapshot.subscriptionInfo);
    for (const proxy of snapshot.proxies) {
      entries.push({
        proxy,
        source: {
          type: "airport",
          id: airport.id,
          name: airport.name || airport.airport_name || "",
          remark: airport.remarks || "",
          fetchedAt: snapshot.fetchedAt,
          profile: snapshot.profile || "",
        },
      });
    }
  }

  return { entries, subscriptionInfos };
}

async function collectSelfNodeEntries(env) {
  const nodes = await selfNodeRepository.getAllNodes(env);
  const entries = [];

  for (const node of nodes.results || []) {
    try {
      entries.push({
        proxy: JSON.parse(node.convert),
        source: {
          type: "self",
          id: node.id,
          name: `self-${node.id}`,
          remark: "",
          fetchedAt: node.created_at || "",
          profile: "self-node",
        },
      });
    } catch (error) {
      entries.push({
        proxy: { name: `self-${node.id}`, type: "", server: "", port: "" },
        source: {
          type: "self",
          id: node.id,
          name: `self-${node.id}`,
          remark: "",
          fetchedAt: node.created_at || "",
          profile: "self-node",
        },
        parseError: error.message,
      });
    }
  }

  return entries;
}

export default {
  validateProxy,
  processProxyEntries,
  summarizeChanges,

  async rebuild(env) {
    const previousSnapshot = await getNodePoolSnapshot(env);
    const airportData = await collectAirportEntries(env);
    const selfEntries = await collectSelfNodeEntries(env);
    const config = await loadCommonConfig(env);
    const processed = processProxyEntries([...airportData.entries, ...selfEntries], { config });
    const snapshot = {
      source: "rebuilt",
      subscriptionInfos: airportData.subscriptionInfos,
      ...processed,
    };
    snapshot.changeSummary = summarizeChanges(previousSnapshot, snapshot);
    await putNodePoolSnapshot(env, snapshot);
    return snapshot;
  },

  async getSnapshot(env) {
    const snapshot = await getNodePoolSnapshot(env);
    if (!snapshot) return createEmptySnapshot();
    if (!Array.isArray(snapshot.entries)) {
      return { ...createEmptySnapshot(), ...snapshot };
    }
    const finalNameByRawIndex = new Map(
      snapshot.entries
        .map((entry) => [entry.rawIndex, entry.proxy?.name || ""])
        .filter(([index, name]) => index !== undefined && index !== null && name)
    );
    const rawEntries = (Array.isArray(snapshot.rawEntries) ? snapshot.rawEntries : snapshot.entries.map((entry, index) => ({
      ...entry,
      rawIndex: index,
      proxy: {
        ...entry.proxy,
        name: entry.originalName || entry.proxy?.name || "",
      },
    }))).map((entry) => ({
      ...entry,
      distributionStatus: entry.distributionStatus || (entry.finalName || finalNameByRawIndex.get(entry.rawIndex) ? "distributed" : "skipped"),
      distributionReason: entry.distributionReason || "",
      finalName: entry.finalName || finalNameByRawIndex.get(entry.rawIndex) || "",
    }));
    return {
      ...snapshot,
      rawEntries,
      validCount: snapshot.entries.length,
    };
  },
};
