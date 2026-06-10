import commonService from "./commonService.js";
import createRedeemRepository from "./redeemRepositoryAdapter.js";
import routingProfileService, { applyRoutingProfileToClashConfig } from "./routingProfileService.js";
import subUserRepository from "../db/subUserRepository.js";
import subscriptionAccessLogRepository from "../db/subscriptionAccessLogRepository.js";
import { getDataVersion, getSubscriptionOutput, putSubscriptionOutput } from "./r2CacheService.js";
import { renderSubscription, resolveSubscriptionTarget } from "../utils/subscriptionTargets.js";
import { getClientIp, jsonResponse } from "../utils/http.js";

export const SUBSCRIPTION_RENDER_VERSION = "ruleset-v2";

export const SUBSCRIPTION_RATE_LIMIT = {
  minuteLimit: 30,
  suspiciousHourTotal: 120,
  suspiciousHourIpCount: 8,
  suspiciousHourUserAgentCount: 12,
};

function sinceIso(now, milliseconds) {
  return new Date(now.getTime() - milliseconds).toISOString();
}

export function evaluateSubscriptionAccess(stats = {}, limits = SUBSCRIPTION_RATE_LIMIT) {
  const total = Number(stats.total || 0);
  const ipCount = Number(stats.ip_count || 0);
  const userAgentCount = Number(stats.user_agent_count || 0);

  if (total >= limits.minuteLimit) {
    return {
      allowed: false,
      status: "rate_limited",
      code: 429,
      message: "访问过于频繁，请稍后再试",
    };
  }

  if (
    total >= limits.suspiciousHourTotal
    || ipCount >= limits.suspiciousHourIpCount
    || userAgentCount >= limits.suspiciousHourUserAgentCount
  ) {
    return {
      allowed: false,
      status: "suspicious",
      code: 429,
      message: "订阅访问异常，已临时限制",
    };
  }

  return { allowed: true, status: "allowed", code: 200, message: "success" };
}

async function recordSubscriptionLog(c, input) {
  await subscriptionAccessLogRepository.createLog(c.env, {
    userId: input.user?.id ?? null,
    token: input.token ?? "",
    status: input.status,
    code: input.code,
    message: input.message,
    ip: getClientIp(c),
    userAgent: c.req.header("User-Agent") || "",
    accessedAt: input.accessedAt,
  });
}

function createSubscriptionResponse(rendered, subscriptionInfo = "") {
  const response = new Response(rendered.body, {
    status: 200,
    headers: {
      "Content-Type": rendered.contentType,
      "content-disposition": `attachment;filename*=UTF-8''${encodeURIComponent(rendered.filename)}`,
      "profile-update-interval": "24",
    },
  });

  if (subscriptionInfo) {
    response.headers.set("subscription-userinfo", subscriptionInfo);
  }

  return response;
}

function aggregateSubscriptionInfo(items = []) {
  const totals = { upload: 0, download: 0, total: 0 };
  let expire = null;
  let hasAny = false;

  for (const item of items.filter(Boolean)) {
    for (const part of String(item).split(";")) {
      const [rawKey, rawValue] = part.split("=").map((value) => value?.trim());
      const value = Number(rawValue);
      if (!rawKey || !Number.isFinite(value)) continue;
      if (rawKey === "upload" || rawKey === "download" || rawKey === "total") {
        totals[rawKey] += value;
        hasAny = true;
      } else if (rawKey === "expire" && value > 0) {
        expire = expire === null ? value : Math.min(expire, value);
        hasAny = true;
      }
    }
  }

  if (!hasAny) return "";
  return [
    `upload=${totals.upload}`,
    `download=${totals.download}`,
    `total=${totals.total}`,
    expire ? `expire=${expire}` : "",
  ].filter(Boolean).join("; ");
}

