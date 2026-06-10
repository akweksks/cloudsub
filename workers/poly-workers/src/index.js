import { Hono } from "hono";
import { cors } from "hono/cors";
import subscriptionAccessLogRepository from "./db/subscriptionAccessLogRepository.js";
import upstreamSchedulerService from "./services/upstreamSchedulerService.js";
import { handleSubscription } from "./services/subscriptionRenderService.js";
import { fetchFrontendAsset, noStoreAdminApi, requireAdmin, serveSpaNavigation } from "./middleware/adminAuth.js";
import { registerAdminRoutes } from "./routes/adminRoutes.js";
import { registerPortalRoutes } from "./routes/portalRoutes.js";
import { ensureRuntimeSchema } from "./services/schemaService.js";

export { selectDistributionOrigin } from "./services/distributionService.js";
export { evaluateSubscriptionAccess } from "./services/subscriptionRenderService.js";

const app = new Hono();

app.use("*", cors({
  origin: "*",
  allowHeaders: ["Content-Type", "Authorization"],
  allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
}));

app.use("*", async (c, next) => {
  if (c.req.path.startsWith("/api/") || c.req.path === "/subscribe") {
    await ensureRuntimeSchema(c.env);
  }
  await next();
});

app.get("/api/system/diagnostics", async (c) => {
  const bindings = {
    DB: Boolean(c.env.DB),
    SUB_CACHE: Boolean(c.env.SUB_CACHE),
    ASSETS: Boolean(c.env.ASSETS),
  };
  let d1 = { ok: false, message: bindings.DB ? "unchecked" : "DB binding missing" };
  if (c.env.DB) {
    try {
      await c.env.DB.prepare("SELECT 1 AS ok").first();
      d1 = { ok: true, message: "ok" };
    } catch (error) {
      d1 = { ok: false, message: error.message };
    }
  }
  return c.json({
    code: 200,
    message: "success",
    data: {
      service: "cloudsub",
      bindings,
      d1,
    },
  });
});

app.use("/api/admin/*", noStoreAdminApi);
app.use("*", serveSpaNavigation);
app.use("*", requireAdmin);

registerPortalRoutes(app);
registerAdminRoutes(app);
app.get("/subscribe", handleSubscription);

app.notFound((c) => {
  if (c.req.path.startsWith("/api/")) {
    return c.json({ code: 404, message: "Not Found", data: null }, 404);
  }
  if (c.env.ASSETS) {
    return fetchFrontendAsset(c);
  }
  return c.text("Not Found", 404);
});

app.onError((error, c) => {
  console.error(error);
  if (c.req.path.startsWith("/api/")) {
    return c.json({
      code: 500,
      message: "Internal Server Error",
      data: {
        error: error.message,
        bindings: {
          DB: Boolean(c.env.DB),
          SUB_CACHE: Boolean(c.env.SUB_CACHE),
          ASSETS: Boolean(c.env.ASSETS),
        },
      },
    }, 500);
  }
  return c.text("Internal Server Error", 500);
});

export default {
  fetch(request, env, ctx) {
    return app.fetch(request, env, ctx);
  },
  scheduled(event, env, ctx) {
    ctx.waitUntil(Promise.all([
      upstreamSchedulerService.run(env, { force: false }),
      subscriptionAccessLogRepository.cleanupExpired(env),
    ]));
  },
};
