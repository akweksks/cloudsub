import { describe, expect, it } from "vitest";
import redeemService from "../src/services/redeemService.js";
import { applyRoutingProfileToClashConfig, getDefaultRoutingProfiles, parseRoutingProfileContent, profileContentToYaml } from "../src/services/routingProfileService.js";
import { filterProxiesForDistribution, getNodeRenameRules, renameProxyForDistribution } from "../src/services/commonService.js";
import { applyClashTemplate } from "../src/services/clashTemplateService.js";
import airportHealthService from "../src/services/airportHealthService.js";
import nodePoolService, { processProxyEntries, validateProxy } from "../src/services/nodePoolService.js";
import upstreamSchedulerService from "../src/services/upstreamSchedulerService.js";
import {
  archiveSubscriptionLog,
  appendOperationalLog,
  clearOperationalLogs,
  clearSchedulerHistory,
  createR2Pointer,
  configCurrentKey,
  getAirportSnapshot,
  getSubscriptionOutput,
  hydrateTemplateContent,
  listSchedulerHistory,
  putAirportSnapshot,
  putConfigDocument,
  putSchedulerStatus,
  putSubscriptionOutput,
  putTemplateContent,
  listOperationalLogs,
  resolveConfigDocument,
  versionedSubscriptionOutputKey,
} from "../src/services/r2CacheService.js";
import { ensureFlagInUrl, parseSubscriptionText } from "../src/utils/upstreamSubscription.js";
import { renderSubscription, resolveSubscriptionTarget } from "../src/utils/subscriptionTargets.js";
import { evaluateSubscriptionAccess, selectDistributionOrigin } from "../src/index.js";
import worker from "../src/index.js";

function createR2Bucket() {
  const objects = new Map();
  return {
    objects,
    async put(key, body, options = {}) {
      objects.set(key, {
        body,
        httpMetadata: options.httpMetadata || {},
        customMetadata: options.customMetadata || {},
      });
    },
    async get(key) {
      const item = objects.get(key);
      if (!item) return null;
      return {
        httpMetadata: item.httpMetadata,
        customMetadata: item.customMetadata,
        async text() {
          return item.body;
        },
        async json() {
          return JSON.parse(item.body);
        },
      };
    },
    async list(options = {}) {
      const prefix = options.prefix || "";
      const limit = options.limit || 1000;
      return {
        objects: [...objects.keys()]
          .filter((key) => key.startsWith(prefix))
          .sort()
          .slice(0, limit)
          .map((key) => ({ key, uploaded: new Date() })),
        truncated: false,
      };
    },
    async delete(key) {
      objects.delete(key);
    },
  };
}

function createKVNamespace() {
  const objects = new Map();
  return {
    objects,
    async put(key, value) {
      objects.set(key, value);
    },
    async get(key) {
      return objects.get(key) ?? null;
    },
    async delete(key) {
      objects.delete(key);
    },
  };
}

function createCountingR2Bucket() {
  const bucket = createR2Bucket();
  let getCount = 0;
  return {
    ...bucket,
    get getCount() {
      return getCount;
    },
    async get(key) {
      getCount += 1;
      return bucket.get(key);
    },
  };
}

function createRepo() {
  const codes = new Map();
  const users = new Map();
  let userId = 1;

  return {
    codes,
    users,
    addCode(code) {
      codes.set(code.code, { ...code });
    },
    async findRedeemCode(code) {
      return codes.get(code) ?? null;
    },
    async markRedeemCodeUsed(code, userIdValue, usedAt) {
      const row = codes.get(code);
      codes.set(code, { ...row, status: "used", used_by_user_id: userIdValue, used_at: usedAt });
    },
    async createSubUser(user) {
      const row = { id: userId++, ...user };
      users.set(row.token, row);
      return row;
    },
    async findSubUserByToken(token) {
      return users.get(token) ?? null;
    },
    async updateSubUser(token, updates) {
      const row = users.get(token);
      const next = { ...row, ...updates };
      users.set(token, next);
      return next;
    },
  };
}

