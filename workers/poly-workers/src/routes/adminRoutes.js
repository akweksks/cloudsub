import redeemRepository from "../db/redeemRepository.js";
import subUserRepository from "../db/subUserRepository.js";
import subscriptionPlanRepository from "../db/subscriptionPlanRepository.js";
import subscriptionAccessLogRepository from "../db/subscriptionAccessLogRepository.js";
import dashboardRepository from "../db/dashboardRepository.js";
import clashTemplateService from "../services/clashTemplateService.js";
import nodePoolService from "../services/nodePoolService.js";
import routingProfileService from "../services/routingProfileService.js";
import upstreamSchedulerService from "../services/upstreamSchedulerService.js";
import commonService from "../services/commonService.js";
import { registerAdminResourceRoutes } from "./adminResourceRoutes.js";
import {
  clearNodePoolHistory,
  clearOperationalLogs,
  clearSchedulerHistory,
  getDataVersion,
  getSchedulerStatus,
  listNodePoolHistory,
  listOperationalLogs,
  listSchedulerHistory,
} from "../services/r2CacheService.js";
import { getDistributionOrigin, withSubscriptionUrl } from "../services/distributionService.js";
import { fetchUpstreamSubscription } from "../utils/upstreamSubscription.js";
import { createRedeemCode, createSubscriptionToken } from "../utils/token.js";
import { downloadJson, normalizeDistributionDomain, normalizeIds } from "../utils/http.js";

function buildNodeFunnel(nodePool = {}) {
  const snapshot = nodePool || {};
  const valid = Number(snapshot.validCount || 0);
  const filtered = Number(snapshot.filteredCount || 0);
  const invalid = Number(snapshot.invalidCount || 0);
  const duplicate = Number(snapshot.duplicateCount || 0);
  const raw = Array.isArray(snapshot.rawEntries) ? snapshot.rawEntries.length : valid + filtered + invalid + duplicate;
  return {
    raw,
    valid,
    filtered,
    invalid,
    duplicate,
    undistributed: filtered + invalid + duplicate,
    validRatio: raw > 0 ? Math.round((valid / raw) * 100) : 0,
  };
}

function buildHealthSummary({ overview = {}, nodePool = {}, scheduler = {}, suspiciousTokens = [] }) {
  const funnel = buildNodeFunnel(nodePool);
  const failedAirports = (scheduler?.checked || []).filter((item) => item.status && item.status !== "healthy").length;
  const expiringUsers = Number(overview?.users?.expiring_soon || 0);
  const abnormalAccess = Number(overview?.accessLogs?.today_abnormal || 0);
  let score = 100;
  if (funnel.valid === 0) score -= 45;
  if (failedAirports > 0) score -= Math.min(25, failedAirports * 8);
  if (expiringUsers > 0) score -= Math.min(12, expiringUsers * 3);
  if (abnormalAccess > 0) score -= Math.min(12, abnormalAccess * 2);
  if (suspiciousTokens.length > 0) score -= Math.min(16, suspiciousTokens.length * 4);
  score = Math.max(0, score);
  return {
    score,
    level: score >= 85 ? "healthy" : score >= 60 ? "attention" : "risk",
    title: score >= 85 ? "运行良好" : score >= 60 ? "需要关注" : "存在风险",
    failedAirports,
    expiringUsers,
    abnormalAccess,
    suspiciousTokenCount: suspiciousTokens.length,
    funnel,
  };
}

function resolveRedeemDurationDays(body = {}, plan = null) {
  const customDays = Number(body.durationDays);
  if (Number.isFinite(customDays) && customDays > 0) {
    return Math.min(Math.floor(customDays), 3650);
  }
  const planDays = Number(plan?.duration_days);
  if (Number.isFinite(planDays) && planDays > 0) {
    return Math.min(Math.floor(planDays), 3650);
  }
  return 30;
}

async function loadDashboardPart(name, task, fallback, errors) {
  try {
    return await task();
  } catch (error) {
    console.warn(`Dashboard ${name} failed: ${error.message}`);
    errors.push({ name, message: error.message });
    return fallback;
  }
}

