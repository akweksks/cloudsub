function addDays(date, days) {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + Number(days));
  return next;
}

function normalizeToken(tokenOrUrl) {
  if (!tokenOrUrl) return "";
  try {
    const url = new URL(tokenOrUrl);
    return url.searchParams.get("token") ?? tokenOrUrl.trim();
  } catch {
    return tokenOrUrl.trim();
  }
}

function resolveCodePlanName(code) {
  return code.linked_plan_name || code.plan_name;
}

function resolveCodeDurationDays(code) {
  return code.duration_days ?? code.linked_duration_days;
}

function resolveCodeSubscriptionExpiresAt(code) {
  const value = code.subscription_expires_at;
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? new Date(time) : null;
}

function resolveSubscriptionExpiry(code, baseDate) {
  const fixedExpiry = resolveCodeSubscriptionExpiresAt(code);
  if (fixedExpiry) {
    return new Date(Math.max(baseDate.getTime(), fixedExpiry.getTime())).toISOString();
  }
  return addDays(baseDate, resolveCodeDurationDays(code)).toISOString();
}

function resolveCodeTemplateId(code) {
  return code.linked_template_id ?? code.template_id ?? null;
}

function resolveCodeRoutingProfileId(code) {
  return code.linked_routing_profile_id ?? code.routing_profile_id ?? null;
}

function assertRedeemCodeUsable(code, now) {
  if (!code || code.status !== "unused") {
    throw new Error("兑换码不可用");
  }
  if (code.expires_at && new Date(code.expires_at).getTime() <= now.getTime()) {
    throw new Error("兑换码已过期");
  }
  const fixedExpiry = resolveCodeSubscriptionExpiresAt(code);
  if (fixedExpiry && fixedExpiry.getTime() <= now.getTime()) {
    throw new Error("固定订阅到期时间已过期");
  }
  if (!fixedExpiry && (!Number.isFinite(Number(resolveCodeDurationDays(code))) || Number(resolveCodeDurationDays(code)) <= 0)) {
    throw new Error("兑换码时长无效");
  }
  if (!resolveCodePlanName(code)) {
    throw new Error("兑换码未绑定套餐");
  }
}

function getEffectiveStatus(row, now = new Date()) {
  if (row.status === "disabled") return "disabled";
  if (new Date(row.expires_at).getTime() <= now.getTime()) return "expired";
  return "active";
}

function formatSubUser(row) {
  const expiresAt = row.expires_at;
  const now = new Date();
  const remainingDays = Math.max(0, Math.ceil((new Date(expiresAt).getTime() - now.getTime()) / 86400000));
  const effectiveStatus = getEffectiveStatus(row, now);

  return {
    id: row.id,
    token: row.token,
    remark: row.remark ?? "",
    status: row.status,
    effectiveStatus,
    planId: row.plan_id ?? null,
    planName: row.plan_name,
    templateId: row.template_id ?? null,
    templateName: row.template_name ?? "",
    routingProfileId: row.routing_profile_id ?? null,
    routingProfileName: row.routing_profile_name ?? "",
    expiresAt,
    remainingDays,
    lastAccessAt: row.last_access_at ?? null,
    accessCount: row.access_count ?? 0,
  };
}

export default {
  normalizeToken,

  async redeemNew(repo, options) {
    const now = options.now ?? new Date();
    const code = await repo.findRedeemCode(options.code);
    assertRedeemCodeUsable(code, now);

    const expiresAt = resolveSubscriptionExpiry(code, now);
    const createdAt = now.toISOString();
    const user = await repo.createSubUser({
      token: options.tokenFactory(),
      remark: options.remark ?? "",
      status: "active",
      plan_id: code.plan_id ?? null,
      plan_name: resolveCodePlanName(code),
      template_id: resolveCodeTemplateId(code),
      routing_profile_id: resolveCodeRoutingProfileId(code),
      expires_at: expiresAt,
      created_at: createdAt,
      updated_at: createdAt,
    });

    await repo.markRedeemCodeUsed(code.code, user.id, createdAt);
    const next = await repo.findSubUserByToken(user.token);
    return formatSubUser(next || user);
  },

  async renew(repo, options) {
    const now = options.now ?? new Date();
    const token = normalizeToken(options.tokenOrUrl);
    const user = await repo.findSubUserByToken(token);
    if (!user) throw new Error("订阅不存在");

    const code = await repo.findRedeemCode(options.code);
    assertRedeemCodeUsable(code, now);

    const currentExpiry = new Date(user.expires_at);
    const baseDate = currentExpiry.getTime() > now.getTime() ? currentExpiry : now;
    const expiresAt = resolveSubscriptionExpiry(code, baseDate);
    const updatedAt = now.toISOString();
    const next = await repo.updateSubUser(token, {
      plan_id: code.plan_id ?? user.plan_id ?? null,
      plan_name: resolveCodePlanName(code),
      template_id: resolveCodeTemplateId(code),
      routing_profile_id: resolveCodeRoutingProfileId(code) ?? user.routing_profile_id ?? null,
      status: "active",
      expires_at: expiresAt,
      updated_at: updatedAt,
    });

    await repo.markRedeemCodeUsed(code.code, user.id, updatedAt);
    return formatSubUser(next);
  },

  async lookup(repo, tokenOrUrl) {
    const token = normalizeToken(tokenOrUrl);
    const user = await repo.findSubUserByToken(token);
    if (!user) throw new Error("订阅不存在");
    return formatSubUser(user);
  },
};
