import yaml from "js-yaml";
import clashTemplateRepository from "../db/clashTemplateRepository.js";
import { hydrateTemplateContent, putTemplateContent } from "./r2CacheService.js";

function parseYamlTemplate(yamlContent) {
  if (!yamlContent || !yamlContent.trim()) {
    throw new Error("模板内容不能为空");
  }
  const parsed = yaml.load(yamlContent);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("模板必须是 Clash YAML 对象");
  }
  return parsed;
}

function getArray(value) {
  return Array.isArray(value) ? value : [];
}

function summarizeConfig(config) {
  const proxyGroups = getArray(config["proxy-groups"]);
  const rules = getArray(config.rules);
  const proxies = getArray(config.proxies);
  return {
    mode: config.mode || "",
    proxyCount: proxies.length,
    proxyGroupCount: proxyGroups.length,
    ruleCount: rules.length,
    proxyGroups: proxyGroups.map((group) => ({
      name: group?.name || "",
      type: group?.type || "",
      proxyCount: getArray(group?.proxies).length,
      usesAutoInject: getArray(group?.proxies).includes("__AUTO__"),
    })),
    hasRules: rules.length > 0,
    hasDns: Boolean(config.dns),
  };
}

function normalizeProxyGroup(group, proxyNames) {
  if (!group || typeof group !== "object") return group;
  const next = { ...group };
  if (!Array.isArray(next.proxies) || next.proxies.length === 0) {
    next.proxies = [...proxyNames];
    return next;
  }

  if (next.proxies.includes("__AUTO__")) {
    next.proxies = next.proxies.flatMap((name) => name === "__AUTO__" ? proxyNames : [name]);
  }

  return next;
}

export function applyClashTemplate(baseConfig, template, proxyNames) {
  if (!template?.yaml_content) return baseConfig;
  const templateConfig = parseYamlTemplate(template.yaml_content);
  const hasTemplateGroups = Array.isArray(templateConfig["proxy-groups"]) && templateConfig["proxy-groups"].length > 0;
  const hasTemplateRules = Array.isArray(templateConfig.rules) && templateConfig.rules.length > 0;

  return {
    ...baseConfig,
    ...templateConfig,
    proxies: baseConfig.proxies,
    "proxy-groups": hasTemplateGroups
      ? templateConfig["proxy-groups"].map((group) => normalizeProxyGroup(group, proxyNames))
      : baseConfig["proxy-groups"],
    rules: hasTemplateRules ? templateConfig.rules : baseConfig.rules,
  };
}

function createSampleBaseConfig() {
  return {
    "mixed-port": 7890,
    "allow-lan": false,
    mode: "rule",
    "log-level": "info",
    proxies: [
      { name: "示例节点 A", type: "ss", server: "example-a.com", port: 443, cipher: "aes-128-gcm", password: "password" },
      { name: "示例节点 B", type: "trojan", server: "example-b.com", port: 443, password: "password", sni: "example-b.com" },
    ],
    "proxy-groups": [
      { name: "节点选择", type: "select", proxies: ["示例节点 A", "示例节点 B", "DIRECT"] },
    ],
    rules: ["MATCH,节点选择"],
  };
}

export default {
  parseYamlTemplate,

  validate(yamlContent) {
    try {
      const config = parseYamlTemplate(yamlContent);
      return {
        valid: true,
        message: "YAML 格式正确",
        summary: summarizeConfig(config),
      };
    } catch (error) {
      return {
        valid: false,
        message: error.message,
        summary: null,
      };
    }
  },

  preview(yamlContent) {
    const templateConfig = parseYamlTemplate(yamlContent);
    const sampleBaseConfig = createSampleBaseConfig();
    const sampleProxyNames = sampleBaseConfig.proxies.map((proxy) => proxy.name);
    const outputConfig = applyClashTemplate(sampleBaseConfig, { yaml_content: yamlContent }, sampleProxyNames);
    return {
      valid: true,
      message: "预览生成成功",
      summary: summarizeConfig(templateConfig),
      renderedSummary: summarizeConfig(outputConfig),
      yaml: yaml.dump(outputConfig),
    };
  },

  async list(env) {
    const rows = await clashTemplateRepository.getTemplates(env);
    return {
      ...rows,
      results: await Promise.all((rows.results || []).map((template) => hydrateTemplateContent(env, template))),
    };
  },

  async listActive(env) {
    const rows = await clashTemplateRepository.getActiveTemplates(env);
    return {
      ...rows,
      results: await Promise.all((rows.results || []).map((template) => hydrateTemplateContent(env, template))),
    };
  },

  async findForSubscription(env, templateId) {
    if (templateId) {
      const template = await clashTemplateRepository.findTemplateById(env, templateId);
      if (template?.status === "active") return await hydrateTemplateContent(env, template);
    }
    return await hydrateTemplateContent(env, await clashTemplateRepository.findDefaultTemplate(env));
  },

  async create(env, input) {
    parseYamlTemplate(input.yamlContent);
    const now = new Date().toISOString();
    if (input.isDefault) {
      await clashTemplateRepository.clearDefault(env);
    }
    const template = await clashTemplateRepository.createTemplate(env, {
      name: input.name,
      description: input.description,
      yamlContent: input.yamlContent,
      isDefault: Boolean(input.isDefault),
      status: input.status || "active",
      createdAt: now,
      updatedAt: now,
    });
    const pointer = await putTemplateContent(env, template.id, input.yamlContent, {
      name: input.name,
      status: input.status || "active",
    });
    if (!pointer) return template;
    const updated = await clashTemplateRepository.updateTemplate(env, template.id, {
      ...template,
      yaml_content: pointer,
      updated_at: now,
    });
    return await hydrateTemplateContent(env, updated);
  },

  async update(env, id, input) {
    const current = await clashTemplateRepository.findTemplateById(env, id);
    if (!current) return null;
    if (input.yamlContent !== undefined) {
      parseYamlTemplate(input.yamlContent);
    }
    if (input.isDefault) {
      await clashTemplateRepository.clearDefault(env);
    }
    const now = new Date().toISOString();
    const contentPointer = input.yamlContent !== undefined
      ? await putTemplateContent(env, id, input.yamlContent, {
        name: input.name ?? current.name,
        status: input.status || current.status,
      })
      : null;
    const updated = await clashTemplateRepository.updateTemplate(env, id, {
      name: input.name ?? current.name,
      description: input.description ?? current.description,
      yaml_content: contentPointer || current.yaml_content,
      is_default: input.isDefault !== undefined ? Boolean(input.isDefault) : Boolean(current.is_default),
      status: input.status || current.status || "active",
      updated_at: now,
    });
    return await hydrateTemplateContent(env, updated);
  },

  async delete(env, id) {
    const current = await clashTemplateRepository.findTemplateById(env, id);
    if (!current) return null;
    if (current.is_default) {
      throw new Error("默认模板不能删除");
    }
    await clashTemplateRepository.deleteTemplate(env, id);
    return current;
  },
};
