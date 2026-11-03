// The queue stores { kind, op, record }, never a URL, so a queued write survives an API rename.
import { $, browser, expect } from "@wdio/globals";
import { DEV_USER } from "../scripts/lib/dev-session.mjs";
import { ownedRouteUrl } from "./owned-route-url.js";
import { afterThisTest, recordFetches } from "./wdio-browser.js";
import { holdRequests } from "./wdio-hold.js";
import { signInDevUser } from "./wdio-owner.js";

const OWNER = DEV_USER.username.toLowerCase();
const queueKey = owner => `logbook_pending_queue:${owner}`;
const setQueue = items =>
  browser.execute((key, items) => localStorage.setItem(key, JSON.stringify(items)), queueKey(OWNER), items);
const readQueue = async () =>
  JSON.parse((await browser.execute(key => localStorage.getItem(key), queueKey(OWNER))) ?? "[]");

async function openLog() {
  await browser.url(ownedRouteUrl(DEV_USER.username, "/log"));
  await expect($("climbing-entries-table")).toBeDisplayed();
  return browser.execute(async () => (await (await fetch("/-/api/places")).json()).places[0].id);
}

describe("queue replay", () => {
  beforeEach(() => signInDevUser("my.localhost"));

  it("a write queued while a sync is in flight is still queued afterwards", async () => {
    const placeId = await openLog();
    const record = {
      id: `queued-during-sync-${Date.now()}`,
      name: "Queued during a sync",
      grade: "6B",
      placeId,
      type: "boulder",
      status: "send",
    };
    await setQueue([{ kind: "entry", op: "add", record }]);
    await browser.refresh();
    await expect($("#sync-line-text")).toHaveTextContent("1 change waiting to sync");

    // Hold the replayed POST so the sync is still in flight.
    const releasePost = await holdRequests("/-/api/entries", { method: "POST" });
    await $("#sync-now").click();
    await releasePost.caught();
    await expect($("#sync-line-text")).toHaveTextContent("Syncing 1 change…");
    await expect($("#sync-now")).not.toBeDisplayed();
    await expect($("#sync-line-spinner")).toBeDisplayed();

    // What entry-form.js does when a save can't reach the server. A delete
    // of the same entry, so the shared dev data ends up unchanged.
    await browser.execute(
      (key, item) => {
        const queue = JSON.parse(localStorage.getItem(key) ?? "[]");
        localStorage.setItem(key, JSON.stringify([...queue, item]));
      },
      queueKey(OWNER),
      { kind: "entry", op: "delete", record: { id: record.id } },
    );
    await releasePost();

    await expect($("#sync-now")).toBeDisplayed();
    await expect($("#sync-line-text")).toHaveTextContent("1 change waiting to sync");
    expect((await readQueue()).map(({ op, record }) => `${op} ${record.id}`)).toEqual([`delete ${record.id}`]);

    await $("#sync-now").click();
    await expect($("#sync-line")).not.toBeDisplayed();
  });

  it("a save made while an older edit is queued is sent after it, and wins", async () => {
    const fetches = await recordFetches();
    const placeId = await openLog();
    const entry = {
      id: `queued-edit-order-${Date.now()}`,
      name: "Edit order original",
      grade: "6B",
      placeId,
      type: "boulder",
      status: "send",
    };
    await browser.execute(async entry => {
      const res = await fetch("/-/api/entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(entry),
      });
      if (!res.ok) throw new Error(`create failed: ${res.status}`);
    }, entry);
    afterThisTest(() =>
      browser.execute(id => fetch(`/-/api/entries?id=${encodeURIComponent(id)}`, { method: "DELETE" }), entry.id),
    );
    await setQueue([{ kind: "entry", op: "edit", record: { ...entry, name: "Older queued edit" } }]);
    await browser.refresh();
    await expect($("#sync-line-text")).toHaveTextContent("1 change waiting to sync");
    await expect($("#sections")).toHaveTextContent(expect.stringContaining("Older queued edit"));

    const since = fetches.all().length;
    await browser.execute(id => document.querySelector(`button[data-edit-id="${id}"]`).click(), entry.id);
    await expect($("#entry-name")).toBeDisplayed();
    await $("#entry-name").setValue("Newer edit");
    await $("#entry-submit-btn").click();
    await expect($("#sync-line")).not.toBeDisplayed();

    const writes = fetches
      .all()
      .slice(since)
      .filter(f => f.method === "PUT" && new URL(f.url).pathname === "/-/api/entries")
      .map(f => `PUT ${JSON.parse(f.body).name}`);
    expect(writes).toEqual(["PUT Older queued edit", "PUT Newer edit"]);
    const saved = await browser.execute(
      async id => (await (await fetch("/-/api/entries")).json()).entries.find(e => e.id === id),
      entry.id,
    );
    expect(saved.name).toBe("Newer edit");
  });
});