describe("redeemService", () => {
  it("creates one subscription token from an unused redeem code", async () => {
    const repo = createRepo();
    repo.addCode({ code: "MONTH-1", plan_name: "月卡", duration_days: 30, status: "unused" });

    const result = await redeemService.redeemNew(repo, {
      code: "MONTH-1",
      remark: "test user",
      now: new Date("2026-06-03T00:00:00.000Z"),
      tokenFactory: () => "sub-token-1",
    });

    expect(result.token).toBe("sub-token-1");
    expect(result.planName).toBe("月卡");
    expect(result.expiresAt).toBe("2026-07-03T00:00:00.000Z");
    expect(repo.codes.get("MONTH-1").status).toBe("used");
  });

  it("uses redeem-code duration and linked plan metadata when a redeem code has plan_id", async () => {
    const repo = createRepo();
    repo.addCode({
      code: "PLAN-1",
      plan_id: 7,
      plan_name: "旧套餐名",
      duration_days: 1,
      linked_plan_name: "年卡",
      linked_duration_days: 365,
      linked_template_id: 3,
      status: "unused",
    });

    const result = await redeemService.redeemNew(repo, {
      code: "PLAN-1",
      now: new Date("2026-06-03T00:00:00.000Z"),
      tokenFactory: () => "sub-token-plan",
    });

    expect(result.planId).toBe(7);
    expect(result.planName).toBe("年卡");
    expect(result.templateId).toBe(3);
    expect(result.expiresAt).toBe("2026-06-04T00:00:00.000Z");
  });

  it("falls back to linked plan duration when the redeem code has no custom duration", async () => {
    const repo = createRepo();
    repo.addCode({
      code: "PLAN-FALLBACK",
      plan_id: 8,
      plan_name: "旧套餐名",
      duration_days: null,
      linked_plan_name: "年卡",
      linked_duration_days: 365,
      linked_template_id: 3,
      status: "unused",
    });

    const result = await redeemService.redeemNew(repo, {
      code: "PLAN-FALLBACK",
      now: new Date("2026-06-03T00:00:00.000Z"),
      tokenFactory: () => "sub-token-plan-fallback",
    });

    expect(result.planName).toBe("年卡");
    expect(result.expiresAt).toBe("2027-06-03T00:00:00.000Z");
  });

  it("uses a fixed subscription expiry when the redeem code configures one", async () => {
    const repo = createRepo();
    repo.addCode({
      code: "FIXED-1",
      plan_name: "固定到期",
      duration_days: 30,
      subscription_expires_at: "2026-08-15T12:00:00.000Z",
      status: "unused",
    });

    const result = await redeemService.redeemNew(repo, {
      code: "FIXED-1",
      now: new Date("2026-06-03T00:00:00.000Z"),
      tokenFactory: () => "sub-token-fixed",
    });

    expect(result.expiresAt).toBe("2026-08-15T12:00:00.000Z");
  });

  it("renews an active subscription from its current expiry date", async () => {
    const repo = createRepo();
    repo.addCode({ code: "Q-1", plan_name: "季卡", duration_days: 90, status: "unused" });
    await repo.createSubUser({
      token: "sub-token-1",
      remark: "",
      status: "active",
      plan_name: "月卡",
      expires_at: "2026-07-03T00:00:00.000Z",
      created_at: "2026-06-03T00:00:00.000Z",
      updated_at: "2026-06-03T00:00:00.000Z",
    });

    const result = await redeemService.renew(repo, {
      tokenOrUrl: "sub-token-1",
      code: "Q-1",
      now: new Date("2026-06-10T00:00:00.000Z"),
    });

    expect(result.expiresAt).toBe("2026-10-01T00:00:00.000Z");
  });

  it("renews an expired subscription from the current time", async () => {
    const repo = createRepo();
    repo.addCode({ code: "MONTH-2", plan_name: "月卡", duration_days: 30, status: "unused" });
    await repo.createSubUser({
      token: "sub-token-2",
      remark: "",
      status: "active",
      plan_name: "月卡",
      expires_at: "2026-05-01T00:00:00.000Z",
      created_at: "2026-04-01T00:00:00.000Z",
      updated_at: "2026-04-01T00:00:00.000Z",
    });

    const result = await redeemService.renew(repo, {
      tokenOrUrl: "https://example.com/subscribe?token=sub-token-2",
      code: "MONTH-2",
      now: new Date("2026-06-03T00:00:00.000Z"),
    });

    expect(result.expiresAt).toBe("2026-07-03T00:00:00.000Z");
  });

  it("rejects used redeem codes", async () => {
    const repo = createRepo();
    repo.addCode({ code: "USED-1", plan_name: "月卡", duration_days: 30, status: "used" });

    await expect(redeemService.redeemNew(repo, {
      code: "USED-1",
      now: new Date("2026-06-03T00:00:00.000Z"),
      tokenFactory: () => "sub-token-1",
    })).rejects.toThrow("兑换码不可用");
  });
});

describe("applyClashTemplate", () => {
  it("keeps dynamic proxies and expands __AUTO__ in template groups", () => {
    const baseConfig = {
      proxies: [{ name: "A" }, { name: "B" }],
      "proxy-groups": [{ name: "Default", type: "select", proxies: ["A", "B"] }],
      rules: ["MATCH,Default"],
    };
    const template = {
      yaml_content: `
mode: rule
proxy-groups:
  - name: 节点选择
    type: select
    proxies:
      - __AUTO__
      - DIRECT
rules:
  - MATCH,节点选择
`,
    };

    const result = applyClashTemplate(baseConfig, template, ["A", "B"]);

    expect(result.proxies).toEqual(baseConfig.proxies);
    expect(result["proxy-groups"][0].proxies).toEqual(["A", "B", "DIRECT"]);
    expect(result.rules).toEqual(["MATCH,节点选择"]);
  });
});

