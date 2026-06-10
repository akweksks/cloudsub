import { appendOperationalLog } from "./r2CacheService.js";
import { getClientIp } from "../utils/http.js";

export async function auditAdminAction(c, action, message, metadata = {}) {
  await appendOperationalLog(c.env, {
    action,
    message,
    actor: "admin",
    target: metadata.target || "",
    metadata: {
      ip: getClientIp(c),
      userAgent: c.req.header("User-Agent") || "",
      ...metadata,
    },
  }).catch(() => false);
}
