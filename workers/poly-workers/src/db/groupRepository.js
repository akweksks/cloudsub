export default {
  async getAllGroups(env) {
    return await env.DB.prepare("SELECT * FROM groups").all();
  },

  async getGroupsByType(env, type) {
    return await env.DB.prepare("SELECT * FROM groups WHERE group_type = ?").bind(type).all();
  },

  async getGroupById(env, id) {
    return await env.DB.prepare("SELECT * FROM groups WHERE id = ?").bind(id).first();
  },

  async addGroup(env, groupName, groupType, groupRegex, url, interval) {
    const lastResult = await env.DB.prepare("SELECT * FROM groups ORDER BY id DESC").first();
    const newId = lastResult == null ? 1 : lastResult.id + 1;
    await env.DB.prepare(
      "INSERT INTO groups (id, group_name, group_type, group_regex, url, interval) VALUES (?, ?, ?, ?, ?, ?)"
    ).bind(newId, groupName, groupType, groupRegex, url, interval).run();
    return { id: newId, group_name: groupName, group_type: groupType, group_regex: groupRegex, url, interval };
  },

  async editGroup(env, id, groupName, groupType, groupRegex, url, interval) {
    return await env.DB.prepare(
      "UPDATE groups SET group_name = ?, group_type = ?, group_regex = ?, url = ?, interval = ? WHERE id = ?"
    ).bind(groupName, groupType, groupRegex, url, interval, id).run();
  },

  async deleteGroup(env, id) {
    return await env.DB.prepare("DELETE FROM groups WHERE id = ?").bind(id).run();
  },
};