describe("routingProfileService", () => {
  it("serializes routing profiles as YAML rule content", () => {
    const rawContent = profileContentToYaml({
      proxyGroups: [
        { name: "节点选择", type: "select", proxies: ["__AUTO__", "DIRECT"] },
      ],
      rules: ["MATCH,节点选择"],
      dns: { enable: true, ipv6: false },
    });

    expect(rawContent).toContain("proxy-groups:");
    expect(rawContent).toContain("rules:");
    expect(rawContent).toContain("dns:");
    expect(rawContent.trim().startsWith("{")).toBe(false);
  });

  it("parses imported routing profiles without importing upstream nodes", () => {
    const content = parseRoutingProfileContent(`
proxies:
  - name: Should Not Import
    type: ss
proxy-groups:
  - name: 节点选择
    type: select
    proxies:
      - __AUTO__
rules:
  - DOMAIN-SUFFIX,example.com,节点选择
`);

    expect(content.proxyGroups).toHaveLength(1);
    expect(content.rules).toEqual(["DOMAIN-SUFFIX,example.com,节点选择"]);
    expect(content.metadata.ignoredProxyCount).toBe(1);
    expect(content.proxies).toBeUndefined();
  });

  it("removes upstream node names from imported proxy groups", () => {
    const content = parseRoutingProfileContent(`
proxies:
  - name: Airport Node 1
    type: ss
proxy-groups:
  - name: 节点选择
    type: select
    proxies:
      - 自动选择
      - Airport Node 1
      - DIRECT
  - name: 自动选择
    type: url-test
    proxies:
      - Airport Node 1
rules:
  - MATCH,节点选择
`);

    expect(content.proxyGroups[0].proxies).toEqual(["自动选择", "__AUTO__", "DIRECT"]);
    expect(content.proxyGroups[1].proxies).toEqual(["__AUTO__"]);
  });

  it("uses simple memorable names for built-in routing profiles", () => {
    const names = getDefaultRoutingProfiles().map((item) => item.name);

    expect(names).toEqual(["基础分流", "AI流媒体", "轻量分流", "常用分流", "全能分流", "全部代理"]);
    expect(names).not.toContain("默认分流");
    expect(names).not.toContain("完整版分流");
  });

  it("includes built-in light, common and all-purpose YAML routing profiles without node payloads", () => {
    const profiles = getDefaultRoutingProfiles();
    const simplified = profiles.find((item) => item.name === "轻量分流");
    const standard = profiles.find((item) => item.name === "常用分流");
    const comprehensive = profiles.find((item) => item.name === "全能分流");

    expect(simplified?.content.proxyGroups).toHaveLength(7);
    expect(simplified?.content.rules).toHaveLength(8);
    expect(standard?.content.proxyGroups).toHaveLength(14);
    expect(standard?.content.rules).toHaveLength(23);
    expect(comprehensive?.content.proxyGroups).toHaveLength(33);
    expect(comprehensive?.content.rules).toHaveLength(93);
    expect(Object.keys(comprehensive.content.ruleProviders)).toHaveLength(92);

    for (const profile of [simplified, standard, comprehensive]) {
      expect(profile).toBeTruthy();
      expect(profile.content.metadata.ignoredProxyCount).toBeGreaterThan(0);
      expect(profile.content.proxyGroups.flatMap((group) => group.proxies || [])).not.toContain("🇭🇰 hk🍉香港1");
      expect(profile.content).not.toHaveProperty("proxies");
    }
  });

  it("deduplicates fully identical built-in routing profile templates", () => {
    const profiles = getDefaultRoutingProfiles();
    const signatures = profiles.map((profile) => profileContentToYaml(profile.content));

    expect(new Set(signatures).size).toBe(signatures.length);
  });

  it("applies selected routing profile to generated Clash subscriptions", () => {
    const config = {
      proxies: [{ name: "香港1" }, { name: "日本1" }],
      "proxy-groups": [{ name: "Old", type: "select", proxies: ["香港1"] }],
      rules: ["MATCH,Old"],
    };
    const profile = {
      content: {
        proxyGroups: [
          { name: "节点选择", type: "select", proxies: ["__AUTO__", "DIRECT"] },
          { name: "香港节点", type: "select", proxies: ["__REGION:香港"] },
        ],
        rules: [
          "DOMAIN-SUFFIX,openai.com,节点选择",
          "MATCH,节点选择",
        ],
        ruleProviders: {},
      },
    };

    const result = applyRoutingProfileToClashConfig(config, profile);

    expect(result["proxy-groups"][0]).toMatchObject({ name: "节点选择" });
    expect(result["proxy-groups"][0].proxies).toEqual(["香港1", "日本1", "DIRECT"]);
    expect(result["proxy-groups"][1].proxies).toEqual(["香港1"]);
    expect(result.rules).toEqual(["DOMAIN-SUFFIX,openai.com,节点选择", "MATCH,节点选择"]);
  });

  it("rewrites legacy missing rule targets to an existing proxy group", () => {
    const config = {
      proxies: [{ name: "香港1" }],
      "proxy-groups": [{ name: "Old", type: "select", proxies: ["香港1"] }],
      rules: ["MATCH,Old"],
    };
    const profile = {
      content: {
        proxyGroups: [
          { name: "节点选择", type: "select", proxies: ["__AUTO__", "DIRECT"] },
        ],
        rules: [
          "DOMAIN-SUFFIX,google.com,节点列表",
          "MATCH,节点列表",
        ],
      },
    };

    const result = applyRoutingProfileToClashConfig(config, profile);

    expect(result["proxy-groups"].map((group) => group.name)).toContain("节点选择");
    expect(result.rules).toEqual([
      "DOMAIN-SUFFIX,google.com,节点选择",
      "MATCH,节点选择",
    ]);
  });

  it("keeps RULE-SET options intact and only uses editable rule providers", () => {
    const config = {
      proxies: [{ name: "香港1" }],
      "proxy-groups": [],
      rules: [],
    };
    const profile = {
      content: {
        proxyGroups: [
          { name: "节点选择", type: "select", proxies: ["__AUTO__", "DIRECT"] },
          { name: "广告拦截", type: "select", proxies: ["REJECT", "DIRECT"] },
          { name: "私有网络", type: "select", proxies: ["DIRECT"] },
        ],
        rules: [
          "RULE-SET,category-ads-all,广告拦截",
          "RULE-SET,private-ip,私有网络,no-resolve",
          "MATCH,节点选择",
        ],
        ruleProviders: {
          "category-ads-all": {
            type: "http",
            behavior: "domain",
            url: "https://example.com/category-ads-all.mrs",
            path: "./ruleset/category-ads-all.mrs",
            format: "mrs",
          },
        },
      },
    };

    const result = applyRoutingProfileToClashConfig(config, profile);
    const rendered = renderSubscription(result, "clash");

    expect(result.rules).toEqual([
      "RULE-SET,category-ads-all,广告拦截",
      "RULE-SET,private-ip,私有网络,no-resolve",
      "MATCH,节点选择",
    ]);
    expect(result["rule-providers"]).toEqual({
      "category-ads-all": {
        type: "http",
        behavior: "domain",
        url: "https://example.com/category-ads-all.mrs",
        path: "./ruleset/category-ads-all.mrs",
        format: "mrs",
      },
    });
    expect(rendered.body).toContain("rule-providers:");
    expect(rendered.body).toContain("category-ads-all:");
    expect(rendered.body).not.toContain("private-ip:");
  });
});

