import { env } from "cloudflare:workers";
import { vi } from "vitest";
import { clearAccessKeyCache } from "../server/lib/access.js";

export const TEAM = "team.example.com";
export const AUD = "admin-aud";
export const KID = "key-1";
export const OWNER = "owner@example.com";

const base64Url = bytes =>
  btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
export const encodeJson = value => base64Url(new TextEncoder().encode(JSON.stringify(value)));

const keyPair = await crypto.subtle.generateKey(
  { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
  true,
  ["sign", "verify"],
);
const publicJwk = { ...(await crypto.subtle.exportKey("jwk", keyPair.publicKey)), kid: KID, alg: "RS256" };

export async function signToken(overrides = {}, { kid = KID } = {}) {
  const now = Math.floor(Date.now() / 1000);
  const header = encodeJson({ alg: "RS256", kid, typ: "JWT" });
  const payload = encodeJson({
    aud: [AUD],
    iss: `https://${TEAM}`,
    exp: now + 600,
    iat: now,
    email: OWNER,
    ...overrides,
  });
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    keyPair.privateKey,
    new TextEncoder().encode(`${header}.${payload}`),
  );
  return `${header}.${payload}.${base64Url(signature)}`;
}

// The admin host's Access check, set up for the owner, with the team's signing keys served and every other fetch refused.
export function configureAccess() {
  env.ACCESS_TEAM_DOMAIN = TEAM;
  env.ACCESS_AUD = AUD;
  env.OWNER_EMAIL = OWNER;
  delete env.ADMIN_ACCESS_CHECK;
  clearAccessKeyCache();
  vi.stubGlobal(
    "fetch",
    vi.fn(async input => {
      const url = typeof input === "string" ? input : input.url;
      if (url === `https://${TEAM}/cdn-cgi/access/certs`) return Response.json({ keys: [publicJwk] });
      throw new Error(`Unexpected fetch to ${url}`);
    }),
  );
}

export function clearAccess() {
  vi.unstubAllGlobals();
  delete env.ACCESS_TEAM_DOMAIN;
  delete env.ACCESS_AUD;
  delete env.OWNER_EMAIL;
}
