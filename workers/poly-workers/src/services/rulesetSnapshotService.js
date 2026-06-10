import groupRepository from "../db/groupRepository.js";
import ruleRepository from "../db/ruleRepository.js";
import { putRulesetSnapshot } from "./r2CacheService.js";

function formatRuleConfig(rule, groupMap) {
  if (rule.rule_type === 'DOMAIN-SUFFIX' || rule.rule_type === 'DOMAIN' || rule.rule_type === 'DOMAIN-KEYWORD') {
    return `${rule.rule_type},${rule.rule_param},${groupMap[rule.rule_config]}`;
  } else if (rule.rule_type === 'GEOIP') {
    return `${rule.rule_type},${rule.rule_param},${groupMap[rule.rule_config]}`;
  } else if (rule.rule_type === 'IP-CIDR' || rule.rule_type === 'IP-CIDR6') {
    if (rule.resolve_dns !== null) {
      if (rule.resolve_dns === "0") {
        return `${rule.rule_type},${rule.rule_param},${groupMap[rule.rule_config]},no-resolve`;
      }
      return `${rule.rule_type},${rule.rule_param},${groupMap[rule.rule_config]}`;
    }
    return `${rule.rule_type},${rule.rule_param},${groupMap[rule.rule_config]}`;
  } else if (rule.rule_type === 'SRC-IP-CIDR' || rule.rule_type === 'SRC-PORT' || rule.rule_type === 'DST-PORT') {
    return `${rule.rule_type},${rule.rule_param},${groupMap[rule.rule_config]}`;
  } else if (rule.rule_type === 'PROCESS-NAME' || rule.rule_type === 'PROCESS-PATH') {
    return `${rule.rule_type},${rule.rule_param},${groupMap[rule.rule_config]}`;
  } else if (rule.rule_type === 'MATCH') {
    return `${rule.rule_type},${groupMap[rule.rule_config]}`;
  }
  return null;
}

export async function buildGroupMap(env) {
  const groupsFromDb = await groupRepository.getAllGroups(env);
  const groupMap = {};
  (groupsFromDb.results || []).forEach((group) => {
    groupMap[group.id] = group.group_name;
  });
  groupMap[-1] = 'DIRECT';
  groupMap[-2] = 'REJECT';
  return groupMap;
}

export default {
  async buildSnapshot(env) {
    const groupMap = await buildGroupMap(env);
    const rules = await ruleRepository.getAllRules(env);
    const rulesConfig = (rules.results || [])
      .map((rule) => formatRuleConfig(rule, groupMap))
      .filter(Boolean);
    return {
      groupSignature: JSON.stringify(groupMap),
      rulesConfig,
    };
  },

  async refresh(env) {
    const snapshot = await this.buildSnapshot(env);
    await putRulesetSnapshot(env, {
      groupSignature: snapshot.groupSignature,
      rulesConfig: snapshot.rulesConfig,
    });
    return snapshot.rulesConfig;
  },
};