async function checkSubscriptionAccess(c, token, user, now, accessedAt) {
  const [minuteStats, hourStats] = await Promise.all([
    subscriptionAccessLogRepository.getTokenWindowStats(c.env, token, sinceIso(now, 60 * 1000)),
    subscriptionAccessLogRepository.getTokenWindowStats(c.env, token, sinceIso(now, 60 * 60 * 1000)),
  ]);
  const rateDecision = evaluateSubscriptionAccess(minuteStats);
  const suspiciousDecision = evaluateSubscriptionAccess({
    total: hourStats?.total,
    ip_count: hourStats?.ip_count,
    user_agent_count: hourStats?.user_agent_count,
  }, { ...SUBSCRIPTION_RATE_LIMIT, minuteLimit: Number.MAX_SAFE_INTEGER });
  const accessDecision = rateDecision.allowed ? suspiciousDecision : rateDecision;

  if (!accessDecision.allowed) {
    await recordSubscriptionLog(c, {
      token,
      user,
      status: accessDecision.status,
      code: accessDecision.code,
      message: accessDecision.message,
      accessedAt,
    });
  }

  return accessDecision;
}

export async function handleSubscription(c) {
  const token = c.req.query("token") || "";
  const repo = createRedeemRepository(c.env);
  const user = await repo.findSubUserByToken(token);
  const now = new Date();
  const accessedAt = now.toISOString();

  if (!user) {
    await recordSubscriptionLog(c, {
      token,
      status: "missing",
      code: 603,
      message: "订阅不存在",
      accessedAt,
    });
    return jsonResponse(null, "订阅不存在", 603, 403);
  }

  if (user.status !== "active") {
    await recordSubscriptionLog(c, {
      token,
      user,
      status: "disabled",
      code: 603,
      message: "订阅已禁用",
      accessedAt,
    });
    return jsonResponse(null, "订阅已禁用", 603, 403);
  }

  if (new Date(user.expires_at).getTime() <= now.getTime()) {
    await recordSubscriptionLog(c, {
      token,
      user,
      status: "expired",
      code: 604,
      message: "订阅已到期",
      accessedAt,
    });
    return jsonResponse(null, "订阅已到期", 604, 403);
  }

  const accessDecision = await checkSubscriptionAccess(c, token, user, now, accessedAt);
  if (!accessDecision.allowed) {
    return jsonResponse(null, accessDecision.message, accessDecision.code, 429);
  }

  const target = resolveSubscriptionTarget({
    explicitTarget: c.req.query("target") || c.req.query("client") || c.req.query("format"),
    userAgent: c.req.header("User-Agent") || "",
    accept: c.req.header("Accept") || "",
    flag: c.req.query("flag") || "",
  });
  const dataVersion = await getDataVersion(c.env);
  const cacheTarget = `${target}-${SUBSCRIPTION_RENDER_VERSION}-rp-${user.routing_profile_id || "default"}`;
  const cachedOutput = await getSubscriptionOutput(c.env, token, cacheTarget, dataVersion);
  if (cachedOutput) {
    await subUserRepository.recordAccess(c.env, user.id, accessedAt);
    await recordSubscriptionLog(c, {
      token,
      user,
      status: "success",
      code: 200,
      message: "success",
      accessedAt,
    });
    return createSubscriptionResponse(cachedOutput, cachedOutput.subscriptionInfo);
  }

  const result = await commonService.getYml(c.env, { templateId: user.template_id });
  if (result == null) {
    await recordSubscriptionLog(c, {
      token,
      user,
      status: "empty",
      code: 602,
      message: "不存在开启的订阅",
      accessedAt,
    });
    return jsonResponse(null, "不存在开启的订阅", 602, 200);
  }

  await subUserRepository.recordAccess(c.env, user.id, accessedAt);
  await recordSubscriptionLog(c, {
    token,
    user,
    status: "success",
    code: 200,
    message: "success",
    accessedAt,
  });

  const routingProfile = await routingProfileService.findForSubscription(c.env, user.routing_profile_id);
  const outputConfig = target === "clash"
    ? applyRoutingProfileToClashConfig(result.config, routingProfile)
    : result.config;
  if (routingProfile?.id) await routingProfileService.incrementUsage(c.env, routingProfile.id);
  const rendered = renderSubscription(outputConfig, target);
  rendered.version = dataVersion;
  const subscriptionInfo = aggregateSubscriptionInfo(result.useInfo || []);
  await putSubscriptionOutput(c.env, token, cacheTarget, rendered, 300, subscriptionInfo);
  return createSubscriptionResponse(rendered, subscriptionInfo);
}
