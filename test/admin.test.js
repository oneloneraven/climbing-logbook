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

async function insert(table, row) {
  const columns = Object.keys(row);
  await env.LOGBOOK_DB.prepare(
    `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`,
  )
    .bind(...Object.values(row))
    .run();
}

beforeEach(async () => {
  configureAccess();
  for (const table of ["issue_reports", "feedback_submissions"]) {
    await env.LOGBOOK_DB.prepare(`DELETE FROM ${table}`).run();
  }
});

afterEach(clearAccess);

describe("the admin host's Access check", () => {
  it("lets a valid Access token through", async () => {
    const res = await adminJson("/-/api/admin/reports");
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
    const res = await admin("/-/api/admin/reports", { token: await makeToken() });
    expect(res.status).toBe(403);
  });

  it("refuses a token signed another way, one not yet valid, one with no expiry, and one it can't fetch keys for", async () => {
    const now = Math.floor(Date.now() / 1000);
    const hs256 = (await signToken()).replace(/^[^.]+/, encodeJson({ alg: "HS256", kid: KID }));
    for (const token of [hs256, await signToken({ nbf: now + 3600 }), await signToken({ exp: undefined })]) {
      expect((await admin("/-/api/admin/reports", { token })).status).toBe(403);
    }

    clearAccessKeyCache();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("down", { status: 500 })),
    );
    expect((await adminJson("/-/api/admin/reports")).status).toBe(403);
  });

  it("refuses everything when the audience isn't configured", async () => {
    delete env.ACCESS_AUD;
    const res = await adminJson("/-/api/admin/reports");
    expect(res.status).toBe(403);
  });

  it("lets the owner through whatever the email's case", async () => {
    env.OWNER_EMAIL = " Owner@Example.com ";
    const res = await admin("/-/api/admin/reports", { token: await signToken({ email: "OWNER@example.COM" }) });
    expect(res.status).toBe(200);
  });

  it.each([
    ["someone else's email", { email: "someone@example.com" }],
    ["no email", { email: undefined }],
    ["an empty email", { email: "" }],
  ])("refuses a valid token carrying %s", async (_label, overrides) => {
    const res = await admin("/-/api/admin/reports", { token: await signToken(overrides) });
    expect(res.status).toBe(403);
  });

  it.each([
    ["isn't set", undefined],
    ["is blank", "  "],
  ])("refuses everyone when the owner's email %s", async (_label, owner) => {
    if (owner === undefined) delete env.OWNER_EMAIL;
    else env.OWNER_EMAIL = owner;
    const res = await adminJson("/-/api/admin/reports");
    expect(res.status).toBe(403);
  });

  it("can't be switched off in a real deployment", async () => {
    env.ADMIN_ACCESS_CHECK = "off";
    const original = env.APP_ENV;
    try {
      for (const appEnv of ["production", "beta", "preview"]) {
        env.APP_ENV = appEnv;
        expect((await admin("/-/api/admin/reports")).status).toBe(403);
      }
    } finally {
      env.APP_ENV = original;
    }
  });

  it("is skipped only where the environment switches it off", async () => {
    env.ADMIN_ACCESS_CHECK = "off";
    const res = await admin("/-/api/admin/reports");
    expect(res.status).toBe(200);
  });

  it("guards the pages as well as the API", async () => {
    expect((await admin("/reports")).status).toBe(403);
    const root = await admin("/", { token: await signToken(), redirect: "manual" });
    expect(root.status).toBe(302);
    expect(new URL(root.headers.get("Location")).pathname).toBe("/reports");
  });
});

describe("the admin host's routes", () => {
  it("serves its one page for /reports and /feedback, and assets under /-/", async () => {
    const assets = vi
      .spyOn(env.ASSETS, "fetch")
      .mockImplementation(async request => new Response(new URL(request.url).pathname));
    try {
      for (const path of ["/reports", "/feedback"]) {
        expect(await (await adminJson(path)).text(), path).toBe("/admin/");
      }
      expect(await (await adminJson("/-/tailwind.css")).text()).toBe("/-/tailwind.css");
    } finally {
      assets.mockRestore();
    }
  });

  it("has nothing else, and no other methods", async () => {
    expect((await adminJson("/raven/log")).status).toBe(404);
    expect((await adminJson("/-/api/admin/counts", { method: "POST" })).status).toBe(404);
    expect((await adminJson("/-/api/admin/reports", { method: "DELETE" })).status).toBe(404);
    expect((await adminJson("/-/api/admin/reports/r1", { method: "GET" })).status).toBe(404);
    expect((await adminJson("/-/api/admin/nonsense")).status).toBe(404);
  });

  it("rejects a body that isn't a JSON object, and an id that doesn't decode", async () => {
    const patch = (path, body) =>
      adminJson(path, { method: "PATCH", headers: { "Content-Type": "application/json" }, body });
    expect((await patch("/-/api/admin/reports/r1", "{not json")).status).toBe(400);
    expect((await patch("/-/api/admin/reports/r1", "[true]")).status).toBe(400);
    expect((await patch("/-/api/admin/reports/%E0%A4%A", '{"read":true}')).status).toBe(404);
  });
});

