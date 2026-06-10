import yaml from "js-yaml";

const AIRPORT_RAW_PREFIX = "airports/raw";
const AIRPORT_NORMALIZED_PREFIX = "airports/normalized";
const SUBSCRIPTION_PREFIX = "subscriptions";
const TEMPLATE_PREFIX = "templates";
const ROUTING_PROFILE_PREFIX = "routing-profiles";
const CONFIG_PREFIX = "configs";
const RULESET_PREFIX = "rulesets";
const LOG_PREFIX = "logs/subscription";
const OPERATION_LOG_PREFIX = "logs/operation";
const NODE_POOL_PREFIX = "nodes/pool";
const NODE_POOL_HISTORY_PREFIX = "nodes/pool/history";
const SYNC_HISTORY_PREFIX = "scheduler/upstream/history";
const VERSION_PREFIX = "versions";
const R2_POINTER_PREFIX = "r2://";
const CONFIG_CACHE_TTL_MS = 10000;
const configDocumentCacheByEnv = new WeakMap();

function hasR2(env) {
  return Boolean(env?.SUB_CACHE);
}

function hasKV(env) {
  return Boolean(env?.SUB_KV);
}

function jsonHeaders(extra = {}) {
  return {
    httpMetadata: { contentType: "application/json; charset=utf-8" },
    customMetadata: Object.fromEntries(
      Object.entries(extra).map(([key, value]) => [key, String(value ?? "")])
    ),
  };
}

function textHeaders(contentType = "text/plain; charset=utf-8", extra = {}) {
  return {
    httpMetadata: { contentType },
    customMetadata: Object.fromEntries(
      Object.entries(extra).map(([key, value]) => [key, String(value ?? "")])
    ),
  };
}

function parseJsonSafely(value, fallback = null) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function parseYamlSafely(value, fallback = null) {
  try {
    return yaml.load(value);
  } catch {
    return fallback;
  }
}

function getEnvCache(env) {
  if (!env || typeof env !== "object") return null;
  let cache = configDocumentCacheByEnv.get(env);
  if (!cache) {
    cache = new Map();
    configDocumentCacheByEnv.set(env, cache);
  }
  return cache;
}

function getCachedConfigPayload(env, pointer) {
  const cache = getEnvCache(env);
  const cached = cache?.get(pointer);
  if (!cached) return null;
  if (Date.now() - cached.cachedAt > CONFIG_CACHE_TTL_MS) {
    cache.delete(pointer);
    return null;
  }
  return cached.payload;
}

function setCachedConfigPayload(env, pointer, payload) {
  const cache = getEnvCache(env);
  cache?.set(pointer, { payload, cachedAt: Date.now() });
}

function deleteCachedConfigPayload(env, pointer) {
  const cache = getEnvCache(env);
  cache?.delete(pointer);
}

async function putKvJson(env, key, data) {
  if (!hasKV(env)) return false;
  await env.SUB_KV.put(key, JSON.stringify(data));
  return true;
}

async function getKvJson(env, key) {
  if (!hasKV(env)) return null;
  const value = await env.SUB_KV.get(key);
  if (!value) return null;
  return parseJsonSafely(value, null);
}

function dayFromIso(isoString) {
  return String(isoString || new Date().toISOString()).slice(0, 10);
}

export function createR2Pointer(key) {
  return `${R2_POINTER_PREFIX}${key}`;
}

export function isR2Pointer(value) {
  return typeof value === "string" && value.startsWith(R2_POINTER_PREFIX);
}

export function keyFromR2Pointer(value) {
  return isR2Pointer(value) ? value.slice(R2_POINTER_PREFIX.length) : value;
}

export function airportRawKey(airportId) {
  return `${AIRPORT_RAW_PREFIX}/${airportId}/latest.txt`;
}

export function airportNormalizedKey(airportId) {
  return `${AIRPORT_NORMALIZED_PREFIX}/${airportId}/latest.json`;
}

export function subscriptionOutputKey(token, target) {
  return `${SUBSCRIPTION_PREFIX}/${token}/${target}/latest`;
}

