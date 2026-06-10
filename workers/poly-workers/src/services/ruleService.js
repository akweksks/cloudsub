import ruleRepository from "../db/ruleRepository.js";
import groupRepository from "../db/groupRepository.js";
import rulesetSnapshotService from "./rulesetSnapshotService.js";
import { ensureFlagInUrl, fetchUpstreamSubscription } from "../utils/upstreamSubscription.js";

function formatRule(rule) {
  return {
    id: rule.id,
    ruleType: rule.rule_type,
    ruleParam: rule.rule_param,
    ruleConfig: rule.rule_config,
    resolveDns: rule.resolve_dns,
    createdAt: rule.created_at,
  };
}

function resolveImportedRuleTarget(ruleStr, groupInDb) {
  if (ruleStr.length === 2) return groupInDb[ruleStr[1]]?.id;
  const target = String(ruleStr[2] || "").toUpperCase();
  if (target === "REJECT") return -2;
  if (target === "DIRECT") return -1;
  return groupInDb[ruleStr[2]]?.id;
}

export default {
  async getAllRules(env) {
    const rules = await ruleRepository.getAllRules(env);
    return (rules.results || []).map(formatRule);
  },

  async getRulesPage(env, type, pageNum, pageSize, keyWord) {
    const count = await ruleRepository.getRulesCount(env, type, keyWord);
    const rules = await ruleRepository.getRulesPage(env, type, pageNum, pageSize, keyWord);
    return {
      count: count.results?.[0]?.total || 0,
      results: (rules.results || []).map(formatRule),
    };
  },

  async getAllRulesByType(env, type) {
    const rules = await ruleRepository.getAllRulesByType(env, type);
    return (rules.results || []).map(formatRule);
  },

  async getRuleById(env, id) {
    const rule = await ruleRepository.getRuleById(env, id);
    return rule ? formatRule(rule) : null;
  },

  async createRule(env, { ruleType, ruleParam, ruleConfig, resolveDns }) {
    if (ruleType === "MATCH") {
      const rules = await ruleRepository.getAllRulesByType(env, "MATCH");
      if ((rules.results || []).length > 0) return null;
    }
    const result = await ruleRepository.createRule(env, { ruleType, ruleParam, ruleConfig, resolveDns });
    await rulesetSnapshotService.refresh(env);
    return result;
  },

  async updateRule(env, { id, ruleType, ruleParam, ruleConfig, resolveDns }) {
    const result = await ruleRepository.updateRule(env, { id, ruleType, ruleParam, ruleConfig, resolveDns });
    await rulesetSnapshotService.refresh(env);
    return result;
  },

  async importRule(env, url) {
    const yml = await this.getYmlFromUrl(url);
    if (!yml) return { num: 0, newGroup: {} };

    const groupInDb = {};
    for (const group of yml["proxy-groups"] || []) {
      if (group.type !== "select") continue;
      groupInDb[group.name] = await groupRepository.addGroup(env, group.name, group.type, null, null, null);
    }

    const rulesList = [];
    for (const ruleSingle of yml.rules || []) {
      const ruleStr = String(ruleSingle).split(",");
      const configId = resolveImportedRuleTarget(ruleStr, groupInDb);
      if (configId === undefined) continue;
      rulesList.push({
        ruleType: ruleStr[0],
        ruleParam: ruleStr.length === 2 ? "" : ruleStr[1],
        ruleConfig: configId,
        resolveDns: ruleStr.length === 4 ? "1" : "",
      });
    }

    const num = await ruleRepository.createRulesBatch(env, rulesList);
    await rulesetSnapshotService.refresh(env);
    return { num, newGroup: groupInDb };
  },

  async getYmlFromUrl(url) {
    const result = await fetchUpstreamSubscription(url);
    return result.ok ? result.jsonData : null;
  },

  async ensureFlagInUrl(urlString) {
    return ensureFlagInUrl(urlString);
  },

  async deleteRule(env, id) {
    const result = await ruleRepository.deleteRule(env, id);
    await rulesetSnapshotService.refresh(env);
    return result;
  },

  async deleteAll(env) {
    const result = await ruleRepository.deleteAll(env);
    await rulesetSnapshotService.refresh(env);
    return result;
  },
};