describe("the admin API on other hosts", () => {
  it("doesn't exist", async () => {
    for (const host of ["https://example.com", "https://my.example.com"]) {
      const res = await exports.default.fetch(`${host}/-/api/admin/reports`, {
        headers: { "Cf-Access-Jwt-Assertion": await signToken() },
      });
      expect(res.status, host).toBe(404);
    }
    expect((await exports.default.fetch("https://example.com/-/admin-app.js")).status).toBe(404);
    expect((await exports.default.fetch("https://example.com/admin/")).status).toBe(404);
  });
});

describe("submissions", () => {
  beforeEach(async () => {
    await insert("issue_reports", { id: "r1", message: "Older", section: "map", created_at: "2026-10-01 10:00:00" });
    await insert("issue_reports", {
      id: "r2",
      message: "Newer",
      contact_email: "climber@example.com",
      source_page: "https://beta.climbinglogbook.com/raven/log",
      app_version: "v2.139.1",
      created_at: "2026-10-05 10:00:00",
    });
    await insert("issue_reports", {
      id: "r3",
      message: "Archived",
      created_at: "2026-10-06 10:00:00",
      archived_at: "2026-10-06 11:00:00",
    });
    await insert("feedback_submissions", { id: "f1", message: "Read already", read_at: "2026-10-02 09:00:00" });
  });

  it("lists the active ones newest first, and the archived ones apart", async () => {
    const active = await (await adminJson("/-/api/admin/reports")).json();
    expect(active.submissions.map(s => s.id)).toEqual(["r2", "r1"]);
    expect(active.submissions[0]).toMatchObject({
      message: "Newer",
      contactEmail: "climber@example.com",
      sourcePage: "https://beta.climbinglogbook.com/raven/log",
      environment: "Beta",
      appVersion: "v2.139.1",
      readAt: null,
      archivedAt: null,
      username: null,
    });

    const archived = await (await adminJson("/-/api/admin/reports?archived=1")).json();
    expect(archived.submissions.map(s => s.id)).toEqual(["r3"]);
  });

  it("counts what's unread and still active", async () => {
    expect(await (await adminJson("/-/api/admin/counts")).json()).toEqual({ reports: 2, feedback: 0 });
  });

  it("marks one read and unread, and archives and unarchives it", async () => {
    const patch = body =>
      adminJson("/-/api/admin/reports/r1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

    const read = await (await patch({ read: true })).json();
    expect(read.readAt).toEqual(expect.any(String));
    expect(await (await adminJson("/-/api/admin/counts")).json()).toEqual({ reports: 1, feedback: 0 });
    expect((await (await patch({ read: false })).json()).readAt).toBeNull();

    expect((await (await patch({ archived: true })).json()).archivedAt).toEqual(expect.any(String));
    const active = await (await adminJson("/-/api/admin/reports")).json();
    expect(active.submissions.map(s => s.id)).toEqual(["r2"]);
    expect((await (await patch({ archived: false })).json()).archivedAt).toBeNull();
  });

  it("rejects a change it doesn't understand, and one to a submission that isn't there", async () => {
    const patch = (id, body) =>
      adminJson(`/-/api/admin/feedback/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    expect((await patch("f1", { read: "yes" })).status).toBe(400);
    expect((await patch("f1", {})).status).toBe(400);
    expect((await patch("nope", { read: true })).status).toBe(404);
  });

  it("deletes one for good", async () => {
    expect((await adminJson("/-/api/admin/feedback/f1", { method: "DELETE" })).status).toBe(204);
    expect((await adminJson("/-/api/admin/feedback/f1", { method: "DELETE" })).status).toBe(404);
    expect((await (await adminJson("/-/api/admin/feedback")).json()).submissions).toEqual([]);
  });
});