export function versionedSubscriptionOutputKey(token, target, version = "default") {
  return `${SUBSCRIPTION_PREFIX}/${token}/${target}/${version}/latest`;
}

export function templateContentKey(templateId) {
  return `${TEMPLATE_PREFIX}/${templateId}/current.yaml`;
}

export function routingProfileContentKey(profileId) {
  return `${ROUTING_PROFILE_PREFIX}/${profileId}/current.yaml`;
}

export function configCurrentKey(type = "config") {
  return `${CONFIG_PREFIX}/${type}/current.json`;
}

export function configVersionKey(type = "config", version = new Date().toISOString()) {
  return `${CONFIG_PREFIX}/${type}/versions/${version.replace(/[:.]/g, "-")}.json`;
}

export function rulesetSnapshotKey() {
  return `${RULESET_PREFIX}/current.json`;
}

export function subscriptionLogKey(accessedAt = new Date().toISOString(), random = crypto.randomUUID()) {
  return `${LOG_PREFIX}/${dayFromIso(accessedAt)}/${accessedAt.replace(/[:.]/g, "-")}-${random}.json`;
}

export function operationalLogKey(createdAt = new Date().toISOString(), random = crypto.randomUUID()) {
  return `${OPERATION_LOG_PREFIX}/${dayFromIso(createdAt)}/${createdAt.replace(/[:.]/g, "-")}-${random}.json`;
}

export function nodePoolSnapshotKey() {
  return `${NODE_POOL_PREFIX}/latest.json`;
}

export function nodePoolHistoryKey(updatedAt = new Date().toISOString(), random = crypto.randomUUID()) {
  return `${NODE_POOL_HISTORY_PREFIX}/${dayFromIso(updatedAt)}/${updatedAt.replace(/[:.]/g, "-")}-${random}.json`;
}

export function schedulerStatusKey() {
  return "scheduler/upstream/latest.json";
}

export function schedulerHistoryKey(ranAt = new Date().toISOString(), random = crypto.randomUUID()) {
  return `${SYNC_HISTORY_PREFIX}/${dayFromIso(ranAt)}/${ranAt.replace(/[:.]/g, "-")}-${random}.json`;
}

export function dataVersionKey() {
  return `${VERSION_PREFIX}/subscription-source.json`;
}

export async function putAirportSnapshot(env, airportId, snapshot) {
  if (!hasR2(env)) return false;
  const fetchedAt = snapshot.fetchedAt || new Date().toISOString();
  await env.SUB_CACHE.put(airportRawKey(airportId), snapshot.rawText || "", {
    httpMetadata: { contentType: "text/plain; charset=utf-8" },
    customMetadata: {
      fetchedAt,
      profile: snapshot.profile || "",
      subscriptionInfo: snapshot.subscriptionInfo || "",
    },
  });
  await env.SUB_CACHE.put(airportNormalizedKey(airportId), JSON.stringify({
    airportId,
    fetchedAt,
    profile: snapshot.profile || "",
    subscriptionInfo: snapshot.subscriptionInfo || "",
    proxies: snapshot.proxies || [],
  }), jsonHeaders({
    fetchedAt,
    profile: snapshot.profile || "",
    nodeCount: (snapshot.proxies || []).length,
  }));
  return true;
}

export async function getAirportSnapshot(env, airportId) {
  if (!hasR2(env)) return null;
  const object = await env.SUB_CACHE.get(airportNormalizedKey(airportId));
  if (!object) return null;
  return await object.json();
}

export async function putSubscriptionOutput(env, token, target, rendered, ttlSeconds = 300, subscriptionInfo = "") {
  if (!hasR2(env)) return false;
  const generatedAt = new Date().toISOString();
  await env.SUB_CACHE.put(versionedSubscriptionOutputKey(token, target, rendered.version || "default"), rendered.body, {
    httpMetadata: { contentType: rendered.contentType },
    customMetadata: {
      generatedAt,
      ttlSeconds: String(ttlSeconds),
      filename: rendered.filename || "",
      subscriptionInfo,
    },
  });
  return true;
}