export function registerAdminRoutes(app) {
  registerAdminResourceRoutes(app);

  app.get("/api/admin/redeem-codes", async (c) => {
    const rows = await redeemRepository.getRedeemCodes(c.env);
    return c.json({ code: 200, message: "success", data: rows });
  });

  app.post("/api/admin/redeem-codes", async (c) => {
    const body = await c.req.json();
    const now = new Date().toISOString();
    const code = body.code || createRedeemCode();
    const plan = body.planId ? await subscriptionPlanRepository.findPlanById(c.env, body.planId) : null;
    await redeemRepository.createRedeemCode(c.env, {
      code,
      planId: plan?.id ?? null,
      planName: plan?.name ?? body.planName,
      durationDays: resolveRedeemDurationDays(body, plan),
      expiresAt: body.expiresAt || null,
      subscriptionExpiresAt: body.subscriptionExpiresAt || null,
      remark: body.remark || "",
      createdAt: now,
    });
    return c.json({ code: 200, message: "success", data: { code } });
  });

  app.post("/api/admin/redeem-codes/batch", async (c) => {
    const body = await c.req.json();
    const count = Math.min(Math.max(Number(body.count || 1), 1), 200);
    const now = new Date().toISOString();
    const plan = body.planId ? await subscriptionPlanRepository.findPlanById(c.env, body.planId) : null;
    const codes = [];
    for (let i = 0; i < count; i++) {
      const code = createRedeemCode();
      await redeemRepository.createRedeemCode(c.env, {
        code,
        planId: plan?.id ?? null,
        planName: plan?.name ?? body.planName,
        durationDays: resolveRedeemDurationDays(body, plan),
        expiresAt: body.expiresAt || null,
        subscriptionExpiresAt: body.subscriptionExpiresAt || null,
        remark: body.remark || "",
        createdAt: now,
      });
      codes.push(code);
    }
    return c.json({ code: 200, message: "success", data: { codes } });
  });

  app.patch("/api/admin/redeem-codes/:id", async (c) => {
    const body = await c.req.json();
    await redeemRepository.updateRedeemCodeStatus(c.env, c.req.param("id"), body.status);
    return c.json({ code: 200, message: "success", data: null });
  });

  app.post("/api/admin/redeem-codes/batch-status", async (c) => {
    const body = await c.req.json();
    const ids = normalizeIds(body.ids);
    const status = body.status === "unused" ? "unused" : "disabled";
    if (!ids.length) return c.json({ code: 400, message: "请选择兑换码", data: null }, 400);
    await redeemRepository.updateRedeemCodeStatusBatch(c.env, ids, status);
    return c.json({ code: 200, message: "success", data: { count: ids.length } });
  });

  app.delete("/api/admin/redeem-codes/:id", async (c) => {
    await redeemRepository.deleteRedeemCode(c.env, c.req.param("id"));
    return c.json({ code: 200, message: "success", data: null });
  });

  app.get("/api/admin/plans", async (c) => {
    const rows = await subscriptionPlanRepository.getPlans(c.env);
    return c.json({ code: 200, message: "success", data: rows });
  });

  app.get("/api/admin/plans/active", async (c) => {
    const rows = await subscriptionPlanRepository.getActivePlans(c.env);
    return c.json({ code: 200, message: "success", data: rows });
  });

  app.post("/api/admin/plans", async (c) => {
    const body = await c.req.json();
    const now = new Date().toISOString();
    const plan = await subscriptionPlanRepository.createPlan(c.env, {
      name: body.name,
      durationDays: Number(body.durationDays),
      templateId: body.templateId || null,
      routingProfileId: body.routingProfileId || null,
      status: body.status || "active",
      sortOrder: Number(body.sortOrder || 0),
      description: body.description || "",
      createdAt: now,
      updatedAt: now,
    });
    return c.json({ code: 200, message: "success", data: plan });
  });

  app.patch("/api/admin/plans/:id", async (c) => {
    const body = await c.req.json();
    const plan = await subscriptionPlanRepository.updatePlan(c.env, c.req.param("id"), {
      name: body.name,
      durationDays: Number(body.durationDays),
      templateId: body.templateId || null,
      routingProfileId: body.routingProfileId || null,
      status: body.status || "active",
      sortOrder: Number(body.sortOrder || 0),
      description: body.description || "",
      updatedAt: new Date().toISOString(),
    });
    if (!plan) return c.json({ code: 404, message: "套餐不存在", data: null }, 404);
    return c.json({ code: 200, message: "success", data: plan });
  });

  app.delete("/api/admin/plans/:id", async (c) => {
    await subscriptionPlanRepository.deletePlan(c.env, c.req.param("id"));
    return c.json({ code: 200, message: "success", data: null });
  });

  app.get("/api/admin/routing-profiles", async (c) => {
    const rows = await routingProfileService.list(c.env, { hydrate: c.req.query("hydrate") === "1" });
    return c.json({ code: 200, message: "success", data: rows });
  });

  app.get("/api/admin/routing-profiles/selectable", async (c) => {
    const rows = await routingProfileService.listSelectable(c.env);
    return c.json({ code: 200, message: "success", data: rows });
  });

  app.post("/api/admin/routing-profiles/import-preview", async (c) => {
    try {
      const body = await c.req.json();
      const result = routingProfileService.importPreview(body.rawContent || "", body.sourceType || "upload");
      return c.json({ code: 200, message: "success", data: result });
    } catch (error) {
      return c.json({ code: 400, message: error.message, data: null }, 400);
    }
  });

  app.post("/api/admin/routing-profiles/import-url-preview", async (c) => {
    try {
      const body = await c.req.json();
      const url = String(body.url || "").trim();
      if (!url) return c.json({ code: 400, message: "请输入分流方案或上游订阅 URL", data: null }, 400);
      const upstream = await fetchUpstreamSubscription(url, { timeoutMs: 15000 });
      if (!upstream.ok) return c.json({ code: 400, message: upstream.error || "上游订阅拉取失败", data: upstream }, 400);
      const result = routingProfileService.importPreview(upstream.text || "", "url");
      return c.json({
        code: 200,
        message: "success",
        data: {
          ...result,
          source: {
            url: upstream.url,
            profile: upstream.profile,
            subscriptionInfo: upstream.subscriptionInfo,
            failures: upstream.failures || [],
          },
        },
      });
    } catch (error) {
      return c.json({ code: 400, message: error.message, data: null }, 400);
    }
  });

  app.post("/api/admin/routing-profiles", async (c) => {
    try {
      const body = await c.req.json();
      const profile = await routingProfileService.create(c.env, body);
      return c.json({ code: 200, message: "success", data: profile });
    } catch (error) {
      return c.json({ code: 400, message: error.message, data: null }, 400);
    }
  });

  app.patch("/api/admin/routing-profiles/:id", async (c) => {
    try {
      const body = await c.req.json();
      const profile = await routingProfileService.update(c.env, c.req.param("id"), body);
      if (!profile) return c.json({ code: 404, message: "分流方案不存在", data: null }, 404);
      return c.json({ code: 200, message: "success", data: profile });
    } catch (error) {
      return c.json({ code: 400, message: error.message, data: null }, 400);
    }
  });

  app.delete("/api/admin/routing-profiles/:id", async (c) => {
    try {
      await routingProfileService.delete(c.env, c.req.param("id"));
      return c.json({ code: 200, message: "success", data: null });
    } catch (error) {
      return c.json({ code: 400, message: error.message, data: null }, 400);
    }
  });

  app.get("/api/admin/clash-templates", async (c) => {
    const rows = await clashTemplateService.list(c.env);
    return c.json({ code: 200, message: "success", data: rows });
  });

  app.get("/api/admin/clash-templates/active", async (c) => {
    const rows = await clashTemplateService.listActive(c.env);
    return c.json({ code: 200, message: "success", data: rows });
  });

  app.post("/api/admin/clash-templates/validate", async (c) => {
    const body = await c.req.json();
    const result = clashTemplateService.validate(body.yamlContent || "");
    return c.json({ code: result.valid ? 200 : 400, message: result.message, data: result }, result.valid ? 200 : 400);
  });

  app.post("/api/admin/clash-templates/preview", async (c) => {
    try {
      const body = await c.req.json();
      const result = clashTemplateService.preview(body.yamlContent || "");
      return c.json({ code: 200, message: "success", data: result });
    } catch (error) {
      return c.json({ code: 400, message: error.message, data: null }, 400);
    }
  });

  app.post("/api/admin/clash-templates", async (c) => {
    try {
      const body = await c.req.json();
      const template = await clashTemplateService.create(c.env, {
        name: body.name,
        description: body.description,
        yamlContent: body.yamlContent,
        isDefault: Boolean(body.isDefault),
        status: body.status || "active",
      });
      return c.json({ code: 200, message: "success", data: template });
    } catch (error) {
      return c.json({ code: 400, message: error.message, data: null }, 400);
    }
  });

  app.patch("/api/admin/clash-templates/:id", async (c) => {
    try {
      const body = await c.req.json();
      const template = await clashTemplateService.update(c.env, c.req.param("id"), {
        name: body.name,
        description: body.description,
        yamlContent: body.yamlContent,
        isDefault: Boolean(body.isDefault),
        status: body.status || "active",
      });
      if (!template) return c.json({ code: 404, message: "模板不存在", data: null }, 404);
      return c.json({ code: 200, message: "success", data: template });
    } catch (error) {
      return c.json({ code: 400, message: error.message, data: null }, 400);
    }
  });

  app.delete("/api/admin/clash-templates/:id", async (c) => {
    try {
      await clashTemplateService.delete(c.env, c.req.param("id"));
      return c.json({ code: 200, message: "success", data: null });
    } catch (error) {
      return c.json({ code: 400, message: error.message, data: null }, 400);
    }
  });

  app.get("/api/admin/sub-users", async (c) => {
    const rows = await subUserRepository.getSubUsers(c.env);
    const origin = await getDistributionOrigin(c.env, c.req.raw);
    return c.json({
      code: 200,
      message: "success",
      data: rows.results?.map((row) => ({
        ...row,
        subscriptionUrl: `${origin}/subscribe?token=${row.token}`,
      })) || [],
    });
  });

  app.patch("/api/admin/sub-users/:id", async (c) => {
    const body = await c.req.json();
    const current = await subUserRepository.findSubUserById(c.env, c.req.param("id"));
    if (!current) return c.json({ code: 404, message: "订阅不存在", data: null }, 404);
    const next = await subUserRepository.updateSubUserById(c.env, c.req.param("id"), {
      ...current,
      remark: body.remark ?? current.remark,
      status: body.status ?? current.status,
      plan_id: body.planId ?? current.plan_id,
      plan_name: body.planName ?? current.plan_name,
      template_id: body.templateId ?? current.template_id,
      routing_profile_id: body.routingProfileId ?? current.routing_profile_id,
      expires_at: body.expiresAt ?? current.expires_at,
      updated_at: new Date().toISOString(),
    });
    return c.json({ code: 200, message: "success", data: next });
  });

  app.post("/api/admin/sub-users/:id/reset-token", async (c) => {
    const next = await subUserRepository.resetToken(c.env, c.req.param("id"), createSubscriptionToken(), new Date().toISOString());
    if (!next) return c.json({ code: 404, message: "订阅不存在", data: null }, 404);
    return c.json({ code: 200, message: "success", data: await withSubscriptionUrl(c.env, c.req.raw, next) });
  });

  app.post("/api/admin/sub-users/batch-status", async (c) => {
    const body = await c.req.json();
    const ids = normalizeIds(body.ids);
    const status = body.status === "disabled" ? "disabled" : "active";
    if (!ids.length) return c.json({ code: 400, message: "请选择订阅用户", data: null }, 400);
    await subUserRepository.updateStatusBatch(c.env, ids, status, new Date().toISOString());
    return c.json({ code: 200, message: "success", data: { count: ids.length } });
  });

  app.post("/api/admin/sub-users/batch-renew", async (c) => {
    const body = await c.req.json();
    const ids = normalizeIds(body.ids);
    const days = Number(body.days);
    if (!ids.length) return c.json({ code: 400, message: "请选择订阅用户", data: null }, 400);
    if (!Number.isFinite(days) || days <= 0) return c.json({ code: 400, message: "续期天数无效", data: null }, 400);
    await subUserRepository.renewBatch(c.env, ids, Math.min(days, 3650), new Date().toISOString());
    return c.json({ code: 200, message: "success", data: { count: ids.length } });
  });

  app.post("/api/admin/sub-users/batch-delete", async (c) => {
    const body = await c.req.json();
    const ids = normalizeIds(body.ids);
    if (!ids.length) return c.json({ code: 400, message: "请选择订阅用户", data: null }, 400);
    await subUserRepository.deleteBatch(c.env, ids);
    return c.json({ code: 200, message: "success", data: { count: ids.length } });
  });

  app.get("/api/admin/dashboard", async (c) => {
    const dashboardErrors = [];
    const [overview, scheduler, nodePool, operationLogs, suspiciousTokens] = await Promise.all([
      loadDashboardPart("overview", () => dashboardRepository.getOverview(c.env), {
        users: {},
        redeemCodes: {},
        accessLogs: {},
        generatedAt: new Date().toISOString(),
      }, dashboardErrors),
      loadDashboardPart("scheduler", () => getSchedulerStatus(c.env), null, dashboardErrors),
      loadDashboardPart("nodePool", () => nodePoolService.getSnapshot(c.env), {}, dashboardErrors),
      loadDashboardPart("operationLogs", () => listOperationalLogs(c.env, { limit: 6 }), [], dashboardErrors),
      loadDashboardPart("suspiciousTokens", () => subscriptionAccessLogRepository.getSuspiciousTokens(c.env, { limit: 8 }), { results: [] }, dashboardErrors),
    ]);
    const failedAirports = (scheduler?.checked || []).filter((item) => item.status && item.status !== "healthy");
    const suspiciousRows = suspiciousTokens?.results || [];
    const health = buildHealthSummary({ overview, nodePool, scheduler, suspiciousTokens: suspiciousRows });
    const alerts = [
      ...(failedAirports.length ? [{
        type: "warning",
        title: "上游订阅异常",
        message: `${failedAirports.length} 个上游最近同步异常，请查看同步任务。`,
      }] : []),
      ...((nodePool?.validCount || 0) === 0 ? [{
        type: "danger",
        title: "可分发节点为空",
        message: "当前没有可分发节点，用户订阅可能无法正常使用。",
      }] : []),
      ...((overview?.users?.expiring_soon || 0) > 0 ? [{
        type: "info",
        title: "用户即将到期",
        message: `${overview.users.expiring_soon} 个用户 7 天内到期。`,
      }] : []),
      ...((suspiciousTokens?.results || []).length ? [{
        type: "danger",
        title: "订阅访问异常",
        message: `${suspiciousRows.length} 个 Token 近期访问频率或来源异常。`,
      }] : []),
    ];
    return c.json({
      code: 200,
      message: "success",
      data: {
        ...overview,
        scheduler,
        nodePool,
        health,
        operationLogs,
        suspiciousTokens: suspiciousRows,
        dashboardErrors,
        alerts,
      },
    });
  });

  app.post("/api/admin/distribution-domains/check", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const origin = normalizeDistributionDomain(body.domain);
    if (!origin) return c.json({ code: 400, message: "分发域名无效", data: null }, 400);
    const startedAt = Date.now();
    try {
      const response = await fetch(`${origin}/subscribe?token=subpoly-domain-check`, {
        method: "GET",
        headers: { "User-Agent": "CloudSub-Domain-Check/1.0" },
      });
      return c.json({
        code: 200,
        message: "success",
        data: {
          domain: origin,
          ok: response.status < 500,
          status: response.status,
          latencyMs: Date.now() - startedAt,
          checkedAt: new Date().toISOString(),
        },
      });
    } catch (error) {
      return c.json({
        code: 200,
        message: "success",
        data: {
          domain: origin,
          ok: false,
          status: 0,
          error: error.message,
          latencyMs: Date.now() - startedAt,
          checkedAt: new Date().toISOString(),
        },
      });
    }
  });

  app.get("/api/admin/export/config", async (c) => {
    const config = await commonService.getConfig(c.env);
    return downloadJson({ exportedAt: new Date().toISOString(), config }, "subpoly-config.json");
  });

  app.get("/api/admin/export/redeem-codes", async (c) => {
    const rows = await redeemRepository.getRedeemCodes(c.env);
    return downloadJson({ exportedAt: new Date().toISOString(), redeemCodes: rows.results || rows || [] }, "subpoly-redeem-codes.json");
  });

  app.get("/api/admin/export/sub-users", async (c) => {
    const rows = await subUserRepository.getSubUsers(c.env);
    const origin = await getDistributionOrigin(c.env, c.req.raw);
    const users = (rows.results || rows || []).map((row) => ({
      ...row,
      subscriptionUrl: `${origin}/subscribe?token=${row.token}`,
    }));
    return downloadJson({ exportedAt: new Date().toISOString(), subUsers: users }, "subpoly-sub-users.json");
  });

  app.get("/api/admin/export/operation-logs", async (c) => {
    const rows = await listOperationalLogs(c.env, { limit: 500 });
    return downloadJson({ exportedAt: new Date().toISOString(), operationLogs: rows }, "subpoly-operation-logs.json");
  });

  app.get("/api/admin/operation-logs", async (c) => {
    const rows = await listOperationalLogs(c.env, { limit: c.req.query("limit") || 6 });
    return c.json({ code: 200, message: "success", data: rows });
  });

  app.delete("/api/admin/operation-logs", async (c) => {
    const deleted = await clearOperationalLogs(c.env);
    return c.json({ code: 200, message: "success", data: { deleted } });
  });

  app.get("/api/admin/subscription-logs", async (c) => {
    const rows = await subscriptionAccessLogRepository.getLogs(c.env, {
      limit: c.req.query("limit"),
      status: c.req.query("status"),
      keyword: c.req.query("keyword"),
      from: c.req.query("from"),
      to: c.req.query("to"),
    });
    return c.json({ code: 200, message: "success", data: rows });
  });

  app.get("/api/admin/subscription-logs/stats", async (c) => {
    const stats = await subscriptionAccessLogRepository.getStats(c.env);
    return c.json({ code: 200, message: "success", data: stats });
  });

  app.delete("/api/admin/subscription-logs", async (c) => {
    const days = Math.min(Math.max(Number(c.req.query("days") || 30), 1), 3650);
    const before = new Date();
    before.setUTCDate(before.getUTCDate() - days);
    const result = await subscriptionAccessLogRepository.deleteBefore(c.env, before.toISOString());
    return c.json({ code: 200, message: "success", data: { days, changes: result.meta?.changes || 0 } });
  });

  app.post("/api/admin/upstream-sync/run", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const result = await upstreamSchedulerService.run(c.env, {
      force: body.force !== false,
      intervalHours: body.intervalHours,
    });
    return c.json({ code: 200, message: "success", data: result });
  });

  app.get("/api/admin/upstream-sync/status", async (c) => {
    const [scheduler, history, nodePool, version] = await Promise.all([
      getSchedulerStatus(c.env),
      listSchedulerHistory(c.env, { limit: 6 }),
      nodePoolService.getSnapshot(c.env),
      getDataVersion(c.env),
    ]);
    return c.json({
      code: 200,
      message: "success",
      data: {
        scheduler,
        history,
        nodePool,
        dataVersion: version,
      },
    });
  });

  app.delete("/api/admin/upstream-sync/history", async (c) => {
    const deleted = await clearSchedulerHistory(c.env);
    return c.json({ code: 200, message: "success", data: { deleted } });
  });

  app.get("/api/admin/node-pool/status", async (c) => {
    const [nodePool, history, version] = await Promise.all([
      nodePoolService.getSnapshot(c.env),
      listNodePoolHistory(c.env, { limit: 6 }),
      getDataVersion(c.env),
    ]);
    return c.json({ code: 200, message: "success", data: { nodePool, history, dataVersion: version } });
  });

  app.delete("/api/admin/node-pool/history", async (c) => {
    const deleted = await clearNodePoolHistory(c.env);
    return c.json({ code: 200, message: "success", data: { deleted } });
  });

  app.post("/api/admin/node-pool/rebuild", async (c) => {
    const nodePool = await nodePoolService.rebuild(c.env);
    const version = await getDataVersion(c.env);
    return c.json({ code: 200, message: "success", data: { nodePool, dataVersion: version } });
  });
}
