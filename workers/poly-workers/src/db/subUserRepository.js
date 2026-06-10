export default {
  async getSubUsers(env) {
    return await env.DB.prepare(`
      SELECT u.*, p.name AS linked_plan_name, t.name AS template_name, rp.name AS routing_profile_name
      FROM sub_users u
      LEFT JOIN subscription_plans p ON p.id = u.plan_id
      LEFT JOIN clash_templates t ON t.id = u.template_id
      LEFT JOIN routing_profiles rp ON rp.id = u.routing_profile_id
      ORDER BY u.id DESC
    `).all();
  },

  async createSubUser(env, user) {
    const result = await env.DB.prepare(`
      INSERT INTO sub_users (token, remark, status, plan_id, plan_name, template_id, routing_profile_id, expires_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      user.token,
      user.remark ?? "",
      user.status,
      user.plan_id ?? null,
      user.plan_name,
      user.template_id ?? null,
      user.routing_profile_id ?? null,
      user.expires_at,
      user.created_at,
      user.updated_at
    ).run();

    return await env.DB.prepare("SELECT * FROM sub_users WHERE id = ?").bind(result.meta.last_row_id).first();
  },

  async findSubUserByToken(env, token) {
    return await env.DB.prepare(`
      SELECT u.*, p.name AS linked_plan_name, t.name AS template_name, rp.name AS routing_profile_name
      FROM sub_users u
      LEFT JOIN subscription_plans p ON p.id = u.plan_id
      LEFT JOIN clash_templates t ON t.id = u.template_id
      LEFT JOIN routing_profiles rp ON rp.id = u.routing_profile_id
      WHERE u.token = ?
    `).bind(token).first();
  },

  async findSubUserById(env, id) {
    return await env.DB.prepare(`
      SELECT u.*, p.name AS linked_plan_name, t.name AS template_name, rp.name AS routing_profile_name
      FROM sub_users u
      LEFT JOIN subscription_plans p ON p.id = u.plan_id
      LEFT JOIN clash_templates t ON t.id = u.template_id
      LEFT JOIN routing_profiles rp ON rp.id = u.routing_profile_id
      WHERE u.id = ?
    `).bind(id).first();
  },

  async updateSubUser(env, token, updates) {
    const current = await this.findSubUserByToken(env, token);
    if (!current) return null;
    const next = { ...current, ...updates };

    await env.DB.prepare(`
      UPDATE sub_users
      SET remark = ?, status = ?, plan_id = ?, plan_name = ?, template_id = ?, routing_profile_id = ?, expires_at = ?, updated_at = ?, last_access_at = ?, access_count = ?
      WHERE token = ?
    `).bind(
      next.remark ?? "",
      next.status,
      next.plan_id ?? null,
      next.plan_name,
      next.template_id ?? null,
      next.routing_profile_id ?? null,
      next.expires_at,
      next.updated_at,
      next.last_access_at ?? null,
      next.access_count ?? 0,
      token
    ).run();

    return await this.findSubUserByToken(env, token);
  },

  async updateSubUserById(env, id, updates) {
    const current = await this.findSubUserById(env, id);
    if (!current) return null;
    return await this.updateSubUser(env, current.token, updates);
  },

  async resetToken(env, id, token, updatedAt) {
    await env.DB.prepare("UPDATE sub_users SET token = ?, updated_at = ? WHERE id = ?").bind(token, updatedAt, id).run();
    return await this.findSubUserById(env, id);
  },

  async updateStatusBatch(env, ids, status, updatedAt) {
    const results = [];
    for (const id of ids) {
      results.push(await env.DB.prepare(
        "UPDATE sub_users SET status = ?, updated_at = ? WHERE id = ?"
      ).bind(status, updatedAt, id).run());
    }
    return results;
  },

  async renewBatch(env, ids, days, updatedAt) {
    const results = [];
    for (const id of ids) {
      const user = await this.findSubUserById(env, id);
      if (!user) continue;
      const now = new Date(updatedAt);
      const currentExpiry = new Date(user.expires_at);
      const base = currentExpiry.getTime() > now.getTime() ? currentExpiry : now;
      base.setUTCDate(base.getUTCDate() + Number(days));
      results.push(await env.DB.prepare(`
        UPDATE sub_users
        SET expires_at = ?, status = 'active', updated_at = ?
        WHERE id = ?
      `).bind(base.toISOString(), updatedAt, id).run());
    }
    return results;
  },

  async deleteBatch(env, ids) {
    const results = [];
    for (const id of ids) {
      results.push(await env.DB.prepare("DELETE FROM sub_users WHERE id = ?").bind(id).run());
    }
    return results;
  },

  async recordAccess(env, id, accessedAt) {
    await env.DB.prepare(`
      UPDATE sub_users
      SET last_access_at = ?, access_count = COALESCE(access_count, 0) + 1
      WHERE id = ?
    `).bind(accessedAt, id).run();
    return await this.findSubUserById(env, id);
  },
};