describe("airportHealthService", () => {
  it("treats expire=0 as no expiry for long-term upstream subscriptions", () => {
    const result = airportHealthService.parseUserInfo("upload=0; download=1024; total=1073741824; expire=0");

    expect(result.expireAt).toBeNull();
    expect(result.total).toBe(1073741824);
  });

  it("parses positive upstream expire timestamps", () => {
    const result = airportHealthService.parseUserInfo("upload=0; download=0; total=1073741824; expire=1780454400");

    expect(result.expireAt).toBe("2026-06-03T02:40:00.000Z");
  });
});

describe("upstreamSubscription", () => {
  it("adds a Clash Verge flag when the upstream URL has no client flag", () => {
    const result = ensureFlagInUrl("https://example.com/api/sub?token=abc");

    expect(result).toBe("https://example.com/api/sub?token=abc&flag=clashVerge");
  });

  it("keeps an existing upstream client flag", () => {
    const result = ensureFlagInUrl("https://example.com/api/sub?token=abc&flag=meta");

    expect(result).toBe("https://example.com/api/sub?token=abc&flag=meta");
  });

  it("converts base64 v2ray subscription links to Clash proxies", () => {
    const vmess = btoa(JSON.stringify({
      ps: "HK 01",
      add: "example.com",
      port: "443",
      id: "29155c31-233d-427e-919e-4fb9cadb8bf6",
      aid: "0",
      type: "auto",
      tls: "tls",
      net: "tcp",
    }));
    const rawSubscription = btoa(`vmess://${vmess}`);

    const result = parseSubscriptionText(rawSubscription);

    expect(result.proxies).toHaveLength(1);
    expect(result.proxies[0]).toMatchObject({ name: "HK 01", type: "vmess", server: "example.com", port: 443 });
  });

  it("does not treat VMess header type as Clash cipher", () => {
    const vmess = btoa(JSON.stringify({
      ps: "VMess HTTP Header",
      add: "example.com",
      port: "80",
      id: "29155c31-233d-427e-919e-4fb9cadb8bf6",
      aid: "0",
      type: "http",
      tls: "",
      net: "tcp",
      host: "example.com",
      path: "/",
    }));
    const rawSubscription = btoa(`vmess://${vmess}`);

    const result = parseSubscriptionText(rawSubscription);

    expect(result.proxies[0]).toMatchObject({
      name: "VMess HTTP Header",
      type: "vmess",
      cipher: "auto",
      network: "http",
    });
    expect(result.proxies[0]["http-opts"]).toMatchObject({
      method: "GET",
      path: ["/"],
      headers: { Host: ["example.com"] },
    });
  });

  it("converts AnyTLS subscription links to Clash proxies", () => {
    const rawSubscription = btoa("anytls://secret@example.com:8443?sni=edge.example.com&fp=chrome&insecure=1&alpn=h2,http/1.1#AnyTLS%2001");

    const result = parseSubscriptionText(rawSubscription);

    expect(result.proxies).toHaveLength(1);
    expect(result.proxies[0]).toMatchObject({
      name: "AnyTLS 01",
      type: "anytls",
      server: "example.com",
      port: 8443,
      password: "secret",
      sni: "edge.example.com",
      "client-fingerprint": "chrome",
      "skip-cert-verify": true,
      alpn: ["h2", "http/1.1"],
    });
  });

  it("normalizes AnyTLS type casing from upstream YAML", () => {
    const result = parseSubscriptionText(`
proxies:
  - name: AnyTLS YAML
    type: Anytls
    server: example.com
    port: 443
    password: secret
`);

    expect(result.proxies[0].type).toBe("anytls");
  });
});

describe("node distribution filter", () => {
  it("removes nodes whose names contain blocked keywords", () => {
    const result = filterProxiesForDistribution([
      { name: "HK 01" },
      { name: "官网地址 example.com" },
      { name: "套餐到期 2026-07-01" },
    ], ["官网", "套餐到期"]);

    expect(result).toEqual([{ name: "HK 01" }]);
  });

  it("renames distributed nodes by configured name rules", () => {
    const rules = getNodeRenameRules({
      cloudsub: {
        nodeRenameRules: [
          { match: "Hong Kong", replace: "香港" },
          { match: "倍率", replace: "x" },
        ],
      },
    });

    const result = renameProxyForDistribution({ name: "Hong Kong 01 倍率 1x", type: "vmess" }, rules);

    expect(result.name).toBe("香港 01 x 1x");
  });
});

