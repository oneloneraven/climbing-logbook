import { env, exports } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearAccessKeyCache } from "../server/lib/access.js";
import { AUD, KID, clearAccess, configureAccess, encodeJson, signToken } from "./access-tokens.js";

const ADMIN = "https://admin.example.com";

function admin(path, { token, ...init } = {}) {
  const headers = new Headers(init.headers);
  if (token) headers.set("Cf-Access-Jwt-Assertion", token);
  return exports.default.fetch(`${ADMIN}${path}`, { ...init, headers });
}

async function adminJson(path, init) {
  return admin(path, { token: await signToken(), ...init });
}

beforeEach(configureAccess);

afterEach(clearAccess);

describe("the admin host's Access check", () => {
  it("lets a valid Access token through", async () => {
    const res = await adminJson("/-/api/admin/audit");
    expect(res.status).toBe(200);
  });

  it.each([
    ["no token", async () => undefined],
    ["another application's audience", () => signToken({ aud: ["other-app"] })],
    ["another team's issuer", () => signToken({ iss: "https://other.cloudflareaccess.com" })],
    ["an expired token", () => signToken({ exp: Math.floor(Date.now() / 1000) - 3600 })],
    ["an unknown key", () => signToken({}, { kid: "key-2" })],
    ["a tampered payload", async () => (await signToken()).replace(/\.[^.]+\./, `.${encodeJson({ aud: [AUD] })}.`)],
    ["rubbish", async () => "not.a.token"],
  ])("refuses %s", async (_label, makeToken) => {
    const res = await admin("/-/api/admin/audit", { token: await makeToken() });
    expect(res.status).toBe(403);
  });

  it("refuses a token signed another way, one not yet valid, one with no expiry, and one it can't fetch keys for", async () => {
    const now = Math.floor(Date.now() / 1000);
    const hs256 = (await signToken()).replace(/^[^.]+/, encodeJson({ alg: "HS256", kid: KID }));
    for (const token of [hs256, await signToken({ nbf: now + 3600 }), await signToken({ exp: undefined })]) {
      expect((await admin("/-/api/admin/audit", { token })).status).toBe(403);
    }

    clearAccessKeyCache();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("down", { status: 500 })),
    );
    expect((await adminJson("/-/api/admin/audit")).status).toBe(403);
  });

  it("refuses everything when the audience isn't configured", async () => {
    delete env.ACCESS_AUD;
    const res = await adminJson("/-/api/admin/audit");
    expect(res.status).toBe(403);
  });

  it("lets the owner through whatever the email's case", async () => {
    env.OWNER_EMAIL = " Owner@Example.com ";
    const res = await admin("/-/api/admin/audit", { token: await signToken({ email: "OWNER@example.COM" }) });
    expect(res.status).toBe(200);
  });

  it.each([
    ["someone else's email", { email: "someone@example.com" }],
    ["no email", { email: undefined }],
    ["an empty email", { email: "" }],
  ])("refuses a valid token carrying %s", async (_label, overrides) => {
    const res = await admin("/-/api/admin/audit", { token: await signToken(overrides) });
    expect(res.status).toBe(403);
  });

  it.each([
    ["isn't set", undefined],
    ["is blank", "  "],
  ])("refuses everyone when the owner's email %s", async (_label, owner) => {
    if (owner === undefined) delete env.OWNER_EMAIL;
    else env.OWNER_EMAIL = owner;
    const res = await adminJson("/-/api/admin/audit");
    expect(res.status).toBe(403);
  });

  it("can't be switched off in a real deployment", async () => {
    env.ADMIN_ACCESS_CHECK = "off";
    const original = env.APP_ENV;
    try {
      for (const appEnv of ["production", "beta", "preview"]) {
        env.APP_ENV = appEnv;
        expect((await admin("/-/api/admin/audit")).status).toBe(403);
      }
    } finally {
      env.APP_ENV = original;
    }
  });

  it("is skipped only where the environment switches it off", async () => {
    env.ADMIN_ACCESS_CHECK = "off";
    const res = await admin("/-/api/admin/audit");
    expect(res.status).toBe(200);
  });

  it("guards the pages as well as the API", async () => {
    expect((await admin("/users")).status).toBe(403);
    const root = await admin("/", { token: await signToken(), redirect: "manual" });
    expect(root.status).toBe(302);
    expect(new URL(root.headers.get("Location")).pathname).toBe("/users");
  });
});

