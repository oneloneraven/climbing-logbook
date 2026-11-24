import { env } from "cloudflare:workers";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ENGAGE_ACCOUNTS_URL } from "../server/lib/engage-account.js";
import { BASE_URL, createAuthedSession, jsonRequest, resetAuthTables, seedPlace } from "./support.js";

const PASSWORD = "correct-horse-battery-staple";

beforeAll(() => {
  env.BETA_GATE_ENABLED = "false";
});
afterAll(() => {
  env.BETA_GATE_ENABLED = "true";
});
beforeEach(resetAuthTables);

function deleteAccount(cookie, body) {
  return jsonRequest("POST", "/-/api/auth/delete-user", body, { Cookie: cookie, Origin: BASE_URL });
}

async function ownerWithData() {
  const { cookie, userId } = await createAuthedSession();
  const placeId = await seedPlace(cookie);
  await jsonRequest(
    "POST",
    "/-/api/entries",
    { name: "Kept?", grade: "6B", placeId, type: "boulder", status: "send" },
    { Cookie: cookie },
  );
  await env.LOGBOOK_DB.prepare(
    `INSERT INTO beta_invites (code, used_by, used_at) VALUES ('code-1', ?, datetime('now'))`,
  )
    .bind(userId)
    .run();
  return { cookie, userId };
}

const count = async (table, column, value) =>
  (await env.LOGBOOK_DB.prepare(`SELECT count(*) AS n FROM ${table} WHERE ${column} = ?`).bind(value).first()).n;

describe("deleting your own account (#310)", () => {
  afterEach(() => {
    delete env.ACCOUNT_SECRET_CL;
    vi.unstubAllGlobals();
  });

  it("clears the account's reference in Engage once the account is gone (#1710)", async () => {
    env.ACCOUNT_SECRET_CL = "test-account-secret";
    const { cookie, userId } = await createAuthedSession();
    const engage = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", engage);

    expect((await deleteAccount(cookie, { password: PASSWORD })).status).toBe(200);
    await vi.waitFor(() => expect(engage).toHaveBeenCalledTimes(1));
    const [url, init] = engage.mock.calls[0];
    expect(String(url)).toBe(`${ENGAGE_ACCOUNTS_URL}${userId}`);
    expect(init.method).toBe("DELETE");
  });

  it("still deletes the account when Engage is down (#1710)", async () => {
    env.ACCOUNT_SECRET_CL = "test-account-secret";
    const { cookie, userId } = await createAuthedSession();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 503 })),
    );

    expect((await deleteAccount(cookie, { password: PASSWORD })).status).toBe(200);
    expect(await count('"user"', "id", userId)).toBe(0);
  });

  it("deletes the account and everything in it, signs it out, and frees its invite", async () => {
    const { cookie, userId } = await ownerWithData();
    const res = await deleteAccount(cookie, { password: PASSWORD });
    expect(res.status).toBe(200);

    for (const [table, column] of [
      ['"user"', "id"],
      ["session", "userId"],
      ["account", "userId"],
      ["entries", "user_id"],
      ["places", "user_id"],
      ["locations", "user_id"],
      ["settings", "user_id"],
    ]) {
      expect(await count(table, column, userId), table).toBe(0);
    }
    const invite = await env.LOGBOOK_DB.prepare(`SELECT used_by FROM beta_invites WHERE code = 'code-1'`).first();
    expect(invite.used_by).toBeNull();
    expect((await jsonRequest("GET", "/-/api/entries", undefined, { Cookie: cookie })).status).toBe(401);
  });

  it("refuses a wrong password and deletes nothing", async () => {
    const { cookie, userId } = await ownerWithData();
    const res = await deleteAccount(cookie, { password: "not-my-password" });
    expect(res.status).toBe(400);
    expect(await count('"user"', "id", userId)).toBe(1);
    expect(await count("entries", "user_id", userId)).toBe(1);
  });

  it("needs the password even from a session that has only just signed in", async () => {
    const { cookie, userId } = await ownerWithData();
    const res = await deleteAccount(cookie, {});
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("PASSWORD_REQUIRED");
    expect(await count('"user"', "id", userId)).toBe(1);
  });

  it("won't delete a demo account", async () => {
    const { cookie, userId } = await ownerWithData();
    await env.LOGBOOK_DB.prepare(
      `INSERT INTO settings (user_id, is_demo) VALUES (?, 1) ON CONFLICT(user_id) DO UPDATE SET is_demo = 1`,
    )
      .bind(userId)
      .run();
    const res = await deleteAccount(cookie, { password: PASSWORD });
    expect(res.status).toBe(403);
    expect(await count('"user"', "id", userId)).toBe(1);
  });
});