describe("subscription target rendering", () => {
  const config = {
    proxies: [
      {
        name: "HK 01",
        type: "vmess",
        server: "example.com",
        port: 443,
        uuid: "29155c31-233d-427e-919e-4fb9cadb8bf6",
        alterId: 0,
        cipher: "auto",
        tls: true,
      },
      {
        name: "AnyTLS 01",
        type: "anytls",
        server: "edge.example.com",
        port: 8443,
        password: "secret",
        sni: "edge.example.com",
      },
    ],
    "proxy-groups": [],
    rules: [],
  };

  it("keeps Clash as the default target", () => {
    expect(resolveSubscriptionTarget({})).toBe("clash");
    expect(resolveSubscriptionTarget({ explicitTarget: "mihomo" })).toBe("clash");
  });

  it("auto-detects common subscription clients from the universal URL request", () => {
    expect(resolveSubscriptionTarget({ userAgent: "v2rayN/6.60" })).toBe("v2ray");
    expect(resolveSubscriptionTarget({ userAgent: "v2rayNG/1.8.19" })).toBe("v2ray");
    expect(resolveSubscriptionTarget({ userAgent: "sing-box/1.12.0" })).toBe("sing-box");
    expect(resolveSubscriptionTarget({ userAgent: "ClashforWindows/0.20.39" })).toBe("clash");
    expect(resolveSubscriptionTarget({ flag: "sfa" })).toBe("sing-box");
  });

  it("always renders YAML even when a non-Clash target is requested", () => {
    const rendered = renderSubscription(config, "v2ray");

    expect(rendered.contentType).toContain("text/yaml");
    expect(rendered.filename).toBe("CloudSub.yaml");
    expect(rendered.body).toContain("proxies:");
    expect(rendered.body).toContain("proxy-groups:");
  });

  it("does not emit JSON subscriptions for sing-box targets", () => {
    const rendered = renderSubscription(config, "sing-box");

    expect(rendered.contentType).toContain("text/yaml");
    expect(() => JSON.parse(rendered.body)).toThrow();
    expect(rendered.body).toContain("AnyTLS 01");
  });

  it("keeps Clash YAML proxy groups valid when a template group has no proxies", () => {
    const rendered = renderSubscription({
      proxies: [
        {
          name: "香港1",
          type: "vmess",
          server: "example.com",
          port: 443,
          uuid: "29155c31-233d-427e-919e-4fb9cadb8bf6",
          cipher: "http",
        },
      ],
      "proxy-groups": [
        { name: "自动选择", type: "url-test", proxies: [], url: "https://www.gstatic.com/generate_204", interval: 300 },
      ],
      rules: ["MATCH,自动选择"],
    }, "clash");

    expect(rendered.contentType).toContain("text/yaml");
    expect(rendered.body).toContain("name: 自动选择");
    expect(rendered.body).toContain("- 香港1");
    expect(rendered.body).not.toContain("cipher: http");
  });
});

