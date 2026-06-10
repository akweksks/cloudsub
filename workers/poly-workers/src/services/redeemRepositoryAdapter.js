import redeemRepository from "../db/redeemRepository.js";
import subUserRepository from "../db/subUserRepository.js";

export default function createRedeemRepository(env) {
  return {
    async findRedeemCode(code) {
      return await redeemRepository.findRedeemCode(env, code);
    },
    async markRedeemCodeUsed(code, userId, usedAt) {
      return await redeemRepository.markRedeemCodeUsed(env, code, userId, usedAt);
    },
    async createSubUser(user) {
      return await subUserRepository.createSubUser(env, user);
    },
    async findSubUserByToken(token) {
      return await subUserRepository.findSubUserByToken(env, token);
    },
    async updateSubUser(token, updates) {
      return await subUserRepository.updateSubUser(env, token, updates);
    },
  };
}
