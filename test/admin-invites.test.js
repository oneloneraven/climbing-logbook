import { env, exports } from "cloudflare:workers";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { resetAuthTables } from "./support.js";
import { signUp, stubBetaGateFetch } from "./beta-gate-helpers.js";

const INVITES = "https://admin.example.com/-/api/admin/invites";

const create = body =>
  exports.default.fetch(INVITES, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
const list = async () => (await (await exports.default.fetch(INVITES)).json()).invites;

beforeAll(() => {
  env.ADMIN_ACCESS_CHECK = "off";
});
afterAll(() => {
  delete env.ADMIN_ACCESS_CHECK;
});
beforeEach(resetAuthTables);
stubBetaGateFetch();

describe("admin invites (#1542)", () => {
  it("creates a code with a sign-up link on the app's host", async () => {
    const res = await create({ email: null });
    expect(res.status).toBe(201);
    const invite = await res.json();
    expect(invite.code).toMatch(/^[a-z2-7]{26}$/);
    expect(invite.url).toBe(`https://example.com/register/?code=${invite.code}`);
  });

  it("pins a code to a lowercased email address", async () => {
    const { email } = await (await create({ email: "Nix@Example.com" })).json();
    expect(email).toBe("nix@example.com");
  });

  it("refuses an invalid email address and stores nothing", async () => {
    expect((await create({ email: "not an address" })).status).toBe(400);
    expect(await list()).toEqual([]);
  });

  it("a created code signs someone up, and the list shows who used it", async () => {
    const { code } = await (await create({ email: null })).json();
    expect((await signUp({ code })).status).toBe(200);

    const [invite] = await list();
    expect(invite.usedAt).not.toBeNull();
    expect(invite.usedBy).toBeTruthy();
  });

  it("is refused without Cloudflare Access", async () => {
    delete env.ADMIN_ACCESS_CHECK;
    try {
      expect((await create({ email: null })).status).toBe(403);
    } finally {
      env.ADMIN_ACCESS_CHECK = "off";
    }
  });
});
