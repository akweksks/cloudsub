import commonRepository from "../db/commonRepository.js";
import airportRepository from "../db/airportRepository.js";
import groupRepository from "../db/groupRepository.js";
import selfNodeRepository from "../db/selfNodeRepository.js";
import clashTemplateService, { applyClashTemplate } from "./clashTemplateService.js";
import nodePoolService from "./nodePoolService.js";
import rulesetSnapshotService from "./rulesetSnapshotService.js";
import yaml from 'js-yaml';
import { ensureFlagInUrl, fetchUpstreamSubscription } from "../utils/upstreamSubscription.js";
import { getAirportSnapshot, putAirportSnapshot, getRulesetSnapshot, putConfigDocument, putRulesetSnapshot, resolveConfigDocument } from "./r2CacheService.js";
import {
  filterProxiesForDistribution,
  getNodeBlockKeywords,
  shouldBlockProxy,
} from "../utils/nodeFilter.js";
import { getNodeRenameRules, renameProxyForDistribution } from "../utils/nodeRename.js";

export {
  filterProxiesForDistribution,
  getNodeBlockKeywords,
  shouldBlockProxy,
} from "../utils/nodeFilter.js";

export {
  getNodeRenameRules,
  renameProxyForDistribution,
} from "../utils/nodeRename.js";


const json = {
  "mixed-port": 7890,
  "allow-lan": false,
  "bind-address": "*",
  "mode": "rule",
  "log-level": "info",
  "external-controller": "127.0.0.1:9090",
  "unified-delay": true,
  "tcp-concurrent": true,
  "cloudsub": {
    "upstreamRefreshIntervalHours": 6,
    "distributionDomains": [],
    "adminSessionTtlHours": 12,
    "adminIpWhitelist": [],
    "nodeBlockKeywords": [],
    "nodeRenameRules": [],
    "nodeNaming": {
      "mode": "keep",
      "fallbackName": "节点",
      "appendNumber": true,
      "regionRules": []
    }
  },
  "dns": {
    "enable": true,
    "ipv6": false,
    "default-nameserver": [
      "223.5.5.5",
      "119.29.29.29"
    ],
    "enhanced-mode": "fake-ip",
    "fake-ip-range": "198.18.0.1/16",
    "use-hosts": true,
    "nameserver": [
      "https://dns.alidns.com/dns-query",
      "https://doh.pub/dns-query"
    ],
    "fallback": [
      "https://dns.alidns.com/dns-query",
      "https://doh.pub/dns-query"
    ],
    "fallback-filter": {
      "geoip": true,
      "ipcidr": [
        "240.0.0.0/4",
        "0.0.0.0/32"
      ]
    }
  }
};

function applyAirportRemark(proxy, remark) {
  if (!remark) return proxy;
  return { ...proxy, name: `${remark}-${proxy.name}` };
}

async function saveCommonConfig(env, configObject) {
  const jsonData = JSON.stringify(configObject);
  const pointer = await putConfigDocument(env, "config", configObject);
  return pointer || jsonData;
}

async function loadCommonConfig(env) {
  const config = await commonRepository.getInfoByType(env, 'config');
  if (!config) return null;
  return await resolveConfigDocument(env, config.json);
}

async function loadRulesConfig(env, groupMap) {
  const groupSignature = JSON.stringify(groupMap);
  const snapshot = await getRulesetSnapshot(env);
  if (snapshot?.groupSignature === groupSignature && Array.isArray(snapshot.rulesConfig)) {
    return snapshot.rulesConfig;
  }

  const nextSnapshot = await rulesetSnapshotService.buildSnapshot(env);
  await putRulesetSnapshot(env, nextSnapshot);
  return nextSnapshot.rulesConfig;
}

