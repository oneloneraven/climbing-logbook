import { $, $$, browser, expect } from "@wdio/globals";
import { entriesDatabase, readCachedEntries } from "./entries-cache.js";
import { settle } from "./wdio-browser.js";
import { claimOwner, gotoSyncedLog } from "./wdio-owner.js";

const SEED = {
  entries: [
    { type: "boulder", name: "Boulder Seed" },
    { type: "boulder", grade: "7A", name: "Second Seed" },
  ],
};
const cachedEntries = owner => browser.execute(readCachedEntries, entriesDatabase(owner.username));

describe("entries cache", () => {
  it("a device's localStorage cache moves to IndexedDB on first load, with no refetch (#1164)", async () => {
    const owner = await claimOwner();
    await owner.seed(SEED);
    await gotoSyncedLog(owner);
    const rows = await cachedEntries(owner);
    expect(rows.map(e => e.name).toSorted()).toEqual(["Boulder Seed", "Second Seed"]);

    const cursorsKey = `logbook_sync_cursors:${owner.username}`;
    const cursor = await browser.execute(key => JSON.parse(localStorage.getItem(key)).entries, cursorsKey);
    const legacyKey = `logbook_entries_cache:${owner.username}`;
    await browser.execute(
      async (legacyKey, rows, dbName) => {
        localStorage.setItem(legacyKey, JSON.stringify(rows));
        await new Promise((resolve, reject) => {
          const deleting = indexedDB.deleteDatabase(dbName);
          deleting.onsuccess = resolve;
          deleting.onerror = () => reject(deleting.error);
        });
      },
      legacyKey,
      rows,
      entriesDatabase(owner.username),
    );

    const entriesRequests = await browser.mock("**/-/api/entries**", { method: "GET" });
    await browser.refresh();
    await expect($("#sections")).toHaveTextContent(expect.stringContaining("Second Seed"));
    await settle();

    expect(entriesRequests.calls.map(call => new URL(call.request.url).search)).toEqual([`?since=${cursor}`]);
    expect(await browser.execute(key => localStorage.getItem(key), legacyKey)).toBeNull();
    expect(await cachedEntries(owner)).toEqual(rows);
  });

  it("a new entry is cached in IndexedDB and still there after a reload", async () => {
    const owner = await claimOwner();
    await owner.seed(SEED);
    await gotoSyncedLog(owner);

    const entryName = `E2E cached ${Date.now()}`;
    await $("#add-btn").click();
    await $("#entry-name").setValue(entryName);
    await $("#place-btn").click();
    await $$("#place-listbox li")[0].click();
    const saved = await browser.mock("**/-/api/entries", { method: "POST" });
    await $("#entry-submit-btn").click();
    await saved.waitForResponse();
    await expect($("#entry-overlay")).not.toBeDisplayed();
    await browser.waitUntil(async () => (await cachedEntries(owner)).some(e => e.name === entryName));

    const entries = await browser.mock("**/-/api/entries**");
    entries.abort();
    await browser.refresh();
    await expect($("#sections")).toHaveTextContent(expect.stringContaining(entryName));
  });
});
