export default {
  async getOverview(env, now = new Date()) {
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
    const nextWeek = new Date(now.getTime());
    nextWeek.setUTCDate(nextWeek.getUTCDate() + 7);

    const [users, codes, logs] = await Promise.all([
      env.DB.prepare(`
        SELECT
          COUNT(*) AS total,
          COALESCE(SUM(CASE WHEN status = 'active' AND datetime(expires_at) > datetime(?) THEN 1 ELSE 0 END), 0) AS active,
          COALESCE(SUM(CASE WHEN status = 'disabled' THEN 1 ELSE 0 END), 0) AS disabled,
          COALESCE(SUM(CASE WHEN datetime(expires_at) <= datetime(?) THEN 1 ELSE 0 END), 0) AS expired,
          COALESCE(SUM(CASE WHEN status = 'active' AND datetime(expires_at) > datetime(?) AND datetime(expires_at) <= datetime(?) THEN 1 ELSE 0 END), 0) AS expiring_soon
        FROM sub_users
      `).bind(now.toISOString(), now.toISOString(), now.toISOString(), nextWeek.toISOString()).first(),
      env.DB.prepare(`
        SELECT
          COUNT(*) AS total,
          COALESCE(SUM(CASE WHEN status = 'unused' AND (expires_at IS NULL OR datetime(expires_at) > datetime(?)) THEN 1 ELSE 0 END), 0) AS unused,
          COALESCE(SUM(CASE WHEN status = 'used' THEN 1 ELSE 0 END), 0) AS used,
          COALESCE(SUM(CASE WHEN status = 'disabled' THEN 1 ELSE 0 END), 0) AS disabled,
          COALESCE(SUM(CASE WHEN status = 'unused' AND expires_at IS NOT NULL AND datetime(expires_at) <= datetime(?) THEN 1 ELSE 0 END), 0) AS expired
        FROM redeem_codes
      `).bind(now.toISOString(), now.toISOString()).first(),
      env.DB.prepare(`
        SELECT
          COUNT(*) AS total,
          COALESCE(SUM(CASE WHEN datetime(accessed_at) >= datetime(?) THEN 1 ELSE 0 END), 0) AS today,
          COALESCE(SUM(CASE WHEN status = 'success' AND datetime(accessed_at) >= datetime(?) THEN 1 ELSE 0 END), 0) AS today_success,
          COALESCE(SUM(CASE WHEN status != 'success' AND datetime(accessed_at) >= datetime(?) THEN 1 ELSE 0 END), 0) AS today_abnormal,
          COALESCE(SUM(CASE WHEN status != 'success' THEN 1 ELSE 0 END), 0) AS abnormal
        FROM subscription_access_logs
      `).bind(today, today, today).first(),
    ]);

    return {
      users,
      redeemCodes: codes,
      accessLogs: logs,
      generatedAt: now.toISOString(),
    };
  },
};
