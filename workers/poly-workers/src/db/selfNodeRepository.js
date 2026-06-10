export default {
  async getAllNodes(env) {
    return await env.DB.prepare("SELECT * FROM self_node").all();
  },

  async getNodeById(env, id) {
    return await env.DB.prepare("SELECT * FROM self_node WHERE id = ?").bind(id).all();
  },

  async addNode(env, link, convert) {
    const lastResult = await env.DB.prepare("SELECT * FROM self_node ORDER BY id DESC").first();
    const newId = lastResult == null ? 1 : lastResult.id + 1;
    await env.DB.prepare(
      "INSERT INTO self_node (id, link, convert) VALUES (?, ?, ?)"
    ).bind(newId, link, convert).run();
    return { id: newId, link, convert };
  },

  async editNode(env, id, link, convert) {
    return await env.DB.prepare(
      "UPDATE self_node SET link = ?, convert = ? WHERE id = ?"
    ).bind(link, convert, id).run();
  },

  async deleteNode(env, id) {
    return await env.DB.prepare("DELETE FROM self_node WHERE id = ?").bind(id).run();
  },
};
