export default {
  async getPlans(env) {
    return await env.DB.prepare(`
      SELECT p.*, t.name AS template_name, rp.name AS routing_profile_name
      FROM subscription_plans p
      LEFT JOIN clash_templates t ON t.id = p.template_id
      LEFT JOIN routing_profiles rp ON rp.id = p.routing_profile_id
      ORDER BY p.sort_order ASC, p.id DESC
    `).all();
  },

  async getActivePlans(env) {
    return await env.DB.prepare(`
      SELECT p.*, t.name AS template_name, rp.name AS routing_profile_name
      FROM subscription_plans p
      LEFT JOIN clash_templates t ON t.id = p.template_id
      LEFT JOIN routing_profiles rp ON rp.id = p.routing_profile_id
      WHERE p.status = 'active'
      ORDER BY p.sort_order ASC, p.id DESC
    `).all();
  },

  async findPlanById(env, id) {
    if (!id) return null;
    return await env.DB.prepare(`
      SELECT p.*, t.name AS template_name, rp.name AS routing_profile_name
      FROM subscription_plans p
      LEFT JOIN clash_templates t ON t.id = p.template_id
      LEFT JOIN routing_profiles rp ON rp.id = p.routing_profile_id
      WHERE p.id = ?
    `).bind(id).first();
  },

  async findPlanByName(env, name) {
    if (!name) return null;
    return await env.DB.prepare(`
      SELECT p.*, t.name AS template_name, rp.name AS routing_profile_name
      FROM subscription_plans p
      LEFT JOIN clash_templates t ON t.id = p.template_id
      LEFT JOIN routing_profiles rp ON rp.id = p.routing_profile_id
      WHERE p.name = ?
    `).bind(name).first();
  },

  async createPlan(env, plan) {
    const result = await env.DB.prepare(`
      INSERT INTO subscription_plans (name, duration_days, template_id, routing_profile_id, status, sort_order, description, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      plan.name,
      plan.durationDays,
      plan.templateId ?? null,
      plan.routingProfileId ?? null,
      plan.status ?? "active",
      plan.sortOrder ?? 0,
      plan.description ?? "",
      plan.createdAt,
      plan.updatedAt
    ).run();

    return await this.findPlanById(env, result.meta.last_row_id);
  },

  async updatePlan(env, id, plan) {
    const current = await this.findPlanById(env, id);
    if (!current) return null;
    const next = { ...current, ...plan };
    const templateId = Object.prototype.hasOwnProperty.call(plan, "templateId")
      ? plan.templateId
      : next.template_id;
    const routingProfileId = Object.prototype.hasOwnProperty.call(plan, "routingProfileId")
      ? plan.routingProfileId
      : next.routing_profile_id;

    await env.DB.prepare(`
      UPDATE subscription_plans
      SET name = ?, duration_days = ?, template_id = ?, routing_profile_id = ?, status = ?, sort_order = ?, description = ?, updated_at = ?
      WHERE id = ?
    `).bind(
      next.name,
      next.duration_days ?? next.durationDays,
      templateId ?? null,
      routingProfileId ?? null,
      next.status,
      next.sort_order ?? next.sortOrder ?? 0,
      next.description ?? "",
      next.updated_at ?? next.updatedAt,
      id
    ).run();

    return await this.findPlanById(env, id);
  },

  async deletePlan(env, id) {
    return await env.DB.prepare("DELETE FROM subscription_plans WHERE id = ?").bind(id).run();
  },
};
