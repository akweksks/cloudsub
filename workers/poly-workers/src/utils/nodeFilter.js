export function normalizeNodeBlockKeywords(keywords = []) {
  return (Array.isArray(keywords) ? keywords : [])
    .map((keyword) => String(keyword || "").trim())
    .filter(Boolean);
}

export function getNodeBlockKeywords(config = {}) {
  return [
    ...new Set(normalizeNodeBlockKeywords(config?.cloudsub?.nodeBlockKeywords)),
  ];
}

export function getProxyBlockReason(proxy, keywords = []) {
  const name = String(proxy?.name || "").toLowerCase();
  if (!name) return null;

  const matched = normalizeNodeBlockKeywords(keywords).find((keyword) => {
    return name.includes(keyword.toLowerCase());
  });

  return matched ? `blocked-keyword:${matched}` : null;
}

export function shouldBlockProxy(proxy, keywords = []) {
  return Boolean(getProxyBlockReason(proxy, keywords));
}

export function filterProxiesForDistribution(proxies = [], keywords = []) {
  return proxies.filter((proxy) => !shouldBlockProxy(proxy, keywords));
}
