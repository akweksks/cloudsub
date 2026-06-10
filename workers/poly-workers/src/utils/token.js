const TOKEN_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function randomFromAlphabet(length, alphabet) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let value = "";
  for (const byte of bytes) {
    value += alphabet[byte % alphabet.length];
  }
  return value;
}

export function createSubscriptionToken() {
  return randomFromAlphabet(32, TOKEN_ALPHABET);
}

export function createRedeemCode() {
  const raw = randomFromAlphabet(16, CODE_ALPHABET);
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}-${raw.slice(12)}`;
}

export function extractToken(tokenOrUrl) {
  if (!tokenOrUrl) return "";
  try {
    const url = new URL(tokenOrUrl);
    return url.searchParams.get("token") ?? tokenOrUrl.trim();
  } catch {
    return tokenOrUrl.trim();
  }
}
