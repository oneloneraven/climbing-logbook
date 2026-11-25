// Checked as well as Access itself, so a misconfigured Access application can't open the admin host (ADR-0034).

const KEYS_TTL_MS = 60 * 60 * 1000;
const CLOCK_SKEW_S = 60;
const SKIPPABLE_ENVIRONMENTS = ["e2e", "development"];

/** @type {{ teamDomain: string, keys: Array<JsonWebKey & { kid?: string }>, at: number } | null} */
let cachedKeys = null;

function base64UrlToBytes(value) {
  const base64 = value
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(value.length / 4) * 4, "=");
  return Uint8Array.from(atob(base64), char => char.charCodeAt(0));
}

function decodeJson(part) {
  return JSON.parse(new TextDecoder().decode(base64UrlToBytes(part)));
}

async function fetchKeys(teamDomain, fetchImpl) {
  const res = await fetchImpl(`https://${teamDomain}/cdn-cgi/access/certs`);
  if (!res.ok) return [];
  const { keys } = await res.json();
  cachedKeys = { teamDomain, keys: Array.isArray(keys) ? keys : [], at: Date.now() };
  return cachedKeys.keys;
}

// Keys rotate, so a kid the cache doesn't know fetches them again.
async function findKey(kid, teamDomain, fetchImpl) {
  const fresh = cachedKeys && cachedKeys.teamDomain === teamDomain && Date.now() - cachedKeys.at < KEYS_TTL_MS;
  const cached = fresh ? cachedKeys?.keys.find(key => key.kid === kid) : undefined;
  if (cached) return cached;
  return (await fetchKeys(teamDomain, fetchImpl)).find(key => key.kid === kid);
}

export async function verifyAccessJwt(token, { teamDomain, aud, fetchImpl = fetch, nowS = Date.now() / 1000 }) {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const [headerPart, payloadPart, signaturePart] = parts;
    const header = decodeJson(headerPart);
    if (header.alg !== "RS256" || !header.kid) return null;

    const jwk = await findKey(header.kid, teamDomain, fetchImpl);
    if (!jwk) return null;
    const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, [
      "verify",
    ]);
    const signed = new TextEncoder().encode(`${headerPart}.${payloadPart}`);
    if (!(await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, base64UrlToBytes(signaturePart), signed))) return null;

    const payload = decodeJson(payloadPart);
    const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (!audiences.includes(aud)) return null;
    if (payload.iss !== `https://${teamDomain}`) return null;
    if (typeof payload.exp !== "number" || payload.exp + CLOCK_SKEW_S < nowS) return null;
    if (typeof payload.nbf === "number" && payload.nbf - CLOCK_SKEW_S > nowS) return null;
    if (typeof payload.email === "string" && payload.email) return { email: payload.email };
    // A service token's JWT has no email; its common_name is the token's client id.
    if (typeof payload.common_name === "string" && payload.common_name) return { clientId: payload.common_name };
    return null;
  } catch {
    return null;
  }
}

const listed = value =>
  (value ?? "")
    .split(",")
    .map(item => item.trim())
    .filter(Boolean);

// Off only in e2e and local dev; anywhere else each role needs the team, the audience and its own allowlist.
/** @returns {Promise<"owner" | "usage" | null>} */
export async function accessRole(request, env, options = {}) {
  if (env.ADMIN_ACCESS_CHECK === "off" && SKIPPABLE_ENVIRONMENTS.includes(env.APP_ENV ?? "")) return "owner";
  const token = request.headers.get("Cf-Access-Jwt-Assertion");
  if (!token || !env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD) return null;
  const identity = await verifyAccessJwt(token, {
    teamDomain: env.ACCESS_TEAM_DOMAIN,
    aud: env.ACCESS_AUD,
    ...options,
  });
  if (!identity) return null;
  const owner = env.OWNER_EMAIL?.trim().toLowerCase();
  if ("email" in identity) return owner && identity.email.toLowerCase() === owner ? "owner" : null;
  return listed(env.USAGE_SERVICE_TOKENS).includes(identity.clientId) ? "usage" : null;
}

export function clearAccessKeyCache() {
  cachedKeys = null;
}
