function readBoolean(value) {
  return ["1", "true", "yes"].includes(String(value || "").toLowerCase());
}

function readNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function readAlpn(value) {
  if (!value) return undefined;
  return decodeURIComponent(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

class AnyTLSConverter {
  static parse(link) {
    const url = new URL(link.replace(/^anytls:\/\//i, "https://"));
    const params = new URLSearchParams(url.search);
    const sni = params.get("sni") || params.get("peer") || url.hostname;

    return {
      name: decodeURIComponent(url.hash.substring(1)) || "AnyTLS Node",
      type: "anytls",
      server: url.hostname,
      port: parseInt(url.port) || 443,
      password: decodeURIComponent(url.username || ""),
      udp: params.has("udp") ? readBoolean(params.get("udp")) : true,
      sni,
      "client-fingerprint": params.get("fp") || params.get("client-fingerprint") || "chrome",
      "skip-cert-verify": readBoolean(params.get("insecure")) || readBoolean(params.get("allowInsecure")),
      alpn: readAlpn(params.get("alpn")),
      "idle-session-check-interval": readNumber(params.get("idle-session-check-interval"), 30),
      "idle-session-timeout": readNumber(params.get("idle-session-timeout"), 30),
      "min-idle-session": readNumber(params.get("min-idle-session"), 0),
    };
  }
}

export default AnyTLSConverter;