describe("a usage service token (#1728)", () => {
  const ENGAGE = "engage-client.access";
  const serviceToken = (clientId = ENGAGE) => signToken({ email: undefined, common_name: clientId });
  beforeEach(() => {
    env.USAGE_SERVICE_TOKENS = ` other-client.access , ${ENGAGE} `;
  });
  afterEach(() => {
    delete env.USAGE_SERVICE_TOKENS;
  });

  it("reads usage when it's on the list", async () => {
    const res = await admin("/-/api/admin/usage", { token: await serviceToken() });
    expect(res.status).toBe(200);
    expect(await res.json()).toHaveProperty("activeUsers");
  });

  it.each([
    ["GET", "/-/api/admin/users"],
    ["GET", "/-/api/admin/audit"],
    ["GET", "/-/api/admin/invites"],
    ["POST", "/-/api/admin/invites"],
    ["POST", "/-/api/admin/usage"],
    ["HEAD", "/-/api/admin/usage"],
    ["GET", "/users"],
    ["GET", "/"],
  ])("is refused %s %s", async (method, path) => {
    expect((await admin(path, { method, token: await serviceToken() })).status).toBe(403);
  });

  it("is refused everywhere when it isn't on the list", async () => {
    expect((await admin("/-/api/admin/usage", { token: await serviceToken("stranger.access") })).status).toBe(403);
  });

  it.each([
    ["isn't set", undefined],
    ["is blank", " , "],
  ])("is refused when the list %s", async (_label, list) => {
    if (list === undefined) delete env.USAGE_SERVICE_TOKENS;
    else env.USAGE_SERVICE_TOKENS = list;
    expect((await admin("/-/api/admin/usage", { token: await serviceToken() })).status).toBe(403);
  });

  it("is refused when the audience isn't configured", async () => {
    delete env.ACCESS_AUD;
    expect((await admin("/-/api/admin/usage", { token: await serviceToken() })).status).toBe(403);
  });

  it("doesn't need the owner's email to be set, and doesn't change the owner's access", async () => {
    expect((await adminJson("/-/api/admin/users")).status).toBe(200);
    delete env.OWNER_EMAIL;
    expect((await admin("/-/api/admin/usage", { token: await serviceToken() })).status).toBe(200);
    expect((await adminJson("/-/api/admin/usage")).status).toBe(403);
  });

  it("doesn't let a person's token in by carrying a listed client id", async () => {
    const token = await signToken({ email: "someone@example.com", common_name: ENGAGE });
    expect((await admin("/-/api/admin/usage", { token })).status).toBe(403);
  });
});

describe("the admin host's routes", () => {
  it("serves its one page for each tab, and assets under /-/", async () => {
    const assets = vi
      .spyOn(env.ASSETS, "fetch")
      .mockImplementation(async request => new Response(new URL(request.url).pathname));
    try {
      for (const path of ["/users", "/usage", "/invites", "/activity"]) {
        expect(await (await adminJson(path)).text(), path).toBe("/admin/");
      }
      expect(await (await adminJson("/-/tailwind.css")).text()).toBe("/-/tailwind.css");
    } finally {
      assets.mockRestore();
    }
  });

  it("has nothing else, and no other methods", async () => {
    expect((await adminJson("/raven/log")).status).toBe(404);
    expect((await adminJson("/-/api/admin/audit", { method: "DELETE" })).status).toBe(404);
    expect((await adminJson("/-/api/admin/nonsense")).status).toBe(404);
  });

  it.each([
    ["/reports", "GET"],
    ["/feedback", "GET"],
    ["/-/api/admin/counts", "GET"],
    ["/-/api/admin/reports", "GET"],
    ["/-/api/admin/feedback/f1", "PATCH"],
  ])("no longer has the feedback triage %s (#1712)", async (path, method) => {
    expect((await adminJson(path, { method })).status).toBe(404);
  });

  it("finds no user behind an id that doesn't decode", async () => {
    expect((await adminJson("/-/api/admin/users/%E0%A4%A/logbook")).status).toBe(404);
  });
});

describe("the admin API on other hosts", () => {
  it("doesn't exist", async () => {
    for (const host of ["https://example.com", "https://my.example.com"]) {
      const res = await exports.default.fetch(`${host}/-/api/admin/audit`, {
        headers: { "Cf-Access-Jwt-Assertion": await signToken() },
      });
      expect(res.status, host).toBe(404);
    }
    expect((await exports.default.fetch("https://example.com/-/admin-app.js")).status).toBe(404);
    expect((await exports.default.fetch("https://example.com/admin/")).status).toBe(404);
  });
});
