import commonService from "../services/commonService.js";
import { auditAdminAction } from "../services/adminAuditService.js";
import { getClientIp, getWhitelistIps, isIpAllowed } from "../utils/http.js";

function isPublicPath(pathname) {
  return pathname === "/subscribe" || pathname.startsWith("/api/portal/");
}

function isProtectedPath(pathname) {
  return pathname.startsWith("/api/admin/");
}

export async function serveSpaNavigation(c, next) {
  const accept = c.req.header("Accept") || "";
  if (
    c.req.method === "GET"
    && accept.includes("text/html")
    && c.env.ASSETS
    && !c.req.path.startsWith("/api/")
    && c.req.path !== "/subscribe"
  ) {
    return fetchFrontendAsset(c);
  }
  await next();
}

export async function fetchFrontendAsset(c) {
  const response = await c.env.ASSETS.fetch(c.req.raw);
  const headers = new Headers(response.headers);
  if (c.req.path.startsWith("/assets/")) {
    headers.set("Cache-Control", "public, max-age=31536000, immutable");
  } else if (response.headers.get("Content-Type")?.includes("text/html")) {
    headers.set("Cache-Control", "no-store, max-age=0");
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export async function requireAdmin(c, next) {
  if (isPublicPath(c.req.path) || !isProtectedPath(c.req.path)) {
    await next();
    return;
  }

  const config = await commonService.getConfig(c.env).catch(() => null);
  const whitelist = getWhitelistIps(config);
  if (!isIpAllowed(getClientIp(c), whitelist)) {
    return c.json({ code: 403, message: "当前 IP 不允许访问后台", data: null }, 403);
  }

  const authHeader = c.req.header("Authorization");
  const auth = await commonService.initCheck(c.env, authHeader).catch((error) => {
    console.warn(`Admin auth database check failed: ${error.message}`);
    const fallbackPassword = c.env.ADMIN_PASSWORD || "admin235";
    return authHeader === fallbackPassword ? { token: fallbackPassword, degraded: true } : null;
  });
  if (!auth) {
    return c.json({ code: 401, message: "未授权", data: null }, 401);
  }

  const startedAt = Date.now();
  await next();

  if (["POST", "PATCH", "DELETE"].includes(c.req.method) && c.res?.status < 400) {
    await auditAdminAction(c, `${c.req.method} ${c.req.path}`, "后台操作已完成", {
      target: c.req.path,
      status: c.res.status,
      latencyMs: Date.now() - startedAt,
    });
  }
}

export async function noStoreAdminApi(c, next) {
  await next();
  c.res.headers.set("Cache-Control", "no-store, max-age=0");
  c.res.headers.set("Pragma", "no-cache");
}
