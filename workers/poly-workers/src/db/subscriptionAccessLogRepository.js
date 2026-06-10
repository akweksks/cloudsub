import { archiveSubscriptionLog } from "../services/r2CacheService.js";

const DEFAULT_D1_RETENTION_DAYS = 30;

function retentionCutoff(days = DEFAULT_D1_RETENTION_DAYS) {
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - days);
  return cutoff.toISOString();
}

export default {
  async createLog(env, log) {
    try {
      await archiveSubscriptionLog(env, log);
    } catch (error) {
      console.warn(`Archive subscription log failed: ${error.message}`);
    }
    const result = await env.DB.prepare(`
      INSERT INTO subscription_access_logs (user_id, token, status, code, message, ip, user_agent, accessed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      log.userId ?? null,
      log.token ?? "",
      log.status,
      log.code,
      log.message ?? "",
      log.ip ?? "",
      log.userAgent ?? "",
      log.accessedAt
    ).run();
    return result;
  },

  async getLogs(env, options = {}) {
    const limit = Math.min(Math.max(Number(options.limit || 100), 1), 500);
    const conditions = [];
    const binds = [];

    if (options.status === "abnormal") {
      conditions.push("l.status != 'success'");
    } else if (options.status) {
      conditions.push("l.status = ?");
      binds.push(options.status);
    }

    if (options.keyword) {
      conditions.push("(l.token LIKE ? OR l.ip LIKE ? OR l.user_agent LIKE ? OR u.remark LIKE ?)");
      const keyword = `%${options.keyword}%`;
      binds.push(keyword, keyword, keyword, keyword);
    }

    if (options.from) {
      conditions.push("datetime(l.accessed_at) >= datetime(?)");
      binds.push(options.from);
    }

    if (options.to) {
      conditions.push("datetime(l.accessed_at) <= datetime(?)");
      binds.push(options.to);
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    return await env.DB.prepare(`
      SELECT
        l.*,
        u.remark AS user_remark,
        u.plan_name,
        u.expires_at,
        t.name AS template_name
      FROM subscription_access_logs l
      LEFT JOIN sub_users u ON u.id = l.user_id
      LEFT JOIN clash_templates t ON t.id = u.template_id
      ${where}
      ORDER BY l.id DESC
      LIMIT ?
    `).bind(...binds, limit).all();
  },

  async getStats(env) {
    return await env.DB.prepare(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) AS success,
        SUM(CASE WHEN status = 'expired' THEN 1 ELSE 0 END) AS expired,
        SUM(CASE WHEN status = 'disabled' THEN 1 ELSE 0 END) AS disabled,
        SUM(CASE WHEN status = 'missing' THEN 1 ELSE 0 END) AS missing,
        SUM(CASE WHEN status = 'empty' THEN 1 ELSE 0 END) AS empty,
        SUM(CASE WHEN status = 'rate_limited' THEN 1 ELSE 0 END) AS rate_limited,
        SUM(CASE WHEN status = 'suspicious' THEN 1 ELSE 0 END) AS suspicious
      FROM subscription_access_logs
    `).first();
  },

  async getTokenWindowStats(env, token, since) {
    return await env.DB.prepare(`
      SELECT
        COUNT(*) AS total,
        COUNT(DISTINCT ip) AS ip_count,
        COUNT(DISTINCT user_agent) AS user_agent_count
      FROM subscription_access_logs
      WHERE token = ?
        AND datetime(accessed_at) >= datetime(?)
    `).bind(token || "", since).first();
  },

  async getSuspiciousTokens(env, options = {}) {
    const since = options.since || new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const minTotal = Math.max(Number(options.minTotal || 30), 1);
    const minIpCount = Math.max(Number(options.minIpCount || 5), 1);
    const minUserAgentCount = Math.max(Number(options.minUserAgentCount || 8), 1);
    const limit = Math.min(Math.max(Number(options.limit || 20), 1), 100);

    return await env.DB.prepare(`
      SELECT
        l.token,
        COUNT(*) AS total,
        COUNT(DISTINCT l.ip) AS ip_count,
        COUNT(DISTINCT l.user_agent) AS user_agent_count,
        MAX(l.accessed_at) AS last_accessed_at,
        u.remark AS user_remark,
        u.plan_name
      FROM subscription_access_logs l
      LEFT JOIN sub_users u ON u.token = l.token
      WHERE l.token != ''
        AND datetime(l.accessed_at) >= datetime(?)
      GROUP BY l.token
      HAVING total >= ? OR ip_count >= ? OR user_agent_count >= ?
      ORDER BY total DESC
      LIMIT ?
    `).bind(since, minTotal, minIpCount, minUserAgentCount, limit).all();
  },

  async deleteBefore(env, before) {
    return await env.DB.prepare(`
      DELETE FROM subscription_access_logs
      WHERE datetime(accessed_at) < datetime(?)
    `).bind(before).run();
  },

  async cleanupExpired(env, days = DEFAULT_D1_RETENTION_DAYS) {
    return await this.deleteBefore(env, retentionCutoff(days));
  },
};
