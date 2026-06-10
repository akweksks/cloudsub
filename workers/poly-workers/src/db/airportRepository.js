export default {
    async createAirport(env, name, subscriptionUrl, remarks, isEnabled = true) {
      return await env.DB.prepare(
        `INSERT INTO airports (name, subscription_url, remarks, created_at, is_enabled) 
         VALUES (?, ?, ?, CURRENT_TIMESTAMP, ?)`
      ).bind(name, subscriptionUrl, remarks, isEnabled).run();
    },
  
    async getAllAirports(env) {
      return await env.DB.prepare("SELECT * FROM airports ORDER BY id DESC").all();
    },

    async getAllOpenAirports(env) {
      return await env.DB.prepare("SELECT * FROM airports where is_enabled = 1").all();
    },
  
    async getAirportById(env, id) {
      return await env.DB.prepare("SELECT * FROM airports WHERE id = ?").bind(id).first();
    },
  
    async updateAirport(env, id, name, subscriptionUrl, remarks, isEnabled) {
      return await env.DB.prepare(
        `UPDATE airports 
         SET name = ?, subscription_url = ?, remarks = ?, is_enabled = ? 
         WHERE id = ?`
      ).bind(name, subscriptionUrl, remarks, isEnabled, id).run();
    },

    async updateAirportHealth(env, id, health) {
      return await env.DB.prepare(`
        UPDATE airports
        SET health_status = ?,
            health_node_count = ?,
            health_userinfo = ?,
            health_upload = ?,
            health_download = ?,
            health_total = ?,
            health_expire_at = ?,
            health_error = ?,
            last_checked_at = ?
        WHERE id = ?
      `).bind(
        health.status,
        health.nodeCount ?? 0,
        health.userInfo ?? null,
        health.upload ?? null,
        health.download ?? null,
        health.total ?? null,
        health.expireAt ?? null,
        health.error ?? null,
        health.checkedAt,
        id
      ).run();
    },

    async replaceAirportNodes(env, airportId, nodes = [], sourceProfile = "", fetchedAt = new Date().toISOString()) {
      await env.DB.prepare("DELETE FROM airport_nodes WHERE airport_id = ?").bind(airportId).run();
      for (const node of nodes) {
        await env.DB.prepare(`
          INSERT INTO airport_nodes (airport_id, node_name, node_type, server, port, source_profile, fetched_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).bind(
          airportId,
          node.name || "",
          node.type || null,
          node.server || null,
          Number.isFinite(Number(node.port)) ? Number(node.port) : null,
          sourceProfile || null,
          fetchedAt
        ).run();
      }
    },

    async getAirportNodes(env, airportId) {
      return await env.DB.prepare(`
        SELECT id,
               airport_id,
               node_name,
               node_type,
               server,
               port,
               source_profile,
               fetched_at
        FROM airport_nodes
        WHERE airport_id = ?
        ORDER BY id ASC
      `).bind(airportId).all();
    },

    async deleteAirport(env, id) {
      await env.DB.prepare("DELETE FROM airport_nodes WHERE airport_id = ?").bind(id).run();
      return await env.DB.prepare("DELETE FROM airports WHERE id = ?").bind(id).run();
    }
  };
  
