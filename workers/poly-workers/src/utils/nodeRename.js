export function getNodeRenameRules(config = {}) {
  const rules = config?.cloudsub?.nodeRenameRules;
  if (!Array.isArray(rules)) return [];
  return rules
    .map((rule) => ({
      match: String(rule?.match || "").trim(),
      replace: String(rule?.replace ?? "").trim(),
    }))
    .filter((rule) => rule.match);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function renameProxyForDistribution(proxy, rules = []) {
  const originalName = String(proxy?.name || "");
  if (!originalName || rules.length === 0) return proxy;

  let nextName = originalName;
  for (const rule of rules) {
    if (!nextName.includes(rule.match)) continue;
    nextName = nextName.replace(new RegExp(escapeRegExp(rule.match), "g"), rule.replace);
  }
  return { ...proxy, name: nextName.trim() };
}