describe("r2CacheService", () => {
  it("stores upstream raw and normalized airport snapshots in R2", async () => {
    const env = { SUB_CACHE: createR2Bucket() };

    await putAirportSnapshot(env, 7, {
      rawText: "raw subscription",
      profile: "clash-verge",
      subscriptionInfo: "upload=0; download=1; total=2",
      fetchedAt: "2026-06-03T00:00:00.000Z",
      proxies: [{ name: "HK 01", type: "vmess" }],
    });

    const snapshot = await getAirportSnapshot(env, 7);

    expect(snapshot).toMatchObject({
      airportId: 7,
      profile: "clash-verge",
      subscriptionInfo: "upload=0; download=1; total=2",
      proxies: [{ name: "HK 01", type: "vmess" }],
    });
  });

  it("returns null for expired rendered subscription output cache", async () => {
    const env = { SUB_CACHE: createR2Bucket() };

    await putSubscriptionOutput(env, "token-1", "clash", {
      body: "payload",
      contentType: "text/plain; charset=utf-8",
      filename: "CloudSub.yaml",
    }, 300, "upload=0");
    const key = versionedSubscriptionOutputKey("token-1", "clash", "default");
    env.SUB_CACHE.objects.get(key).customMetadata.generatedAt = "2026-06-03T00:00:00.000Z";

    const cached = await getSubscriptionOutput(env, "token-1", "clash");

    expect(cached).toBeNull();
  });

  it("stores config documents in R2 and resolves D1 pointers", async () => {
    const env = { SUB_CACHE: createR2Bucket() };
    const config = { mode: "rule", cloudsub: { nodeBlockKeywords: ["广告"] } };

    const pointer = await putConfigDocument(env, "config", config);
    const resolved = await resolveConfigDocument(env, pointer);

    expect(pointer).toBe(createR2Pointer(configCurrentKey("config")));
    expect(resolved).toEqual(config);
  });

  it("uses KV as the hot cache for current config documents when available", async () => {
    const env = { SUB_CACHE: createR2Bucket(), SUB_KV: createKVNamespace() };
    const config = { mode: "rule", cloudsub: { adminSessionTtlHours: 9 } };

    const pointer = await putConfigDocument(env, "config", config);
    env.SUB_CACHE.objects.clear();
    const resolved = await resolveConfigDocument(env, pointer);

    expect(resolved).toEqual(config);
  });

  it("hydrates template YAML content from an R2 pointer", async () => {
    const env = { SUB_CACHE: createR2Bucket() };

    const pointer = await putTemplateContent(env, 3, "mode: rule\nrules:\n  - MATCH,DIRECT\n");
    const template = await hydrateTemplateContent(env, {
      id: 3,
      name: "Default",
      yaml_content: pointer,
    });

    expect(template.yaml_content).toContain("MATCH,DIRECT");
    expect(template.yaml_content_ref).toBe(pointer);
  });

  it("archives subscription access logs as R2 JSON objects", async () => {
    const env = { SUB_CACHE: createR2Bucket() };

    await archiveSubscriptionLog(env, {
      token: "token-1",
      status: "success",
      code: 200,
      accessedAt: "2026-06-03T12:00:00.000Z",
    });

    const keys = [...env.SUB_CACHE.objects.keys()];
    expect(keys[0]).toContain("logs/subscription/2026-06-03/");
    const object = await env.SUB_CACHE.get(keys[0]);
    await expect(object.json()).resolves.toMatchObject({ token: "token-1", status: "success" });
  });

  it("stores and lists newest operational logs first", async () => {
    const env = { SUB_CACHE: createR2Bucket() };

    await appendOperationalLog(env, { action: "first", message: "old", createdAt: "2026-06-03T00:00:00.000Z" });
    await appendOperationalLog(env, { action: "second", message: "new", createdAt: "2026-06-04T00:00:00.000Z" });

    const logs = await listOperationalLogs(env, { limit: 2 });

    expect(logs).toHaveLength(2);
    expect(logs[0].action).toBe("second");
    expect(logs[1].action).toBe("first");
  });

  it("clears archived operational logs from R2", async () => {
    const env = { SUB_CACHE: createR2Bucket() };

    await appendOperationalLog(env, { action: "first", createdAt: "2026-06-03T00:00:00.000Z" });
    await appendOperationalLog(env, { action: "second", createdAt: "2026-06-04T00:00:00.000Z" });

    const deleted = await clearOperationalLogs(env);
    const logs = await listOperationalLogs(env, { limit: 6 });

    expect(deleted).toBe(2);
    expect(logs).toEqual([]);
  });

  it("clears upstream sync history from R2", async () => {
    const env = { SUB_CACHE: createR2Bucket() };

    await putSchedulerStatus(env, { ranAt: "2026-06-03T00:00:00.000Z", checked: [{ id: 1 }] });
    await putSchedulerStatus(env, { ranAt: "2026-06-04T00:00:00.000Z", skipped: [{ id: 2 }] });

    expect(await listSchedulerHistory(env, { limit: 6 })).toHaveLength(2);

    const deleted = await clearSchedulerHistory(env);
    const history = await listSchedulerHistory(env, { limit: 6 });

    expect(deleted).toBe(2);
    expect(history).toEqual([]);
  });

  it("lists latest scheduler history after scanning more than the display limit", async () => {
    const env = { SUB_CACHE: createR2Bucket() };

    for (let day = 1; day <= 8; day++) {
      await putSchedulerStatus(env, {
        ranAt: `2026-06-${String(day).padStart(2, "0")}T00:00:00.000Z`,
        checked: [{ id: day }],
      });
    }

    const history = await listSchedulerHistory(env, { limit: 3 });

    expect(history.map((item) => item.ranAt)).toEqual([
      "2026-06-08T00:00:00.000Z",
      "2026-06-07T00:00:00.000Z",
      "2026-06-06T00:00:00.000Z",
    ]);
  });

  it("does not expose removed legacy admin resource routes", async () => {
    const response = await worker.fetch(new Request("https://example.com/airports/all"), {}, {});

    expect(response.status).toBe(404);
    expect(await response.text()).toBe("Not Found");
  });

  it("reuses resolved R2 config content for the same stored pointer", async () => {
    const r2 = createCountingR2Bucket();
    const env = { SUB_CACHE: r2 };
    const pointer = await putConfigDocument(env, "config-cache-test", { cloudsub: { upstreamRefreshIntervalHours: 6 } });

    const first = await resolveConfigDocument(env, pointer);
    const second = await resolveConfigDocument(env, pointer);

    expect(first).toEqual({ cloudsub: { upstreamRefreshIntervalHours: 6 } });
    expect(second).toEqual(first);
    expect(r2.getCount).toBe(1);
  });
});

