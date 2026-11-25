import { env, exports } from "cloudflare:workers";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createPublicSession, fetchJson, jsonRequest, resetAuthTables, seedPlace } from "./support.js";

const admin = (path, init) => exports.default.fetch(`https://admin.example.com${path}`, init);

async function logbookWithClimbs() {
  const { cookie, userId } = await createPublicSession();
  const { username } = await env.LOGBOOK_DB.prepare(`SELECT username FROM "user" WHERE id = ?`).bind(userId).first();
  const placeId = await seedPlace(cookie);
  const post = async name => {
    const res = await jsonRequest(
      "POST",
      "/-/api/entries",
      { name, grade: "6B", placeId, type: "boulder", status: "send", notes: `${name} notes` },
      { Cookie: cookie },
    );
    return (await res.json()).entry.id;
  };
  return { cookie, userId, username, kept: await post("Kept"), reported: await post("Reported") };
}

async function publicNames(username, path = "entries") {
  const res = await fetchJson(`/-/api/public/${username}/${path}`);
  return (await res.json()).entries.map(entry => entry.name);
}

beforeAll(() => {
  env.BETA_GATE_ENABLED = "false";
  env.ADMIN_ACCESS_CHECK = "off";
});
afterAll(() => {
  env.BETA_GATE_ENABLED = "true";
  delete env.ADMIN_ACCESS_CHECK;
});
beforeEach(async () => {
  await resetAuthTables();
  await env.LOGBOOK_DB.prepare(`DELETE FROM admin_audit_log`).run();
});

describe("hiding a climb", () => {
  it("takes it off every public view, keeps it for its owner, and logs it", async () => {
    const owner = await logbookWithClimbs();
    const { cursor: before } = await (
      await jsonRequest("GET", "/-/api/entries?since=0", undefined, { Cookie: owner.cookie })
    ).json();

    expect((await admin(`/-/api/admin/entries/${owner.reported}/hide`, { method: "POST" })).status).toBe(200);

    expect(await publicNames(owner.username)).toEqual(["Kept"]);
    expect(await publicNames(owner.username, "entries?limit=50")).toEqual(["Kept"]);
    const counts = await (await fetchJson(`/-/api/public/${owner.username}/entries/counts`)).json();
    expect(Object.values(counts.counts)).toEqual([{ boulder: 1 }]);
    const map = await (await fetchJson(`/-/api/public/${owner.username}/map/counts`)).json();
    expect(Object.values(map)[0].boulder.total).toBe(1);

    const own = await (await jsonRequest("GET", "/-/api/entries", undefined, { Cookie: owner.cookie })).json();
    expect(own.entries.find(entry => entry.id === owner.reported).hidden).toBe(true);
    const delta = await (
      await jsonRequest("GET", `/-/api/entries?since=${before + 1}`, undefined, { Cookie: owner.cookie })
    ).json();
    expect(delta.entries.map(entry => entry.id)).toContain(owner.reported);

    const { entries } = await (await admin("/-/api/admin/audit")).json();
    expect(entries[0]).toMatchObject({ action: "hide", username: owner.username, detail: "Reported" });
  });

  it("puts it back when unhidden, and the owner can still edit a hidden climb", async () => {
    const owner = await logbookWithClimbs();
    await admin(`/-/api/admin/entries/${owner.reported}/hide`, { method: "POST" });
    const edit = await jsonRequest(
      "PUT",
      "/-/api/entries",
      {
        id: owner.reported,
        name: "Reported",
        grade: "6B",
        placeId: await seedPlace(owner.cookie, { area: "Sector 2" }),
        type: "boulder",
        status: "send",
        notes: "Cleaned up",
      },
      { Cookie: owner.cookie },
    );
    expect(edit.status).toBe(200);
    expect(await publicNames(owner.username)).toEqual(["Kept"]);

    await admin(`/-/api/admin/entries/${owner.reported}/unhide`, { method: "POST" });
    expect((await publicNames(owner.username)).toSorted()).toEqual(["Kept", "Reported"]);
  });

  it("keeps it out of the public list for its location (#1731)", async () => {
    const owner = await logbookWithClimbs();
    const { location_id: locationId } = await env.LOGBOOK_DB.prepare(
      `SELECT p.location_id FROM entries e JOIN places p ON p.id = e.place_id WHERE e.id = ?`,
    )
      .bind(owner.reported)
      .first();
    const byLocation = `entries?locationId=${locationId}`;
    expect((await publicNames(owner.username, byLocation)).toSorted()).toEqual(["Kept", "Reported"]);

    await admin(`/-/api/admin/entries/${owner.reported}/hide`, { method: "POST" });
    expect(await publicNames(owner.username, byLocation)).toEqual(["Kept"]);
  });

  it("leaves a demo account's climbs alone (#1712)", async () => {
    const owner = await logbookWithClimbs();
    await env.LOGBOOK_DB.prepare(`UPDATE settings SET is_demo = 1 WHERE user_id = ?`).bind(owner.userId).run();
    expect((await admin(`/-/api/admin/entries/${owner.reported}/hide`, { method: "POST" })).status).toBe(409);
    expect((await publicNames(owner.username)).toSorted()).toEqual(["Kept", "Reported"]);
  });

  it("knows only real climbs and its own two actions", async () => {
    expect((await admin("/-/api/admin/entries/nope/hide", { method: "POST" })).status).toBe(404);
    expect((await admin("/-/api/admin/entries/nope/delete", { method: "POST" })).status).toBe(404);
    expect((await admin("/-/api/admin/entries/nope/hide")).status).toBe(404);
  });
});