export async function getSubscriptionOutput(env, token, target, version = "default") {
  if (!hasR2(env)) return null;
  const object = await env.SUB_CACHE.get(versionedSubscriptionOutputKey(token, target, version));
  if (!object) return null;
  const generatedAt = object.customMetadata?.generatedAt;
  const ttlSeconds = Number(object.customMetadata?.ttlSeconds || 0);
  if (generatedAt && ttlSeconds > 0) {
    const ageMs = Date.now() - new Date(generatedAt).getTime();
    if (ageMs > ttlSeconds * 1000) return null;
  }
  return {
    body: await object.text(),
    contentType: object.httpMetadata?.contentType || "text/plain; charset=utf-8",
    filename: object.customMetadata?.filename || "CloudSub.txt",
    subscriptionInfo: object.customMetadata?.subscriptionInfo || "",
    generatedAt,
  };
}

export async function putTextDocument(env, key, body, contentType = "text/plain; charset=utf-8", metadata = {}) {
  if (!hasR2(env)) return false;
  await env.SUB_CACHE.put(key, body || "", textHeaders(contentType, metadata));
  return true;
}

export async function getTextDocument(env, key) {
  if (!hasR2(env) || !key) return null;
  const object = await env.SUB_CACHE.get(keyFromR2Pointer(key));
  if (!object) return null;
  return await object.text();
}

export async function putJsonDocument(env, key, data, metadata = {}) {
  if (!hasR2(env)) return false;
  await env.SUB_CACHE.put(key, JSON.stringify(data), jsonHeaders(metadata));
  return true;
}

export async function getJsonDocument(env, key) {
  if (!hasR2(env) || !key) return null;
  const object = await env.SUB_CACHE.get(keyFromR2Pointer(key));
  if (!object) return null;
  try {
    return await object.json();
  } catch (error) {
    console.warn(`Skip invalid R2 JSON document ${key}: ${error.message}`);
    return null;
  }
}

async function listJsonDocuments(env, prefix, options = 50) {
  if (!hasR2(env)) return [];
  const safeLimit = Math.min(Math.max(Number(options?.limit ?? options) || 50, 1), 500);
  const scanLimit = Math.min(Math.max(Number(options?.scanLimit) || 1000, safeLimit), 1000);
  const objects = [];
  let cursor;
  do {
    const listed = await env.SUB_CACHE.list({
      prefix,
      limit: Math.min(1000, scanLimit - objects.length),
      cursor,
    });
    objects.push(...(listed?.objects || []));
    cursor = listed?.truncated && objects.length < scanLimit ? listed.cursor : undefined;
  } while (cursor && objects.length < scanLimit);
  const rows = await Promise.all(objects.map(async (item) => {
    try {
      const object = await env.SUB_CACHE.get(item.key);
      if (!object) return null;
      return await object.json();
    } catch (error) {
      console.warn(`Skip invalid R2 JSON document ${item.key}: ${error.message}`);
      return null;
    }
  }));
  return rows
    .filter(Boolean)
    .sort((a, b) => String(b.createdAt || b.ranAt || b.updatedAt || "").localeCompare(String(a.createdAt || a.ranAt || a.updatedAt || "")))
    .slice(0, safeLimit);
}

async function deleteDocumentsByPrefix(env, prefix, limit = 500) {
  if (!hasR2(env)) return 0;
  let deleted = 0;
  let cursor;
  const safeLimit = Math.min(Math.max(Number(limit) || 500, 1), 1000);
  do {
    const listed = await env.SUB_CACHE.list({ prefix, limit: safeLimit, cursor });
    const objects = listed?.objects || [];
    for (const item of objects) {
      await env.SUB_CACHE.delete(item.key);
      deleted += 1;
    }
    cursor = listed?.truncated ? listed.cursor : undefined;
  } while (cursor);
  return deleted;
}

export async function putTemplateContent(env, templateId, yamlContent, metadata = {}) {
  const key = templateContentKey(templateId);
  const ok = await putTextDocument(env, key, yamlContent, "text/yaml; charset=utf-8", {
    templateId,
    updatedAt: new Date().toISOString(),
    ...metadata,
  });
  return ok ? createR2Pointer(key) : null;
}