describe("nodePoolService", () => {
  it("validates supported proxy nodes and rejects broken nodes", () => {
    expect(validateProxy({
      name: "HK 01",
      type: "vmess",
      server: "example.com",
      port: 443,
      uuid: "29155c31-233d-427e-919e-4fb9cadb8bf6",
    }).valid).toBe(true);

    const invalid = validateProxy({ name: "Broken", type: "vmess", server: "", port: 70000 });
    expect(invalid.valid).toBe(false);
    expect(invalid.reasons).toContain("missing-server");
    expect(invalid.reasons).toContain("invalid-port");
    expect(invalid.reasons).toContain("missing-uuid");
  });

  it("deduplicates nodes by protocol, endpoint and auth identity", () => {
    const entries = [
      {
        proxy: { name: "A", type: "trojan", server: "edge.example.com", port: 443, password: "p1" },
        source: { type: "airport", id: 1 },
      },
      {
        proxy: { name: "A Copy", type: "trojan", server: "EDGE.example.com", port: "443", password: "p1" },
        source: { type: "airport", id: 2 },
      },
      {
        proxy: { name: "B", type: "trojan", server: "edge.example.com", port: 443, password: "p2" },
        source: { type: "self", id: 1 },
      },
    ];

    const result = processProxyEntries(entries, {
      config: {
        cloudsub: {
          nodeBlockKeywords: ["notice", "official", "backup"],
        },
      },
    });

    expect(result.validCount).toBe(2);
    expect(result.duplicateCount).toBe(1);
    expect(result.entries.map((entry) => entry.proxy.name)).toEqual(["A", "B"]);
  });

  it("keeps original node names when naming strategy is not configured", () => {
    const entries = [
      {
        proxy: { name: "HK Hong Kong 1", type: "anytls", server: "hk1.example.com", port: 443, password: "p1" },
        source: { type: "airport", id: 1 },
      },
      {
        proxy: { name: "JP Japan 1", type: "anytls", server: "jp.example.com", port: 443, password: "p2" },
        source: { type: "airport", id: 1 },
      },
    ];

    const result = processProxyEntries(entries);

    expect(result.entries.map((entry) => entry.proxy.name)).toEqual(["HK Hong Kong 1", "JP Japan 1"]);
  });

  it("applies configured rename rules before distribution", () => {
    const entries = [
      {
        proxy: { name: "HK Hong Kong 01", type: "anytls", server: "hk1.example.com", port: 443, password: "p1" },
        source: { type: "airport", id: 1 },
      },
    ];

    const result = processProxyEntries(entries, {
      config: {
        cloudsub: {
          nodeRenameRules: [
            { match: "Hong Kong", replace: "HongKong" },
            { match: "HK ", replace: "" },
          ],
          nodeNaming: { mode: "rules" },
        },
      },
    });

    expect(result.entries.map((entry) => entry.proxy.name)).toEqual(["HongKong 01"]);
  });

  it("stores final distributable nodes with configured region sequence names", () => {
    const entries = [
      {
        proxy: { name: "hk hk Hong Kong 1", type: "anytls", server: "hk1.example.com", port: 443, password: "p1" },
        source: { type: "airport", id: 1 },
      },
      {
        proxy: { name: "Hong Kong 02", type: "anytls", server: "hk2.example.com", port: 443, password: "p2" },
        source: { type: "airport", id: 1 },
      },
      {
        proxy: { name: "JP Japan Tokyo", type: "anytls", server: "jp.example.com", port: 443, password: "p3" },
        source: { type: "airport", id: 1 },
      },
      {
        proxy: { name: "US Los Angeles", type: "anytls", server: "us.example.com", port: 443, password: "p4" },
        source: { type: "airport", id: 1 },
      },
    ];

    const result = processProxyEntries(entries, {
      config: {
        cloudsub: {
          nodeNaming: {
            mode: "region_sequence",
            fallbackName: "Node",
            appendNumber: true,
            regionRules: [
              { name: "HongKong", keywords: ["hk", "hong kong", "hkg"] },
              { name: "Japan", keywords: ["jp", "japan", "tokyo"] },
              { name: "UnitedStates", keywords: ["us", "usa", "los angeles"] },
            ],
          },
        },
      },
    });

    expect(result.entries.map((entry) => entry.proxy.name)).toEqual(["HongKong1", "HongKong2", "Japan1", "UnitedStates1"]);
    expect(result.rawEntries.map((entry) => entry.proxy.name)).toEqual([
      "hk hk Hong Kong 1",
      "Hong Kong 02",
      "JP Japan Tokyo",
      "US Los Angeles",
    ]);
    expect(result.rawEntries.map((entry) => entry.finalName)).toEqual(["HongKong1", "HongKong2", "Japan1", "UnitedStates1"]);
  });

  it("moves subscription notice nodes into filtered entries before distribution", () => {
    const entries = [
      {
        proxy: { name: "traffic notice: 119.74 GB", type: "anytls", server: "sgtm.example.com", port: 50200, password: "p1" },
        source: { type: "airport", id: 1 },
      },
      {
        proxy: { name: "official site: example.com", type: "anytls", server: "sgtm.example.com", port: 50202, password: "p2" },
        source: { type: "airport", id: 1 },
      },
      {
        proxy: { name: "backup contact: example.com", type: "anytls", server: "sgtm.example.com", port: 50203, password: "p4" },
        source: { type: "airport", id: 1 },
      },
      {
        proxy: { name: "HK Hong Kong 1", type: "anytls", server: "hk.example.com", port: 24680, password: "p3" },
        source: { type: "airport", id: 1 },
      },
    ];

    const result = processProxyEntries(entries, {
      config: {
        cloudsub: {
          nodeBlockKeywords: ["notice", "official", "backup"],
          nodeNaming: {
            mode: "region_sequence",
            fallbackName: "Node",
            appendNumber: true,
            regionRules: [
              { name: "HongKong", keywords: ["Hong Kong", "HK"] },
            ],
          },
        },
      },
    });

    expect(result.validCount).toBe(1);
    expect(result.filteredCount).toBe(3);
    expect(result.entries.map((entry) => entry.proxy.name)).toEqual(["HongKong1"]);
    expect(result.filteredEntries.map((entry) => entry.proxy.name)).toEqual([
      "traffic notice: 119.74 GB",
      "official site: example.com",
      "backup contact: example.com",
    ]);
    expect(result.filteredEntries.map((entry) => entry.filterReason)).toEqual([
      "blocked-keyword:notice",
      "blocked-keyword:official",
      "blocked-keyword:backup",
    ]);
    expect(result.rawEntries.map((entry) => entry.finalName)).toEqual(["", "", "", "HongKong1"]);
    expect(result.rawEntries.map((entry) => entry.distributionStatus)).toEqual(["filtered", "filtered", "filtered", "distributed"]);
  });

  it("does not map filtered raw nodes to distributable names by shared fingerprint", () => {
    const entries = [
      {
        proxy: { name: "traffic notice: 120 GB", type: "anytls", server: "same.example.com", port: 50200, password: "p1" },
        source: { type: "airport", id: 1 },
      },
      {
        proxy: { name: "HK Hong Kong 1", type: "anytls", server: "same.example.com", port: 50200, password: "p1" },
        source: { type: "airport", id: 1 },
      },
    ];

    const result = processProxyEntries(entries, {
      config: {
        cloudsub: {
          nodeBlockKeywords: ["notice"],
          nodeNaming: {
            mode: "region_sequence",
            fallbackName: "Node",
            appendNumber: true,
            regionRules: [{ name: "HongKong", keywords: ["Hong Kong", "HK"] }],
          },
        },
      },
    });

    expect(result.entries.map((entry) => entry.proxy.name)).toEqual(["HongKong1"]);
    expect(result.filteredEntries).toHaveLength(1);
    expect(result.rawEntries.map((entry) => entry.finalName)).toEqual(["", "HongKong1"]);
    expect(result.rawEntries.map((entry) => entry.distributionStatus)).toEqual(["filtered", "distributed"]);
  });

  it("marks duplicate raw nodes as undistributed duplicates", () => {
    const entries = [
      {
        proxy: { name: "HK Hong Kong 1", type: "anytls", server: "same.example.com", port: 50200, password: "p1" },
        source: { type: "airport", id: 1 },
      },
      {
        proxy: { name: "HK Hong Kong 2", type: "anytls", server: "same.example.com", port: 50200, password: "p1" },
        source: { type: "airport", id: 1 },
      },
    ];

    const result = processProxyEntries(entries, {
      config: {
        cloudsub: {
          nodeNaming: {
            mode: "region_sequence",
            fallbackName: "Node",
            appendNumber: true,
            regionRules: [{ name: "HongKong", keywords: ["Hong Kong", "HK"] }],
          },
        },
      },
    });

    expect(result.entries.map((entry) => entry.proxy.name)).toEqual(["HongKong1"]);
    expect(result.duplicateEntries).toHaveLength(1);
    expect(result.rawEntries.map((entry) => entry.finalName)).toEqual(["HongKong1", ""]);
    expect(result.rawEntries.map((entry) => entry.distributionStatus)).toEqual(["distributed", "duplicate"]);
  });
});

