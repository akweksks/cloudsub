import Sub2Clash from '../utils/Sub2Clash.js';
import selfNodeRepository from "../db/selfNodeRepository.js";
import nodePoolService from "./nodePoolService.js";


export default {
    // 获取所有自建节点
    async converter(link) {
        try {
            const normalizedLink = String(link || "").toLowerCase();
            let protocol;
            if (normalizedLink.startsWith('vmess://')) protocol = 'vmess';
            else if (normalizedLink.startsWith('vless://')) protocol = 'vless';
            else if (normalizedLink.startsWith('trojan://')) protocol = 'trojan';
            else if (normalizedLink.startsWith('ss://')) protocol = 'ss';
            else if (normalizedLink.startsWith('ssr://')) protocol = 'ssr';
            else if (normalizedLink.startsWith('hysteria://')) protocol = 'hysteria';
            else if (normalizedLink.startsWith('hysteria2://')) protocol = 'hysteria2';
            else if (normalizedLink.startsWith('anytls://')) protocol = 'anytls';
            else throw new Error('不支持的协议');

            const config = Sub2Clash.convert(protocol, link);
            return config;
        } catch (error) {
            console.error('转换失败:', error);
            throw error;
        }
    },
    // 获取所有自建节点
    async getAllNodes(env) {
        const groups = await selfNodeRepository.getAllNodes(env);
        return groups.results.map(group => ({
            id: group.id,
            link: group.link,
            convert: group.convert,
            createdAt: group.created_at
        }));
    },

    // 通过id获取所有自建节点
    async getNodeById(env, id) {
        const data = await selfNodeRepository.getNodeById(env, id);
        const group = data?.results?.[0];

        if (!group) return null;

        return {
            id: group.id,
            link: group.link,
            convert: group.convert,
            createdAt: group.created_at
        };
    },


    // 添加自建节点
    async addNode(env, link) {
        const convert = await this.converter(link);
        const result = await selfNodeRepository.addNode(env, link, JSON.stringify(convert));
        await nodePoolService.rebuild(env);
        return result;
    },

    // 修改自建节点
    async editNode(env, id, link, convert) {
        const result = await selfNodeRepository.editNode(env, id, link, convert);
        await nodePoolService.rebuild(env);
        return result;
    },

    // 删除自建节点
    async deleteNode(env, id) {
        const result = await selfNodeRepository.deleteNode(env, id);
        await nodePoolService.rebuild(env);
        return result;
    },
}