export async function hydrateTemplateContent(env, template) {
  if (!template) return null;
  if (!isR2Pointer(template.yaml_content)) return template;
  const yamlContent = await getTextDocument(env, template.yaml_content);
  return {
    ...template,
    yaml_content: yamlContent ?? "",
    yaml_content_ref: template.yaml_content,
  };
}

export async function putRoutingProfileContent(env, profileId, content, metadata = {}) {
  const key = routingProfileContentKey(profileId);
  const body = typeof content === "string" ? content : yaml.dump(content || {});
  const ok = await putTextDocument(env, key, body, "text/yaml; charset=utf-8", {
    profileId,
    updatedAt: new Date().toISOString(),
    ...metadata,
  });
  await bumpDataVersion(env, `routing-profile:${profileId}`);
  return ok ? createR2Pointer(key) : null;
}

export async function hydrateRoutingProfileContent(env, profile) {
  if (!profile) return null;
  let content = null;
  if (isR2Pointer(profile.content_ref)) {
    const raw = await getTextDocument(env, profile.content_ref);
    content = raw ? parseYamlSafely(raw, null) : null;
  } else {
    content = parseYamlSafely(profile.content_ref, null) || parseJsonSafely(profile.content_ref, null);
  }
  return {
    ...profile,
    content: content || null,
    rawContent: content ? yaml.dump(content, { lineWidth: 120, noRefs: true, sortKeys: false }) : "",
  };
}

export async function putConfigDocument(env, type, config) {
  const updatedAt = new Date().toISOString();
  const versionKey = configVersionKey(type, updatedAt);
  const currentKey = configCurrentKey(type);
  const payload = {
    type,
    updatedAt,
    config,
  };
  await putJsonDocument(env, versionKey, payload, { type, updatedAt });
  const ok = await putJsonDocument(env, currentKey, payload, { type, updatedAt, versionKey });
  await putKvJson(env, currentKey, payload);
  deleteCachedConfigPayload(env, createR2Pointer(currentKey));
  await bumpDataVersion(env, `config:${type}`);
  return ok ? createR2Pointer(currentKey) : null;
}

export async function resolveConfigDocument(env, storedValue) {
  if (!storedValue) return null;
  if (isR2Pointer(storedValue)) {
    const cached = getCachedConfigPayload(env, storedValue);
    if (cached) return cached?.config ?? null;
    const kvPayload = await getKvJson(env, keyFromR2Pointer(storedValue));
    if (kvPayload) return kvPayload?.config ?? null;
    const payload = await getJsonDocument(env, storedValue);
    if (payload) setCachedConfigPayload(env, storedValue, payload);
    return payload?.config ?? null;
  }
  return parseJsonSafely(storedValue, null);
}

export async function putRulesetSnapshot(env, snapshot) {
  const ok = await putJsonDocument(env, rulesetSnapshotKey(), {
    updatedAt: new Date().toISOString(),
    ...snapshot,
  }, {
    ruleCount: snapshot?.rulesConfig?.length ?? 0,
  });
  await bumpDataVersion(env, "ruleset");
  return ok;
}

export async function getRulesetSnapshot(env) {
  return await getJsonDocument(env, rulesetSnapshotKey());
}

export async function archiveSubscriptionLog(env, log) {
  if (!hasR2(env)) return false;
  return await putJsonDocument(env, subscriptionLogKey(log.accessedAt), {
    archivedAt: new Date().toISOString(),
    ...log,
  }, {
    status: log.status,
    code: log.code,
    accessedAt: log.accessedAt,
  });
}

export async function appendOperationalLog(env, log) {
  const createdAt = log.createdAt || new Date().toISOString();
  return await putJsonDocument(env, operationalLogKey(createdAt), {
    createdAt,
    level: log.level || "info",
    actor: log.actor || "admin",
    action: log.action || "unknown",
    message: log.message || "",
    target: log.target || "",
    metadata: log.metadata || {},
  }, {
    action: log.action || "unknown",
    level: log.level || "info",
    createdAt,
  });
}

export async function listOperationalLogs(env, options = {}) {
  return await listJsonDocuments(env, OPERATION_LOG_PREFIX, options);
}

