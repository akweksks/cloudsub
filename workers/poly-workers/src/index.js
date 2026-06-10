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
