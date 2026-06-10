import groupRepository from "../db/groupRepository.js";
import rulesetSnapshotService from "./rulesetSnapshotService.js";

export default {
  // 获取所有分组
  async getAllGroups(env) {
    const groups = await groupRepository.getAllGroups(env);
    return groups.results.map(group => ({
      id: group.id,
      groupName: group.group_name,
      groupType: group.group_type,
      groupRegex: group.group_regex,
      url: group.url,
      interval: group.interval,
      createdAt: group.created_at
    }));
  },

  async getGroupsByType(env, type) {
    const groups = await groupRepository.getGroupsByType(env, type);
    return groups.results.map(group => ({
      id: group.id,
      groupName: group.group_name,
      groupType: group.group_type,
      groupRegex: group.group_regex,
      url: group.url,
      interval: group.interval,
      createdAt: group.created_at
    }));
  },

  // 通过id获取所有分组
  async getGroupById(env, id) {
    const group = await groupRepository.getGroupById(env, id);

    if (!group) return null;

    return {
      id: group.id,
      groupName: group.group_name,
      groupType: group.group_type,
      groupRegex: group.group_regex,
      url: group.url,
      interval: group.interval,
      createdAt: group.created_at
    };
  },


  // 添加分组
  async addGroup(env, groupName, groupType, groupRegex, url, interval) {
    const result = await groupRepository.addGroup(env, groupName, groupType, groupRegex, url, interval);
    await rulesetSnapshotService.refresh(env);
    return result;
  },

  // 修改分组
  async editGroup(env, id, groupName, groupType, groupRegex, url, interval) {
    const result = await groupRepository.editGroup(env, id, groupName, groupType, groupRegex, url, interval);
    await rulesetSnapshotService.refresh(env);
    return result;
  },

  // 删除分组
  async deleteGroup(env, id) {
    const result = await groupRepository.deleteGroup(env, id);
    await rulesetSnapshotService.refresh(env);
    return result;
  },
};
