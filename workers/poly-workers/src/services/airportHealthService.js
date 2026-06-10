import airportRepository from "../db/airportRepository.js";
import { fetchUpstreamSubscription } from "../utils/upstreamSubscription.js";
import { putAirportSnapshot } from "./r2CacheService.js";
import nodePoolService from "./nodePoolService.js";

function parseUserInfo(userInfo) {
  if (!userInfo) return {};
  const values = {};
  for (const part of userInfo.split(";")) {
    const [rawKey, rawValue] = part.split("=").map((item) => item?.trim());
    if (!rawKey || rawValue === undefined) continue;
    const value = Number(rawValue);
    values[rawKey] = Number.isFinite(value) ? value : rawValue;
  }

  return {
    upload: Number.isFinite(values.upload) ? values.upload : null,
    download: Number.isFinite(values.download) ? values.download : null,
    total: Number.isFinite(values.total) ? values.total : null,
    expireAt: Number.isFinite(values.expire) && values.expire > 0 ? new Date(values.expire * 1000).toISOString() : null,
  };
}

function resolveStatus({ ok, nodeCount, expireAt }) {
  if (!ok) return "unhealthy";
  if (expireAt && new Date(expireAt).getTime() <= Date.now()) return "expired";
  if (nodeCount <= 0) return "empty";
  return "healthy";
}

export default {
  parseUserInfo,

  async checkAirport(env, airport) {
    const checkedAt = new Date().toISOString();
    try {
      const result = await fetchUpstreamSubscription(airport.subscription_url || airport.subscriptionUrl);
      if (!result.ok) {
        return {
          status: "unhealthy",
          nodeCount: 0,
          userInfo: result.subscriptionInfo || "",
          error: result.error || result.failures?.join("; ") || "上游订阅拉取失败",
          checkedAt,
        };
      }

      const proxies = Array.isArray(result.jsonData?.proxies) ? result.jsonData.proxies : [];
      const userInfo = result.subscriptionInfo || "";
      const parsedInfo = parseUserInfo(userInfo);
      const status = resolveStatus({ ok: true, nodeCount: proxies.length, expireAt: parsedInfo.expireAt });

      return {
        status,
        nodeCount: proxies.length,
        userInfo,
        ...parsedInfo,
        error: status === "empty" ? "上游订阅未返回节点" : "",
        checkedAt,
        sourceProfile: result.profile,
        rawText: result.text || "",
        nodes: proxies,
      };
    } catch (error) {
      return {
        status: "unhealthy",
        nodeCount: 0,
        userInfo: "",
        error: error.name === "AbortError" ? "检测超时" : error.message,
        checkedAt,
      };
    }
  },

  async checkAndSave(env, airport, options = {}) {
    const health = await this.checkAirport(env, airport);
    await airportRepository.updateAirportHealth(env, airport.id, health);
    if (Array.isArray(health.nodes)) {
      await putAirportSnapshot(env, airport.id, {
        rawText: health.rawText || "",
        proxies: health.nodes,
        profile: health.sourceProfile,
        subscriptionInfo: health.userInfo,
        fetchedAt: health.checkedAt,
      });
      if (!options.skipNodePoolRebuild) {
        await nodePoolService.rebuild(env);
      }
    }
    return health;
  },

  async checkById(env, id) {
    const airport = await airportRepository.getAirportById(env, id);
    if (!airport) return null;
    return await this.checkAndSave(env, airport);
  },

  async checkAll(env) {
    const airports = await airportRepository.getAllAirports(env);
    const results = [];
    for (const airport of airports.results || []) {
      results.push({
        id: airport.id,
        name: airport.name,
        health: await this.checkAndSave(env, airport),
      });
    }
    return results;
  },
};
