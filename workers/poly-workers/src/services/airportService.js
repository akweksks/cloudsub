import airportRepository from "../db/airportRepository.js";
import airportHealthService from "./airportHealthService.js";
import { getAirportSnapshot } from "./r2CacheService.js";

function formatAirport(airport) {
  return {
    id: airport.id,
    name: airport.name,
    subscriptionUrl: airport.subscription_url,
    remarks: airport.remarks,
    createdAt: airport.created_at,
    isEnabled: airport.is_enabled,
    healthStatus: airport.health_status || "unknown",
    healthNodeCount: airport.health_node_count ?? 0,
    healthUserInfo: airport.health_userinfo || "",
    healthUpload: airport.health_upload ?? null,
    healthDownload: airport.health_download ?? null,
    healthTotal: airport.health_total ?? null,
    healthExpireAt: airport.health_expire_at || null,
    healthError: airport.health_error || "",
    lastCheckedAt: airport.last_checked_at || null,
  };
}

function formatAirportNode(node) {
  return {
    id: node.id,
    airportId: node.airport_id,
    name: node.node_name,
    type: node.node_type,
    server: node.server,
    port: node.port,
    sourceProfile: node.source_profile,
    fetchedAt: node.fetched_at,
  };
}

export default {
  async createAirport(env, name, subscriptionUrl, remarks, isEnabled) {
    return await airportRepository.createAirport(env, name, subscriptionUrl, remarks, isEnabled);
  },

  async getAllAirports(env) {
    const airports = await airportRepository.getAllAirports(env);
    return (airports.results || []).map(formatAirport);
  },

  async getAirportById(env, id) {
    return await airportRepository.getAirportById(env, id);
  },

  async updateAirport(env, id, name, subscriptionUrl, remarks, isEnabled) {
    return await airportRepository.updateAirport(env, id, name, subscriptionUrl, remarks, isEnabled);
  },

  async deleteAirport(env, id) {
    return await airportRepository.deleteAirport(env, id);
  },

  async checkAirport(env, id) {
    return await airportHealthService.checkById(env, id);
  },

  async checkAllAirports(env) {
    return await airportHealthService.checkAll(env);
  },

  async getAirportNodes(env, id) {
    const snapshot = await getAirportSnapshot(env, id);
    if (snapshot?.proxies) {
      return snapshot.proxies.map((proxy, index) => ({
        id: index + 1,
        airportId: Number(id),
        name: proxy.name,
        type: proxy.type,
        server: proxy.server,
        port: proxy.port,
        sourceProfile: snapshot.profile,
        fetchedAt: snapshot.fetchedAt,
      }));
    }
    const nodes = await airportRepository.getAirportNodes(env, id);
    return (nodes.results || []).map(formatAirportNode);
  },
};