export default {
  // 获取订阅
  async getSub(env) {
    const sub = await commonRepository.getInfoByType(env, 'sub');
    if (!sub) return null;
    const obj = JSON.parse(sub.json);
    return {
      subUrl: obj.subUrl
    };
  },

  async initCheck(env, authHeader) {
    const token = await commonRepository.getInfoByType(env, 'token');
    if (!token) return null;
    const obj = JSON.parse(token.json);
    if (obj.token!== authHeader) {
      return null;
    } else {
      return {
        token: obj.token
      };
    }

  },

  async getConfig(env) {
    const config = await commonRepository.getInfoByType(env, 'config');
    if (!config) return null;
    return await resolveConfigDocument(env, config.json);
  },

  async resetConfig(env) {
    const defaultConfig = JSON.parse(JSON.stringify(json));
    const jsonData = JSON.stringify(defaultConfig);
    const storedConfig = await saveCommonConfig(env, defaultConfig);
    const config = await commonRepository.getInfoByType(env, 'config');
    if (config) {
      await commonRepository.updateCommon(env, 'config', storedConfig);
    } else {
      const update = await commonRepository.createCommon(env, 'config', storedConfig);
      if (!update) return null;
    }
    return jsonData;
  },

  async setToken(env, tokenInfo, oldToken) {
    const token = await commonRepository.getInfoByType(env, 'token');
    const jsonData = JSON.stringify({token: tokenInfo});
    if (token) {
      // 判断token是否正确
      const obj = JSON.parse(token.json);
      if (obj.token !== oldToken) return null;
      await commonRepository.updateCommon(env, 'token', jsonData);
    } else {
      return null;
    }
    return {token: tokenInfo};
  },


  async updateConfig(env, jsonData) {
    const parsedConfig = JSON.parse(jsonData);
    const storedConfig = await saveCommonConfig(env, parsedConfig);
    const config = await commonRepository.getInfoByType(env, 'config');
    if (config) {
      await commonRepository.updateCommon(env, 'config', storedConfig);
    } else {
      const update = await commonRepository.createCommon(env, 'config', storedConfig);
      if (!update) return null;
    }
    await nodePoolService.rebuild(env).catch((error) => {
      console.warn(`Rebuild node pool after config update failed: ${error.message}`);
    });
    return new Response(jsonData, { status: 200 });
  },

  async subgenerate(env, uuid) {
    const json = {
      subUrl: uuid
    }
    const subQuery = await commonRepository.getInfoByType(env, 'sub');
    let sub;
    if (subQuery) {
      // 如果有 就更新
      await commonRepository.updateCommon(env, 'sub', JSON.stringify(json));
    } else {
      sub = await commonRepository.createCommon(env, 'sub', JSON.stringify(json));
      if (!sub) return null;
    }
    return {
      subUrl: uuid
    };
  },
  async tokenFind(env, token) {
    const sub = await commonRepository.typeFind(env, 'sub');
    if (!sub) return null;
    const obj = JSON.parse(sub.json);
    if (obj.subUrl !== token) return null;
    return {
      subUrl: obj.subUrl
    };
  },

  async getYml(env, options = {}) {
    const useInfo = [];
    // 获取所有开启状态的机场订阅地址
    const airports = await airportRepository.getAllOpenAirports(env);
    // 从数据库查询自建节点
    const selfNodes = await selfNodeRepository.getAllNodes(env)
    if (airports.results .length == 0 && selfNodes.results.length == 0) {
      return null;
    }

    let commonConfig = await loadCommonConfig(env);
    commonConfig = JSON.parse(JSON.stringify(commonConfig || json));
    const blockKeywords = getNodeBlockKeywords(commonConfig);

    // 生成proxies
    const allProxies = [];
    const allProxiesName = [];
    let nodePool = await nodePoolService.getSnapshot(env);
    if (!Array.isArray(nodePool?.entries) || nodePool.entries.length === 0) {
      nodePool = await nodePoolService.rebuild(env);
    }
    if (Array.isArray(nodePool?.entries) && nodePool.entries.length > 0) {
      if (Array.isArray(nodePool.subscriptionInfos)) {
        useInfo.push(...nodePool.subscriptionInfos.filter(Boolean));
      }
      for (const entry of nodePool.entries) {
        const proxy = entry.proxy;
        if (shouldBlockProxy(proxy, blockKeywords)) continue;
        allProxiesName.push(proxy.name);
        allProxies.push(proxy);
      }
    } else {
      selfNodes.results.forEach(node => {
        const nodeObj = JSON.parse(node.convert);
        if (shouldBlockProxy(nodeObj, blockKeywords)) return;
        allProxiesName.push(nodeObj.name);
        allProxies.push(nodeObj);
      })

      for (const airport of airports.results) {
        let snapshot = await getAirportSnapshot(env, airport.id);
        if (!snapshot?.proxies) {
          const result = await this.getYmlFromUrl(airport.subscription_url);
          if (!result?.jsonData) {
            console.warn(`Skip unavailable upstream subscription: ${airport.airport_name || airport.id}`);
            continue;
          }
          snapshot = {
            fetchedAt: new Date().toISOString(),
            profile: result.profile,
            subscriptionInfo: result.subscriptionInfo,
            rawText: result.rawText || "",
            proxies: Array.isArray(result.jsonData['proxies']) ? result.jsonData['proxies'] : [],
          };
          await putAirportSnapshot(env, airport.id, snapshot);
        }

        if (snapshot.subscriptionInfo) {
          useInfo.push(snapshot.subscriptionInfo);
        }
        const proxies = filterProxiesForDistribution(Array.isArray(snapshot.proxies) ? snapshot.proxies : [], blockKeywords)
          .map((proxy) => applyAirportRemark(proxy, airport.remarks));
        if (proxies.length === 0) {
          console.warn(`Skip empty or filtered upstream subscription: ${airport.airport_name || airport.id}`);
          continue;
        }

        proxies.forEach(proxy => {
          allProxiesName.push(proxy['name']);
        });
        allProxies.push(...proxies);
      }
    }

    if (allProxies.length === 0) {
      console.warn('No available proxies after fetching upstream subscriptions');
      return null;
    }
    const nonSelectGroupNames = [];
    // 生成proxy-groups
    const proxyGroups = [];
    const dbGroup = await groupRepository.getAllGroups(env);
    dbGroup.results.forEach(group => {
      const regex = group.group_regex;
      const newProxies = JSON.parse(JSON.stringify(allProxiesName))
      const filteredProxies = regex 
        ? newProxies.filter(name => new RegExp(regex).test(name))
        : newProxies;
      const proxyGroup = {
        'name': group.group_name,
        'type': group.group_type,
        'proxies': filteredProxies
      };
      if (group.group_type != 'select') {
        proxyGroup['url'] = group.url;
        proxyGroup['interval'] = group.interval;
        nonSelectGroupNames.push(group.group_name);
      }
      proxyGroups.push(proxyGroup);
    });

    
    proxyGroups.forEach(group => {
      if (group.type === 'select') {
        group.proxies.unshift(...nonSelectGroupNames);
      }
    });
    delete commonConfig.cloudsub;
    commonConfig['proxies'] = allProxies;
    // 对 proxyGroups 进行排序，select 类型排在前面
    proxyGroups.sort((a, b) => {
      if (a.type === 'select' && b.type !== 'select') return -1;
      if (a.type !== 'select' && b.type === 'select') return 1;
      return 0;
    });
    commonConfig['proxy-groups'] = proxyGroups;

    // 获取所有的分组
    const groupsFromDb = await groupRepository.getAllGroups(env);
    const groupMap = {};
    groupsFromDb.results.map(group => {
      groupMap[group.id] = group.group_name;
    });
    groupMap[-1] = 'DIRECT';
    groupMap[-2] = 'REJECT';


    // 获取rules
    const rulesConfig = await loadRulesConfig(env, groupMap);

    commonConfig['rules'] = rulesConfig;

    const template = await clashTemplateService.findForSubscription(env, options.templateId);
    const outputConfig = applyClashTemplate(commonConfig, template, allProxiesName);
    const yamlData = yaml.dump(outputConfig);
    return {
      yamlData: yamlData,
      config: outputConfig,
      proxies: allProxies,
      useInfo: useInfo
    };
  },

  async getYmlFromUrl(url) {
    const result = await fetchUpstreamSubscription(url);
    if (!result.ok) {
      console.warn(`Upstream subscription fetch failed: ${result.error || result.failures?.join('; ') || 'unknown error'}`);
      return null;
    }

    return {
      jsonData: result.jsonData,
      subscriptionInfo: result.subscriptionInfo,
      profile: result.profile,
      rawText: result.text || "",
    };
  },

  async ensureFlagInUrl(urlString) {
    return ensureFlagInUrl(urlString);
  }

};