export async function clearOperationalLogs(env) {
  return await deleteDocumentsByPrefix(env, OPERATION_LOG_PREFIX);
}

export async function putNodePoolSnapshot(env, snapshot) {
  const updatedAt = snapshot.updatedAt || new Date().toISOString();
  const payload = {
    updatedAt,
    ...snapshot,
  };
  const ok = await putJsonDocument(env, nodePoolSnapshotKey(), payload, {
    validCount: snapshot?.validCount ?? 0,
    invalidCount: snapshot?.invalidCount ?? 0,
    filteredCount: snapshot?.filteredCount ?? 0,
    duplicateCount: snapshot?.duplicateCount ?? 0,
  });
  await putJsonDocument(env, nodePoolHistoryKey(updatedAt), payload, {
    validCount: snapshot?.validCount ?? 0,
    addedCount: snapshot?.changeSummary?.addedCount ?? 0,
    removedCount: snapshot?.changeSummary?.removedCount ?? 0,
    updatedAt,
  });
  await putKvJson(env, nodePoolSnapshotKey(), payload);
  await bumpDataVersion(env, "node-pool");
  return ok;
}

export async function getNodePoolSnapshot(env) {
  const cached = await getKvJson(env, nodePoolSnapshotKey());
  if (cached) return cached;
  return await getJsonDocument(env, nodePoolSnapshotKey());
}

export async function getSchedulerStatus(env) {
  const cached = await getKvJson(env, schedulerStatusKey());
  if (cached) return cached;
  return await getJsonDocument(env, schedulerStatusKey());
}

export async function putSchedulerStatus(env, summary) {
  const ranAt = summary.ranAt || new Date().toISOString();
  const payload = { ...summary, ranAt };
  await putJsonDocument(env, schedulerHistoryKey(ranAt), payload, {
    ranAt,
    checkedCount: payload.checked?.length || 0,
    skippedCount: payload.skipped?.length || 0,
  });
  await putKvJson(env, schedulerStatusKey(), payload);
  return await putJsonDocument(env, schedulerStatusKey(), payload, {
    ranAt,
    checkedCount: payload.checked?.length || 0,
    skippedCount: payload.skipped?.length || 0,
    validCount: payload.nodePool?.validCount || 0,
  });
}

export async function listSchedulerHistory(env, options = {}) {
  return await listJsonDocuments(env, SYNC_HISTORY_PREFIX, options);
}

export async function listNodePoolHistory(env, options = {}) {
  return await listJsonDocuments(env, NODE_POOL_HISTORY_PREFIX, options);
}

export async function clearSchedulerHistory(env) {
  return await deleteDocumentsByPrefix(env, SYNC_HISTORY_PREFIX);
}

export async function clearNodePoolHistory(env) {
  return await deleteDocumentsByPrefix(env, NODE_POOL_HISTORY_PREFIX);
}

export async function bumpDataVersion(env, reason = "updated") {
  const version = new Date().toISOString().replace(/[:.]/g, "-");
  const payload = {
    version,
    reason,
    updatedAt: new Date().toISOString(),
  };
  await putJsonDocument(env, dataVersionKey(), payload, payload);
  return version;
}

export async function getDataVersion(env) {
  const payload = await getJsonDocument(env, dataVersionKey());
  return payload?.version || "default";
}

export default {
  putAirportSnapshot,
  getAirportSnapshot,
  putSubscriptionOutput,
  getSubscriptionOutput,
  getDataVersion,
  bumpDataVersion,
  putTemplateContent,
  hydrateTemplateContent,
  putRoutingProfileContent,
  hydrateRoutingProfileContent,
  putConfigDocument,
  resolveConfigDocument,
  putRulesetSnapshot,
  getRulesetSnapshot,
  archiveSubscriptionLog,
  appendOperationalLog,
  listOperationalLogs,
  clearOperationalLogs,
  putNodePoolSnapshot,
  getNodePoolSnapshot,
  listNodePoolHistory,
  clearNodePoolHistory,
  getSchedulerStatus,
  putSchedulerStatus,
  listSchedulerHistory,
  clearSchedulerHistory,
};
