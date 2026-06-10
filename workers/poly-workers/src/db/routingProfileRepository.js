function toDbBoolean(value, fallback = true) {
  if (value === undefined || value === null) return fallback ? 1 : 0;
  if (typeof value === "string") return ["1", "true", "active", "enabled"].includes(value.toLowerCase()) ? 1 : 0;
  return value ? 1 : 0;
}

export default {
  async getProfiles(env) {
    return await env.DB.prepare(`
      SELECT *
      FROM routing_profiles
      ORDER BY is_default DESC, id DESC
    `).all();
  },

  async getSelectableProfiles(env) {
    return await env.DB.prepare(`
      SELECT *
      FROM routing_profiles
      WHERE status = 'active' AND allow_user_select = 1
      ORDER BY is_default DESC, id DESC
    `).all();
  },

  async findById(env, id) {
    if (!id) return null;
    return await env.DB.prepare("SELECT * FROM routing_profiles WHERE id = ?").bind(id).first();
  },

  async findDefault(env) {
    return await env.DB.prepare(`
      SELECT *
      FROM routing_profiles
      WHERE status = 'active' AND is_default = 1
      ORDER BY id DESC
      LIMIT 1
    `).first();
  },

  async clearDefault(env) {
    return await env.DB.prepare("UPDATE routing_profiles SET is_default = 0").run();
  },

  async create(env, profile) {
    const result = await env.DB.prepare(`
      INSERT INTO routing_profiles (
        name, description, source_type, content_ref, status,
        is_default, allow_user_select, client_support, usage_count,
        created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      profile.name,
      profile.description ?? "",
      profile.sourceType ?? "custom",
      profile.contentRef ?? "{}",
      profile.status ?? "active",
      profile.isDefault ? 1 : 0,
      profile.allowUserSelect === false ? 0 : 1,
      JSON.stringify(profile.clientSupport || ["clash"]),
      Number(profile.usageCount || 0),
      profile.createdAt,
      profile.updatedAt
    ).run();
    return await this.findById(env, result.meta.last_row_id);
  },

  async update(env, id, profile) {
    const current = await this.findById(env, id);
    if (!current) return null;
    const next = { ...current, ...profile };
    await env.DB.prepare(`
      UPDATE routing_profiles
      SET name = ?, description = ?, source_type = ?, content_ref = ?, status = ?,
          is_default = ?, allow_user_select = ?, client_support = ?, usage_count = ?,
          updated_at = ?
      WHERE id = ?
    `).bind(
      next.name,
      next.description ?? "",
      next.source_type ?? next.sourceType ?? "custom",
      next.content_ref ?? next.contentRef ?? "{}",
      next.status ?? "active",
      toDbBoolean(next.is_default ?? next.isDefault, false),
      toDbBoolean(next.allow_user_select ?? next.allowUserSelect, true),
      typeof next.client_support === "string" ? next.client_support : JSON.stringify(next.clientSupport || ["clash"]),
      Number(next.usage_count ?? next.usageCount ?? 0),
      next.updated_at ?? next.updatedAt,
      id
    ).run();
    return await this.findById(env, id);
  },

  async delete(env, id) {
    return await env.DB.prepare("DELETE FROM routing_profiles WHERE id = ?").bind(id).run();
  },

  async incrementUsage(env, id) {
    if (!id) return null;
    return await env.DB.prepare(`
      UPDATE routing_profiles
      SET usage_count = COALESCE(usage_count, 0) + 1
      WHERE id = ?
    `).bind(id).run();
  },
};
