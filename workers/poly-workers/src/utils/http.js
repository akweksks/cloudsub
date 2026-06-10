export function jsonResponse(data = null, message = "success", code = 200, status = 200) {
  return new Response(JSON.stringify({ code, message, data }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export function getOrigin(request) {
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}`;
}

export function normalizeDistributionDomain(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(withProtocol);
    return `${url.protocol}//${url.host}`;
  } catch {
    return "";
  }
}

export function normalizeIds(ids) {
  if (!Array.isArray(ids)) return [];
  return [...new Set(ids.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0))];
}

export function getClientIp(c) {
  return c.req.header("CF-Connecting-IP")
    || c.req.header("x-forwarded-for")
    || c.req.header("x-real-ip")
    || "";
}

export function getWhitelistIps(config = {}) {
  return (Array.isArray(config?.cloudsub?.adminIpWhitelist) ? config.cloudsub.adminIpWhitelist : [])
    .map((item) => String(item || "").trim())
    .filter(Boolean);
}

export function isIpAllowed(ip, whitelist = []) {
  if (!whitelist.length) return true;
  const current = String(ip || "").trim();
  return Boolean(current) && whitelist.includes(current);
}

export function downloadJson(data, filename) {
  return new Response(JSON.stringify(data, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
