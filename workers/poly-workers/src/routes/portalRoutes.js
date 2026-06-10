import redeemService from "../services/redeemService.js";
import createRedeemRepository from "../services/redeemRepositoryAdapter.js";
import routingProfileService from "../services/routingProfileService.js";
import { withSubscriptionUrl } from "../services/distributionService.js";
import { createSubscriptionToken } from "../utils/token.js";

export function registerPortalRoutes(app) {
  app.post("/api/portal/redeem", async (c) => {
    try {
      const body = await c.req.json();
      const result = await redeemService.redeemNew(createRedeemRepository(c.env), {
        code: body.code,
        remark: body.remark,
        tokenFactory: createSubscriptionToken,
      });
      return c.json({ code: 200, message: "success", data: await withSubscriptionUrl(c.env, c.req.raw, result) });
    } catch (error) {
      return c.json({ code: 400, message: error.message, data: null }, 400);
    }
  });

  app.post("/api/portal/renew", async (c) => {
    try {
      const body = await c.req.json();
      const result = await redeemService.renew(createRedeemRepository(c.env), {
        tokenOrUrl: body.token || body.subscriptionUrl,
        code: body.code,
      });
      return c.json({ code: 200, message: "success", data: await withSubscriptionUrl(c.env, c.req.raw, result) });
    } catch (error) {
      return c.json({ code: 400, message: error.message, data: null }, 400);
    }
  });

  app.post("/api/portal/lookup", async (c) => {
    try {
      const body = await c.req.json();
      const result = await redeemService.lookup(createRedeemRepository(c.env), body.token || body.subscriptionUrl);
      return c.json({ code: 200, message: "success", data: await withSubscriptionUrl(c.env, c.req.raw, result) });
    } catch (error) {
      return c.json({ code: 404, message: error.message, data: null }, 404);
    }
  });

  app.get("/api/portal/routing-profiles", async (c) => {
    const rows = await routingProfileService.listSelectable(c.env);
    return c.json({ code: 200, message: "success", data: rows.results || [] });
  });

  app.post("/api/portal/routing-profile", async (c) => {
    try {
      const body = await c.req.json();
      const token = redeemService.normalizeToken(body.token || body.subscriptionUrl);
      const repo = createRedeemRepository(c.env);
      const user = await repo.findSubUserByToken(token);
      if (!user) return c.json({ code: 404, message: "订阅不存在", data: null }, 404);
      if (!body.routingProfileId) {
        const updated = await repo.updateSubUser(token, {
          routing_profile_id: null,
          updated_at: new Date().toISOString(),
        });
        const result = await redeemService.lookup(repo, updated.token);
        return c.json({ code: 200, message: "success", data: await withSubscriptionUrl(c.env, c.req.raw, result) });
      }
      const profiles = await routingProfileService.listSelectable(c.env);
      const profile = (profiles.results || []).find((item) => String(item.id) === String(body.routingProfileId));
      if (!profile) return c.json({ code: 400, message: "分流方案不可用", data: null }, 400);
      const updated = await repo.updateSubUser(token, {
        routing_profile_id: profile.id,
        updated_at: new Date().toISOString(),
      });
      const result = await redeemService.lookup(repo, updated.token);
      return c.json({ code: 200, message: "success", data: await withSubscriptionUrl(c.env, c.req.raw, result) });
    } catch (error) {
      return c.json({ code: 400, message: error.message, data: null }, 400);
    }
  });
}
