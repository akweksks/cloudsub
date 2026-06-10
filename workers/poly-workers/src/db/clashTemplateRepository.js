export default {
  async getTemplates(env) {
    return await env.DB.prepare(`
      SELECT *
      FROM clash_templates
      ORDER BY is_default DESC, id DESC
    `).all();
  },

  async getActiveTemplates(env) {
    return await env.DB.prepare(`
      SELECT *
      FROM clash_templates
      WHERE status = 'active'
      ORDER BY is_default DESC, id DESC
    `).all();
  },

  async findTemplateById(env, id) {
    if (!id) return null;
    return await env.DB.prepare("SELECT * FROM clash_templates WHERE id = ?").bind(id).first();
  },

  async findDefaultTemplate(env) {
    return await env.DB.prepare(`
      SELECT *
      FROM clash_templates
      WHERE is_default = 1 AND status = 'active'
      ORDER BY id DESC
      LIMIT 1
    `).first();
  },

  async createTemplate(env, template) {
    const result = await env.DB.prepare(`
      INSERT INTO clash_templates (name, description, yaml_content, is_default, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(
      template.name,
      template.description ?? "",
      template.yamlContent,
      template.isDefault ? 1 : 0,
      template.status ?? "active",
      template.createdAt,
      template.updatedAt
    ).run();

    return await this.findTemplateById(env, result.meta.last_row_id);
  },

  async updateTemplate(env, id, template) {
    const current = await this.findTemplateById(env, id);
    if (!current) return null;
    const next = { ...current, ...template };
    const isDefault = Object.prototype.hasOwnProperty.call(template, "isDefault")
      ? template.isDefault
      : next.is_default;

    await env.DB.prepare(`
      UPDATE clash_templates
      SET name = ?, description = ?, yaml_content = ?, is_default = ?, status = ?, updated_at = ?
      WHERE id = ?
    `).bind(
      next.name,
      next.description ?? "",
      next.yaml_content ?? next.yamlContent,
      isDefault ? 1 : 0,
      next.status,
      next.updated_at ?? next.updatedAt,
      id
    ).run();

    return await this.findTemplateById(env, id);
  },

  async clearDefault(env) {
    return await env.DB.prepare("UPDATE clash_templates SET is_default = 0").run();
  },

  async deleteTemplate(env, id) {
    return await env.DB.prepare("DELETE FROM clash_templates WHERE id = ?").bind(id).run();
  },
};
