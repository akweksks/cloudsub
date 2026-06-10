export default {
  async findRedeemCode(env, code) {
    return await env.DB.prepare(`
      SELECT c.*, p.name AS linked_plan_name, p.duration_days AS linked_duration_days,
             p.template_id AS linked_template_id, p.routing_profile_id AS linked_routing_profile_id
      FROM redeem_codes c
      LEFT JOIN subscription_plans p ON p.id = c.plan_id
      WHERE c.code = ?
    `).bind(code).first();
  },

  async getRedeemCodes(env) {
    return await env.DB.prepare(`
      SELECT c.*, p.name AS linked_plan_name, p.duration_days AS linked_duration_days,
             p.template_id AS linked_template_id, p.routing_profile_id AS linked_routing_profile_id
      FROM redeem_codes c
      LEFT JOIN subscription_plans p ON p.id = c.plan_id
      ORDER BY c.id DESC
    `).all();
  },

  async createRedeemCode(env, code) {
    return await env.DB.prepare(`
      INSERT INTO redeem_codes (code, plan_id, plan_name, duration_days, status, expires_at, subscription_expires_at, remark, created_at)
      VALUES (?, ?, ?, ?, 'unused', ?, ?, ?, ?)
    `).bind(
      code.code,
      code.planId ?? null,
      code.planName,
      code.durationDays,
      code.expiresAt ?? null,
      code.subscriptionExpiresAt ?? null,
      code.remark ?? "",
      code.createdAt
    ).run();
  },

  async updateRedeemCodeStatus(env, id, status) {
    return await env.DB.prepare("UPDATE redeem_codes SET status = ? WHERE id = ?").bind(status, id).run();
  },

  async updateRedeemCodeStatusBatch(env, ids, status) {
    const results = [];
    for (const id of ids) {
      results.push(await this.updateRedeemCodeStatus(env, id, status));
    }
    return results;
  },

  async deleteRedeemCode(env, id) {
    return await env.DB.prepare("DELETE FROM redeem_codes WHERE id = ?").bind(id).run();
  },

  async markRedeemCodeUsed(env, code, userId, usedAt) {
    return await env.DB.prepare(`
      UPDATE redeem_codes
      SET status = 'used', used_by_user_id = ?, used_at = ?
      WHERE code = ? AND status = 'unused'
    `).bind(userId, usedAt, code).run();
  },
};