describe("nodePoolService changes", () => {
  it("summarizes node pool changes from the previous snapshot", () => {
    const previous = {
      entries: [
        { duplicateKey: "ss|old.example.com|443|pw", proxy: { name: "Old" } },
        { duplicateKey: "ss|same.example.com|443|pw", proxy: { name: "Same" } },
      ],
    };
    const current = {
      entries: [
        { duplicateKey: "ss|same.example.com|443|pw", proxy: { name: "Same" } },
        { duplicateKey: "ss|new.example.com|443|pw", proxy: { name: "New" } },
      ],
    };

    const result = nodePoolService.summarizeChanges(previous, current);

    expect(result).toMatchObject({
      addedCount: 1,
      removedCount: 1,
      unchangedCount: 1,
      previousValidCount: 2,
      currentValidCount: 2,
    });
  });
});

describe("upstreamSchedulerService", () => {
  it("uses a safe configurable refresh interval range", () => {
    expect(upstreamSchedulerService.clampIntervalHours(undefined)).toBe(6);
    expect(upstreamSchedulerService.clampIntervalHours(0)).toBe(1);
    expect(upstreamSchedulerService.clampIntervalHours(999)).toBe(168);
    expect(upstreamSchedulerService.clampIntervalHours(12)).toBe(12);
  });

  it("detects due upstream subscriptions by last checked time", () => {
    expect(upstreamSchedulerService.isDue({ last_checked_at: null }, 6, new Date("2026-06-03T12:00:00.000Z"))).toBe(true);
    expect(upstreamSchedulerService.isDue(
      { last_checked_at: "2026-06-03T07:00:00.000Z" },
      6,
      new Date("2026-06-03T12:00:00.000Z")
    )).toBe(false);
    expect(upstreamSchedulerService.isDue(
      { last_checked_at: "2026-06-03T05:00:00.000Z" },
      6,
      new Date("2026-06-03T12:00:00.000Z")
    )).toBe(true);
  });
});

describe("distribution origin selection", () => {
  it("prefers the configured default distribution domain over the current admin domain", () => {
    const config = {
      cloudsub: {
        distributionDomains: [
          { domain: "https://sub.example.com", isDefault: true },
        ],
      },
    };

    const origin = selectDistributionOrigin(config, "https://panel.example.com");

    expect(origin).toBe("https://sub.example.com");
  });

  it("uses the configured custom domain when the request comes from workers.dev", () => {
    const config = {
      cloudsub: {
        distributionDomains: [
          { domain: "https://sub.example.com", isDefault: true },
        ],
      },
    };

    const origin = selectDistributionOrigin(config, "https://cloudsub.wando.workers.dev");

    expect(origin).toBe("https://sub.example.com");
  });

  it("falls back to the current origin when no distribution domain is configured", () => {
    const origin = selectDistributionOrigin({ cloudsub: { distributionDomains: [] } }, "https://panel.example.com");

    expect(origin).toBe("https://panel.example.com");
  });
});

describe("subscription access guard", () => {
  it("blocks a token when the minute request count reaches the rate limit", () => {
    const result = evaluateSubscriptionAccess({ total: 30, ip_count: 1, user_agent_count: 1 });

    expect(result).toMatchObject({ allowed: false, status: "rate_limited", code: 429 });
  });

  it("blocks a token when recent access sources look abnormal", () => {
    const result = evaluateSubscriptionAccess(
      { total: 10, ip_count: 8, user_agent_count: 2 },
      { minuteLimit: 999, suspiciousHourTotal: 120, suspiciousHourIpCount: 8, suspiciousHourUserAgentCount: 12 },
    );

    expect(result).toMatchObject({ allowed: false, status: "suspicious", code: 429 });
  });
});
